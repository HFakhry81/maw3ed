@echo off
cd /d "%~dp0.."
echo.
echo Restoring full hospital demo data...
call npm run hospital:restore-full
echo.
pause
