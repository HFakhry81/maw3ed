/**
 * Seed a rich, logically linked medical demo into local ops workspace JSON.
 *
 * Canonical durable backup (survives refresh / ops:reset):
 *   data/seeds/medical-demo-ops.json
 *
 * Usage:
 *   npm run seed:medical              generate demo + save canonical backup
 *   npm run seed:medical:save         save current workspace → canonical backup
 *   npm run seed:medical:restore      restore workspace ← canonical backup
 *   node scripts/seed-medical-demo.js --workspace=local-default
 *   node scripts/seed-medical-demo.js --keep
 */
const fs = require("fs");
const path = require("path");
require("./load-env");

const ops = require("../opsStore");
const opsWorkspace = require("../opsWorkspace");
const {
  canonicalSeedPath,
  readCanonicalSeed,
  writeCanonicalSeed,
  summarizeStore
} = require("./medical-seed-snapshot");

const args = process.argv.slice(2);
const keep = args.includes("--keep");
const noBackup = args.includes("--no-backup");
const doRestore = args.includes("--restore");
const doSave = args.includes("--save");
const wsArg = args.find((a) => a.startsWith("--workspace="));
const workspaceId = wsArg ? wsArg.split("=")[1] : opsWorkspace.DEFAULT_WORKSPACE_ID || "local-default";

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

/** Specialty-specific service catalogs (10 each). */
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

function weekHoursForShift(shift) {
  return [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    isOpen: true,
    opensAt: shift.opensAt,
    closesAt: shift.closesAt,
    overnight: shift.overnight,
    breakEnabled: false,
    breakStartsAt: "13:00",
    breakEndsAt: "14:00"
  }));
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

function saveCanonicalFromWorkspace(source = "save") {
  return ops.withWorkspace(workspaceId, () => {
    const ctx = opsWorkspace.getContext(() => ({ staff: [], services: [], customers: [] }));
    const result = writeCanonicalSeed(cloneStore(ctx.data), { source, workspaceId });
    console.log(`[seed-medical] canonical saved → ${path.relative(process.cwd(), result.path)}`);
    console.log(JSON.stringify(result.meta, null, 2));
    return result;
  });
}

function restoreCanonicalToWorkspace() {
  const { meta, store } = readCanonicalSeed();
  console.log(`[seed-medical] restoring from ${path.relative(process.cwd(), canonicalSeedPath())}`);
  console.log(`[seed-medical] seed meta:`, meta);

  if (!noBackup) {
    const backup = backupOpsFile(workspaceId);
    if (backup) console.log(`[seed-medical] pre-restore backup → ${backup}`);
  }

  const counts = ops.withWorkspace(workspaceId, () => {
    const next = cloneStore(store);
    const ctx = opsWorkspace.getContext(() => cloneStore(next));
    opsWorkspace.replaceStoreData(ctx, next);
    try {
      if (next.bookingPage?.slug) {
        opsWorkspace.registerSlug(next.bookingPage.slug, workspaceId);
      }
    } catch (error) {
      console.warn(`[seed-medical] slug register: ${error.message}`);
    }
    return summarizeStore(ctx.data);
  });

  console.log("[seed-medical] restore done");
  console.log(JSON.stringify(counts, null, 2));
  console.log("حدّث صفحة المتصفح لرؤية البيانات المسترجعة.");
  return counts;
}

function generateDemo() {
  console.log(`[seed-medical] generate workspace=${workspaceId} keep=${keep}`);

  if (!noBackup) {
    const backup = backupOpsFile(workspaceId);
    if (backup) console.log(`[seed-medical] backup → ${backup}`);
    else console.log("[seed-medical] no existing ops file to backup");
  }

  const summary = ops.withWorkspace(workspaceId, () => {
    if (!keep) {
      ops.resetOpsData();
      console.log("[seed-medical] reset to default store");
    }

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

    let nameIndex = 0;
    let staffCreated = 0;
    let servicesCreated = 0;
    const roleCounts = { consultant: 0, specialist: 0, gp: 0, nurse: 0, admin: 0 };

    for (const category of categories) {
      const specialty = category.name;
      const serviceNames = SERVICES_BY_DEPT[specialty] || Array.from({ length: 10 }, (_, i) => `خدمة ${specialty} ${i + 1}`);

      // Create 10 services first (providers filled after staff)
      const createdServices = [];
      for (let i = 0; i < 10; i += 1) {
        const svc = ops.createService({
          name: serviceNames[i] || `خدمة ${i + 1}`,
          categoryId: category.id,
          durationMinutes: i % 3 === 0 ? 45 : 30,
          bufferMinutes: 15,
          pricingType: i % 5 === 4 ? "range" : "fixed",
          price: 150 + i * 40,
          priceMin: 120 + i * 20,
          priceMax: 400 + i * 50,
          color: SERVICE_COLORS[i % SERVICE_COLORS.length],
          publicBooking: true,
          autoAccept: true,
          autoComplete: false,
          providerIds: [],
          description: `${specialty} · ${serviceNames[i] || ""}`
        });
        createdServices.push(svc);
        servicesCreated += 1;
      }

      // Per shift: consultant, specialist, GP, nurse, admin
      const shiftDoctors = { morning: [], evening: [], night: [] };

      for (const shift of SHIFTS) {
        const ranks = [
          { rank: "consultant", key: "consultant" },
          { rank: "specialist", key: "specialist" },
          { rank: "gp", key: "gp" }
        ];

        for (const { rank, key } of ranks) {
          const names = pickName(nameIndex++);
          const person = ops.createStaff({
            ...names,
            phone: phoneFor(nameIndex),
            title: doctorTitle(rank, specialty),
            servicePlace: `${specialty} · وردية ${shift.label}`,
            serviceCategoryId: category.id,
            serviceIds: [],
            active: true,
            useBusinessHours: false,
            workingHours: weekHoursForShift(shift)
          });
          shiftDoctors[shift.id].push(person);
          roleCounts[key] += 1;
          staffCreated += 1;
        }

        const nurseNames = pickName(nameIndex++);
        ops.createStaff({
          ...nurseNames,
          phone: phoneFor(nameIndex),
          title: specialty.includes("أطفال") || specialty.includes("نساء") ? `ممرضة ${specialty}` : `ممرض ${specialty}`,
          servicePlace: `${specialty} · تمريض · ${shift.label}`,
          serviceCategoryId: category.id,
          serviceIds: [],
          active: true,
          useBusinessHours: false,
          workingHours: weekHoursForShift(shift)
        });
        roleCounts.nurse += 1;
        staffCreated += 1;

        const adminNames = pickName(nameIndex++);
        const adminTitle = shift.id === "morning" ? "استقبال" : shift.id === "evening" ? "منسق حجوزات" : "مشرف قسم";
        ops.createStaff({
          ...adminNames,
          phone: phoneFor(nameIndex),
          title: adminTitle,
          servicePlace: `${specialty} · إداري · ${shift.label}`,
          serviceCategoryId: category.id,
          serviceIds: [],
          active: true,
          useBusinessHours: false,
          workingHours: weekHoursForShift(shift)
        });
        roleCounts.admin += 1;
        staffCreated += 1;
      }

      // Link services to doctors: rotate consultants/specialists/GPs across shifts
      const allDoctors = [...shiftDoctors.morning, ...shiftDoctors.evening, ...shiftDoctors.night];
      createdServices.forEach((svc, idx) => {
        const primary = allDoctors[idx % allDoctors.length];
        const secondary = allDoctors[(idx + 3) % allDoctors.length];
        const providerIds = [...new Set([primary.id, secondary.id])];
        ops.updateService(svc.id, { providerIds });
      });
    }

    // Shared front-desk pool (covers booking beyond single dept)
    for (const shift of SHIFTS) {
      const names = pickName(nameIndex++);
      ops.createStaff({
        ...names,
        phone: phoneFor(nameIndex),
        title: "استقبال عام",
        servicePlace: `الاستقبال الرئيسي · ${shift.label}`,
        serviceCategoryId: "",
        serviceIds: [],
        active: true,
        useBusinessHours: false,
        workingHours: weekHoursForShift(shift)
      });
      roleCounts.admin += 1;
      staffCreated += 1;
    }

    // Sample customers for booking tests
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
      staffTotal: ops.listStaff().length,
      servicesTotal: ops.listServices().length,
      customersTotal: ops.listCustomers().length
    };
  });

  console.log("[seed-medical] generate done");
  console.log(JSON.stringify(summary, null, 2));
  saveCanonicalFromWorkspace("generate");
  console.log("\nاسترجاع لاحقاً: npm run seed:medical:restore");
  console.log("تحذير: refresh / ops:reset يمسحان workspace — البذرة في data/seeds/ تبقى.");
  return summary;
}

function main() {
  if (doRestore && doSave) {
    throw new Error("استخدم --restore أو --save فقط، ليس الاثنين معاً");
  }
  if (doRestore) return restoreCanonicalToWorkspace();
  if (doSave) return saveCanonicalFromWorkspace("save");
  return generateDemo();
}

try {
  main();
} catch (error) {
  console.error("[seed-medical] FAILED:", error.message || error);
  process.exit(1);
}
