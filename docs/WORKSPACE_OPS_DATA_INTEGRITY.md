# سلامة بيانات تشغيل المساحة (JSON ↔ PostgreSQL)

**تاريخ:** 2026-10-27  
**المرحلة:** 2 — سلامة البيانات (جرد FK + مقارنة + دفتر ترحيل + استعادة JSON + PG ops backup)  
**الحالة:** مكتملة تقنياً — أدوات `ops:pg-backup`/`ops:pg-restore` + smoke `test:ops-pg-backup` (+ `--migrate-twice`) تثبت round-trip وidempotent migrate بما في ذلك 011+012. أعد التشغيل على Postgres Sam-PC (5432) قبل اعتماد بيانات حية.

## ربط الموظف (ذو صلة بالمرحلة 2)

- الفرع في خطاب المنتج = **`workspace_id`** (لا جدول branch منفصل).
- جدول `workspace_staff_links` (migration 012) + ملف JSON `staff-links.json` يربطان حساب الدخول بسجل موظف واحد داخل المساحة. راجع [`STAFF_ACCOUNT_LINKS.md`](STAFF_ACCOUNT_LINKS.md).

## مصدر الحقيقة

| السياق | مصدر الحقيقة التشغيلي | ملاحظات |
| --- | --- | --- |
| `MAW3ED_ENV=local` وبدون `MAW3ED_STORAGE=postgres` | JSON تحت `data/workspaces/<id>/maw3ed-ops.json` | المسار الافتراضي للتطوير المحلي |
| Postgres مفعّل ومساحة مسجّلة في `workspaces` ولها صف في `workspace_ops_profiles` | جداول `workspace_ops_*` (migration 010+) | الكتابة تعيد بناء اللقطة عبر `workspaceOpsPg.saveStore` مع مرآة JSON |
| Postgres مفعّل لكن المساحة غير مُدارة في الملف الشخصي المطبع | JSON (+ مسار `opsPg` القديم للحجز العام عند الانطباق) | لا تخلط مع `workspace_ops_*` دون مقارنة |

`x-workspace-id` يختار السياق فقط؛ لا يُثبت التخزين ولا الصلاحية.

## جرد المفاتيح المركبة

- **موجودة في 010:** فئات العملاء، مقدمو الخدمات، جداول الموظف، بنود/زيارات الموعد المرتبطة بالموعد الأب.
- **أُضيفت في 011:** `(workspace_id, customer_id|staff_id|service_id|checked_in_by_staff_id)` على المواعيد، و`service_id`/`added_by_staff_id` على البنود، و`staff_id` على الزيارات — بعد تحويل السلاسل الفارغة إلى `NULL`.
- **فجوات موثّقة (soft):** `appointments.category_id` و`staff.service_category_id` بقيمة افتراضية `''`؛ لا يُفرض FK حتى قرار تنظيف القيم الفارغة.

الأداة: `node scripts/audit-ops-integrity.js --migrations-only`.

## مقارنة JSON / PostgreSQL

1. انسخ احتياطيًا (`npm run ops:backup`) قبل أي كتابة ترحيل.
2. قارن لقطتين JSON:  
   `node scripts/compare-workspace-ops.js --left=<a.json> --right=<b.json> --json`
3. عند توفر Postgres:  
   `node scripts/compare-workspace-ops.js --left-workspace=<id> --right-pg=<id> --json`
4. اقبل التحويل فقط إذا `ok=true` (أعداد + مجموعات المعرفات) و`auditStore` بلا orphan على الطرفين.
5. لا تحذف مصدر JSON قبل قبول المالك.

فحص orphan على بذرة/مساحة:  
`node scripts/audit-ops-integrity.js --seed=medical --json`  
`node scripts/audit-ops-integrity.js --workspace=<id> --json`

## دفتر الترحيل (idempotent)

`scripts/migrate.js` يسجّل الملفات المطبّقة في `schema_migrations` ويتخطى المعاد تطبيقه.  
`--dry-run` يعرض المعلّق دون كتابة. خارج local+postgres يبقى الترحيل متخطى كما كان.

## النسخ الاحتياطي والاستعادة

- **JSON المحلي:** `npm run ops:backup` / `npm run ops:restore` عبر `scripts/ops-session-backup.js` (workspaces + ملفات جذر محدودة). التحقق الآلي في `npm run test:ops-integrity` يمرّر drill backup→تلف→restore→compare.
- **PostgreSQL `workspace_ops_*` + `workspace_staff_links`:** `npm run ops:pg-backup` / `ops:pg-restore` / `ops:pg-backups` عبر [`scripts/ops-pg-backup.js`](../scripts/ops-pg-backup.js). النسخ لا يمسح شيئاً؛ الاستعادة تتطلب هدفاً صريحاً (`--restore=<dir>` أو `--restore-latest`) ثم تحذف فقط جداول التشغيل ضمن النطاق (أو `--workspace=`) وتعيد الإدراج. يفضّل `pg_dump`/`pg_restore` عند التوفر؛ النسخ المقيّد بمساحة يستخدم تصدير SQL عبر `pg`. لا تعتمد على `TRUNCATE appointments/slot_holds` وحده كاستعادة تشغيل.

## أوامر التحقق لهذه الحزمة

```bash
node --check opsIntegrity.js
node --check scripts/migrate.js
node --check scripts/audit-ops-integrity.js
node --check scripts/compare-workspace-ops.js
node --check scripts/ops-pg-backup.js
node --check scripts/smoke-ops-integrity.js
node --check scripts/smoke-ops-pg-backup.js
npm run test:ops-integrity
npm run test:ops-pg-backup
node scripts/audit-ops-integrity.js --migrations-only --json
```

### على Sam-PC (Postgres عادةً منفذ 5432)

```bash
export MAW3ED_ENV=local
export MAW3ED_STORAGE=postgres
export DATABASE_URL=postgresql://USER:PASS@127.0.0.1:5432/maw3ed

npm run migrate          # مرة 1 — يطبّق المعلّق بما فيه 011+012 إن لزم
npm run migrate          # مرة 2 — يجب: No pending migrations / applied=0

npm run ops:pg-backup -- --reason=drill
# أو drill الآلي (migrate-twice + backup→wipe→restore→compare):
npm run test:ops-pg-backup:full

# مقارنة مساحة JSON مع لقطة PG لنفس المعرّف:
node scripts/compare-workspace-ops.js --left-workspace=<id> --right-pg=<id> --json
```

بدون `DATABASE_URL`: `npm run test:ops-pg-backup` يخرج `ok=true` مع `skipped:true` ورسالة واضحة (آمن لـ CI).
