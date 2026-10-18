# Maw3ed local / VPS ports (side-by-side)

| Service | Port | Purpose |
| --- | ---: | --- |
| Node API + React production web | `7000` | `npm start` (serves `dist/`); Nginx proxies here |
| Vite React development | `7100` | `npm run dev`; proxies `/api` → `7000` |
| PostgreSQL | `5433` | shared Postgres server, database `maw3ed` |

## Sibling apps on the same host

| App | Ports | Database |
| --- | --- | --- |
| Fanni (marketplace) | API `3000`, Expo `8081` | `fanni_db` |
| **Fanni Private** | API **`3200`**, Expo **`8084`** | **`fanni_private_db`** |
| UpNexa | API `5000`, Vite `5173`, Expo `8083` | `upnexa_db` |
| Spendi | Expo `8082` | cloud Supabase |

**Never** bind Maw3ed to `5000` on the shared VPS — that port belongs to UpNexa.  
**Never** bind Maw3ed to `3200`/`8084` — those belong to Fanni Private.

## React production path

1. `npm run build` → Vite writes React SPA to `dist/`
2. `npm start` builds then runs `server.js`
3. `server.js` serves **only** `dist/` when `dist/index.html` exists (React `#root` bundle)
4. Legacy `app.js` / static HTML shells (`auth.html`, `plans.html`, `admin.html`) remain for auxiliary flows and are copied into `dist/`, but the dashboard shell is React

## Checks

```bash
node scripts/check-isolation.js
npm run build
PORT=7000 npm start
```

Replit Preview also uses `PORT=7000` (see `.replit`) so the same isolation policy applies in cloud and on the VPS.
