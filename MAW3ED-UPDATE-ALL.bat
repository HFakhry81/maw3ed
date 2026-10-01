@echo off
chcp 65001 >nul
setlocal EnableExtensions
title Maw3ed - Update ALL
cd /d "%~dp0"

echo ===================================================
echo  Maw3ed UPDATE ALL
echo  backend/API + frontend/web + smoke + mobile
echo  Ports: API/Web 7000 ^| Vite 7100
echo ===================================================
echo.

call node scripts\update-targets.js all
set "ERR=%ERRORLEVEL%"

echo.
if not "%ERR%"=="0" (
  color 0C
  echo [FAILED] update:all exited with code %ERR%
  pause
  exit /b %ERR%
)

color 0A
echo [OK] Full project update complete.
echo Session data was backed up then restored automatically.
echo Report: data\last-update-report.json  ^(and last-refresh-report.json^)
echo Backups: data\backups\sessions\
echo Admin:   http://127.0.0.1:7000/
echo Booking: http://127.0.0.1:7000/book.html?slug=maw3ed-demo
if /i not "%MAW3ED_UPDATE_NOPAUSE%"=="1" pause
exit /b 0
