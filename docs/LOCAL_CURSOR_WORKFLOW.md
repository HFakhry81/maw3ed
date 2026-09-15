# مسار العمل المحلي في Cursor Desktop — موعد Maw3ed

التطوير الأساسي يتم **دائماً على الجهاز المحلي**، ثم يُرفع الناجح إلى GitHub، ومنه إلى الـ VPS.

```text
Cursor Desktop (Local)  →  GitHub  →  VPS (:7000)
```

## 1) فتح المشروع محلياً

1. في Cursor Desktop: **File → Open Folder**
2. اختر المجلد: `E:\UpNexa.com\maw3ed`
3. تأكد أن الشات/الوكيل يعمل بوضع **Local** وليس **Cloud**
   - شارة Cloud تعني أن الوكيل يعمل على مستودع سحابي — لا تستخدمه كبيئة تطوير أساسية لهذا المشروع

## 2) المنافذ المحلية

| الخدمة | المنفذ | الأمر |
| --- | ---: | --- |
| Node API + ويب الإنتاج | `7000` | `npm start` أو `scripts\run-backend.cmd` |
| Vite (تطوير React) | `7100` | `npm run dev` أو `scripts\run-frontend.cmd` |
| PostgreSQL (اختياري) | `5433` | قاعدة `maw3ed` |

التفاصيل: [`LOCAL_PORTS.md`](../LOCAL_PORTS.md)

## 3) تحديث الأجزاء تلقائياً

فعّل البيئة المحلية أولاً:

```bash
npm run env:local
```

| الأمر | الوظيفة |
| --- | --- |
| `npm run update:backend` أو `update:api` | اعتماديات + migrate/seed اختياري + فحص العزل |
| `npm run update:frontend` | اعتماديات + بناء React |
| `npm run update:web` | بناء `dist` + smoke HTTP |
| `npm run update:mobile` | تثبيت اعتماديات مجلد `mobile/` |
| `npm run update:all` أو `npm run refresh` | تحديث كامل + اختبارات smoke + mobile |
| `MAW3ED-UPDATE-ALL.bat` أو `scripts\update-all.cmd` | نفس المسار الكامل من Windows |
| `MAW3ED-TOOLBOX.bat` | قائمة تفاعلية لكل العمليات |

البيئات: [`ENVIRONMENTS.md`](ENVIRONMENTS.md) — `local` للتطوير و`production` للـ VPS فقط.

تخطّي التثبيت عند التكرار السريع:

```bash
set REFRESH_SKIP_INSTALL=1
npm run update:all
```

## 4) متى ترفع إلى Git؟

بعد أن ينجح التحديث المحلي والتحقق اليدوي السريع:

1. `npm run release:prepare` — يشغّل التحديث الكامل ويعرض أوامر الرفع والنشر
2. `git add` / `git commit` / `git push` إلى الفرع الحالي (غالباً `replit-agent`)
3. على الـ VPS: اتبع [`DEPLOY_VPS.md`](DEPLOY_VPS.md)

لا تدفع تغييرات لم تُختبر محلياً.

## 5) تشغيل سريع جنب بعض

```text
scripts\run-all.cmd
```

يفتح نافذتين: باك على `7000` وVite على `7100`.

## 6) روابط التجربة

- لوحة التحكم: http://127.0.0.1:7000/
- الحجز العام: http://127.0.0.1:7000/book.html?slug=maw3ed-demo
- Vite أثناء التطوير: http://127.0.0.1:7100/
