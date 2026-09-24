# حضور وتشغيل القسم (Department Desk)

## الهدف
شاشة تشغيل سريعة لمشرف القسم/الاستقبال: تسجيل حضور عبر QR، زيارة نشطة، وإضافة خدمات أثناء التواجد — مع عزل حسب فئة الخدمة.

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
   يتحقق من: الرمز · نفس اليوم (Asia/Cairo افتراضياً) · انتماء القسم إن حُدّد · يحوّل الحالة إلى `checked_in` ويسجّل `checkedInAt` + سجل زيارة.
3. إضافة خدمة: `POST /api/ops/desk/appointments/:id/addons` (خدمات نفس الفئة فقط) → تحديث `lineItems` والمبلغ الإجمالي.
4. إنهاء الزيارة: `POST /api/ops/desk/appointments/:id/complete` → `completed`.

## البيانات على الموعد
- `checkInToken`, `checkedInAt`, `checkedInByStaffId`
- `lineItems[]` (primary + addon)
- `visitLog[]` (check_in / addon / complete)
- `status`: يشمل `checked_in`

## الصلاحيات (مرحلة حالية)
- عزل تشغيلي عبر اختيار القسم على الشاشة + فلترة الحجوزات.
- دور الواجهة `reception` يمكنه فتح شاشة الحضور؛ ربط حساب موظف بقسم (`serviceCategoryId`) يُستخدم لاختيار مشرف الاستقبال.
- RBAC صارم متعدد المستأجرين على مستوى API ما زال مفتوحاً للتعميق مع هويات Clerk/موظفين.

## مفتوح لاحقاً
- إرسال بطاقة QR تلقائياً عبر WhatsApp/SMS بعد الحجز.
- رابط دفع سريع للمبلغ الإضافي.
- تمديد تلقائي لشريحة الوقت عند إضافة خدمة طويلة.
