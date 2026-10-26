# مخرجات المرحلة 0: جرد API وسجل القرارات

**تاريخ الجرد:** 2026-10-27  
**المصدر:** قراءة ساكنة لمسارات `server.js` و`opsRoutes.js` و`platformAdminRoutes.js` و`platformAdmin.js`، مع تشغيل `npm run check:staging`.  
**الحدود:** الجرد يصف التوجيه والحواجز الظاهرة في الكود؛ لا يثبت إعداد الإنتاج الفعلي أو سلوك مزودي الهوية/قاعدة البيانات. فحص القبول شغّل الخادم محلياً على إعداد production-like مع تخزين `local-memory`.

## دلالات الوصول

| الوسم | ما يعنيه في الكود الحالي |
| --- | --- |
| عام | المسار لا يستدعي مصادقة المستخدم. يلزم أن يكون ضمن allowlist ويكشف أقل بيانات ممكنة. |
| جلسة مستخدم | يستدعي `requireAppUser` دون صلاحية عضو/دور ظاهرة في نفس المعالج. |
| جلسة شرطية | يطلب الجلسة فقط عند `MAW3ED_ENV=production` أو `MAW3ED_REQUIRE_AUTH=1`. لا تعتبر حماية ثابتة إذا كان إعداد النشر قابلاً للسهو. |
| منصة RBAC | يتطلب هوية وجزءاً من `platform_role`/capability؛ بعض الإجراءات الحساسة تتطلب تأكيداً وتدقيقاً. |
| ملف عام | يخدمه مسار ملفات، لا جلسة مستخدم. صلاحية معرفة المسار ليست تصنيف خصوصية. |

## جرد المسارات

### API العامة وتدفقات الحساب

| المسار | الطرق | الوصول الحالي | ملاحظة المرحلة 0 |
| --- | --- | --- | --- |
| `/api/config` | GET | عام | يعيد إعدادات عامة منها Clerk publishable key. |
| `/api/plans` | GET | عام | تأكد من عدم تضمين بيانات داخلية في تعريف الخطط. |
| `/api/activity-templates` | GET | عام | كتالوج القوالب؛ لا ينشئ أو يغير مساحة العمل. |
| `/api/health`, `/api/health/live`, `/api/health/ready` | GET | عام | readiness يكشف نوع التخزين وحالة الجاهزية؛ راجع مقدار التفاصيل المعروض خارج الشبكة الداخلية. |
| `/api/auth/request-verification`, `/api/auth/verify-email` | POST | عام | تدفق تسجيل/تحقق مقصود؛ يحتاج rate limit ورسائل لا تكشف وجود الحساب واختبار expiry/replay. |
| `/api/public/booking/:slug` | GET | عام | بيانات صفحة الحجز العامة المحلولة بالـ slug. |
| `/api/public/booking/:slug/slots` | GET | عام | التوفر والخدمة/المقدم حسب مدخلات الطلب. |
| `/api/public/booking/:slug/hold` | POST | عام + rate limit داخل العملية | hold مرتبط بالـ slug؛ يجب إثبات صموده عبر workers في مرحلة التزامن. |
| `/api/public/booking/:slug/appointments` | POST | عام + rate limit داخل العملية | إنشاء حجز عام؛ يجب إثبات التزامن وidempotency وسياسة البيانات. |
| `/api/public/booking/:slug/pass/:token` | GET | عام برمز حامل | الرمز سر وصول؛ اختبر entropy والانتهاء والإبطال والحد من المحاولات. |
| `/api/account` | GET | جلسة مستخدم | يعيد بيانات الحساب ومساحته الحالية. |
| `/api/workspaces` | GET, POST | جلسة مستخدم | قائمة المساحات وإنشاء مساحة؛ يحتاج اختبار سباق الإنشاء والملكية. |
| `/api/entitlements` | GET | جلسة مستخدم | يعيد مساحة وخطة/حدود المستخدم الحالية. |
| `/api/billing/status` | GET | جلسة مستخدم | حالة الاشتراك للمساحة التي يحلها الخادم. |
| `/api/billing/request` | POST | جلسة مستخدم | طلب اشتراك يدوي. |
| `/api/whop/checkout`, `/api/whop/verify-checkout` | POST | 410 ثابت حالياً | الدفع/التفعيل الآليان معطلان؛ لا تعرضهما كميزة حية. |

### واجهات التوافق القديمة

| المسار | الطرق | الوصول الحالي | ملاحظة المرحلة 0 |
| --- | --- | --- | --- |
| `/api/workspace-profile` | GET, PATCH | جلسة شرطية | يستخدم workspace/organization context؛ لم يثبت هنا ربطه بعضوية ودور على كل عملية. |
| `/api/dashboard` | GET | جلسة شرطية | يعرض ملخصات تشغيلية. |
| `/api/departments`, `/api/doctors`, `/api/patients` | GET | جلسة شرطية | بيانات مؤسسية/أشخاص؛ يلزم tenant membership وdata minimization. |
| `/api/appointments` | GET, POST | جلسة شرطية | عميل React يستعمل GET كـ fallback إذا فشل `/api/ops/appointments`؛ لا تحذف قبل نقل/اختبار هذا المستهلك. |
| `/api/development-events` | GET, POST | local فقط بعد إصلاح المرحلة 0؛ 404 في غير local | `app.js` يرسل أحداثاً إليه كتليمترية تطويرية؛ عُطّل في الإنتاج لتجنب تخزين أحداث غير لازمة. |

### واجهات المنشأة `/api/ops/*`

كل المسارات التالية تحت `tryHandleOpsApi`. المصادقة شرطية؛ في production أو `MAW3ED_REQUIRE_AUTH=1` يلزم `requireAppUser`. التحقق من workspace membership يحدث فقط عندما تكون PostgreSQL مهيأة، ولا توجد مصفوفة RBAC تشغيلية لكل route/method في المعالج الحالي. `x-workspace-id` أو `?workspace=` يختار السياق ولا ينبغي اعتباره تفويضاً.

| مجموعة المسارات | الطرق | الوظائف |
| --- | --- | --- |
| `/api/ops/bootstrap` | GET | حزمة بيانات تشغيلية واسعة؛ عالية الحساسية. |
| `/api/ops/customers` | GET, POST | قائمة/إنشاء العملاء. |
| `/api/ops/customer-categories` | POST | إنشاء فئة عميل. |
| `/api/ops/staff` | GET, POST؛ `/:id` PATCH, DELETE | قراءة/إنشاء/تعديل/حذف الطاقم. |
| `/api/ops/staff/:id/(commission | payroll | reviews)` | GET, POST | محجوبة حالياً بخطأ 403/ميزة مغلقة. |
| `/api/ops/service-categories` | GET, POST؛ `/:id` PATCH, DELETE | الفئات. |
| `/api/ops/services` | GET, POST؛ `/:id` PATCH, DELETE | الخدمات. |
| `/api/ops/services/:id/providers` | POST؛ `/:staffId` DELETE | ربط مقدمي الخدمة بالخدمة. |
| `/api/ops/uploads/logo`, `/api/ops/uploads/image` | POST | رفع صور المنشأة/الطاقم. |
| `/api/ops/activity-templates` | GET | قائمة القوالب داخل سياق ops. |
| `/api/ops/working-schedule` | GET؛ `/working-hours` PUT؛ `/closed-days` POST؛ `/specific-days` POST | إعدادات الدوام والاستثناءات. |
| `/api/ops/booking-page` | GET, PUT | إعداد صفحة الحجز. |
| `/api/ops/desk/today` | GET؛ `/preview` POST؛ `/check-in` POST | قائمة اليوم، معاينة رمز، تسجيل حضور. |
| `/api/ops/desk/appointments/:id/addons` | POST | إضافة خدمة للزيارة. |
| `/api/ops/desk/appointments/:id/lines/:lineId/pricing` | PATCH | تسعير بند زيارة. |
| `/api/ops/desk/appointments/:id/complete` | POST | إنهاء الزيارة. |
| `/api/ops/calendar-preferences` | GET, PUT | تفضيلات التقويم. |
| `/api/ops/notifications` | GET, PUT | إعدادات الإشعارات. |
| `/api/ops/expenses` | GET, POST | المصروفات. |
| `/api/ops/appointments` | GET, POST؛ `/:id/status` PATCH؛ `/:id/pricing` PATCH | قوائم وإنشاء وتغيير حالة/سعر المواعيد. |
| `/api/ops/activity-profile` | PUT | تعديل النشاط/القالب/الأقسام؛ قفل النشاط يُفرض في store لكنه ليس بديلاً عن RBAC. |
| `/api/ops/stats` | GET | تقارير مختصرة. |

أي مسار يبدأ `/api/ops/` ولا يطابق method/route معروف يرجع إلى معالجة 404 العامة؛ يجب إبقاء الجرد متزامناً مع تغييرات التوجيه.

### إدارة المنصة والملفات

| المسار | الطرق | الوصول الحالي | ملاحظة المرحلة 0 |
| --- | --- | --- | --- |
| `/api/admin/me`, `/api/admin/confirmations`, `/api/admin/overview`, `/api/admin/workspaces`, `/api/admin/subscriptions`, `/api/admin/plans`, `/api/admin/users`, `/api/admin/audit` | GET حسب المسار؛ confirmations POST | منصة RBAC | صلاحيات القراءة/المجال عبر capabilities؛ لا تخلطها بأدوار عضو المنشأة. |
| `/api/admin/workspaces/:id`, `/api/admin/subscriptions/:id`, `/api/admin/plans/:key`, `/api/admin/users/:id/role` | PATCH | منصة RBAC | بعض العمليات حساسة وتتطلب confirmation/audit. |
| `/api/admin/finance/overview` | GET؛ `/transactions` و`/settlements` GET, POST | منصة RBAC مالية | أثر مالي؛ تأكيد/تدقيق ومطابقة مطلوبة. |
| `/api/admin/export/(workspaces | subscriptions | transactions | audit).csv` | GET | منصة RBAC، والمالية للتصدير المالي | تصدير bulk؛ يسجل ويختبر حسب الدور. |
| `/data/uploads/**` وملفات الويب الثابتة | GET | ملف عام | المسار يقيّد traversal لكنه لا يثبت أن كل ملفات workspace آمنة للنشر العام؛ لا تخزن ملفات مرضى/طلاب خاصة هنا. |

## نتيجة فحص القبول الحالي

شُغّل `npm run check:staging` في 2026-10-27 بإعداد `MAW3ED_ENV=production`, `MAW3ED_REQUIRE_AUTH=1`, `MAW3ED_STORAGE=local` على منفذ فحص 7115. نجحت تسعة فحوص: عزل المنافذ/build artifact، readiness، حماية `GET /api/patients` و`GET /api/appointments` و`GET /api/workspace-profile` و`GET /api/ops/bootstrap` (401)، تعطيل GET/POST `/api/development-events` خارج local (404)، وhealth.

هذه نتيجة إيجابية محدودة وليست قبول إنتاج: الفحص لا يختبر ops أو membership أو RBAC أو mutation/IDOR أو الوصول إلى uploads أو تدفقات إدارة المنصة. كما أن كل من patients/appointments/dev-events يستخدم جلسة فقط عند الإعداد الإنتاجي، ولا يثبت تفويض workspace أو صلاحية الدور.

## سجل القرارات للمرحلة 0

الحالة `مؤكد` تعني أن هناك توجيهاً صريحاً في الوثائق/طلب المالك؛ لا تعني أن التنفيذ موجود. جميع القرارات غير المحسومة يملك اعتمادها مالك المنتج، بينما يملك فريق التطبيق إعداد أثرها الفني واختبارها.

| ID | القرار المطلوب | الوضع/اقتراح البداية | المالك |
| --- | --- | --- | --- |
| D0-01 | نطاق أول إطلاق والقطاعات التي تدخل الـ pilot | معلّق؛ المقترح نواة الحجز الفردي أولاً ثم قطاع واحد إضافي بعد قبول نواته | مالك المنتج |
| D0-02 | أنواع الحجز (`occupancy_mode`) وتركيب الحجز (`composition`) | النموذج مفصول في الخارطة؛ اختيار السياسات الافتراضية لكل خدمة/قطاع معلّق | مالك المنتج + مالك المجال |
| D0-03 | اختيار القالب عند إنشاء workspace، مع خيار فارغ وقفل النوع لاحقاً | متطلب مؤكد من المالك؛ استثناء فك القفل الإداري ونص الإقرار يحتاج تثبيتاً | مالك المنتج |
| D0-04 | مصفوفة عضوية المنشأة: الأدوار والأفعال والحقول | معلّق؛ لا يكفي تعريف `owner/admin/manager/staff/viewer` دون permissions لكل API | مالك المنتج + الأمن |
| D0-05 | حدود `workspace_id` و`organization_id` والمسار القانوني للبيانات | PostgreSQL إنتاجاً وJSON محلياً وفق الوثائق؛ mapping القديم والترحيل يحتاجان قبولاً | مالك المنتج + البيانات |
| D0-06 | التعليم: enrollment للمقرر أم occurrence، ولي الأمر، المقاعد والحضور | معلّق؛ لا تعتمد سعات 50/100 قبل سعة القاعة والسياسة | مالك المنتج/المركز |
| D0-07 | أسواق الإطلاق وتصنيف البيانات والاحتفاظ/الحذف وموافقات الرسائل | معلّق؛ يلزم تحديد السوق ثم مراجعة الخصوصية والقانون | مالك المنتج + الخصوصية |
| D0-08 | العربون/الاسترداد/العملة/مزود الدفع | checkout معطل حالياً؛ النطاق والمزود والعملة غير معتمدة | مالك المنتج + المالية |
| D0-09 | مزود البريد والقنوات الإضافية وتفضيلات العميل | البريد يحتاج حسم إعداد الإنتاج؛ SMS/WhatsApp لا تعتبر مفعلة حتى اعتماد المزود والامتثال | مالك المنتج + التشغيل |
| D0-10 | ملفات uploads العامة مقابل الخاصة | افتراض آمن: لا ملفات شخصية/سريرية في المسار العام؛ تصنيف المحتوى الحالي وتأكيد النطاق مطلوب | مالك المنتج + الخصوصية |
| D0-11 | Bootstrap أول platform super admin | الترقية التلقائية أزيلت من التسجيل؛ bootstrap صريح مشروط ويدقق المشغل/السبب، ولا يستبدل مسؤولاً موجوداً | مالك المنصة + الأمن |
| D0-12 | بيئة pre-launch | مؤكّد: التطبيق له `local` و`production`؛ `check:staging` فحص معزول وليس وضعاً ثالثاً | مالك المنصة |

## إجراءات المرحلة 0 المنفذة

- إزالة ترقية أول حساب تلقائياً إلى `super_admin` عند التسجيل؛ حسابات المسؤولين الحاليين لا تُخفض صلاحياتها.
- إضافة `npm run platform-admin:bootstrap`: يتطلب production وPostgreSQL وهوية Clerk لمستخدم نشط موجود، واسم المشغل والسبب؛ يرفض التنفيذ إذا وجد أي platform admin ويسجل audit event.
- تعطيل GET/POST `/api/development-events` خارج `local`.
- توسيع `npm run check:staging` للتحقق من `workspace-profile` و`ops/bootstrap` وسلوك تعطيل سجل التطوير.

## حالة المرحلة 0

مخرجات الجرد والحواجز العاجلة وفحصها مكتملة. **بوابة اعتماد نطاق المنتج ما زالت مفتوحة** بسبب القرارات `D0-01`, `D0-02`, `D0-04`, `D0-06`, `D0-07`, `D0-08`, `D0-09`, و`D0-10`. لا تُعتبر جاهزية الإنتاج مكتملة، ولا تبدأ migrations للمجالات قبل اعتماد قرارات الملكية والحجز والبيانات ذات الصلة.

## ما يسمح به إغلاق المرحلة 0

يمكن إغلاق الاكتشاف عندما تكون كل المسارات في الجرد، وتملك القرارات المفتوحة مالكاً، ويُعرف كل مسار على أنه عام أو خاص أو جلسة شرطية، وتوجد بيانات اختبار اصطناعية. لا يسمح هذا وحده بفتح production؛ بوابة المرحلة 1 تتطلب تنفيذ المصادقة والعضوية/RBAC واختبارات الرفض والعزل. نتيجة `check:staging` الحالية لا تغطي ذلك.
