#!/usr/bin/env node
/**
 * Audit workspace ops data integrity (orphans) and migration FK inventory.
 *
 * Usage:
 *   node scripts/audit-ops-integrity.js --fixture
 *   node scripts/audit-ops-integrity.js --store=path/to/maw3ed-ops.json
 *   node scripts/audit-ops-integrity.js --seed=medical
 *   node scripts/audit-ops-integrity.js --workspace=<id>
 *   node scripts/audit-ops-integrity.js --migrations-only
 */
const fs = require("fs");
const path = require("path");
const {
  auditStore,
  auditMigrationSqlInventory,
  REQUIRED_APPOINTMENT_COMPOSITE_FKS,
  DOCUMENTED_SOFT_REFS
} = require("../opsIntegrity");
const { listMigrationFiles, readMigrationFile, MIGRATIONS_DIR } = require("./migrate");

const root = path.join(__dirname, "..");

function parseArgs(argv) {
  const args = {
    fixture: false,
    migrationsOnly: false,
    store: null,
    seed: null,
    workspace: null,
    json: false,
    failOnOrphans: true
  };
  for (const item of argv) {
    if (item === "--fixture") args.fixture = true;
    else if (item === "--migrations-only") args.migrationsOnly = true;
    else if (item === "--json") args.json = true;
    else if (item === "--allow-orphans") args.failOnOrphans = false;
    else if (item.startsWith("--store=")) args.store = item.slice("--store=".length);
    else if (item.startsWith("--seed=")) args.seed = item.slice("--seed=".length);
    else if (item.startsWith("--workspace=")) args.workspace = item.slice("--workspace=".length);
  }
  return args;
}

function loadMigrationSqlMap() {
  const map = {};
  for (const filename of listMigrationFiles(MIGRATIONS_DIR)) {
    map[filename] = readMigrationFile(MIGRATIONS_DIR, filename).sql;
  }
  return map;
}

function buildFixtureStore() {
  return {
    customerCategories: [{ id: "cat-new", name: "جديد", color: "#16ae7c" }],
    customers: [
      {
        id: "customer-1",
        firstName: "علي",
        lastName: "حسن",
        categoryId: "cat-new"
      }
    ],
    staff: [{ id: "staff-1", name: "د. سارة", active: true }],
    serviceCategories: [{ id: "svc-cat-1", name: "عام", sortOrder: 0, enabled: true }],
    services: [
      {
        id: "svc-1",
        categoryId: "svc-cat-1",
        name: "كشف",
        providerIds: ["staff-1"]
      }
    ],
    expenses: [],
    appointments: [
      {
        id: "appt-1",
        customerId: "customer-1",
        staffId: "staff-1",
        serviceId: "svc-1",
        lineItems: [{ id: "line-1", serviceId: "svc-1", name: "كشف" }],
        visits: [{ id: "visit-1", staffId: "staff-1", eventType: "check_in" }]
      }
    ],
    bookingPage: { slug: "phase2-fixture" }
  };
}

function loadStoreFromArgs(args) {
  if (args.fixture) return { label: "fixture", store: buildFixtureStore() };

  if (args.store) {
    const filePath = path.isAbsolute(args.store) ? args.store : path.join(root, args.store);
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return { label: filePath, store: raw.store || raw };
  }

  if (args.seed === "medical") {
    const filePath = path.join(root, "data", "seeds", "medical-demo-ops.json");
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return { label: "seed:medical", store: raw.store || raw };
  }

  if (args.workspace) {
    const filePath = path.join(root, "data", "workspaces", args.workspace, "maw3ed-ops.json");
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return { label: `workspace:${args.workspace}`, store: raw };
  }

  return null;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const migrationInventory = auditMigrationSqlInventory(loadMigrationSqlMap());

  if (args.migrationsOnly) {
    const result = {
      ok: migrationInventory.ok,
      migrationInventory,
      requiredFks: REQUIRED_APPOINTMENT_COMPOSITE_FKS.map((fk) => fk.constraint),
      softRefs: DOCUMENTED_SOFT_REFS
    };
    if (args.json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(
        `[MIGRATIONS] ok=${result.ok} missingRequired=${migrationInventory.missingRequired.length}`
      );
      if (!result.ok) {
        console.log("missingPresent:", migrationInventory.missingPresent);
        console.log("missingRequired:", migrationInventory.missingRequired);
      }
    }
    process.exit(result.ok ? 0 : 1);
  }

  const loaded = loadStoreFromArgs(args);
  if (!loaded) {
    console.error(`Usage:
  node scripts/audit-ops-integrity.js --fixture
  node scripts/audit-ops-integrity.js --store=<path>
  node scripts/audit-ops-integrity.js --seed=medical
  node scripts/audit-ops-integrity.js --workspace=<id>
  node scripts/audit-ops-integrity.js --migrations-only`);
    process.exit(1);
  }

  const storeAudit = auditStore(loaded.store);
  const ok = migrationInventory.ok && (storeAudit.ok || !args.failOnOrphans);
  const result = {
    ok,
    source: loaded.label,
    storeAudit,
    migrationInventory,
    softRefs: DOCUMENTED_SOFT_REFS
  };

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(
      `[AUDIT] source=${loaded.label} orphans=${storeAudit.orphanCount} migrationsOk=${migrationInventory.ok}`
    );
    if (storeAudit.orphanCount) {
      for (const orphan of storeAudit.orphans.slice(0, 10)) {
        console.log(
          `  - ${orphan.relation}: child=${orphan.childId} missing=${orphan.missingParentId}`
        );
      }
    }
  }

  process.exit(ok ? 0 : 1);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[ERROR] ${error.message || error}`);
    process.exit(1);
  }
}

module.exports = { buildFixtureStore, loadMigrationSqlMap };
