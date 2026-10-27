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
| 2. سلامة البيانات والترحيل | مكتملة تقنياً | تدقيق FK مركبة، مصدر الحقيقة، JSON/PG migration، backup/restore لـ `workspace_ops_*` + staff links | ترحيل idempotent بلا سجلات يتيمة، مقارنة موثقة واستعادة ناجحة |
| 3. الحجز الذري والتوفر | مكتملة تقنياً | قفل/قيود تداخل، holds، idempotency (JSON+PG+HTTP)، عقد timezone/DST للمدة+buffer | اختبار تنافس للفترات مع أثر commit ذري على JSON وPG |
| 4. الموارد وامتدادات الخدمات | مكتملة تقنياً | `occupancy_mode` + `composition`، موارد، جلسات، تسجيلات، حضور، HTTP، عزل | قبول مستقل لـ exclusive وrental وsession_capacity وbundle + عزل |
| 5. الرحلات والواجهة | قيد التنفيذ (حزمة رحلات أساسية) | onboarding بقفل قالب، كتالوج+occupancy+موارد، دور عضوية، حجز عام RTL | رحلة كاملة وصلاحيات/RTL/accessibility مقبولة؛ متبقٍ: روابط إلغاء موقعة، pagination، تسجيل جلسة عام كامل |
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
  - لم يُشغَّل migrate ضد Postgres حي في هذه البيئة (لا `DATABASE_URL`)؛ يبقى بند الإثبات المزدوج على 5432.

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
- **أوامر العرض:** `npm run seed:demo:restore` / `seed:demo:save` / `users:cleanup-demo-owners`.
- **مسؤول المنصة:** `contact.fakhry@gmail.com` فقط (`super_admin`) وبدون أي مساحة؛ المالكان ليسا platform admin.
- **تنظيف UX:** banners ثنائية اللغة + SAVEPOINT للجداول الاختيارية + إعادة تعيين audit immutable. توليد المستشفى النادر: `node scripts/generate-medical-seed-section.js` (بدون npm alias يومي). راجع [`MEDICAL_DEMO_SEED.md`](MEDICAL_DEMO_SEED.md).

### المرحلة 2 — إغلاق: PG ops backup/restore + migrate مرتين — 2026-10-27

- **الأدوات:** [`scripts/ops-pg-backup.js`](../scripts/ops-pg-backup.js) ينسخ/يسترجع `workspace_ops_*` و`workspace_staff_links` فقط. النسخ لا يمسح؛ الاستعادة ترفض العمل بلا هدف صريح. أوامر npm: `ops:pg-backup` / `ops:pg-restore` / `ops:pg-backups`.
- **التحقق الآلي:** [`scripts/smoke-ops-pg-backup.js`](../scripts/smoke-ops-pg-backup.js) — بدون Postgres يخرج `skipped:true` برسالة واضحة؛ مع `DATABASE_URL` يثبت backup→wipe→restore ثم `compareStores` JSON↔PG `ok=true`. `--migrate-twice` يثبت ledger لـ 011+012 مع `pending=0` في المرّة الثانية.
- **البذور:** `audit-ops-integrity --seed=medical|education` → `orphanCount=0`.
- **إثبات الوكيل:** Postgres محلي ephemeral (5432) نجح لـ migrate مرتين + drill. على Sam-PC أعد `npm run migrate` مرتين على 5432 و`npm run test:ops-pg-backup:full` قبل اعتماد بيانات حية.
- **إغلاق المرحلة 2:** `phase_2_closed=true` في [`ROADMAP_PROGRESS.json`](ROADMAP_PROGRESS.json).

### المرحلة 3 — الحزمة الأولى: نواة الحجز الذري (JSON) — 2026-10-27

- **الوحدة:** [`bookingAtomic.js`](../bookingAtomic.js) — تداخل `[start, end+buffer)`، قفل async لكل مساحة، `idempotencyKey`، تحرير hold مرة واحدة (إلغاء/انتهاء).
- **التوصيل:** `opsStore.createAppointment` / `createAppointmentAsync` / `createPublicAppointment` / `cancelSlotHold`.
- **التحقق:** `npm run test:atomic-booking` يغطي: تداخل متزامن (نجاح واحد)، فترات متجاورة، إعادة idempotent، hold cancel/expiry، امتداد buffer.

### المرحلة 3 — تماثل PostgreSQL + HTTP idempotency + timezone/DST — 2026-10-27

- **ترحيل:** [`013_appointment_idempotency_key.sql`](../db/migrations/013_appointment_idempotency_key.sql) — عمود `idempotency_key` + فهرس فريد جزئي على `(workspace_id, idempotency_key)`.
- **PG:** `workspaceOpsPg` يحمّل/يحفظ المفتاح؛ مسار المساحة المُدارة يعمل تحت قفل advisory + قفل bookingAtomic. `npm run test:atomic-booking-pg` يثبت التداخل/المتجاور/idempotent/hold وround-trip للمفتاح (يتخطى بلا `DATABASE_URL`).
- **HTTP:** `Idempotency-Key` أو `body.idempotencyKey` على `POST /api/public/booking/:slug/appointments` و`POST /api/ops/appointments` (الأخير عبر `createAppointmentAsync`). تأكيد البريد بعد commit لمساحة العمل.
- **Timezone/DST:** `civilDateInTimeZone` + `occupancyInterval` مشتركان؛ `npm run test:booking-timezone` — حدود UTC، مدة+buffer، يوم spring-forward في `America/New_York` بحساب دقائق الجدار.
- **إغلاق المرحلة 3:** `phase_3_closed=true`. أنماط الإشغال/الموارد/سعة الجلسات = المرحلة 4 فقط.
- **منفذ Sam-PC:** Postgres الحي على **5432** / قاعدة `maw3ed` (ليس 5433).

### المرحلة 4 — الحزمة الأولى: نواة السعة والموارد (generic) — 2026-10-27

- **الترحيل:** [`014_workspace_capacity_resources_sessions.sql`](../db/migrations/014_workspace_capacity_resources_sessions.sql) — أعمدة `occupancy_mode` / `default_capacity` / `composition_default` على الخدمات؛ جداول `workspace_ops_resources`، `service_resource_requirements`، `session_series`، `session_occurrences`، `session_enrollments`، `attendance_records`، `resource_allocations` مع ملكية tenant وقيود وحدة المقعد.
- **المحرك:** [`capacityEngine.js`](../capacityEngine.js) + [`capacityOps.js`](../capacityOps.js) موصولان عبر [`opsStore.js`](../opsStore.js)؛ مسار JSON محلي + [`workspaceOpsPg.js`](../workspaceOpsPg.js) load/save؛ جداول السعة في [`scripts/ops-pg-backup.js`](../scripts/ops-pg-backup.js).
- **القواعد:** لا استنتاج من `activity_mode`/قالب؛ السعة الفعلية لا تتجاوز مقاعد المورد عند `unit=seat`؛ exclusive/rental يمنعان تداخل التخصيص؛ session_capacity يقفل عبر `bookingAtomic` مع رفض الامتلاء والتسجيل المكرر وتحرير المقعد مرة عند الإلغاء؛ bundle يفشل مغلقاً.
- **التحقق:** `npm run test:capacity-modes` (JSON: exclusive/rental/session_capacity/bundle) و`npm run test:capacity-pg` (migrate 014 + round-trip). مجمّع: `npm run test:phase4-capacity`.
- **حزمة 2 (إغلاق المرحلة 4):** مسارات ops HTTP للموارد/المتطلبات/الجلسات/التسجيل/الحضور/bundle؛ تخصيص تلقائي لـ exclusive/rental عند `createAppointment` مع تحرير عند الإلغاء؛ `npm run test:capacity-http` و`test:capacity-isolation` (عزل store + BOLA عبر الهيدر).
- **إغلاق المرحلة 4:** `phase_4_closed=true`. مؤجّل غير حاجز: ضغط تسجيل متزامن على PG، إدارة series في الواجهة، افتراضات قوالب المجالات. **لا تعلن** التعليم/الصالون/التأجير جاهزة للإنتاج.

### المرحلة 5 — حزمة الرحلات الأساسية (onboarding / كتالوج / أدوار / حجز عام) — 2026-10-27

- **قفل القالب عند الإنشاء:** `seedWorkspace(..., { lockActivity: true })` من `POST /api/workspaces`؛ onboarding في `ClerkGate` يطلب تأكيد القفل؛ شاشة القوالب داخل المنشأة تُخفى بعد القفل؛ شريط النشاط عرض فقط (لا تبديل طبي/مرن).
- **الكتالوج والموارد:** نموذج الخدمة يعرض `occupancyMode` / `defaultCapacity` / `compositionDefault`؛ دليل الخدمات يعرض شارة إشغال؛ شاشة موارد رقيقة (`ResourcesView`) عبر bootstrap `resources` دون ادعاء جاهزية التعليم/الصالون/التأجير.
- **أدوار الواجهة:** دور العضوية من bootstrap/`/api/workspaces` (وليس localStorage التجريبي)؛ تصفية التنقل لـ viewer/staff/manager؛ staff مربوط يحصل على bootstrap مُقشَّط لمكتب الحضور فقط.
- **حجز عام + تقويم:** `book.html` يعرض تلميح سعة/تأجير من حقول الخدمة؛ التقويم يمرّر تلميح الإشغال عند الإنشاء؛ RTL عربي قائم.
- **التحقق:** `npm run test:phase5-journeys` (+ تحديث `test:staff-links` لـ bootstrap staff).
- **لا تُغلق المرحلة 5 بالكامل:** متبقٍ روابط إلغاء/إعادة جدولة موقعة للعميل، pagination للقوائم، رحلة تسجيل جلسة عامة كاملة، ومراجعة a11y أوسع. **لا تعلن** Stripe/SMS/WhatsApp أو مجالات رأسية جاهزة.
- **التالي:** إكمال متبقيات المرحلة 5 أو الانتقال للمرحلة 6 (رسائل/فوترة) بعد قرار المالك.

## نقطة الاستئناف

1. شغّل `npm run test:phase5-journeys` و`npm run test:phase4-capacity`.
2. على Sam-PC:  
   `MAW3ED_STORAGE=postgres DATABASE_URL=postgresql://...@127.0.0.1:5432/maw3ed npm run migrate` ثم اختبارات المرحلة 4/5.
3. متبقيات المرحلة 5: إلغاء/إعادة جدولة موقّعة، pagination، تسجيل جلسة في الحجز العام — أو ابدأ المرحلة 6 إن قرر المالك تأجيلها.
