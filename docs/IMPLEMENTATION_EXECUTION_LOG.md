# سجل تنفيذ خارطة Maw3ed

هذا السجل هو الحالة التشغيلية للخطة في [`IMPLEMENTATION_ROADMAP.md`](IMPLEMENTATION_ROADMAP.md). يحدّث بعد كل حزمة؛ لا تُعلّم مرحلة مكتملة إلا مع مخرجاتها ودليل قبولها. حالات الاختبار تسجل كـ «لم تُشغّل» حتى تنفيذها فعلياً.

**آخر تحديث:** 2026-10-27  
**المشروع:** `E:\UpNexa.com\maw3ed`  
**النطاق:** منصة Maw3ed الحالية. الأولوية للنواة الطبية الموجودة؛ لا تُعلن قوالب التعليم/الرياضة/الصالون/التأجير جاهزة قبل امتدادات السعة والموارد.  
**المبدأ:** احتفظ بمسار JSON المحلي وPostgreSQL أثناء الانتقال، لكن كل مسار غير محلي يجب أن يرفض الوصول عند تعذر إثبات الهوية والعضوية والصلاحية.

## المراحل والحالة

| المرحلة | الحالة | النطاق/المخرج | بوابة الإغلاق |
| --- | --- | --- | --- |
| 0. النطاق وحصر السطح | مكتملة للنطاق التقني | ترتيب التنفيذ، جرد مجموعات API، قرارات المجال التقنية، وسجل التنفيذ | كل مجموعة لها مالك تنفيذي، مخاطر، ومجموعة قبول؛ القرارات التجارية/القانونية تسد إطلاق الميزة المرتبطة بها |
| 1. الهوية والعزل وRBAC | مغلقة (بوابة staff نُفِّذت لاحقاً في م2) | auth fail-closed خارج local، عضوية نشطة، سياسة route × method × role، حماية legacy، BOLA، أحداث workspace، وضع JSON في الإنتاج | حواجز الأمن مغلقة على revision `366e209`؛ قرار الربط الكانوني نُفِّذ في المرحلة 2 |
| 2. سلامة البيانات والترحيل | قيد التنفيذ | تدقيق FK مركبة، مصدر الحقيقة، JSON/PG migration، backup/restore | ترحيل idempotent بلا سجلات يتيمة، مقارنة موثقة واستعادة ناجحة |
| 3. الحجز الذري والتوفر | لم تبدأ | قفل/قيود تداخل، holds، idempotency، حالات الإلغاء وإعادة الجدولة | اختبار تنافس للفترات والمورد والسعة مع أثر commit ذري |
| 4. الموارد وامتدادات الخدمات | لم تبدأ | `occupancy_mode` + `composition`، موارد، جلسات، تسجيلات، حضور | قبول مستقل لـ exclusive وrental وsession_capacity وbundle |
| 5. الرحلات والواجهة | لم تبدأ | onboarding والكتالوج والتقويم والعميل ومكتب التشغيل | رحلة كاملة وصلاحيات/RTL/accessibility مقبولة |
| 6. الرسائل والفوترة والتكاملات | لم تبدأ | outbox ومزودون وwebhooks وتكاملات | sandbox/replay/idempotency/فشل مع تعطيل الميزة عند عدم الجاهزية |
| 7. التشغيل والخصوصية والاستعادة | لم تبدأ | الأسرار والرصد والاحتفاظ والاستعادة والحوادث | restore drill وrunbook وملكية تنبيه/استجابة موثقة |
| 8. قبول ما قبل الإطلاق | لم تبدأ | CI وproduction-like وقبول يدوي | كل البوابات ناجحة على revision محدد وبيانات اصطناعية |
| 9. تجربة محدودة والتوسع | لم تبدأ | pilot محدود وقرار التوسع والرجوع | Go/No-Go من المالكين، لا إطلاق ذاتي أثناء هذا التنفيذ |

## حصر مجموعات API (مراجعة ساكنة)

| مجموعة | المسارات | الحالة التي يجب أن يفرضها الخادم |
| --- | --- | --- |
| عامة/تهيئة | `/api/config`, `/api/plans`, `/api/activity-templates`, `/api/health*`, `/api/public/booking/*` | allowlist فقط؛ بيانات صفحة عامة محدودة، rate limit، والإنشاء العام عبر إثبات/hold وسياسة الحجز |
| الحساب والمساحات | `/api/account`, `/api/workspaces`, `/api/entitlements`, `/api/billing/*` | Clerk؛ ربط كل فعل بالحساب ومساحة مسموحة؛ عدم قبول tenant من العميل كإذن |
| تشغيل workspace | كل `/api/ops/*` | auth خارج local، عضوية نشطة للمساحة المختارة، ثم دور مناسب للroute/الفعل/البيانات |
| قديم/مجال طبي | `/api/workspace-profile`, `/api/dashboard`, `/api/departments`, `/api/doctors`, `/api/patients`, `/api/appointments` | auth/عضوية/RBAC tenant-aware؛ إزالة الاستثناءات القديمة أو تعطيلها بعد ترحيل العملاء |
| سجل التطوير | `/api/development-events` | local فقط أو مسؤول مصادق عليه؛ منع جمع PII، حدود واحتفاظ |
| مسؤول المنصة | `/api/admin/*` | دور منصة مستقل، فصل واجبات للأفعال عالية المخاطر، سجل platform audit |
| ملفات | `/data/uploads/*` | فحص ملكية ونوع/حجم/مسار؛ لا تعرض ملفات خاصة عبر static handler |

## قرارات التنفيذ المثبتة حتى الآن

- الحجز يصف ببعدين منفصلين: `occupancy_mode` على الخدمة/الجلسة/المورد، و`composition` على booking (`single` أو `bundle`). الـ bundle مجموعة بنود ذرية وليس نمط إشغال رابعاً.
- لا تُستنتج سعة أو سياسة حجز من `activity_mode` أو قالب النشاط.
- المستخدم لا يكتسب صلاحية من `x-workspace-id`; الخادم يثبت العضوية النشطة والدور في المساحة المطلوبة.
- افتراض الدور التشغيلي الأولي: owner/admin كاملان؛ manager تشغيل دون بيانات مالية/تجاوزات تسعير؛ staff وviewer يقتصران على قراءات إعداد غير حساسة حتى يربط حساب الموظف بملف/نطاق كائنات. تغيّر هذه السياسة يتطلب قراراً موثقاً واختبارات.
- واجهات legacy الطبية تتبع نفس خط الأساس: manager+ للقراءة/إنشاء المواعيد؛ owner/admin فقط لـ PATCH `/api/workspace-profile`؛ viewer/staff مرفوضان حتى ربط الموظف.
- وضع الإنتاج: المصادقة إلزامية؛ التخزين الافتراضي postgres عبر `load-env`؛ JSON مسموح لفحوص production-like المعزولة مع **عدم تجاوز العضوية**؛ التحذير عند JSON في production؛ الرفض الصارم اختياري عبر `MAW3ED_STRICT_PRODUCTION_STORAGE=1` ما لم يُضبط `MAW3ED_ALLOW_JSON_IN_PRODUCTION=1`.
- **قرار مالك (2026-10-27):** إغلاق حواجز المرحلة 1 الأمنية ثم اعتماد نموذج staff↔desk الكانوني (انظر أدناه) وتنفيذه الأدنى في المرحلة 2.
- **قرار مالك — ربط الموظف (كانوني، 2026-10-27):** حساب دخول واحد لعدة مساحات؛ ملف `staff` منفصل؛ جدول ربط `workspace_staff_links` (الفرع = `workspace_id`؛ لا كيان branch موازٍ)؛ داخل المساحة واحد-لواحد مستخدم↔موظف؛ desk لـ `staff` فقط مع ربط نشط وفي نطاق ذلك `staffId`؛ بدون ربط → رفض. التفاصيل: [`STAFF_ACCOUNT_LINKS.md`](STAFF_ACCOUNT_LINKS.md).
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

### المرحلة 1 — إغلاق مع بوابة مفتوحة آنذاك — 2026-10-27

- دُمجت حزم المرحلة 1 إلى `main` (squash `366e209c889f5de234d70e649819937e5e584a87`).
- عند الإغلاق كانت بوابة staff↔desk مؤجّلة؛ لاحقاً حسم المالك النموذج الكانوني ونُفِّذ الحد الأدنى في حزمة المرحلة 2 `staff-links` (لا إعادة فتح المرحلة 1).

### المرحلة 2 — الحزمة الأولى: سلامة التشغيل (FK + دفتر ترحيل + مقارنة + استعادة JSON) — 2026-10-27

- **مصدر الحقيقة:** وثّقت في [`WORKSPACE_OPS_DATA_INTEGRITY.md`](WORKSPACE_OPS_DATA_INTEGRITY.md) متى يكون JSON أو `workspace_ops_*` مصدر الحقيقة، مع مسار المقارنة قبل التحويل.
- **FK مركبة:** جرد في [`opsIntegrity.js`](../opsIntegrity.js)؛ أُضيفت [`db/migrations/011_workspace_ops_composite_fks.sql`](../db/migrations/011_workspace_ops_composite_fks.sql) لقيود المواعيد/البنود/الزيارات بعد تحويل السلاسل الفارغة إلى `NULL`. بقيت `category_id` / `staff.service_category_id` فجوات soft موثّقة.
- **ترحيل idempotent:** [`scripts/migrate.js`](../scripts/migrate.js) يستخدم جدول `schema_migrations` ويتخطى الملفات المسجّلة؛ يدعم `--dry-run`.
- **أدوات:** `audit-ops-integrity.js` و`compare-workspace-ops.js` (JSON↔JSON؛ و`--right-pg` عند توفر Postgres).
- **استعادة:** drill في `smoke-ops-integrity` عبر `ops-session-backup` (بدون لمس `latest.json`)؛ مسار dump/restore لـ PG `workspace_ops_*` ما زال متبقياً.
- **التحقق (شُغّل فعلياً في هذه الجلسة):**
  - `npm run test:ops-integrity` → `{"ok":true,"suite":"smoke-ops-integrity",...}` مع فحوص inventory/ledger/orphan/compare/backup-restore
  - `node scripts/audit-ops-integrity.js --migrations-only --json` → `ok=true` وقيود 011 موجودة
  - `node scripts/audit-ops-integrity.js --fixture --json` → صفر orphans
  - `node --check` على `opsIntegrity.js` وسكربتات migrate/audit/compare/smoke → نجاح
  - لم يُشغَّل migrate ضد Postgres حي في هذه البيئة (لا `DATABASE_URL`)؛ يبقى بند الإثبات المزدوج على 5433.

### المرحلة 2 — الحزمة الثانية: ربط حساب الموظف (junction) وإنفاذ desk — 2026-10-27

- **المفردات:** لا يوجد جدول `branch`؛ العزل التشغيلي هو `workspace_id`. الحساب متعدد المساحات عبر `workspace_members`؛ الملف المهني عبر `workspace_ops_staff` / JSON `staff`.
- **الترحيل:** [`012_workspace_staff_links.sql`](../db/migrations/012_workspace_staff_links.sql) — جدول الربط + UNIQUE واحد-لواحد + FK مركّب إلى الموظف؛ وإضافة `workspace_members.status` ليطابق استعلام العضوية.
- **JSON:** `data/workspaces/<id>/staff-links.json` عبر [`staffLinks.js`](../staffLinks.js).
- **API:** سياقات الحساب `/api/account/contexts` وضمن `/api/account` و`/api/workspaces`؛ ops: `contexts` / `staff-link` / `staff-links` / `staff/:id/account-link`.
- **إنفاذ:** دور `staff` بلا ربط نشط → 403 على desk؛ مع ربط → desk مقصور على `staffId` (today/preview/check-in/complete)؛ addons/pricing تبقى owner/admin؛ `actorStaffId` من العميل يُتجاهل لدور staff.
- **التحقق:** `npm run test:staff-links` و`npm run test:ops-rbac` و`npm run test:bola` و`npm run test:ops-integrity` → نجاح.

### المرحلة 2 — بذرة موحدة (طبي + طلائع) وتنظيف المستخدمين — 2026-10-27

- **التصحيح النهائي للتعيين:** medical/hospital → `contact.haitham@gmail.com` / dawybooking؛ education/طلائع → `contact.haitham@yahoo.com` / talaaee-book.
- **ملف واحد:** `data/seeds/maw3ed-demo-ops.json` بقسمين (medical + education) — لا ملف بذرة ثانٍ.
- **أمر واحد:** `npm run seed:demo:restore` / `seed:demo:save` (أو `--section=medical|education`).
- **مسؤول المنصة:** `contact.fakhry@gmail.com` فقط (`super_admin`) وبدون أي مساحة؛ المالكان ليسا platform admin.
- **تنظيف مستخدمين:** `npm run users:cleanup-demo-owners` (dry-run ثم `--apply`) يبقي fakhry + المالكين الاثنين فقط وينقل أعلام المنصة إلى fakhry. راجع [`MEDICAL_DEMO_SEED.md`](MEDICAL_DEMO_SEED.md).

## نقطة الاستئناف

1. شغّل `npm run test:phase2-data`.
2. على Sam-PC: `npm run seed:demo:restore` ثم `npm run users:cleanup-demo-owners -- --dry-run` ثم `--apply` عند الرضا؛ حدّث المتصفح.
3. على Postgres محلي (5433): `npm run migrate` مرتين (011+012).
4. backup/restore لـ `workspace_ops_*` + `workspace_staff_links` ومقارنة JSON↔PG.
5. لا تعلن التعليم/الرياضة/الصالون/التأجير جاهزة للإنتاج.
