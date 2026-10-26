# حضور وتشغيل القسم (Department Desk)

## الهدف
شاشة تشغيل سريعة لمشرف القسم/الاستقبال: تسجيل حضور عبر QR، زيارة نشطة، إضافة خدمات أثناء التواجد، وتثبيت أسعار النطاق / عند الطلب عند إنهاء الجلسة — مع عزل حسب فئة الخدمة.

## تدفق العميل
1. بعد تأكيد الحجز يُنشأ `checkInToken` غير قابل للتخمين (`chk_` + عشوائي).
2. صفحة التأكيد تعرض QR يفتح `/pass.html?slug=…&token=…`.
3. البطاقة العامة: `GET /api/public/booking/:slug/pass/:token`.

## مسح QR (QrCodeScanner)
ثلاثة أوضاع على شاشة الحضور:
1. **ماسح USB / بلوتوث (HID):** يعمل كلوحة مفاتيح — ركّز الحقل وامسح مباشرة.
2. **كاميرا QR:** مكتبة `html5-qrcode` مع اختيار الكاميرا.
3. **إدخال يدوي:** لصق الرمز أو رابط البطاقة.

الوضع المفضّل يُحفظ في `localStorage` تحت `maw3ed.desk.scanMode`.

## تدفق الاستقبال
1. قائمة اليوم: `GET /api/ops/desk/today?categoryId=`
2. مسح QR أو لصق الرمز → `POST /api/ops/desk/check-in`  
   يتحقق من: الرمز · نفس اليوم · يحوّل الحالة إلى `checked_in` ويسجّل `checkedInAt` + يحسب `expectedEndAt` من مجموع مدد `lineItems`.
3. إضافة خدمة: `POST /api/ops/desk/appointments/:id/addons` (خدمات نفس الفئة فقط) → تحديث قائمة الخدمات المقدَّمة فوراً وتمديد `expectedEndAt`.
4. تسعير بند أثناء الجلسة (اختياري): `PATCH /api/ops/desk/appointments/:id/lines/:lineId/pricing` مع `{ amount }`.
5. إنهاء الزيارة (زر أو تلقائي بعد انتهاء المدة): تقرير بكل البنود → `POST /api/ops/desk/appointments/:id/complete` مع `{ linePrices, autoEnded? }` → `completed`.

## تسعير الجلسة (range / on_request)
- كل بند في `lineItems` يحمل: `pricingType`, `priceMin`, `priceMax`, `pricingStatus`, `durationMinutes`, `needsFinalPrice`.
- **نطاق:** يبقى `range_deposit` حتى يُدخل السعر النهائي ضمن النطاق → `range_final`.
- **عند الطلب:** يبقى `quote_pending` حتى إدخال العرض → `quoted`.
- الإنهاء مرفوض إن بقي أي بند `needsFinalPrice`.
- عند انتهاء `expectedEndAt` تفتح الواجهة تقرير التسعير تلقائياً (`autoEnded`); لا يُغلق الموعد صامتاً دون أسعار.

## البيانات على الموعد
- `checkInToken`, `checkedInAt`, `checkedInByStaffId`, `expectedEndAt`, `completedAt`, `completedAuto`
- `lineItems[]` (primary + addon) مع حقول التسعير والمدة
- `visitLog[]` (check_in / addon / line_pricing / complete)
- `status`: يشمل `checked_in`
- حقول مشتقة في استجابة المكتب: `pricingPending`, `autoEndDue`, `visitDurationMinutes`, `remainingMinutes`

## تخزين بذرة المستشفى
- في وضع PostgreSQL، وللمساحات المسجّلة في جدول `workspaces`، يحمّل `/api/ops/*` بيانات مساحة العمل ويحفظها داخل معاملة في الجداول المطبّعة التي تنشئها migration `010_normalized_workspace_ops.sql`.
- في الوضع المحلي دون PostgreSQL، يستمر التخزين عبر ملفات مساحة العمل JSON.
- البذرة المحفوظة في `data/seeds/medical-demo-ops.json` تضم بيانات الطاقم والخدمات والمواعيد. استعادة البذرة إلى مساحة طبية محددة:

```bash
npm run migrate
npm run seed:medical:restore -- --workspace=WORKSPACE_ID --replace
```

`--replace` يستبدل بيانات التشغيل الحالية في مساحة العمل؛ احفظ نسخة احتياطية قبل استخدامه على بيانات قائمة. حذف الخيار يدمج البذرة مع البيانات الحالية.

يتضمن ملف البذرة الحالي 248 موظفاً و225 خدمة و40 عميلاً و181 موعداً؛ تُستخدم هذه الأعداد كفحص سريع بعد الاستعادة.

يوسّع تقويم الإدارة نافذته لتشمل ساعات المنشأة والورديات الليلية، مع الإبقاء على نافذة 08:00–20:00 المعتادة.

## الصلاحيات (مرحلة حالية)
- عزل تشغيلي عبر اختيار القسم على الشاشة + فلترة الحجوزات.
- دور الواجهة `reception` يمكنه فتح شاشة الحضور؛ ربط حساب موظف بقسم (`serviceCategoryId`) يُستخدم لاختيار مشرف الاستقبال.
- RBAC صارم متعدد المستأجرين على مستوى API ما زال مفتوحاً للتعميق مع هويات Clerk/موظفين.

## مفتوح لاحقاً
- إرسال بطاقة QR تلقائياً عبر WhatsApp/SMS بعد الحجز.
- رابط دفع سريع للمبلغ الإضافي / عرض السعر للعميل.
