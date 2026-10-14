# Shopilot 部署手册

本手册是 Shopilot 部署操作的唯一出处：发布、看日志、回滚、密钥位置、备份恢复都照这里做。上线时做了什么、还缺什么见 [LAUNCH.md](LAUNCH.md)。push 到 `main` 即自动发布；单实例部署，发布时有几秒不可用。

## 1. 环境信息表

| 项 | 值 |
| --- | --- |
| 部署目标 | `server-docker` |
| 服务器 | shopilot-prod · AWS ap-east-1（香港）· EC2 m7g.large（2 vCPU / 8 GB，ARM）· 100 GB gp3 · 固定公网 IP（即 `dig +short shopilot.live`）· AWS profile `kando`。实例、磁盘、固定 IP、安全组都带标签 `project=shopilot`，ID 用 `aws ec2 describe-instances --profile kando --region ap-east-1 --filters Name=tag:project,Values=shopilot` 这类命令查 |
| SSH | `ssh -i ~/.ssh/shopilot-hk.pem deploy@shopilot.live`（应用操作）；`ubuntu@` 同一把密钥（系统维护，有 sudo）。安全组 `shopilot-web` 的 22 端口只放行管理员当前 IP，换网络后要先在安全组加新 IP |
| 应用目录 | `/srv/shopilot/`：`compose.yaml`、`.env`（`TAG=` 版本指针）、`.env.production`（运行时配置与密钥）、`.last_good`、`backup.sh`、`remote.sh`、`backups/`、`build/`（发布时同步的源码） |
| 镜像 | 在服务器上原生构建（ARM），不推镜像仓库：`shopilot:<TAG>`，`TAG` = commit 哈希，只留最新 5 个。接入 git 之前的两个版本 TAG 是 `<日期-时分>-<源码指纹>` |
| 发布策略 | recreate 单实例（降级，原因见 LAUNCH.md 遗留登记） |
| 代码仓库 | `github.com/Bearisbug/shopilot`（私有），默认分支 `main` |
| CI | GitHub Actions `.github/workflows/deploy.yml`；环境契约 = 仓库根 `deploy.yaml`。部署时经 AWS OIDC 角色 `shopilot-gha-deploy`（ARN 在仓库变量 `AWS_DEPLOY_ROLE_ARN`）给本次 runner IP 临时放行安全组（仓库变量 `DEPLOY_SG_ID`）的 22 端口，结束时收回 |
| Synco 编排 | 未挂接 |
| 进程 | `web`（Next，容器 3000）、`worker`（pg-boss 后台任务）、`db`（PostgreSQL 17 + pgvector，不发布宿主端口）；数据卷 `shopilot_pgdata`、`shopilot_appdata`（上传、发票、导出包，挂在 `/data`） |
| 端口 | `127.0.0.1:3001` → web 容器 `3000`（经 Caddy 反代对外；改端口须同步 `deploy/shopilot.caddy`）。仓库根 `compose.yaml` 的 `127.0.0.1:5460` 是本机开发库，不部署 |
| 域名 | `https://shopilot.live` |
| DNS | Cloudflare（账号令牌取自 Bitwarden `CLOUDFLARE_ACCOUNT_TOKEN_RW`）· A 记录 `shopilot.live → 服务器固定 IP`，DNS only 灰云；另有飞书企业邮箱的 TXT（站点验证、SPF）与 3 条 MX |
| 反代配置 | `/etc/caddy/sites/shopilot.caddy`（事实源 `deploy/shopilot.caddy`；主 Caddyfile 只有 `import sites/*.caddy`），证书由 Caddy 自动向 Let's Encrypt 申请与续期 |
| 健康检查 | `https://shopilot.live/api/health`，响应含 `"service":"shopilot"`、`"slot":"primary"`、`"version":"<TAG>"`、`"db":"ok"`；Caddy 的 `health_body` 只认含 `"service":"shopilot"` 的上游 |
| 发信 | 飞书企业邮箱 `no-reply@shopilot.live`，SMTP `smtp.feishu.cn:465`；Worker 的 `email.send` 任务发出，结果记在 `email_outbox.status` |

## 2. 日常发布

push 到 `main` 即发布，进度看仓库 Actions 页，手动重跑用 Actions 页的 Run workflow。流程：质量门（PostgreSQL 服务容器上迁移加种子，`pnpm lint`、`vitest`、`pnpm build`、`pnpm typecheck`）→ 建 GitHub deployment → AWS OIDC 临时放行 runner 的 SSH → rsync 源码到 `/srv/shopilot/build/`（排除表 `deploy/rsync-exclude`），同步 `compose.yaml`、`backup.sh`、`remote.sh` → `remote.sh switch <commit>`（服务器构建镜像、`backup.sh` 备份、`docker compose run --rm migrate`、切 TAG 重启 web 与 worker）→ 健康检查（`remote.sh health` 直连 3001 断言本项目标识与版本，再经 `https://shopilot.live/api/health` 确认对外已是新版本）→ `remote.sh confirm`（写 `.last_good`、清理旧镜像与 7 天前的构建缓存）→ 收回 SSH 放行。

切换或健康检查失败时，「失败回滚」步执行 `remote.sh rollback` 切回 `.last_good`，GitHub deployment 标为 failure 并带 `rolled_back`。PR 只跑质量门，不部署。

上线资格：改动已按 `docs/TEST.md` 回归策略跑过受影响用例与冒烟集。数据库迁移必须向后兼容：回滚只切镜像、不回退表结构，旧版本要能在新表结构上运行。

## 3. 查日志 / 排障

- 应用日志：`ssh -i ~/.ssh/shopilot-hk.pem deploy@shopilot.live` → `cd /srv/shopilot && docker compose logs -f --tail 200 web worker`。
- 容器状态：`docker compose ps`，web 要 healthy；`worker` 没有健康检查，看日志里有 `"msg":"worker ready"`。
- 当前版本：`curl -sS https://shopilot.live/api/health` 看 `version`；`cat /srv/shopilot/.last_good` 是最后一次验证健康的版本。
- 邮件没发出：`docker compose exec db psql -U shopilot -d shopilot -c "select to_email, template, status, created_at from email_outbox order by created_at desc limit 10"`，`queued` 长时间不变时看 worker 日志里 `email.send` 的报错。
- 站点返回 503：Caddy 判定上游不健康。`sudo journalctl -u caddy -n 50`，出现 `response body failed expectations` 说明 3001 端口上的不是本项目；否则看 web 容器是否 healthy。
- 平台推送：Shopee 推送打到 `https://shopilot.live/api/webhooks/shopee/<应用ID>`，TikTok 打到 `.../api/webhooks/tiktok/<应用ID>`；收到但验签失败时 web 日志有记录。
- 磁盘：`df -h /`；镜像与构建缓存由发布脚本清理，备份保留 14 份。本机不构建镜像，本机侧无需清理。

## 4. 回滚

切回最后一次验证健康的版本：

```bash
ssh -i ~/.ssh/shopilot-hk.pem deploy@shopilot.live 'cd /srv/shopilot && GOOD=$(cat .last_good) \
  && sed -i "s/^TAG=.*/TAG=$GOOD/" .env \
  && docker compose up -d --wait --wait-timeout 180 web worker </dev/null \
  && curl -fsS 127.0.0.1:3001/api/health'
```

回到更早的版本：`docker images shopilot` 列出服务器上留存的 5 个 TAG，把 `GOOD=$(cat .last_good)` 换成 `GOOD=<TAG>`。回滚只换镜像，不回退数据库；需要回退数据时按第 6 节恢复备份。回滚后在第 10 节登记一行。

## 5. 密钥清单（只有键名，无值）

| 层 | 键名 | 用途 |
| --- | --- | --- |
| GitHub Secrets | `DEPLOY_HOST` / `DEPLOY_USER` / `DEPLOY_SSH_KEY` | CI 登录服务器（专用部署密钥对 `gha-deploy@shopilot`，公钥在 deploy 用户的 authorized_keys） |
| GitHub 仓库变量（非密钥） | `AWS_DEPLOY_ROLE_ARN` / `DEPLOY_SG_ID` | CI 要扮演的 IAM 角色与要临时放行的安全组 |
| AWS IAM | 角色 `shopilot-gha-deploy`（OIDC，只信任 `repo:Bearisbug/shopilot:ref:refs/heads/main`） | CI 临时放行 SSH，只能改 `shopilot-web` 安全组的入站规则；无长期 AWS 密钥 |
| 服务器 `/srv/shopilot/.env.production`（权限 600，属主 deploy） | 见项目根 `.env.example`（运行时键名唯一登记处） | 运行时配置与密钥，仅此一份 |
| 本机 `~/.ssh/shopilot-hk.pem` | EC2 密钥对 `shopilot-hk`（ed25519） | SSH 登录 ubuntu 与 deploy |
| Bitwarden | `DEEPSEEK_API_KEY`、`SHOPILOT_SMTP_PASS`、`CLOUDFLARE_ACCOUNT_TOKEN_RW` | 前两个写进服务器 `.env.production`；第三个只在改 DNS 时用 |

`POSTGRES_PASSWORD`、`BETTER_AUTH_SECRET`、`APP_ENCRYPTION_KEY` 在服务器上用 openssl 生成，不入 Bitwarden、不离开服务器。`APP_ENCRYPTION_KEY` 加密了库里的平台凭证与店铺 token，丢失后这些凭证无法解密，只能让商户重新填写与授权；更换它之前先导出并重新加密全部平台凭证。

## 6. 数据库备份与恢复

- 备份方式与频率：deploy 用户的 crontab 每天 03:30（服务器时区 Asia/Kuala_Lumpur）执行 `/srv/shopilot/backup.sh`，`pg_dump` 压缩成 `backups/db-<时间>.sql.gz`，上传文件卷打包成 `backups/files-<时间>.tar.gz`，各保留 14 份，日志在 `backups/backup.log`。备份与数据在同一块盘上，机器丢失时备份一起丢失（见 LAUNCH.md 遗留登记）。
- 手动立即备份：`ssh ... deploy@shopilot.live /srv/shopilot/backup.sh`；发布脚本在迁移前也会先备份一次。
- 恢复步骤：先停应用写入 `docker compose stop web worker`；`docker compose exec -T db psql -U shopilot -d postgres -c "drop database shopilot" -c "create database shopilot"`；`gunzip -c backups/db-<时间>.sql.gz | docker compose exec -T db psql -U shopilot -d shopilot -v ON_ERROR_STOP=1`；上传文件用 `docker run --rm -v shopilot_appdata:/data -v /srv/shopilot/backups:/in alpine sh -c "rm -rf /data/* && tar xzf /in/files-<时间>.tar.gz -C /data"`；最后 `docker compose up -d --wait web worker` 并检查健康端点。
- 迁移执行点：发布脚本在切版本前执行 `docker compose run --rm migrate`（`scripts/db-migrate.ts`，按 `drizzle/` 迁移文件），之前已先备份。

## 7. 手动部署兜底（Actions 不可用时）

在项目根执行 `bash deploy/release.sh`：要求工作区已提交，版本号取当前 commit 哈希，步骤与 CI 相同（本机质量门 → 同步 → `remote.sh switch` → `health` → `confirm`，健康检查不过自动 `rollback`）。脚本也跑不动时逐条执行：

```bash
# 本机，项目根（工作区已提交）
TAG=$(git rev-parse HEAD)
pnpm lint && pnpm typecheck && (set -a; . ./.env; set +a; pnpm exec vitest run) && pnpm build
rsync -az --delete -e "ssh -i ~/.ssh/shopilot-hk.pem" --exclude-from=deploy/rsync-exclude ./ deploy@shopilot.live:/srv/shopilot/build/
scp -i ~/.ssh/shopilot-hk.pem deploy/compose.yaml deploy/backup.sh deploy/remote.sh deploy@shopilot.live:/srv/shopilot/

# 服务器（deploy 用户）
/srv/shopilot/remote.sh switch $TAG
/srv/shopilot/remote.sh health $TAG && /srv/shopilot/remote.sh confirm $TAG || /srv/shopilot/remote.sh rollback
```

## 10. 变更记录

| 日期 | 事件 | 记录 |
| --- | --- | --- |
| 2026-10-14 | 服务器初始化 | Ubuntu 24.04 arm64；`sshd -T`：passwordauthentication no、permitrootlogin without-password；Docker 与 Compose v5.6.0（`up --help` 含 `--wait`）、`hello-world` 通过；Caddy v2.11.7，主 Caddyfile 改为 `import sites/*.caddy`；ufw 只放行 OpenSSH、80、443；2 GB swap；deploy 用户在 docker 组；新机无其他项目，端口 3001 无占用 |
| 2026-10-14 | 规格调整 | 用户确认 t4g.medium 后改为 m7g.large、磁盘 30 GB 扩到 100 GB（按 50+ 商户预估） |
| 2026-10-15 | 首次发布 `20261015-0003-7919068f` | 迁移完成；本机直连与 `https://shopilot.live/api/health` 均返回该版本、`db: ok`；`/mock/simulator`、`/dev/outbox`、`/api/mock/sim/state` 返回 404；外网直连 3001 不通；注册接口冒烟 201，验证邮件经飞书 SMTP 发出（`email_outbox.status = delivered`），冒烟商户已删除 |
| 2026-10-15 | 第二次发布与回滚演练 | `release.sh` 发布 `20261015-0019-27afec35`（TikTok Service ID，迁移 `0001` 只加列）；按第 4 节切回 `20261015-0003-7919068f`，对外版本随即变为旧版、`db: ok`（旧代码在新表结构上正常），再切回新版正常 |
| 2026-10-15 | 接入 git 与 CI | 建私有仓库 `Bearisbug/shopilot`，首个提交 `3ecfeed`；Actions 因 GitHub 账户扣款问题未启动，用 `deploy/release.sh` 兜底发布 `3ecfeedd82086833def69a5297677a164c20f92a`：本机质量门通过，直连与外网健康检查均返回该版本、`db: ok` |
| 2026-10-15 | 备份恢复演练 | `backup.sh` 生成 `db-20261015-0006.sql.gz`，恢复到临时库 `restore_drill` 后表数 56 与线上一致、迁移记录 1 与线上一致，临时库已删除 |
