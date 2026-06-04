@echo off
REM LegalAI MVP - Local Startup Script for Windows
REM Usage: Double-click this file or run from command prompt

echo ========================================
echo LegalAI MVP - Local Services Starter
echo ========================================
echo.

REM Check for admin rights (needed for some operations)
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Note: Some features may require admin rights
    echo.
)

REM Get Scoop path
set PGPATH=%USERPROFILE%\scoop\apps\postgresql\18.4\bin
set REDISCMD=redis-server

echo [1/4] Starting PostgreSQL...
"%PGPATH%\pg_ctl.exe" status -D "%USERPROFILE%\scoop\apps\postgresql\18.4\data" >nul 2>&1
if %errorLevel% neq 0 (
    "%PGPATH%\pg_ctl.exe" start -D "%USERPROFILE%\scoop\apps\postgresql\18.4\data" -l "%USERPROFILE%\scoop\apps\postgresql\postgres.log" -w
    if %errorLevel% neq 0 (
        echo ERROR: Failed to start PostgreSQL
        echo Check %USERPROFILE%\scoop\apps\postgresql\postgres.log for details
        pause
        exit /b 1
    )
)
echo PostgreSQL is running

echo.
echo [2/4] Starting Redis...
redis-cli ping >nul 2>&1
if %errorLevel% neq 0 (
    start /b redis-server --loglevel notice
    timeout /t 2 /nobreak >nul
)
echo Redis is running

echo.
echo [3/4] Checking database...
"%PGPATH%\psql.exe" -U postgres -d legalai -c "SELECT 1;" >nul 2>&1
if %errorLevel% neq 0 (
    echo WARNING: Database 'legalai' not found. Run setup first:
    echo   psql -U postgres -d legalai -f config\init.sql
)
echo Database is accessible

echo.
echo [4/4] Service Status:
echo --------------------
echo PostgreSQL: Running
echo Redis: Running
echo Database: legalai
echo.
echo Connection string:
echo   postgresql://postgres:legalai123@localhost:5432/legalai
echo.
echo ========================================
echo All services started successfully!
echo ========================================
echo.
echo Next steps:
echo 1. Set environment variables:
echo    set DATABASE_URL=postgresql://postgres:legalai123@localhost:5432/legalai
echo    set REDIS_URL=redis://localhost:6379
echo    set CLAUDE_API_KEY=your_claude_api_key
echo    set OPENAI_API_KEY=your_openai_api_key
echo.
echo 2. Install workers dependencies:
echo    cd workers\upload && npm install
echo    cd ..\document && npm install
echo    cd ..\knowledge && npm install
echo    cd ..\analysis && npm install
echo    cd ..\docgen && npm install
echo.
echo 3. Start workers or run demo server
echo.
pause
