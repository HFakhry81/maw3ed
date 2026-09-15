@echo off
REM Full Maw3ed update + smoke tests (Windows)
cd /d "%~dp0.."
node scripts\refresh-all.js %*
exit /b %ERRORLEVEL%
