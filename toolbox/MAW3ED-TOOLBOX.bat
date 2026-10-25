@echo off
chcp 65001 >nul
setlocal EnableExtensions
title Maw3ed - Developer Toolbox
for %%I in ("%~dp0..") do set "PROJECT_ROOT=%%~fI"
cd /d "%PROJECT_ROOT%" || exit /b 1
set "MAW3ED_ENV=local"

:menu
cls
color 0B
echo =======================================================================
echo   Maw3ed Developer Toolbox  ^|  Local-first  ^|  API/Web :7000  Vite :7100
echo   Path: %CD%
echo =======================================================================
echo.
echo  [ UPDATE ]
echo    1. Update ALL           (refresh + smoke + mobile)
echo    2. Update Backend/API   (migrate/seed/isolation)
echo    3. Update Frontend      (React build)
echo    4. Update Web           (build + HTTP smoke)
echo    5. Update Mobile        (mobile npm install)
echo.
echo  [ RUN ]
echo    6. Run Backend/API      (:7000)
echo    7. Run Frontend Vite    (:7100)
echo    8. Run Backend + Vite   (two windows)
echo.
echo  [ DATABASE ^& OPS ]
echo    9. Migrate
echo   10. Seed
echo   11. Reset ops data       (auto session backup first)
echo   12. Backup ops session
echo   13. Restore latest session
echo.
echo  [ QA ]
echo   14. Isolation check
echo   15. Smoke public booking
echo   16. Smoke HTTP
echo   17. QA suite (all tests)
echo.
echo  [ RELEASE ]
echo   18. Build dist only
echo   19. Prepare release      (refresh + Git/VPS commands)
echo.
echo   20. Exit
echo =======================================================================
set "choice="
set /p choice="Select [1-20]: "

if "%choice%"=="1" goto upd_all
if "%choice%"=="2" goto upd_backend
if "%choice%"=="3" goto upd_frontend
if "%choice%"=="4" goto upd_web
if "%choice%"=="5" goto upd_mobile
if "%choice%"=="6" goto run_backend
if "%choice%"=="7" goto run_frontend
if "%choice%"=="8" goto run_all
if "%choice%"=="9" goto run_migrate
if "%choice%"=="10" goto run_seed
if "%choice%"=="11" goto run_reset
if "%choice%"=="12" goto run_backup
if "%choice%"=="13" goto run_restore
if "%choice%"=="14" goto run_isolation
if "%choice%"=="15" goto run_smoke_booking
if "%choice%"=="16" goto run_smoke_http
if "%choice%"=="17" goto run_qa
if "%choice%"=="18" goto run_build
if "%choice%"=="19" goto run_release
if "%choice%"=="20" exit /b 0
echo Invalid option.
pause
goto menu

:upd_all
cls & color 0E
echo [UPDATE ALL] backend + frontend/web + API smoke + mobile...
call node scripts\update-targets.js all
echo.
pause & goto menu

:upd_backend
cls & color 0A
echo [UPDATE BACKEND/API]...
call node scripts\update-targets.js backend
echo.
pause & goto menu

:upd_frontend
cls & color 0A
echo [UPDATE FRONTEND]...
call node scripts\update-targets.js frontend
echo.
pause & goto menu

:upd_web
cls & color 0A
echo [UPDATE WEB]...
call node scripts\update-targets.js web
echo.
pause & goto menu

:upd_mobile
cls & color 0A
echo [UPDATE MOBILE]...
call node scripts\update-targets.js mobile
echo.
pause & goto menu

:run_backend
cls & color 0B
echo [RUN] Backend/API on :7000
call scripts\run-backend.cmd
pause & goto menu

:run_frontend
cls & color 0B
echo [RUN] Vite frontend on :7100
call scripts\run-frontend.cmd
pause & goto menu

:run_all
cls & color 0B
call scripts\run-all.cmd
pause & goto menu

:run_migrate
cls & color 0A
call node scripts\migrate.js
pause & goto menu

:run_seed
cls & color 0E
call node scripts\seed.js
pause & goto menu

:run_reset
cls & color 0C
echo [RESET] Creates a session backup first, then resets local-default ops.
call node scripts\reset-ops-data.js
pause & goto menu

:run_backup
cls & color 0A
call node scripts\ops-session-backup.js --backup --reason=toolbox
pause & goto menu

:run_restore
cls & color 0E
call node scripts\ops-session-backup.js --restore-latest
pause & goto menu

:run_isolation
cls & color 0D
call node scripts\check-isolation.js
pause & goto menu

:run_smoke_booking
cls & color 0B
call node scripts\smoke-public-booking.js
pause & goto menu

:run_smoke_http
cls & color 0B
call node scripts\smoke-http.js
pause & goto menu

:run_qa
cls & color 0D
call "%~dp0MAW3ED-QA-SUITE.bat"
goto menu

:run_build
cls & color 0A
call node scripts\build.js
pause & goto menu

:run_release
cls & color 0D
call node scripts\prepare-release.js
pause & goto menu
