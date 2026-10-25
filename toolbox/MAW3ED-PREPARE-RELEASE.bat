@echo off
chcp 65001 >nul
setlocal EnableExtensions
title Maw3ed - Prepare Release (Local → Git → VPS)
color 0A
for %%I in ("%~dp0..") do set "PROJECT_ROOT=%%~fI"
cd /d "%PROJECT_ROOT%" || exit /b 1
set "MAW3ED_ENV=local"

echo ===================================================
echo  Maw3ed release prepare
echo  1^) Full local refresh + smoke
echo  2^) Print Git push + VPS pull commands
echo  Project: %CD%
echo ===================================================
echo.

if /i "%~1"=="--skip-refresh" (
  call node "%PROJECT_ROOT%\scripts\prepare-release.js" --skip-refresh
) else (
  call node "%PROJECT_ROOT%\scripts\prepare-release.js"
)

if errorlevel 1 (
  color 0C
  echo.
  echo [FAILED] Release prepare did not complete.
  pause
  exit /b 1
)

echo.
echo [OK] Ready for git push, then VPS deploy. See docs\DEPLOY_VPS.md
if /i not "%MAW3ED_RELEASE_NOPAUSE%"=="1" pause
exit /b 0
