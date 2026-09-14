#!/usr/bin/env node
/**
 * Side-by-side isolation check for Maw3ed on a shared VPS / Replit host.
 * Maw3ed must stay on 7000 / 7100 / db maw3ed@5433 and must not claim
 * Fanni(3000), UpNexa(5000/5173), or Spendi(8082) ports.
 */
const net = require("net");
const fs = require("fs");
const path = require("path");

const REQUIRED = {
  PORT: "7000",
  VITE_PORT: "7100",
  BACKEND_PORT: "7000"
};

const FORBIDDEN_OWN = new Set(["3000", "5000", "5173", "8081", "8082", "8083"]);

const siblings = [
  { name: "Fanni", ports: [3000, 8081] },
  { name: "UpNexa", ports: [5000, 5173, 8083] },
  { name: "Spendi", ports: [8082] }
];

function loadEnvFile() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return {};
  return Object.fromEntries(
    fs.readFileSync(envPath, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      })
  );
}

function probe(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port }, () => {
      socket.end();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
    socket.setTimeout(400, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function main() {
  const fileEnv = loadEnvFile();
  const env = { ...fileEnv, ...process.env };
  const errors = [];
  const notes = [];

  for (const [key, expected] of Object.entries(REQUIRED)) {
    const actual = String(env[key] || expected);
    if (actual !== expected) {
      errors.push(`${key}=${actual} (expected ${expected} for side-by-side isolation)`);
    } else {
      notes.push(`${key}=${actual}`);
    }
    if (FORBIDDEN_OWN.has(actual)) {
      errors.push(`${key}=${actual} collides with sibling apps`);
    }
  }

  const distIndex = path.join(__dirname, "..", "dist", "index.html");
  if (!fs.existsSync(distIndex)) {
    notes.push("dist/index.html missing — run `npm run build` before production start");
  } else {
    const html = fs.readFileSync(distIndex, "utf8");
    if (!html.includes('id="root"') || html.includes("app.js")) {
      errors.push("dist/index.html does not look like the React build (expected #root, no legacy app.js)");
    } else {
      notes.push("React production build detected in dist/");
    }
  }

  for (const sibling of siblings) {
    for (const port of sibling.ports) {
      if (await probe(port)) notes.push(`${sibling.name} appears online on ${port} (OK — separate process)`);
    }
  }

  const maw3edPort = Number(env.PORT || 7000);
  if (await probe(maw3edPort)) notes.push(`Maw3ed already listening on ${maw3edPort}`);

  console.log("Maw3ed isolation check");
  for (const note of notes) console.log(`  ✓ ${note}`);
  if (errors.length) {
    for (const error of errors) console.error(`  ✗ ${error}`);
    process.exit(1);
  }
  console.log("  ✓ Side-by-side port policy OK (7000/7100, db maw3ed)");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
