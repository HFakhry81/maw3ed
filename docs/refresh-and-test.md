# سكربتات التحديث والاختبار — موعد Maw3ed

لتحديث المشروع بالكامل واختبار النتائج محلياً:

```bash
npm run refresh
# أو
npm run update:all
# أو
bash scripts/update-all.sh
```

## ماذا يفعل `refresh`؟

1. تثبيت الاعتماديات (يمكن تخطيه بـ `REFRESH_SKIP_INSTALL=1`)
2. إعادة ضبط بيانات العمليات المحلية (`ops:reset`)
3. محاولة `migrate` + `seed` لـ Postgres إن وُجدت (Soft fail بدون قاعدة بيانات)
4. بناء الواجهة `build`
5. فحص العزل `check:isolation` (soft)
6. Smoke لمحرك الحجز العام
7. Smoke HTTP على سيرفر مؤقت (منفذ `7099` افتراضياً)
8. كتابة تقرير في `data/last-refresh-report.json`

## أوامر فردية

| الأمر | الوظيفة |
| --- | --- |
| `npm run ops:reset` | تصفير `data/maw3ed-ops.json` لبذرة تجريبية نظيفة |
| `npm run test:smoke` | اختبار محرك الأوقات / hold / تضارب / CRM upsert |
| `npm run test:http` | اختبار مسارات API + `book.html` عبر HTTP |
| `npm run test:all` | smoke + http |
| `npm start` | بناء ثم تشغيل السيرفر على المنفذ `7000` |

## بعد التحديث — للتجربة اليدوية

- لوحة التحكم: `http://127.0.0.1:7000/`
- صفحة الحجز العامة: `http://127.0.0.1:7000/book.html?slug=maw3ed-demo`
