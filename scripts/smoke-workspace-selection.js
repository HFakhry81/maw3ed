#!/usr/bin/env node
/**
 * Smoke: post-sign-in workspace selection prefers real memberships over sticky local-default.
 */
async function main() {
  const {
    LOCAL_DEFAULT_WORKSPACE_ID,
    pickPreferredWorkspace,
    resolveWorkspaceIdForSession
  } = await import("../src/workspaceSelection.js");

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  const dawy = {
    id: "workspace_67ac2618-fe29-4cb0-b668-b152b4b98592",
    name: "مستشفيات داوي",
    slug: "dawybooking",
    role: "owner",
    created_at: "2024-01-02T00:00:00.000Z"
  };
  const talaaee = {
    id: "workspace_46d0f604-1bb9-4cd8-958c-d2b370939b41",
    name: "طلائع",
    slug: "talaaee-book",
    role: "owner",
    created_at: "2024-01-03T00:00:00.000Z"
  };
  const memberOnly = {
    id: "workspace_member_only",
    name: "عضوية فقط",
    slug: "member-clinic",
    role: "staff",
    created_at: "2024-01-01T00:00:00.000Z"
  };

  assert(
    resolveWorkspaceIdForSession([dawy], "local-default") === dawy.id,
    "sticky local-default must be replaced by membership"
  );
  assert(
    resolveWorkspaceIdForSession([dawy], "") === dawy.id,
    "empty stored id must be replaced by membership"
  );
  assert(
    resolveWorkspaceIdForSession([dawy], null) === dawy.id,
    "missing stored id must be replaced by membership"
  );
  assert(
    resolveWorkspaceIdForSession([dawy], "workspace_stale_missing") === dawy.id,
    "stale id not in /api/workspaces must be replaced"
  );
  assert(
    resolveWorkspaceIdForSession([dawy], dawy.id) === dawy.id,
    "valid membership id must be kept"
  );
  assert(
    resolveWorkspaceIdForSession([dawy], "local-default", { allowLocalOptIn: true }) ===
      LOCAL_DEFAULT_WORKSPACE_ID,
    "explicit local opt-in may keep local-default"
  );
  assert(
    resolveWorkspaceIdForSession([], "local-default") === LOCAL_DEFAULT_WORKSPACE_ID,
    "no memberships keeps local-default"
  );

  assert(
    pickPreferredWorkspace([memberOnly, dawy]).id === dawy.id,
    "owner role preferred over staff"
  );
  assert(
    resolveWorkspaceIdForSession([talaaee, dawy], "local-default", {
      userEmail: "contact.haitham@gmail.com"
    }) === dawy.id,
    "gmail demo maps to dawybooking"
  );
  assert(
    resolveWorkspaceIdForSession([talaaee, dawy], "local-default", {
      userEmail: "contact.haitham@yahoo.com"
    }) === talaaee.id,
    "yahoo demo maps to talaaee-book"
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        suite: "smoke-workspace-selection",
        cases: [
          "replace-local-default",
          "replace-empty",
          "replace-stale",
          "keep-valid",
          "opt-in-local",
          "prefer-owner",
          "demo-gmail-dawy",
          "demo-yahoo-talaaee"
        ]
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify({ ok: false, suite: "smoke-workspace-selection", error: error.message }, null, 2)
  );
  process.exit(1);
});
