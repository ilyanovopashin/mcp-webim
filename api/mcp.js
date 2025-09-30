const url = require('url');
const { randomUUID } = require('crypto');

const {
  registerClient,
  removeClient,
  sendEvent,
  getClient,
} = require('../lib/clientStore');
const { setCorsHeaders, readJsonBody } = require('../lib/http');
const { buildChatmiInput, parseChatmiOutput } = require('../lib/chatmiFormats');

const CHATMI_WEBHOOK_URL =
  process.env.CHATMI_WEBHOOK_URL ||
  'https://admin.chatme.ai/connector/webim/webim_message/a7e28b914256ab13395ec974e7bb9548/bot_api_webhook';

function ensureQuery(req) {
  if (!req.query) {
    const parsedUrl = url.parse(req.url, true);
    req.query = parsedUrl.query || {};
  }
}

function normaliseClientId(raw) {
  if (!raw) {
    return null;
  }
  if (Array.isArray(raw)) {
    return normaliseClientId(raw[0]);
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    return trimmed.length ? trimmed : null;
  }
  return null;
}

function getClientIdFromRequest(req, fallback) {
  const headerId = normaliseClientId(
    req.headers['mcp-session-id'] || req.headers['x-mcp-session-id'] || req.headers['x-client-id'],
  );

  const queryId = normaliseClientId(req.query && req.query.client_id);

  const fallbackId = normaliseClientId(fallback);

  return headerId || queryId || fallbackId;
}

function ensureClientId(req, res) {
  const existing = getClientIdFromRequest(req);
  if (existing) {
    return existing;
  }

  const generated = randomUUID();
  res.setHeader('Mcp-Session-Id', generated);
  return generated;
}

function extractMessageEnvelope(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { message: body };
  }

  if ('message' in body) {
    return {
      clientId: body.client_id || body.clientId,
      message: body.message,
    };
  }

  if ('client_id' in body || 'clientId' in body) {
    const { client_id, clientId, ...rest } = body;
    return {
      clientId: client_id || clientId,
      message: rest,
    };
  }

  return { message: body };
}

async function forwardToChatmi({ clientId, message }) {
  const chatmiInput = buildChatmiInput({ clientId, message });

  const response = await fetch(CHATMI_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      event: 'new_message',
      chat: { id: clientId },
      text: chatmiInput,
    }),
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(`Chatmi request failed (${response.status}): ${responseText}`);
  }

  const chatmiResponse = await response.json();

  if (!chatmiResponse.has_answer || !Array.isArray(chatmiResponse.messages)) {
    throw new Error('Unexpected Chatmi response format');
  }

  const operatorMessage = chatmiResponse.messages.find((msg) => msg && msg.kind === 'operator');
  if (!operatorMessage || typeof operatorMessage.text !== 'string') {
    throw new Error('Chatmi response does not contain an operator message');
  }

  const parsed = parseChatmiOutput(operatorMessage.text);

  return parsed.events || [];
}

async function handleGet(req, res) {
  const clientId = ensureClientId(req, res);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  registerClient(clientId, res);

  sendEvent(clientId, 'ready', {
    message: 'SSE connection established',
    clientId,
  });

  req.on('close', () => {
    removeClient(clientId);
  });
}

async function handlePost(req, res) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: error.message }));
    return;
  }

  const { clientId: bodyClientId, message } = extractMessageEnvelope(body);

  const clientId = getClientIdFromRequest(req, bodyClientId);

  if (!clientId || typeof clientId !== 'string') {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'A client identifier is required' }));
    return;
  }

  if (!message || (typeof message !== 'object' && !Array.isArray(message))) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'message must be a JSON object or array' }));
    return;
  }

  if (!getClient(clientId)) {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: `No active SSE connection for client ${clientId}` }));
    return;
  }

  let events;
  try {
    events = await forwardToChatmi({ clientId, message });
  } catch (error) {
    res.statusCode = 502;
    res.end(JSON.stringify({ error: error.message }));
    return;
  }

  try {
    events.forEach((event) => {
      const { name = 'message', payload = event } = event || {};
      sendEvent(clientId, name || 'message', payload);
    });
  } catch (error) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: error.message }));
    return;
  }

  res.statusCode = 200;
  res.end(JSON.stringify({ delivered: events.length }));
}

module.exports = async function handler(req, res) {
  setCorsHeaders(res);
  ensureQuery(req);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method === 'GET') {
    await handleGet(req, res);
    return;
  }

  if (req.method === 'POST') {
    await handlePost(req, res);
    return;
  }

  res.statusCode = 405;
  res.setHeader('Allow', 'GET,POST,OPTIONS');
  res.end(JSON.stringify({ error: 'Method not allowed' }));
};

