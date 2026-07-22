@echo off
title 小红蚁 - 启动中...
echo ============================================
echo   小红蚁 (Little Red Ant)
echo   AI 智能小红书运营助手
echo ============================================
echo.
echo [1/3] 检查 Node.js 环境...
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [错误] 未检测到 Node.js，请先安装: https://nodejs.org/
    echo 安装完成后重新运行本脚本。
    pause
    exit /b 1
)
echo [OK] Node.js 已安装
echo.

echo [2/3] 安装依赖...
call npm install
echo [OK] 依赖安装完成
echo.

echo [3/3] 启动服务...
echo.
echo 服务启动后请访问: http://localhost:5173
echo 首次使用请注册管理员账号
echo.
echo 按 Ctrl+C 停止服务
echo.

call npm run dev
pause