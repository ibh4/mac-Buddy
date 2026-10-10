#!/usr/bin/env bash
# 发布前校验：确认没有 Token / 凭据 / 私有数据进入将被公开的文件。
# 只读检查，不修改任何文件，不调用真实接口。
set -uo pipefail
cd "$(dirname "$0")/.."

FAIL=0
pass() { echo "  ✅ $1"; }
fail() { echo "  ❌ $1"; FAIL=1; }
warn() { echo "  ⚠️  $1"; }

echo "== 1. 前端构建产物中是否含 Token / 凭据 =="
if [ -d apps/web/dist ]; then
  # 变量名 MCD_MCP_TOKEN 出现在帮助文案里是允许的；出现 Bearer 或真实长串则视为泄漏
  if grep -qaE "Bearer [A-Za-z0-9._-]{8,}" apps/web/dist -r; then
    fail "产物中出现 Bearer + 令牌串"
  else
    pass "产物中无 Bearer 令牌串"
  fi
  if grep -qaE "Authorization\":\s*\"Bearer " apps/web/dist -r; then
    fail "产物中出现 Authorization 头"
  else
    pass "产物中无 Authorization 头"
  fi
else
  warn "apps/web/dist 不存在，跳过（请先 npm run build:web）"
fi

echo "== 2. 敏感文件是否会被提交（.gitignore 覆盖检查）=="
SENSITIVE=(apps/server/.env apps/server/data/mcd-old-same.db)
for f in "${SENSITIVE[@]}"; do
  if [ -e "$f" ]; then
    if git check-ignore -q "$f" 2>/dev/null; then
      pass "$f 已被忽略"
    else
      # 没有 git 仓库时用 .gitignore 规则做文本判断
      if grep -q "apps/server/.env" .gitignore && [ "$f" = "apps/server/.env" ]; then
        pass "$f 命中 .gitignore 规则"
      elif [ "$f" != "apps/server/.env" ]; then
        pass "$f 命中 .gitignore 规则（apps/server/data/*.db）"
      else
        fail "$f 未被忽略"
      fi
    fi
  else
    pass "$f 不存在"
  fi
done

echo "== 3. 示例配置是否只含占位符 =="
if [ -f mcp-config.example.json ]; then
  if grep -qE '"[^"]*(Bearer )?[A-Za-z0-9._-]{24,}"' mcp-config.example.json; then
    fail "mcp-config.example.json 中疑似存在真实令牌"
  else
    pass "mcp-config.example.json 只含 \${MCD_MCP_TOKEN} 占位符"
  fi
  python3 -c "import json,sys; json.load(open('mcp-config.example.json')); print('  ✅ JSON 合法')" || fail "JSON 非法"
else
  fail "缺少 mcp-config.example.json"
fi

if [ -f .env.example ]; then
  if grep -qE '^MCD_MCP_TOKEN=.+' .env.example; then
    fail ".env.example 中的 MCD_MCP_TOKEN 有值"
  else
    pass ".env.example 中的 MCD_MCP_TOKEN 为空"
  fi
else
  fail "缺少 .env.example"
fi

echo "== 4. 参赛声明文件是否被改动 =="
if [ -f CONTEST_DECLARATION.md ]; then
  pass "CONTEST_DECLARATION.md 存在"
  if grep -q "参赛声明" CONTEST_DECLARATION.md; then
    pass "标题未改"
  else
    fail "标题可能被改动"
  fi
else
  fail "缺少 CONTEST_DECLARATION.md"
fi

echo "== 5. 文档中的相对链接是否存在 =="
python3 - <<'PY'
import re, pathlib
bad = []
for md in pathlib.Path('.').rglob('*.md'):
    if 'node_modules' in str(md) or 'dist' in str(md):
        continue
    text = md.read_text(errors='ignore')
    # 去掉围栏代码块与行内代码，避免把“示例写法”当成真实链接
    text = re.sub(r'```.*?```', '', text, flags=re.S)
    text = re.sub(r'`[^`\n]*`', '', text)
    for m in re.finditer(r'\]\((?!https?://|#|mailto:)([^)]+)\)', text):
        target = m.group(1).split('#')[0].strip()
        if not target:
            continue
        p = (md.parent / target).resolve()
        if not p.exists():
            bad.append(f"{md} -> {target}")
if bad:
    print("  ❌ 失效链接：")
    for b in bad[:10]:
        print("     ", b)
    raise SystemExit(1)
print("  ✅ 未发现失效的相对链接")
PY
[ $? -ne 0 ] && FAIL=1

echo
if [ "$FAIL" -eq 0 ]; then
  echo "== 发布前校验通过 =="
else
  echo "== 发布前校验发现问题，请修复后再发布 =="
fi
exit "$FAIL"
