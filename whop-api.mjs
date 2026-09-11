const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
const token = process.env.REPLIT_IDENTITY ? `repl ${process.env.REPLIT_IDENTITY}`
  : process.env.WEB_REPL_RENEWAL ? `depl ${process.env.WEB_REPL_RENEWAL}` : null;

const [method, requestPath, bodyJson] = process.argv.slice(2);
if (!method || !requestPath) {
  console.log("Usage: node whop-api.mjs <METHOD> <path> ['{...}']");
  process.exit(0);
}
if (!hostname || !token) throw new Error("Whop connector runtime is unavailable");

const response = await fetch(`https://${hostname}/api/v2/proxy/${requestPath}`, {
  method,
  headers: { "Content-Type": "application/json", "X-Replit-Token": token, "Connector-Name": "whop" },
  ...(bodyJson ? { body: bodyJson } : {})
});
console.log(JSON.stringify(await response.json(), null, 2));