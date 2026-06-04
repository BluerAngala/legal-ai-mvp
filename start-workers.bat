@echo off
chcp 65001 >nul
echo ========================================
echo LegalAI MVP - Workers 启动器
echo ========================================
echo.
echo 启动前请确保:
echo   1. PostgreSQL 已运行
echo   2. Redis 已运行
echo   3. .env 文件已配置
echo.

:: 检查服务状态
echo [检查服务状态]
redis-cli ping >nul 2>&1
if errorlevel 1 (
    echo   Redis: 未运行 ^(请运行 start-local.bat^)
    echo.
    pause
    exit /b 1
) else (
    echo   Redis: OK
)

"C:\Users\11071\scoop\apps\postgresql\18.4\bin\pg_ctl.exe" status -D "C:\Users\11071\scoop\apps\postgresql\18.4\data" >nul 2>&1
if errorlevel 1 (
    echo   PostgreSQL: 未运行 ^(请运行 start-local.bat^)
    echo.
    pause
    exit /b 1
) else (
    echo   PostgreSQL: OK
)

echo.
echo 正在启动 Workers...
echo.

:: 设置工作目录
cd /d "%~dp0"

:: 启动各个 worker (使用 start 打开新窗口)
echo 启动 upload worker...
start "LegalAI - Upload" cmd /k "cd workers\upload && npm start"

echo 启动 document worker...
start "LegalAI - Document" cmd /k "cd workers\document && npm start"

echo 启动 knowledge worker...
start "LegalAI - Knowledge" cmd /k "cd workers\knowledge && npm start"

echo 启动 analysis worker...
start "LegalAI - Analysis" cmd /k "cd workers\analysis && npm start"

echo 启动 docgen worker...
start "LegalAI - DocGen" cmd /k "cd workers\docgen && npm start"

echo.
echo ========================================
echo Workers 启动中!
echo ========================================
echo.
echo 每个 worker 在独立窗口中运行
echo 关闭窗口即可停止该 worker
echo.
pause
