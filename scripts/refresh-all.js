#!/usr/bin/env node
/**
 * Full Maw3ed refresh: install → session backup → reset ops → migrate/seed →
 * build → smoke tests → restore session data.
 * Usage:
 *   node scripts/refresh-all.js
 *   npm run refresh
 *   npm run update:all
 *
 * Set MAW3ED_SKIP_SESSION_RESTORE=1 to keep the wiped/demo state after refresh.
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { loaded } = require("./load-env");

const root = path.join(__dirname, "..");
const reportPath = path.join(root, "data", "last-refresh-report.json");
const installRoot = path.join("E:\\Installments", "maw3ed");
const npmCache = path.join(installRoot, "npm-cache");
const pnpmStore = path.join(installRoot, "pnpm-store");
const yarnCache = path.join(installRoot, "yarn-cache");

console.log(`[INFO] Maw3ed refresh mode=${loaded.mode} storage=${loaded.storage} port=${loaded.port}`);

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

function nodeBin() {
  return process.execPath;
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

function npmOrYarnInstall() {
  const hasPnpmLock = fs.existsSync(path.join(root, "pnpm-lock.yaml"));
  const hasYarnLock = fs.existsSync(path.join(root, "yarn.lock"));
  const hasNodeModules = fs.existsSync(path.join(root, "node_modules", "vite"));

  if (hasNodeModules && process.env.REFRESH_SKIP_INSTALL === "1") {
    return { label: "install", ok: true, status: 0, ms: 0, skipped: true };
  }

  // 1. Try PNPM first if pnpm-lock.yaml exists
  if (hasPnpmLock) {
    const pnpmBin = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
    const pnpmRes = run("install", pnpmBin, ["install", "--no-frozen-lockfile", "--store-dir", pnpmStore], { soft: true, shell: true });
    if (pnpmRes.ok) return pnpmRes;
  }

  // 2. Try Yarn if yarn.lock exists
  if (hasYarnLock && commandExists("yarn")) {
    const yarnRes = run("install", "yarn", ["install", "--frozen-lockfile", "--cache-folder", yarnCache], { soft: true, shell: true });
    if (yarnRes.ok) return yarnRes;
  }

  // 3. Fallback to NPM
  const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";
  return run("install", npmBin, ["install", "--legacy-peer-deps", "--cache", npmCache], { soft: false, shell: true });
}

function main() {
  const steps = [];
  const startedAt = new Date().toISOString();
  const skipSessionRestore = process.env.MAW3ED_SKIP_SESSION_RESTORE === "1";

  steps.push(npmOrYarnInstall());
  if (!steps[steps.length - 1].ok) {
    fail(steps, startedAt, "install failed");
  }

  // Snapshot all workspaces + indexes before any wipe/reset so we can put them back after smokes.
  steps.push(
    run("ops-session-backup", nodeBin(), ["scripts/ops-session-backup.js", "--backup", "--reason=refresh-all"], {
      soft: false,
      capture: true
    })
  );
  if (!steps[steps.length - 1].ok) fail(steps, startedAt, "ops-session-backup failed");

  steps.push(run("reset-ops-data", nodeBin(), ["scripts/reset-ops-data.js", "--skip-session-backup"], { soft: true, capture: true }));
  // Temporary medical demo for smoke tests; user session is restored at the end.
  steps.push(
    run("seed-medical-restore", nodeBin(), ["scripts/seed-medical-demo.js", "--restore", "--no-backup"], {
      soft: true,
      capture: true
    })
  );

  // Run Postgres migrations & seeding with environment variables loaded
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

  const mobileDir = path.join(root, "mobile");
  if (fs.existsSync(path.join(mobileDir, "package.json"))) {
    const mobileLock = fs.existsSync(path.join(mobileDir, "package-lock.json"));
    const hasModules = fs.existsSync(path.join(mobileDir, "node_modules"));
    const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";
    if (hasModules && process.env.REFRESH_SKIP_INSTALL === "1") {
      steps.push({ label: "mobile-install", ok: true, status: 0, ms: 0, skipped: true, soft: true });
    } else {
      steps.push(
        run("mobile-install", npmBin, [...(mobileLock ? ["ci"] : ["install"]), "--legacy-peer-deps", "--cache", npmCache], {
          cwd: mobileDir,
          soft: true,
          capture: true
        })
      );
    }
  }

  if (skipSessionRestore) {
    steps.push({
      label: "ops-session-restore",
      ok: true,
      status: 0,
      ms: 0,
      skipped: true,
      soft: true,
      stdout: "Skipped via MAW3ED_SKIP_SESSION_RESTORE=1"
    });
  } else {
    steps.push(
      run("ops-session-restore", nodeBin(), ["scripts/ops-session-backup.js", "--restore-latest"], {
        soft: false,
        capture: true
      })
    );
    if (!steps[steps.length - 1].ok) fail(steps, startedAt, "ops-session-restore failed");
  }

  const report = {
    ok: true,
    startedAt,
    finishedAt: new Date().toISOString(),
    brand: "موعد / Maw3ed",
    company: "UpNexa-eg.com",
    ports: { api: 7000, vite: 7100 },
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
  console.log(JSON.stringify({ ok: true, steps: steps.map((step) => ({ label: step.label, ok: step.ok, soft: step.soft || false, ms: step.ms, skipped: step.skipped || false })) }, null, 2));
}

function fail(steps, startedAt, reason) {
  const skipSessionRestore = process.env.MAW3ED_SKIP_SESSION_RESTORE === "1";
  if (!skipSessionRestore) {
    try {
      const restoreEntry = run("ops-session-restore", nodeBin(), ["scripts/ops-session-backup.js", "--restore-latest"], {
        soft: true,
        capture: true
      });
      steps.push(restoreEntry);
      if (restoreEntry.ok) {
        console.error("[INFO] Restored pre-refresh session backup after failure.");
      } else {
        console.error("[WARN] Could not restore session backup after failure. Run: npm run ops:restore");
      }
    } catch (error) {
      console.error(`[WARN] Session restore after failure threw: ${error.message}`);
    }
  }

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
  console.error(JSON.stringify({ ok: false, reason, steps: steps.map((step) => ({ label: step.label, ok: step.ok, soft: step.soft || false, skipped: step.skipped || false })) }, null, 2));
  process.exit(1);
}

main();
