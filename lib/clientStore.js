const clients = new Map();

function registerClient(clientId, res) {
  clients.set(clientId, res);
}

function removeClient(clientId) {
  const client = clients.get(clientId);
  if (client) {
    try {
      client.end();
    } catch (error) {
      console.error('Error closing client response', error);
    }
  }
  clients.delete(clientId);
}

function getClient(clientId) {
  return clients.get(clientId);
}

function sendEvent(clientId, eventName, payload) {
  const res = clients.get(clientId);
  if (!res) {
    throw new Error(`No active SSE connection for client ${clientId}`);
  }
  res.write(`event: ${eventName}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

module.exports = {
  registerClient,
  removeClient,
  getClient,
  sendEvent,
};
