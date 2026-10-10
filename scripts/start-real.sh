#!/usr/bin/env bash
# 真实模式启动：需要 apps/server/.env 中配置了 MCD_MCP_TOKEN。
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f apps/server/.env ]; then
  echo "缺少 apps/server/.env"
  echo "请先执行：cp .env.example apps/server/.env  然后填入 MCD_MCP_TOKEN（不要加 Bearer 前缀）"
  exit 1
fi

if ! grep -Eq '^MCD_MCP_TOKEN=.+' apps/server/.env; then
  echo "apps/server/.env 中的 MCD_MCP_TOKEN 为空，将回退到演示模式。"
  echo "如确需真实模式，请先填入 Token。"
  exit 1
fi

echo "构建前端…"
npm run build:web

echo "启动后端（真实模式）…"
echo "打开 http://127.0.0.1:${PORT:-8787}"
npm run start
