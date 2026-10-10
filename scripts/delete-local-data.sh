#!/usr/bin/env bash
# 删除本机全部本地数据（餐单模板、版本、报价、下单尝试、同步的订单缓存）。
# 该操作只影响本机 SQLite 文件，不可恢复。
set -euo pipefail
cd "$(dirname "$0")/.."

echo "将删除以下文件："
ls -1 apps/server/data/*.db* 2>/dev/null || echo "  （没有找到数据文件）"
read -r -p "确认删除？输入 yes 继续： " ans
if [ "$ans" != "yes" ]; then
  echo "已取消"
  exit 0
fi
rm -f apps/server/data/*.db apps/server/data/*.db-wal apps/server/data/*.db-shm apps/server/data/*.db-journal
echo "已删除本机数据。"
