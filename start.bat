@echo off
chcp 65001 >nul 2>&1
title LegalAI MVP
cd /d "%~dp0"

echo ========================================
echo LegalAI MVP - Starting...
echo ========================================
echo.

:: Start PostgreSQL
echo [1/3] Starting PostgreSQL...
"%USERPROFILE%\scoop\apps\postgresql\18.4\bin\pg_ctl.exe" start -D "%USERPROFILE%\scoop\apps\postgresql\18.4\data" -l NUL -w 2>nul

:: Start Redis
echo [2/3] Starting Redis...
redis-server --daemonize yes 2>nul

:: Start Server
echo [3/3] Starting Server...
start "LegalAI MVP" cmd /k "cd /d \"%~dp0\" ^&^& node simple-server.js"

echo.
echo ========================================
echo Started! Check http://localhost:3000
echo ========================================
echo.
pause
