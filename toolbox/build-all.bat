@echo off
chcp 65001 >nul
setlocal EnableExtensions
title Maw3ed - Master Build (Local)
for %%I in ("%~dp0..") do set "PROJECT_ROOT=%%~fI"
cd /d "%PROJECT_ROOT%" || exit /b 1
set "MAW3ED_ENV=local"

:menu
cls
echo ====================================================
echo   MAW3ED MASTER BUILD  ^|  Local → Git → VPS
echo ====================================================
echo  [1] Update Database (Migrate + Seed)
echo  [2] Build API ^& Web Frontend
echo  [3] Mobile install (Expo shell)
echo  [4] Full update:all + smoke
echo  [5] Open Toolbox
echo  [6] Exit
echo ====================================================
set /p choice="Choose (1-6): "

if "%choice%"=="1" goto db
if "%choice%"=="2" goto webapi
if "%choice%"=="3" goto apk
if "%choice%"=="4" goto full
if "%choice%"=="5" goto toolbox
if "%choice%"=="6" exit /b 0
goto menu

:db
call "%~dp0update-db.bat"
goto menu

:webapi
call "%~dp0build-web-api.bat"
goto menu

:apk
call "%~dp0build-apk.bat"
goto menu

:full
call "%~dp0MAW3ED-UPDATE-ALL.bat"
goto menu

:toolbox
call "%~dp0MAW3ED-TOOLBOX.bat"
goto menu
