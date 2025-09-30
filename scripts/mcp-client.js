#!/usr/bin/env node

const { EventSource } = require('eventsource');
const { randomUUID } = require('crypto');
const { URL } = require('url');

function parseArgs(argv) {
  const args = { message: null, events: [] };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const takeValue = () => {
      if (i + 1 >= argv.length) {
        throw new Error(`${arg} requires a value`);
      }
      i += 1;
      return argv[i];
    };

    if (arg === '--endpoint' || arg === '-e') {
      args.endpoint = takeValue();
    } else if (arg === '--client' || arg === '-c') {
      args.clientId = takeValue();
    } else if (arg === '--message' || arg === '-m') {
      args.message = takeValue();
    } else if (arg === '--duration' || arg === '-d') {
      const value = Number(takeValue());
      if (Number.isNaN(value) || value <= 0) {
        throw new Error('--duration must be a positive number of milliseconds');
      }
      args.duration = value;
    } else if (arg === '--events' || arg === '-E') {
      const rawEvents = takeValue();
      args.events = rawEvents
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean);
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/mcp-client.js --endpoint <URL> [--client <ID>] [--message <JSON>]

Options:
  -e, --endpoint   Base MCP endpoint (e.g. https://example.com/api/mcp)
  -c, --client     Client identifier. Generated automatically when omitted.
  -m, --message    JSON-RPC message to send after connecting. Defaults to a minimal initialize request.
  -d, --duration   Automatically close the SSE connection after the given milliseconds.
  -E, --events     Comma-separated list of additional SSE event names to log.
  -h, --help       Show this help message.
`);
}

async function readMessagePayload(raw) {
  if (!raw) {
    return {
      jsonrpc: '2.0',
      id: `initialize-${Date.now()}`,
      method: 'initialize',
      params: {
        capabilities: {},
      },
    };
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Provided message is not valid JSON: ${error.message}`);
  }
}

async function sendMessage({ endpoint, clientId, message }) {
  console.log('[POST] Sending message:', JSON.stringify(message, null, 2));
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Mcp-Session-Id': clientId,
    },
    body: JSON.stringify({ message }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`POST failed with status ${response.status}: ${text}`);
  }

  const result = await response.json().catch(() => ({}));
  console.log('[POST] Response:', result);
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.help || !args.endpoint) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }

  const clientId = args.clientId || randomUUID();
  const baseUrl = new URL(args.endpoint);
  baseUrl.searchParams.set('client_id', clientId);

  console.log(`[SSE] Connecting to ${baseUrl.toString()}`);

  const message = await readMessagePayload(args.message);

  const eventSource = new EventSource(baseUrl.toString(), {
    headers: {
      'User-Agent': 'mcp-webim-sample-client',
    },
  });

  if (args.duration) {
    setTimeout(() => {
      console.log(`[SSE] Closing after ${args.duration}ms`);
      eventSource.close();
      process.exit();
    }, args.duration);
  }

  const eventsToLog = new Set(['ready', 'message', ...args.events]);

  function logEvent(event) {
    let data = event.data;
    try {
      data = JSON.parse(event.data);
    } catch (error) {
      // leave as string when parsing fails
    }
    console.log(`[SSE] Event "${event.type}":`, data);
  }

  eventsToLog.forEach((eventName) => {
    eventSource.addEventListener(eventName, logEvent);
  });

  eventSource.onopen = () => {
    console.log('[SSE] Connection established');
    sendMessage({ endpoint: args.endpoint, clientId, message }).catch((error) => {
      console.error('[POST] Error sending message:', error);
      process.exitCode = 1;
    });
  };

  eventSource.onerror = (error) => {
    console.error('[SSE] Error:', error);
    process.exitCode = 1;
  };
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

