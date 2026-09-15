@echo off
chcp 65001 >nul
setlocal EnableExtensions
title Maw3ed - QA Suite
color 0D
cd /d "%~dp0"

echo ===================================================
echo  Maw3ed QA Suite  ^|  Local  ^|  API/Web :7000
echo  Path: %CD%
echo ===================================================
echo.

echo [1/4] Isolation check (ports / tenants)...
call node scripts\check-isolation.js
if errorlevel 1 set "FAILED=1"

echo.
echo [2/4] Public booking engine smoke...
call node scripts\smoke-public-booking.js
if errorlevel 1 set "FAILED=1"

echo.
echo [3/4] HTTP API + pages smoke...
call node scripts\smoke-http.js
if errorlevel 1 set "FAILED=1"

echo.
echo [4/4] Optional: package isolation already covered above.
echo.

if defined FAILED (
  echo [FAILED] One or more QA checks failed.
  color 0C
  exit /b 1
)

echo [OK] All QA checks passed.
color 0A
if /i not "%MAW3ED_QA_NOPAUSE%"=="1" pause
exit /b 0
