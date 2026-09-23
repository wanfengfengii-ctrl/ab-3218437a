#!/bin/sh
# verify 一次性服务：单元测试 -> 类型检查 -> 生产构建 -> HTTP 冒烟
set -eu

echo "==> [1/4] 单元测试（vitest）"
npm run test

echo "==> [2/4] TypeScript 类型检查"
npm run typecheck

echo "==> [3/4] 生产构建"
npm run build

echo "==> [4/4] 启动静态站点并做 HTTP 冒烟"
PORT="${PORT:-8080}"
export PORT
node server.mjs &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true' EXIT

# 等待 /healthz 就绪（最多约 10 秒）
ready=""
for i in $(seq 1 20); do
  if node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" 2>/dev/null; then
    ready="yes"
    break
  fi
  sleep 0.5
done
if [ -z "$ready" ]; then
  echo "静态站点未在限定时间内就绪" >&2
  exit 1
fi

BASE_URL="http://127.0.0.1:${PORT}" node scripts/smoke.mjs

echo "==> verify 全部通过"
