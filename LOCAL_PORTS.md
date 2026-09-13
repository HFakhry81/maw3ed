# Maw3ed local ports

| Service | Port | Purpose |
| --- | ---: | --- |
| Node API + production web | `7000` | `npm start`; Nginx proxies to this port |
| Vite web development | `7100` | `npm run dev`; `/api` is proxied to `7000` |
| PostgreSQL | `5433` | Existing shared Postgres server, database `maw3ed` |

The other projects remain isolated on their reported ports:

- Fanni: API `3000`, Expo `8081`, database `fanni_db`
- UpNexa: API `5000`, Vite `5173`, Expo `8083`, database `upnexa_db`
- Spendi: Expo `8082`, cloud Supabase

For Replit Preview only, `.replit` overrides the API port to `5000` and uses local-memory mode.