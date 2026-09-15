@echo off
REM Full Maw3ed update + smoke + mobile (Windows)
cd /d "%~dp0.."
node scripts\update-targets.js all %*
exit /b %ERRORLEVEL%
