const fs = require("fs");
const path = require("path");
const { AsyncLocalStorage } = require("async_hooks");

const DEFAULT_WORKSPACE_ID = "local-default";
const rootDir = __dirname;
const workspacesRoot = path.join(rootDir, "data", "workspaces");
const legacyOpsPath = path.join(rootDir, "data", "maw3ed-ops.json");
const legacyHoldsPath = path.join(rootDir, "data", "maw3ed-holds.json");
const slugIndexPath = path.join(rootDir, "data", "slug-index.json");

const als = new AsyncLocalStorage();
const cache = new Map();

function sanitizeWorkspaceId(raw) {
  const id = String(raw || DEFAULT_WORKSPACE_ID).trim();
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) return DEFAULT_WORKSPACE_ID;
  return id;
}

function workspaceDir(workspaceId) {
  return path.join(workspacesRoot, sanitizeWorkspaceId(workspaceId));
}

function opsPath(workspaceId) {
  return path.join(workspaceDir(workspaceId), "maw3ed-ops.json");
}

function holdsPath(workspaceId) {
  return path.join(workspaceDir(workspaceId), "maw3ed-holds.json");
}

function uploadsDir(workspaceId) {
  return path.join(workspaceDir(workspaceId), "uploads");
}

function loadSlugIndex() {
  try {
    if (!fs.existsSync(slugIndexPath)) return {};
    const data = JSON.parse(fs.readFileSync(slugIndexPath, "utf8"));
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

function saveSlugIndex(index) {
  fs.mkdirSync(path.dirname(slugIndexPath), { recursive: true });
  fs.writeFileSync(slugIndexPath, JSON.stringify(index, null, 2), "utf8");
}

function registerSlug(slug, workspaceId) {
  const clean = String(slug || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-");
  if (!clean) return;
  const index = loadSlugIndex();
  const owner = index[clean];
  const id = sanitizeWorkspaceId(workspaceId);
  if (owner && owner !== id) {
    const error = new Error("هذا الرابط (slug) مستخدم في مساحة عمل أخرى");
    error.statusCode = 409;
    throw error;
  }
  index[clean] = id;
  saveSlugIndex(index);
  return clean;
}

function unregisterSlug(slug, workspaceId) {
  const clean = String(slug || "").trim().toLowerCase();
  if (!clean) return;
  const index = loadSlugIndex();
  if (index[clean] === sanitizeWorkspaceId(workspaceId)) {
    delete index[clean];
    saveSlugIndex(index);
  }
}

function resolveWorkspaceIdBySlug(slug) {
  const clean = String(slug || "").trim().toLowerCase();
  if (!clean) return null;
  const index = loadSlugIndex();
  if (index[clean]) return index[clean];

  // Rebuild index by scanning workspace folders (recovery)
  try {
    if (!fs.existsSync(workspacesRoot)) return null;
    for (const entry of fs.readdirSync(workspacesRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const file = opsPath(entry.name);
      if (!fs.existsSync(file)) continue;
      try {
        const data = JSON.parse(fs.readFileSync(file, "utf8"));
        const pageSlug = String(data?.bookingPage?.slug || "").toLowerCase();
        if (pageSlug) {
          index[pageSlug] = entry.name;
          if (pageSlug === clean) {
            saveSlugIndex(index);
            return entry.name;
          }
        }
      } catch {
        /* skip corrupt */
      }
    }
    saveSlugIndex(index);
  } catch {
    /* ignore */
  }
  return index[clean] || null;
}

function loadHoldsMap(filePath) {
  const map = new Map();
  try {
    if (!fs.existsSync(filePath)) return map;
    const rows = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!Array.isArray(rows)) return map;
    const now = Date.now();
    for (const row of rows) {
      if (row?.key && Number(row.expiresAt) > now) map.set(row.key, Number(row.expiresAt));
    }
  } catch {
    /* empty */
  }
  return map;
}

function saveHoldsMap(filePath, map) {
  const now = Date.now();
  const rows = [...map.entries()]
    .filter(([, expiresAt]) => expiresAt > now)
    .map(([key, expiresAt]) => ({ key, expiresAt }));
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(rows, null, 2), "utf8");
}

function migrateLegacyIfNeeded(defaultStoreFactory) {
  if (!fs.existsSync(legacyOpsPath)) return;
  const targetId = DEFAULT_WORKSPACE_ID;
  const targetOps = opsPath(targetId);
  if (fs.existsSync(targetOps)) return;
  fs.mkdirSync(workspaceDir(targetId), { recursive: true });
  fs.renameSync(legacyOpsPath, targetOps);
  if (fs.existsSync(legacyHoldsPath) && !fs.existsSync(holdsPath(targetId))) {
    fs.renameSync(legacyHoldsPath, holdsPath(targetId));
  }
  try {
    const data = JSON.parse(fs.readFileSync(targetOps, "utf8"));
    if (data?.bookingPage?.slug) registerSlug(data.bookingPage.slug, targetId);
  } catch {
    const seed = defaultStoreFactory();
    fs.writeFileSync(targetOps, JSON.stringify(seed, null, 2));
    registerSlug(seed.bookingPage.slug, targetId);
  }
}

function ensureCache(workspaceId, defaultStoreFactory) {
  const id = sanitizeWorkspaceId(workspaceId);
  if (cache.has(id)) return cache.get(id);

  migrateLegacyIfNeeded(defaultStoreFactory);

  const file = opsPath(id);
  let data;
  if (!fs.existsSync(file)) {
    data = defaultStoreFactory();
    if (id !== DEFAULT_WORKSPACE_ID) {
      data.bookingPage = {
        ...data.bookingPage,
        slug: `${data.bookingPage.slug}-${id.slice(-6).toLowerCase()}`,
        businessName: data.bookingPage.businessName || "موعد"
      };
      data.customers = [];
      data.appointments = [];
      data.expenses = [];
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    registerSlug(data.bookingPage.slug, id);
  } else {
    data = { ...defaultStoreFactory(), ...JSON.parse(fs.readFileSync(file, "utf8")) };
    if (data?.bookingPage?.slug) {
      try {
        registerSlug(data.bookingPage.slug, id);
      } catch {
        /* already owned by this workspace or conflict logged on write */
      }
    }
  }

  const ctx = {
    workspaceId: id,
    data,
    holds: loadHoldsMap(holdsPath(id)),
    opsFile: file,
    holdsFile: holdsPath(id)
  };
  cache.set(id, ctx);
  return ctx;
}

function getContext(defaultStoreFactory) {
  const fromAls = als.getStore();
  if (fromAls?.workspaceId) {
    return ensureCache(fromAls.workspaceId, defaultStoreFactory);
  }
  return ensureCache(DEFAULT_WORKSPACE_ID, defaultStoreFactory);
}

function persistContext(ctx) {
  fs.mkdirSync(path.dirname(ctx.opsFile), { recursive: true });
  fs.writeFileSync(ctx.opsFile, JSON.stringify(ctx.data, null, 2));
}

function persistHoldsContext(ctx) {
  saveHoldsMap(ctx.holdsFile, ctx.holds);
}

function runWithWorkspace(workspaceId, defaultStoreFactory, fn) {
  const id = sanitizeWorkspaceId(workspaceId);
  ensureCache(id, defaultStoreFactory);
  return als.run({ workspaceId: id }, fn);
}

async function runWithWorkspaceAsync(workspaceId, defaultStoreFactory, fn) {
  const id = sanitizeWorkspaceId(workspaceId);
  ensureCache(id, defaultStoreFactory);
  return als.run({ workspaceId: id }, fn);
}

function seedWorkspace(workspaceId, { slug, businessName, activityType, locale } = {}, defaultStoreFactory) {
  const id = sanitizeWorkspaceId(workspaceId);
  cache.delete(id);
  const data = defaultStoreFactory();
  data.customers = [];
  data.appointments = [];
  data.expenses = [];
  if (businessName) data.bookingPage.businessName = businessName;

  const activityTemplates = require("./activityTemplatesCatalog");
  const resolvedType = activityTemplates.resolveTemplateId(activityType || "medical");
  const lang = activityTemplates.normalizeLocale(locale || "ar");
  activityTemplates.applyTemplateToStoreData(data, resolvedType, lang, { replaceStaff: true });
  data.activityModeLocked = false;
  if (data.bookingPage) {
    data.bookingPage.locale = lang;
    if (businessName) data.bookingPage.businessName = businessName;
  }

  const desiredSlug = String(slug || data.bookingPage.slug)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-");
  data.bookingPage.slug = registerSlug(desiredSlug, id) || desiredSlug;
  fs.mkdirSync(workspaceDir(id), { recursive: true });
  fs.writeFileSync(opsPath(id), JSON.stringify(data, null, 2));
  fs.writeFileSync(holdsPath(id), "[]");
  const ctx = {
    workspaceId: id,
    data,
    holds: new Map(),
    opsFile: opsPath(id),
    holdsFile: holdsPath(id)
  };
  cache.set(id, ctx);
  return data.bookingPage;
}

function currentWorkspaceId(defaultStoreFactory) {
  return getContext(defaultStoreFactory).workspaceId;
}

function replaceStoreData(ctx, next) {
  ctx.data = next;
  persistContext(ctx);
}

module.exports = {
  DEFAULT_WORKSPACE_ID,
  sanitizeWorkspaceId,
  workspaceDir,
  opsPath,
  holdsPath,
  uploadsDir,
  registerSlug,
  unregisterSlug,
  resolveWorkspaceIdBySlug,
  ensureCache,
  getContext,
  persistContext,
  persistHoldsContext,
  runWithWorkspace,
  runWithWorkspaceAsync,
  seedWorkspace,
  currentWorkspaceId,
  replaceStoreData,
  loadSlugIndex
};
