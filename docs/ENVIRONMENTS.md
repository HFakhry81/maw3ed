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

لا تستخدم Cloud Agent كمصدر نشر. لا توجد بيئات ثالثة (staging/replit/preview) في الإعداد الرسمي.

## الفروع

الفرع التشغيلي: `replit-agent` (ومزامن مع `main` بعد الدمج).  
كل التعديلات تتم محلياً ثم تُرفع إلى GitHub ثم تُسحب على الـ VPS.
