@echo off
title Maw3ed - Build API & Web Dist
color 0B

echo =========================================
echo  [1/2] Building Backend API...
echo =========================================
call pnpm build:api

echo.
echo =========================================
echo  [2/2] Building Web Frontend (Vite)...
echo =========================================
call pnpm build:web

echo.
echo [SUCCESS] API and Web Distribution Built Successfully!
pause