/** Job titles suggested by activity template (plus shared general roles). */
export const GENERAL_JOB_TITLES = [
  "مدير",
  "مشرف",
  "استقبال",
  "مقدم خدمة",
  "محاسب",
  "منسق حجوزات",
  "مساعد إداري"
];

export const JOB_TITLES_BY_TEMPLATE = {
  medical: ["طبيب", "طبيبة", "ممرض", "ممرضة", "أخصائي", "فني مختبر", "فني أشعة", "صيدلي", "مدير عيادة", "استقبال"],
  clinic: ["طبيب", "ممرض", "استقبال", "أخصائي", "مدير عيادة"],
  dentist: ["طبيب أسنان", "مساعد أسنان", "فني أسنان", "استقبال", "مدير عيادة"],
  salon: ["مصفف شعر", "مصففة شعر", "فني صبغة", "استقبال", "مدير صالون"],
  barber: ["حلاق", "استقبال", "مدير صالون"],
  beauty: ["أخصائي تجميل", "فني عناية", "استقبال", "مدير مركز"],
  massage: ["أخصائي مساج", "معالج", "استقبال"],
  spa: ["أخصائي سبا", "معالج", "استقبال", "مدير سبا"],
  sauna: ["معالج", "مشرف غرف", "استقبال", "مدير"],
  consultant: ["استشاري", "مدرب", "منسق", "استقبال"],
  education: ["معلم", "مدرب", "منسق تعليمي", "استقبال"],
  school: ["معلم", "مشرف", "إداري", "استقبال"],
  fitness: ["مدرب رياضي", "مدرب شخصي", "استقبال", "مدير صالة"],
  carwash: ["عامل غسيل", "مشرف", "استقبال"],
  events: ["منسق فعاليات", "مشرف", "استقبال"],
  pets: ["طبيب بيطري", "ممرض بيطري", "استقبال"],
  billiards: ["مشرف صالة", "استقبال", "محاسب"],
  sports: ["مشرف ملعب", "مدرب", "استقبال", "محاسب"],
  gaming: ["مشرف صالة", "استقبال", "محاسب"],
  custom: GENERAL_JOB_TITLES
};

export function jobTitlesForTemplate(templateId) {
  const specific = JOB_TITLES_BY_TEMPLATE[templateId] || JOB_TITLES_BY_TEMPLATE.custom;
  return [...new Set([...specific, ...GENERAL_JOB_TITLES])];
}
