@echo off
chcp 65001 >nul
setlocal EnableExtensions
title Maw3ed - Mobile
for %%I in ("%~dp0..") do set "PROJECT_ROOT=%%~fI"
cd /d "%PROJECT_ROOT%" || exit /b 1
set "MAW3ED_ENV=local"
echo Installing mobile deps (Expo WebView shell)...
call npm.cmd run update:mobile
if errorlevel 1 (
  echo [FAILED] Mobile update failed.
  exit /b 1
)
echo.
echo APK production builds use EAS after login:
echo   npm.cmd run update:mobile ^&^& npx eas-cli build -p android --profile preview
pause
exit /b 0
