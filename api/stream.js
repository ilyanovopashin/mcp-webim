const url = require('url');
const { registerClient, removeClient, sendEvent } = require('../lib/clientStore');
const { setCorsHeaders } = require('../lib/http');

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

  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET,OPTIONS');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const { client_id: clientId } = req.query;
  if (!clientId) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'client_id query parameter is required' }));
    return;
  }

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
};
