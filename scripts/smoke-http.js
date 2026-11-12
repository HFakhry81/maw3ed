#!/usr/bin/env node
/**
 * Live HTTP smoke against a temporary Maw3ed server.
 * Usage: node scripts/smoke-http.js
 */
require("./load-env");
const { spawn } = require("child_process");
const http = require("http");
const path = require("path");
const fs = require("fs");

const root = path.join(__dirname, "..");
const port = Number(process.env.SMOKE_PORT || 7099);
const base = `http://127.0.0.1:${port}`;

function request(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      `${base}${urlPath}`,
      {
        method,
        headers: payload
          ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
          : undefined,
        timeout: 10000
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          let json = null;
          try {
            json = JSON.parse(raw || "{}");
          } catch {
            json = { raw };
          }
          resolve({ status: res.statusCode, json });
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("request timeout")));
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitForServer(attempts = 40) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const health = await request("GET", "/api/ops/bootstrap");
      if (health.status === 200) return;
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("server did not become ready");
}

async function main() {
  const storeModule = path.join(root, "opsStore.js");
  delete require.cache[require.resolve(storeModule)];
  const ops = require(storeModule);
  ops.resetOpsData();

  const env = {
    ...process.env,
    PORT: String(port),
    MAW3ED_STORAGE: process.env.MAW3ED_STORAGE || "local"
  };
  const child = spawn(process.execPath, [path.join(root, "server.js")], {
    cwd: root,
    env,
    stdio: ["ignore", "pipe", "pipe"]
  });

  let logs = "";
  child.stdout.on("data", (chunk) => {
    logs += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    logs += chunk.toString();
  });

  const stop = () =>
    new Promise((resolve) => {
      if (child.exitCode != null) return resolve();
      child.once("exit", () => resolve());
      child.kill("SIGTERM");
      setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch (_) {}
      }, 2000);
    });

  try {
    await waitForServer();
    const config = await request("GET", "/api/config");
    if (config.status !== 200 || typeof config.json.authRequired !== "boolean") {
      throw new Error("config endpoint must report the authentication requirement");
    }

    const bootstrap = await request("GET", "/api/ops/bootstrap");
    if (bootstrap.status !== 200 || !bootstrap.json.ok) {
      throw new Error(`bootstrap failed: ${bootstrap.status}`);
    }

    const slug = bootstrap.json.bookingPage?.slug || "maw3ed-demo";
    const publicPage = await request("GET", `/api/public/booking/${encodeURIComponent(slug)}`);
    if (publicPage.status !== 200 || !publicPage.json.services?.length) {
      throw new Error(
        `public booking page failed (status=${publicPage.status}, slug=${slug}, error=${publicPage.json?.error || publicPage.json?.message || "n/a"}, storage=${env.MAW3ED_STORAGE || "local"})`
      );
    }

    const serviceId = publicPage.json.services[0].id;
    const date = new Date().toISOString().slice(0, 10);
    const slots = await request(
      "GET",
      `/api/public/booking/${encodeURIComponent(slug)}/slots?date=${date}&serviceId=${encodeURIComponent(serviceId)}&staffId=any`
    );
    if (slots.status !== 200 || !(slots.json.slots || []).length) {
      throw new Error("slots endpoint failed");
    }

    const slot = slots.json.slots[0];
    const hold = await request("POST", `/api/public/booking/${encodeURIComponent(slug)}/hold`, {
      date,
      serviceId,
      staffId: "any",
      time: slot.time
    });
    if (hold.status !== 200 || !hold.json.staffId) throw new Error("hold endpoint failed");

    const book = await request("POST", `/api/public/booking/${encodeURIComponent(slug)}/appointments`, {
      date,
      serviceId,
      staffId: hold.json.staffId,
      time: slot.time,
      customerName: "اختبار HTTP",
      phone: "01077770101",
      email: "http-smoke@test.com"
    });
    if (book.status !== 201 || !book.json.appointment?.id) throw new Error("book endpoint failed");

    const bookHtml = await request("GET", "/book.html");
    if (bookHtml.status !== 200) throw new Error("book.html not served");

    const indexHtml = await request("GET", "/");
    if (indexHtml.status !== 200) throw new Error("admin index not served");

    const report = {
      ok: true,
      suite: "smoke-http",
      port,
      authRequired: config.json.authRequired,
      slug,
      slotCount: slots.json.slots.length,
      appointmentId: book.json.appointment.id,
      bootstrapCustomers: bootstrap.json.customers?.length || 0,
      distPresent: fs.existsSync(path.join(root, "dist", "index.html"))
    };
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    console.error(
      JSON.stringify({ ok: false, suite: "smoke-http", error: error.message, logs: logs.slice(-2000) }, null, 2)
    );
    await stop();
    process.exit(1);
  }

  await stop();
}

main();
