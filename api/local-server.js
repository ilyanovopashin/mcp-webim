const http = require('http');
const url = require('url');

const mcpHandler = require('./mcp');

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  req.query = parsedUrl.query;

  if (['/api/mcp', '/api/stream', '/api/message'].includes(parsedUrl.pathname)) {
    mcpHandler(req, res);
    return;
  }

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type,Authorization,Mcp-Session-Id,X-Mcp-Session-Id,X-Client-Id',
    );
    res.statusCode = 204;
    res.end();
    return;
  }

  res.statusCode = 404;
  res.end('Not Found');
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Local dev server listening on http://localhost:${port}`);
});
