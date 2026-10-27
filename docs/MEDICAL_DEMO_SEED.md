# بذرة العروض الموحدة (طبي + طلائع)

**ملف واحد دائم:** `data/seeds/maw3ed-demo-ops.json`  
(ملخص: `data/seeds/maw3ed-demo-summary.json`)

> `data/seeds/medical-demo-ops.json` أصبح مؤشراً فقط إلى الملف الموحد — لا تستخدمه كبذرة ثانية.

## الأقسام والملاك

| القسم | الحساب | المساحة المفضّلة |
| --- | --- | --- |
| `medical` | `contact.haitham@gmail.com` | مستشفيات داوي / `dawybooking` / `workspace_67ac2618-fe29-4cb0-b668-b152b4b98592` |
| `education` | `contact.haitham@yahoo.com` | مركز طلائع التعليمي / `talaaee-book` / `workspace_46d0f604-1bb9-4cd8-958c-d2b370939b41` |

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

Aliases قديمة ما زالت تشير للقسم الطبي فقط:

```bash
npm run seed:medical:restore   # = seed:demo:restore --section=medical
npm run seed:medical:save
```

عند الاستعادة: إن اختلف `activity_type` عن القسم يُحوَّل مع الإبقاء على المالك والـ slug (`--keep-activity` لتجاوز ذلك).

## ما الذي لا يستعيد العروض

| الأمر | الوظيفة |
| --- | --- |
| `npm run migrate` | مخطط PostgreSQL فقط |
| `npm run seed` | بذرة منصة قديمة — ليست عروض المستشفى/طلائع |

## تنظيف المستخدمين (محلي / Postgres)

يبقي `gmail` + `yahoo` + أي platform admin، ويحذف الباقي بعد مراجعة dry-run:

```bash
npm run users:cleanup-demo-owners -- --dry-run
npm run users:cleanup-demo-owners -- --apply
```

`contact.haitham@gmail.com` متوقع أن يكون `super_admin` إن وُجد كمسؤول منصة.
