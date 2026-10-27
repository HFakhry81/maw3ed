#!/usr/bin/env node
/**
 * Regression: sync vs async public slug resolution after resetOpsData.
 *
 * Broken behavior (postgres): async looked only at workspace_ops_profiles and
 * returned null for maw3ed-demo after reset, while sync resolved local-default
 * via slug-index — /api/public/booking/* then 404'd in smoke-http.
 *
 * Usage: node scripts/smoke-slug-resolve.js
 */
"use strict";

const path = require("path");
const Module = require("module");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function clearMaw3edModules() {
  for (const key of Object.keys(require.cache)) {
    if (
      key.includes(`${path.sep}opsStore.js`) ||
      key.includes(`${path.sep}opsWorkspace.js`) ||
      key.includes(`${path.sep}db.js`) ||
      key.includes(`${path.sep}workspaceOpsPg.js`)
    ) {
      delete require.cache[key];
    }
  }
}

function withMockedDb(mockDb, run) {
  const dbPath = require.resolve("../db");
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "./db" || request === path.join(path.dirname(dbPath), "db") || request === dbPath) {
      return mockDb;
    }
    // Also intercept relative requires of db from opsWorkspace/opsStore
    if (parent && path.basename(request) === "db.js") {
      return mockDb;
    }
    if (parent && request === "./db") {
      return mockDb;
    }
    return originalLoad(request, parent, isMain);
  };
  clearMaw3edModules();
  try {
    return run();
  } finally {
    Module._load = originalLoad;
    clearMaw3edModules();
  }
}

async function main() {
  require("./load-env");

  // 1) Real env path after reset — sync and async must agree.
  clearMaw3edModules();
  const ops = require("../opsStore");
  const reset = ops.resetOpsData();
  const slug = reset.slug || "maw3ed-demo";
  const syncId = ops.resolveWorkspaceIdForSlug(slug);
  const asyncId = await ops.resolveWorkspaceIdForSlugAsync(slug);
  assert(syncId === ops.DEFAULT_WORKSPACE_ID, `sync should map ${slug} → local-default (got ${syncId})`);
  assert(asyncId === syncId, `async must agree with sync after reset (sync=${syncId}, async=${asyncId})`);

  // 2) Simulated postgres configured, but no matching profile/workspace rows.
  await withMockedDb(
    {
      databaseConfigured: true,
      pool: {
        query: async (sql) => {
          if (/workspace_ops_profiles/i.test(sql) || /FROM workspaces/i.test(sql)) {
            return { rows: [] };
          }
          return { rows: [] };
        }
      },
      query: async () => ({ rows: [] })
    },
    async () => {
      const opsPg = require("../opsStore");
      const resetPg = opsPg.resetOpsData();
      const slugPg = resetPg.slug || "maw3ed-demo";
      const syncPg = opsPg.resolveWorkspaceIdForSlug(slugPg);
      const asyncPg = await opsPg.resolveWorkspaceIdForSlugAsync(slugPg);
      assert(syncPg === opsPg.DEFAULT_WORKSPACE_ID, "sync still resolves local-default under mocked PG");
      assert(
        asyncPg === syncPg,
        `async PG-miss must fall back to slug-index (sync=${syncPg}, async=${asyncPg})`
      );
    }
  );

  // 3) Simulated postgres hit for demo slugs — PG wins over JSON index.
  await withMockedDb(
    {
      databaseConfigured: true,
      pool: {
        query: async (sql, params = []) => {
          const needle = String(params[0] || "").toLowerCase();
          if (/workspace_ops_profiles/i.test(sql)) {
            if (needle === "dawybooking") {
              return { rows: [{ workspace_id: "workspace_67ac2618-fe29-4cb0-b668-b152b4b98592" }] };
            }
            if (needle === "talaaee-book") {
              return { rows: [{ workspace_id: "workspace_46d0f604-1bb9-4cd8-958c-d2b370939b41" }] };
            }
            return { rows: [] };
          }
          return { rows: [] };
        }
      },
      query: async () => ({ rows: [] })
    },
    async () => {
      const opsPg = require("../opsStore");
      assert(
        (await opsPg.resolveWorkspaceIdForSlugAsync("dawybooking")) ===
          "workspace_67ac2618-fe29-4cb0-b668-b152b4b98592",
        "medical demo slug prefers PG profile"
      );
      assert(
        (await opsPg.resolveWorkspaceIdForSlugAsync("talaaee-book")) ===
          "workspace_46d0f604-1bb9-4cd8-958c-d2b370939b41",
        "education demo slug prefers PG profile"
      );
    }
  );

  console.log(
    JSON.stringify({
      ok: true,
      suite: "smoke-slug-resolve",
      slug,
      resolvedWorkspaceId: asyncId,
      checks: ["reset-agreement", "pg-miss-fallback", "pg-demo-slug-precedence"]
    })
  );
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, suite: "smoke-slug-resolve", error: error.message }, null, 2));
  process.exitCode = 1;
});
