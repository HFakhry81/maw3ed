/**
 * بذرة Maw3ed الموحدة (ملف واحد دائم):
 *   data/seeds/maw3ed-demo-ops.json
 *
 * أقسام:
 *   medical   → contact.haitham@gmail.com  / dawybooking
 *   education → contact.haitham@yahoo.com / talaaee-book
 *
 * الاستعادة: npm run seed:demo:restore
 */
"use strict";

const fs = require("fs");
const path = require("path");

const rootDir = path.join(__dirname, "..");
const SEEDS_DIR = path.join(rootDir, "data", "seeds");
const CANONICAL_SEED = path.join(SEEDS_DIR, "maw3ed-demo-ops.json");
const LEGACY_MEDICAL_SEED = path.join(SEEDS_DIR, "medical-demo-ops.json");
const SUMMARY_PATH = path.join(SEEDS_DIR, "maw3ed-demo-summary.json");
const SEED_NAME = "maw3ed-demo-seeds";
const FORMAT = "multi-section-v1";

const SECTION_TARGETS = {
  medical: {
    key: "medical",
    activityType: "medical",
    ownerEmail: "contact.haitham@gmail.com",
    preferredWorkspaceId: "workspace_67ac2618-fe29-4cb0-b668-b152b4b98592",
    preferredSlug: "dawybooking",
    preferredName: "مستشفيات داوي"
  },
  education: {
    key: "education",
    activityType: "education",
    ownerEmail: "contact.haitham@yahoo.com",
    preferredWorkspaceId: "workspace_46d0f604-1bb9-4cd8-958c-d2b370939b41",
    preferredSlug: "talaaee-book",
    preferredName: "مركز طلائع التعليمي"
  }
};

const KEEP_OWNER_EMAILS = [
  SECTION_TARGETS.medical.ownerEmail,
  SECTION_TARGETS.education.ownerEmail
];

function ensureSeedsDir() {
  fs.mkdirSync(SEEDS_DIR, { recursive: true });
}

function canonicalSeedPath() {
  return CANONICAL_SEED;
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

function sectionKeys() {
  return Object.keys(SECTION_TARGETS);
}

function getSectionTarget(sectionKey) {
  const key = String(sectionKey || "").trim().toLowerCase();
  const target = SECTION_TARGETS[key];
  if (!target) {
    const error = new Error(`قسم البذرة غير معروف: ${sectionKey} (المتاح: ${sectionKeys().join(", ")})`);
    error.statusCode = 400;
    throw error;
  }
  return target;
}

function buildEducationStore() {
  const activityTemplates = require("../activityTemplatesCatalog");
  const store = {
    customerCategories: [
      { id: "cat-vip", name: "VIP", color: "#f5a623" },
      { id: "cat-regular", name: "عادي", color: "#1967e8" },
      { id: "cat-new", name: "جديد", color: "#16ae7c" }
    ],
    customers: [
      {
        id: "student-001",
        firstName: "جود",
        lastName: "عبدالعزيز",
        phone: "01000000001",
        email: "",
        address: "",
        categoryId: "cat-regular",
        avatarUrl: ""
      },
      {
        id: "student-002",
        firstName: "ريم",
        lastName: "سعد",
        phone: "01000000002",
        email: "",
        address: "",
        categoryId: "cat-new",
        avatarUrl: ""
      }
    ],
    staff: [],
    serviceCategories: [],
    services: [],
    workingHours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      weekday,
      isOpen: weekday !== 5,
      opensAt: "09:00",
      closesAt: "21:00",
      breakEnabled: true,
      breakStartsAt: "13:00",
      breakEndsAt: "14:00"
    })),
    closedDays: [],
    specificDays: [],
    bookingPage: {
      slug: SECTION_TARGETS.education.preferredSlug,
      businessName: SECTION_TARGETS.education.preferredName,
      industry: "education",
      email: SECTION_TARGETS.education.ownerEmail,
      phone: "",
      description: "مركز طلائع التعليمي — دروس وتقوية وورش.",
      country: "مصر",
      state: "القاهرة",
      city: "القاهرة",
      street: "",
      timezone: "Africa/Cairo",
      onlineBookingEnabled: true,
      logoUrl: "",
      showPlatformBranding: true,
      socialLinks: { facebook: "", instagram: "", website: "" }
    },
    calendarPreferences: {
      showBusinessHoursOnly: true,
      slotOrder: "start-to-end",
      appointmentColorMode: "service",
      multiServiceEnabled: true
    },
    notifications: {
      email: { confirmation: true, reminder: true, followUp: false, cancellation: true, reschedule: true },
      messagingChannel: "whatsapp",
      messaging: { confirmation: false, reminder: false, cancellation: false, reschedule: false },
      pushDailyReminder: true
    },
    expenses: [],
    appointments: [],
    activityMode: "education",
    activityModeLocked: false,
    activityTemplateId: "education",
    medicalDepartments: [],
    activityLabels: {},
    activityLabelsI18n: null,
    planKey: "free"
  };
  activityTemplates.applyTemplateToStoreData(store, "education", "ar", { replaceStaff: true });
  store.activityMode = "education";
  store.activityTemplateId = "education";
  store.activityModeLocked = false;
  // Ensure a small stable طلائع roster beyond any single template default.
  const byId = new Map((store.staff || []).map((person) => [person.id, person]));
  for (const person of [
    {
      id: "staff-edu-lead",
      name: "مدرب رئيسي",
      firstName: "مدرب",
      lastName: "رئيسي",
      title: "مدرب",
      active: true,
      servicePlace: "طلائع"
    },
    {
      id: "staff-edu-rec",
      name: "استقبال طلائع",
      firstName: "استقبال",
      lastName: "طلائع",
      title: "استقبال",
      active: true,
      servicePlace: "الاستقبال"
    }
  ]) {
    if (!byId.has(person.id)) byId.set(person.id, person);
  }
  store.staff = [...byId.values()];
  const providerIds = store.staff.filter((person) => /مدرب|Instructor|lead/i.test(person.title || person.name || "")).map((person) => person.id);
  const fallbackProviders = providerIds.length ? providerIds : store.staff.map((person) => person.id).slice(0, 1);
  (store.services || []).forEach((service) => {
    if (!Array.isArray(service.providerIds) || !service.providerIds.length) {
      service.providerIds = fallbackProviders;
    }
  });
  return store;
}

function applyActivityFields(store, activityType) {
  if (!store || typeof store !== "object") return store;
  store.activityMode = activityType;
  store.activityTemplateId = activityType;
  store.activityModeLocked = false;
  return store;
}

function wrapSection(sectionKey, store, extra = {}) {
  const target = getSectionTarget(sectionKey);
  return {
    target: {
      ownerEmail: target.ownerEmail,
      preferredWorkspaceId: target.preferredWorkspaceId,
      preferredSlug: target.preferredSlug,
      preferredName: target.preferredName,
      activityType: target.activityType
    },
    counts: summarizeStore(store),
    ...extra,
    store
  };
}

function emptyBundle() {
  return {
    meta: {
      name: SEED_NAME,
      format: FORMAT,
      savedAt: new Date().toISOString(),
      sections: {}
    },
    sections: {}
  };
}

function normalizeBundle(raw) {
  if (!raw || typeof raw !== "object") return emptyBundle();

  // Legacy single-store medical file: { meta, store }
  if (raw.store && typeof raw.store === "object" && !raw.sections) {
    const medicalStore = raw.store;
    const educationStore = buildEducationStore();
    return {
      meta: {
        name: SEED_NAME,
        format: FORMAT,
        savedAt: new Date().toISOString(),
        migratedFrom: "legacy-medical-demo-ops",
        legacyMeta: raw.meta || null,
        sections: {
          medical: summarizeStore(medicalStore),
          education: summarizeStore(educationStore)
        }
      },
      sections: {
        medical: wrapSection("medical", medicalStore, { source: "legacy-medical" }),
        education: wrapSection("education", educationStore, { source: "template-bootstrap" })
      }
    };
  }

  if (raw.sections && typeof raw.sections === "object") {
    const bundle = emptyBundle();
    bundle.meta = {
      ...bundle.meta,
      ...(raw.meta || {}),
      name: SEED_NAME,
      format: FORMAT
    };
    for (const key of sectionKeys()) {
      const section = raw.sections[key];
      if (section?.store && typeof section.store === "object") {
        bundle.sections[key] = wrapSection(key, section.store, {
          source: section.source || "canonical"
        });
        bundle.meta.sections[key] = summarizeStore(section.store);
      }
    }
    return bundle;
  }

  // Bare store object
  if (Array.isArray(raw.staff) || Array.isArray(raw.services)) {
    return normalizeBundle({ meta: { legacy: true }, store: raw });
  }

  return emptyBundle();
}

function readLegacyMedicalIfPresent() {
  if (!fs.existsSync(LEGACY_MEDICAL_SEED)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(LEGACY_MEDICAL_SEED, "utf8"));
    // Ignore redirect stubs
    if (raw && raw.redirect) return null;
    if (raw && (raw.store || raw.sections || Array.isArray(raw.staff))) return raw;
  } catch {
    return null;
  }
  return null;
}

function readDemoSeedBundle({ migrate = true } = {}) {
  ensureSeedsDir();
  if (fs.existsSync(CANONICAL_SEED)) {
    const raw = JSON.parse(fs.readFileSync(CANONICAL_SEED, "utf8"));
    return normalizeBundle(raw);
  }
  const legacy = readLegacyMedicalIfPresent();
  if (legacy) {
    const bundle = normalizeBundle(legacy);
    if (migrate) writeDemoSeedBundle(bundle, { source: "migrate-legacy-medical" });
    return bundle;
  }
  const error = new Error(
    `لا توجد بذرة موحدة في ${path.relative(rootDir, CANONICAL_SEED)}\nأنشئها عبر npm run seed:demo:save أو انقل medical-demo-ops.json القديمً.`
  );
  error.code = "SEED_MISSING";
  throw error;
}

function writeDemoSeedBundle(bundleInput, extraMeta = {}) {
  ensureSeedsDir();
  const bundle = normalizeBundle(bundleInput);
  // Ensure both sections exist
  if (!bundle.sections.medical?.store) {
    throw new Error("البذرة الموحدة يجب أن تتضمن قسم medical");
  }
  if (!bundle.sections.education?.store) {
    bundle.sections.education = wrapSection("education", buildEducationStore(), {
      source: "template-bootstrap"
    });
  }

  const metaSections = {};
  for (const key of sectionKeys()) {
    const section = bundle.sections[key];
    metaSections[key] = {
      ...summarizeStore(section.store),
      ownerEmail: SECTION_TARGETS[key].ownerEmail,
      preferredWorkspaceId: SECTION_TARGETS[key].preferredWorkspaceId,
      preferredSlug: SECTION_TARGETS[key].preferredSlug
    };
  }

  const payload = {
    meta: {
      name: SEED_NAME,
      format: FORMAT,
      savedAt: new Date().toISOString(),
      ...extraMeta,
      sections: metaSections
    },
    sections: {
      medical: wrapSection("medical", bundle.sections.medical.store, {
        source: bundle.sections.medical.source || "canonical"
      }),
      education: wrapSection("education", bundle.sections.education.store, {
        source: bundle.sections.education.source || "canonical"
      })
    }
  };

  fs.writeFileSync(CANONICAL_SEED, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.writeFileSync(SUMMARY_PATH, `${JSON.stringify(payload.meta, null, 2)}\n`, "utf8");

  // Legacy path becomes a pointer so old docs don't look like a second seed.
  fs.writeFileSync(
    LEGACY_MEDICAL_SEED,
    `${JSON.stringify(
      {
        redirect: "maw3ed-demo-ops.json",
        note: "البذرة الموحدة (طبي + طلائع) في maw3ed-demo-ops.json — استخدم npm run seed:demo:restore"
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  return { path: CANONICAL_SEED, meta: payload.meta, summaryPath: SUMMARY_PATH, bundle: payload };
}

function getSectionStore(bundle, sectionKey) {
  const section = normalizeBundle(bundle).sections[sectionKey];
  if (!section?.store) {
    throw new Error(`قسم ${sectionKey} غير موجود في البذرة الموحدة`);
  }
  return section.store;
}

function setSectionStore(bundleInput, sectionKey, store, extra = {}) {
  const bundle = normalizeBundle(bundleInput);
  bundle.sections[sectionKey] = wrapSection(sectionKey, store, extra);
  return bundle;
}

function isPreferredActivity(activityType, sectionKey) {
  const activityTemplates = require("../activityTemplatesCatalog");
  const expected = getSectionTarget(sectionKey).activityType;
  return activityTemplates.resolveTemplateId(activityType || "") === expected;
}

/**
 * Prefer preferredWorkspaceId if present in owned list; else matching activity; else unique owned.
 */
function pickOwnedWorkspaceForSection(ownedWorkspaces, sectionKey) {
  const target = getSectionTarget(sectionKey);
  const rows = Array.isArray(ownedWorkspaces) ? ownedWorkspaces : [];
  if (!rows.length) return { target: null, reason: "none" };

  const byPreferredId = rows.find((row) => row.id === target.preferredWorkspaceId);
  if (byPreferredId) return { target: byPreferredId, reason: "preferred_id" };

  const bySlug = rows.find(
    (row) => String(row.slug || "").toLowerCase() === String(target.preferredSlug).toLowerCase()
  );
  if (bySlug) return { target: bySlug, reason: "preferred_slug" };

  const matching = rows.filter((row) => isPreferredActivity(row.activity_type, sectionKey));
  if (matching.length === 1) return { target: matching[0], reason: "unique_activity" };
  if (matching.length > 1) return { target: null, reason: "ambiguous_activity", candidates: matching };
  if (rows.length === 1) return { target: rows[0], reason: "unique_owned" };
  return { target: null, reason: "ambiguous_owned", candidates: rows };
}

module.exports = {
  SEED_NAME,
  FORMAT,
  SEEDS_DIR,
  CANONICAL_SEED,
  LEGACY_MEDICAL_SEED,
  SUMMARY_PATH,
  SECTION_TARGETS,
  KEEP_OWNER_EMAILS,
  ensureSeedsDir,
  canonicalSeedPath,
  summarizeStore,
  sectionKeys,
  getSectionTarget,
  buildEducationStore,
  applyActivityFields,
  wrapSection,
  emptyBundle,
  normalizeBundle,
  readDemoSeedBundle,
  writeDemoSeedBundle,
  getSectionStore,
  setSectionStore,
  isPreferredActivity,
  pickOwnedWorkspaceForSection
};
