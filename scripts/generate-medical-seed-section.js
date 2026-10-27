#!/usr/bin/env node
/**
 * نادرة: توليد كتالوج المستشفى داخل قسم medical من البذرة الموحدة.
 * Rare: regenerate the hospital catalog into the unified seed's medical section.
 *
 * يكتب إلى: data/seeds/maw3ed-demo-ops.json  (لا يستبدل قسم education)
 * Writes into: data/seeds/maw3ed-demo-ops.json (keeps education section)
 *
 * الاستعادة اليومية / Daily restore-save:
 *   npm run seed:demo:restore
 *   npm run seed:demo:save -- --section=medical
 *
 * الهدف / Target: contact.haitham@gmail.com / dawybooking
 * Platform admin: contact.fakhry@gmail.com (no workspace)
 *
 * Usage:
 *   node scripts/generate-medical-seed-section.js
 *   node scripts/generate-medical-seed-section.js --workspace=<id>
 *   node scripts/generate-medical-seed-section.js --owner-email=contact.haitham@gmail.com
 *
 * --restore / --save مرفوضان هنا — استعمل seed:demo:* بدلاً منهما.
 */
const fs = require("fs");
const path = require("path");
require("./load-env");

const { query, pool, databaseConfigured } = require("../db");
const ops = require("../opsStore");
const opsWorkspace = require("../opsWorkspace");
const {
  SECTION_TARGETS,
  summarizeStore,
  canonicalSeedPath,
  readDemoSeedBundle,
  writeDemoSeedBundle,
  getSectionStore,
  setSectionStore
} = require("./demo-seed-store");
const DEFAULT_OWNER_EMAIL = SECTION_TARGETS.medical.ownerEmail;
const { printBanner, printDemoMap, logInfo, logFail } = require("./demo-cli");

function readCanonicalSeed() {
  const bundle = readDemoSeedBundle();
  return {
    meta: {
      name: "medical-demo",
      ...(bundle.meta?.sections?.medical || {}),
      unified: true,
      canonical: "maw3ed-demo-ops.json"
    },
    store: getSectionStore(bundle, "medical")
  };
}

function writeCanonicalSeed(store, extraMeta = {}) {
  let bundle;
  try {
    bundle = readDemoSeedBundle();
  } catch (error) {
    if (error.code !== "SEED_MISSING") throw error;
    bundle = { sections: {} };
  }
  bundle = setSectionStore(bundle, "medical", store, { source: extraMeta.source || "medical-generate" });
  const written = writeDemoSeedBundle(bundle, extraMeta);
  return {
    path: written.path,
    meta: { name: "medical-demo", ...written.meta.sections.medical, ...extraMeta },
    summaryPath: written.summaryPath
  };
}

const args = process.argv.slice(2);
const keep = args.includes("--keep");
const noBackup = args.includes("--no-backup");
const doRestore = args.includes("--restore");
const doSave = args.includes("--save");
const doReplace = args.includes("--replace");
const keepActivity = args.includes("--keep-activity");
const wsArg = args.find((a) => a.startsWith("--workspace="));
const ownerArg = args.find((a) => a.startsWith("--owner-email="));
const requestedWorkspaceId = wsArg ? wsArg.slice("--workspace=".length).trim() : "";
const ownerEmail = ownerArg ? ownerArg.slice("--owner-email=".length).trim() : DEFAULT_OWNER_EMAIL;
let workspaceId = requestedWorkspaceId || null;
let workspaceTarget = null;

function isMedicalActivity(activityType) {
  const activityTemplates = require("../activityTemplatesCatalog");
  return activityTemplates.resolveTemplateId(activityType || "") === "medical";
}

function mapWorkspaceRow(row, extra = {}) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    activityType: row.activity_type,
    locale: row.locale,
    needsMedicalConversion: !isMedicalActivity(row.activity_type),
    ...extra
  };
}

/**
 * Pick one owned workspace: prefer medical; else unique owned workspace.
 * Exported for smoke coverage of selection rules.
 */
function pickOwnedWorkspace(ownedWorkspaces) {
  const rows = Array.isArray(ownedWorkspaces) ? ownedWorkspaces : [];
  if (!rows.length) return { target: null, reason: "none" };
  const medical = rows.filter((workspace) => isMedicalActivity(workspace.activity_type));
  if (medical.length === 1) return { target: medical[0], reason: "unique_medical" };
  if (medical.length > 1) return { target: null, reason: "ambiguous_medical", candidates: medical };
  if (rows.length === 1) return { target: rows[0], reason: "unique_owned" };
  return { target: null, reason: "ambiguous_owned", candidates: rows };
}

async function resolveWorkspaceTarget() {
  if (requestedWorkspaceId) {
    const safeId = opsWorkspace.sanitizeWorkspaceId(requestedWorkspaceId);
    if (safeId !== requestedWorkspaceId) {
      throw new Error(`معرّف مساحة العمل غير صالح: ${requestedWorkspaceId}`);
    }
    if (!databaseConfigured) {
      return { id: safeId, needsMedicalConversion: false, explicit: true };
    }

    const result = await query(
      `SELECT id, name, slug, activity_type, locale
       FROM workspaces
       WHERE id = $1 AND status = 'active'`,
      [safeId]
    );
    const target = result.rows[0];
    if (!target) {
      throw new Error(`مساحة العمل غير موجودة أو غير نشطة: ${safeId}`);
    }
    return mapWorkspaceRow(target, { explicit: true });
  }

  if (!databaseConfigured) {
    throw new Error(
      "تعذّر تحديد مساحة العمل المالكة للبذرة: PostgreSQL غير مفعّل. اضبط MAW3ED_STORAGE=postgres وDATABASE_URL أو مرّر --workspace=<id> صراحةً."
    );
  }
  if (!ownerEmail) {
    throw new Error("البريد الإلكتروني للمالك مطلوب عبر --owner-email=<email>");
  }

  const result = await query(
    `SELECT DISTINCT w.id, w.name, w.slug, w.activity_type, w.locale, w.created_at
     FROM app_users u
     JOIN workspaces w ON w.owner_user_id = u.id AND w.status = 'active'
     JOIN workspace_members wm
       ON wm.workspace_id = w.id AND wm.user_id = u.id AND wm.role = 'owner'
     WHERE LOWER(BTRIM(u.email)) = LOWER(BTRIM($1))
     ORDER BY w.created_at ASC`,
    [ownerEmail]
  );
  const ownedWorkspaces = result.rows;
  const picked = pickOwnedWorkspace(ownedWorkspaces);

  if (!picked.target) {
    const list = (picked.candidates || ownedWorkspaces)
      .map((workspace) => `${workspace.name} [${workspace.activity_type}] (${workspace.id})`)
      .join(", ");
    const available = ownedWorkspaces.length ? list || "—" : "لا توجد مساحة نشطة مملوكة لهذا الحساب";
    throw new Error(
      `تعذّر تحديد مساحة عمل فريدة للحساب ${ownerEmail} (سبب: ${picked.reason}). المساحات: ${available}. ` +
        "مرّر --workspace=<id> لتحديد المساحة المطلوبة."
    );
  }

  return mapWorkspaceRow(picked.target, { ownerEmail, pickReason: picked.reason });
}

/**
 * Convert workspace activity to medical so hospital ops seed can apply.
 * Preserves ownership and slug; updates workspaces / organizations / ops profile when present.
 */
async function ensureWorkspaceAcceptsMedicalOps(target) {
  if (!target || keepActivity) return { converted: false, skipped: Boolean(keepActivity) };
  if (!target.needsMedicalConversion && isMedicalActivity(target.activityType)) {
    return { converted: false };
  }
  if (!databaseConfigured) {
    console.warn(
      "[gen-medical] PostgreSQL غير مفعّل — لن يُحدَّث activity_type في جدول workspaces؛ ستُضبط حقول النشاط داخل ملف ops فقط."
    );
    target.activityType = "medical";
    target.needsMedicalConversion = false;
    return { converted: true, persistence: "ops-only" };
  }

  const id = target.id;
  console.log(
    `[gen-medical] تحويل نشاط المساحة إلى medical (كان: ${target.activityType || "unknown"}) مع الإبقاء على المالك والـ slug=${target.slug || ""}`
  );
  await query(
    `UPDATE workspaces
     SET activity_type = 'medical', updated_at = NOW()
     WHERE id = $1`,
    [id]
  );
  await query(
    `UPDATE organizations
     SET activity_type = 'medical'
     WHERE workspace_id = $1`,
    [id]
  );
  await query(
    `UPDATE workspace_ops_profiles
     SET activity_mode = 'medical',
         activity_template_id = 'medical',
         activity_mode_locked = FALSE,
         updated_at = NOW()
     WHERE workspace_id = $1`,
    [id]
  );
  target.activityType = "medical";
  target.needsMedicalConversion = false;
  return { converted: true, persistence: "postgres" };
}

function applyMedicalActivityFields(store) {
  if (!store || typeof store !== "object") return store;
  store.activityMode = "medical";
  store.activityTemplateId = "medical";
  // Unlock so restored medical catalog is not blocked by a prior education lock.
  store.activityModeLocked = false;
  return store;
}

const SHIFTS = [
  { id: "morning", label: "صباحية", opensAt: "08:00", closesAt: "16:00", overnight: false },
  { id: "evening", label: "مسائية", opensAt: "16:00", closesAt: "00:00", overnight: true },
  { id: "night", label: "ليلية", opensAt: "00:00", closesAt: "08:00", overnight: false }
];

const FIRST_NAMES = [
  "أحمد", "محمد", "محمود", "خالد", "يوسف", "عمر", "كريم", "حسن", "علي", "طارق",
  "سارة", "نور", "مريم", "هدى", "فاطمة", "دينا", "ياسمين", "رانيا", "سلمى", "هبة",
  "إبراهيم", "مصطفى", "وليد", "سامي", "نادر", "هاني", "إياد", "باسم", "رامي", "زياد"
];

const LAST_NAMES = [
  "حسن", "علي", "إبراهيم", "عبدالله", "محمود", "فؤاد", "كامل", "سعيد", "نبيل", "رضا",
  "الشافعي", "الجمل", "المصري", "القاضي", "سليمان", "منصور", "فهمي", "عثمان", "زكي", "بدوي"
];

const SERVICE_COLORS = ["#1a6deb", "#0d4bb8", "#16ae7c", "#a8c73a", "#f5a623", "#e85d04", "#5b4a9e", "#db2777", "#0891b2", "#64748b"];

/** Specialty catalogs (base 10; padded to 15 in catalogFor). */
const SERVICES_BY_DEPT = {
  "العيادات الخارجية": [
    "كشف عام", "متابعة دورية", "استشارة طبية", "تحويل تخصصي", "فحص ما قبل العمليات",
    "شهادة طبية", "تجديد روشتة", "قياس ضغط وسكر", "تقييم أولي", "استشارة عن بُعد"
  ],
  "الباطنية": [
    "كشف باطني استشاري", "كشف باطني أخصائي", "كشف باطني عام", "متابعة سكري", "متابعة ضغط",
    "فحص كبد", "فحص معدة", "استشارة غدد صماء", "تحليل أعراض مزمنة", "مراجعة تحاليل"
  ],
  "الأطفال": [
    "كشف أطفال استشاري", "كشف أطفال أخصائي", "كشف أطفال عام", "تطعيم روتيني", "متابعة نمو",
    "استشارة رضاعة", "كشف حرارة", "متابعة حساسية", "فحص مدرسي", "استشارة تغذية أطفال"
  ],
  "النساء والولادة": [
    "كشف نساء استشاري", "كشف نساء أخصائي", "متابعة حمل", "سونار حمل", "استشارة خصوبة",
    "فحص ما قبل الولادة", "متابعة ما بعد الولادة", "فحص دوري نسائي", "استشارة تنظيم أسرة", "كشف طوارئ نساء"
  ],
  "الأسنان": [
    "كشف أسنان", "حشو عادي", "حشو عصب", "تنظيف جير", "خلع سن",
    "تركيب طربوش", "تقويم استشارة", "تبييض أسنان", "علاج لثة", "أشعة أسنان"
  ],
  "الأشعة": [
    "أشعة سينية", "سونار بطن", "سونار حمل", "أشعة مقطعية استشارة", "رنين مغناطيسي استشارة",
    "ماموجرام", "دوبلر أوعية", "أشعة صدر", "أشعة عظام", "قراءة فيلم"
  ],
  "المختبر": [
    "صورة دم كاملة", "سكر صائم", "وظائف كلى", "وظائف كبد", "دهون الدم",
    "تحليل بول", "مزرعة بكتيريا", "هرمونات درقية", "فيتامين د", "تحليل حمل"
  ],
  "الجلدية": [
    "كشف جلدية استشاري", "كشف جلدية أخصائي", "كشف جلدية عام", "علاج حب الشباب", "إزالة زوائد",
    "ليزر تجميلي استشارة", "متابعة إكزيما", "فحص شامات", "حقن موضعي", "متابعة صدفية"
  ],
  "العيون": [
    "كشف عيون استشاري", "كشف عيون أخصائي", "قياس نظر", "فحص قاع عين", "قياس ضغط عين",
    "استشارة مياه بيضاء", "متابعة جلوكوما", "كشف حساسية عين", "فحص أطفال عيون", "عدسات لاصقة استشارة"
  ],
  "القلب": [
    "كشف قلب استشاري", "كشف قلب أخصائي", "كشف قلب عام", "رسم قلب", "إيكو قلب",
    "متابعة ضغط قلبي", "استشارة قسطرة", "هولتر 24 ساعة", "اختبار جهد", "متابعة بعد قسطرة"
  ],
  "العظام": [
    "كشف عظام استشاري", "كشف عظام أخصائي", "كشف عظام عام", "متابعة كسر", "حقن مفصلي",
    "استشارة عمود فقري", "كشف ركبة", "كشف كتف", "جبيرة/تثبيت", "متابعة بعد جراحة"
  ],
  "الأنف والأذن": [
    "كشف أنف وأذن استشاري", "كشف أنف وأذن أخصائي", "كشف أنف وأذن عام", "غسيل أذن", "منظار أنف",
    "اختبار سمع", "متابعة حساسية", "استشارة لوز", "دوار/توازن", "متابعة طنين"
  ],
  "الطوارئ": [
    "تقييم طوارئ", "إسعاف أولي", "جرح/خياطة", "مغص حاد", "ضيق تنفس",
    "ارتفاع حرارة طارئ", "إصابة رياضية", "تسمم اشتباه", "ألم صدري تقييم", "ملاحظة قصيرة"
  ],
  "العلاج الطبيعي": [
    "تقييم علاج طبيعي", "جلسة عمود فقري", "جلسة ركبة", "جلسة كتف", "جلسة بعد جراحة",
    "علاج تمزق عضلي", "إعادة تأهيل مشي", "موجات فوق صوتية علاجية", "تمارين منزلية", "جلسة أطفال"
  ],
  "الصيدلية": [
    "صرف وصفة", "استشارة دوائية", "مراجعة تفاعلات", "تثقيف مريض", "صرف مزمن",
    "تحضير مركّب", "متابعة التزام", "صرف طوارئ", "استبدال دواء", "استشارة فيتامينات"
  ]
};

/** Clinic doctors + clinic nursing: 08:00–22:00 split into two shifts. */
const CLINIC_SHIFTS = [
  { id: "am", label: "08–15", opensAt: "08:00", closesAt: "15:00", overnight: false },
  { id: "pm", label: "15–22", opensAt: "15:00", closesAt: "22:00", overnight: false }
];
const ER_SHIFTS = [
  { id: "day", label: "نهارية", opensAt: "08:00", closesAt: "20:00", overnight: false },
  { id: "night", label: "ليلية", opensAt: "20:00", closesAt: "08:00", overnight: true }
];
/** On-duty minimums. Headcount is minimum + 1 so a weekly day off never empties the shift. */
const RECEPTION_PLAN = [
  { shift: SHIFTS[0], minOnDuty: 2 },
  { shift: SHIFTS[1], minOnDuty: 2 },
  { shift: SHIFTS[2], minOnDuty: 1 }
];
const DAY_NAMES = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

function isEmergency(name) {
  return /طوارئ/.test(String(name || ""));
}

function weekHoursForShift(shift, offWeekday = -1) {
  return [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    isOpen: weekday !== offWeekday,
    opensAt: shift.opensAt,
    closesAt: shift.closesAt,
    overnight: Boolean(shift.overnight),
    breakEnabled: false,
    breakStartsAt: "13:00",
    breakEndsAt: "14:00"
  }));
}

function offDaysForHeadcount(minOnDuty, seed) {
  const headcount = minOnDuty + 1;
  const offs = [];
  for (let i = 0; i < headcount; i += 1) {
    offs.push((seed + i * 3) % 7);
  }
  return offs;
}

function catalogFor(specialty) {
  const base = [...(SERVICES_BY_DEPT[specialty] || [])];
  const extras = [
    `متابعة استشاري ${specialty}`,
    `متابعة أخصائي ${specialty}`,
    `كشف ممارس عام ${specialty}`,
    `توعية مجانية ${specialty}`,
    `تقدير عند الطلب ${specialty}`
  ];
  while (base.length < 15) base.push(extras[base.length % extras.length] || `خدمة ${specialty} ${base.length + 1}`);
  return base.slice(0, 15);
}

function pricingFor(name, index) {
  if (/مجاني/.test(name)) return { pricingType: "free", price: 0, priceMin: 0, priceMax: 0 };
  if (/عند الطلب/.test(name)) return { pricingType: "on_request", price: 0, priceMin: 0, priceMax: 0 };
  if (/قسطرة|ليزر|هولتر|نطاق/.test(name)) {
    const priceMin = 250 + (index % 3) * 50;
    return { pricingType: "range", price: priceMin, priceMin, priceMax: priceMin + 450 };
  }
  let price = 200 + index * 20;
  if (/استشاري/.test(name)) price = 700 + (index % 3) * 50;
  else if (/أخصائي|اخصائي/.test(name)) price = 420 + (index % 3) * 30;
  else if (/عام|ممارس/.test(name)) price = 180 + (index % 3) * 20;
  else if (/تحليل|أشعة|صورة دم|سكر|وظائف|سونار|رسم/.test(name)) price = 90 + index * 12;
  else if (/صرف|صيدل|فيتامين/.test(name)) price = 50 + index * 8;
  return { pricingType: "fixed", price, priceMin: price, priceMax: price };
}

function providerIdsFor(name, team) {
  const allDoctors = [...team.consultants, ...team.specialists, ...team.gps];
  if (/استشاري/.test(name) && team.consultants.length) return team.consultants.map((p) => p.id);
  if (/أخصائي|اخصائي/.test(name) && team.specialists.length) return team.specialists.map((p) => p.id);
  if (/ممارس|كشف عام|عام /.test(name) && team.gps.length) return team.gps.map((p) => p.id);
  if (/تمريض|تطعيم|غسيل|قياس ضغط|صرف وصفة|توعية/.test(name) && team.nurses.length) {
    return [...new Set([...team.nurses, ...team.gps].map((p) => p.id))];
  }
  return allDoctors.map((p) => p.id);
}

function pickName(index) {
  const first = FIRST_NAMES[index % FIRST_NAMES.length];
  const last = LAST_NAMES[Math.floor(index / FIRST_NAMES.length) % LAST_NAMES.length];
  return { firstName: first, lastName: last, name: `${first} ${last}` };
}

function phoneFor(index) {
  const base = 100000000 + ((index * 7919) % 899999999);
  return `01${String(base).slice(0, 9)}`;
}

function backupOpsFile(wsId) {
  const src = path.join(__dirname, "..", "data", "workspaces", wsId, "maw3ed-ops.json");
  if (!fs.existsSync(src)) return null;
  const backupDir = path.join(__dirname, "..", "data", "backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = path.join(backupDir, `${wsId}-maw3ed-ops-${stamp}.json`);
  fs.copyFileSync(src, dest);
  return dest;
}

function doctorTitle(rank, specialty) {
  if (rank === "consultant") return `طبيب استشاري ${specialty}`;
  if (rank === "specialist") return `طبيب أخصائي ${specialty}`;
  return `طبيب ممارس عام — ${specialty}`;
}

function cloneStore(store) {
  return JSON.parse(JSON.stringify(store));
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function mergeSeedObject(seedObject, currentObject) {
  const merged = { ...seedObject };
  for (const [key, currentValue] of Object.entries(currentObject)) {
    const seedValue = seedObject[key];
    if (isRecord(seedValue) && isRecord(currentValue)) {
      merged[key] = mergeSeedObject(seedValue, currentValue);
    } else {
      merged[key] = currentValue;
    }
  }
  return merged;
}

function seedArrayKey(value) {
  if (isRecord(value)) {
    for (const key of ["id", "weekday", "date", "key"]) {
      if (value[key] !== undefined && value[key] !== null) return `${key}:${value[key]}`;
    }
    return `json:${JSON.stringify(value)}`;
  }
  return `${typeof value}:${String(value)}`;
}

function mergeSeedArray(seedArray, currentArray) {
  const merged = new Map();
  for (const item of seedArray) merged.set(seedArrayKey(item), cloneStore(item));
  for (const item of currentArray) {
    const key = seedArrayKey(item);
    const seedItem = merged.get(key);
    merged.set(key, isRecord(seedItem) && isRecord(item) ? { ...seedItem, ...item } : cloneStore(item));
  }
  return [...merged.values()];
}

function mergeSeedStore(currentStore, seedStore) {
  const merged = cloneStore(seedStore);
  for (const [key, currentValue] of Object.entries(currentStore)) {
    const seedValue = seedStore[key];
    if (Array.isArray(seedValue) && Array.isArray(currentValue)) {
      merged[key] = mergeSeedArray(seedValue, currentValue);
    } else if (isRecord(seedValue) && isRecord(currentValue)) {
      merged[key] = mergeSeedObject(seedValue, currentValue);
    } else {
      merged[key] = currentValue;
    }
  }
  return merged;
}

function applyWorkspaceIdentity(store, ctx) {
  const currentPage = ctx.data.bookingPage || {};
  const nextPage = {
    ...(store.bookingPage || {}),
    ...currentPage
  };
  const previousSlug = currentPage.slug;
  const targetSlug = workspaceTarget?.slug || previousSlug || nextPage.slug;

  if (targetSlug) {
    const registeredSlug = opsWorkspace.isPostgresWorkspace()
      ? targetSlug
      : opsWorkspace.registerSlug(targetSlug, workspaceId);
    nextPage.slug = registeredSlug;
    if (!opsWorkspace.isPostgresWorkspace() && previousSlug && previousSlug !== registeredSlug) {
      opsWorkspace.unregisterSlug(previousSlug, workspaceId);
    }
  }
  if (workspaceTarget?.name) nextPage.businessName = workspaceTarget.name;
  if (workspaceTarget?.locale) nextPage.locale = workspaceTarget.locale;
  if (workspaceTarget?.ownerEmail) {
    const logoUrl = currentPage.logoUrl || "";
    const logoWorkspaceId = logoUrl.match(/\/workspaces\/([^/]+)\//)?.[1];
    nextPage.logoUrl = logoWorkspaceId && logoWorkspaceId !== workspaceId ? "" : logoUrl;
  }

  store.bookingPage = nextPage;
}

async function saveCanonicalFromWorkspace(source = "save") {
  return ops.withWorkspaceAsync(workspaceId, async () => {
    const ctx = opsWorkspace.getContext(() => ({ staff: [], services: [], customers: [] }));
    const result = writeCanonicalSeed(cloneStore(ctx.data), {
      source,
      workspaceId,
      ...(workspaceTarget?.ownerEmail ? { ownerEmail: workspaceTarget.ownerEmail } : {})
    });
    console.log(`[gen-medical] canonical saved → ${path.relative(process.cwd(), result.path)}`);
    console.log(JSON.stringify(result.meta, null, 2));
    return result;
  });
}

async function restoreCanonicalToWorkspace() {
  const { meta, store } = readCanonicalSeed();
  console.log(`[gen-medical] restoring from ${path.relative(process.cwd(), canonicalSeedPath())}`);
  console.log(`[gen-medical] seed meta:`, meta);
  console.log(
    `[gen-medical] default owner email=${DEFAULT_OWNER_EMAIL}; active target owner=${workspaceTarget?.ownerEmail || "(explicit workspace)"}`
  );

  const activityResult = await ensureWorkspaceAcceptsMedicalOps(workspaceTarget);

  const counts = await ops.withWorkspaceAsync(workspaceId, async () => {
    if (!noBackup) {
      const backup = backupOpsFile(workspaceId);
      if (backup) console.log(`[gen-medical] pre-restore backup → ${backup}`);
    }
    const ctx = opsWorkspace.getContext(() => cloneStore(store));
    const next = doReplace ? cloneStore(store) : mergeSeedStore(ctx.data, store);
    applyMedicalActivityFields(next);
    applyWorkspaceIdentity(next, ctx);
    opsWorkspace.replaceStoreData(ctx, next);
    return {
      ...summarizeStore(ctx.data),
      mode: doReplace ? "replace" : "merge",
      activityConversion: activityResult
    };
  });

  console.log("[gen-medical] restore done");
  console.log(JSON.stringify(counts, null, 2));
  console.log("حدّث صفحة المتصفح لرؤية البيانات المسترجعة.");
  console.log("تذكير: npm run migrate / npm run seed لا يستعيدان بذرة المستشفى.");
  return counts;
}

async function generateDemo() {
  console.log(`[gen-medical] generate workspace=${workspaceId} keep=${keep}`);

  const summary = await ops.withWorkspaceAsync(workspaceId, async () => {
    if (!noBackup) {
      const backup = backupOpsFile(workspaceId);
      if (backup) console.log(`[gen-medical] backup → ${backup}`);
      else console.log("[gen-medical] no existing ops file to backup");
    }
    if (!keep) {
      ops.resetOpsData();
      console.log("[gen-medical] reset to default store");
    }

    const ctx = opsWorkspace.getContext(() => ({}));
    applyWorkspaceIdentity(ctx.data, ctx);
    opsWorkspace.persistContext(ctx);

    // 24h facility window so shift staff can book around the clock
    ops.saveWorkingHours(
      [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        weekday,
        isOpen: true,
        opensAt: "00:00",
        closesAt: "23:59",
        overnight: false,
        breakEnabled: false
      }))
    );

    const categories = ops.listServiceCategories().filter((c) => c.active !== false && c.enabled !== false);
    if (!categories.length) {
      throw new Error("لا توجد فئات خدمة — فعّل الأقسام الطبية أولاً");
    }

    if (!keep) {
      // Drop placeholder staff/services/customers from the default store so the seed is the full roster.
      ops.listStaff().forEach((person) => {
        try { ops.deleteStaff(person.id); } catch { /* ignore */ }
      });
      ops.listServices().forEach((service) => {
        try { ops.deleteService(service.id); } catch { /* ignore */ }
      });
      const live = opsWorkspace.getContext(() => ({}));
      if (live?.data) live.data.customers = [];
    }

    let nameIndex = 0;
    let staffCreated = 0;
    let servicesCreated = 0;
    const roleCounts = { consultant: 0, specialist: 0, gp: 0, nurse: 0, admin: 0 };

    const roster = [];
    const hire = (fields, slot) => {
      const person = ops.createStaff({
        active: true,
        useBusinessHours: false,
        serviceIds: [],
        ...fields,
        phone: phoneFor(nameIndex)
      });
      nameIndex += 1;
      staffCreated += 1;
      if (slot) roster.push({ ...slot, staffId: person.id });
      return person;
    };

    const hireCovered = ({ shift, minOnDuty, seed, roleKey, categoryId, make }) => {
      const offs = offDaysForHeadcount(minOnDuty, seed);
      return offs.map((offWeekday, index) => {
        const cover = index > 0;
        const person = hire(make({
          offWeekday,
          cover,
          workingHours: weekHoursForShift(shift, offWeekday),
          placeExtra: cover ? "تغطية إجازة" : "أساسي"
        }), {
          roleKey,
          categoryId,
          opensAt: shift.opensAt,
          closesAt: shift.closesAt,
          overnight: Boolean(shift.overnight),
          minOnDuty
        });
        if (roleKey === "consultant" || roleKey === "specialist" || roleKey === "gp" || roleKey === "nurse") {
          roleCounts[roleKey] += 1;
        } else if (roleKey === "reception") {
          roleCounts.admin += 1;
        }
        return person;
      });
    };

    for (const category of categories) {
      const specialty = category.name;
      const er = isEmergency(specialty);
      const shifts = er ? ER_SHIFTS : CLINIC_SHIFTS;
      const team = { consultants: [], specialists: [], gps: [], nurses: [] };
      const femaleNurse = /أطفال|نساء|جلد|عيون/.test(specialty);

      shifts.forEach((shift, shiftIndex) => {
        ["consultant", "specialist", "gp"].forEach((rank, rankIndex) => {
          const people = hireCovered({
            shift,
            minOnDuty: 1,
            seed: shiftIndex * 3 + rankIndex,
            roleKey: rank,
            categoryId: category.id,
            make: ({ offWeekday, cover, workingHours, placeExtra }) => {
              const names = pickName(nameIndex);
              return {
                ...names,
                title: doctorTitle(rank, specialty),
                servicePlace: `${specialty} · ${shift.label} · ${placeExtra} · إجازة ${DAY_NAMES[offWeekday]}`,
                serviceCategoryId: category.id,
                workingHours
              };
            }
          });
          team[rank === "gp" ? "gps" : rank === "consultant" ? "consultants" : "specialists"].push(...people);
        });

        const nurses = hireCovered({
          shift,
          minOnDuty: 1,
          seed: 1 + shiftIndex,
          roleKey: "nurse",
          categoryId: category.id,
          make: ({ offWeekday, cover, workingHours, placeExtra }) => {
            const names = pickName(nameIndex + (femaleNurse || cover ? 10 : 0));
            const title = er
              ? (femaleNurse || cover ? "ممرضة طوارئ" : "ممرض طوارئ")
              : (femaleNurse || cover ? `ممرضة ${specialty}` : `ممرض ${specialty}`);
            return {
              ...names,
              title,
              servicePlace: `${specialty} · تمريض · ${shift.label} · ${placeExtra} · إجازة ${DAY_NAMES[offWeekday]}`,
              serviceCategoryId: category.id,
              workingHours
            };
          }
        });
        team.nurses.push(...nurses);
      });

      const serviceNames = catalogFor(specialty);
      serviceNames.forEach((name, index) => {
        const pricing = pricingFor(name, index);
        ops.createService({
          name,
          categoryId: category.id,
          durationMinutes: /استشاري/.test(name) ? 45 : 30,
          bufferMinutes: 15,
          ...pricing,
          color: SERVICE_COLORS[index % SERVICE_COLORS.length],
          publicBooking: true,
          autoAccept: true,
          autoComplete: false,
          providerIds: providerIdsFor(name, team),
          description: `${specialty} · ${pricing.pricingType}`
        });
        servicesCreated += 1;
      });
    }

    RECEPTION_PLAN.forEach(({ shift, minOnDuty }, shiftIndex) => {
      hireCovered({
        shift,
        minOnDuty,
        seed: shiftIndex * 2,
        roleKey: "reception",
        categoryId: "",
        make: ({ offWeekday, cover, workingHours, placeExtra }) => {
          const names = pickName(nameIndex + 12);
          return {
            ...names,
            title: "استقبال",
            servicePlace: `الاستقبال الرئيسي · ${shift.label} · ${placeExtra} · إجازة ${DAY_NAMES[offWeekday]}`,
            serviceCategoryId: "",
            workingHours
          };
        }
      });
    });

    const staffById = new Map(ops.listStaff().map((person) => [person.id, person]));
    const groups = new Map();
    roster.forEach((slot) => {
      const key = [slot.roleKey, slot.categoryId || "reception", slot.opensAt, slot.closesAt].join("|");
      if (!groups.has(key)) groups.set(key, { minOnDuty: slot.minOnDuty, ids: new Set() });
      groups.get(key).ids.add(slot.staffId);
      groups.get(key).minOnDuty = Math.max(groups.get(key).minOnDuty, slot.minOnDuty);
    });
    const gaps = [];
    groups.forEach((group, key) => {
      for (let weekday = 0; weekday < 7; weekday += 1) {
        let onDuty = 0;
        group.ids.forEach((id) => {
          const day = (staffById.get(id)?.workingHours || []).find((item) => item.weekday === weekday);
          if (day && day.isOpen !== false) onDuty += 1;
        });
        if (onDuty < group.minOnDuty) gaps.push(`${key} · ${DAY_NAMES[weekday]} → ${onDuty}/${group.minOnDuty}`);
      }
    });
    if (gaps.length) {
      throw new Error(`فجوات تغطية بعد توزيع الإجازات:\n${gaps.slice(0, 12).join("\n")}`);
    }

    const customerSeeds = [
      ["حسام", "مكرم", "cat-regular"],
      ["هيثم", "وحيدة", "cat-new"],
      ["جود", "عبدالعزيز", "cat-vip"],
      ["ريم", "سعد", "cat-regular"],
      ["هدى", "أحمد", "cat-new"],
      ["سلمى", "علي", "cat-regular"],
      ["كريم", "فؤاد", "cat-vip"],
      ["نورا", "حسن", "cat-regular"],
      ["ياسر", "منصور", "cat-new"],
      ["داليا", "الشافعي", "cat-regular"]
    ];
    let customersCreated = 0;
    for (const [firstName, lastName, categoryId] of customerSeeds) {
      try {
        ops.createCustomer({ firstName, lastName, phone: phoneFor(900 + customersCreated), categoryId });
        customersCreated += 1;
      } catch {
        /* skip duplicates when --keep */
      }
    }

    return {
      categories: categories.length,
      staffCreated,
      servicesCreated,
      customersCreated,
      roleCounts,
      coverageOk: gaps.length === 0,
      staffTotal: ops.listStaff().length,
      servicesTotal: ops.listServices().length,
      customersTotal: ops.listCustomers().length
    };
  });

  console.log("[gen-medical] generate done");
  console.log(JSON.stringify(summary, null, 2));
  await saveCanonicalFromWorkspace("generate");
  console.log("\nاسترجاع لاحقاً: npm run seed:demo:restore -- --section=medical");
  console.log("تحذير: refresh / ops:reset يمسحان workspace — البذرة في data/seeds/ تبقى.");
  return summary;
}

async function main() {
  printBanner("توليد قسم medical (نادر)", "Generate medical section (rare)");
  printDemoMap();
  if (doRestore || doSave) {
    console.error(
      "[gen-medical] --restore/--save أُزيلا من هذا السكربت.\n" +
        "استخدم: npm run seed:demo:" + (doRestore ? "restore" : "save") + " -- --section=medical"
    );
    process.exitCode = 2;
    return;
  }

  try {
    workspaceTarget = await resolveWorkspaceTarget();
    workspaceId = workspaceTarget.id;
    console.log(
      `[gen-medical] generate target workspace=${workspaceId}` +
        (workspaceTarget.name ? ` name=${workspaceTarget.name} slug=${workspaceTarget.slug || ""}` : "") +
        (workspaceTarget.ownerEmail ? ` owner=${workspaceTarget.ownerEmail}` : " explicit")
    );
    if (workspaceTarget.needsMedicalConversion) {
      await ensureWorkspaceAcceptsMedicalOps(workspaceTarget);
    }
    return await generateDemo();
  } finally {
    if (pool) await pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("[gen-medical] FAILED:", error.message || error);
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_OWNER_EMAIL,
  isMedicalActivity,
  pickOwnedWorkspace,
  applyMedicalActivityFields
};
