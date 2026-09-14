@echo off
title Maw3ed - Build Mobile APK
color 0E

echo =========================================
echo  Building Android APK via EAS Build...
echo =========================================
call pnpm build:apk

echo.
echo [SUCCESS] APK Build Process Finished!
pause