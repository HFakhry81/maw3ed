# جرد واجهات Maw3ed وطبقات الوصول

**مراجعة ساكنة:** 2026-10-27. قائمة المسارات معلنة في `server.js`, `opsRoutes.js`, `platformAdminRoutes.js`; لا يغطي هذا الجرد أي endpoint أضيف ديناميكياً أو من proxy خارجي. يجب مقارنة القائمة باختبار runtime قبل الإطلاق.

## فئات الوصول

| الفئة | المسارات | الحالة/المخاطرة الحالية |
| --- | --- | --- |
| عام محدود | `GET /api/config`, `/api/plans`, `/api/activity-templates`, `/api/health*`، وقراءات صفحة الحجز العامة؛ `POST` للـ hold/appointment العام | allowlist مقصودة؛ راجع حدود البيانات، المعدل، token/pass، وغياب إساءة التدفق |
| حساب | `/api/account`, `/api/workspaces`, `/api/entitlements`, `/api/billing/*` | تستخدم Clerk بحسب مساراتها؛ تحقق من ارتباط كل تغيير بمساحة المستخدم وخطة الاشتراك |
| تشغيل workspace | `/api/ops/*` أدناه | auth عند production أو `MAW3ED_REQUIRE_AUTH=1`؛ العضوية تتحقق عبر resolver، ثم سياسة أدوار في التغيير الحالي؛ وضع local دون auth مقصود للتطوير، وليس للنشر |
| قديم/طبي | `/api/workspace-profile`, `/api/dashboard`, `/api/departments`, `/api/doctors`, `/api/patients`, `/api/appointments` | حواجز auth مشروطة بالإعداد؛ يلزم استكمال membership/RBAC لكل كائن/خاصية واختبارات cross-workspace |
| منصة | `/api/admin/*` | Clerk وأدوار منصة؛ لا تخلط دور المنصة بعضوية المنشأة، ولا تعتبر سجل المنصة بديلاً عن tenant audit |
| تطوير/ملفات | `/api/development-events`, `/data/uploads/*` | الأحداث تتطلب auth في production/flag ولا يظهر دور إداري؛ راجع التعطيل/التنقية والاحتفاظ. الملفات تحتاج تحقق ملكية وصلاحية static لكل object |

## واجهات التشغيل (`opsRoutes.js`)

| الطريقة والمسار | مستوى الدور المقصود بعد الحزمة الأولى |
| --- | --- |
| `GET /api/ops/bootstrap` | owner/admin/manager؛ رد المدير يحذف إعدادات الإشعارات والمالية ويلخص الإحصاءات دون قيم مالية |
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
| `GET,POST /api/ops/appointments`; `PATCH /api/ops/appointments/:id/status` | owner/admin/manager |
| `PATCH /api/ops/appointments/:id/pricing` | owner/admin |
| `GET /api/ops/desk/today`; `POST /api/ops/desk/(preview\|check-in)`; `POST /api/ops/desk/appointments/:id/complete` | owner/admin/manager؛ staff ينتظر ربط حسابه بسجل الموظف قبل كشف/تغيير بيانات المرضى |
| `POST /api/ops/desk/appointments/:id/addons`; `PATCH /api/ops/desk/appointments/:id/lines/:lineId/pricing` | owner/admin |
| `GET /api/ops/stats` | owner/admin؛ أرقام إجمالية قد تكشف بيانات مالية |
| `GET /api/public/booking/:slug`; `GET /api/public/booking/:slug/slots`; `GET /api/public/booking/:slug/pass/:token` | عام محدود؛ لا يُستخدم للوصول إلى endpoint داخلي |
| `POST /api/public/booking/:slug/hold`; `POST /api/public/booking/:slug/appointments` | عام بمعدل/hold؛ يلزم استكمال idempotency والحجز الذري حسب الخطة |

كل مسار `/api/ops/*` غير معروف يفشل في policy helper بدلاً من وراثة صلاحية المدير تلقائياً. هذه السياسة تغطي هذا router فقط؛ لا تثبت RBAC على المسارات القديمة.

## واجهات الخادم القديمة والحساب

| الطريقة والمسار | المطلوب |
| --- | --- |
| `GET /api/config`, `/api/plans`, `/api/activity-templates`, `/api/health`, `/api/health/live`, `/api/health/ready` | عام مع تقليل مخرجات config وحماية readiness من كشف أسرار |
| `GET /api/account`, `/api/workspaces`, `/api/entitlements`, `/api/billing/status`; `POST /api/workspaces`, `/api/billing/request` | جلسة؛ ربط الـ workspace بالعضوية؛ RBAC/امتلاك لكل write |
| `POST /api/whop/checkout`, `/api/whop/verify-checkout` | معطلان حالياً (`410`) |
| `GET,PATCH /api/workspace-profile`; `GET /api/dashboard`, `/api/departments`, `/api/doctors`, `/api/patients`, `/api/appointments`; `POST /api/appointments` | API مجال طبي حساس؛ auth مشروط حالياً، ويحتاج عضوية ودور وكائن/خاصية لكل عملية أو إيقافه بعد ترحيل العميل |
| `POST /api/auth/request-verification`, `/api/auth/verify-email` | public flow؛ rate-limit، منع enumeration، وتحقق abuse مطلوب |
| `GET,POST /api/development-events` | auth مشروط؛ لا يوجد في route check دور إداري واضح |
| `GET /data/uploads/*` | مسار ملفات؛ تحقق workspace ownership، عدم traversal، ACL؛ الملفات الخاصة لا تخدم كـ static عام |

## واجهات المنصة (`platformAdminRoutes.js`)

| الطريقة والمسار | الفئة |
| --- | --- |
| `GET /api/admin/me`; `POST /api/admin/confirmations` | دور منصة ومصادقة |
| `GET /api/admin/overview`, `/workspaces`, `/subscriptions`, `/plans`, `/users`, `/finance/overview`, `/finance/transactions`, `/finance/settlements`, `/audit` | قراءة مقسمة بحسب platform role |
| `PATCH /api/admin/workspaces/:id`, `/subscriptions/:id`, `/plans/:key`, `/users/:id/role` | كتابة إدارية؛ تحقق target/field/confirmation/audit حسب حساسية التغيير |
| `POST /api/admin/finance/transactions`, `/finance/settlements` | كتابة مالية؛ maker-checker/idempotency/reconciliation مطلوب حسب الإجراء |
| `GET /api/admin/export/(workspaces\|subscriptions\|transactions\|audit).csv` | تصدير عالي الحساسية؛ صلاحية دقيقة وتدقيق القراءة والتنزيل |

## حالة الاختبارات

- جرى إنشاء وتشغيل smoke مخصص لحزمة RBAC الأولى بنجاح: [`scripts/smoke-ops-rbac.js`](../scripts/smoke-ops-rbac.js) (`npm run test:ops-rbac`).
- اختبار المجموعة لا يحل محل جرد runtime أو اختبار BOLA على كل المسارات القديمة والمنصة والملفات.
- ترتبط كل تحديثات الحالة بـ [`IMPLEMENTATION_EXECUTION_LOG.md`](IMPLEMENTATION_EXECUTION_LOG.md)؛ نتائج التنفيذ تُسجل بعد تشغيل الأمر لا بمجرد كتابته هنا.
