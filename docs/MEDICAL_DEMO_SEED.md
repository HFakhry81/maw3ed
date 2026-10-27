# بذرة المستشفى الطبية (canonical)

**الملف الدائم الوحيد:** `data/seeds/medical-demo-ops.json`  
(ملخص سريع: `data/seeds/medical-demo-summary.json`)

## المسار السعيد (واحد)

```bash
npm run seed:medical:restore
```

- الهدف الافتراضي: مساحة يملكها **`contact.haitham@yahoo.com`**.
- إن وُجدت مساحة طبية واحدة مملوكة للحساب تُختار؛ وإلا إن وُجدت مساحة واحدة فقط (حتى لو كانت `education`) تُختار ويُحوَّل `activity_type` إلى **`medical`** أثناء الاستعادة مع الإبقاء على المالك والـ slug.
- مع `MAW3ED_STORAGE=postgres` تُكتب جداول `workspace_ops_*` عبر مسار ops المعتاد (مرآة JSON أيضاً).
- للاستبدال الكامل: `npm run seed:medical:restore -- --replace`
- لتجاوز التحويل إلى medical عمداً: `--keep-activity` (غير موصى به لبذرة المستشفى)
- تجاوز الهدف: `--owner-email=...` أو `--workspace=<id>`

## ما الذي لا يستعيد المستشفى

| الأمر | ماذا يفعل |
| --- | --- |
| `npm run migrate` | ترحيل مخطط PostgreSQL فقط |
| `npm run seed` | بذرة منصة/جداول قديمة من `data/maw3ed-data.json` — **ليست** بذرة المستشفى |
| `npm run ops:backup` / `ops:restore` | جلسة عمل محلية (`data/workspaces`) وليست البذرة الكانونية |

## أوامر مساعدة نادرة

```bash
npm run seed:medical:save      # حفظ مساحة حالية → medical-demo-ops.json
npm run seed:medical           # توليد طاقم جديد ثم حفظ (لا تستخدمه إلا بوعي)
```

## تنظيف 2026-10-27

أُزيلت المسارات المكررة/القديمة: `hospital:*`, `restore:full-hospital`, `save:full-hospital`, وملفات `restore-full-hospital-data.js` / `save-full-hospital-backup.js` / نصوص CMD المساعدة. التنفيذ الوحيد عبر `scripts/seed-medical-demo.js` + `medical-seed-snapshot.js`.
