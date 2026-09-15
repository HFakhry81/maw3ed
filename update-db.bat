@echo off
chcp 65001 >nul
title Maw3ed - Update Database
cd /d "%~dp0"
set "MAW3ED_ENV=local"
echo [1/2] Migrate...
call npm.cmd run migrate
echo [2/2] Seed...
call npm.cmd run seed
echo [OK] Database update finished for current env.
pause
