# سجل تطوير مشروع «موعد»

هذا الملف يسجل القرارات والمراحل المهمة في بناء نموذج منصة «موعد Maw3ed».  
أما الأحداث التشغيلية اللحظية فتُحفظ آلياً في `data/development-events.jsonl`.

## الحالة الحالية

### 2026-09-15 — Local-first في Cursor Desktop (Local → Git → VPS)

- اعتماد التطوير الأساسي على المجلد المحلي في Cursor Desktop، وليس Cloud Agent.
- إضافة قاعدة مشروع `.cursor/rules/local-first.mdc` ودليل `docs/LOCAL_CURSOR_WORKFLOW.md`.
- سكربتات تحديث منفصلة: `update:backend` / `update:api` · `update:frontend` · `update:web` · `update:mobile` · `update:all`.
- ملفات Windows: `MAW3ED-UPDATE-ALL.bat` · `MAW3ED-TOOLBOX.bat` · `MAW3ED-QA-SUITE.bat` · `MAW3ED-PREPARE-RELEASE.bat`.
- سكربتات تشغيل: `scripts/run-backend.cmd` · `run-frontend.cmd` · `run-all.cmd` · `update-all.cmd` / `.ps1` / `.sh`.
- تجهيز الإصدار: `npm run release:prepare` مع توثيق النشر في `docs/DEPLOY_VPS.md` (Git pull على السيرفر ثم build وإعادة تشغيل `:7000`).
- المنافذ تبقى معزولة: API/web `7000`، Vite `7100`، Postgres اختياري `5433/maw3ed`.

### 2026-09-11 — PostgreSQL وGmail وهوية العلامة

- نقل بيانات المنشأة والأقسام والأطباء والمرضى والمواعيد إلى PostgreSQL عبر migration وseed قابلين لإعادة التشغيل.
- إضافة معاملات قاعدة البيانات وفهارس فريدة لمنع الحجز المزدوج للطبيب أو القسم في نفس الموعد.
- إضافة نظام تحقق من البريد برمز صالح لمدة 10 دقائق، مع تخزين hash للرمز وعدم تخزينه في قاعدة البيانات.
- ربط إرسال رمز التحقق بـ Gmail API من خلال اتصال Replit OAuth، مع outbox تطويري اختياري عند ضبط `MAW3ED_EMAIL_MODE=outbox`.
- إضافة `npm run build` وإنشاء `dist` للواجهة.
- استبدال الأيقونة بأيقونة SVG أصلية تعبّر عن التقويم والساعة والنبض والتأكيد.
- تثبيت حقوق المنتج والهوية باسم **Maw3ed** و **UpNexa-eg.com**.

### 2026-09-09 — تحويل النموذج إلى القطاع الطبي

- اعتماد مستشفى وعيادات كنطاق أولي للـ Prototype.
- إضافة لوحة تحكم RTL للمواعيد الطبية.
- إضافة المرضى والأطباء والطاقم والأقسام والعيادات إلى بنية الواجهة.
- دعم 15 قسماً طبياً مع خيار إضافة أقسام مخصصة.
- إضافة طبقة اختيار لغات تشمل 15 لغة مع اكتشاف لغة المتصفح وتبديل RTL/LTR.
- إضافة تسجيل آلي لأحداث الاستخدام من الواجهة إلى سجل JSONL.

## آلية تسجيل الأحداث

تستخدم الواجهة `trackEvent()` لإرسال الأحداث المهمة إلى:

```text
POST /api/development-events
```

ويضيف الخادم كل حدث كسطر مستقل بصيغة JSON داخل:

```text
data/development-events.jsonl
```

يمكن قراءة آخر الأحداث من:

```text
GET /api/development-events?limit=50
```

الأحداث الحالية تشمل:

- `page_loaded`
- `view_changed`
- `appointment_modal_opened`
- `appointment_created`
- `industry_mode_changed`
- `language_changed`
- `browser_language_detected`
- `week_navigated`
- `notifications_opened`

لا يتم تسجيل أسماء المرضى أو بياناتهم الحساسة في هذه الطبقة. السجل مخصص لمتابعة تطور النموذج وسلوك الواجهة أثناء البناء، وليس بديلاً عن سجل طبي أو نظام تدقيق إنتاجي.

## الخطوة التالية المقترحة

استكمال **دورة الحجز الطبية** فوق طبقة البيانات الحالية:

3. صفحة حجز عامة للمريض.
4. صلاحيات للمدير والطبيب والاستقبال.
5. توصيل الإشعارات والتذكيرات بعد تثبيت دورة الحجز.