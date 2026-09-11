const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
const token = process.env.REPLIT_IDENTITY ? `repl ${process.env.REPLIT_IDENTITY}`
  : process.env.WEB_REPL_RENEWAL ? `depl ${process.env.WEB_REPL_RENEWAL}` : null;
if (!hostname || !token) throw new Error("Whop connector runtime is unavailable");

async function call(method, params = {}) {
  const response = await fetch(`https://${hostname}/api/v2/proxy/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "X-Replit-Token": token, "Connector-Name": "whop" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
  });
  const lines = (await response.text()).split("\n").filter((line) => line.startsWith("data:"));
  const envelope = JSON.parse(lines.at(-1).replace(/^data:\s*/, ""));
  const text = envelope.result?.content?.[0]?.text;
  return text ? JSON.parse(text) : envelope.result;
}

const [command, argsJson] = process.argv.slice(2);
if (command === "--list-tools") {
  const result = await call("tools/list");
  result.tools.forEach((tool) => console.log(`${tool.name} — ${tool.description}`));
} else if (command === "--schema") {
  const result = await call("tools/list");
  const tool = result.tools.find((item) => item.name === argsJson);
  console.log(tool ? JSON.stringify(tool.inputSchema, null, 2) : `Tool "${argsJson}" not found`);
} else if (command) {
  console.log(JSON.stringify(await call("tools/call", { name: command, arguments: JSON.parse(argsJson || "{}") }), null, 2));
} else {
  console.log("Usage: node whop-mcp.mjs --list-tools | --schema <tool> | <tool> '{...}'");
}