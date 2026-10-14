#!/usr/bin/env bash
# 服务器 /srv/shopilot/remote.sh 的事实源副本：一次发布在服务器上的四个动作，CI（.github/workflows/deploy.yml）
# 与本机兜底（deploy/release.sh）共用。源码须已同步到 /srv/shopilot/build/。
#   remote.sh switch <TAG>   构建镜像 → 备份 → 迁移 → 切到新版本（web 与 worker 重建，几秒不可用）
#   remote.sh health <TAG>   直连 127.0.0.1:3001 断言本项目标识与版本
#   remote.sh confirm <TAG>  记为最后一次验证健康的版本，清理旧镜像与构建缓存
#   remote.sh rollback       切回 .last_good
# docker 命令一律接 </dev/null：脚本经 ssh 标准输入传来时，不接会把余下的脚本当输入吞掉。
set -euo pipefail
cd /srv/shopilot
cmd=${1:?用法见文件头}

case "$cmd" in
  switch)
    TAG=${2:?缺 TAG}
    docker build -t "shopilot:$TAG" build </dev/null 2>&1 | tail -3
    ./backup.sh </dev/null
    sed -i "s/^TAG=.*/TAG=$TAG/" .env
    docker compose run --rm migrate </dev/null
    docker compose up -d --wait --wait-timeout 180 web worker </dev/null
    ;;
  health)
    TAG=${2:?缺 TAG}
    body=$(curl -fsS --retry 12 --retry-delay 5 --retry-all-errors http://127.0.0.1:3001/api/health)
    echo "$body"
    # 身份断言：端口上若是别的服务，HTTP 照样 200
    echo "$body" | grep -q '"service":"shopilot"' || { echo "健康响应缺本项目标识"; exit 1; }
    echo "$body" | grep -q "\"version\":\"$TAG\"" || { echo "运行的不是 $TAG"; exit 1; }
    ;;
  confirm)
    TAG=${2:?缺 TAG}
    echo "$TAG" > .last_good
    # 镜像只留最新 5 个（含当前与上一个健康版本），构建缓存只留 7 天
    docker images shopilot --format '{{.Tag}}' </dev/null | tail -n +6 | xargs -r -I{} docker rmi "shopilot:{}" >/dev/null || true
    docker builder prune -f --filter until=168h </dev/null >/dev/null
    ;;
  rollback)
    [ -s .last_good ] || { echo "没有健康版本记录，跳过回滚"; exit 0; }
    GOOD=$(cat .last_good)
    echo "切回 $GOOD"
    sed -i "s/^TAG=.*/TAG=$GOOD/" .env
    docker compose up -d --wait --wait-timeout 180 web worker </dev/null
    ;;
  *)
    echo "未知命令 $cmd"; exit 2 ;;
esac
