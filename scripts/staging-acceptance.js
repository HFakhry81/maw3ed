#!/usr/bin/env node
/**
 * Staging acceptance gate for Maw3ed.
 * This validates the production-like checks required before a limited launch:
 * - port isolation and build artifact checks
 * - auth-required protection for sensitive endpoints
 * - health/readiness endpoints
 */
const { spawn, spawnSync } = require("child_process");
const http = require("http");
const path = require("path");

const root = path.join(__dirname, "..");
const port = Number(process.env.STAGING_PORT || 7115);

function request(method, pathname) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: "127.0.0.1", port, path: pathname, method, timeout: 10000 },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => {
          raw += String(chunk);
        });
        res.on("end", () => {
          let json = null;
          try {
            json = JSON.parse(raw || "{}");
          } catch {
            json = { raw };
          }
          resolve({ status: res.statusCode, headers: res.headers, json });
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("request timeout")));
    req.end();
  });
}

async function waitForServer(attempts = 50) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const health = await request("GET", "/api/health/ready");
      if (health.status === 200) return health;
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("server did not become ready for staging acceptance checks");
}

function stopProcess(child) {
  return new Promise((resolve) => {
    if (!child || child.exitCode != null) return resolve();
    child.once("exit", () => resolve());
    child.kill("SIGTERM");
    setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {}
      resolve();
    }, 2000);
  });
}

async function main() {
  const isolate = spawnSync(process.execPath, [path.join(root, "scripts", "check-isolation.js")], {
    cwd: root,
    stdio: "pipe",
    encoding: "utf8"
  });

  const checks = [];
  checks.push({ name: "isolation-check", ok: isolate.status === 0, details: isolate.stdout.trim() || isolate.stderr.trim() || "check-isolation.js exited with no output" });

  const child = spawn(process.execPath, [path.join(root, "server.js")], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      MAW3ED_ENV: "production",
      MAW3ED_REQUIRE_AUTH: "1",
      MAW3ED_STORAGE: process.env.MAW3ED_STORAGE || "local"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let logs = "";
  child.stdout.on("data", (chunk) => {
    logs += String(chunk);
  });
  child.stderr.on("data", (chunk) => {
    logs += String(chunk);
  });

  try {
    const ready = await waitForServer();
    checks.push({ name: "health-ready", ok: ready.status === 200, details: JSON.stringify(ready.json) });

    const patientStatus = await request("GET", "/api/patients");
    checks.push({ name: "patients-protected", ok: patientStatus.status === 401, details: JSON.stringify(patientStatus.json) });

    const appointmentsStatus = await request("GET", "/api/appointments");
    checks.push({ name: "appointments-protected", ok: appointmentsStatus.status === 401, details: JSON.stringify(appointmentsStatus.json) });

    const devEventsStatus = await request("GET", "/api/development-events?limit=5");
    checks.push({ name: "development-events-protected", ok: devEventsStatus.status === 401, details: JSON.stringify(devEventsStatus.json) });

    const health = await request("GET", "/api/health");
    checks.push({ name: "health-overall", ok: health.status === 200, details: JSON.stringify(health.json) });

    const failed = checks.filter((item) => !item.ok);
    const report = {
      ok: failed.length === 0,
      suite: "staging-acceptance",
      checks,
      logs: logs.slice(-2000)
    };

    console.log(JSON.stringify(report, null, 2));
    process.exit(failed.length ? 1 : 0);
  } finally {
    await stopProcess(child);
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, suite: "staging-acceptance", error: error.message }, null, 2));
  process.exit(1);
});
