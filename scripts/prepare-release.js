#!/usr/bin/env node
/**
 * Prepare a local Maw3ed release: refresh → show git status → print Git + VPS commands.
 *
 * Usage:
 *   npm run release:prepare
 *   node scripts/prepare-release.js
 *   node scripts/prepare-release.js --skip-refresh
 */
const { spawnSync, execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const args = new Set(process.argv.slice(2));
const skipRefresh = args.has("--skip-refresh");

function nodeBin() {
  return process.execPath;
}

function runGit(gitArgs, options = {}) {
  try {
    return execFileSync("git", gitArgs, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", options.quiet ? "ignore" : "pipe"]
    }).trim();
  } catch (error) {
    if (options.optional) return "";
    throw error;
  }
}

function main() {
  console.log("\n=== Maw3ed release prepare (Local → Git → VPS) ===\n");

  if (!skipRefresh) {
    console.log("Running full local refresh (update:all)...\n");
    const refresh = spawnSync(nodeBin(), ["scripts/refresh-all.js"], {
      cwd: root,
      env: process.env,
      stdio: "inherit"
    });
    if (refresh.status !== 0) {
      console.error("\n❌ Refresh failed. Fix local issues before pushing or deploying.");
      process.exit(refresh.status || 1);
    }
  } else {
    console.log("Skipped refresh (--skip-refresh).\n");
  }

  const branch = runGit(["branch", "--show-current"], { optional: true }) || "unknown";
  const status = runGit(["status", "--short"], { optional: true });
  const remote = runGit(["remote", "get-url", "origin"], { optional: true }) || "(no origin)";
  const aheadBehind = runGit(["status", "-sb"], { optional: true });

  const clean = !status;
  console.log("--- Git snapshot ---");
  console.log(`Branch:  ${branch}`);
  console.log(`Remote:  ${remote}`);
  console.log(`Status:  ${aheadBehind || "(unavailable)"}`);
  console.log(clean ? "Working tree: clean" : `Working tree:\n${status}`);
  console.log("");

  console.log("--- After local verification, push to Git ---");
  if (!clean) {
    console.log("git add -A");
    console.log('git commit -m "Describe the successful local change"');
  } else {
    console.log("# Working tree already clean — commit only if you have new verified changes.");
  }
  console.log(`git push -u origin ${branch}`);
  console.log("");

  console.log("--- On the VPS (after Git has the release) ---");
  console.log("# Replace placeholders with your real paths/service names:");
  console.log("cd /path/to/maw3ed");
  console.log("git pull origin " + branch);
  console.log("npm ci   # or: npm install");
  console.log("npm run build");
  console.log("# Restart the Node process that serves PORT=7000, for example:");
  console.log("#   sudo systemctl restart maw3ed");
  console.log("#   # or: pm2 restart maw3ed");
  console.log("");
  console.log("Docs: docs/DEPLOY_VPS.md | docs/LOCAL_CURSOR_WORKFLOW.md | docs/nginx/maw3ed.conf");
  console.log("Local checks: http://127.0.0.1:7000/  |  book.html?slug=maw3ed-demo");
  console.log("");

  const reportPath = path.join(root, "data", "last-release-prepare.json");
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(
    reportPath,
    `${JSON.stringify(
      {
        ok: true,
        preparedAt: new Date().toISOString(),
        skipRefresh,
        branch,
        remote,
        clean,
        status: status || "",
        next: ["git commit/push if needed", "VPS git pull + build + restart :7000"]
      },
      null,
      2
    )}\n`
  );
  console.log(`Wrote ${path.relative(root, reportPath)}`);
}

main();
