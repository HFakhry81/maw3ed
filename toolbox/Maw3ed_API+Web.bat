@echo off
chcp 65001 >nul
title MAW3ED ALL (API :7000 + Vite :7100)
color 0D

cd /d E:\UpNexa.com\maw3ed

set PORT=7000
set VITE_PORT=7100

echo ===================================================
echo  Starting Maw3ed Backend (7000) & Frontend (7100)
echo ===================================================
call pnpm dev
pause