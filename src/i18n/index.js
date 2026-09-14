export const LOCALES = [
  { code: "ar", label: "العربية", dir: "rtl" },
  { code: "en", label: "English", dir: "ltr" },
  { code: "fr", label: "Français", dir: "ltr" },
  { code: "ur", label: "اردو", dir: "rtl" },
  { code: "tr", label: "Türkçe", dir: "ltr" },
  { code: "es", label: "Español", dir: "ltr" },
  { code: "hi", label: "हिन्दी", dir: "ltr" },
  { code: "bn", label: "বাংলা", dir: "ltr" },
  { code: "de", label: "Deutsch", dir: "ltr" },
  { code: "pt", label: "Português", dir: "ltr" },
  { code: "ru", label: "Русский", dir: "ltr" },
  { code: "zh", label: "中文", dir: "ltr" },
  { code: "ja", label: "日本語", dir: "ltr" },
  { code: "ko", label: "한국어", dir: "ltr" },
  { code: "id", label: "Indonesia", dir: "ltr" }
];

const messages = {
  ar: {
    brand: "موعد",
    tagline: "إدارة المواعيد بوضوح",
    calendar: "التقويم",
    customers: "العملاء",
    staff: "الموظفون",
    schedule: "جدول العمل",
    services: "الخدمات",
    bookingPage: "صفحة الحجز",
    stats: "الإحصائيات",
    payments: "المدفوعات",
    expenses: "المصروفات",
    marketing: "تسويق",
    notifications: "مركز الإشعارات",
    preferences: "تفضيلات التقويم",
    integrations: "التكاملات",
    settings: "الإعدادات",
    free: "مجاني",
    add: "إضافة",
    save: "حفظ",
    cancel: "إلغاء",
    search: "بحث",
    empty: "لا توجد بيانات بعد",
    loading: "جارٍ التحميل...",
    createAppointment: "موعد جديد",
    publicBooking: "صفحة الحجز العامة",
    poweredBy: "مدعوم من موعد · UpNexa-eg.com"
  },
  en: {
    brand: "Maw3ed",
    tagline: "Appointments, clearly managed",
    calendar: "Calendar",
    customers: "Customers",
    staff: "Staff",
    schedule: "Working schedule",
    services: "Services",
    bookingPage: "Booking page",
    stats: "Statistics",
    payments: "Payments",
    expenses: "Expenses",
    marketing: "Marketing",
    notifications: "Notification center",
    preferences: "Calendar preferences",
    integrations: "Integrations",
    settings: "Settings",
    free: "Free",
    add: "Add",
    save: "Save",
    cancel: "Cancel",
    search: "Search",
    empty: "Nothing here yet",
    loading: "Loading...",
    createAppointment: "New appointment",
    publicBooking: "Public booking page",
    poweredBy: "Powered by Maw3ed · UpNexa-eg.com"
  }
};

export function t(locale, key) {
  return messages[locale]?.[key] || messages.en[key] || messages.ar[key] || key;
}

export function applyDocumentLocale(locale) {
  const meta = LOCALES.find((item) => item.code === locale) || LOCALES[0];
  document.documentElement.lang = meta.code;
  document.documentElement.dir = meta.dir;
  return meta;
}
