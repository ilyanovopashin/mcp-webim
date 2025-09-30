# MCP ↔ Chatmi bridge

This repository contains a lightweight HTTP service that exposes a Server-Sent Events (SSE) endpoint for an MCP client and forwards inbound MCP messages to the Chatmi webhook. The service can be deployed to Vercel and also includes a tiny local development server.

## Architecture overview

The service exposes a single MCP endpoint that supports both `GET` and `POST`:

- `GET /api/mcp?client_id=...` — establishes the SSE channel that the MCP client listens to. Responses from Chatmi are emitted as SSE events. If the `client_id` is omitted, the bridge will generate one and return it in the `Mcp-Session-Id` response header.
- `POST /api/mcp` — accepts MCP JSON RPC payloads from the client and forwards them to Chatmi. The request **must** include the same client identifier that was used to open the SSE stream. You can supply it via the `Mcp-Session-Id` header, the `client_id` query parameter, or (for backwards compatibility) the legacy `{ client_id, message }` JSON structure used by earlier versions of this proxy.

When a request reaches `/api/mcp`, the service serialises the MCP payload into a string that Chatmi understands, sends it to Chatmi via the webhook, parses the synchronous response, and pushes every returned event to the SSE stream of the matching client.

## Chatmi message formats

Chatmi communicates purely through JSON strings. The bridge always sends and receives strings that conform to the following schema.

### Input string sent to Chatmi

```
{
  "version": "0.1.0",
  "client": {
    "id": "<CLIENT_ID>"
  },
  "message": <MCP_JSON_RPC_OBJECT>
}
```

- `<CLIENT_ID>` — the identifier supplied when connecting to `/api/mcp` (either explicitly or via the generated `Mcp-Session-Id`).
- `<MCP_JSON_RPC_OBJECT>` — the exact JSON payload received from the MCP client (for example, an `initialize` request or a `call_tool` notification).

The entire structure above is serialised with `JSON.stringify` and provided to Chatmi in the `text` field of the webhook call.

### Output string returned by Chatmi

Chatmi must reply with an operator message whose `text` field contains a JSON string with this structure:

```
{
  "version": "0.1.0",
  "client": {
    "id": "<CLIENT_ID>"
  },
  "events": [
    {
      "name": "<SSE_EVENT_NAME>",
      "payload": <ANY_JSON_PAYLOAD>
    },
    ...
  ]
}
```

- `<CLIENT_ID>` must match the identifier from the request.
- Every element inside `events` represents one message that will be emitted over SSE. The `name` field is optional; if omitted, the bridge falls back to `message`. The `payload` can contain any JSON-serialisable object that the MCP client expects.

Each event is emitted as:

```
event: <SSE_EVENT_NAME>
data: <payload serialized with JSON.stringify>
```

## Local development

1. Install the Vercel CLI if you want to use `vercel dev`, or simply rely on the bundled Node server.
2. Create a `.env` file (optional) and set `CHATMI_WEBHOOK_URL` if you need to override the default URL.
3. Run the local server:

   ```bash
   npm install
   npm run start
   ```

   or with Vercel:

   ```bash
   npm run dev
   ```

4. Connect your MCP client to `http://localhost:3000/api/mcp?client_id=<YOUR_ID>` (or read the generated value from the `Mcp-Session-Id` header) and POST messages to the same URL.


## Deployment to Vercel

1. Ensure the `CHATMI_WEBHOOK_URL` environment variable is configured in the Vercel project if the default value should be overridden.
2. Deploy the project with `vercel --prod`.
3. Configure your MCP client to use the deployed SSE endpoint and message endpoint in the same way as in local development.
