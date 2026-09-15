# نشر موعد Maw3ed على الـ VPS

المسار المعتمد:

```text
تطوير محلي (Cursor Desktop) → GitHub → VPS (المنفذ 7000)
```

لا يُنشر من Cloud Agent مباشرة إلى السيرفر. المصدر الوحيد للنشر هو الفرع على Git بعد نجاح التحقق المحلي.

## قبل النشر

على الجهاز المحلي:

```bash
npm run release:prepare
```

هذا الأمر يشغّل التحديث الكامل ثم يطبع أوامر Git والـ VPS.  
إن كان التحديث قد نجح مسبقاً:

```bash
node scripts/prepare-release.js --skip-refresh
```

راجع أيضاً: [`LOCAL_CURSOR_WORKFLOW.md`](LOCAL_CURSOR_WORKFLOW.md)

## رفع التطوير الناجح إلى Git

```bash
git add -A
git commit -m "وصف التغيير بعد نجاح التحقق المحلي"
git push -u origin replit-agent
```

استبدل اسم الفرع إن كنت تعمل على فرع آخر.

## على الـ VPS

استبدل المسارات وأسماء الخدمات بالقيم الحقيقية على السيرفر.

```bash
cd /path/to/maw3ed
git pull origin replit-agent
npm ci          # أو: npm install
npm run build
```

أعد تشغيل عملية Node التي تخدم المنفذ `7000`:

```bash
# مثال systemd
sudo systemctl restart maw3ed

# أو مثال pm2
pm2 restart maw3ed
```

تأكد من وجود `.env` على السيرفر (انسخ من `.env.example` وعدّل القيم):

- `PORT=7000`
- `VITE_PORT=7100` (للتطوير فقط؛ الإنتاج يعتمد على `dist/`)
- إن استخدمت Postgres: `MAW3ED_STORAGE=postgres` و`DATABASE_URL=...@127.0.0.1:5433/maw3ed`

**لا** تربط Maw3ed بالمنفذ `5000` — مخصص لـ UpNexa على نفس المضيف.

## Nginx

مثال كتلة الخادم موجود في [`nginx/maw3ed.conf`](nginx/maw3ed.conf):

- يوجّه الطلبات إلى `http://127.0.0.1:7000`
- استبدل `server_name` ومسارات TLS بما هو مستخدم على المضيف

بعد تعديل Nginx:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

## تحقق بعد النشر

- الصفحة الرئيسية عبر الدومين أو IP
- صفحة الحجز: `/book.html?slug=maw3ed-demo` (أو slug الإنتاج)
- عزل المنافذ: `npm run check:isolation` على السيرفر عند الشك

## خارج النطاق الحالي

- سكربت SSH ينفّذ النشر تلقائياً (يُضاف لاحقاً عند تثبيت المضيف والمسار)
- Origin / Cursor Codebase على Windows بدون WSL
