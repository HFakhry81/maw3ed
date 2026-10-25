@echo off
chcp 65001 >nul
setlocal EnableExtensions
title Maw3ed API + production web :7000
color 0A

for %%I in ("%~dp0..") do set "PROJECT_ROOT=%%~fI"
cd /d "%PROJECT_ROOT%" || exit /b 1

set "MAW3ED_ENV=local"
set "PORT=7000"

echo ===================================================
echo  MAW3ED API Server -> http://localhost:7000
echo  Connected DB       -> PostgreSQL @ localhost:5433
echo ===================================================
call "%PROJECT_ROOT%\scripts\run-backend.cmd"
if errorlevel 1 exit /b %ERRORLEVEL%
pause
exit /b 0
