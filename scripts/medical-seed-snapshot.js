/**
 * Canonical medical demo seed snapshot — durable backup under data/seeds/.
 * Not wiped by ops:reset / refresh (those only touch data/workspaces/).
 *
 * الاستعادة الفعلية عبر: npm run seed:medical:restore
 * (لا تستخدم npm run migrate / npm run seed لبذرة المستشفى)
 */
const fs = require("fs");
const path = require("path");

const rootDir = path.join(__dirname, "..");
const SEEDS_DIR = path.join(rootDir, "data", "seeds");
const CANONICAL_SEED = path.join(SEEDS_DIR, "medical-demo-ops.json");
const SEED_NAME = "medical-demo";
/** Default hospital-demo owner on the product owner's local machines. */
const DEFAULT_OWNER_EMAIL = "contact.haitham@yahoo.com";

function ensureSeedsDir() {
  fs.mkdirSync(SEEDS_DIR, { recursive: true });
}

function canonicalSeedPath() {
  return CANONICAL_SEED;
}

function readCanonicalSeed() {
  if (!fs.existsSync(CANONICAL_SEED)) {
    const error = new Error(
      `لا توجد نسخة بذرة محفوظة في ${path.relative(rootDir, CANONICAL_SEED)}\nالمسار المتوقع: data/seeds/medical-demo-ops.json — للاستعادة: npm run seed:medical:restore`
    );
    error.code = "SEED_MISSING";
    throw error;
  }
  const raw = JSON.parse(fs.readFileSync(CANONICAL_SEED, "utf8"));
  if (raw && raw.store && typeof raw.store === "object") {
    return { meta: raw.meta || {}, store: raw.store };
  }
  // Legacy: bare ops store object
  return { meta: { name: SEED_NAME, legacy: true }, store: raw };
}

function writeCanonicalSeed(store, extraMeta = {}) {
  ensureSeedsDir();
  const staff = Array.isArray(store.staff) ? store.staff.length : 0;
  const services = Array.isArray(store.services) ? store.services.length : 0;
  const customers = Array.isArray(store.customers) ? store.customers.length : 0;
  const categories = Array.isArray(store.serviceCategories) ? store.serviceCategories.length : 0;
  const payload = {
    meta: {
      name: SEED_NAME,
      savedAt: new Date().toISOString(),
      staff,
      services,
      customers,
      categories,
      ...extraMeta
    },
    store
  };
  fs.writeFileSync(CANONICAL_SEED, JSON.stringify(payload, null, 2), "utf8");
  // Sidecar summary for quick human check without opening the huge JSON
  const summaryPath = path.join(SEEDS_DIR, "medical-demo-summary.json");
  fs.writeFileSync(summaryPath, JSON.stringify(payload.meta, null, 2), "utf8");
  return { path: CANONICAL_SEED, meta: payload.meta, summaryPath };
}

function summarizeStore(store) {
  return {
    staff: Array.isArray(store?.staff) ? store.staff.length : 0,
    services: Array.isArray(store?.services) ? store.services.length : 0,
    customers: Array.isArray(store?.customers) ? store.customers.length : 0,
    categories: Array.isArray(store?.serviceCategories) ? store.serviceCategories.length : 0,
    appointments: Array.isArray(store?.appointments) ? store.appointments.length : 0
  };
}

module.exports = {
  SEED_NAME,
  SEEDS_DIR,
  CANONICAL_SEED,
  DEFAULT_OWNER_EMAIL,
  canonicalSeedPath,
  ensureSeedsDir,
  readCanonicalSeed,
  writeCanonicalSeed,
  summarizeStore
};
