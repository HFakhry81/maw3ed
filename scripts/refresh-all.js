#!/usr/bin/env node
/**
 * Full Maw3ed refresh: install → reset ops → optional migrate/seed → build → smoke tests.
 * Usage:
 *   node scripts/refresh-all.js
 *   npm run refresh
 *   npm run update:all
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const reportPath = path.join(root, "data", "last-refresh-report.json");

function run(label, command, args, options = {}) {
  const started = Date.now();
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...(options.env || {}) },
    stdio: options.capture ? "pipe" : "inherit"
  });
  const entry = {
    label,
    command: [command, ...args].join(" "),
    ok: result.status === 0,
    status: result.status,
    ms: Date.now() - started,
    soft: Boolean(options.soft)
  };
  if (options.capture) {
    entry.stdout = (result.stdout || "").trim().slice(0, 4000);
    entry.stderr = (result.stderr || "").trim().slice(0, 2000);
  }
  if (!entry.ok && !options.soft) {
    entry.error = (result.stderr || result.stdout || `exit ${result.status}`).toString().slice(0, 2000);
  }
  return entry;
}

function nodeBin() {
  return process.execPath;
}

function commandExists(command) {
  const probe = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(probe, [command], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    shell: process.platform === "win32"
  });
  return result.status === 0;
}

function npmOrYarnInstall() {
  const hasYarnLock = fs.existsSync(path.join(root, "yarn.lock"));
  const hasNodeModules = fs.existsSync(path.join(root, "node_modules", "vite"));
  if (hasNodeModules && process.env.REFRESH_SKIP_INSTALL === "1") {
    return { label: "install", ok: true, status: 0, ms: 0, skipped: true };
  }
  if (hasYarnLock && commandExists("yarn")) {
    return run("install", "yarn", ["install", "--frozen-lockfile"], { soft: false, shell: true });
  }
  const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";
  return run("install", npmBin, ["install"], { soft: false, shell: true });
}

function main() {
  const steps = [];
  const startedAt = new Date().toISOString();

  steps.push(npmOrYarnInstall());
  if (!steps[steps.length - 1].ok) {
    fail(steps, startedAt, "install failed");
  }

  steps.push(run("reset-ops-data", nodeBin(), ["scripts/reset-ops-data.js"], { capture: true }));
  if (!steps[steps.length - 1].ok) fail(steps, startedAt, "reset-ops-data failed");

  // Postgres is optional in local/demo mode.
  steps.push(
    run("migrate", nodeBin(), ["scripts/migrate.js"], {
      soft: true,
      capture: true,
      env: process.env.DATABASE_URL ? {} : { MAW3ED_STORAGE: "local" }
    })
  );
  steps.push(
    run("seed", nodeBin(), ["scripts/seed.js"], {
      soft: true,
      capture: true,
      env: process.env.DATABASE_URL ? {} : { MAW3ED_STORAGE: "local" }
    })
  );

  steps.push(run("build", nodeBin(), ["scripts/build.js"]));
  if (!steps[steps.length - 1].ok) fail(steps, startedAt, "build failed");

  steps.push(run("check-isolation", nodeBin(), ["scripts/check-isolation.js"], { soft: true, capture: true }));
  steps.push(run("smoke-public-booking", nodeBin(), ["scripts/smoke-public-booking.js"], { capture: true }));
  if (!steps[steps.length - 1].ok) fail(steps, startedAt, "smoke-public-booking failed");

  steps.push(run("smoke-http", nodeBin(), ["scripts/smoke-http.js"], { capture: true }));
  if (!steps[steps.length - 1].ok) fail(steps, startedAt, "smoke-http failed");

  const report = {
    ok: true,
    startedAt,
    finishedAt: new Date().toISOString(),
    brand: "موعد / Maw3ed",
    company: "UpNexa-eg.com",
    steps,
    howToTest: {
      start: "npm start",
      admin: "http://127.0.0.1:7000/",
      booking: "http://127.0.0.1:7000/book.html?slug=maw3ed-demo",
      refreshAgain: "npm run refresh"
    }
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\n✅ Maw3ed refresh complete → ${path.relative(root, reportPath)}`);
  console.log(JSON.stringify({ ok: true, steps: steps.map((step) => ({ label: step.label, ok: step.ok, soft: step.soft || false, ms: step.ms })) }, null, 2));
}

function fail(steps, startedAt, reason) {
  const report = {
    ok: false,
    reason,
    startedAt,
    finishedAt: new Date().toISOString(),
    steps
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.error(`\n❌ Maw3ed refresh failed: ${reason}`);
  console.error(JSON.stringify({ ok: false, reason, steps: steps.map((step) => ({ label: step.label, ok: step.ok, soft: step.soft || false })) }, null, 2));
  process.exit(1);
}

main();
