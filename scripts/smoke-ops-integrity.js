#!/usr/bin/env node
/**
 * Phase 2 package smoke: FK inventory, orphan audit, migrate ledger planning,
 * JSON compare, and ops session backup→restore drill (local JSON path).
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const {
  auditStore,
  compareStores,
  auditMigrationSqlInventory,
  REQUIRED_APPOINTMENT_COMPOSITE_FKS
} = require("../opsIntegrity");
const {
  listMigrationFiles,
  readMigrationFile,
  planMigrations,
  checksum,
  MIGRATIONS_DIR
} = require("./migrate");
const { buildFixtureStore } = require("./audit-ops-integrity");
const {
  createSessionBackup,
  restoreSessionBackup
} = require("./ops-session-backup");
const { DEFAULT_OWNER_EMAIL } = require("./medical-seed-snapshot");
const {
  SECTION_TARGETS,
  pickOwnedWorkspaceForSection,
  applyActivityFields,
  readDemoSeedBundle,
  CANONICAL_SEED
} = require("./demo-seed-store");

const root = path.join(__dirname, "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function loadAllMigrationSql() {
  const map = {};
  for (const filename of listMigrationFiles(MIGRATIONS_DIR)) {
    map[filename] = readMigrationFile(MIGRATIONS_DIR, filename).sql;
  }
  return map;
}

function writeWorkspaceOps(workspaceId, store) {
  const dir = path.join(root, "data", "workspaces", workspaceId);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, "maw3ed-ops.json");
  fs.writeFileSync(filePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  return filePath;
}

function readWorkspaceOps(workspaceId) {
  const filePath = path.join(root, "data", "workspaces", workspaceId, "maw3ed-ops.json");
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function removeWorkspace(workspaceId) {
  const dir = path.join(root, "data", "workspaces", workspaceId);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function cleanupSession(stamp) {
  const sessionDir = path.join(root, "data", "backups", "sessions", stamp);
  if (fs.existsSync(sessionDir)) fs.rmSync(sessionDir, { recursive: true, force: true });
}

function main() {
  const checks = [];

  // 1) Migration inventory includes 011 appointment composite FKs
  const files = listMigrationFiles(MIGRATIONS_DIR);
  assert(files.includes("010_normalized_workspace_ops.sql"), "migration 010 must exist");
  assert(files.includes("011_workspace_ops_composite_fks.sql"), "migration 011 must exist");
  const inventory = auditMigrationSqlInventory(loadAllMigrationSql());
  assert(inventory.ok, `FK inventory failed: ${JSON.stringify(inventory.missingRequired)}`);
  for (const fk of REQUIRED_APPOINTMENT_COMPOSITE_FKS) {
    assert(
      inventory.requiredConstraintNames.includes(fk.constraint),
      `missing required constraint name ${fk.constraint}`
    );
  }
  checks.push("migration-fk-inventory");

  // 2) Ledger planning is idempotent (second plan skips all)
  const firstPlan = planMigrations(files, new Set());
  assert(firstPlan.pending.length === files.length, "first plan should pending all files");
  const secondPlan = planMigrations(files, new Set(files));
  assert(secondPlan.pending.length === 0, "second plan must skip all applied files");
  assert(secondPlan.skipped.length === files.length, "second plan skipped count");
  const sql011 = readMigrationFile(MIGRATIONS_DIR, "011_workspace_ops_composite_fks.sql").sql;
  assert(checksum(sql011).startsWith("fnv1a32:"), "checksum format");
  checks.push("migrate-ledger-plan");

  // 3) Clean fixture has zero orphans; broken fixture is detected
  const clean = buildFixtureStore();
  const cleanAudit = auditStore(clean);
  assert(cleanAudit.ok, "fixture must have zero orphans");
  const broken = JSON.parse(JSON.stringify(clean));
  broken.appointments[0].customerId = "missing-customer";
  broken.appointments[0].staffId = "missing-staff";
  const brokenAudit = auditStore(broken);
  assert(!brokenAudit.ok, "broken fixture must report orphans");
  assert(brokenAudit.orphanCount >= 2, "broken fixture orphan count");
  checks.push("orphan-audit");

  // 4) Compare detects id drift and passes on identical copies
  const same = compareStores(clean, JSON.parse(JSON.stringify(clean)), {
    leftLabel: "a",
    rightLabel: "b"
  });
  assert(same.ok, "identical stores must compare equal");
  const drifted = JSON.parse(JSON.stringify(clean));
  drifted.customers.push({ id: "customer-extra", firstName: "زائد", categoryId: "cat-new" });
  const driftCompare = compareStores(clean, drifted, { leftLabel: "a", rightLabel: "b" });
  assert(!driftCompare.ok, "drifted stores must differ");
  checks.push("compare-stores");

  // 5) Backup → mutate → restore drill on a disposable workspace
  const workspaceId = `phase2-smoke-${process.pid}`;
  const stamp = `phase2-smoke-${Date.now()}`;
  let restoreOk = false;
  try {
    writeWorkspaceOps(workspaceId, clean);
    const backup = createSessionBackup({
      reason: "phase2-smoke",
      stamp,
      updateLatest: false
    });
    assert(backup.ok, "backup must succeed");
    assert(backup.workspaces.includes(workspaceId), "backup must include smoke workspace");

    // Corrupt live workspace
    writeWorkspaceOps(workspaceId, broken);
    assert(!auditStore(readWorkspaceOps(workspaceId)).ok, "corrupted workspace should fail audit");

    const restored = restoreSessionBackup(stamp);
    assert(restored.ok, "restore must succeed");
    const after = readWorkspaceOps(workspaceId);
    const afterAudit = auditStore(after);
    assert(afterAudit.ok, "restored workspace must be clean");
    const roundTrip = compareStores(clean, after, {
      leftLabel: "original",
      rightLabel: "restored"
    });
    assert(roundTrip.ok, `restore compare failed: ${JSON.stringify(roundTrip.diffs)}`);
    restoreOk = true;
    checks.push("backup-restore-drill");
  } finally {
    removeWorkspace(workspaceId);
    cleanupSession(stamp);
  }
  assert(restoreOk, "restore drill did not complete");

  // 6) Unified demo seed mapping + integrity scan
  assert(
    DEFAULT_OWNER_EMAIL === "contact.haitham@gmail.com" &&
      SECTION_TARGETS.medical.ownerEmail === "contact.haitham@gmail.com" &&
      SECTION_TARGETS.education.ownerEmail === "contact.haitham@yahoo.com",
    "medical→gmail and education→yahoo owner mapping"
  );
  assert(
    SECTION_TARGETS.medical.preferredSlug === "dawybooking" &&
      SECTION_TARGETS.education.preferredSlug === "talaaee-book",
    "preferred slugs for demo workspaces"
  );
  const byPreferred = pickOwnedWorkspaceForSection(
    [
      {
        id: SECTION_TARGETS.education.preferredWorkspaceId,
        name: "طلائع",
        slug: "talaaee-book",
        activity_type: "education"
      },
      { id: "other", name: "أخرى", slug: "other", activity_type: "education" }
    ],
    "education"
  );
  assert(
    byPreferred.target?.id === SECTION_TARGETS.education.preferredWorkspaceId,
    "prefer mapped talaaee workspace id"
  );
  const stamped = applyActivityFields(
    { activityMode: "salon", activityTemplateId: "salon", activityModeLocked: true },
    "medical"
  );
  assert(stamped.activityMode === "medical" && stamped.activityModeLocked === false, "activity stamp");
  checks.push("seed-demo-target-defaults");

  let seedNote = null;
  if (fs.existsSync(CANONICAL_SEED)) {
    const bundle = readDemoSeedBundle({ migrate: false });
    assert(bundle.sections.medical?.store, "unified seed must include medical section");
    assert(bundle.sections.education?.store, "unified seed must include education section");
    const seedAudit = auditStore(bundle.sections.medical.store, { maxOrphansReport: 5 });
    seedNote = {
      orphanCount: seedAudit.orphanCount,
      ok: seedAudit.ok,
      sample: seedAudit.orphans,
      medicalOwner: SECTION_TARGETS.medical.ownerEmail,
      educationOwner: SECTION_TARGETS.education.ownerEmail,
      medicalCounts: bundle.meta.sections.medical,
      educationCounts: bundle.meta.sections.education
    };
    checks.push("seed-demo-scanned");
  }

  const result = {
    ok: true,
    suite: "smoke-ops-integrity",
    checks,
    seedNote,
    tmpHint: os.tmpdir()
  };
  console.log(JSON.stringify(result));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(JSON.stringify({ ok: false, suite: "smoke-ops-integrity", error: String(error.message || error) }));
    process.exit(1);
  }
}
