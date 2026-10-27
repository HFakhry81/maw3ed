# Runbook — نسخ واستعادة تشغيل Maw3ed (Phase 7)

**الحالة:** حزمة أولى تشغيلية — محاذاة مع الأدوات الحالية. لا تدّعِ SLA/RPO معتمداً بلا قياس حمل وقرار مالك المنتج.

## نطاق النسخ

| المسار | الأمر | المحتوى | ملاحظات |
| --- | --- | --- | --- |
| JSON محلي | `npm run ops:backup` / `ops:restore` | مساحات عمل الجلسة + ملفات جذر محدودة عبر `scripts/ops-session-backup.js` | مناسب للتطوير المحلي؛ يُثبت في `test:ops-integrity` |
| PostgreSQL ops | `npm run ops:pg-backup` / `ops:pg-restore` / `ops:pg-backups` | `workspace_ops_*` + `workspace_staff_links` فقط عبر `scripts/ops-pg-backup.js` | النسخ **لا يمسح**؛ الاستعادة تتطلب هدفاً صريحاً |

**خارج النطاق الحالي لهذا الـ runbook:** جداول الحساب/الاشتراك الكاملة، ملفات `uploads` الكبيرة، أسرار `.env` (تُدار خارج المستودع).

## إجراءات النسخ (PG)

```bash
# قائمة الجداول المشمولة
node scripts/ops-pg-backup.js --tables

# نسخة يدوية
MAW3ED_STORAGE=postgres DATABASE_URL=postgresql://…@127.0.0.1:5432/maw3ed \
  npm run ops:pg-backup -- --reason=manual

# قائمة النسخ
npm run ops:pg-backups
```

على Sam-PC: المنفذ **5432** وقاعدة **`maw3ed`**.

## إجراءات الاستعادة (drill)

1. أكّد أن الهدف معزول (ليس إنتاجاً حياً بلا موافقة).
2. خذ نسخة جديدة قبل أي استعادة تجريبية.
3. استعد بمجلد صريح أو الأحدث:

```bash
npm run ops:pg-restore
# أو:
node scripts/ops-pg-backup.js --restore=data/backups/pg-ops/<stamp>
```

4. تحقّق بمقارنة/smoke:

```bash
npm run test:ops-pg-backup
# مع Postgres حقيقي + migrate مرتين:
npm run test:ops-pg-backup:full
```

بدون `DATABASE_URL`: `test:ops-pg-backup` يخرج `ok=true` مع `skipped:true` (آمن لـ CI).

## JSON المحلي (تطوير)

```bash
npm run ops:backup
npm run ops:restore
npm run test:ops-integrity
```

## أسرار وخصوصية أثناء النسخ

- لا تُضمَّن قيم `SESSION_SECRET` / مفاتيح المزودين في أرشيف النسخ أو سجلات الاستعادة.
- استخدم [`secretsPosture.js`](../secretsPosture.js) / `npm run test:phase7-ops` للتأكد من عدم ضعف السر في production.
- سجلات التنبيه الحالية stubs فقط ([`metricsAlerts.js`](../metricsAlerts.js)) — لا تُرسل لجهة خارجية بعد.

## ملكية وتصعيد (قالب)

| دور | مسؤولية |
| --- | --- |
| مالك المنتج | اعتماد RPO/RTO والاحتفاظ بعد قياس |
| تشغيل | تنفيذ النسخ المجدول ومراجعة `ops:pg-backups` |
| أمن | تدوير الأسرار عند الاشتباه وتعليق الاستعادة على بيانات حساسة |

حدّث هذا الجدول بأسماء حقيقية قبل الإطلاق؛ القيم الحالية قوالب Phase 7.

## دليل قبول الحزمة

- [x] Runbook يشير إلى أوامر `ops:pg-*` الفعلية
- [x] Smoke Phase 7 يتحقق من وجود الـ runbook وأوامر النسخ في `package.json`
- [ ] Restore drill موقّع على بيئة معزولة ببيانات اصطناعية (يُعاد على Sam-PC / staging لاحقاً)
- [ ] أرقام RPO/RTO معتمدة من المالك (مؤجّل — لا تخترع SLA)
