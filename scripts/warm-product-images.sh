#!/usr/bin/env bash
# 预热商品图片地址缓存。
#
# 做什么：在**营业时间**拉一次当前门店的全量菜单，把每个单品的官方图片 https 地址
#         存进本地 SQLite（apps/server/data/mcd-old-same.db，已被 gitignore 忽略）。
# 不做什么：不下载图片文件、不把任何官方图片打包进仓库、不抓取非 MCP 来源的图片。
#
# 为什么需要：query-meals 在门店非营业时间会返回「门店可能已关闭或不在营业时间」，
#             此时拿不到全量商品列表。预热之后，即使非营业时间也能正常显示商品图。
#
# 用法：先启动后端（npm start），再执行本脚本。
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-8787}"
STORE="${1:-}"
ORDER_TYPE="${2:-1}"
BE_TYPE="${3:-1}"

if [ -z "$STORE" ]; then
  echo "用法：bash scripts/warm-product-images.sh <门店编码> [orderType] [beType]"
  echo "提示：门店编码可从页面「门店」下拉里看到，或调用 GET /api/stores?beType=1 获取。"
  exit 1
fi

echo "正在预热门店 $STORE 的商品图片地址…"
curl -s -X POST "http://127.0.0.1:${PORT}/api/product-images/warm" \
  -H 'Content-Type: application/json' \
  -d "{\"storeCode\":\"${STORE}\",\"orderType\":${ORDER_TYPE},\"beType\":${BE_TYPE}}"
echo
