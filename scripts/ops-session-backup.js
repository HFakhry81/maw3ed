#!/usr/bin/env node
/**
 * Full operational-data session backup / restore for Maw3ed.
 *
 * Captures local workspaces (ops + holds + uploads), slug index, and Clerk
 * workspace registry so Update All / refresh can wipe for tests then put
 * the operator's data back.
 *
 * Usage:
 *   node scripts/ops-session-backup.js --backup [--reason=update-all]
 *   node scripts/ops-session-backup.js --restore-latest
 *   node scripts/ops-session-backup.js --restore=data/backups/sessions/<stamp>
 *   node scripts/ops-session-backup.js --list
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const sessionsRoot = path.join(root, "data", "backups", "sessions");
const latestPointerPath = path.join(sessionsRoot, "latest.json");

const TRACKED_ROOT_FILES = [
  "slug-index.json",
  "local-clerk-workspaces.json",
  "maw3ed-data.json"
];

function stampNow() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function rel(p) {
  return path.relative(root, p);
}

function copyFileIfExists(src, dest) {
  if (!fs.existsSync(src) || !fs.statSync(src).isFile()) return false;
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
  return true;
}

function copyDirIfExists(src, dest) {
  if (!fs.existsSync(src) || !fs.statSync(src).isDirectory()) return false;
  ensureDir(path.dirname(dest));
  fs.cpSync(src, dest, { recursive: true, force: true });
  return true;
}

function listWorkspaceIds() {
  const workspacesRoot = path.join(root, "data", "workspaces");
  if (!fs.existsSync(workspacesRoot)) return [];
  return fs
    .readdirSync(workspacesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function createSessionBackup(options = {}) {
  const reason = String(options.reason || "manual").trim() || "manual";
  const stamp = options.stamp || stampNow();
  const sessionDir = path.join(sessionsRoot, stamp);
  ensureDir(sessionDir);

  const workspacesDir = path.join(sessionDir, "workspaces");
  ensureDir(workspacesDir);

  const workspaceIds = listWorkspaceIds();
  const copiedWorkspaces = [];
  for (const workspaceId of workspaceIds) {
    const src = path.join(root, "data", "workspaces", workspaceId);
    const dest = path.join(workspacesDir, workspaceId);
    copyDirIfExists(src, dest);
    copiedWorkspaces.push(workspaceId);
    console.log(`[BACKUP] workspace ${workspaceId} → ${rel(dest)}`);
  }

  const copiedFiles = [];
  for (const fileName of TRACKED_ROOT_FILES) {
    const src = path.join(root, "data", fileName);
    const dest = path.join(sessionDir, "root-files", fileName);
    if (copyFileIfExists(src, dest)) {
      copiedFiles.push(fileName);
      console.log(`[BACKUP] ${fileName} → ${rel(dest)}`);
    }
  }

  const meta = {
    name: "maw3ed-ops-session",
    reason,
    createdAt: new Date().toISOString(),
    stamp,
    workspaces: copiedWorkspaces,
    rootFiles: copiedFiles,
    path: rel(sessionDir)
  };
  fs.writeFileSync(path.join(sessionDir, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`, "utf8");
  fs.writeFileSync(
    latestPointerPath,
    `${JSON.stringify({ stamp, path: rel(sessionDir), createdAt: meta.createdAt, reason }, null, 2)}\n`,
    "utf8"
  );

  console.log(`[SUCCESS] Session backup ready → ${rel(sessionDir)}`);
  return { ok: true, ...meta, absolutePath: sessionDir };
}

function resolveSessionDir(input) {
  if (!input || input === "latest") {
    if (!fs.existsSync(latestPointerPath)) {
      throw new Error("لا توجد جلسة backup حديثة (data/backups/sessions/latest.json)");
    }
    const latest = JSON.parse(fs.readFileSync(latestPointerPath, "utf8"));
    const candidate = path.isAbsolute(latest.path)
      ? latest.path
      : path.join(root, latest.path);
    if (!fs.existsSync(candidate)) {
      throw new Error(`مسار أحدث backup غير موجود: ${latest.path}`);
    }
    return candidate;
  }

  const asPath = path.isAbsolute(input) ? input : path.join(root, input);
  if (fs.existsSync(asPath) && fs.statSync(asPath).isDirectory()) return asPath;

  const byStamp = path.join(sessionsRoot, input);
  if (fs.existsSync(byStamp) && fs.statSync(byStamp).isDirectory()) return byStamp;

  throw new Error(`تعذر إيجاد جلسة backup: ${input}`);
}

function clearOpsWorkspaceCache() {
  try {
    const opsWorkspacePath = require.resolve("../opsWorkspace");
    delete require.cache[opsWorkspacePath];
    const opsWorkspace = require("../opsWorkspace");
    if (opsWorkspace && typeof opsWorkspace === "object") {
      // Re-required module gets a fresh cache Map.
    }
  } catch {
    /* optional */
  }
  try {
    const opsStorePath = require.resolve("../opsStore");
    delete require.cache[opsStorePath];
  } catch {
    /* optional */
  }
}

function restoreSessionBackup(sessionInput = "latest", options = {}) {
  const sessionDir = resolveSessionDir(sessionInput);
  const metaPath = path.join(sessionDir, "meta.json");
  const meta = fs.existsSync(metaPath)
    ? JSON.parse(fs.readFileSync(metaPath, "utf8"))
    : { path: rel(sessionDir) };

  const workspacesSrc = path.join(sessionDir, "workspaces");
  const workspacesDest = path.join(root, "data", "workspaces");
  ensureDir(workspacesDest);

  if (options.replaceAllWorkspaces) {
    // Remove current workspace dirs that are not part of the backup only when explicit.
    // Default: overlay restore (write backed-up workspaces back; leave newer unknown dirs).
  }

  const restoredWorkspaces = [];
  if (fs.existsSync(workspacesSrc)) {
    for (const entry of fs.readdirSync(workspacesSrc, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const src = path.join(workspacesSrc, entry.name);
      const dest = path.join(workspacesDest, entry.name);
      if (fs.existsSync(dest)) {
        fs.rmSync(dest, { recursive: true, force: true });
      }
      fs.cpSync(src, dest, { recursive: true, force: true });
      restoredWorkspaces.push(entry.name);
      console.log(`[RESTORE] workspace ${entry.name} ← ${rel(src)}`);
    }
  }

  const restoredFiles = [];
  const rootFilesDir = path.join(sessionDir, "root-files");
  if (fs.existsSync(rootFilesDir)) {
    for (const fileName of TRACKED_ROOT_FILES) {
      const src = path.join(rootFilesDir, fileName);
      const dest = path.join(root, "data", fileName);
      if (!fs.existsSync(src)) continue;
      copyFileIfExists(src, dest);
      restoredFiles.push(fileName);
      console.log(`[RESTORE] ${fileName} ← ${rel(src)}`);
    }
  }

  clearOpsWorkspaceCache();

  const result = {
    ok: true,
    sessionDir: rel(sessionDir),
    reason: meta.reason || null,
    createdAt: meta.createdAt || null,
    workspaces: restoredWorkspaces,
    rootFiles: restoredFiles
  };
  console.log(`[SUCCESS] Session restore complete ← ${rel(sessionDir)}`);
  return result;
}

function listSessionBackups() {
  ensureDir(sessionsRoot);
  const latest = fs.existsSync(latestPointerPath)
    ? JSON.parse(fs.readFileSync(latestPointerPath, "utf8"))
    : null;
  const sessions = fs
    .readdirSync(sessionsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const dir = path.join(sessionsRoot, entry.name);
      const metaPath = path.join(dir, "meta.json");
      const meta = fs.existsSync(metaPath)
        ? JSON.parse(fs.readFileSync(metaPath, "utf8"))
        : { stamp: entry.name };
      return meta;
    })
    .sort((a, b) => String(b.createdAt || b.stamp || "").localeCompare(String(a.createdAt || a.stamp || "")));
  return { ok: true, latest, sessions };
}

function parseArgs(argv) {
  const args = {
    backup: false,
    restoreLatest: false,
    restore: null,
    list: false,
    reason: "manual",
    json: false
  };
  for (const item of argv) {
    if (item === "--backup") args.backup = true;
    else if (item === "--restore-latest") args.restoreLatest = true;
    else if (item === "--list") args.list = true;
    else if (item === "--json") args.json = true;
    else if (item.startsWith("--restore=")) args.restore = item.slice("--restore=".length);
    else if (item.startsWith("--reason=")) args.reason = item.slice("--reason=".length);
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  let result;
  if (args.list) {
    result = listSessionBackups();
  } else if (args.backup) {
    result = createSessionBackup({ reason: args.reason });
  } else if (args.restoreLatest) {
    result = restoreSessionBackup("latest");
  } else if (args.restore) {
    result = restoreSessionBackup(args.restore);
  } else {
    console.error(`Usage:
  node scripts/ops-session-backup.js --backup [--reason=update-all]
  node scripts/ops-session-backup.js --restore-latest
  node scripts/ops-session-backup.js --restore=<path-or-stamp>
  node scripts/ops-session-backup.js --list`);
    process.exit(1);
  }
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[ERROR] ${error.message || error}`);
    process.exit(1);
  }
}

module.exports = {
  createSessionBackup,
  restoreSessionBackup,
  listSessionBackups,
  resolveSessionDir,
  sessionsRoot,
  latestPointerPath
};
