#!/usr/bin/env node
/**
 * Compare two workspace ops snapshots (JSON files or seed/workspace paths).
 * Optional --pg requires DATABASE_URL + MAW3ED_STORAGE=postgres and loads via workspaceOpsPg.
 *
 * Usage:
 *   node scripts/compare-workspace-ops.js --left=path/a.json --right=path/b.json
 *   node scripts/compare-workspace-ops.js --left-seed=medical --right-store=...
 *   node scripts/compare-workspace-ops.js --left-workspace=id --right-pg=id
 */
const fs = require("fs");
const path = require("path");
const { compareStores, entityCounts, auditStore } = require("../opsIntegrity");

const root = path.join(__dirname, "..");

function parseArgs(argv) {
  const args = {
    left: null,
    right: null,
    leftSeed: null,
    rightSeed: null,
    leftWorkspace: null,
    rightWorkspace: null,
    rightPg: null,
    json: false
  };
  for (const item of argv) {
    if (item === "--json") args.json = true;
    else if (item.startsWith("--left=")) args.left = item.slice("--left=".length);
    else if (item.startsWith("--right=")) args.right = item.slice("--right=".length);
    else if (item.startsWith("--left-seed=")) args.leftSeed = item.slice("--left-seed=".length);
    else if (item.startsWith("--right-seed=")) args.rightSeed = item.slice("--right-seed=".length);
    else if (item.startsWith("--left-workspace=")) {
      args.leftWorkspace = item.slice("--left-workspace=".length);
    } else if (item.startsWith("--right-workspace=")) {
      args.rightWorkspace = item.slice("--right-workspace=".length);
    } else if (item.startsWith("--right-pg=")) args.rightPg = item.slice("--right-pg=".length);
  }
  return args;
}

function resolveJsonPath(relOrAbs) {
  return path.isAbsolute(relOrAbs) ? relOrAbs : path.join(root, relOrAbs);
}

function loadJsonStore(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return raw.store || raw;
}

function loadSeed(name) {
  if (name !== "medical") throw new Error(`Unsupported seed: ${name}`);
  return loadJsonStore(path.join(root, "data", "seeds", "medical-demo-ops.json"));
}

function loadWorkspace(workspaceId) {
  return loadJsonStore(
    path.join(root, "data", "workspaces", workspaceId, "maw3ed-ops.json")
  );
}

async function loadPgStore(workspaceId) {
  process.env.MAW3ED_STORAGE = process.env.MAW3ED_STORAGE || "postgres";
  const { databaseConfigured, pool } = require("../db");
  if (!databaseConfigured || !pool) {
    throw new Error("PostgreSQL غير مهيأ (MAW3ED_STORAGE=postgres و DATABASE_URL مطلوبان)");
  }
  const workspaceOpsPg = require("../workspaceOpsPg");
  const client = await pool.connect();
  try {
    const has = await workspaceOpsPg.hasProfile(client, workspaceId);
    if (!has) {
      throw new Error(`لا يوجد workspace_ops_profiles لـ ${workspaceId}`);
    }
    return await workspaceOpsPg.loadStore(client, workspaceId);
  } finally {
    client.release();
    await pool.end();
  }
}

async function resolveSide(args, side) {
  if (side === "left") {
    if (args.left) return { label: args.left, store: loadJsonStore(resolveJsonPath(args.left)) };
    if (args.leftSeed) return { label: `seed:${args.leftSeed}`, store: loadSeed(args.leftSeed) };
    if (args.leftWorkspace) {
      return { label: `workspace:${args.leftWorkspace}`, store: loadWorkspace(args.leftWorkspace) };
    }
  } else {
    if (args.right) return { label: args.right, store: loadJsonStore(resolveJsonPath(args.right)) };
    if (args.rightSeed) return { label: `seed:${args.rightSeed}`, store: loadSeed(args.rightSeed) };
    if (args.rightWorkspace) {
      return {
        label: `workspace:${args.rightWorkspace}`,
        store: loadWorkspace(args.rightWorkspace)
      };
    }
    if (args.rightPg) {
      return { label: `pg:${args.rightPg}`, store: await loadPgStore(args.rightPg) };
    }
  }
  return null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const left = await resolveSide(args, "left");
  const right = await resolveSide(args, "right");
  if (!left || !right) {
    console.error(`Usage:
  node scripts/compare-workspace-ops.js --left=<json> --right=<json>
  node scripts/compare-workspace-ops.js --left-seed=medical --right-workspace=<id>
  node scripts/compare-workspace-ops.js --left-workspace=<id> --right-pg=<id>`);
    process.exit(1);
  }

  const comparison = compareStores(left.store, right.store, {
    leftLabel: left.label,
    rightLabel: right.label
  });
  const leftAudit = auditStore(left.store);
  const rightAudit = auditStore(right.store);
  const result = {
    ok: comparison.ok && leftAudit.ok && rightAudit.ok,
    comparison,
    leftAudit: { ok: leftAudit.ok, orphanCount: leftAudit.orphanCount, counts: entityCounts(left.store) },
    rightAudit: {
      ok: rightAudit.ok,
      orphanCount: rightAudit.orphanCount,
      counts: entityCounts(right.store)
    }
  };

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(
      `[COMPARE] ok=${result.ok} diffs=${comparison.diffs.length} leftOrphans=${leftAudit.orphanCount} rightOrphans=${rightAudit.orphanCount}`
    );
    for (const diff of comparison.diffs.slice(0, 15)) {
      console.log(`  - ${JSON.stringify(diff)}`);
    }
  }
  process.exit(result.ok ? 0 : 1);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[ERROR] ${error.message || error}`);
    process.exit(1);
  });
}
