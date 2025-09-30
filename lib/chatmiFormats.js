const CHATMI_PROTOCOL_VERSION = '0.1.0';

function buildChatmiInput({ clientId, message }) {
  const payload = {
    version: CHATMI_PROTOCOL_VERSION,
    client: {
      id: clientId,
    },
    message,
  };

  const stringified = JSON.stringify(payload);

  if (typeof stringified !== 'string') {
    throw new Error('Unable to serialise Chatmi input payload');
  }

  return stringified;
}

function parseChatmiOutput(rawText) {
  if (typeof rawText !== 'string' || rawText.length === 0) {
    throw new Error('Chatmi response is empty or not a string');
  }
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (error) {
    throw new Error('Chatmi response is not valid JSON');
  }

  if (parsed.version !== CHATMI_PROTOCOL_VERSION) {
    throw new Error(`Unsupported Chatmi protocol version: ${parsed.version}`);
  }

  if (!parsed.client || typeof parsed.client.id !== 'string') {
    throw new Error('Chatmi response is missing client.id');
  }

  if (!Array.isArray(parsed.events)) {
    throw new Error('Chatmi response is missing events array');
  }

  return parsed;
}

module.exports = {
  buildChatmiInput,
  parseChatmiOutput,
  CHATMI_PROTOCOL_VERSION,
};
