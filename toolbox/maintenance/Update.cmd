@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Update.ps1" %*
exit /b %ERRORLEVEL%
