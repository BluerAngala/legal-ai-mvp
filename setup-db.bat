@echo off
REM LegalAI MVP - Database Setup Script
REM Run this once to set up the database

echo ========================================
echo LegalAI MVP - Database Setup
echo ========================================
echo.

set PGPATH=%USERPROFILE%\scoop\apps\postgresql\18.4\bin

REM Start PostgreSQL if not running
"%PGPATH%\pg_ctl.exe" status -D "%USERPROFILE%\scoop\apps\postgresql\18.4\data" >nul 2>&1
if %errorLevel% neq 0 (
    echo Starting PostgreSQL...
    "%PGPATH%\pg_ctl.exe" start -D "%USERPROFILE%\scoop\apps\postgresql\18.4\data" -l "%USERPROFILE%\scoop\apps\postgresql\postgres.log" -w
)

echo.
echo Creating database...
"%PGPATH%\psql.exe" -U postgres -c "DROP DATABASE IF EXISTS legalai;"
"%PGPATH%\psql.exe" -U postgres -c "CREATE DATABASE legalai;"
"%PGPATH%\psql.exe" -U postgres -c "ALTER USER postgres WITH PASSWORD 'legalai123';"

echo.
echo Running schema...
"%PGPATH%\psql.exe" -U postgres -d legalai -f config\init.sql

echo.
echo ========================================
echo Database setup complete!
echo ========================================
echo.
echo Connection details:
echo   Host: localhost
echo   Port: 5432
echo   Database: legalai
echo   User: postgres
echo   Password: legalai123
echo.
echo DATABASE_URL: postgresql://postgres:legalai123@localhost:5432/legalai
echo.
pause
