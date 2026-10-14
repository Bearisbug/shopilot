#!/usr/bin/env bash
# 本机兜底发布（GitHub Actions 不可用时用）：与 .github/workflows/deploy.yml 同序——
# 质量门 → 同步源码 → 服务器 remote.sh switch → health → confirm；health 不过自动 rollback。
# 版本号 = 当前 commit 哈希，工作区有未提交改动时拒绝发布。手册见 docs/DEPLOY.md。
# 用法：bash deploy/release.sh            完整发布
#       bash deploy/release.sh --skip-gate  跳过本机质量门（只在刚跑过质量门时用）
set -euo pipefail
cd "$(dirname "$0")/.."
HOST=deploy@shopilot.live
KEY="$HOME/.ssh/shopilot-hk.pem"

[ -z "$(git status --porcelain)" ] || { echo "工作区有未提交的改动，先提交再发布"; exit 1; }
TAG=$(git rev-parse HEAD)
echo "release $TAG"

if [ "${1:-}" != "--skip-gate" ]; then
  pnpm lint
  pnpm typecheck
  (set -a; . ./.env; set +a; pnpm exec vitest run)
  pnpm build
fi

rsync -az --delete -e "ssh -i $KEY" --exclude-from=deploy/rsync-exclude ./ "$HOST:/srv/shopilot/build/"
scp -q -i "$KEY" deploy/compose.yaml deploy/backup.sh deploy/remote.sh "$HOST:/srv/shopilot/"

remote() { ssh -i "$KEY" "$HOST" "/srv/shopilot/remote.sh $*"; }
if remote switch "$TAG" && remote health "$TAG"; then
  remote confirm "$TAG"
  echo "已发布 $TAG"
else
  remote rollback
  echo "发布失败，已切回最后一次验证健康的版本"
  exit 1
fi
curl -fsS https://shopilot.live/api/health
echo
