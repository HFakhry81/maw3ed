# سجل تنفيذ خارطة Maw3ed

هذا السجل هو الحالة التشغيلية للخطة في [`IMPLEMENTATION_ROADMAP.md`](IMPLEMENTATION_ROADMAP.md). يحدّث بعد كل حزمة؛ لا تُعلّم مرحلة مكتملة إلا مع مخرجاتها ودليل قبولها. حالات الاختبار تسجل كـ «لم تُشغّل» حتى تنفيذها فعلياً.

**المرافق الآلي:** [`ROADMAP_PROGRESS.json`](ROADMAP_PROGRESS.json) — جدول حالة المراحل + checklist + `resume_pointer` يُحدَّث مع هذا السجل بعد كل حزمة (لا يستبدله).

**آخر تحديث:** 2026-10-27  
**المشروع:** `E:\UpNexa.com\maw3ed`  
**النطاق:** منصة Maw3ed الحالية. الأولوية للنواة الطبية الموجودة؛ لا تُعلن قوالب التعليم/الرياضة/الصالون/التأجير جاهزة قبل امتدادات السعة والموارد.  
**المبدأ:** احتفظ بمسار JSON المحلي وPostgreSQL أثناء الانتقال، لكن كل مسار غير محلي يجب أن يرفض الوصول عند تعذر إثبات الهوية والعضوية والصلاحية.

## المراحل والحالة

| المرحلة | الحالة | النطاق/المخرج | بوابة الإغلاق |
| --- | --- | --- | --- |
| 0. النطاق وحصر السطح | مكتملة للنطاق التقني | ترتيب التنفيذ، جرد مجموعات API، قرارات المجال التقنية، وسجل التنفيذ | كل مجموعة لها مالك تنفيذي، مخاطر، ومجموعة قبول؛ القرارات التجارية/القانونية تسد إطلاق الميزة المرتبطة بها |
| 1. الهوية والعزل وRBAC | قيد التنفيذ | auth fail-closed خارج local، عضوية نشطة، سياسة route × method × role لـ ops والـ legacy، حماية development-events والملفات الخاصة | مصفوفة قبول 401/403/404 وBOLA/property/function-level؛ تغطية DB وJSON أو منع JSON في الإنتاج |
| 2. سلامة البيانات والترحيل | لم تبدأ | تدقيق FK مركبة، مصدر الحقيقة، JSON/PG migration، backup/restore | ترحيل idempotent بلا سجلات يتيمة، مقارنة موثقة واستعادة ناجحة |
| 3. الحجز الذري والتوفر | لم تبدأ | قفل/قيود تداخل، holds، idempotency، حالات الإلغاء وإعادة الجدولة | اختبار تنافس للفترات والمورد والسعة مع أثر commit ذري |
| 4. الموارد وامتدادات الخدمات | لم تبدأ | `occupancy_mode` + `composition`، موارد، جلسات، تسجيلات، حضور | قبول مستقل لـ exclusive وrental وsession_capacity وbundle |
| 5. الرحلات والواجهة | لم تبدأ | onboarding والكتالوج والتقويم والعميل ومكتب التشغيل | رحلة كاملة وصلاحيات/RTL/accessibility مقبولة |
| 6. الرسائل والفوترة والتكاملات | لم تبدأ | outbox ومزودون وwebhooks وتكاملات | sandbox/replay/idempotency/فشل مع تعطيل الميزة عند عدم الجاهزية |
| 7. التشغيل والخصوصية والاستعادة | لم تبدأ | الأسرار والرصد والاحتفاظ والاستعادة والحوادث | restore drill وrunbook وملكية تنبيه/استجابة موثقة |
| 8. قبول ما قبل الإطلاق | لم تبدأ | CI وproduction-like وقبول يدوي | كل البوابات ناجحة على revision محدد وبيانات اصطناعية |
| 9. تجربة محدودة والتوسع | لم تبدأ | pilot محدود وقرار التوسع والرجوع | Go/No-Go من المالكين، لا إطلاق ذاتي أثناء هذا التنفيذ |

## قائمة تحقق سريعة (تُزامن مع ROADMAP_PROGRESS.json)

- [x] المرحلة 0 — جرد API وقرارات تقنية وسجل تنفيذ
- [x] المرحلة 1 — حزمة `/api/ops/*` RBAC + membership
- [x] المرحلة 1 — حزمة legacy medical APIs + development-events + uploads
- [x] المرحلة 1 — اختبارات BOLA/حقول صلاحية (function/property/object) عبر المستأجرين
- [x] المرحلة 1 — سجل أحداث تشغيل workspace (JSONL لكل مساحة، بلا migration)
- [x] المرحلة 1 — قرار/فرض وضع production لـ DB مقابل JSON (عضوية إجبارية + تحذير/strict اختياري)
- [ ] المرحلة 1 — ربط حساب staff↔سجل موظف قبل توسيع desk (بوابة منتج موثّقة؛ لم تُخترع في هذه الحزمة)
- [ ] إغلاق المرحلة 1 بالكامل (متوقف على بوابة staff أعلاه أو قرار مالك صريح بقبولها مفتوحة بعد الإطلاق المحدود)
- [ ] بدء المرحلة 2 (ترحيل/seed/reset) — **ممنوع قبل إغلاق بوابة المرحلة 1**

## حصر مجموعات API (مراجعة ساكنة)

| مجموعة | المسارات | الحالة التي يجب أن يفرضها الخادم |
| --- | --- | --- |
| عامة/تهيئة | `/api/config`, `/api/plans`, `/api/activity-templates`, `/api/health*`, `/api/public/booking/*` | allowlist فقط؛ بيانات صفحة عامة محدودة، rate limit، والإنشاء العام عبر إثبات/hold وسياسة الحجز |
| الحساب والمساحات | `/api/account`, `/api/workspaces`, `/api/entitlements`, `/api/billing/*` | Clerk؛ ربط كل فعل بالحساب ومساحة مسموحة؛ عدم قبول tenant من العميل كإذن |
| تشغيل workspace | كل `/api/ops/*` | auth خارج local، عضوية نشطة للمساحة المختارة، ثم دور مناسب للroute/الفعل/البيانات؛ `GET /api/ops/events` للمالك/المسؤول |
| قديم/مجال طبي | `/api/workspace-profile`, `/api/dashboard`, `/api/departments`, `/api/doctors`, `/api/patients`, `/api/appointments` | auth/عضوية/RBAC tenant-aware عبر `legacyAccess.js` عند تفعيل auth؛ إزالة الاستثناءات القديمة أو تعطيلها بعد ترحيل العملاء |
| سجل التطوير | `/api/development-events` | local فقط؛ مع auth عند `MAW3ED_REQUIRE_AUTH`/production-like؛ تنقية حقول حساسة وحد حجم |
| سجل تشغيل workspace | `data/workspaces/<id>/events.jsonl` عبر `GET /api/ops/events` | append-only لكل مساحة؛ منفصل عن development-events؛ بلا جدول PG حتى مرحلة لاحقة |
| مسؤول المنصة | `/api/admin/*` | دور منصة مستقل، فصل واجبات للأفعال عالية المخاطر، سجل platform audit |
| ملفات | `/data/uploads/*` | صور العلامة ضمن workspace تبقى عامة لصفحة الحجز؛ غير الصور و`/data/uploads` العامة تتطلب عضوية/جلسة عند تفعيل auth؛ منع traversal |

## قرارات التنفيذ المثبتة حتى الآن

- الحجز يصف ببعدين منفصلين: `occupancy_mode` على الخدمة/الجلسة/المورد، و`composition` على booking (`single` أو `bundle`). الـ bundle مجموعة بنود ذرية وليس نمط إشغال رابعاً.
- لا تُستنتج سعة أو سياسة حجز من `activity_mode` أو قالب النشاط.
- المستخدم لا يكتسب صلاحية من `x-workspace-id`; الخادم يثبت العضوية النشطة والدور في المساحة المطلوبة.
- افتراض الدور التشغيلي الأولي: owner/admin كاملان؛ manager تشغيل دون بيانات مالية/تجاوزات تسعير؛ staff وviewer يقتصران على قراءات إعداد غير حساسة حتى يربط حساب الموظف بملف/نطاق كائنات. تغيّر هذه السياسة يتطلب قراراً موثقاً واختبارات.
- واجهات legacy الطبية تتبع نفس خط الأساس: manager+ للقراءة/إنشاء المواعيد؛ owner/admin فقط لـ PATCH `/api/workspace-profile`؛ viewer/staff مرفوضان حتى ربط الموظف.
- وضع الإنتاج: المصادقة إلزامية؛ التخزين الافتراضي postgres عبر `load-env`؛ JSON مسموح لفحوص production-like المعزولة مع **عدم تجاوز العضوية**؛ التحذير عند JSON في production؛ الرفض الصارم اختياري عبر `MAW3ED_STRICT_PRODUCTION_STORAGE=1` ما لم يُضبط `MAW3ED_ALLOW_JSON_IN_PRODUCTION=1`.
- تبقى قرارات الدفع/الاسترداد، مدد الإلغاء، سياسة الرسائل، والالتزامات القانونية حسب السوق بوابات موقوفة قبل تفعيل الميزات ذات الصلة.

## سجل الإنجاز

### المرحلة 0 — مكتملة للنطاق التقني — 2026-10-27

- راجعت خارطة التنفيذ مع `AGENTS.md` وحالة الكود الحالي. صححت افتراض الخطة الأقدم بأن `/api/ops/*` بلا أي auth: الحاجز الحالي مشروط بالبيئة، وعضوية DB وحدها لا تغطي RBAC، لذلك فُتح بند التنفيذ بدقة.
- جردت مجموعات ومسارات `server.js`, `opsRoutes.js`, `platformAdminRoutes.js` حسب المسارات وطرق HTTP في [`SECURITY_ROUTE_INVENTORY.md`](SECURITY_ROUTE_INVENTORY.md)؛ فصلت واجهات العامة والحساب والتشغيل والقديمة والمنصة والملفات.
- حسمت الترتيب التقني: P0 للهوية والتفويض والبيانات، ثم الحجز الذري، ثم موارد/جلسات المجال. المجالات غير المنفذة تظل غير مفعلة.
- أضفت هذا السجل لتحديث حالة كل مرحلة تلقائياً بعد تنفيذ الحزمة.
- قرارات النطاق التجاري/القانوني لم تُعلن محسومة؛ تبقى بوابات للميزات المقابلة ولا تمنع إغلاق أول حزمة أمن مستقلة.

### المرحلة 1 — الحزمة الأولى: حماية `/api/ops/*` — مكتملة تقنياً داخل المرحلة

- **التغيير:** أضيفت سياسة خادمية للـ route/method والـ role؛ الأدوار غير المعروفة والمسارات الجديدة تفشل افتراضياً. `viewer` و`staff` محصوران بقراءة جدول النشاط/الساعات؛ لا يسمح للموظف بأفعال desk حتى يتوفر ربط حساب الموظف بالفاعل وسجل الزيارة؛ المالية وتسعير التعديل والملف العام للمالك/المسؤول؛ المدير لبقية التشغيل.
- **العضوية:** أصبح مسار auth يستدعي resolver العضوية لمسار DB وJSON، وتستبعد عضويات/workspaces غير النشطة في استعلام DB؛ يظل اختيار workspace من العميل محدداً للسياق فقط.
- **التحقق:** نجح `node --check opsRoutes.js`, `node --check server.js`, `node --check scripts/smoke-ops-rbac.js` و`npm run test:ops-rbac`؛ smoke أثبت رفض unauthenticated/non-member/viewer/manager-finance، وسياسة الأدوار والمسارات المجهولة. هذا اختبار وحدات/حاجز محدود وليس اختبار API متكاملاً أو BOLA على كل المسارات.
- **ملاحظة:** هذه الحزمة وحدها لا تغلق المرحلة 1.

### المرحلة 1 — الحزمة الثانية: legacy + development-events + uploads — 2026-10-27

- **التغيير:** أُضيف [`legacyAccess.js`](../legacyAccess.js) بسياسة route×method×role للواجهات الطبية القديمة، وresolver عضوية مشترك لمساري DB وJSON. `server.js` يستدعيه قبل قراءة/كتابة `/api/workspace-profile`, `/api/dashboard`, `/api/departments`, `/api/doctors`, `/api/patients`, `/api/appointments`. لم يعد `getRequestOrganizationId` يتجاوز فحص العضوية في مسار JSON عند تفعيل auth.
- **development-events:** يبقى محظوراً خارج `MAW3ED_ENV=local` (404). داخل local ومع auth المطلوب تُفرض جلسة؛ تُنقّى تفاصيل الأحداث من حقول حساسة شائعة ويُحد حجمها.
- **uploads:** صور العلامة ضمن `/data/uploads/workspaces/:id/*.(png|jpg|…)` تبقى عامة لصفحة الحجز. الملفات غير الصورية لنفس المسار و`/data/uploads/*` العامة تتطلب عضوية/جلسة عند تفعيل auth؛ الوصول العابر للمستأجر يُرجع 404 دون كشف الوجود.
- **التحقق (شُغّل فعلياً في هذه الجلسة):**
  - `npm run test:ops-rbac` → `{"ok":true,"suite":"smoke-ops-rbac"}`
  - `npm run test:legacy-rbac` → `{"ok":true,"suite":"smoke-legacy-rbac"}`
  - `node --check legacyAccess.js` / `server.js` / `opsRoutes.js` / `scripts/smoke-legacy-rbac.js` / `scripts/smoke-ops-rbac.js` → نجاح بلا أخطاء
- **المتبقي آنذاك:** BOLA أوسع؛ سجل أحداث workspace؛ وضع DB/JSON؛ ربط staff.

### المرحلة 1 — الحزمة الثالثة: BOLA + أحداث workspace + وضع الإنتاج — 2026-10-27

- **BOLA / function / property:** أُضيف [`scripts/smoke-bola.js`](../scripts/smoke-bola.js). يغطي: رفض `x-workspace-id` لمساحة غير مملوكة؛ كائن staff خاص بمساحة B داخل سياق A → 404؛ نفس المعرف القالبي `staff-owner` لا يسرّب التعديل بين المستأجرين؛ manager لا يصل لتسعير المواعيد ولا `GET /api/ops/events`؛ bootstrap للمدير يحذف `expenses`/`notifications`؛ legacy patients ترفض رأس مساحة مزوّراً.
- **سجل أحداث workspace:** [`workspaceEvents.js`](../workspaceEvents.js) يكتب JSONL append-only في `data/workspaces/<id>/events.jsonl` (يعمل مع JSON وPG بدون migration). `GET /api/ops/events` للمالك/المسؤول فقط. تُسجَّل رفضات التفويض وتحديثات staff/activity/pricing الحساسة مع تنقية التفاصيل. جدول PostgreSQL مؤجّل لمرحلة تشغيل/خصوصية لاحقة.
- **وضع الإنتاج DB/JSON:** [`runtimePosture.js`](../runtimePosture.js) + فحص عند الإقلاع ورفض 503 للـ ops عند فشل الوضعية الصارمة. القرار الموثّق: auth إلزامي في production؛ JSON لا يتجاوز العضوية؛ التحذير عند JSON؛ الرفض الاختياري بـ `MAW3ED_STRICT_PRODUCTION_STORAGE`.
- **staff↔record:** لم يُنفَّذ ربط حساب الموظف عمداً (قرار منتج مطلوب قبل توسيع desk). تبقى صلاحيات staff مرفوضة لأفعال desk/customers.
- **التحقق (شُغّل فعلياً):**
  - `npm run test:phase1-security` (= ops-rbac + legacy-rbac + bola + workspace-events) → نجاح
  - `node --check` على `runtimePosture.js`, `workspaceEvents.js`, `opsRoutes.js`, `server.js`, `legacyAccess.js`, سكربتات الـ smoke → نجاح

## نقطة الاستئناف

1. قرار مالك: هل تُغلق المرحلة 1 مع بقاء بوابة staff↔desk موثّقة، أم يُنفَّذ نموذج ربط الموظف أولاً؟
2. عند اعتماد الربط: حساب مستخدم ↔ `staff` record + نطاق كائنات، ثم اختبار desk لدور staff فقط؛ لا توسّع صلاحيات staff قبل ذلك.
3. اختياري لاحق: نقل أحداث workspace إلى جدول PG append-only (يتطلب migration — خارج المرحلة 1).
4. لا تبدأ migration/seed/reset لبيانات التشغيل (المرحلة 2) قبل إغلاق بوابة المرحلة 1 أو قرار مالك صريح.
