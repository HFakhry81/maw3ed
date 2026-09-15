# نشر موعد Maw3ed على الـ VPS

المسار المعتمد:

```text
تطوير محلي (Cursor Desktop, MAW3ED_ENV=local)
  → GitHub (فرع replit-agent / main)
  → VPS (MAW3ED_ENV=production, المنفذ 7000)
```

لا يُنشر من Cloud Agent مباشرة. المصدر الوحيد للنشر هو Git بعد نجاح التحقق المحلي.

البيئات: [`ENVIRONMENTS.md`](ENVIRONMENTS.md) — وضعان فقط: `local` و `production`.

## قبل النشر (محلياً)

```bash
npm run env:local
npm run release:prepare
```

## رفع إلى Git

```bash
git add -A
git commit -m "وصف التغيير بعد نجاح التحقق المحلي"
git push -u origin replit-agent
# وحدّث main ليطابق آخر نسخة عند الجاهزية
git push origin replit-agent:main
```

## على الـ VPS

```bash
cd /path/to/maw3ed
git pull origin replit-agent

# مرة واحدة: إعداد بيئة الإنتاج
copy .env.production.example .env.production   # أو cp على Linux
echo production > .env.mode
# عدّل DATABASE_URL و SESSION_SECRET و Clerk في .env.production

npm ci          # أو: npm install
npm run build
npm run migrate # إن لزم
# إعادة تشغيل الخدمة على PORT=7000
#   sudo systemctl restart maw3ed
#   # أو: pm2 restart maw3ed
```

تأكد أن العملية تقرأ `MAW3ED_ENV=production` (عبر `.env.mode` أو متغير النظام).

**لا** تربط Maw3ed بالمنفذ `5000` — مخصص لـ UpNexa.

## Nginx

مثال: [`nginx/maw3ed.conf`](nginx/maw3ed.conf) → `http://127.0.0.1:7000`

```bash
sudo nginx -t && sudo systemctl reload nginx
```

## تحقق

- الصفحة عبر الدومين
- `/book.html?slug=...`
- `npm run check:isolation` عند الشك
