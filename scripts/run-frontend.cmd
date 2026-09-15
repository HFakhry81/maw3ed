@echo off
REM Maw3ed Vite React on port 7100 (proxies /api to 7000)
cd /d "%~dp0.."
set "PORT=7000"
set "BACKEND_PORT=7000"
set "VITE_PORT=7100"
echo Starting Maw3ed Vite on http://127.0.0.1:7100/  (API proxy → :7000)
call npm.cmd run dev
