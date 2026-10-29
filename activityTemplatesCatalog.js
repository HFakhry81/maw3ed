/**
 * Ready-made activity templates for Maw3ed workspaces.
 * Each template defines bilingual labels, categories, and starter services.
 * custom / other stay empty so operators build their own catalog.
 *
 * Maw3ed is multi-purpose — not clinic-only. Templates map to BookingType:
 * APPOINTMENT | RESOURCE_RENTAL | BATCH_SCHEDULE (see opsStatusMachines.js).
 */

const statusMachines = require("./opsStatusMachines");

function L(ar, en) {
  return { ar, en };
}

function service(id, name, durationMinutes, price, extras = {}) {
  return {
    id,
    name,
    durationMinutes,
    bufferMinutes: extras.bufferMinutes ?? 0,
    pricingType: extras.pricingType || "fixed",
    price: extras.pricingType === "free" || extras.pricingType === "on_request" ? 0 : price,
    priceMin: extras.priceMin ?? null,
    priceMax: extras.priceMax ?? null,
    color: extras.color || "#1967e8",
    publicBooking: extras.publicBooking !== false,
    autoAccept: extras.autoAccept !== false,
    autoComplete: Boolean(extras.autoComplete),
    description: extras.description || L("", ""),
    occupancyMode: extras.occupancyMode || null,
    compositionDefault: extras.compositionDefault || null,
    defaultCapacity: extras.defaultCapacity || null
  };
}

function category(id, name, services) {
  return { id, name, services };
}

const MEDICAL_DEPARTMENTS = [
  { id: "dept-outpatient", name: L("العيادات الخارجية", "Outpatient clinics") },
  { id: "dept-internal", name: L("الباطنية", "Internal medicine") },
  { id: "dept-pediatrics", name: L("الأطفال", "Pediatrics") },
  { id: "dept-obgyn", name: L("النساء والولادة", "Obstetrics & gynecology") },
  { id: "dept-dental", name: L("الأسنان", "Dentistry") },
  { id: "dept-radiology", name: L("الأشعة", "Radiology") },
  { id: "dept-lab", name: L("المختبر", "Laboratory") },
  { id: "dept-dermatology", name: L("الجلدية", "Dermatology") },
  { id: "dept-ophthalmology", name: L("العيون", "Ophthalmology") },
  { id: "dept-cardiology", name: L("القلب", "Cardiology") },
  { id: "dept-orthopedics", name: L("العظام", "Orthopedics") },
  { id: "dept-ent", name: L("الأنف والأذن", "ENT") },
  { id: "dept-er", name: L("الطوارئ", "Emergency") },
  { id: "dept-physio", name: L("العلاج الطبيعي", "Physiotherapy") },
  { id: "dept-pharmacy", name: L("الصيدلية", "Pharmacy") }
];

const TEMPLATES = [
  {
    id: "medical",
    mode: "medical",
    displayName: L("مركز طبي", "Medical center"),
    description: L("عيادات ومستشفيات ومراكز رعاية صحية", "Clinics, hospitals, and care centers"),
    labels: {
      ar: { customer: "المرضى", staff: "الأطباء", department: "الأقسام والعيادات", service: "الخدمات", appointment: "المواعيد" },
      en: { customer: "Patients", staff: "Doctors", department: "Departments", service: "Services", appointment: "Appointments" }
    },
    defaults: {
      ar: { customer_singular: "مريض", staff_singular: "طبيب", department_singular: "قسم" },
      en: { customer_singular: "Patient", staff_singular: "Doctor", department_singular: "Department" }
    },
    medicalDepartments: MEDICAL_DEPARTMENTS,
    categories: MEDICAL_DEPARTMENTS.map((department) =>
      category(
        department.id,
        department.name,
        department.id === "dept-er"
          ? [
              service("svc-er-specialist", L("كشف أخصائي", "Specialist consultation"), 30, 150, {
                bufferMinutes: 15,
                color: "#1967e8"
              }),
              service("svc-er-ticket", L("تذكرة دخول طوارئ", "Emergency admission ticket"), 45, 150, {
                bufferMinutes: 15,
                color: "#16ae7c",
                autoComplete: true
              })
            ]
          : department.id === "dept-outpatient"
            ? [
                service("svc-opd-gp", L("كشف عام", "General consultation"), 20, 100, {
                  bufferMinutes: 10,
                  color: "#1967e8"
                }),
                service("svc-opd-followup", L("متابعة", "Follow-up visit"), 15, 75, {
                  bufferMinutes: 5,
                  color: "#16ae7c"
                })
              ]
            : department.id === "dept-lab"
              ? [
                  service("svc-lab-basic", L("تحاليل أساسية", "Basic lab panel"), 15, 200, {
                    bufferMinutes: 0,
                    color: "#7c3aed",
                    autoComplete: true
                  })
                ]
              : []
      )
    )
  },
  {
    id: "clinic",
    mode: "flexible",
    displayName: L("عيادة", "Clinic"),
    description: L("عيادات تخصصية ومراكز كشف", "Specialty clinics and consultation centers"),
    labels: {
      ar: { customer: "المرضى", staff: "الأطباء", department: "العيادات", service: "الخدمات", appointment: "المواعيد" },
      en: { customer: "Patients", staff: "Doctors", department: "Clinics", service: "Services", appointment: "Appointments" }
    },
    defaults: {
      ar: { customer_singular: "مريض", staff_singular: "طبيب", department_singular: "عيادة" },
      en: { customer_singular: "Patient", staff_singular: "Doctor", department_singular: "Clinic" }
    },
    categories: [
      category("clinic-consult", L("الكشوفات", "Consultations"), [
        service("clinic-first", L("كشف أول مرة", "Initial consultation"), 30, 200),
        service("clinic-follow", L("متابعة", "Follow-up"), 15, 120)
      ]),
      category("clinic-procedures", L("الإجراءات", "Procedures"), [
        service("clinic-proc", L("إجراء عيادة", "In-clinic procedure"), 45, 350, {
          bufferMinutes: 15,
          pricingType: "range",
          priceMin: 250,
          priceMax: 600
        })
      ]),
      category("clinic-reports", L("التقارير", "Reports"), [
        service("clinic-report", L("تقرير طبي", "Medical report"), 20, 150, { autoComplete: true })
      ])
    ]
  },
  {
    id: "dentist",
    mode: "flexible",
    displayName: L("طبيب أسنان", "Dentist"),
    description: L("عيادات طب الأسنان", "Dental clinics"),
    labels: {
      ar: { customer: "المرضى", staff: "أطباء الأسنان", department: "العيادات", service: "الخدمات", appointment: "المواعيد" },
      en: { customer: "Patients", staff: "Dentists", department: "Clinics", service: "Services", appointment: "Appointments" }
    },
    defaults: {
      ar: { customer_singular: "مريض", staff_singular: "طبيب أسنان", department_singular: "عيادة" },
      en: { customer_singular: "Patient", staff_singular: "Dentist", department_singular: "Clinic" }
    },
    categories: [
      category("dent-exam", L("الفحص والتشخيص", "Exam & diagnosis"), [
        service("dent-checkup", L("فحص أسنان", "Dental checkup"), 30, 150),
        service("dent-xray", L("أشعة أسنان", "Dental X-ray"), 15, 100, { autoComplete: true })
      ]),
      category("dent-hygiene", L("العناية والنظافة", "Hygiene"), [
        service("dent-clean", L("تنظيف وتلميع", "Cleaning & polishing"), 45, 300, { bufferMinutes: 10 })
      ]),
      category("dent-restorative", L("العلاج الترميمي", "Restorative"), [
        service("dent-fill", L("حشو", "Filling"), 45, 400, {
          pricingType: "range",
          priceMin: 300,
          priceMax: 700,
          bufferMinutes: 15
        }),
        service("dent-white", L("تبييض", "Whitening"), 60, 1200, { bufferMinutes: 15 })
      ]),
      category("dent-ortho", L("التقويم", "Orthodontics"), [
        service("dent-ortho-consult", L("استشارة تقويم", "Ortho consultation"), 30, 200)
      ])
    ]
  },
  {
    id: "salon",
    mode: "flexible",
    displayName: L("صالون الشعر", "Hair salon"),
    description: L("قص وتصفيف وعناية بالشعر", "Cuts, styling, and hair care"),
    labels: {
      ar: { customer: "العملاء", staff: "مصففو الشعر", department: "الأقسام", service: "الخدمات", appointment: "الحجوزات" },
      en: { customer: "Clients", staff: "Stylists", department: "Sections", service: "Services", appointment: "Bookings" }
    },
    defaults: {
      ar: { customer_singular: "عميل", staff_singular: "مصفف", department_singular: "قسم" },
      en: { customer_singular: "Client", staff_singular: "Stylist", department_singular: "Section" }
    },
    categories: [
      category("salon-cut", L("القص والتصفيف", "Cut & style"), [
        service("salon-cut-women", L("قص وتصفيف", "Cut & blow-dry"), 60, 250, { bufferMinutes: 10 }),
        service("salon-trim", L("تشذيب أطراف", "Trim"), 30, 120)
      ]),
      category("salon-color", L("الصبغات", "Color"), [
        service("salon-color-full", L("صبغة كاملة", "Full color"), 120, 800, {
          bufferMinutes: 20,
          pricingType: "range",
          priceMin: 500,
          priceMax: 1500
        }),
        service("salon-highlights", L("هايلايت", "Highlights"), 90, 700, { bufferMinutes: 15 })
      ]),
      category("salon-care", L("العناية", "Treatments"), [
        service("salon-keratina", L("علاج كيراتين", "Keratin treatment"), 150, 1500, { bufferMinutes: 30 }),
        service("salon-mask", L("ماسك مغذي", "Nourishing mask"), 45, 200)
      ])
    ]
  },
  {
    id: "barber",
    mode: "flexible",
    displayName: L("صالون الحلاقة", "Barbershop"),
    description: L("حلاقة رجالية", "Men's grooming"),
    labels: {
      ar: { customer: "العملاء", staff: "الحلاقين", department: "الأقسام", service: "الخدمات", appointment: "الحجوزات" },
      en: { customer: "Clients", staff: "Barbers", department: "Sections", service: "Services", appointment: "Bookings" }
    },
    defaults: {
      ar: { customer_singular: "عميل", staff_singular: "حلاق", department_singular: "قسم" },
      en: { customer_singular: "Client", staff_singular: "Barber", department_singular: "Section" }
    },
    categories: [
      category("barber-hair", L("الشعر", "Hair"), [
        service("barber-cut", L("قص شعر", "Haircut"), 30, 80, { bufferMinutes: 5 }),
        service("barber-wash-cut", L("غسيل وقص", "Wash & cut"), 45, 120)
      ]),
      category("barber-beard", L("اللحية", "Beard"), [
        service("barber-beard", L("تهذيب لحية", "Beard trim"), 20, 50),
        service("barber-shave", L("حلاقة كلاسيكية", "Classic shave"), 30, 90)
      ]),
      category("barber-combo", L("باقات", "Combos"), [
        service("barber-combo", L("قص + لحية", "Haircut + beard"), 45, 130, { bufferMinutes: 5 })
      ])
    ]
  },
  {
    id: "beauty",
    mode: "flexible",
    displayName: L("التجميل", "Beauty"),
    description: L("مراكز التجميل والعناية", "Beauty and skincare centers"),
    labels: {
      ar: { customer: "العملاء", staff: "مختصي التجميل", department: "الأقسام", service: "الخدمات", appointment: "الحجوزات" },
      en: { customer: "Clients", staff: "Beauty specialists", department: "Sections", service: "Services", appointment: "Bookings" }
    },
    defaults: {
      ar: { customer_singular: "عميل", staff_singular: "مختص", department_singular: "قسم" },
      en: { customer_singular: "Client", staff_singular: "Specialist", department_singular: "Section" }
    },
    categories: [
      category("beauty-face", L("العناية بالبشرة", "Skincare"), [
        service("beauty-facial", L("تنظيف بشرة", "Facial cleansing"), 60, 350, { bufferMinutes: 10 }),
        service("beauty-peel", L("تقشير كيميائي", "Chemical peel"), 45, 500, { bufferMinutes: 15 })
      ]),
      category("beauty-makeup", L("المكياج", "Makeup"), [
        service("beauty-makeup-event", L("مكياج مناسبات", "Event makeup"), 75, 600, { bufferMinutes: 15 })
      ]),
      category("beauty-nails", L("الأظافر", "Nails"), [
        service("beauty-manicure", L("مانيكير", "Manicure"), 45, 180),
        service("beauty-pedicure", L("بديكير", "Pedicure"), 60, 220)
      ]),
      category("beauty-laser", L("الليزر", "Laser"), [
        service("beauty-laser-consult", L("استشارة ليزر", "Laser consultation"), 20, 100),
        service("beauty-laser-session", L("جلسة ليزر", "Laser session"), 30, 400, {
          pricingType: "on_request"
        })
      ])
    ]
  },
  {
    id: "massage",
    mode: "flexible",
    displayName: L("تدليك", "Massage"),
    description: L("مساج وعلاج طبيعي خفيف", "Massage and light body therapy"),
    labels: {
      ar: { customer: "العملاء", staff: "المعالجين", department: "الغرف", service: "الجلسات", appointment: "الحجوزات" },
      en: { customer: "Clients", staff: "Therapists", department: "Rooms", service: "Sessions", appointment: "Bookings" }
    },
    defaults: {
      ar: { customer_singular: "عميل", staff_singular: "معالج", department_singular: "غرفة" },
      en: { customer_singular: "Client", staff_singular: "Therapist", department_singular: "Room" }
    },
    categories: [
      category("massage-classic", L("مساج كلاسيكي", "Classic massage"), [
        service("massage-swedish-60", L("مساج سويدي 60 دقيقة", "Swedish 60 min"), 60, 400, { bufferMinutes: 10 }),
        service("massage-swedish-90", L("مساج سويدي 90 دقيقة", "Swedish 90 min"), 90, 550, { bufferMinutes: 15 })
      ]),
      category("massage-deep", L("مساج عميق", "Deep tissue"), [
        service("massage-deep-60", L("مساج عميق 60 دقيقة", "Deep tissue 60 min"), 60, 480, { bufferMinutes: 10 })
      ]),
      category("massage-sports", L("مساج رياضي", "Sports massage"), [
        service("massage-sports", L("جلسة رياضية", "Sports session"), 45, 420, { bufferMinutes: 10 })
      ])
    ]
  },
  {
    id: "spa",
    mode: "flexible",
    displayName: L("منتجع صحي", "Spa"),
    description: L("سبا وعافية", "Spa and wellness"),
    labels: {
      ar: { customer: "العملاء", staff: "الفريق", department: "الباقات", service: "الخدمات", appointment: "الحجوزات" },
      en: { customer: "Guests", staff: "Team", department: "Packages", service: "Services", appointment: "Bookings" }
    },
    defaults: {
      ar: { customer_singular: "عميل", staff_singular: "موظف", department_singular: "باقة" },
      en: { customer_singular: "Guest", staff_singular: "Staff", department_singular: "Package" }
    },
    categories: [
      category("spa-body", L("علاجات الجسم", "Body treatments"), [
        service("spa-scrub", L("تقشير الجسم", "Body scrub"), 60, 500, { bufferMinutes: 15 }),
        service("spa-wrap", L("لفائف علاجية", "Body wrap"), 75, 650, { bufferMinutes: 15 })
      ]),
      category("spa-face", L("علاجات الوجه", "Facials"), [
        service("spa-facial-premium", L("فيشل فاخر", "Premium facial"), 75, 700, { bufferMinutes: 15 })
      ]),
      category("spa-packages", L("باقات اليوم", "Day packages"), [
        service("spa-half-day", L("باقة نصف يوم", "Half-day package"), 180, 1800, {
          bufferMinutes: 30,
          pricingType: "range",
          priceMin: 1200,
          priceMax: 2500
        })
      ])
    ]
  },
  {
    id: "sauna",
    mode: "flexible",
    displayName: L("ساونا وحمام بخار", "Sauna & steam"),
    description: L("جلسات ساونا وبخار مع مقدم خدمة أو غرفة", "Sauna and steam sessions with provider or room"),
    labels: {
      ar: { customer: "العملاء", staff: "المعالجين", department: "الغرف", service: "الجلسات", appointment: "الحجوزات" },
      en: { customer: "Guests", staff: "Therapists", department: "Rooms", service: "Sessions", appointment: "Bookings" }
    },
    defaults: {
      ar: { customer_singular: "عميل", staff_singular: "معالج", department_singular: "غرفة" },
      en: { customer_singular: "Guest", staff_singular: "Therapist", department_singular: "Room" }
    },
    categories: [
      category("sauna-steam", L("ساونا وبخار", "Sauna & steam"), [
        service("sauna-session-30", L("جلسة ساونا 30 دقيقة", "Sauna 30 min"), 30, 120, {
          bufferMinutes: 10,
          occupancyMode: "exclusive"
        }),
        service("sauna-session-60", L("جلسة ساونا 60 دقيقة", "Sauna 60 min"), 60, 200, {
          bufferMinutes: 10,
          occupancyMode: "exclusive"
        }),
        service("steam-session-45", L("حمام بخار 45 دقيقة", "Steam 45 min"), 45, 160, {
          bufferMinutes: 10,
          occupancyMode: "exclusive"
        })
      ]),
      category("sauna-packages", L("باقات العافية", "Wellness packages"), [
        service("sauna-massage-combo", L("ساونا + مساج", "Sauna + massage"), 90, 450, {
          bufferMinutes: 15,
          occupancyMode: "exclusive",
          compositionDefault: "bundle"
        })
      ])
    ]
  },
  {
    id: "consultant",
    mode: "flexible",
    displayName: L("استشاري", "Consultant"),
    description: L("استشارات مهنية", "Professional consulting"),
    labels: {
      ar: { customer: "العملاء", staff: "الاستشاريون", department: "التخصصات", service: "الجلسات", appointment: "المواعيد" },
      en: { customer: "Clients", staff: "Consultants", department: "Specialties", service: "Sessions", appointment: "Appointments" }
    },
    defaults: {
      ar: { customer_singular: "عميل", staff_singular: "استشاري", department_singular: "تخصص" },
      en: { customer_singular: "Client", staff_singular: "Consultant", department_singular: "Specialty" }
    },
    categories: [
      category("consult-business", L("أعمال واستراتيجية", "Business & strategy"), [
        service("consult-discovery", L("جلسة اكتشاف", "Discovery call"), 30, 0, { pricingType: "free" }),
        service("consult-strategy", L("استشارة استراتيجية", "Strategy session"), 60, 800)
      ]),
      category("consult-career", L("تطوير مهني", "Career"), [
        service("consult-career", L("جلسة تطوير مهني", "Career coaching"), 45, 450)
      ]),
      category("consult-custom", L("مخصص", "Custom"), [
        service("consult-custom", L("استشارة حسب الطلب", "Custom consultation"), 60, 0, {
          pricingType: "on_request"
        })
      ])
    ]
  },
  {
    id: "education",
    mode: "flexible",
    displayName: L("مركز تعليمي", "Education center"),
    description: L("دروس وتدريب ومراكز تعليم", "Lessons, tutoring, and training centers"),
    labels: {
      ar: { customer: "الطلاب", staff: "المدربون", department: "المواد والبرامج", service: "الدورات", appointment: "الحصص" },
      en: { customer: "Students", staff: "Instructors", department: "Subjects & programs", service: "Courses", appointment: "Classes" }
    },
    defaults: {
      ar: { customer_singular: "طالب", staff_singular: "مدرب", department_singular: "مادة" },
      en: { customer_singular: "Student", staff_singular: "Instructor", department_singular: "Subject" }
    },
    categories: [
      category("edu-languages", L("اللغات", "Languages"), [
        service("edu-en-private", L("حصة إنجليزية فردية", "Private English lesson"), 60, 250, {
          occupancyMode: "exclusive"
        }),
        service("edu-en-group", L("حصة إنجليزية جماعية", "Group English class"), 90, 150, {
          bufferMinutes: 10,
          occupancyMode: "session_capacity",
          defaultCapacity: 20
        }),
        service("edu-placement", L("اختبار تحديد مستوى", "Placement test"), 45, 100, {
          autoComplete: true,
          occupancyMode: "exclusive"
        })
      ]),
      category("edu-academic", L("الدعم الأكاديمي", "Academic tutoring"), [
        service("edu-math", L("تقوية رياضيات", "Math tutoring"), 60, 200, {
          occupancyMode: "session_capacity",
          defaultCapacity: 30
        }),
        service("edu-science", L("تقوية علوم", "Science tutoring"), 60, 200, {
          occupancyMode: "session_capacity",
          defaultCapacity: 30
        })
      ]),
      category("edu-exams", L("التحضير للاختبارات", "Test prep"), [
        service("edu-ielts", L("تحضير IELTS", "IELTS prep"), 90, 350, {
          bufferMinutes: 10,
          occupancyMode: "session_capacity",
          defaultCapacity: 15
        }),
        service("edu-sat", L("تحضير اختبارات دولية", "International exam prep"), 90, 400, {
          occupancyMode: "session_capacity",
          defaultCapacity: 15
        })
      ]),
      category("edu-skills", L("مهارات وتطوير", "Skills & soft skills"), [
        service("edu-workshop", L("ورشة عمل", "Workshop"), 120, 300, {
          bufferMinutes: 15,
          occupancyMode: "session_capacity",
          defaultCapacity: 40
        }),
        service("edu-soft", L("مهارات تواصل", "Communication skills"), 60, 220, {
          occupancyMode: "session_capacity",
          defaultCapacity: 20
        })
      ])
    ]
  },
  {
    id: "school",
    mode: "flexible",
    displayName: L("مدرسة", "School"),
    description: L("مدارس وحلقات تعليم", "Schools and learning circles"),
    labels: {
      ar: { customer: "الطلاب", staff: "المعلمون", department: "المواد", service: "الحصص", appointment: "الحصص" },
      en: { customer: "Students", staff: "Teachers", department: "Subjects", service: "Lessons", appointment: "Classes" }
    },
    defaults: {
      ar: { customer_singular: "طالب", staff_singular: "معلم", department_singular: "مادة" },
      en: { customer_singular: "Student", staff_singular: "Teacher", department_singular: "Subject" }
    },
    categories: [
      category("school-core", L("المواد الأساسية", "Core subjects"), [
        service("school-math", L("حصة رياضيات", "Math class"), 45, 120, {
          occupancyMode: "session_capacity",
          defaultCapacity: 40
        }),
        service("school-arabic", L("حصة لغة عربية", "Arabic class"), 45, 120, {
          occupancyMode: "session_capacity",
          defaultCapacity: 40
        }),
        service("school-english", L("حصة لغة إنجليزية", "English class"), 45, 120, {
          occupancyMode: "session_capacity",
          defaultCapacity: 40
        })
      ]),
      category("school-science", L("العلوم", "Sciences"), [
        service("school-physics", L("حصة فيزياء", "Physics class"), 45, 140, {
          occupancyMode: "session_capacity",
          defaultCapacity: 35
        }),
        service("school-chem", L("حصة كيمياء", "Chemistry class"), 45, 140, {
          occupancyMode: "session_capacity",
          defaultCapacity: 35
        })
      ]),
      category("school-support", L("الدعم والإرشاد", "Support"), [
        service("school-parent", L("لقاء أولياء الأمور", "Parent meeting"), 30, 0, {
          pricingType: "free",
          occupancyMode: "exclusive"
        }),
        service("school-remedial", L("حصة تقوية", "Remedial session"), 45, 100, {
          occupancyMode: "session_capacity",
          defaultCapacity: 20
        })
      ])
    ]
  },
  {
    id: "fitness",
    mode: "flexible",
    displayName: L("مركز رياضي", "Fitness center"),
    description: L("جيم وحصص تدريب", "Gyms and training classes"),
    labels: {
      ar: { customer: "المشتركين", staff: "المدربين", department: "القاعات", service: "الحصص", appointment: "الحجوزات" },
      en: { customer: "Members", staff: "Trainers", department: "Studios", service: "Classes", appointment: "Bookings" }
    },
    defaults: {
      ar: { customer_singular: "مشترك", staff_singular: "مدرب", department_singular: "قاعة" },
      en: { customer_singular: "Member", staff_singular: "Trainer", department_singular: "Studio" }
    },
    categories: [
      category("fit-pt", L("تدريب شخصي", "Personal training"), [
        service("fit-pt-session", L("جلسة تدريب شخصي", "PT session"), 60, 400, {
          bufferMinutes: 10,
          occupancyMode: "exclusive"
        }),
        service("fit-assessment", L("تقييم لياقة", "Fitness assessment"), 45, 200, {
          occupancyMode: "exclusive"
        })
      ]),
      category("fit-group", L("حصص جماعية", "Group classes"), [
        service("fit-yoga", L("يوغا", "Yoga"), 60, 150, {
          bufferMinutes: 10,
          occupancyMode: "session_capacity",
          defaultCapacity: 20
        }),
        service("fit-hiit", L("HIIT", "HIIT"), 45, 160, {
          bufferMinutes: 10,
          occupancyMode: "session_capacity",
          defaultCapacity: 16
        }),
        service("fit-spin", L("سبيننج", "Spinning"), 45, 140, {
          occupancyMode: "session_capacity",
          defaultCapacity: 20
        })
      ]),
      category("fit-plans", L("الباقات", "Membership plans"), [
        service("fit-intro", L("جلسة تعريفية", "Intro session"), 30, 0, {
          pricingType: "free",
          occupancyMode: "exclusive"
        }),
        service("fit-custom-plan", L("خطة تدريب مخصصة", "Custom training plan"), 60, 0, {
          pricingType: "on_request",
          occupancyMode: "exclusive"
        })
      ])
    ]
  },
  {
    id: "carwash",
    mode: "flexible",
    displayName: L("غسيل سيارة", "Car wash"),
    description: L("غسيل وتلميع سيارات", "Car wash and detailing"),
    labels: {
      ar: { customer: "العملاء", staff: "الفنيين", department: "الباقات", service: "الخدمات", appointment: "الحجوزات" },
      en: { customer: "Customers", staff: "Technicians", department: "Packages", service: "Services", appointment: "Bookings" }
    },
    defaults: {
      ar: { customer_singular: "عميل", staff_singular: "فني", department_singular: "باقة" },
      en: { customer_singular: "Customer", staff_singular: "Technician", department_singular: "Package" }
    },
    categories: [
      category("car-exterior", L("غسيل خارجي", "Exterior"), [
        service("car-ext-basic", L("غسيل سريع", "Express wash"), 20, 80, { autoComplete: true }),
        service("car-ext-full", L("غسيل خارجي كامل", "Full exterior wash"), 40, 140)
      ]),
      category("car-interior", L("غسيل داخلي", "Interior"), [
        service("car-int", L("تنظيف داخلي", "Interior clean"), 45, 180, { bufferMinutes: 10 })
      ]),
      category("car-detail", L("تلميع وتفصيل", "Detailing"), [
        service("car-polish", L("تلميع وحماية", "Polish & protect"), 90, 450, { bufferMinutes: 15 }),
        service("car-full-detail", L("تفصيل كامل", "Full detail"), 150, 900, {
          bufferMinutes: 20,
          pricingType: "range",
          priceMin: 700,
          priceMax: 1500
        })
      ])
    ]
  },
  {
    id: "events",
    mode: "flexible",
    displayName: L("تنظيم الأحداث", "Event planning"),
    description: L("فعاليات وحجوزات", "Events and bookings"),
    labels: {
      ar: { customer: "العملاء", staff: "المنظمين", department: "الباقات", service: "الخدمات", appointment: "الحجوزات" },
      en: { customer: "Clients", staff: "Planners", department: "Packages", service: "Services", appointment: "Bookings" }
    },
    defaults: {
      ar: { customer_singular: "عميل", staff_singular: "منظم", department_singular: "باقة" },
      en: { customer_singular: "Client", staff_singular: "Planner", department_singular: "Package" }
    },
    categories: [
      category("events-consult", L("الاستشارات", "Consultations"), [
        service("events-intro", L("استشارة أولية", "Initial consultation"), 45, 0, { pricingType: "free" }),
        service("events-planning", L("جلسة تخطيط", "Planning session"), 60, 500)
      ]),
      category("events-packages", L("باقات الفعاليات", "Event packages"), [
        service("events-small", L("فعالية صغيرة", "Small event package"), 120, 2500, {
          pricingType: "range",
          priceMin: 1500,
          priceMax: 5000
        }),
        service("events-custom", L("تنظيم حسب الطلب", "Custom event"), 180, 0, { pricingType: "on_request" })
      ]),
      category("events-venue", L("حجز القاعة", "Venue booking"), [
        service("events-hall-hour", L("حجز قاعة بالساعة", "Hall hourly booking"), 60, 400)
      ])
    ]
  },
  {
    id: "pets",
    mode: "flexible",
    displayName: L("رعاية حيوانات أليفة", "Pet care"),
    description: L("عيادات وخدمات حيوانات", "Pet clinics and services"),
    labels: {
      ar: { customer: "أصحاب الحيوانات", staff: "الأطباء", department: "الخدمات", service: "الخدمات", appointment: "المواعيد" },
      en: { customer: "Pet owners", staff: "Vets", department: "Services", service: "Services", appointment: "Appointments" }
    },
    defaults: {
      ar: { customer_singular: "عميل", staff_singular: "طبيب", department_singular: "خدمة" },
      en: { customer_singular: "Owner", staff_singular: "Vet", department_singular: "Service" }
    },
    categories: [
      category("pets-clinic", L("العيادة البيطرية", "Veterinary clinic"), [
        service("pets-checkup", L("فحص عام", "General checkup"), 30, 200),
        service("pets-vaccine", L("تطعيم", "Vaccination"), 20, 180, { autoComplete: true }),
        service("pets-follow", L("متابعة", "Follow-up"), 15, 100)
      ]),
      category("pets-groom", L("العناية والتجميل", "Grooming"), [
        service("pets-bath", L("استحمام وقص", "Bath & trim"), 60, 250, { bufferMinutes: 15 }),
        service("pets-full-groom", L("عناية كاملة", "Full groom"), 90, 400, { bufferMinutes: 20 })
      ]),
      category("pets-surgery", L("جراحة واستشارات", "Surgery & consults"), [
        service("pets-surgery-consult", L("استشارة جراحية", "Surgery consultation"), 30, 250),
        service("pets-procedure", L("إجراء حسب الحالة", "Case procedure"), 60, 0, { pricingType: "on_request" })
      ])
    ]
  },
  {
    id: "billiards",
    mode: "flexible",
    displayName: L("صالة بلياردو", "Billiards hall"),
    description: L("طاولات وألعاب بالساعة — فتح جلسة حية أو حجز مدة", "Tables and hourly play — live session or timed rental"),
    labels: {
      ar: { customer: "العملاء", staff: "المشرفين", department: "القاعات والطاولات", service: "الباقات", appointment: "الحجوزات" },
      en: { customer: "Players", staff: "Supervisors", department: "Rooms & tables", service: "Packages", appointment: "Bookings" }
    },
    defaults: {
      ar: { customer_singular: "عميل", staff_singular: "مشرف", department_singular: "قاعة" },
      en: { customer_singular: "Player", staff_singular: "Supervisor", department_singular: "Room" }
    },
    categories: [
      category("bill-tables", L("الطاولات", "Tables"), [
        service("bill-hour", L("طاولة بالساعة", "Table per hour"), 60, 100, {
          autoComplete: true,
          occupancyMode: "rental",
          defaultCapacity: 1
        }),
        service("bill-half", L("طاولة نصف ساعة", "Table 30 min"), 30, 60, {
          autoComplete: true,
          occupancyMode: "rental",
          defaultCapacity: 1
        }),
        service("bill-open-tab", L("فتح طاولة (عداد حي)", "Open table (live tab)"), 60, 0, {
          pricingType: "on_request",
          occupancyMode: "rental",
          defaultCapacity: 1,
          publicBooking: false
        })
      ]),
      category("bill-coaching", L("تدريب", "Coaching"), [
        service("bill-lesson", L("حصة تدريب", "Coaching session"), 60, 200, {
          occupancyMode: "exclusive"
        })
      ]),
      category("bill-events", L("بطولات وفعاليات", "Tournaments"), [
        service("bill-tournament", L("حجز بطولة", "Tournament booking"), 180, 0, {
          pricingType: "on_request",
          occupancyMode: "rental"
        })
      ])
    ]
  },
  {
    id: "sports",
    mode: "flexible",
    displayName: L("ملاعب وأنشطة رياضية", "Sports courts"),
    description: L("تنس وبادل وملاعب تُحجز بالمدة أو تُفتح جلسة حية", "Tennis, padel, and courts rented by time or live session"),
    labels: {
      ar: { customer: "اللاعبين", staff: "المشرفين", department: "الملاعب", service: "الحجوزات", appointment: "الحجوزات" },
      en: { customer: "Players", staff: "Supervisors", department: "Courts", service: "Bookings", appointment: "Bookings" }
    },
    defaults: {
      ar: { customer_singular: "لاعب", staff_singular: "مشرف", department_singular: "ملعب" },
      en: { customer_singular: "Player", staff_singular: "Supervisor", department_singular: "Court" }
    },
    categories: [
      category("sports-courts", L("الملاعب", "Courts"), [
        service("sports-court-60", L("ملعب ساعة", "Court 60 min"), 60, 250, {
          occupancyMode: "rental",
          defaultCapacity: 1
        }),
        service("sports-court-90", L("ملعب 90 دقيقة", "Court 90 min"), 90, 350, {
          occupancyMode: "rental",
          defaultCapacity: 1
        })
      ]),
      category("sports-coaching", L("تدريب", "Coaching"), [
        service("sports-lesson", L("حصة تدريب فردي", "Private coaching"), 60, 400, {
          occupancyMode: "exclusive"
        }),
        service("sports-group", L("حصة جماعية", "Group class"), 60, 150, {
          occupancyMode: "session_capacity",
          defaultCapacity: 8
        })
      ])
    ]
  },
  {
    id: "gaming",
    mode: "flexible",
    displayName: L("صالة ألعاب", "Gaming center"),
    description: L("أجهزة وطاولات ألعاب بالوقت الحقيقي", "Consoles and game stations with live usage sessions"),
    labels: {
      ar: { customer: "اللاعبين", staff: "المشرفين", department: "المحطات", service: "الباقات", appointment: "الجلسات" },
      en: { customer: "Players", staff: "Supervisors", department: "Stations", service: "Packages", appointment: "Sessions" }
    },
    defaults: {
      ar: { customer_singular: "لاعب", staff_singular: "مشرف", department_singular: "محطة" },
      en: { customer_singular: "Player", staff_singular: "Supervisor", department_singular: "Station" }
    },
    categories: [
      category("gaming-stations", L("المحطات", "Stations"), [
        service("game-pc-hour", L("جهاز PC بالساعة", "PC per hour"), 60, 40, {
          occupancyMode: "rental",
          defaultCapacity: 1,
          autoComplete: true
        }),
        service("game-console-hour", L("كونسول بالساعة", "Console per hour"), 60, 50, {
          occupancyMode: "rental",
          defaultCapacity: 1,
          autoComplete: true
        }),
        service("game-open-tab", L("فتح جلسة حية", "Open live session"), 60, 0, {
          pricingType: "on_request",
          occupancyMode: "rental",
          publicBooking: false
        })
      ]),
      category("gaming-events", L("بطولات", "Tournaments"), [
        service("game-tournament", L("حجز بطولة", "Tournament booking"), 180, 0, {
          pricingType: "on_request",
          occupancyMode: "rental"
        })
      ])
    ]
  },
  {
    id: "custom",
    mode: "flexible",
    displayName: L("صناعة مخصصة", "Custom business"),
    description: L("نشاط مرن قابل للتخصيص بالكامل", "Fully customizable activity"),
    labels: {
      ar: { customer: "العملاء", staff: "الفريق", department: "الأقسام", service: "الخدمات", appointment: "المواعيد" },
      en: { customer: "Customers", staff: "Team", department: "Departments", service: "Services", appointment: "Appointments" }
    },
    defaults: {
      ar: { customer_singular: "عميل", staff_singular: "موظف", department_singular: "قسم" },
      en: { customer_singular: "Customer", staff_singular: "Staff", department_singular: "Department" }
    },
    categories: []
  },
  {
    id: "other",
    mode: "flexible",
    displayName: L("نشاط مخصص", "Other activity"),
    description: L("أي نشاط يعتمد على الخدمات والحجوزات", "Any service-based booking activity"),
    labels: {
      ar: { customer: "العملاء", staff: "الفريق", department: "الأقسام", service: "الخدمات", appointment: "المواعيد" },
      en: { customer: "Customers", staff: "Team", department: "Departments", service: "Services", appointment: "Appointments" }
    },
    defaults: {
      ar: { customer_singular: "عميل", staff_singular: "موظف", department_singular: "قسم" },
      en: { customer_singular: "Customer", staff_singular: "Staff", department_singular: "Department" }
    },
    categories: [],
    aliasOf: "custom"
  }
];

const TEMPLATE_BY_ID = new Map(TEMPLATES.map((item) => [item.id, item]));

function normalizeLocale(locale) {
  const code = String(locale || "ar").toLowerCase().slice(0, 2);
  return code === "en" ? "en" : "ar";
}

function localizeText(value, locale = "ar") {
  if (value == null) return "";
  if (typeof value === "string") return value;
  const lang = normalizeLocale(locale);
  return value[lang] || value.ar || value.en || "";
}

function resolveTemplateId(activityType) {
  const id = String(activityType || "medical").trim().toLowerCase();
  if (id === "other") return "other";
  if (TEMPLATE_BY_ID.has(id)) return id;
  return "custom";
}

function getTemplate(activityType) {
  const id = resolveTemplateId(activityType);
  return TEMPLATE_BY_ID.get(id) || TEMPLATE_BY_ID.get("custom");
}

function listTemplates(locale = "ar") {
  const lang = normalizeLocale(locale);
  return TEMPLATES.filter((item) => item.id !== "other").map((item) => {
    const bookingType = statusMachines.bookingTypeForTemplate(item.id);
    return {
      id: item.id,
      mode: item.mode,
      bookingType,
      occupancyModeDefault: statusMachines.occupancyForBookingType(bookingType),
      displayName: localizeText(item.displayName, lang),
      displayNameI18n: item.displayName,
      description: localizeText(item.description, lang),
      descriptionI18n: item.description,
      empty: !item.categories?.length,
      categoryCount: item.categories?.length || 0,
      serviceCount: (item.categories || []).reduce((sum, cat) => sum + (cat.services?.length || 0), 0)
    };
  });
}

function templateMeta(activityType, locale = "ar") {
  const template = getTemplate(activityType);
  const lang = normalizeLocale(locale);
  const bookingType = statusMachines.bookingTypeForTemplate(template.id);
  return {
    id: template.id,
    mode: template.mode,
    bookingType,
    occupancyModeDefault: statusMachines.occupancyForBookingType(bookingType),
    displayName: localizeText(template.displayName, lang),
    description: localizeText(template.description, lang),
    labels: template.labels?.[lang] || template.labels?.ar || {},
    defaults: template.defaults?.[lang] || template.defaults?.ar || {},
    labelsI18n: template.labels,
    defaultsI18n: template.defaults,
    empty: !template.categories?.length
  };
}

function buildSeedFromTemplate(activityType, locale = "ar", options = {}) {
  const template = getTemplate(activityType);
  const lang = normalizeLocale(locale);
  const keepDemoStaff = options.keepDemoStaff === true;
  const categories = [];
  const services = [];
  const templateBookingType = statusMachines.bookingTypeForTemplate(template.id);
  const templateOccupancy = statusMachines.occupancyForBookingType(templateBookingType);

  (template.categories || []).forEach((cat, sort) => {
    categories.push({
      id: cat.id,
      name: localizeText(cat.name, lang),
      nameI18n: cat.name,
      sort,
      enabled: true
    });

    (cat.services || []).forEach((svc) => {
      const pricingType = svc.pricingType || "fixed";
      const occupancyMode = svc.occupancyMode || templateOccupancy;
      services.push({
        id: svc.id,
        categoryId: cat.id,
        name: localizeText(svc.name, lang),
        nameI18n: svc.name,
        durationMinutes: svc.durationMinutes,
        bufferMinutes: svc.bufferMinutes || 0,
        pricingType,
        price: pricingType === "fixed" ? Number(svc.price || 0) : pricingType === "range" ? Number(svc.priceMin || svc.price || 0) : 0,
        priceMin: pricingType === "range" ? Number(svc.priceMin ?? svc.price ?? 0) : null,
        priceMax: pricingType === "range" ? Number(svc.priceMax ?? svc.price ?? 0) : null,
        color: svc.color || "#1967e8",
        providerIds: [],
        publicBooking: svc.publicBooking !== false,
        autoAccept: svc.autoAccept !== false,
        autoComplete: Boolean(svc.autoComplete),
        description: localizeText(svc.description, lang),
        occupancyMode,
        compositionDefault: svc.compositionDefault || "single",
        defaultCapacity: Math.max(1, Number(svc.defaultCapacity || 1)),
        status: "active",
        enabled: true
      });
    });
  });

  const medicalDepartments =
    template.mode === "medical"
      ? (template.medicalDepartments || MEDICAL_DEPARTMENTS).map((department) => ({
          id: department.id,
          name: localizeText(department.name, lang),
          nameI18n: department.name,
          enabled: true
        }))
      : [];

  const bookingType = statusMachines.bookingTypeForTemplate(template.id);

  return {
    templateId: template.id,
    activityMode: template.mode,
    bookingType,
    occupancyModeDefault: statusMachines.occupancyForBookingType(bookingType),
    labels: template.labels?.[lang] || template.labels?.ar || {},
    labelsI18n: template.labels,
    serviceCategories: categories,
    services,
    medicalDepartments,
    staff: keepDemoStaff
      ? undefined
      : [
          { id: "staff-owner", name: "المسؤول", title: localizeText(L("مشرف", "Supervisor"), lang), active: true }
        ],
    industry: template.id === "medical" ? "healthcare" : template.id
  };
}

function applyTemplateToStoreData(data, activityType, locale = "ar", options = {}) {
  const seed = buildSeedFromTemplate(activityType, locale, options);
  data.activityTemplateId = seed.templateId;
  data.activityMode = seed.activityMode;
  data.bookingType = seed.bookingType;
  data.occupancyModeDefault = seed.occupancyModeDefault;
  data.serviceCategories = seed.serviceCategories;
  data.services = seed.services;
  data.medicalDepartments = seed.medicalDepartments;
  data.activityLabels = seed.labels;
  data.activityLabelsI18n = seed.labelsI18n;
  if (seed.staff && options.replaceStaff !== false) {
    data.staff = seed.staff;
  }
  if (data.bookingPage) {
    data.bookingPage.industry = seed.industry;
  }
  return data;
}

function allTemplateIds() {
  return TEMPLATES.map((item) => item.id);
}

module.exports = {
  MEDICAL_DEPARTMENTS,
  TEMPLATES,
  localizeText,
  normalizeLocale,
  resolveTemplateId,
  getTemplate,
  listTemplates,
  templateMeta,
  buildSeedFromTemplate,
  applyTemplateToStoreData,
  allTemplateIds
};
