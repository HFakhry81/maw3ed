# بوابة الحجز العامة + الاستضافة + النطاق — موعد (Maw3ed)

وثيقة مكمّلة لرؤية المنتج: صفحة الحجز للعملاء، أين تُستضاف، وكيف يُربَط الدومين، وما زال ناقصاً في المشروع حتى الإطلاق الكامل.

**العلامة:** موعد / Maw3ed · UpNexa-eg.com  
**المسار المعتمد:** محلي (`MAW3ED_ENV=local`) → GitHub (`main`) → VPS (`MAW3ED_ENV=production`)  
**المنافذ:** API/الويب `7000` · Vite محلياً `7100` · لا تستخدم `5000` (UpNexa)

---

## أولاً: فكرة صفحة الحجز (Public Booking Portal)

صفحة الحجز واجهة موجهة للعملاء/المرضى لحجز موعد إلكترونياً دون اتصال هاتفي أو تطبيق إلزامي.

### 1. كيف تعمل الصفحة؟

| الخطوة | السلوك |
|--------|--------|
| الخدمات والطاقم | يختار الزائر الفئة → الخدمة (كشف، استشارة، مراجعة…) → موظف/طبيب أو **أي متاح** |
| التوفر اللحظي | الخادم يحسب الشرائح الحرة من ساعات العمل − الاستراحة − المدة+الـ buffer − الحجوزات والـ holds |
| بيانات الزائر | الاسم، الهاتف، البريد (اختياري)، ملاحظات |
| التأكيد | إنشاء موعد + upsert عميل في CRM → يظهر في تقويم الإدارة → إشعار تأكيد (Email منفّذ؛ WhatsApp/SMS لاحقاً) |

**الرابط العام:** `/book.html?slug={tenant}`  
**الملفات الحالية:** `book.html` · `opsRoutes.js` · `opsStore.js` · `opsPg.js` · `BookingPageView` في `src/main.jsx`  
**التفصيل التقني للرحلة والخوارزمية:** [`public-booking-page.md`](public-booking-page.md)

### 2. ما يجب أن تضمنه البوابة (اكتمل المفهوم)

- **إغلاق الحجز أونلاين:** مفتاح في لوحة الإدارة (`booking-page` / online toggle) — إن أُغلق تظهر رسالة ودّية بدل النموذج.
- **أيام مغلقة وإجازات:** لا تُعرض شرائح في أيام الإغلاق.
- **منع التضارب:** رفض `409` عند حجز مزدوج؛ hold مؤقت قبل التأكيد.
- **هوية المنشأة:** اسم، شعار، ألوان/هوية الصفحة العامة.
- **إلغاء / إعادة جدولة (هدف):** روابط موقّعة زمنياً في رسالة التأكيد — غير مكتملة في الكود بعد.
- **خصوصية:** جمع الحد الأدنى من البيانات؛ HTTPS إلزامي في الإنتاج؛ عدم تسريب بيانات عيادات أخرى عبر الـ slug.

### 3. مسار البيانات (هدف الإنتاج)

```text
[book.html]
   → GET  /api/public/booking/:slug
   → GET  /api/public/booking/:slug/slots?date=&serviceId=&staffId=
   → POST /api/public/booking/:slug/hold
   → POST /api/public/booking/:slug/appointments
   → JSON ops + (عند postgres) opsPg → appointments/patients
   → تقويم الإدارة + بريد تأكيد
```

**الوضع الحالي:** الوضع المحلي يستخدم مخزن ops JSON. عند `MAW3ED_STORAGE=postgres` تُحمّل مسارات `/api/ops/*` للمساحات المسجّلة في جدول `workspaces` بياناتها من جداول PostgreSQL المطبّعة (migration `010_normalized_workspace_ops.sql`) وتحفظ تغييراتها بمعاملة؛ كما يستمر مسار الحجز العام في مزامنة الحجز مع جداول PostgreSQL عبر `opsPg.js`.

---

## ثانياً: أين تقع الاستضافة (Hosting)؟

### 1. بيئة التطوير المحلية (`local`)

| عنصر | القيمة |
|------|--------|
| الوضع | `MAW3ED_ENV=local` عبر `.env.mode` / `npm run env:local` |
| التخزين الافتراضي | ذاكرة/JSON ما لم يُضبط `MAW3ED_STORAGE=postgres` |
| API + ملفات مبنية | `http://127.0.0.1:7000` |
| Vite (واجهة حية) | `http://127.0.0.1:7100` (بروكسي `/api` و`/data` → 7000) |
| الحجز للاختبار | `http://127.0.0.1:7000/book.html?slug=...` أو عبر 7100 بعد البناء/البروكسي |

التفاصيل: [`ENVIRONMENTS.md`](ENVIRONMENTS.md) · [`LOCAL_CURSOR_WORKFLOW.md`](LOCAL_CURSOR_WORKFLOW.md)

### 2. بيئة الإنتاج (`production`) على VPS

النموذج المعتمد لموعد: **تطبيق واحد (Node) يخدم API + `dist/` + `book.html` على المنفذ 7000 خلف Nginx.**

```text
تطوير محلي → push إلى GitHub (main) → على الـ VPS:
  git pull → npm ci → npm run build → npm run migrate → إعادة تشغيل العملية
```

| مكوّن | التوصية |
|-------|---------|
| نظام التشغيل | Linux VPS (Hetzner / Contabo / DigitalOcean…) |
| وقت التشغيل | Node.js LTS |
| قاعدة البيانات | PostgreSQL (`DATABASE_URL`) |
| استمرارية العملية | **systemd** أو **PM2** (منفذ `7000` فقط للداخل) |
| الواجهة الأمامية للجمهور | تُخدم من نفس Node (`dist/` + `book.html`) — أبسط للـ SSL والكوكيز |

**بديل اختياري لاحقاً:** فصل SPA على Vercel/Netlify مع `VITE_API_BASE` يشير لدومين الـ API. غير مطلوب للإطلاق الأول ويزيد تعقيد CORS والكوكيز.

دليل النشر الحالي: [`DEPLOY_VPS.md`](DEPLOY_VPS.md)

### 3. ما لا يُعتبر استضافة رسمية

- Cloud Agents / Replit كبيئة إنتاج
- المنفذ `5000`
- بيئات staging/preview كأوضاع رسمية (وضعان فقط: `local` | `production`)

---

## ثالثاً: اسم النطاق (Domain) وربطه

### 1. شراء الدومين

1. اختيار مسجّل: Cloudflare Registrar / Namecheap / Porkbun / GoDaddy  
2. البحث عن الاسم (مثل `maw3ed.com` أو نطاق فرعي `booking.upnexa-eg.com`)  
3. الشراء سنوياً والاحتفاظ بإيميل المالك و2FA

### 2. الربط (المسار الموصى به)

```text
[الزائر]
  → Domain (HTTPS)
  → Cloudflare DNS (A / AAAA، بروكسي برتقالي اختياري)
  → Public IP للـ VPS
  → Nginx :443 (SSL)
  → http://127.0.0.1:7000  (Node Maw3ed)
```

**ملاحظة مهمة:** وجّه Nginx إلى **7000** (عملية الإنتاج)، وليس 7100 (Vite للتطوير فقط).

### 3. خطوات عملية مختصرة

1. في المسجّل: اضبط Nameservers على Cloudflare.  
2. في Cloudflare DNS:  
   - `A` @ أو `booking` → IP العام للـ VPS  
   - (اختياري) `AAAA` لـ IPv6  
3. على الـ VPS: ثبّت Nginx وفق [`nginx/maw3ed.conf`](nginx/maw3ed.conf) مع `server_name` الصحيح.  
4. Certbot / Let's Encrypt لتفعيل HTTPS.  
5. اختبر: `https://your-domain/book.html?slug=...`

التفاصيل التنفيذية: قسم «الدومين وSSL» في [`DEPLOY_VPS.md`](DEPLOY_VPS.md)

---

## رابعاً: الإشعارات (Confirmations & Reminders)

| القناة | الهدف | الوضع في الكود |
|--------|--------|----------------|
| Email | تأكيد فوري للمريض + نسخة للمنشأة | موصول عبر `sendBookingConfirmationEmail` (outbox محلياً / SendGrid على VPS / Gmail connector كاحتياطي). يُحترم مفتاح `notifications.email.confirmation` |
| SMS | تأكيد وتذكير | واجهة «Pro» فقط — **لا مُرسل** |
| WhatsApp | تأكيد ضمن نافذة القوالب الرسمية | واجهة «Pro» فقط — **لا مُرسل** |
| تذكير قبل الموعد | Cron / وظيفة مجدولة | إعدادات بلا جدولة تنفيذ |

**الحد الأدنى للإطلاق العام:** تأكيد Email يعمل من الـ VPS عند `POST .../appointments` — **مُنفَّذ** (اضبط `SENDGRID_API_KEY` + `MAIL_FROM` في الإنتاج).  
**بعدها:** SMS أو WhatsApp خلف الخطة المدفوعة + تذكير T−24h / T−2h.

---

## خامساً: محرك الجدول — اكتمال مقابل الرؤية

| متطلب الرؤية | الوضع |
|--------------|--------|
| ساعات عمل المنشأة + استراحة | موجود (ops JSON) |
| شفتات لكل موظف/طبيب | **ناقص** — الساعات عامة للمنشأة |
| `specificDays` للخدمة | يُخزَّن أحياناً و**لا يُطبَّق** في توليد الشرائح |
| Hold متعدد العمليات (PM2 cluster) | Hold في الذاكرة — **هش** مع أكثر من worker؛ يلزم قفل DB/Redis |
| تخزين الحجوزات في Postgres بالإنتاج | **مزدوج الكتابة:** JSON للتقويم المحلي + `opsPg.persistPublicAppointment` عند `MAW3ED_STORAGE=postgres`؛ الشرائح تدمج حجوزات PG لمنع التضارب |

---

## سادساً: تعدد المنشآت والأمان

- **الـ slug** يعزل صفحة الحجز العامة لكل مساحة عمل/منشأة.  
- يجب ألا تُرجع واجهات `/api/public/...` أي بيانات خارج ذلك الـ slug.  
- لوحة الإدارة خلف Clerk / جلسة؛ الحجز العام بدون تسجيل دخول زائر.  
- Rate limit على `hold` و`appointments` (هدف) لتقليل الإساءة والـ spam.  
- لا تضع أسرار Twilio/SMTP في المستودع — فقط `.env.production` على الـ VPS.

---

## سابعاً: بعد التأكيد — دورة حياة الموعد

1. **created / confirmed** → يظهر في تقويم الاستقبال.  
2. **تذكير** قبل الموعد (هدف).  
3. **completed / no-show / cancelled** من لوحة الإدارة.  
4. **إلغاء/تأجيل من الزائر** عبر رابط آمن (هدف).  
5. لاحقاً: عربون Stripe · مزامنة Google Calendar للطاقم.

---

## ثامناً: قائمة فجوات Must-have قبل إطلاق جمهور حقيقي

1. ~~ربط حجوزات `/api/public/booking` بـ PostgreSQL عند الإنتاج.~~ (`opsPg.js`)  
2. ~~إرسال بريد تأكيد حقيقي (مزوّد يعمل على VPS).~~ (`sendBookingConfirmationEmail`)  
3. توحيد/توضيح مسار المواعيد الحديثة (ops) مقابل أي APIs طبية قديمة في `server.js` لتفادي تقويمين.  
4. شفتات/ساعات **لكل موظف** + احترام `specificDays`.  
5. Holds/أقفال **متينة** لأكثر من عملية Node.  
6. Runbook دومين كامل: Cloudflare → Nginx → **Certbot** → فحص `book.html`.  
7. ملف تشغيل واضح: `ecosystem.config.cjs` (PM2) أو وحدة systemd جاهزة للنسخ.

**Nice-to-have:** WhatsApp/SMS · تذكيرات مجدولة · عربون · Google Calendar · فصل Frontend على Vercel · تطبيق موبايل أصلي بدل WebView.

---

## تاسعاً: ترتيب الإنجاز المقترح

1. ~~Postgres لمسار الحجز العام.~~  
2. ~~Email تأكيد عند الإنشاء.~~  
3. تقوية الشرائح (موظف + أيام محددة) وقفل المواعيد.  
4. إكمال نشر الدومين/SSL/PM2 في [`DEPLOY_VPS.md`](DEPLOY_VPS.md).  
5. SMS/WhatsApp ثم التذكيرات.  
6. إلغاء/إعادة جدولة للزائر والعربون لاحقاً.

---

## عاشراً: تحقق سريع (Definition of Done للبوابة)

- [x] محلياً: إنشاء حجز من `book.html` يظهر في التقويم فوراً  
- [x] إنتاج: مسار كتابة Postgres عند `MAW3ED_STORAGE=postgres`  
- [ ] `https://{domain}/book.html?slug=...` بدون تحذير شهادة  
- [x] رسالة تأكيد Email (outbox محلياً / SendGrid في الإنتاج)  
- [x] إغلاق الحجز أونلاين من الإدارة يمنع الحجوزات الجديدة  
- [x] لا تضارب مواعيد متزامنة على نفس الشريحة (JSON + دمج PG)

---

## مراجع مرتبطة

- [`public-booking-page.md`](public-booking-page.md) — رحلة الزائر وخوارزمية الشرائح  
- [`DEPLOY_VPS.md`](DEPLOY_VPS.md) — نشر + دومين + SSL  
- [`ENVIRONMENTS.md`](ENVIRONMENTS.md) — `local` / `production` فقط  
- [`LOCAL_CURSOR_WORKFLOW.md`](LOCAL_CURSOR_WORKFLOW.md) — يوم العمل المحلي  
- [`nginx/maw3ed.conf`](nginx/maw3ed.conf) — reverse proxy
