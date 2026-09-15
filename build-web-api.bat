@echo off
chcp 65001 >nul
title Maw3ed - Build API and Web
cd /d "%~dp0"
set "MAW3ED_ENV=local"
echo Building web dist (API is Node server.js — no separate compile)...
call npm.cmd run build
echo [OK] dist/ ready. Start with: scripts\run-backend.cmd
pause
