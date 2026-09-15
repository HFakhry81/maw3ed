@echo off
chcp 65001 >nul
title Maw3ed - Mobile
cd /d "%~dp0"
echo Installing mobile deps (Expo WebView shell)...
call npm.cmd run update:mobile
echo.
echo APK production builds use EAS after login:
echo   cd mobile ^&^& npx eas-cli build -p android --profile preview
pause
