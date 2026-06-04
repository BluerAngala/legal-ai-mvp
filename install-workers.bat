@echo off
chcp 65001 >nul
echo ========================================
echo LegalAI MVP - Workers 一键安装
echo ========================================
echo.

cd /d "%~dp0"

echo [1/5] 安装 upload worker...
cd workers\upload
if exist package.json (
    call npm install --silent
    if errorlevel 1 (
        echo    失败!
        goto :error
    )
    echo    完成
) else (
    echo    跳过 (无 package.json)
)
cd ..\..

echo [2/5] 安装 document worker...
cd workers\document
if exist package.json (
    call npm install --silent
    if errorlevel 1 (
        echo    失败!
        goto :error
    )
    echo    完成
) else (
    echo    跳过 (无 package.json)
)
cd ..\..

echo [3/5] 安装 knowledge worker...
cd workers\knowledge
if exist package.json (
    call npm install --silent
    if errorlevel 1 (
        echo    失败!
        goto :error
    )
    echo    完成
) else (
    echo    跳过 (无 package.json)
)
cd ..\..

echo [4/5] 安装 analysis worker...
cd workers\analysis
if exist package.json (
    call npm install --silent
    if errorlevel 1 (
        echo    失败!
        goto :error
    )
    echo    完成
) else (
    echo    跳过 (无 package.json)
)
cd ..\..

echo [5/5] 安装 docgen worker...
cd workers\docgen
if exist package.json (
    call npm install --silent
    if errorlevel 1 (
        echo    失败!
        goto :error
    )
    echo    完成
) else (
    echo    跳过 (无 package.json)
)
cd ..\..

echo.
echo ========================================
echo 安装完成!
echo ========================================
echo.
echo 下一步:
echo   1. 双击 start-workers.bat 启动 workers
echo   或
echo   2. cd workers\upload ^&^& npm start
echo.
pause
exit /b 0

:error
echo.
echo ========================================
echo 安装过程中出现错误
echo ========================================
pause
exit /b 1
