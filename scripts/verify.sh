#!/bin/sh
# verify 一次性服务入口：测试 → 类型检查 → 生产构建 → 启动静态服务 → HTTP 冒烟。
# 任一步失败立即以非零退出码结束。
set -e

echo "==> [1/4] 单元测试（vitest）"
npm run test

echo "==> [2/4] TypeScript 类型检查"
npm run typecheck

echo "==> [3/4] 生产构建（vite build）"
npm run build

echo "==> [4/4] 启动静态服务并执行 HTTP 冒烟"
node scripts/serve.mjs &
SRV_PID=$!

cleanup() {
  kill "$SRV_PID" 2>/dev/null || true
  wait "$SRV_PID" 2>/dev/null || true
}
trap cleanup EXIT

if node scripts/smoke.mjs; then
  echo "verify 全部通过。"
  exit 0
else
  STATUS=$?
  echo "verify 失败（冒烟退出码 $STATUS）"
  exit "$STATUS"
fi
