# بذرة العروض الموحدة / Unified demo seed

**ملف واحد دائم / One durable blob:** `data/seeds/maw3ed-demo-ops.json`  
(ملخص / summary: `data/seeds/maw3ed-demo-summary.json`)

## الأقسام والملاك / Sections & owners

| القسم / Section | الحساب / Account | المساحة / Workspace |
| --- | --- | --- |
| `medical` | `contact.haitham@gmail.com` | مستشفيات داوي / `dawybooking` / `workspace_67ac2618-fe29-4cb0-b668-b152b4b98592` |
| `education` | `contact.haitham@yahoo.com` | مركز طلائع التعليمي / `talaaee-book` / `workspace_46d0f604-1bb9-4cd8-958c-d2b370939b41` |

## مسؤول المنصة / Platform admin

| الحساب / Account | الدور / Role | المساحات / Workspaces |
| --- | --- | --- |
| `contact.fakhry@gmail.com` | `super_admin` الوحيد | **لا يملك ولا ينضم لأي مساحة / no workspace** |

المالكان أعلاه ليسا platform admin.  
The two owners above are **not** platform admin.

## المسار السعيد / Happy path

```bash
# استعادة القسمين إلى المالكين الصحيحين / restore both sections
npm run seed:demo:restore

# قسم واحد / one section
npm run seed:demo:restore -- --section=medical
npm run seed:demo:restore -- --section=education --replace

# حفظ مساحة حالية داخل القسم المناسب / save live workspace into the blob
npm run seed:demo:save -- --section=medical
npm run seed:demo:save -- --section=education
```

عند الاستعادة: إن اختلف `activity_type` عن القسم يُحوَّل مع الإبقاء على المالك والـ slug (`--keep-activity` لتجاوز ذلك).

## ما الذي لا يستعيد العروض / What does NOT load demos

| الأمر / Command | الوظيفة / Role |
| --- | --- |
| `npm run migrate` | مخطط PostgreSQL فقط / schema only |
| `npm run seed` | بذرة منصة قديمة — ليست عروض المستشفى/طلائع / platform seed only |

## تنظيف المستخدمين / User cleanup (Postgres)

يبقي **فقط 3 مستخدمين / keep exactly 3 users**:
1. `contact.fakhry@gmail.com` — `super_admin` بلا أي مساحة
2. `contact.haitham@gmail.com` — مالك `dawybooking` فقط، ليس platform admin
3. `contact.haitham@yahoo.com` — مالك `talaaee-book` فقط، ليس platform admin

```bash
npm run users:cleanup-demo-owners -- --dry-run
npm run users:cleanup-demo-owners -- --apply
```

ملاحظات `--apply`: جداول اختيارية (مثل `workspace_staff_links` قبل migration 012) تُتخطى عبر `to_regclass` + `SAVEPOINT`. صفوف `platform_audit_events` لا تُحذف — يُعاد تعيين `actor_user_id` إلى مسؤول المنصة مع `DISABLE TRIGGER USER`.

## توليد نادر للمستشفى / Rare hospital catalog regenerate

لا يوجد `npm` alias يومي. للكتالوج الطبي فقط:

```bash
node scripts/generate-medical-seed-section.js
```

ثم الاستعادة عبر `npm run seed:demo:restore -- --section=medical`.

## Toolbox

`toolbox/MAW3ED-TOOLBOX.bat` → قائمة **DEMO** (14 restore / 15 save / 16 cleanup).
