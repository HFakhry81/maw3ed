# البيئات — موعد Maw3ed

وضعان فقط:

| الوضع | الملف | الاستخدام |
| --- | --- | --- |
| `local` | `.env.local` | تطوير على Cursor Desktop |
| `production` | `.env.production` | تشغيل VPS |

## التفعيل

```bat
copy .env.local.example .env.local
copy .env.production.example .env.production
copy .env.mode.example .env.mode
```

ضع في `.env.mode` كلمة واحدة: `local` أو `production`  
أو نفّذ:

```bash
npm run env:local
npm run env:production
```

`scripts/load-env.js` يحمّل `.env.<mode>` ثم `.env` كاحتياطي مشترك.

## التدفق المعتمد

```text
تعديل محلي (MAW3ED_ENV=local)
  → npm run update:all
  → git commit / push
  → VPS: git pull + MAW3ED_ENV=production + npm start
```

## قبول ما قبل الإطلاق (production-like)

لا توجد بيئة تشغيل تطبيق باسم `staging` في هذا المشروع. (فرع Git اسمه `staging` موجود كممر دمج فقط — انظر [`GIT_WORKFLOW.md`](GIT_WORKFLOW.md)؛ ليس وضع تشغيل ثالثًا.) بدلًا من بيئة تشغيل منفصلة، يتم تمرير نفس قواعد الإنتاج عبر إعدادات تشغيلية صارمة للتأهل قبل الإطلاق المحدود:

```bash
MAW3ED_ENV=production MAW3ED_REQUIRE_AUTH=1 node server.js
npm run check:staging
```

تتحقق هذه الخطوة من:

- عزل منافذ التطبيق والـ VPS
- جاهزية الخدمة واستعدادها (`/api/health`, `/api/health/ready`)
- حماية المسارات الحساسة (`/api/patients`, `/api/appointments`, `/api/development-events`)
- عدم السماح بالوصول غير الموثق إلى واجهات التشغيل

لا تستخدم Cloud Agent كمصدر نشر. لا توجد بيئات ثالثة (staging/replit/preview) في الإعداد الرسمي.

## الفروع

الفرع الوحيد للمشروع: **`main`**.  
كل التعديلات تتم محلياً ثم تُرفع إلى GitHub ثم تُسحب على الـ VPS.

## مراجع

- [`DEPLOY_VPS.md`](DEPLOY_VPS.md) — نشر + Nginx + SSL + دومين  
- [`BOOKING_PORTAL_HOSTING_DOMAIN.md`](BOOKING_PORTAL_HOSTING_DOMAIN.md) — بوابة الحجز والفجوات  
- [`LOCAL_CURSOR_WORKFLOW.md`](LOCAL_CURSOR_WORKFLOW.md) — يوم العمل المحلي
