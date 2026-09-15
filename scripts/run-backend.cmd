@echo off
REM Maw3ed API + production web on port 7000 (LOCAL mode)
cd /d "%~dp0.."
set "MAW3ED_ENV=local"
if not exist .env.mode echo local>.env.mode
set "PORT=7000"
set "BACKEND_PORT=7000"
set "VITE_PORT=7100"
echo Starting Maw3ed backend/API [local] on http://127.0.0.1:7000/
node server.js
