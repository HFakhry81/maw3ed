/**
 * توافق خلفي مع المسارات القديمة — البذرة الموحدة الآن:
 *   data/seeds/maw3ed-demo-ops.json
 * عبر scripts/demo-seed-store.js
 */
"use strict";

const {
  SEEDS_DIR,
  CANONICAL_SEED,
  LEGACY_MEDICAL_SEED,
  SECTION_TARGETS,
  summarizeStore,
  readDemoSeedBundle,
  writeDemoSeedBundle,
  getSectionStore,
  setSectionStore,
  canonicalSeedPath,
  ensureSeedsDir
} = require("./demo-seed-store");

const SEED_NAME = "medical-demo";
/** @deprecated use SECTION_TARGETS.medical.ownerEmail — kept for smoke/compat */
const DEFAULT_OWNER_EMAIL = SECTION_TARGETS.medical.ownerEmail;

function readCanonicalSeed() {
  const bundle = readDemoSeedBundle({ migrate: true });
  const store = getSectionStore(bundle, "medical");
  return {
    meta: {
      name: SEED_NAME,
      ...(bundle.meta?.sections?.medical || {}),
      unified: true,
      canonical: "maw3ed-demo-ops.json"
    },
    store
  };
}

function writeCanonicalSeed(store, extraMeta = {}) {
  let bundle;
  try {
    bundle = readDemoSeedBundle({ migrate: true });
  } catch (error) {
    if (error.code !== "SEED_MISSING") throw error;
    bundle = { sections: {} };
  }
  bundle = setSectionStore(bundle, "medical", store, { source: extraMeta.source || "medical-save" });
  const written = writeDemoSeedBundle(bundle, extraMeta);
  return {
    path: written.path,
    meta: { name: SEED_NAME, ...written.meta.sections.medical, ...extraMeta },
    summaryPath: written.summaryPath
  };
}

module.exports = {
  SEED_NAME,
  SEEDS_DIR,
  CANONICAL_SEED,
  LEGACY_MEDICAL_SEED,
  DEFAULT_OWNER_EMAIL,
  canonicalSeedPath,
  ensureSeedsDir,
  readCanonicalSeed,
  writeCanonicalSeed,
  summarizeStore
};
