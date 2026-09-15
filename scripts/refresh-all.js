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

// Automatically load .env file
const envPath = path.join(root, ".env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  envContent.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const [key, ...val] = trimmed.split("=");
      if (key && val.length > 0) {
        process.env[key.trim()] = val.join("=").trim();
      }
    }
  });
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
    env: { ...process.env, ...(options.env || {}) },
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
    const pnpmRes = run("install", pnpmBin, ["install", "--no-frozen-lockfile"], { soft: true, shell: true });
    if (pnpmRes.ok) return pnpmRes;
  }

  // 2. Try Yarn if yarn.lock exists
  if (hasYarnLock && commandExists("yarn")) {
    const yarnRes = run("install", "yarn", ["install", "--frozen-lockfile"], { soft: true, shell: true });
    if (yarnRes.ok) return yarnRes;
  }

  // 3. Fallback to NPM
  const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";
  return run("install", npmBin, ["install", "--legacy-peer-deps"], { soft: false, shell: true });
}

function main() {
  const steps = [];
  const startedAt = new Date().toISOString();

  steps.push(npmOrYarnInstall());
  if (!steps[steps.length - 1].ok) {
    fail(steps, startedAt, "install failed");
  }

  steps.push(run("reset-ops-data", nodeBin(), ["scripts/reset-ops-data.js"], { soft: true, capture: true }));

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
    const hasModules = fs.existsSync(path.join(mobileDir, "node_modules"));
    const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";
    if (hasModules && process.env.REFRESH_SKIP_INSTALL === "1") {
      steps.push({ label: "mobile-install", ok: true, status: 0, ms: 0, skipped: true, soft: true });
    } else {
      steps.push(
        run("mobile-install", npmBin, ["install", "--legacy-peer-deps"], {
          cwd: mobileDir,
          soft: true,
          capture: true
        })
      );
    }
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