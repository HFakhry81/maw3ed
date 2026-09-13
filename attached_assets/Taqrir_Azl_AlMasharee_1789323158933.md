# تقرير عزل المشاريع وتشغيلها جنبًا إلى جنب

**التاريخ:** 12 سبتمبر 2026  
**المسار الجذري:** `E:\UpNexa.com`

## 1) خريطة المنافذ وقواعد البيانات

| المشروع | المسار | Backend | Frontend | PostgreSQL |
|---------|--------|---------|----------|------------|
| **Fanni** | `E:\UpNexa.com\fanni` | API **3000** | Expo Metro **8081** | `localhost:5433` / **`fanni_db`** |
| **UpNexa** | `E:\UpNexa.com\UpNexa` | API **5000** | Vite **5173** (+ Expo **8083**) | `localhost:5433` / **`upnexa_db`** |
| **Maw3ed** | `E:\UpNexa.com\maw3ed` | Server **7000** | Vite **7100** | `localhost:5433` / **`maw3ed`** |
| **Spendi** | `E:\UpNexa.com\finance-app` | Supabase (سحابي) | Expo Metro **8082** | سحابي |

> ملاحظة: حاليًا سيرفر Postgres واحد على المنفذ **5433** وفيه قواعد بأسماء منفصلة (عزل بيانات لكل مشروع).

## 2) ملفات البيئة المحلية لكل مشروع

| المشروع | الملفات |
|---------|---------|
| Fanni | `.env` + `LOCAL_PORTS.md` |
| UpNexa | `.env.example` · `.env.development.local` · `artifacts/mobile/.env` · `LOCAL_PORTS.md` |
| Maw3ed | `.env` · `.env.example` · `vite.config.js` · `LOCAL_PORTS.md` |
| Spendi | `.env` · `package.json` (`--port 8082`) · `LOCAL_PORTS.md` |

## 3) سكريبتات التشغيل على سطح المكتب

| الملف | الوظيفة |
|-------|---------|
| `00-RUN-SIDE-BY-SIDE-MAP.cmd` | عرض الخريطة |
| `01-FANNI-API.cmd` | باك فني `:3000` |
| `01-FANNI-MOBILE.cmd` | فرونت فني Expo `:8081` |
| `02-UPNEXA-API.cmd` | باك UpNexa `:5000` |
| `02-UPNEXA-WEB.cmd` | فرونت UpNexa Vite `:5173` |
| `02-UPNEXA-MOBILE.cmd` | موبايل UpNexa Expo `:8083` |
| `03-MAW3ED-API.cmd` | باك Maw3ed `:7000` |
| `03-MAW3ED-WEB.cmd` | فرونت Maw3ed Vite `:7100` |
| `03-MAW3ED-ALL.cmd` | باك + فرونت معًا |
| `04-SPENDI-MOBILE.cmd` | فرونت Spendi Expo `:8082` |

## 4) طريقة التشغيل جنب بعض

1. تأكد أن Postgres شغال (حاليًا المنفذ **5433**).
2. لكل مشروع: شغّل **الباك أولًا** ثم **الفرونت**.
3. مثال تشغيل متزامن:
   - `01-FANNI-API` + `01-FANNI-MOBILE`
   - `02-UPNEXA-API` + `02-UPNEXA-WEB`
   - `03-MAW3ED-API` + `03-MAW3ED-WEB`
4. المنافذ مختلفة فلا يحدث تعارض.

## 5) pgAdmin — فتح قاعدة فني

- Host: `localhost`
- Port: **`5433`** (ليس 5432)
- Database: **`fanni_db`**
- User: `postgres`

قواعد أخرى على نفس السيرفر: `maw3ed` · `upnexa_db`

## 6) ما لا يوجد في Git

Git يحفظ **migrations/schema** وليس نسخة كاملة من بيانات Postgres الحية.  
بيانات فني الحالية موجودة في `fanni_db` المحلية.

---
نسخة محفوظة أيضًا في: `E:\UpNexa.com\LOCAL_ISOLATION_REPORT.md`