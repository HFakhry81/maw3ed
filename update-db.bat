@echo off
title Maw3ed - Update Database
color 0A

echo =========================================
echo  [1/2] Running DB Migrations...
echo =========================================
call pnpm db:migrate

echo.
echo =========================================
echo  [2/2] Seeding DB Data...
echo =========================================
call pnpm db:seed

echo.
echo [SUCCESS] Database Updated Successfully!
pause