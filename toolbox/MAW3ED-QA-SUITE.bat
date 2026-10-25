@echo off
chcp 65001 >nul
setlocal EnableExtensions
title Maw3ed - QA Suite
color 0D
for %%I in ("%~dp0..") do set "PROJECT_ROOT=%%~fI"
cd /d "%PROJECT_ROOT%" || exit /b 1
set "MAW3ED_ENV=local"

echo ===================================================
echo  Maw3ed QA Suite  ^|  Local  ^|  API/Web :7000
echo  Path: %CD%
echo ===================================================
echo.

echo [1/3] Booking and workspace smoke tests...
call npm.cmd run test:smoke
if errorlevel 1 set "FAILED=1"

echo.
echo [2/3] HTTP API + pages smoke...
call npm.cmd run test:http
if errorlevel 1 set "FAILED=1"

echo.
echo [3/3] Platform admin smoke...
call npm.cmd run test:platform-admin
if errorlevel 1 set "FAILED=1"

if defined FAILED (
  echo [FAILED] One or more QA checks failed.
  color 0C
  exit /b 1
)

echo [OK] All QA checks passed.
color 0A
if /i not "%MAW3ED_QA_NOPAUSE%"=="1" pause
exit /b 0
