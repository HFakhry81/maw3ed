# موعد Maw3ed

## مسار التطوير (Local → Git → VPS)

- بيئة التطوير الأساسية هي **Cursor Desktop على المجلد المحلي** (`E:\UpNexa.com\maw3ed`)، وليس Cloud Agent.
- بعد نجاح التحقق المحلي: ارفع إلى GitHub ثم انشر على الـ VPS من Git.
- الدليل: `docs/LOCAL_CURSOR_WORKFLOW.md` · النشر: `docs/DEPLOY_VPS.md` · التحديث: `docs/refresh-and-test.md`

## التشغيل

- `npm start` يبني نسخة React الإنتاجية ثم يشغّل خادم Node. افتراضياً يستخدم `7000`.
- `npm run build` يبني الواجهة إلى `dist/`.
- `npm run dev` يشغّل Vite على `7100` مع بروكسي `/api` إلى `7000`.
- على Windows: `scripts\run-backend.cmd` · `scripts\run-frontend.cmd` · `scripts\run-all.cmd`
- التشغيل المحلي بدون `.env` متوافق مع وضع الذاكرة باستخدام بيانات `data/maw3ed-data.json`. وعلى VPS استخدم `.env.example` مع PostgreSQL على `5433` عند الحاجة.
- طبقات قاعدة البيانات موجودة في `db/migrations/` وتشمل المؤسسات ومساحات العمل والخطط والخدمات والعملاء والمواعيد والمدفوعات والمصروفات وساعات العمل.
- كل مساحة عمل يمكن تخصيصها كنشاط طبي أو تعليمي أو صالة بلياردو أو صالون أو مركز رياضي أو نشاط مخصص عبر `/api/workspace-profile`.
- Replit Preview اختياري فقط؛ لا يُعتبر مصدر الحقيقة للتطوير أو النشر.

## سكربتات التحديث

- `npm run update:backend` · `update:frontend` · `update:web` · `update:mobile`
- `npm run update:all` أو `npm run refresh` — تحديث كامل + smoke
- `npm run release:prepare` — تجهيز الرفع إلى Git ثم أوامر VPS

## بنية الواجهة

- الواجهة الرئيسية مبنية بـ React 19 وVite.
- الواجهة تتصل بمسارات API الحالية باستخدام `fetch` ولا تضيف طبقة بيانات أو بنية استضافة جديدة.
- يتم استخدام `memo` للمكونات المتكررة، و`useTransition` لتحديث البيانات دون تعطيل التفاعل، وVite لإخراج ملفات production مضغوطة.
- الأصول ذات الأسماء المصدّرة بالـ hash تحصل على cache طويل، بينما HTML وبيانات API لا تُخزّن مؤقتاً.
- عند إنشاء مساحة عمل جديدة عبر `/api/workspaces` يتم إنشاء ملف مؤسسة مستقل وتسميات وبيانات تشغيل أولية متوافقة مع نوع النشاط.

## سجل التطوير

- `DEVELOPMENT_LOG.md` هو التقرير المقروء لمراحل نمو المشروع.
- `docs/DEVELOPMENT_LOG.md` يسجّل القرارات والمراحل المهمة يدوياً.
- `data/development-log.jsonl` هو السجل الآلي القابل للتحليل.
- استخدم `npm run change:start` لبدء تعديل، و`npm run change:stage` لتسجيل مرحلة، و`npm run change:finish` لإغلاقه.
- استخدم `npm run change:watch` لتسجيل تغييرات الملفات تلقائياً أثناء جلسة تطوير؛ عند إيقافه يكتب تقرير النهاية.
