/**
 * يبني باك أب المستشفى الكامل للاختبارات من أكبر نسخة بيانات شغّالة،
 * يضيف براندينج الوضع الحالي إن وُجد، يُثري المواعيد للتقويم/الحضور،
 * يحفظ البذرة الثابتة، ثم يفردها على مساحة العمل.
 *
 *   npm run hospital:save-full
 *   node scripts/save-full-hospital-backup.js
 *   node scripts/save-full-hospital-backup.js --workspace=local-default
 *   node scripts/save-full-hospital-backup.js --also=workspace_67ac2618-fe29-4cb0-b668-b152b4b98592
 *   node scripts/save-full-hospital-backup.js --days=21 --appointments=180
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
require("./load-env");

const opsWorkspace = require("../opsWorkspace");
const {
  writeCanonicalSeed,
  summarizeStore,
  canonicalSeedPath
} = require("./medical-seed-snapshot");

const rootDir = path.join(__dirname, "..");
const dataDir = path.join(rootDir, "data");
const args = process.argv.slice(2);

function argValue(name, fallback = "") {
  const hit = args.find((a) => a.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : fallback;
}

const targetWorkspace = argValue("--workspace", opsWorkspace.DEFAULT_WORKSPACE_ID || "local-default");
const alsoWorkspaces = String(argValue("--also", ""))
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const appointmentTarget = Math.max(0, Number(argValue("--appointments", "160")) || 160);
const daySpan = Math.max(1, Number(argValue("--days", "21")) || 21);

function createId(prefix) {
  return `${prefix}-${crypto.randomBytes(4).toString("hex")}`;
}

function createCheckInToken() {
  return `chk_${crypto.randomBytes(18).toString("base64url")}`;
}

function loadOpsJson(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return raw && raw.store && typeof raw.store === "object" ? raw.store : raw;
}

function scoreStore(store, filePath, size) {
  const staff = (store.staff || []).length;
  const services = (store.services || []).length;
  const customers = (store.customers || []).length;
  const appointments = (store.appointments || []).length;
  const categories = (store.serviceCategories || []).length;
  const richness = staff + services * 2 + customers * 3 + appointments * 5 + categories;
  return { filePath, size, staff, services, customers, appointments, categories, richness };
}

function findRichestOpsFiles() {
  const found = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === "uploads") continue;
        walk(full);
        continue;
      }
      if (!ent.name.endsWith(".json")) continue;
      if (!/maw3ed-ops|medical-demo-ops|before-reset|local-default-maw3ed-ops/i.test(ent.name)) continue;
      try {
        const size = fs.statSync(full).size;
        if (size < 50_000) continue;
        const store = loadOpsJson(full);
        if (!Array.isArray(store.staff) || store.staff.length < 50) continue;
        found.push(scoreStore(store, full, size));
      } catch {
        /* skip bad json */
      }
    }
  }
  walk(path.join(dataDir, "backups"));
  walk(path.join(dataDir, "seeds"));
  walk(path.join(dataDir, "workspaces"));
  found.sort((a, b) => b.richness - a.richness || b.size - a.size);
  return found;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function todayPlus(days) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function timeSlot(index) {
  const minutes = 8 * 60 + (index % 40) * 15;
  const hh = String(Math.floor(minutes / 60) % 24).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function enrichForTests(store, { appointments = 160, days = 21 } = {}) {
  const next = clone(store);
  const services = (next.services || []).filter((s) => s.active !== false);
  const staff = (next.staff || []).filter((s) => s.active !== false);
  if (!services.length || !staff.length) return next;

  const providersByService = new Map();
  for (const service of services) {
    const ids = Array.isArray(service.providerIds) ? service.providerIds.filter(Boolean) : [];
    const linked = staff.filter((person) => ids.includes(person.id) || (person.serviceIds || []).includes(service.id));
    providersByService.set(service.id, linked.length ? linked : staff.filter((p) => p.serviceCategoryId === service.categoryId));
  }

  // Keep existing customers; add a testing pool if thin.
  if (!Array.isArray(next.customers)) next.customers = [];
  const baseNames = [
    ["أحمد", "كمال"], ["سارة", "حسن"], ["محمود", "علي"], ["نور", "إبراهيم"], ["هبة", "سعيد"],
    ["كريم", "فؤاد"], ["دينا", "منصور"], ["ياسر", "رضا"], ["ريم", "عبدالله"], ["هاني", "زكي"],
    ["سلمى", "كامل"], ["وليد", "عثمان"], ["فاطمة", "الشافعي"], ["طارق", "بدوي"], ["مريم", "نبيل"]
  ];
  while (next.customers.length < 40) {
    const [firstName, lastName] = baseNames[next.customers.length % baseNames.length];
    const n = next.customers.length + 1;
    next.customers.push({
      id: createId("customer"),
      firstName: `${firstName}`,
      lastName: `${lastName}`,
      phone: `0100${String(2000000 + n).slice(-7)}`,
      email: "",
      address: "",
      categoryId: n % 5 === 0 ? "cat-vip" : n % 3 === 0 ? "cat-new" : "cat-regular",
      avatarUrl: ""
    });
  }

  if (!Array.isArray(next.appointments)) next.appointments = [];
  const existingKeys = new Set(
    next.appointments.map((a) => `${a.date}|${a.time}|${a.staffId}|${a.serviceId}`)
  );

  let made = 0;
  let cursor = 0;
  for (let day = 0; day < days && made < appointments; day += 1) {
    const date = todayPlus(day);
    for (let slot = 0; slot < 24 && made < appointments; slot += 1) {
      const service = services[(cursor + slot + day) % services.length];
      const providers = providersByService.get(service.id) || [];
      if (!providers.length) continue;
      const person = providers[(cursor + day) % providers.length];
      const customer = next.customers[(cursor + made) % next.customers.length];
      const time = timeSlot(slot + day);
      const key = `${date}|${time}|${person.id}|${service.id}`;
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);

      const amount = Math.round(Number(service.price ?? service.priceMin ?? 0) || 0);
      const pricingType = String(service.pricingType || "fixed");
      const statusPool = day === 0
        ? ["confirmed", "checked_in", "pending", "confirmed"]
        : day < 2
          ? ["confirmed", "pending", "confirmed"]
          : ["confirmed", "pending"];
      const status = statusPool[made % statusPool.length];
      const appt = {
        id: createId("appt"),
        date,
        time,
        customerId: customer.id,
        customerName: `${customer.firstName} ${customer.lastName}`.trim(),
        staffId: person.id,
        staffName: person.name,
        serviceId: service.id,
        serviceName: service.name,
        categoryId: service.categoryId || person.serviceCategoryId || "",
        durationMinutes: Number(service.durationMinutes || 30),
        paymentMethod: "cash",
        paymentStatus: pricingType === "free" ? "paid" : "unpaid",
        pricingType,
        priceMin: Math.round(Number(service.priceMin ?? amount) || 0),
        priceMax: Math.round(Number(service.priceMax ?? amount) || 0),
        depositAmount: amount,
        amount,
        pricingStatus: pricingType === "on_request" ? "quote_pending" : pricingType === "range" ? "range_deposit" : pricingType === "free" ? "free" : "fixed",
        notes: made % 11 === 0 ? "موعد اختبار تلقائي" : "",
        status,
        checkInToken: createCheckInToken(),
        checkedInAt: status === "checked_in" ? new Date().toISOString() : null,
        checkedInByStaffId: null,
        completedAt: null,
        lineItems: [
          {
            id: "line-primary",
            kind: "primary",
            serviceId: service.id,
            name: service.name,
            amount,
            pricingType,
            priceMin: Math.round(Number(service.priceMin ?? amount) || 0),
            priceMax: Math.round(Number(service.priceMax ?? amount) || 0),
            pricingStatus: pricingType === "on_request" ? "quote_pending" : pricingType === "range" ? "range_deposit" : pricingType === "free" ? "free" : "fixed",
            durationMinutes: Number(service.durationMinutes || 30),
            addedAt: new Date().toISOString(),
            addedByStaffId: null
          }
        ],
        visitLog: status === "checked_in"
          ? [{ id: createId("vlog"), at: new Date().toISOString(), type: "check_in", byStaffId: null, byStaffName: "", meta: { seeded: true } }]
          : [],
        createdAt: new Date().toISOString()
      };
      next.appointments.push(appt);
      made += 1;
      cursor += 1;
    }
  }

  next._seedEnrichment = {
    appointmentsAdded: made,
    customersTotal: next.customers.length,
    daySpan: days,
    at: new Date().toISOString()
  };
  return next;
}

function applyLiveBranding(store) {
  const livePath = path.join(dataDir, "workspaces", targetWorkspace, "maw3ed-ops.json");
  if (!fs.existsSync(livePath)) return store;
  try {
    const live = loadOpsJson(livePath);
    const bp = live.bookingPage || {};
    store.bookingPage = {
      ...(store.bookingPage || {}),
      businessName: bp.businessName || store.bookingPage?.businessName,
      slug: bp.slug || store.bookingPage?.slug,
      logoUrl: bp.logoUrl || store.bookingPage?.logoUrl || "",
      industry: bp.industry || store.bookingPage?.industry,
      email: bp.email ?? store.bookingPage?.email,
      phone: bp.phone ?? store.bookingPage?.phone,
      description: bp.description ?? store.bookingPage?.description,
      country: bp.country ?? store.bookingPage?.country,
      state: bp.state ?? store.bookingPage?.state,
      city: bp.city ?? store.bookingPage?.city,
      street: bp.street ?? store.bookingPage?.street,
      timezone: bp.timezone || store.bookingPage?.timezone || "Africa/Cairo",
      onlineBookingEnabled: bp.onlineBookingEnabled ?? store.bookingPage?.onlineBookingEnabled ?? true,
      showPlatformBranding: bp.showPlatformBranding ?? store.bookingPage?.showPlatformBranding ?? true,
      socialLinks: bp.socialLinks || store.bookingPage?.socialLinks || { facebook: "", instagram: "", website: "" }
    };
    if (live.activityTemplateId) store.activityTemplateId = live.activityTemplateId;
    if (live.activityMode) store.activityMode = live.activityMode;
    if (live.activityModeLocked != null) store.activityModeLocked = live.activityModeLocked;
  } catch (error) {
    console.warn("[hospital:save-full] branding merge skipped:", error.message);
  }
  return store;
}

function writeWorkspaceStore(workspaceId, store) {
  const dir = path.join(dataDir, "workspaces", workspaceId);
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, "maw3ed-ops.json");
  // pre-backup
  if (fs.existsSync(dest)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupDir = path.join(dataDir, "backups");
    fs.mkdirSync(backupDir, { recursive: true });
    fs.copyFileSync(dest, path.join(backupDir, `${workspaceId}-maw3ed-ops-${stamp}.json`));
  }
  fs.writeFileSync(dest, JSON.stringify(store, null, 2), "utf8");
  try {
    if (store.bookingPage?.slug) opsWorkspace.registerSlug(store.bookingPage.slug, workspaceId);
  } catch (error) {
    console.warn(`[hospital:save-full] slug ${workspaceId}:`, error.message);
  }
  return dest;
}

function main() {
  console.log("");
  console.log("══════════════════════════════════════════════════");
  console.log("  حفظ باك أب المستشفى الكامل (أكبر بيانات شغّالة)");
  console.log("  hospital:save-full");
  console.log("══════════════════════════════════════════════════");

  const ranked = findRichestOpsFiles();
  if (!ranked.length) {
    throw new Error("لم يُعثر على نسخة مستشفى كبيرة في data/backups أو data/seeds");
  }

  const best = ranked[0];
  console.log("[source]", path.relative(rootDir, best.filePath));
  console.log("[source counts]", {
    staff: best.staff,
    services: best.services,
    customers: best.customers,
    appointments: best.appointments,
    categories: best.categories,
    sizeKB: Math.round(best.size / 1024)
  });

  let store = clone(loadOpsJson(best.filePath));
  store = applyLiveBranding(store);
  store = enrichForTests(store, { appointments: appointmentTarget, days: daySpan });

  // Drop internal helper before persist? keep in meta only
  const enrichment = store._seedEnrichment || null;
  delete store._seedEnrichment;

  const saved = writeCanonicalSeed(store, {
    source: "save-full-hospital-backup",
    sourceFile: path.relative(rootDir, best.filePath).replace(/\\/g, "/"),
    workspaceId: targetWorkspace,
    businessName: store.bookingPage?.businessName || "",
    slug: store.bookingPage?.slug || "",
    logoUrl: store.bookingPage?.logoUrl || "",
    enrichment
  });

  const targets = [targetWorkspace, ...alsoWorkspaces.filter((id) => id !== targetWorkspace)];
  for (const id of targets) {
    const dest = writeWorkspaceStore(id, store);
    console.log(`[expanded] ${id} → ${path.relative(rootDir, dest)}`);
  }

  const counts = summarizeStore(store);
  console.log("");
  console.log("[canonical]", path.relative(rootDir, canonicalSeedPath()));
  console.log(JSON.stringify({ meta: saved.meta, counts }, null, 2));
  console.log("");
  console.log("تم حفظ الباک أب الكامل وفرد البيانات. حدّث المتصفح (F5).");
  console.log("استرجاع لاحقاً: npm run hospital:restore-full");
  console.log("");
}

try {
  main();
} catch (error) {
  console.error("[hospital:save-full] FAILED:", error.message || error);
  process.exit(1);
}
