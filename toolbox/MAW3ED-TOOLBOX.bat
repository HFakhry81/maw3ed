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
echo   10. Platform seed        (npm run seed — NOT demo workspaces)
echo   11. Reset ops data       (auto session backup first)
echo   12. Backup ops session
echo   13. Restore latest session
echo.
echo  [ DEMO — unified seed + 3 users ]
echo   14. Demo restore         (seed:demo:restore — medical+education)
echo   15. Demo save section    (seed:demo:save --section=medical^|education)
echo   16. Cleanup demo users   (keep fakhry admin + 2 owners)
echo.
echo  [ QA ]
echo   17. Isolation check
echo   18. Smoke public booking
echo   19. Smoke HTTP
echo   20. QA suite (all tests)
echo   21. Phase 2 data tests   (ops integrity + staff links)
echo.
echo  [ RELEASE ]
echo   22. Build dist only
echo   23. Prepare release      (refresh + Git/VPS commands)
echo.
echo   24. Exit
echo =======================================================================
echo   medical  -^> contact.haitham@gmail.com / dawybooking
echo   education-^> contact.haitham@yahoo.com / talaaee-book
echo   admin    -^> contact.fakhry@gmail.com  (no workspace)
echo   seed     -^> data\seeds\maw3ed-demo-ops.json
echo =======================================================================
set "choice="
set /p choice="Select [1-24]: "

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
if "%choice%"=="14" goto run_demo_restore
if "%choice%"=="15" goto run_demo_save
if "%choice%"=="16" goto run_demo_cleanup
if "%choice%"=="17" goto run_isolation
if "%choice%"=="18" goto run_smoke_booking
if "%choice%"=="19" goto run_smoke_http
if "%choice%"=="20" goto run_qa
if "%choice%"=="21" goto run_phase2
if "%choice%"=="22" goto run_build
if "%choice%"=="23" goto run_release
if "%choice%"=="24" exit /b 0
echo Invalid option.
pause
goto menu

:upd_all
cls & color 0E
echo [UPDATE ALL] backend + frontend/web + API smoke + mobile...
cd /d "%PROJECT_ROOT%" || exit /b 1
call node "%PROJECT_ROOT%\scripts\update-targets.js" all
echo.
pause & goto menu

:upd_backend
cls & color 0A
echo [UPDATE BACKEND/API]...
cd /d "%PROJECT_ROOT%" || exit /b 1
call node "%PROJECT_ROOT%\scripts\update-targets.js" backend
echo.
pause & goto menu

:upd_frontend
cls & color 0A
echo [UPDATE FRONTEND]...
cd /d "%PROJECT_ROOT%" || exit /b 1
call node "%PROJECT_ROOT%\scripts\update-targets.js" frontend
echo.
pause & goto menu

:upd_web
cls & color 0A
echo [UPDATE WEB]...
cd /d "%PROJECT_ROOT%" || exit /b 1
call node "%PROJECT_ROOT%\scripts\update-targets.js" web
echo.
pause & goto menu

:upd_mobile
cls & color 0A
echo [UPDATE MOBILE]...
cd /d "%PROJECT_ROOT%" || exit /b 1
call node "%PROJECT_ROOT%\scripts\update-targets.js" mobile
echo.
pause & goto menu

:run_backend
cls & color 0B
echo [RUN] Backend/API on :7000
call "%PROJECT_ROOT%\scripts\run-backend.cmd"
pause & goto menu

:run_frontend
cls & color 0B
echo [RUN] Vite frontend on :7100
call "%PROJECT_ROOT%\scripts\run-frontend.cmd"
pause & goto menu

:run_all
cls & color 0B
call "%PROJECT_ROOT%\scripts\run-all.cmd"
pause & goto menu

:run_migrate
cls & color 0A
cd /d "%PROJECT_ROOT%" || exit /b 1
call node "%PROJECT_ROOT%\scripts\migrate.js"
pause & goto menu

:run_seed
cls & color 0E
echo [PLATFORM SEED] npm run seed — schema/platform only.
echo This does NOT restore medical/education demo workspaces.
echo Use menu 14 for: npm run seed:demo:restore
cd /d "%PROJECT_ROOT%" || exit /b 1
call node "%PROJECT_ROOT%\scripts\seed.js"
pause & goto menu

:run_reset
cls & color 0C
echo [RESET] Creates a session backup first, then resets local-default ops.
cd /d "%PROJECT_ROOT%" || exit /b 1
call node "%PROJECT_ROOT%\scripts\reset-ops-data.js"
pause & goto menu

:run_backup
cls & color 0A
cd /d "%PROJECT_ROOT%" || exit /b 1
call node "%PROJECT_ROOT%\scripts\ops-session-backup.js" --backup --reason=toolbox
pause & goto menu

:run_restore
cls & color 0E
cd /d "%PROJECT_ROOT%" || exit /b 1
call node "%PROJECT_ROOT%\scripts\ops-session-backup.js" --restore-latest
pause & goto menu

:run_demo_restore
cls & color 0E
echo =======================================================================
echo  [DEMO RESTORE] Unified seed — both sections
echo  File: data\seeds\maw3ed-demo-ops.json
echo  medical   -^> contact.haitham@gmail.com / dawybooking
echo  education -^> contact.haitham@yahoo.com / talaaee-book
echo  Command: npm run seed:demo:restore
echo  Note: migrate / seed do NOT load this blob.
echo =======================================================================
cd /d "%PROJECT_ROOT%" || exit /b 1
call npm run seed:demo:restore
echo.
echo Refresh the browser after this finishes.
pause & goto menu

:run_demo_save
cls & color 0A
echo =======================================================================
echo  [DEMO SAVE] Write one live workspace back into the unified seed
echo  npm run seed:demo:save -- --section=medical
echo  npm run seed:demo:save -- --section=education
echo =======================================================================
set "section="
set /p section="Section [medical/education]: "
if /i "%section%"=="medical" goto demo_save_go
if /i "%section%"=="education" goto demo_save_go
echo Invalid section. Use medical or education.
pause & goto menu
:demo_save_go
cd /d "%PROJECT_ROOT%" || exit /b 1
call npm run seed:demo:save -- --section=%section%
echo.
echo Refresh the browser after this finishes.
pause & goto menu

:run_demo_cleanup
cls & color 0C
echo =======================================================================
echo  [DEMO CLEANUP] Keep exactly 3 users
echo    1. contact.fakhry@gmail.com  — platform admin, NO workspace
echo    2. contact.haitham@gmail.com — dawybooking owner
echo    3. contact.haitham@yahoo.com — talaaee-book owner
echo  Commands:
echo    npm run users:cleanup-demo-owners -- --dry-run
echo    npm run users:cleanup-demo-owners -- --apply
echo =======================================================================
cd /d "%PROJECT_ROOT%" || exit /b 1
echo.
echo Running dry-run first...
call npm run users:cleanup-demo-owners -- --dry-run
echo.
set "apply="
set /p apply="Apply cleanup now? [y/N]: "
if /i not "%apply%"=="y" (
  echo Skipped apply.
  pause & goto menu
)
call npm run users:cleanup-demo-owners -- --apply
pause & goto menu

:run_isolation
cls & color 0D
cd /d "%PROJECT_ROOT%" || exit /b 1
call node "%PROJECT_ROOT%\scripts\check-isolation.js"
pause & goto menu

:run_smoke_booking
cls & color 0B
cd /d "%PROJECT_ROOT%" || exit /b 1
call node "%PROJECT_ROOT%\scripts\smoke-public-booking.js"
pause & goto menu

:run_smoke_http
cls & color 0B
cd /d "%PROJECT_ROOT%" || exit /b 1
call node "%PROJECT_ROOT%\scripts\smoke-http.js"
pause & goto menu

:run_qa
cls & color 0D
call "%~dp0MAW3ED-QA-SUITE.bat"
goto menu

:run_phase2
cls & color 0D
echo [PHASE 2] npm run test:phase2-data
cd /d "%PROJECT_ROOT%" || exit /b 1
call npm run test:phase2-data
pause & goto menu

:run_build
cls & color 0A
cd /d "%PROJECT_ROOT%" || exit /b 1
call node "%PROJECT_ROOT%\scripts\build.js"
pause & goto menu

:run_release
cls & color 0D
cd /d "%PROJECT_ROOT%" || exit /b 1
call node "%PROJECT_ROOT%\scripts\prepare-release.js"
pause & goto menu
