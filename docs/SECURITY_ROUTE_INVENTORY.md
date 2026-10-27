# جرد واجهات Maw3ed وطبقات الوصول

**مراجعة ساكنة:** 2026-10-27 (حدّثت حواجز المرحلة 1 + ربط staff↔desk للمرحلة 2). قائمة المسارات معلنة في `server.js`, `opsRoutes.js`, `platformAdminRoutes.js`, `legacyAccess.js`, `staffLinks.js`; لا يغطي هذا الجرد أي endpoint أضيف ديناميكياً أو من proxy خارجي. يجب مقارنة القائمة باختبار runtime قبل الإطلاق. حالة المراحل: [`IMPLEMENTATION_EXECUTION_LOG.md`](IMPLEMENTATION_EXECUTION_LOG.md) و[`ROADMAP_PROGRESS.json`](ROADMAP_PROGRESS.json).

## فئات الوصول

| الفئة | المسارات | الحالة/المخاطرة الحالية |
| --- | --- | --- |
| عام محدود | `GET /api/config`, `/api/plans`, `/api/activity-templates`, `/api/health*`، وقراءات صفحة الحجز العامة؛ `POST` للـ hold/appointment العام | allowlist مقصودة؛ راجع حدود البيانات، المعدل، token/pass، وغياب إساءة التدفق |
| حساب | `/api/account`, `/api/workspaces`, `/api/entitlements`, `/api/billing/*` | تستخدم Clerk بحسب مساراتها؛ تحقق من ارتباط كل تغيير بمساحة المستخدم وخطة الاشتراك |
| تشغيل workspace | `/api/ops/*` أدناه | auth عند production أو `MAW3ED_REQUIRE_AUTH=1`؛ العضوية عبر resolver DB+JSON، ثم سياسة أدوار route×method؛ رفض 503 إن فشل `runtimePosture` الصارم؛ وضع local دون auth مقصود للتطوير، وليس للنشر |
| قديم/طبي | `/api/workspace-profile`, `/api/dashboard`, `/api/departments`, `/api/doctors`, `/api/patients`, `/api/appointments` | عند تفعيل auth: جلسة + عضوية نشطة + سياسة `legacyAccess` (manager+ للقراءة/إنشاء المواعيد؛ owner/admin لـ PATCH profile؛ viewer/staff مرفوضان). ما زال يلزم اختبار BOLA على مستوى الكائن عبر المستأجرين |
| منصة | `/api/admin/*` | Clerk وأدوار منصة؛ لا تخلط دور المنصة بعضوية المنشأة، ولا تعتبر سجل المنصة بديلاً عن tenant audit |
| تطوير/ملفات | `/api/development-events`, `/data/uploads/*` | الأحداث: local فقط (404 خارجها) + جلسة عند auth المطلوب + تنقية تفاصيل. الملفات: صور علامة workspace عامة لصفحة الحجز؛ غير الصور والمسارات العامة تتطلب عضوية/جلسة عند auth؛ عابر المستأجر → 404 |

## واجهات التشغيل (`opsRoutes.js`)

| الطريقة والمسار | مستوى الدور المقصود بعد الحزمة الأولى |
| --- | --- |
| `GET /api/ops/bootstrap` | owner/admin/manager؛ رد المدير يحذف إعدادات الإشعارات والمالية ويلخص الإحصاءات دون قيم مالية. **staff مربوط:** مسموح برد مُقشَّط لشاشة الحضور فقط (بدون عملاء/مالية). viewer مرفوض |
| `GET,POST /api/ops/customers`; `POST /api/ops/customer-categories` | owner/admin/manager |
| `GET,POST /api/ops/staff`; `PATCH,DELETE /api/ops/staff/:id` | owner/admin/manager |
| `GET,POST /api/ops/staff/:id/(commission\|payroll\|reviews)` | manager+؛ الميزات تظل مغلقة في المجال |
| `GET,POST /api/ops/service-categories`; `PATCH,DELETE /api/ops/service-categories/:id` | owner/admin/manager |
| `GET,POST /api/ops/services`; `PATCH,DELETE /api/ops/services/:id` | owner/admin/manager |
| `POST /api/ops/services/:id/providers`; `DELETE /api/ops/services/:id/providers/:providerId` | owner/admin/manager |
| `POST /api/ops/uploads/(logo\|image)` | owner/admin/manager؛ تحقق ملكية/نوع/حجم الملف ما زال مطلوباً |
| `GET /api/ops/activity-templates`, `GET /api/ops/working-schedule` | جميع الأدوار النشطة بما فيها staff/viewer |
| `PUT /api/ops/working-hours`; `POST /api/ops/(closed-days\|specific-days)` | owner/admin/manager |
| `GET,PUT /api/ops/booking-page`; `GET,PUT /api/ops/calendar-preferences` | owner/admin/manager |
| `PUT /api/ops/activity-profile` | owner/admin |
| `GET,PUT /api/ops/notifications` | owner/admin |
| `GET,POST /api/ops/expenses` | owner/admin |
| `GET,POST /api/ops/appointments`; `PATCH /api/ops/appointments/:id/status` | owner/admin/manager؛ إنشاء الموعد يخصّص مورد exclusive/rental تلقائياً عند وجود متطلب/resourceId |
| `PATCH /api/ops/appointments/:id/pricing` | owner/admin |
| `GET,POST /api/ops/resources`; `PATCH /api/ops/resources/:id` | owner/admin/manager؛ موارد tenant-scoped (سعة/حالة/وحدة) |
| `POST /api/ops/service-resource-requirements` | owner/admin/manager |
| `GET,POST /api/ops/session-occurrences`; `GET .../:id/availability`; `POST .../:id/enrollments` | owner/admin/manager؛ سعة الجلسة وليست استنتاجاً من القالب |
| `POST /api/ops/enrollments/:id/cancel`; `POST /api/ops/enrollments/:id/attendance` | owner/admin/manager |
| `POST /api/ops/resource-allocations/bundle` | owner/admin/manager؛ تخصيص حزمة ذري fail-closed |
| `GET /api/ops/desk/today`; `POST /api/ops/desk/(preview\|check-in)`; `POST /api/ops/desk/appointments/:id/complete` | owner/admin/manager؛ **staff فقط مع ربط نشط** `workspace_staff_links` (أو JSON المكافئ) وفي نطاق `staffId` المرتبط — بدون ربط → 403 fail-closed |
| `POST /api/ops/desk/appointments/:id/addons`; `PATCH /api/ops/desk/appointments/:id/lines/:lineId/pricing` | owner/admin فقط (حتى مع ربط staff) |
| `GET /api/ops/contexts`; `GET /api/ops/staff-link` | أي عضو نشط؛ يعرض السياق المثبت خادميًا والربط الحالي (إن وُجد) |
| `GET /api/ops/staff-links`; `PUT/DELETE /api/ops/staff/:id/account-link` | owner/admin؛ إنشاء/تعليق ربط واحد-لواحد (مستخدم↔موظف) داخل المساحة |
| `GET /api/ops/stats` | owner/admin؛ أرقام إجمالية قد تكشف بيانات مالية |
| `GET /api/ops/events` | owner/admin؛ سجل أحداث تشغيل المساحة (JSONL لكل workspace)؛ منفصل عن development-events |
| `GET /api/public/booking/:slug`; `GET /api/public/booking/:slug/slots`; `GET /api/public/booking/:slug/pass/:token` | عام محدود؛ لا يُستخدم للوصول إلى endpoint داخلي |
| `GET/POST /api/public/booking/:slug/manage/:token` (+ `/cancel`, `/reschedule`) | عام موقّع HMAC+TTL؛ إلغاء/إعادة جدولة مرة لكل فعل؛ منفصل عن checkInToken |
| `GET /api/public/booking/:slug/sessions`; `POST .../sessions/:id/enroll` | عام لخدمات `session_capacity` فقط؛ سعة مقاعد؛ بلا ادعاء عمودي |
| `POST /api/public/booking/:slug/hold`; `POST /api/public/booking/:slug/appointments` | عام بمعدل/hold؛ يلزم استكمال idempotency والحجز الذري حسب الخطة |

كل مسار `/api/ops/*` غير معروف يفشل في policy helper بدلاً من وراثة صلاحية المدير تلقائياً. هذه السياسة تغطي هذا router فقط؛ لا تثبت RBAC على المسارات القديمة.

## واجهات الخادم القديمة والحساب

| الطريقة والمسار | المطلوب |
| --- | --- |
| `GET /api/config`, `/api/plans`, `/api/activity-templates`, `/api/health`, `/api/health/live`, `/api/health/ready` | عام مع تقليل مخرجات config وحماية readiness من كشف أسرار؛ `config.integrations` يعلن أعلام messaging/billing/webhooks دون أسرار |
| `GET /api/integrations/capabilities` | عام؛ نفس أعلام التكامل (checkout/SMS/WhatsApp معطّلة صراحةً حتى قبول sandbox) |
| `POST /api/webhooks/sandbox/:provider` | sandbox فقط؛ يتطلب توقيع HMAC؛ ledger idempotent؛ لا يفعّل اشتراكاً حياً |
| `GET /api/account`, `/api/account/contexts`, `/api/workspaces`, `/api/entitlements`, `/api/billing/status`; `POST /api/workspaces`, `/api/billing/request` | جلسة؛ قائمة السياقات تشمل عضوية المساحات + `staffLink` النشط لاختيار السياق؛ `x-workspace-id` يختار السياق فقط ولا يمنح صلاحية |
| `POST /api/whop/checkout`, `/api/whop/verify-checkout` | معطلان حالياً (`410`) |
| `GET /api/workspace-profile`, `/api/dashboard`, `/api/departments`, `/api/doctors`, `/api/patients`, `/api/appointments` | عند auth: membership + دور manager+ عبر `legacyAccess.js`؛ `x-workspace-id` سياق فقط |
| `PATCH /api/workspace-profile` | عند auth: owner/admin فقط |
| `POST /api/appointments` | عند auth: membership + دور manager+ |
| `POST /api/auth/request-verification`, `/api/auth/verify-email` | public flow؛ rate-limit، منع enumeration، وتحقق abuse مطلوب |
| `GET,POST /api/development-events` | local فقط؛ 404 خارج local؛ جلسة عند `MAW3ED_REQUIRE_AUTH`/production-like؛ تنقية حقول حساسة |
| `GET /data/uploads/workspaces/:id/*.(png\|jpg\|jpeg\|webp\|gif\|svg)` | عام مقصود (علامة صفحة الحجز)؛ امتدادات صور فقط |
| `GET /data/uploads/workspaces/:id/*` (غير صورة) و`GET /data/uploads/*` | عند auth: جلسة + عضوية للمساحة عند الانطباق؛ غير العضو → 404؛ منع traversal قائم |

## واجهات المنصة (`platformAdminRoutes.js`)

| الطريقة والمسار | الفئة |
| --- | --- |
| `GET /api/admin/me`; `POST /api/admin/confirmations` | دور منصة ومصادقة |
| `GET /api/admin/overview`, `/workspaces`, `/subscriptions`, `/plans`, `/users`, `/finance/overview`, `/finance/transactions`, `/finance/settlements`, `/audit` | قراءة مقسمة بحسب platform role |
| `PATCH /api/admin/workspaces/:id`, `/subscriptions/:id`, `/plans/:key`, `/users/:id/role` | كتابة إدارية؛ تحقق target/field/confirmation/audit حسب حساسية التغيير |
| `POST /api/admin/finance/transactions`, `/finance/settlements` | كتابة مالية؛ maker-checker/idempotency/reconciliation مطلوب حسب الإجراء |
| `GET /api/admin/export/(workspaces\|subscriptions\|transactions\|audit).csv` | تصدير عالي الحساسية؛ صلاحية دقيقة وتدقيق القراءة والتنزيل |

## وضع التخزين في الإنتاج

- الافتراضي عبر `scripts/load-env.js`: `MAW3ED_STORAGE=postgres` عندما `MAW3ED_ENV=production`.
- JSON في production مسموح لفحوص قبول معزولة فقط مع auth fail-closed وعضوية إجبارية (لا يُتخطى المسار المحلي).
- تحذير عند التشغيل بـ JSON في production؛ الرفض الاختياري: `MAW3ED_STRICT_PRODUCTION_STORAGE=1` ما لم يُضبط `MAW3ED_ALLOW_JSON_IN_PRODUCTION=1`. راجع [`runtimePosture.js`](../runtimePosture.js).

## حالة الاختبارات

- ops RBAC: [`scripts/smoke-ops-rbac.js`](../scripts/smoke-ops-rbac.js) (`npm run test:ops-rbac`).
- legacy/uploads/dev-events: [`scripts/smoke-legacy-rbac.js`](../scripts/smoke-legacy-rbac.js) (`npm run test:legacy-rbac`).
- BOLA/function/property: [`scripts/smoke-bola.js`](../scripts/smoke-bola.js) (`npm run test:bola`).
- workspace events: [`scripts/smoke-workspace-events.js`](../scripts/smoke-workspace-events.js) (`npm run test:workspace-events`).
- حزمة مجمّعة: `npm run test:phase1-security` (تشمل `test:staff-links`).
- ربط staff↔desk: نموذج junction معتمد (`workspace_staff_links` / JSON)؛ بدون ربط نشط يبقى desk لدور staff مرفوضًا. نطاق الزيارات للمربوط فقط؛ تسعير desk يبقى owner/admin.
- المرحلة 6 حزمة 1: [`scripts/smoke-phase6-integrations.js`](../scripts/smoke-phase6-integrations.js) (`npm run test:phase6-integrations`) — outbox idempotency + توقيع/إعادة webhook sandbox + أعلام الفوترة.
- ترتبط كل تحديثات الحالة بـ [`IMPLEMENTATION_EXECUTION_LOG.md`](IMPLEMENTATION_EXECUTION_LOG.md) و[`ROADMAP_PROGRESS.json`](ROADMAP_PROGRESS.json)؛ نتائج التنفيذ تُسجل بعد تشغيل الأمر لا بمجرد كتابته هنا.
