@echo off
REM Start Maw3ed backend (:7000) and Vite (:7100) in separate windows
cd /d "%~dp0.."
start "Maw3ed Backend :7000" cmd /k "%~dp0run-backend.cmd"
timeout /t 2 /nobreak >nul
start "Maw3ed Frontend :7100" cmd /k "%~dp0run-frontend.cmd"
echo Started Maw3ed backend and frontend windows.
echo Backend:  http://127.0.0.1:7000/
echo Frontend: http://127.0.0.1:7100/
