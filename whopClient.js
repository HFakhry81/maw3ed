/**
 * whopClient.js — Whop API client for local/VPS environments.
 * Uses native fetch (Node 18+) instead of Replit connectors.
 * If WHOP_API_KEY is not set, requests throw a clear 503 with whopDisabled=true
 * so billing routes can degrade gracefully.
 */

async function whopRequest(requestPath, options = {}) {
  const apiKey = process.env.WHOP_API_KEY || process.env.WHOP_COMPANY_ID;
  if (!apiKey) {
    const err = new Error("Whop is not configured in this environment");
    err.statusCode = 503;
    err.whopDisabled = true;
    throw err;
  }

  const url = `https://api.whop.com${requestPath}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

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

// Legacy compatibility — kept so any code importing getWhopClient doesn't crash at load time
function getWhopClient() {
  const err = new Error("getWhopClient() is not available outside Replit — use whopRequest() directly");
  err.statusCode = 503;
  throw err;
}

module.exports = { getWhopClient, whopRequest };
