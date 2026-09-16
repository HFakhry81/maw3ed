let ReplitConnectors = null;
try {
  ({ ReplitConnectors } = require("@replit/connectors-sdk"));
} catch {
  ReplitConnectors = null;
}

let connectors;
function getWhopClient() {
  if (!ReplitConnectors) {
    const error = new Error("Whop connector is not available in this environment");
    error.statusCode = 503;
    throw error;
  }
  connectors ||= new ReplitConnectors();
  return connectors;
}

async function whopRequest(requestPath, options = {}) {
  const response = await getWhopClient().proxy("whop", requestPath, options);
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!response.ok) {
    const error = new Error(body?.error?.message || `Whop request failed with status ${response.status}`);
    error.statusCode = response.status;
    throw error;
  }
  return body;
}

module.exports = { getWhopClient, whopRequest };
