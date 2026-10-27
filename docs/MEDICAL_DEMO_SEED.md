# بذرة العروض الموحدة (طبي + طلائع)

**ملف واحد دائم:** `data/seeds/maw3ed-demo-ops.json`  
(ملخص: `data/seeds/maw3ed-demo-summary.json`)

## الأقسام والملاك

| القسم | الحساب | المساحة المفضّلة |
| --- | --- | --- |
| `medical` | `contact.haitham@gmail.com` | مستشفيات داوي / `dawybooking` / `workspace_67ac2618-fe29-4cb0-b668-b152b4b98592` |
| `education` | `contact.haitham@yahoo.com` | مركز طلائع التعليمي / `talaaee-book` / `workspace_46d0f604-1bb9-4cd8-958c-d2b370939b41` |

## مسؤول المنصة

| الحساب | الدور | المساحات |
| --- | --- | --- |
| `contact.fakhry@gmail.com` | `super_admin` الوحيد | **لا يملك ولا ينضم لأي مساحة** |

المالكان أعلاه ليسا platform admin.

## المسار السعيد

```bash
# استعادة القسمين إلى المالكين الصحيحين
npm run seed:demo:restore

# قسم واحد
npm run seed:demo:restore -- --section=medical
npm run seed:demo:restore -- --section=education --replace

# حفظ مساحة حالية داخل القسم المناسب من الملف الموحد
npm run seed:demo:save -- --section=medical
npm run seed:demo:save -- --section=education
```

عند الاستعادة: إن اختلف `activity_type` عن القسم يُحوَّل مع الإبقاء على المالك والـ slug (`--keep-activity` لتجاوز ذلك).

## ما الذي لا يستعيد العروض

| الأمر | الوظيفة |
| --- | --- |
| `npm run migrate` | مخطط PostgreSQL فقط |
| `npm run seed` | بذرة منصة قديمة — ليست عروض المستشفى/طلائع |

## تنظيف المستخدمين (محلي / Postgres)

يبقي **فقط 3 مستخدمين**:
1. `contact.fakhry@gmail.com` — `super_admin` بلا أي مساحة (يحذف ملكية/عضوية مثل `haitham-fakhry` / `workspace_dcb873bd…`)
2. `contact.haitham@gmail.com` — مالك `dawybooking` فقط، ليس platform admin
3. `contact.haitham@yahoo.com` — مالك `talaaee-book` فقط، ليس platform admin

يحذف الباقي (مثل `totty_alex@yahoo.co.uk` و`contact.fakhry@yahoo.com`) وكل المساحات غير المحفوظة:

```bash
npm run users:cleanup-demo-owners -- --dry-run
npm run users:cleanup-demo-owners -- --apply
```
