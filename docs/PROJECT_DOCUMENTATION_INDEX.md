# فهرس وثائق Maw3ed

## وثائق التحليل والمواصفة الجديدة

- [تقرير الفجوات وجاهزية الإنتاج](PRODUCTION_READINESS_REPORT.md) — نتائج الفحص الساكن والخطورة وترتيب معالجة العوائق.
- [سجل تنفيذ الخارطة](IMPLEMENTATION_EXECUTION_LOG.md) — تقدم المراحل وما اكتمل فعلياً ونقطة الاستئناف (المصدر العربي التشغيلي).
- [تتبع تقدم المراحل آلياً](ROADMAP_PROGRESS.json) — حالة المراحل وchecklist و`resume_pointer` يُحدَّث مع سجل التنفيذ بعد كل حزمة.
- [سلامة بيانات التشغيل JSON/PG](WORKSPACE_OPS_DATA_INTEGRITY.md) — مصدر الحقيقة، جرد FK المركبة، مقارنة اللقطات، دفتر الترحيل، واستعادة JSON.
- [ربط حساب الموظف بالـ desk](STAFF_ACCOUNT_LINKS.md) — نموذج junction (مستخدم↔موظف داخل workspace)، اختيار السياق، وإنفاذ نطاق desk.
- [بذرة العروض الموحدة](MEDICAL_DEMO_SEED.md) — ملف واحد `maw3ed-demo-ops.json` (طبي→gmail/dawybooking، طلائع→yahoo/talaaee) + تنظيف 3 مستخدمين (`fakhry` admin بلا مساحة) عبر `seed:demo:*` و`users:cleanup-demo-owners`.
- [جرد واجهات الوصول](SECURITY_ROUTE_INVENTORY.md) — مجموعات endpoints، أدوارها، وضوابطها الحالية والمتبقية.
- [مواصفات المنتج المرجعية](PRODUCT_AND_PLATFORM_SPEC.md) — الجمهور والأدوار والرحلات والكيانات والمتطلبات ومقارنة التنفيذ.
- [تدفقات التشغيل وآلات الحالات](OPERATIONAL_FLOWS_AND_STATUS_MACHINES.md) — BookingType الثلاثة وحالات الطب/التعليم/الصالون/التأجير وربط الموظف بالفرع (موعد متعددة الأغراض).
- [خطة الإعداد للإنتاج](PRODUCTION_COMPLETION_PLAN.md) — محاور استكمال النواقص للإنتاج كمُدخل لتقارير Sam-Harness (بدون ادعاء تنفيذ مكتمل).
- [مقارنة المنصات المشابهة](REFERENCE_PLATFORM_BENCHMARK.md) — نماذج Calendly وSimplyBook.me وما يستفاد منها دون ادعاء تقليد أو تكافؤ.
- [العمارة وخط أساس الأمان والتشغيل](ARCHITECTURE_AND_SECURITY_BASELINE.md) — الحالة الحالية، تصميم مستهدف، tenant isolation، حجز متزامن، وبوابات القبول.
- [خارطة تنفيذ المشروع الموحدة](IMPLEMENTATION_ROADMAP.md) — قرارات النطاق، المراحل والبوابات، سعة المجالات، معايير القبول ومراجعة الفجوات حتى الإطلاق التدريجي.
- [نموذج مساحة طلائع والسعة والأنشطة](WORKSPACE_CAPACITY_MODEL_EDUCATION_AND_VERTICALS.md) — تحليل الهيكل التعليمي وعلاقات البيانات المطلوبة للحصص الجماعية والحجز الحصري والمركب.

## وثائق التشغيل والمنتج الموجودة

- [بوابة الحجز العامة والاستضافة والنطاق](BOOKING_PORTAL_HOSTING_DOMAIN.md)
- [صفحة الحجز العامة](public-booking-page.md)
- [لوحة التشغيل](admin-dashboard.md)
- [مكتب تشغيل القسم](DEPARTMENT_DESK.md)
- [حوكمة المنصة والخدمات والتدقيق](PLATFORM_GOVERNANCE.md) — حدود الأدوار، اختلاف أنماط الحجز، فصل الواجبات، سجل التدقيق، وضوابط تفعيل المجالات.
- [منطق التسعير غير المكتمل](INCOMPLETE_LOGIC.md)
- [النشر على VPS](DEPLOY_VPS.md)
- [البيئات](ENVIRONMENTS.md)
- [التطوير والاختبار](refresh-and-test.md)
- [مسار Git — إنجليزي مختصر](GIT_WORKFLOW.md) — feature → staging → main
- [دليل Git العملي عربي](GIT-WORKFLOW-AR.md) — حفظ/stage/commit/push/PR/merge والحماية
- [المساهمة](../CONTRIBUTING.md) — hooks والمساعدات وCI

## كيفية تفسير الوثائق

الوثائق الأقدم تحتوي قرارات/أهدافاً وخصائص على مراحل مختلفة. إذا تعارض وصف قديم مع الكود أو تقرير الجاهزية، تحقق من التنفيذ الحالي قبل اعتباره وظيفة مكتملة. وجود route أو جدول أو واجهة لا يثبت اكتمال الصلاحيات أو التشغيل أو اختبارات القبول. فصل `occupancy_mode` عن `composition` مرجع قرار الحجز؛ لا تستنتج القاعدة من قالب النشاط.

## ترتيب مراجعة الإصدار

1. ابدأ بتقرير [الجاهزية](PRODUCTION_READINESS_REPORT.md).
2. راجع [المواصفة](PRODUCT_AND_PLATFORM_SPEC.md) لتحديد نطاق المنتج الذي يُراد إطلاقه.
3. استخدم [الخط الأساس](ARCHITECTURE_AND_SECURITY_BASELINE.md) لتحويل الفجوات إلى متطلبات تحقق.
4. استخدم [المقارنة المرجعية](REFERENCE_PLATFORM_BENCHMARK.md) لترتيب ميزات المنتج بعد إغلاق موانع الأمن والبيانات.
