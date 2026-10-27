#!/usr/bin/env node
/**
 * Targeted Maw3ed updates for local-first Cursor Desktop workflow.
 *
 * Usage:
 *   node scripts/update-targets.js backend|api
 *   node scripts/update-targets.js frontend
 *   node scripts/update-targets.js web
 *   node scripts/update-targets.js mobile
 *   node scripts/update-targets.js all
 *
 * npm:
 *   npm run update:backend|api|frontend|web|mobile|all
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { loaded } = require("./load-env");

const root = path.join(__dirname, "..");
const reportPath = path.join(root, "data", "last-update-report.json");
const installRoot = path.join("E:\\Installments", "maw3ed");
const npmCache = path.join(installRoot, "npm-cache");
const pnpmStore = path.join(installRoot, "pnpm-store");
const yarnCache = path.join(installRoot, "yarn-cache");

const rawTarget = String(process.argv[2] || "").trim().toLowerCase();
const target = rawTarget === "api" ? "backend" : rawTarget;

const TARGETS = new Set(["backend", "frontend", "web", "mobile", "all"]);

console.log(`[INFO] Maw3ed update mode=${loaded.mode} storage=${loaded.storage}`);

function nodeBin() {
  return process.execPath;
}

function npmCmd() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function run(label, command, args, options = {}) {
  const started = Date.now();
  const useShell =
    options.shell !== undefined
      ? options.shell
      : process.platform === "win32" && /\.(cmd|bat)$/i.test(String(command));
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_USE_SYSTEM_CA: "1",
      npm_config_cache: npmCache,
      ...(options.env || {})
    },
    stdio: options.capture ? "pipe" : "inherit",
    shell: useShell
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
    entry.error = (result.stderr || result.stdout || result.error || `exit ${result.status}`).toString().slice(0, 2000);
  }
  return entry;
}

function commandExists(command) {
  const probe = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(probe, [command], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    shell: true
  });
  return result.status === 0;
}

function ensureInstall(steps) {
  const hasNodeModules = fs.existsSync(path.join(root, "node_modules", "vite"));
  if (hasNodeModules && process.env.REFRESH_SKIP_INSTALL === "1") {
    steps.push({ label: "install", ok: true, status: 0, ms: 0, skipped: true });
    return true;
  }

  if (fs.existsSync(path.join(root, "pnpm-lock.yaml")) && commandExists("pnpm")) {
    const pnpmBin = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
    const pnpmRes = run("install", pnpmBin, ["install", "--no-frozen-lockfile", "--store-dir", pnpmStore], { soft: true, shell: true });
    if (pnpmRes.ok) {
      steps.push(pnpmRes);
      return true;
    }
    steps.push(pnpmRes);
  }

  if (fs.existsSync(path.join(root, "yarn.lock")) && commandExists("yarn")) {
    const yarnRes = run("install", "yarn", ["install", "--frozen-lockfile", "--cache-folder", yarnCache], { soft: true, shell: true });
    if (yarnRes.ok) {
      steps.push(yarnRes);
      return true;
    }
    steps.push(yarnRes);
  }

  const entry = run("install", npmCmd(), ["install", "--legacy-peer-deps", "--cache", npmCache], { soft: false, shell: true });
  steps.push(entry);
  return entry.ok;
}

function fail(steps, startedAt, reason) {
  const skipSessionRestore = process.env.MAW3ED_SKIP_SESSION_RESTORE === "1";
  const backedUp = (steps || []).some((step) => step.label === "ops-session-backup" && step.ok);
  const alreadyRestored = (steps || []).some((step) => step.label === "ops-session-restore");
  if (!skipSessionRestore && backedUp && !alreadyRestored) {
    try {
      const restoreEntry = run("ops-session-restore", nodeBin(), ["scripts/ops-session-backup.js", "--restore-latest"], {
        soft: true,
        capture: true
      });
      steps.push(restoreEntry);
      if (restoreEntry.ok) {
        console.error("[INFO] Restored pre-update session backup after failure.");
      } else {
        console.error("[WARN] Could not restore session backup after failure. Run: npm run ops:restore");
      }
    } catch (error) {
      console.error(`[WARN] Session restore after failure threw: ${error.message}`);
    }
  }

  const report = {
    ok: false,
    target: rawTarget || target,
    reason,
    startedAt,
    finishedAt: new Date().toISOString(),
    steps
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.error(`\n❌ Maw3ed update:${rawTarget || target} failed: ${reason}`);
  console.error(
    JSON.stringify(
      {
        ok: false,
        target: rawTarget || target,
        reason,
        steps: steps.map((step) => ({ label: step.label, ok: step.ok, soft: step.soft || false, skipped: step.skipped || false }))
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
    target: rawTarget || target,
    startedAt,
    finishedAt: new Date().toISOString(),
    brand: "موعد / Maw3ed",
    company: "UpNexa-eg.com",
    ports: { api: 7000, vite: 7100 },
    steps,
    howToTest: {
      backend: "npm start  # http://127.0.0.1:7000/",
      api: "http://127.0.0.1:7000/api",
      frontend: "npm run dev  # http://127.0.0.1:7100/",
      web: "http://127.0.0.1:7000/book.html?slug=maw3ed-demo",
      mobile: "cd mobile && npm start",
      full: "npm run update:all"
    }
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\n✅ Maw3ed update:${rawTarget || target} complete → ${path.relative(root, reportPath)}`);
  console.log(
    JSON.stringify(
      {
        ok: true,
        target: rawTarget || target,
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

  const skipSessionRestore = process.env.MAW3ED_SKIP_SESSION_RESTORE === "1";
  steps.push(
    run("ops-session-backup", nodeBin(), ["scripts/ops-session-backup.js", "--backup", "--reason=update-backend"], {
      soft: false,
      capture: true
    })
  );
  if (!steps[steps.length - 1].ok) fail(steps, steps.startedAt, "ops-session-backup failed");

  steps.push(run("reset-ops-data", nodeBin(), ["scripts/reset-ops-data.js", "--skip-session-backup"], { soft: true, capture: true }));
  steps.push(
    run("seed-demo-restore", nodeBin(), ["scripts/seed-demo-workspaces.js", "--restore", "--no-backup"], {
      soft: true,
      capture: true
    })
  );
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

  if (skipSessionRestore) {
    steps.push({
      label: "ops-session-restore",
      ok: true,
      status: 0,
      ms: 0,
      skipped: true,
      soft: true
    });
  } else {
    steps.push(
      run("ops-session-restore", nodeBin(), ["scripts/ops-session-backup.js", "--restore-latest"], {
        soft: false,
        capture: true
      })
    );
    if (!steps[steps.length - 1].ok) fail(steps, steps.startedAt, "ops-session-restore failed");
  }
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
  const mobileLock = fs.existsSync(path.join(mobileDir, "package-lock.json"));
  const hasModules = fs.existsSync(path.join(mobileDir, "node_modules"));
  if (hasModules && process.env.REFRESH_SKIP_INSTALL === "1") {
    steps.push({ label: "mobile-install", ok: true, status: 0, ms: 0, skipped: true });
    return;
  }
  const installArgs = mobileLock ? ["ci"] : ["install"];
  steps.push(run("mobile-install", npmCmd(), [...installArgs, "--legacy-peer-deps", "--cache", npmCache], { cwd: mobileDir, soft: false }));
  if (!steps[steps.length - 1].ok) fail(steps, steps.startedAt, "mobile install failed");
}

function updateAll(steps) {
  const entry = run("refresh-all", nodeBin(), ["scripts/refresh-all.js"]);
  steps.push(entry);
  if (!entry.ok) fail(steps, steps.startedAt, "refresh-all failed");

  const mobileDir = path.join(root, "mobile");
  if (fs.existsSync(path.join(mobileDir, "package.json"))) {
    const mobileLock = fs.existsSync(path.join(mobileDir, "package-lock.json"));
    const hasModules = fs.existsSync(path.join(mobileDir, "node_modules"));
    if (hasModules && process.env.REFRESH_SKIP_INSTALL === "1") {
      steps.push({ label: "mobile-install", ok: true, status: 0, ms: 0, skipped: true, soft: true });
    } else {
      steps.push(
        run("mobile-install", npmCmd(), [...(mobileLock ? ["ci"] : ["install"]), "--legacy-peer-deps", "--cache", npmCache], {
          cwd: mobileDir,
          soft: true,
          capture: true
        })
      );
    }
  }
}

function printUsage() {
  console.error(`Usage: node scripts/update-targets.js <backend|api|frontend|web|mobile|all>
Or:    npm run update:backend|api|frontend|web|mobile|all

Targets:
  backend|api  backup → ops reset → migrate/seed (soft) → isolation → restore session
  frontend     install + React/Vite build → dist/
  web          install + build + HTTP smoke (API + pages)
  mobile       npm install in mobile/
  all          full refresh (backup → tests → restore) + mobile install (soft)

Session data:
  Before wipe: npm run ops:backup
  After wipe:  npm run ops:restore
  Skip restore: MAW3ED_SKIP_SESSION_RESTORE=1`);
}

function main() {
  if (!TARGETS.has(target)) {
    printUsage();
    process.exit(1);
  }

  const steps = [];
  const startedAt = new Date().toISOString();
  steps.startedAt = startedAt;

  console.log(`\n=== Maw3ed update:${rawTarget || target} (ports API/web 7000, Vite 7100) ===\n`);

  if (target === "all") {
    updateAll(steps);
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
