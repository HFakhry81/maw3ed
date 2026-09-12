# تقرير عزل المنافذ وقواعد البيانات — UpNexa.com

**التاريخ:** 12 سبتمبر 2026  
**الهدف:** تشغيل المشاريع جنبًا إلى جنب بدون تعارض مع **فني (Fanni)**.

## خريطة العزل النهائية

| المشروع | المسار | API / Server | Web / Vite | Metro (Expo) | PostgreSQL |
|---------|--------|--------------|------------|--------------|------------|
| **Fanni** (بدون تغيير) | `E:\UpNexa.com\fanni` | **3000** | — | **8081** | `localhost:5432` / **`fanni_db`** |
| **UpNexa** | `E:\UpNexa.com\UpNexa` | **5000** | **5173** | **8083** | `localhost:5432` / **`upnexa_db`** |
| **Maw3ed** | `E:\UpNexa.com\maw3ed` | **7000** | **7100** | — | `localhost:5433` / **`maw3ed`** |
| **Spendi** | `E:\UpNexa.com\finance-app` | — (Supabase) | — | **8082** | سحابي (Supabase) |

## ماذا كان مكسورًا؟

1. **UpNexa `artifacts/mobile/.env`** كان يشير إلى **`fanni_db`** ومنفذ **`3000`** — اختلاط مع فني.
2. **UpNexa `.env.example` / `Update_UpNexa.bat`** استخدما **`localhost:3000`** للويب/الـ API بالخطأ.
3. **Maw3ed `VITE_PORT=3000`** كان يصطدم مع API فني.
4. **Spendi** كان يستخدم Metro الافتراضي **8081** (نفس فني).

## الملفات التي تغيّرت

### UpNexa
- `.env.example` → منافذ 5000 / 5173 / 8083 وقاعدة `upnexa_db`
- `artifacts/mobile/.env` → إزالة `fanni_db` وربط `upnexa_db` + API `:5000` + Metro `8083`
- `artifacts/mobile/scripts/dev-start.js` → افتراضي Metro `8083`
- `artifacts/mobile/server/serve.js` → افتراضي PORT `5000`
- `Update_UpNexa.bat` → API `5000` بدل `3000`

### Maw3ed
- `vite.config.js` → افتراضي `7100`
- `.env.example` و `.env` → `PORT=7000` و `VITE_PORT=7100`
- `server.js` → يقرأ `process.env.PORT` (افتراضي 7000)

### Spendi (`finance-app`)
- `package.json` scripts → `--port 8082`
- `.env` / `.env.example` → `EXPO_PORT=8082`

### Fanni
- **لم يُمس** — يبقى `PORT=3000` و `fanni_db` و Metro `8081`.

## خطوة يدوية مطلوبة (مرة واحدة)

أنشئ قاعدة UpNexa إن لم تكن موجودة:

```sql
CREATE DATABASE upnexa_db;
```

(Postgres على المنفذ 5432 — نفس السيرفر مع `fanni_db` بأسماء مختلفة، بدون تعارض.)

Maw3ed يبقى على instance/port **5433** وقاعدة **`maw3ed`**.

## تشغيل جنبًا إلى جنب

1. فني: `scripts\run-local-server.cmd` → `:3000` ثم موبايل `:8081`
2. UpNexa: API `:5000` + Vite `:5173` + Expo `:8083`
3. Maw3ed: server `:7000` + Vite `:7100`
4. Spendi: `npm start` → Expo `:8082`
