# حوكمة دوائر المنصة — موعد (Maw3ed)

مرجع تشغيلي لقفل منطق الحجز / الطاقم / الخدمات / الحسابات وفق شاشات SetTime المرجعية في `attached_assets/` (مرجع UX فقط).

## الدوائر المنفَّذة الآن

| الدائرة | القفل | أين |
|---------|------|-----|
| نشاط المنشأة | قفل ناعم بعد التأكيد (`activityModeLocked`) — يمنع تغيير القالب/الوضع/الأقسام | `opsStore.updateActivityProfile` |
| الحجز العام | مفتاح `onlineBookingEnabled` + فلتر `publicBooking` لكل خدمة | `getPublicBooking` / slots / create |
| الجدول | أيام مغلقة بنطاق تاريخ + أيام محددة تتجاوز الساعات العامة | `resolveHoursForStaff` |
| ساعات الموظف | `useBusinessHours` أو جدول أسبوعي خاص | Staff API + UI |
| Hold | ملف `data/maw3ed-holds.json` + جدول `slot_holds` عند Postgres + TTL 180ث | `holdPublicSlot` / `opsPg` |
| تضارب المواعيد | 409 عند تداخل مدة+buffer (JSON + دمج PG) | `createAppointment` / `opsPg` |
| حد الطلبات العامة | 429 على hold/book | `opsRoutes` rate limit |
| الخطة (ops) | 402 عند تجاوز staff/services/appointments الشهرية | `assertPlanCapacity` |
| الخدمات العامة | يجب ≥1 موظف؛ مدة ≥5 د | `assertServiceProviders` / `normalizeServiceTiming` |
| الحذف | ممنوع حذف موظف/خدمة عليهما مواعيد قادمة؛ ممنوع حذف آخر موظف لخدمة عامة | `deleteStaff` / `deleteService` |
| تأكيد الحجز | Email (outbox/SendGrid) | `sendBookingConfirmationEmail` |
| عزل مساحة العمل | كل workspace له `data/workspaces/{id}/maw3ed-ops.json` + holds؛ الهيدر `x-workspace-id`؛ الحجز العام يُحل عبر slug عالمي فريد | `opsWorkspace.js` / `opsRoutes.js` |

## اقتراحات المرحلة التالية (حسب الصور المرجعية)

### 1) حسابات ومساحات العمل (حرج للـ SaaS)
- ~~عزل `maw3ed-ops.json` لكل workspace.~~ (`data/workspaces/{id}/` + `x-workspace-id`)
- ربط `/api/ops/*` بـ Clerk + دور العضوية (`owner|admin|manager|staff|viewer`) بدل دور UI في localStorage فقط.
- مزامنة حدود الخطة من `plan_catalog` / اشتراك Postgres بدل `PLAN_LIMITS` المحلي فقط.

### 2) صلاحيات أدق داخل العيادة (SetTime-like)
- Reception: تقويم + عملاء + حجز يدوي.
- Provider: مواعيده فقط + حالة الموعد.
- Owner: إعدادات النشاط، الصفحة العامة، الفواتير، حذف البيانات.
- رفض API صريح 403 عند تجاوز الدور.

### 3) جدول العمل المتقدم
- استراحات متعددة لكل يوم (ليس استراحة واحدة فقط).
- إجازات موظف فردية (ليس فقط أيام منشأة مغلقة).
- قواعد تكرار للإغلاق (كل جمعة، سنوياً…).

### 4) حوكمة الحجز للزائر
- إلغاء/إعادة جدولة برابط موقّع في الإيميل.
- حد حجوزات لكل رقم هاتف يومياً.
- قائمة انتظار عند امتلاء اليوم.
- عربون Stripe قبل التأكيد النهائي.

### 5) قفل المنصة (Platform admin)
- فتح قفل النشاط للعميل من `/api/admin` فقط.
- تدقيق (audit log) لتغييرات الجدول/الأسعار/الصفحة العامة.
- تعطيل مساحة عمل بالكامل (kill-switch حساب).

### 6) دوائر النمو المعطّلة حالياً (Placeholders)
- المدفوعات / التسويق / التكاملات تبقى مقفلة بالخطة حتى تنفيذها — لا تُعرض كوظائف جاهزة.

## اختبارات

```bash
node scripts/smoke-public-booking.js
node scripts/smoke-booking-governance.js
```

## مراجع

- [`BOOKING_PORTAL_HOSTING_DOMAIN.md`](BOOKING_PORTAL_HOSTING_DOMAIN.md)
- [`public-booking-page.md`](public-booking-page.md)
- [`admin-dashboard.md`](admin-dashboard.md)
