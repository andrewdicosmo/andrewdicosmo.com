const { OpenAI } = require('openai');
const { isEngineeringRequest, responseSchema, shouldUseWebSearch, systemPrompt } = require('./chat-policy');

const validEmail = (value) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(value || ''));

function defaultResult(reply) {
  return {
    reply,
    intent: 'general',
    stage: 'exploring',
    classification: 'anonymous',
    contact: { name: null, email: null, company: null, role: null, timezone: null, preferredTime: null },
    qualified: false,
    resumeRequested: false,
    resumeKind: 'none',
    jobDescriptionAnalyzed: false,
    spamProbability: 0,
    accuracyChallenge: { claim: null, relationship: null, correction: null, complete: false },
    suggestions: [],
    evidenceIds: []
  };
}

function mockResult(message) {
  const text = String(message || '').toLowerCase();
  if (text.includes('template')) {
    return {
      ...defaultResult('This public clone is running the safe template demonstration. Its example content shows the chat experience, while a site owner supplies private content and their own Azure AI credentials during deployment. The README explains the setup without exposing Andrew\'s data or keys.'),
      intent: 'template',
      classification: 'template',
      suggestions: ['How is private content injected?', 'What do I need to host this?']
    };
  }
  return {
    ...defaultResult('This clone is running the safe chat demonstration. Connect your own Azure AI deployment and private content to enable grounded answers; Andrew\'s data and credentials are never included in the public repository.'),
    suggestions: ['Explore the website template', 'View setup instructions']
  };
}

function normalizeResult(value) {
  const fallback = defaultResult('I could not prepare a reliable answer. Please try rephrasing your question.');
  const result = { ...fallback, ...(value || {}) };
  result.contact = { ...fallback.contact, ...(value?.contact || {}) };
  if (result.contact.email && !validEmail(result.contact.email)) result.contact.email = null;
  result.accuracyChallenge = { ...fallback.accuracyChallenge, ...(value?.accuracyChallenge || {}) };
  result.suggestions = Array.isArray(result.suggestions) ? result.suggestions.filter(Boolean).slice(0, 3) : [];
  result.evidenceIds = Array.isArray(result.evidenceIds) ? result.evidenceIds.filter(Boolean).slice(0, 5) : [];
  result.reply = String(result.reply || fallback.reply)
    .replace(/\[([^\]]+)]\(https?:\/\/[^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .slice(0, 2800);
  return result;
}

function extractSources(response) {
  const sources = [];
  for (const item of response.output || []) {
    if (item.type !== 'message') continue;
    for (const content of item.content || []) {
      for (const annotation of content.annotations || []) {
        if (annotation.type !== 'url_citation' || !annotation.url) continue;
        if (!sources.some((source) => source.url === annotation.url)) {
          sources.push({ title: String(annotation.title || 'Web source').slice(0, 180), url: annotation.url });
        }
      }
    }
  }
  return sources.slice(0, 5);
}

async function runAssistant({ message, history, evidence, safetyIdentifier }) {
  const endpoint = String(process.env.AZURE_OPENAI_ENDPOINT || '').replace(/\/+$/, '');
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
  if (!endpoint || !apiKey || !deployment) return { result: mockResult(message), mode: 'mock', usage: {}, sources: [], webSearched: false };

  const webEnabled = shouldUseWebSearch(message, history);
  const client = new OpenAI({ apiKey, baseURL: `${endpoint}/openai/v1/` });
  const input = [
    { role: 'system', content: systemPrompt({ evidence, engineeringRequest: isEngineeringRequest(message), webEnabled }) },
    ...history.slice(-10).map((item) => ({ role: item.role, content: String(item.text || '').slice(0, 4000) }))
  ];
  const options = {
    model: deployment,
    input,
    store: false,
    max_output_tokens: 700,
    reasoning: { effort: 'low' },
    safety_identifier: safetyIdentifier,
    text: {
      format: {
        type: 'json_schema',
        name: 'portfolio_chat_turn',
        strict: true,
        schema: responseSchema
      }
    }
  };
  if (webEnabled) {
    options.tools = [{
      type: 'web_search',
      user_location: { type: 'approximate', country: 'US', city: 'Chicago', region: 'Illinois', timezone: 'America/Chicago' }
    }];
    options.tool_choice = 'auto';
  }

  const response = await client.responses.create(options);
  let parsed;
  try {
    parsed = JSON.parse(response.output_text || '');
  } catch {
    parsed = defaultResult(response.output_text || 'I could not prepare a reliable answer. Please try again.');
  }
  return {
    result: normalizeResult(parsed),
    mode: 'live',
    usage: response.usage || {},
    sources: extractSources(response),
    webSearched: (response.output || []).some((item) => item.type === 'web_search_call')
  };
}

module.exports = { defaultResult, mockResult, normalizeResult, runAssistant };
