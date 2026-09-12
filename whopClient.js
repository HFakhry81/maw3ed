const { ReplitConnectors } = require("@replit/connectors-sdk");

let connectors;
function getWhopClient() {
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