# نشر موعد Maw3ed على الـ VPS

المسار المعتمد:

```text
تطوير محلي (Cursor Desktop, MAW3ED_ENV=local)
  → GitHub (فرع main)
  → VPS (MAW3ED_ENV=production, المنفذ 7000 خلف Nginx)
```

لا يُنشر من Cloud Agent مباشرة. المصدر الوحيد للنشر هو Git بعد نجاح التحقق المحلي.

البيئات: [`ENVIRONMENTS.md`](ENVIRONMENTS.md) — وضعان فقط: `local` و `production`.  
رؤية الحجز + الدومين: [`BOOKING_PORTAL_HOSTING_DOMAIN.md`](BOOKING_PORTAL_HOSTING_DOMAIN.md)

## قبل النشر (محلياً)

```bash
npm run env:local
npm run release:prepare
```

## رفع إلى Git

```bash
git add -A
git commit -m "وصف التغيير بعد نجاح التحقق المحلي"
git push origin main
```

## على الـ VPS

```bash
cd /path/to/maw3ed
git pull origin main

# مرة واحدة: إعداد بيئة الإنتاج
cp .env.production.example .env.production
echo production > .env.mode
# عدّل DATABASE_URL و SESSION_SECRET و Clerk وبريد SMTP في .env.production
# MAW3ED_STORAGE=postgres

npm ci
npm run build
npm run migrate
```

تأكد أن العملية تقرأ `MAW3ED_ENV=production` (عبر `.env.mode` أو متغير النظام) وتعمل على **PORT=7000**.

**لا** تربط Maw3ed بالمنفذ `5000` — مخصص لـ UpNexa.  
**لا** تعرض Vite `7100` للجمهور — للتطوير المحلي فقط.

## تشغيل مستمر (PM2 أو systemd)

### PM2 (مثال)

```bash
npm i -g pm2
# من جذر المشروع بعد البناء:
MAW3ED_ENV=production PORT=7000 pm2 start server.js --name maw3ed
pm2 save
pm2 startup
```

أو أنشئ `ecosystem.config.cjs` لاحقاً بنفس المتغيرات (`MAW3ED_ENV`, `PORT`, مسار العمل).

### systemd (مثال وحدة)

```ini
[Unit]
Description=Maw3ed
After=network.target postgresql.service

[Service]
Type=simple
WorkingDirectory=/path/to/maw3ed
Environment=MAW3ED_ENV=production
Environment=PORT=7000
ExecStart=/usr/bin/node server.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now maw3ed
```

## الدومين و DNS (Cloudflare)

1. اشترِ النطاق أو استخدم نطاقاً فرعياً (مثل `booking.example.com`).
2. اضبط Nameservers عند المسجّل على Cloudflare.
3. أضف سجلاً:
   - **Type:** `A`
   - **Name:** `@` أو `booking`
   - **Content:** عنوان IP العام للـ VPS
   - Proxy: اختياري (البرتقالي يخفي IP ويوفّر CDN؛ SSL Full أو Full Strict مع Certbot)
4. انتظر انتشار DNS ثم اختبر `ping` / `dig`.

المسار:

```text
الزائر → Domain → Cloudflare DNS → VPS IP → Nginx :443 → 127.0.0.1:7000
```

## Nginx

مثال HTTP أساسي: [`nginx/maw3ed.conf`](nginx/maw3ed.conf)  
استبدل `server_name` باسم نطاقك، ووجّه إلى `http://127.0.0.1:7000`.

```bash
sudo cp docs/nginx/maw3ed.conf /etc/nginx/sites-available/maw3ed
sudo ln -sf /etc/nginx/sites-available/maw3ed /etc/nginx/sites-enabled/maw3ed
sudo nginx -t && sudo systemctl reload nginx
```

## SSL (Certbot / Let's Encrypt)

بعد عمل HTTP على الدومين:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.example
sudo systemctl reload nginx
```

تجديد تلقائي عادةً عبر timer لـ certbot. تحقق:

```bash
sudo certbot renew --dry-run
```

تأكد أن `X-Forwarded-Proto` يصل للتطبيق (مضبوط في مثال Nginx) إن احتجت روابط HTTPS مطلقة.

## بريد الإنتاج

لا تعتمد على موصلات Replit في الـ VPS. اضبط في `.env.production` مزوّد SMTP/API (مثل SendGrid) عندما يُفعَّل مسار إرسال تأكيد الحجز.

## تحقق بعد النشر

- `https://your-domain/` لوحة/واجهة حسب الإعداد
- `https://your-domain/book.html?slug=...` بوابة الحجز
- إنشاء حجز تجريبي يظهر في تقويم الإدارة ويبقى بعد `pm2 restart` / `systemctl restart` (مع Postgres)
- `npm run check:isolation` عند الشك في تضارب المنافذ محلياً

## مراجع

- [`BOOKING_PORTAL_HOSTING_DOMAIN.md`](BOOKING_PORTAL_HOSTING_DOMAIN.md)
- [`public-booking-page.md`](public-booking-page.md)
- [`ENVIRONMENTS.md`](ENVIRONMENTS.md)
