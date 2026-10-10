#!/usr/bin/env bash
# 本地自检：类型检查 → 离线测试 → 构建 → 演示模式冒烟。全部不触碰真实接口。
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== 1/4 类型检查 =="
npm run typecheck

echo "== 2/4 离线单元测试（演示模式，不触碰真实 MCP）=="
npm test

echo "== 3/4 构建 =="
npm run build

echo "== 4/4 演示模式冒烟 =="
MCD_DATA_DIR="$(mktemp -d)" FORCE_DEMO_MODE=true PORT=8799 npm run start > /tmp/mcd-smoke.log 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null || true' EXIT
for i in $(seq 1 30); do
  curl -s -o /dev/null "http://127.0.0.1:8799/api/status" && break
  sleep 1
done
curl -s "http://127.0.0.1:8799/api/status" | head -c 200; echo
curl -s -o /dev/null -w "SPA HTTP %{http_code}\n" "http://127.0.0.1:8799/"
echo "== 自检通过 =="
