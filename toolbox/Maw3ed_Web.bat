@echo off
chcp 65001 >nul
title MAW3ED API :7000 | DB maw3ed@5433
color 0A

cd /d E:\UpNexa.com\maw3ed

set PORT=7000

echo ===================================================
echo  MAW3ED API Server -> http://localhost:7000
echo  Connected DB       -> PostgreSQL @ localhost:5433
echo ===================================================
call pnpm dev:server
pause