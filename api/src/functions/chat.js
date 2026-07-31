const { app } = require('@azure/functions');
const { runAssistant, mockResult } = require('../chat-ai');
const { accessGate } = require('../chat-access');
const { searchKnowledge } = require('../chat-knowledge');
const { deliverChatNotifications } = require('../chat-email');
const {
  appendMessage,
  applyAssistantState,
  checkRateLimit,
  openSession,
  recordUsage,
  saveSession,
  transcript,
  withinBudget
} = require('../chat-storage');

const clean = (value, max = 1200) => String(value || '').trim().replace(/\u0000/g, '').slice(0, max);

app.http('chat', {
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    let body;
    try { body = await request.json(); } catch {
      return { status: 400, jsonBody: { ok: false, error: 'invalid json' } };
    }
    if (body.website) return { status: 204 };
    const message = clean(body.message);
    if (!message) return { status: 400, jsonBody: { ok: false, error: 'message required' } };

    let opened;
    try {
      opened = await openSession(request, clean(body.sessionId, 100), clean(body.sessionToken, 200));
    } catch (error) {
      context.error('chat session open failed', error);
      return { status: 503, jsonBody: { ok: false, error: 'chat storage unavailable' } };
    }

    if (opened.mode === 'mock') {
      return { jsonBody: { ok: true, mode: 'mock', ...mockResult(message), evidence: [], sources: [] } };
    }
    if (opened.mode === 'invalid') {
      return { status: 401, jsonBody: { ok: false, error: 'invalid chat session' } };
    }

    const session = opened.session;
    const rate = checkRateLimit(session);
    if (!rate.allowed) {
      return {
        status: 429,
        headers: { 'Retry-After': String(rate.retryAfter) },
        jsonBody: { ok: false, error: 'message limit reached', retryAfter: rate.retryAfter }
      };
    }
    const gate = accessGate(session, message);
    if (gate) {
      appendMessage(session, 'user', message);
      appendMessage(session, 'assistant', gate.reply);
      await saveSession(session);
      return {
        jsonBody: {
          ok: true,
          mode: 'live',
          sessionId: session.rowKey,
          sessionToken: opened.token,
          reply: gate.reply,
          suggestions: [],
          evidence: [],
          sources: [],
          intent: session.intent,
          stage: session.stage,
          blockedOn: gate.blockedOn,
          resumeSent: false
        }
      };
    }
    const budget = await withinBudget();
    if (!budget.allowed) {
      appendMessage(session, 'user', message);
      appendMessage(session, 'assistant', 'The AI channel has reached its monthly usage limit. Andrew\'s website and inquiry form are still available.');
      await saveSession(session);
      return {
        status: 429,
        jsonBody: {
          ok: false,
          error: 'monthly AI limit reached',
          reply: 'The AI channel has reached its monthly usage limit. Andrew\'s website and inquiry form are still available.'
        }
      };
    }

    appendMessage(session, 'user', message);
    const history = transcript(session);
    const evidence = searchKnowledge(history.filter((item) => item.role === 'user').slice(-4).map((item) => item.text).join(' '));

    try {
      const ai = await runAssistant({
        message,
        history,
        evidence,
        safetyIdentifier: session.clientHash || session.rowKey
      });
      const result = ai.result;
      const evidenceById = new Map(evidence.map((item) => [item.id, item]));
      const selectedEvidence = result.evidenceIds
        .map((id) => evidenceById.get(id))
        .filter(Boolean)
        .map((item) => ({ id: item.id, title: item.title, anchor: item.anchor }));

      appendMessage(session, 'assistant', result.reply, {
        evidenceIds: selectedEvidence.map((item) => item.id),
        sources: ai.sources
      });
      applyAssistantState(session, result);
      recordUsage(session, ai.usage, ai.webSearched);
      await saveSession(session);
      const notifications = await deliverChatNotifications(session, result, context);
      if (notifications.sent.length) await saveSession(session);

      return {
        jsonBody: {
          ok: true,
          mode: ai.mode,
          sessionId: session.rowKey,
          sessionToken: opened.token,
          reply: result.reply,
          suggestions: result.suggestions,
          evidence: selectedEvidence,
          sources: ai.sources,
          intent: result.intent,
          stage: result.stage,
          resumeSent: notifications.sent.includes('resume')
        }
      };
    } catch (error) {
      context.error('chat model request failed', error);
      const reply = 'The AI channel is temporarily unavailable. Your message was retained for review, and you can still use the inquiry section below.';
      appendMessage(session, 'assistant', reply);
      await saveSession(session).catch((storageError) => context.error('chat fallback save failed', storageError));
      return { status: 503, jsonBody: { ok: false, error: 'assistant unavailable', reply } };
    }
  }
});
