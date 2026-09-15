@echo off
REM Maw3ed Vite React on port 7100 (proxies /api to 7000)
cd /d "%~dp0.."
set VITE_PORT=7100
set BACKEND_PORT=7000
call npm run dev
