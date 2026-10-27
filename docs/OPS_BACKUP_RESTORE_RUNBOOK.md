# Runbook — نسخ واستعادة تشغيل Maw3ed (Phase 7)

**الحالة:** مكتمل تقنياً لمسار الأدوات الحالية. **RPO/RTO غير معتمدين** من مالك المنتج — القيم أدناه مقترحة فقط (`proposed_pending_owner_approval`).

## نطاق النسخ

| المسار | الأمر | المحتوى | ملاحظات |
| --- | --- | --- | --- |
| JSON محلي | `npm run ops:backup` / `ops:restore` | مساحات عمل الجلسة + ملفات جذر محدودة عبر `scripts/ops-session-backup.js` | مناسب للتطوير المحلي؛ يُثبت في `test:ops-integrity` |
| PostgreSQL ops | `npm run ops:pg-backup` / `ops:pg-restore` / `ops:pg-backups` | `workspace_ops_*` + `workspace_staff_links` فقط عبر `scripts/ops-pg-backup.js` | النسخ **لا يمسح**؛ الاستعادة تتطلب هدفاً صريحاً |

**خارج النطاق الحالي لهذا الـ runbook:** جداول الحساب/الاشتراك الكاملة، ملفات `uploads` الكبيرة، أسرار `.env` (تُدار خارج المستودع).

## أهداف مقترحة (بانتظار المالك)

| المقياس | قيمة مقترحة | الحالة |
| --- | --- | --- |
| RPO | _فارغ — يملأه المالك بعد قياس_ | `proposed_pending_owner_approval` |
| RTO | _فارغ — يملأه المالك بعد drill موقّع_ | `proposed_pending_owner_approval` |
| احتفاظ outbox JSONL | 30 يوماً تقنياً (`MAW3ED_RETENTION_OUTBOX_DAYS`) | تقني فقط — راجع `dataRetention.js` |
| احتفاظ webhook ledger | 90 يوماً تقنياً | تقني فقط |

لا تستخدم هذه الصفوف كـ SLA في عقود أو تسويق.

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

على **Sam-PC**: المنفذ **5432** وقاعدة **`maw3ed`**.

## إجراءات الاستعادة (drill)

1. أكّد أن الهدف معزول (ليس إنتاجاً حياً بلا موافقة).
2. خذ نسخة جديدة قبل أي استعادة تجريبية.
3. الاستعادة **ترفض** العمل بلا هدف صريح (`--restore=<dir>` أو `--restore-latest`).
4. استعد:

```bash
npm run ops:pg-restore
# أو:
node scripts/ops-pg-backup.js --restore=data/backups/pg-ops/<stamp>
```

5. تحقّق:

```bash
npm run test:ops-pg-backup
# مع Postgres حقيقي + migrate مرتين:
npm run test:ops-pg-backup:full
npm run test:phase7-ops
```

بدون `DATABASE_URL`: `test:ops-pg-backup` يخرج `ok=true` مع `skipped:true` (آمن لـ CI) بعد فحوص inventory ورفض الاستعادة بلا هدف.

## JSON المحلي (تطوير)

```bash
npm run ops:backup
npm run ops:restore
npm run test:ops-integrity
```

## احتفاظ وتنقية سجلات التشغيل

```bash
node scripts/retention-purge.js --policy
node scripts/retention-purge.js --dry-run
# بعد موافقة تشغيلية فقط:
node scripts/retention-purge.js --apply
```

التنقية تعيد كتابة JSONL مع `redactObject` ولا تطبع قيم الأسرار.

## أسرار وخصوصية أثناء النسخ

- لا تُضمَّن قيم `SESSION_SECRET` / مفاتيح المزودين في أرشيف النسخ أو سجلات الاستعادة.
- استخدم [`secretsPosture.js`](../secretsPosture.js) / `npm run test:phase7-ops`.
- طلبات الخصوصية: [`PRIVACY_REQUESTS_RUNBOOK.md`](PRIVACY_REQUESTS_RUNBOOK.md) (قالب).
- تنبيهات: stubs في [`metricsAlerts.js`](../metricsAlerts.js) مع أدوار ملكية موثّقة — **لا sink خارجي**.

## ملكية وتصعيد (قالب)

| دور | مسؤولية |
| --- | --- |
| مالك المنتج | اعتماد RPO/RTO والاحتفاظ بعد قياس؛ قرار Go/No-Go للإطلاق |
| تشغيل | تنفيذ النسخ المجدول ومراجعة `ops:pg-backups` والاستجابة لتنبيهات outbox stub |
| أمن | تدوير الأسرار عند الاشتباه؛ مراجعة مخرجات منقّحة |
| هندسة | إصلاح أعطال worker/adapters عند تصعيد التشغيل |

حدّث الأسماء الحقيقية قبل الإطلاق.

## دليل قبول الحزمة (Phase 7)

- [x] Runbook يشير إلى أوامر `ops:pg-*` الفعلية
- [x] Smoke Phase 7 يتحقق من الـ runbook + رفض الاستعادة بلا هدف + احتفاظ/تنقيح
- [x] ملكية تنبيهات stub موثّقة في الكود والـ runbook
- [ ] Restore drill موقّع على Sam-PC ببيانات اصطناعية (بوابة مالك — يدوي)
- [ ] أرقام RPO/RTO معتمدة من المالك (بوابة مالك — لا تخترع SLA)
