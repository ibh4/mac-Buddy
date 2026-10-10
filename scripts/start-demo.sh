#!/usr/bin/env bash
# 演示模式启动：不需要任何 Token，不调用真实接口，不产生真实订单。
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== Mac-Buddy · 麦麦搭子｜演示模式 =="
if [ ! -d node_modules ]; then
  echo "首次运行，正在安装依赖…"
  npm install
fi

echo "构建前端…"
npm run build:web

echo "启动后端（强制演示模式）…"
echo "打开 http://127.0.0.1:${PORT:-8787}"
FORCE_DEMO_MODE=true npm run start
