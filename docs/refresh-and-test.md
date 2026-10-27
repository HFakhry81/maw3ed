# سكربتات التحديث والاختبار — موعد Maw3ed

التطوير الأساسي: **محلي في Cursor Desktop** ثم Git ثم VPS.  
راجع [`LOCAL_CURSOR_WORKFLOW.md`](LOCAL_CURSOR_WORKFLOW.md) و[`DEPLOY_VPS.md`](DEPLOY_VPS.md).

## تحديث كامل (موصى به)

من جذر المشروع `E:\UpNexa.com\maw3ed`:

```bat
MAW3ED-UPDATE-ALL.bat
```

أو:

```bash
npm run update:all
npm run refresh
scripts\update-all.cmd
powershell -File scripts\update-all.ps1
```

يشمل: اعتماديات + **نسخ احتياطي لجلسة العمل** + ops + migrate/seed + بناء الواجهة + فحص العزل + smoke حجز + smoke HTTP/API + تثبيت mobile (soft) + **استرجاع بيانات الجلسة**.

قبل أي مسح/إعادة ضبط تُحفظ مساحات العمل في `data/backups/sessions/` ثم تُسترجع تلقائياً بعد انتهاء التحديث (أو عند الفشل). لتعطيل الاسترجاع عمداً:

```bat
set MAW3ED_SKIP_SESSION_RESTORE=1
npm run update:all
```

أوامر يدوية:

```bat
npm run ops:backup
npm run ops:restore
npm run ops:backups
npm run ops:pg-backup
npm run ops:pg-restore
npm run ops:pg-backups
```

Postgres ops drill (يتطلب `MAW3ED_STORAGE=postgres` و`DATABASE_URL` على **5432**/`maw3ed`):

```bash
npm run test:ops-pg-backup          # يتخطى بوضوح إن لم يتوفر DB
npm run test:ops-pg-backup:full     # migrate مرتين + backup/restore/compare
npm run test:atomic-booking         # المرحلة 3 — حجز ذري JSON
npm run test:booking-timezone       # عقد timezone/DST + Idempotency-Key helper
npm run test:atomic-booking-pg      # تماثل PG (يتخطى بلا DATABASE_URL)
npm run test:phase3-booking         # JSON + timezone + PG
npm run test:capacity-modes         # المرحلة 4 — exclusive/rental/session_capacity/bundle (JSON)
npm run test:capacity-pg            # مرحلة 4 — migrate 014 + round-trip (يتخطى بلا DATABASE_URL)
npm run test:capacity-http          # مرحلة 4 — ops HTTP + auto-allocate exclusive/rental
npm run test:capacity-isolation     # مرحلة 4 — عزل موارد/تسجيلات عبر المساحات
npm run test:phase4-capacity        # modes + PG + HTTP + isolation
```

## قائمة Windows التفاعلية

```bat
MAW3ED-TOOLBOX.bat
```

خيارات جاهزة لتحديث backend/API، frontend، web، mobile، التشغيل على `:7000`/`:7100`، QA، وتجهيز الإصدار.

| ملف BAT | الوظيفة |
| --- | --- |
| `MAW3ED-UPDATE-ALL.bat` | تحديث كل المشروع |
| `MAW3ED-TOOLBOX.bat` | قائمة مطوّر كاملة |
| `MAW3ED-QA-SUITE.bat` | isolation + booking smoke + HTTP smoke |
| `MAW3ED-PREPARE-RELEASE.bat` | refresh ثم أوامر Git/VPS |

## تحديث أجزاء منفصلة

| الأمر | الوظيفة |
| --- | --- |
| `npm run update:backend` أو `update:api` | اعتماديات + ops + migrate/seed soft + عزل |
| `npm run update:frontend` | اعتماديات + بناء React إلى `dist/` |
| `npm run update:web` | بناء `dist` + smoke HTTP (API + صفحات) |
| `npm run update:mobile` | `npm install` داخل `mobile/` |
| `npm run update:all` | المسار الكامل أعلاه |
| `npm run release:prepare` | تحديث كامل ثم طباعة أوامر Git وVPS |

تقارير: `data/last-update-report.json` · `data/last-refresh-report.json`

## بذرة العروض الموحدة (ليست migrate/seed)

`npm run migrate` و`npm run seed` يحدّثان المخطط/بذرة المنصة فقط. لاستعادة المستشفى + طلائع من `data/seeds/maw3ed-demo-ops.json`:

```bash
npm run seed:demo:restore
npm run users:cleanup-demo-owners -- --dry-run   # ثم --apply عند الرضا
```

| | |
| --- | --- |
| medical | `contact.haitham@gmail.com` / `dawybooking` |
| education | `contact.haitham@yahoo.com` / `talaaee-book` |
| platform admin | `contact.fakhry@gmail.com` (بلا مساحة) |

التفاصيل: [`MEDICAL_DEMO_SEED.md`](MEDICAL_DEMO_SEED.md) · قائمة Toolbox: `toolbox/MAW3ED-TOOLBOX.bat` (14–16).

تخطّي التثبيت عند التكرار السريع:

```bat
set REFRESH_SKIP_INSTALL=1
npm run update:all
```

## تشغيل محلي

| الأمر | المنفذ |
| --- | ---: |
| `scripts\run-backend.cmd` أو `npm start` | `7000` API + ويب |
| `scripts\run-frontend.cmd` أو `npm run dev` | `7100` Vite |
| `scripts\run-all.cmd` | الاثنان معاً |

## بعد التحديث

- لوحة التحكم: `http://127.0.0.1:7000/`
- **إدارة المنصة (Super Admin):** `http://127.0.0.1:7000/admin.html` (Postgres + Clerk بدور منصة)
- الحجز العام: `http://127.0.0.1:7000/book.html?slug=maw3ed-demo`
- Vite: `http://127.0.0.1:7100/`

اختبار حوكمة المنصة:

```bat
npm run test:platform-admin
```
