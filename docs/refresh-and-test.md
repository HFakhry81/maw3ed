# سكربتات التحديث والاختبار — موعد Maw3ed

التطوير الأساسي: **محلي في Cursor Desktop** ثم Git ثم VPS.  
راجع [`LOCAL_CURSOR_WORKFLOW.md`](LOCAL_CURSOR_WORKFLOW.md) و[`DEPLOY_VPS.md`](DEPLOY_VPS.md).

## تحديث كامل

```bash
npm run refresh
# أو
npm run update:all
# Windows:
scripts\update-all.cmd
# أو
powershell -File scripts\update-all.ps1
# أو
bash scripts/update-all.sh
```

## تحديث أجزاء منفصلة

| الأمر | الوظيفة |
| --- | --- |
| `npm run update:backend` | اعتماديات + ops reset soft + migrate/seed soft + فحص العزل |
| `npm run update:frontend` | اعتماديات + بناء React إلى `dist/` |
| `npm run update:web` | بناء `dist` + smoke HTTP |
| `npm run update:mobile` | `npm install` داخل `mobile/` |
| `npm run update:all` | المسار الكامل (نفس `refresh`) مع smoke |
| `npm run release:prepare` | تحديث كامل ثم طباعة أوامر Git وVPS |

تقرير آخر تحديث جزئي: `data/last-update-report.json`  
تقرير التحديث الكامل: `data/last-refresh-report.json`

تخطّي التثبيت عند التكرار السريع:

```bash
# Windows CMD
set REFRESH_SKIP_INSTALL=1
npm run update:all
```

## ماذا يفعل `refresh` / `update:all`؟

1. تثبيت الاعتماديات (يمكن تخطيه بـ `REFRESH_SKIP_INSTALL=1`)
2. إعادة ضبط بيانات العمليات المحلية (`ops:reset`)
3. محاولة `migrate` + `seed` لـ Postgres إن وُجدت (Soft fail بدون قاعدة بيانات)
4. بناء الواجهة `build`
5. فحص العزل `check:isolation` (soft)
6. Smoke لمحرك الحجز العام
7. Smoke HTTP على سيرفر مؤقت (منفذ `7099` افتراضياً)
8. كتابة تقرير في `data/last-refresh-report.json`

## أوامر فردية أخرى

| الأمر | الوظيفة |
| --- | --- |
| `npm run ops:reset` | تصفير `data/maw3ed-ops.json` لبذرة تجريبية نظيفة |
| `npm run test:smoke` | اختبار محرك الأوقات / hold / تضارب / CRM upsert |
| `npm run test:http` | اختبار مسارات API + `book.html` عبر HTTP |
| `npm run test:all` | smoke + http |
| `npm start` | بناء ثم تشغيل السيرفر على المنفذ `7000` |
| `scripts\run-backend.cmd` | تشغيل الباك على `:7000` |
| `scripts\run-frontend.cmd` | تشغيل Vite على `:7100` |
| `scripts\run-all.cmd` | باك + فرونت في نافذتين |

## بعد التحديث — للتجربة اليدوية

- لوحة التحكم: `http://127.0.0.1:7000/`
- صفحة الحجز العامة: `http://127.0.0.1:7000/book.html?slug=maw3ed-demo`
- Vite أثناء التطوير: `http://127.0.0.1:7100/`
