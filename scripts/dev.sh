#!/usr/bin/env bash
# 本机一键启动：数据库（docker compose）→ Web（http://127.0.0.1:3360）+ Worker。Ctrl-C 一并停止本轮启动的进程。
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] || { echo "缺少 .env：按 .env.example 生成（密钥见 AGENTS.md 密钥纪律）"; exit 1; }
docker compose up -d --wait postgres >/dev/null
pids=()
cleanup() { trap - INT TERM EXIT; for p in "${pids[@]}"; do kill -TERM "$p" 2>/dev/null || true; done; wait; }
trap cleanup INT TERM EXIT
pnpm -s dev:web & pids+=($!)
pnpm -s dev:worker & pids+=($!)
for i in $(seq 1 90); do
  if curl -s --noproxy '*' http://127.0.0.1:3360/api/health | grep -q '"service":"shopilot"'; then echo "Shopilot 就绪：http://127.0.0.1:3360"; break; fi
  sleep 1
done
# 任一进程退出即停止整组（macOS 自带 bash 3.2 没有 wait -n）
while true; do
  for p in "${pids[@]}"; do kill -0 "$p" 2>/dev/null || exit 1; done
  sleep 2
done
