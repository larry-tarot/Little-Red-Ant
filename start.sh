#!/usr/bin/env bash
# 小红蚁 启动脚本 (macOS/Linux)
# 使用方式: chmod +x start.sh && ./start.sh

set -e

echo "============================================"
echo "  小红蚁 (Little Red Ant)"
echo "  AI 智能小红书运营助手"
echo "============================================"
echo ""

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "[错误] 未检测到 Node.js，请先安装: https://nodejs.org/"
    echo "安装完成后重新运行本脚本。"
    exit 1
fi
echo "[OK] Node.js $(node --version)"

# 检查 npm
if ! command -v npm &> /dev/null; then
    echo "[错误] 未检测到 npm"
    exit 1
fi
echo "[OK] npm $(npm --version)"
echo ""

# 安装依赖
echo "[1/2] 检查依赖..."
if [ ! -d "node_modules" ]; then
    echo "正在安装依赖，首次安装可能需要几分钟..."
    npm install
fi
echo "[OK] 依赖已就绪"
echo ""

# 启动服务
echo "[2/2] 启动服务..."
echo ""
echo "服务启动后请访问: http://localhost:5173"
echo "首次使用请注册管理员账号"
echo ""
echo "按 Ctrl+C 停止服务"
echo ""

npm run dev