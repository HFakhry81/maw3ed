#!/usr/bin/env node
/**
 * Targeted Maw3ed updates for local-first Cursor Desktop workflow.
 *
 * Usage:
 *   node scripts/update-targets.js backend
 *   node scripts/update-targets.js frontend
 *   node scripts/update-targets.js web
 *   node scripts/update-targets.js mobile
 *   node scripts/update-targets.js all
 *
 * npm:
 *   npm run update:backend|frontend|web|mobile|all
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const reportPath = path.join(root, "data", "last-update-report.json");
const target = String(process.argv[2] || "").trim().toLowerCase();

const TARGETS = new Set(["backend", "frontend", "web", "mobile", "all"]);

function nodeBin() {
  return process.execPath;
}

function npmCmd() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function run(label, command, args, options = {}) {
  const started = Date.now();
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    encoding: "utf8",
    env: { ...process.env, ...(options.env || {}) },
    stdio: options.capture ? "pipe" : "inherit",
    shell: Boolean(options.shell)
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

function commandExists(command) {
  const probe = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(probe, [command], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    shell: process.platform === "win32"
  });
  return result.status === 0;
}

function ensureInstall(steps) {
  const hasNodeModules = fs.existsSync(path.join(root, "node_modules", "vite"));
  if (hasNodeModules && process.env.REFRESH_SKIP_INSTALL === "1") {
    steps.push({ label: "install", ok: true, status: 0, ms: 0, skipped: true });
    return true;
  }
  const preferYarn = fs.existsSync(path.join(root, "yarn.lock")) && commandExists("yarn");
  const entry = preferYarn
    ? run("install", "yarn", ["install", "--frozen-lockfile"], { soft: false, shell: true })
    : run("install", npmCmd(), ["install"], { soft: false, shell: true });
  steps.push(entry);
  return entry.ok;
}

function fail(steps, startedAt, reason) {
  const report = {
    ok: false,
    target,
    reason,
    startedAt,
    finishedAt: new Date().toISOString(),
    steps
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.error(`\n❌ Maw3ed update:${target} failed: ${reason}`);
  console.error(
    JSON.stringify(
      {
        ok: false,
        target,
        reason,
        steps: steps.map((step) => ({ label: step.label, ok: step.ok, soft: step.soft || false }))
      },
      null,
      2
    )
  );
  process.exit(1);
}

function succeed(steps, startedAt) {
  const report = {
    ok: true,
    target,
    startedAt,
    finishedAt: new Date().toISOString(),
    brand: "موعد / Maw3ed",
    company: "UpNexa-eg.com",
    steps,
    howToTest: {
      backend: "npm start  # http://127.0.0.1:7000/",
      frontend: "npm run dev  # http://127.0.0.1:7100/",
      web: "http://127.0.0.1:7000/book.html?slug=maw3ed-demo",
      mobile: "cd mobile && npm start",
      full: "npm run update:all"
    }
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\n✅ Maw3ed update:${target} complete → ${path.relative(root, reportPath)}`);
  console.log(
    JSON.stringify(
      {
        ok: true,
        target,
        steps: steps.map((step) => ({
          label: step.label,
          ok: step.ok,
          soft: step.soft || false,
          ms: step.ms,
          skipped: step.skipped || false
        }))
      },
      null,
      2
    )
  );
}

function updateBackend(steps) {
  if (!ensureInstall(steps)) fail(steps, steps.startedAt, "install failed");

  steps.push(run("reset-ops-data", nodeBin(), ["scripts/reset-ops-data.js"], { soft: true, capture: true }));
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
  steps.push(run("check-isolation", nodeBin(), ["scripts/check-isolation.js"], { soft: true, capture: true }));
}

function updateFrontend(steps) {
  if (!ensureInstall(steps)) fail(steps, steps.startedAt, "install failed");
  steps.push(run("build", nodeBin(), ["scripts/build.js"]));
  if (!steps[steps.length - 1].ok) fail(steps, steps.startedAt, "build failed");
}

function updateWeb(steps) {
  if (!ensureInstall(steps)) fail(steps, steps.startedAt, "install failed");
  steps.push(run("build", nodeBin(), ["scripts/build.js"]));
  if (!steps[steps.length - 1].ok) fail(steps, steps.startedAt, "build failed");
  steps.push(run("smoke-http", nodeBin(), ["scripts/smoke-http.js"], { capture: true }));
  if (!steps[steps.length - 1].ok) fail(steps, steps.startedAt, "smoke-http failed");
}

function updateMobile(steps) {
  const mobileDir = path.join(root, "mobile");
  if (!fs.existsSync(path.join(mobileDir, "package.json"))) {
    fail(steps, steps.startedAt, "mobile/package.json missing");
  }
  const hasModules = fs.existsSync(path.join(mobileDir, "node_modules"));
  if (hasModules && process.env.REFRESH_SKIP_INSTALL === "1") {
    steps.push({ label: "mobile-install", ok: true, status: 0, ms: 0, skipped: true });
    return;
  }
  steps.push(run("mobile-install", npmCmd(), ["install"], { cwd: mobileDir, shell: true }));
  if (!steps[steps.length - 1].ok) fail(steps, steps.startedAt, "mobile install failed");
}

function updateAllViaRefresh(steps) {
  const entry = run("refresh-all", nodeBin(), ["scripts/refresh-all.js"]);
  steps.push(entry);
  if (!entry.ok) fail(steps, steps.startedAt, "refresh-all failed");
}

function main() {
  if (!TARGETS.has(target)) {
    console.error(
      `Usage: node scripts/update-targets.js <${[...TARGETS].join("|")}>\n` +
        "Or: npm run update:backend|frontend|web|mobile|all"
    );
    process.exit(1);
  }

  const steps = [];
  const startedAt = new Date().toISOString();
  steps.startedAt = startedAt;

  if (target === "all") {
    updateAllViaRefresh(steps);
  } else if (target === "backend") {
    updateBackend(steps);
  } else if (target === "frontend") {
    updateFrontend(steps);
  } else if (target === "web") {
    updateWeb(steps);
  } else if (target === "mobile") {
    updateMobile(steps);
  }

  succeed(steps, startedAt);
}

main();
