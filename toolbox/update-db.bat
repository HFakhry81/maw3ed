@echo off
chcp 65001 >nul
setlocal EnableExtensions
title Maw3ed - Update Database
for %%I in ("%~dp0..") do set "PROJECT_ROOT=%%~fI"
cd /d "%PROJECT_ROOT%" || exit /b 1
set "MAW3ED_ENV=local"
echo [1/2] Migrate...
call npm.cmd run migrate
if errorlevel 1 (
  echo [FAILED] Database migration failed; seeding was not run.
  pause
  exit /b 1
)
echo [2/2] Seed...
call npm.cmd run seed
if errorlevel 1 (
  echo [FAILED] Database seed failed.
  pause
  exit /b 1
)
echo [OK] Database update finished for current env.
pause
exit /b 0
