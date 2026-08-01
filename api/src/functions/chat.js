const { app } = require('@azure/functions');
const { runAssistant, mockResult } = require('../chat-ai');
const { accessGate } = require('../chat-access');
const {
  decodeAttachment,
  extractAttachmentText,
  minimumContactGate,
  storeAttachment
} = require('../chat-attachment');
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
const userTextWithAttachment = (message, decoded) => decoded
  ? `${message}\n\n[Attached job requirement: ${decoded.name}]`
  : message;
const wantsReferences = (message) => /\b(source|sources|evidence|proof|citation|citations|reference|references|link|links|where did|back that up|show me where)\b/i.test(String(message || ''));

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
    const rawAttachment = body.attachment && typeof body.attachment === 'object' ? body.attachment : null;

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
      const reply = 'This conversation has reached its message limit. Use End conversation to start a fresh chat, or use the inquiry section if you want Andrew to follow up.';
      return {
        status: 429,
        headers: { 'Retry-After': String(rate.retryAfter) },
        jsonBody: { ok: false, error: 'message limit reached', retryAfter: rate.retryAfter, reply }
      };
    }
    let decodedAttachment = null;
    let jobRequirement = '';
    let attachmentStored = false;
    let budget = null;
    if (rawAttachment) {
      const decoded = decodeAttachment(rawAttachment);
      if (!decoded.ok) {
        appendMessage(session, 'user', message);
        appendMessage(session, 'assistant', decoded.message);
        await saveSession(session);
        return {
          jsonBody: {
            ok: true,
            mode: 'live',
            sessionId: session.rowKey,
            sessionToken: opened.token,
            reply: decoded.message,
            suggestions: ['Upload a PDF or DOCX job requirement', 'Paste the must-have requirements'],
            evidence: [],
            sources: [],
            intent: session.intent,
            stage: session.stage,
            attachmentRejected: true,
            resumeSent: false
          }
        };
      }
      decodedAttachment = decoded;
      const contactGate = minimumContactGate(session, message);
      if (contactGate) {
        const prompt = userTextWithAttachment(message, decodedAttachment);
        appendMessage(session, 'user', prompt);
        appendMessage(session, 'assistant', contactGate.reply);
        await saveSession(session);
        return {
          jsonBody: {
            ok: true,
            mode: 'live',
            sessionId: session.rowKey,
            sessionToken: opened.token,
            reply: contactGate.reply,
            suggestions: [],
            evidence: [],
            sources: [],
            intent: 'job_fit',
            stage: 'qualifying',
            blockedOn: contactGate.blockedOn,
            missing: contactGate.missing,
            attachmentPending: true,
            resumeSent: false
          }
        };
      }
      budget = await withinBudget();
      if (!budget.allowed) {
        appendMessage(session, 'user', userTextWithAttachment(message, decodedAttachment));
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
      try {
        const blobName = await storeAttachment(session, decodedAttachment);
        if (blobName) {
          session.jobReqAttachmentBlob = blobName;
          session.jobReqAttachmentName = decodedAttachment.name;
          attachmentStored = true;
        }
        jobRequirement = await extractAttachmentText(decodedAttachment);
      } catch (error) {
        context.error('chat attachment processing failed', error);
        const reply = 'I could not process that attachment. Please upload a PDF, DOCX, or TXT version, or paste the key responsibilities and must-haves here.';
        appendMessage(session, 'user', userTextWithAttachment(message, decodedAttachment));
        appendMessage(session, 'assistant', reply);
        await saveSession(session);
        return {
          status: 503,
          jsonBody: {
            ok: false,
            error: 'attachment processing failed',
            reply,
            attachmentRejected: true
          }
        };
      }
      session.jobReqTextChars = jobRequirement.length;
      if (!jobRequirement) {
        const reply = decodedAttachment.kind === 'doc'
          ? 'I received the Word document, but this chat can instantly read PDF, DOCX, TXT, or pasted text. Please upload a DOCX or PDF version, or paste the key responsibilities and must-haves here.'
          : 'I received the file, but I could not read enough text from it for a useful comparison. Please paste the key responsibilities and must-haves here.';
        appendMessage(session, 'user', userTextWithAttachment(message, decodedAttachment));
        appendMessage(session, 'assistant', reply);
        await saveSession(session);
        return {
          jsonBody: {
            ok: true,
            mode: 'live',
            sessionId: session.rowKey,
            sessionToken: opened.token,
            reply,
            suggestions: ['Paste the must-have requirements', 'Upload a DOCX or PDF version'],
            evidence: [],
            sources: [],
            intent: 'job_fit',
            stage: 'qualifying',
            attachmentStored,
            attachmentProcessed: false,
            resumeSent: false
          }
        };
      }
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
    budget = budget || await withinBudget();
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

    appendMessage(session, 'user', userTextWithAttachment(message, decodedAttachment));
    const history = transcript(session);
    const evidence = searchKnowledge(`${history.filter((item) => item.role === 'user').slice(-4).map((item) => item.text).join(' ')} ${jobRequirement.slice(0, 4000)}`);

    try {
      const ai = await runAssistant({
        message,
        history,
        evidence,
        safetyIdentifier: session.clientHash || session.rowKey,
        jobRequirement
      });
      const result = ai.result;
      const evidenceById = new Map(evidence.map((item) => [item.id, item]));
      const selectedEvidence = result.evidenceIds
        .map((id) => evidenceById.get(id))
        .filter(Boolean)
        .map((item) => ({ id: item.id, title: item.title, anchor: item.anchor }));
      const showReferences = wantsReferences(message);

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
          evidence: showReferences ? selectedEvidence : [],
          sources: showReferences ? ai.sources : [],
          intent: result.intent,
          stage: result.stage,
          resumeSent: notifications.sent.includes('resume'),
          attachmentStored,
          attachmentProcessed: Boolean(jobRequirement),
          attachmentName: decodedAttachment?.name || ''
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
