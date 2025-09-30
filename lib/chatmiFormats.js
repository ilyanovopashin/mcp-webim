const CHATMI_PROTOCOL_VERSION = '0.1.0';

function buildChatmiInput({ clientId, message }) {
  const payload = {
    version: CHATMI_PROTOCOL_VERSION,
    client: {
      id: clientId,
    },
    message,
  };


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
