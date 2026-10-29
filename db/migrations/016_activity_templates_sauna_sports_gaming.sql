-- Add sauna / sports / gaming activity templates for multi-purpose Maw3ed.
INSERT INTO activity_templates (activity_type, display_name, description, labels, defaults)
VALUES
  ('sauna', 'ساونا وحمام بخار', 'جلسات ساونا وبخار مع مقدم خدمة أو غرفة',
   '{"customer":"العملاء","staff":"المعالجين","department":"الغرف","service":"الجلسات","appointment":"الحجوزات"}'::jsonb,
   '{"customer_singular":"عميل","staff_singular":"معالج","department_singular":"غرفة","booking_type":"APPOINTMENT","i18n":{"en":{"display_name":"Sauna & steam","customer":"Guests","staff":"Therapists","department":"Rooms","service":"Sessions","appointment":"Bookings"}},"seed":"catalog"}'::jsonb),
  ('sports', 'ملاعب وأنشطة رياضية', 'تنس وبادل وملاعب تُحجز بالمدة أو تُفتح جلسة حية',
   '{"customer":"اللاعبين","staff":"المشرفين","department":"الملاعب","service":"الحجوزات","appointment":"الحجوزات"}'::jsonb,
   '{"customer_singular":"لاعب","staff_singular":"مشرف","department_singular":"ملعب","booking_type":"RESOURCE_RENTAL","i18n":{"en":{"display_name":"Sports courts","customer":"Players","staff":"Supervisors","department":"Courts","service":"Bookings","appointment":"Bookings"}},"seed":"catalog"}'::jsonb),
  ('gaming', 'صالة ألعاب', 'أجهزة وطاولات ألعاب بالوقت الحقيقي',
   '{"customer":"اللاعبين","staff":"المشرفين","department":"المحطات","service":"الباقات","appointment":"الجلسات"}'::jsonb,
   '{"customer_singular":"لاعب","staff_singular":"مشرف","department_singular":"محطة","booking_type":"RESOURCE_RENTAL","i18n":{"en":{"display_name":"Gaming center","customer":"Players","staff":"Supervisors","department":"Stations","service":"Packages","appointment":"Sessions"}},"seed":"catalog"}'::jsonb)
ON CONFLICT (activity_type) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  labels = EXCLUDED.labels,
  defaults = EXCLUDED.defaults;

-- Annotate existing templates with booking_type hint in defaults (non-breaking).
UPDATE activity_templates
SET defaults = COALESCE(defaults, '{}'::jsonb) || jsonb_build_object(
  'booking_type',
  CASE activity_type
    WHEN 'education' THEN 'BATCH_SCHEDULE'
    WHEN 'school' THEN 'BATCH_SCHEDULE'
    WHEN 'fitness' THEN 'BATCH_SCHEDULE'
    WHEN 'billiards' THEN 'RESOURCE_RENTAL'
    WHEN 'sauna' THEN 'APPOINTMENT'
    WHEN 'sports' THEN 'RESOURCE_RENTAL'
    WHEN 'gaming' THEN 'RESOURCE_RENTAL'
    ELSE 'APPOINTMENT'
  END
)
WHERE activity_type IN (
  'medical','clinic','dentist','salon','barber','beauty','massage','spa','sauna',
  'consultant','education','school','fitness','carwash','events','pets',
  'billiards','sports','gaming','custom','other'
);
