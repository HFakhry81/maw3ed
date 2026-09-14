@echo off
title Maw3ed - Master Build Control Center
color 0D

:menu
cls
echo ====================================================
echo             MAW3ED MASTER BUILD SYSTEM
echo ====================================================
echo  [1] Update Database (Migrate + Seed)
echo  [2] Build API & Web Frontend
echo  [3] Build Mobile APK (Android)
echo  [4] Execute Full Setup / Build All
echo  [5] Exit
echo ====================================================
set /p choice="Choose an option (1-5): "

if "%choice%"=="1" goto db
if "%choice%"=="2" goto webapi
if "%choice%"=="3" goto apk
if "%choice%"=="4" goto full
if "%choice%"=="5" exit

:db
call update-db.bat
goto menu

:webapi
call build-web-api.bat
goto menu

:apk
call build-apk.bat
goto menu

:full
echo Running Full Project Setup...
call pnpm update:all
call pnpm build:all
call pnpm build:apk
echo All Components Built Successfully!
pause
goto menu