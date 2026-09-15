-- Expanded industry templates for Maw3ed onboarding (SetTime-like catalog)
INSERT INTO activity_templates (activity_type, display_name, description, labels, defaults)
VALUES
  ('clinic', 'عيادة', 'عيادات تخصصية ومراكز كشف',
   '{"customer":"المرضى","staff":"الأطباء","department":"العيادات","service":"الخدمات","appointment":"المواعيد"}'::jsonb,
   '{"customer_singular":"مريض","staff_singular":"طبيب","department_singular":"عيادة"}'::jsonb),
  ('dentist', 'طبيب أسنان', 'عيادات طب الأسنان',
   '{"customer":"المرضى","staff":"أطباء الأسنان","department":"العيادات","service":"الخدمات","appointment":"المواعيد"}'::jsonb,
   '{"customer_singular":"مريض","staff_singular":"طبيب أسنان","department_singular":"عيادة"}'::jsonb),
  ('barber', 'صالون الحلاقة', 'حلاقة رجالية',
   '{"customer":"العملاء","staff":"الحلاقين","department":"الأقسام","service":"الخدمات","appointment":"الحجوزات"}'::jsonb,
   '{"customer_singular":"عميل","staff_singular":"حلاق","department_singular":"قسم"}'::jsonb),
  ('beauty', 'التجميل', 'مراكز التجميل والعناية',
   '{"customer":"العملاء","staff":"مختصي التجميل","department":"الأقسام","service":"الخدمات","appointment":"الحجوزات"}'::jsonb,
   '{"customer_singular":"عميل","staff_singular":"مختص","department_singular":"قسم"}'::jsonb),
  ('massage', 'تدليك', 'مساج وعلاج طبيعي خفيف',
   '{"customer":"العملاء","staff":"المعالجين","department":"الغرف","service":"الجلسات","appointment":"الحجوزات"}'::jsonb,
   '{"customer_singular":"عميل","staff_singular":"معالج","department_singular":"غرفة"}'::jsonb),
  ('spa', 'منتجع صحي', 'سبا وعافية',
   '{"customer":"العملاء","staff":"الفريق","department":"الباقات","service":"الخدمات","appointment":"الحجوزات"}'::jsonb,
   '{"customer_singular":"عميل","staff_singular":"موظف","department_singular":"باقة"}'::jsonb),
  ('consultant', 'استشاري', 'استشارات مهنية',
   '{"customer":"العملاء","staff":"الاستشاريون","department":"التخصصات","service":"الجلسات","appointment":"المواعيد"}'::jsonb,
   '{"customer_singular":"عميل","staff_singular":"استشاري","department_singular":"تخصص"}'::jsonb),
  ('school', 'مدرسة', 'مدارس وحلقات تعليم',
   '{"customer":"الطلاب","staff":"المعلمين","department":"المواد","service":"الحصص","appointment":"الحصص"}'::jsonb,
   '{"customer_singular":"طالب","staff_singular":"معلم","department_singular":"مادة"}'::jsonb),
  ('carwash', 'غسيل سيارة', 'غسيل وتلميع سيارات',
   '{"customer":"العملاء","staff":"الفنيين","department":"الباقات","service":"الخدمات","appointment":"الحجوزات"}'::jsonb,
   '{"customer_singular":"عميل","staff_singular":"فني","department_singular":"باقة"}'::jsonb),
  ('events', 'تنظيم الأحداث', 'فعاليات وحجوزات',
   '{"customer":"العملاء","staff":"المنظمين","department":"الباقات","service":"الخدمات","appointment":"الحجوزات"}'::jsonb,
   '{"customer_singular":"عميل","staff_singular":"منظم","department_singular":"باقة"}'::jsonb),
  ('pets', 'رعاية حيوانات أليفة', 'عيادات وخدمات حيوانات',
   '{"customer":"أصحاب الحيوانات","staff":"الأطباء","department":"الخدمات","service":"الخدمات","appointment":"المواعيد"}'::jsonb,
   '{"customer_singular":"عميل","staff_singular":"طبيب","department_singular":"خدمة"}'::jsonb)
ON CONFLICT (activity_type) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  labels = EXCLUDED.labels,
  defaults = EXCLUDED.defaults,
  updated_at = NOW();

UPDATE activity_templates
SET display_name = 'صالون الشعر',
    description = 'قص وتصفيف وعناية بالشعر',
    updated_at = NOW()
WHERE activity_type = 'salon';
