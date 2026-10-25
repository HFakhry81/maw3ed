@echo off
chcp 65001 >nul
setlocal EnableExtensions
title Maw3ed - Build API and Web
for %%I in ("%~dp0..") do set "PROJECT_ROOT=%%~fI"
cd /d "%PROJECT_ROOT%" || exit /b 1
set "MAW3ED_ENV=local"
echo Building web dist (API is Node server.js — no separate compile)...
call npm.cmd run build
if errorlevel 1 (
  echo [FAILED] Web build failed.
  pause
  exit /b 1
)
echo [OK] dist/ ready. Start with: scripts\run-backend.cmd
pause
exit /b 0
