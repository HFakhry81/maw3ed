@echo off
REM Maw3ed API + production web on port 7000
cd /d "%~dp0.."
set "PORT=7000"
set "BACKEND_PORT=7000"
set "VITE_PORT=7100"
echo Starting Maw3ed backend/API on http://127.0.0.1:7000/
if exist .env (
  node --env-file=.env server.js
) else (
  node server.js
)
