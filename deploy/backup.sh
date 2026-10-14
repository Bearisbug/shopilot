#!/usr/bin/env bash
# 服务器 /srv/shopilot/backup.sh 的事实源副本：数据库与上传文件各导一份到 /srv/shopilot/backups，保留最近 14 份。
# deploy 用户的 crontab 每天 03:30（服务器时区 Asia/Kuala_Lumpur）执行；手动备份直接运行本脚本。
set -euo pipefail
cd /srv/shopilot
mkdir -p backups
stamp=$(date +%Y%m%d-%H%M)
docker compose exec -T db pg_dump -U shopilot -d shopilot --no-owner | gzip > "backups/db-$stamp.sql.gz"
docker run --rm -v shopilot_appdata:/data:ro -v /srv/shopilot/backups:/out alpine tar czf "/out/files-$stamp.tar.gz" -C /data .
for kind in db files; do ls -1t backups/$kind-* 2>/dev/null | tail -n +15 | xargs -r rm --; done
echo "backup $stamp done"
