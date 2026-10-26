# سلامة بيانات تشغيل المساحة (JSON ↔ PostgreSQL)

**تاريخ:** 2026-10-27  
**المرحلة:** 2 — حزمة أولى (جرد FK + مقارنة + دفتر ترحيل + استعادة JSON)  
**الحالة:** قيد التنفيذ — لا تُعلن المرحلة 2 مكتملة قبل ترحيل PG مجرّب بلا orphan وrestore drill لـ `workspace_ops_*`.

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
- **PostgreSQL `workspace_ops_*`:** لم يُغلق بعد في هذه الحزمة؛ المطلوب لاحقًا dump/restore للجداول المطبعّة ثم مقارنة مع JSON. لا تعتمد على `TRUNCATE appointments/slot_holds` وحده كاستعادة تشغيل.

## أوامر التحقق لهذه الحزمة

```bash
node --check opsIntegrity.js
node --check scripts/migrate.js
node --check scripts/audit-ops-integrity.js
node --check scripts/compare-workspace-ops.js
node --check scripts/smoke-ops-integrity.js
npm run test:ops-integrity
node scripts/audit-ops-integrity.js --migrations-only --json
```

عند توفر Postgres المحلي (منفذ 5433 عادةً): `MAW3ED_STORAGE=postgres DATABASE_URL=... npm run migrate` مرتين؛ المرة الثانية يجب أن تطبق 0 ملفات جديدة.
