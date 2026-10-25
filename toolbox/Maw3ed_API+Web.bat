@echo off
chcp 65001 >nul
setlocal EnableExtensions
title MAW3ED ALL (API :7000 + Vite :7100)
color 0D

for %%I in ("%~dp0..") do set "PROJECT_ROOT=%%~fI"
cd /d "%PROJECT_ROOT%" || exit /b 1

set "MAW3ED_ENV=local"
set "PORT=7000"
set "VITE_PORT=7100"

echo ===================================================
echo  Starting Maw3ed Backend (7000) & Frontend (7100)
echo ===================================================
call "%PROJECT_ROOT%\scripts\run-all.cmd"
if errorlevel 1 exit /b %ERRORLEVEL%
pause
exit /b 0
