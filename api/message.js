const url = require('url');
const { sendEvent, getClient } = require('../lib/clientStore');
const { setCorsHeaders, readJsonBody } = require('../lib/http');
const { buildChatmiInput, parseChatmiOutput } = require('../lib/chatmiFormats');

const CHATMI_WEBHOOK_URL = process.env.CHATMI_WEBHOOK_URL || 'https://admin.chatme.ai/connector/webim/webim_message/a7e28b914256ab13395ec974e7bb9548/bot_api_webhook';

module.exports = async function handler(req, res) {
  setCorsHeaders(res);

  if (!req.query) {
    const parsedUrl = url.parse(req.url, true);
    req.query = parsedUrl.query || {};
  }

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST,OPTIONS');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: error.message }));
    return;
  }

  const { client_id: clientId, message } = body;
  if (!clientId || typeof clientId !== 'string') {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'client_id must be provided as a string' }));
    return;
  }
  if (!message || typeof message !== 'object') {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'message must be provided as an object' }));
    return;
  }

  if (!getClient(clientId)) {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: `No active SSE connection for client ${clientId}` }));
    return;
  }

  const chatmiInput = buildChatmiInput({ clientId, message });


  let chatmiResponse;
  try {
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

    chatmiResponse = await response.json();
  } catch (error) {
    res.statusCode = 502;
    res.end(JSON.stringify({ error: error.message }));
    return;
  }

  if (!chatmiResponse.has_answer || !Array.isArray(chatmiResponse.messages)) {
    res.statusCode = 502;
    res.end(JSON.stringify({ error: 'Unexpected Chatmi response format' }));
    return;
  }

  const operatorMessage = chatmiResponse.messages.find((msg) => msg && msg.kind === 'operator');
  if (!operatorMessage || typeof operatorMessage.text !== 'string') {
    res.statusCode = 502;
    res.end(JSON.stringify({ error: 'Chatmi response does not contain an operator message' }));
    return;
  }

  let parsed;
  try {
    parsed = parseChatmiOutput(operatorMessage.text);
  } catch (error) {
    res.statusCode = 502;
    res.end(JSON.stringify({ error: error.message }));
    return;
  }

  const { events } = parsed;
  try {
    events.forEach((event) => {
      const { name = 'message', payload = event } = event;
      sendEvent(clientId, name, payload);
    });
  } catch (error) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: error.message }));
    return;
  }

  res.statusCode = 200;
  res.end(JSON.stringify({ delivered: events.length }));
};
