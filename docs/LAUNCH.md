# Shopilot 上线清单

操作手册见 [DEPLOY.md](DEPLOY.md)；本清单记录上线时每一步做了什么、怎么验证、还缺什么。执行者：**A**=Agent，**U**=用户，**A+U**=Agent 做、用户复核。2026-10-15 先按最小上线手动发布，同日建 GitHub 仓库并接上 push 即部署；镜像在服务器上构建，没有镜像仓库凭证这一行。

## 1. 密钥配置清单

| 键名 | 配到哪 | 来源 | 配置动作（零回显） | 验证 | 状态 |
| --- | --- | --- | --- | --- | --- |
| `DEPLOY_HOST` | GitHub Secrets | 配置值（服务器固定 IP，即 `dig +short shopilot.live`） | A：`gh secret set DEPLOY_HOST -b "$(dig +short shopilot.live)" -R Bearisbug/shopilot` | `gh secret list -R Bearisbug/shopilot` 见键名 | ☑ 2026-10-15 |
| `DEPLOY_USER` | GitHub Secrets | 固定 `deploy` | A：`gh secret set DEPLOY_USER -b deploy -R Bearisbug/shopilot` | 同上 | ☑ 2026-10-15 |
| `DEPLOY_SSH_KEY` | GitHub Secrets | 生成：`ssh-keygen -t ed25519 -N "" -C gha-deploy@shopilot` | A：公钥追加进服务器 deploy 用户的 authorized_keys → `gh secret set DEPLOY_SSH_KEY -R Bearisbug/shopilot < 私钥文件` → 删除本机私钥 | `gh secret list` 见键名（☑ 2026-10-15）；Actions 部署 job 能 SSH 登录（待首次 Actions 运行） | ☐ |
| `POSTGRES_PASSWORD` | 服务器 `/srv/shopilot/.env.production` | 生成 | A：服务器上 `openssl rand -hex 16` 写入，同值拼进 `DATABASE_URL` | `cut -d= -f1 .env.production` 见键名；db 容器 healthy | ☑ 2026-10-15 |
| `DATABASE_URL` | 同上 | 生成（由上一行拼成，主机 `db:5432`） | 同上 | 迁移成功、健康端点 `db: ok` | ☑ 2026-10-15 |
| `BETTER_AUTH_SECRET` | 同上 | 生成 | A：服务器上 `openssl rand -hex 32` | 注册冒烟 201 并拿到会话 | ☑ 2026-10-15 |
| `APP_BASE_URL` | 同上 | 配置值 `https://shopilot.live` | A：写入 | 接入向导返回的回跳地址为 `https://shopilot.live/api/v1/oauth/shopee/callback` | ☑ 2026-10-15 |
| `APP_ENCRYPTION_KEY` | 同上 | 生成 | A：服务器上 `openssl rand -base64 32` | 键名在；首个商户填平台凭证后由解密成功间接验证 | ☑ 2026-10-15 |
| `DEEPSEEK_API_KEY` | 同上 | Bitwarden `DEEPSEEK_API_KEY` | A：`bw get password DEEPSEEK_API_KEY` 经 ssh 标准输入写入 | 键名在；首个真实出稿时验证 | ☑ 2026-10-15 |
| `DEEPSEEK_MODEL` | 同上 | 配置值 `deepseek-flash` | A：写入 | `grep '^DEEPSEEK_MODEL=' .env.production` | ☑ 2026-10-15 |
| `AI_MODE` | 同上 | 配置值 `deepseek` | A：写入 | `grep '^AI_MODE=' .env.production` | ☑ 2026-10-15 |
| `MOCK_PLATFORM` | 同上 | 配置值 `0` | A：写入 | `/mock/simulator`、`/dev/outbox` 返回 404 | ☑ 2026-10-15 |
| `SHOPEE_HOSTS` | 同上 | 配置值（cn、sg、br 生产主机与沙箱主机） | A：写入 | 首个商户填 Shopee 凭证时识别出区域 | ☑ 2026-10-15 |
| `TIKTOK_API_HOST` | 同上 | 配置值 `https://open-api.tiktokglobalshop.com` | A：写入 | 同上（TikTok） | ☑ 2026-10-15 |
| `TIKTOK_AUTH_HOST` | 同上 | 配置值 `https://auth.tiktok-shops.com` | A：写入 | 同上 | ☑ 2026-10-15 |
| `DATA_DIR` | 同上 | 配置值 `/data` | A：写入 | `appdata` 卷挂在 `/data`，备份能打包出文件卷 | ☑ 2026-10-15 |
| `SMTP_HOST` | 同上 | 配置值 `smtp.feishu.cn` | A：写入 | 注册冒烟的验证邮件 `status = delivered` | ☑ 2026-10-15 |
| `SMTP_PORT` | 同上 | 配置值 `465` | A：写入 | 同上 | ☑ 2026-10-15 |
| `SMTP_USER` | 同上 | 配置值 `no-reply@shopilot.live` | A：写入 | 同上 | ☑ 2026-10-15 |
| `SMTP_PASS` | 同上 | Bitwarden `SHOPILOT_SMTP_PASS`（已有条目 `SMTP_PASSWORD` 属别的项目，换名避开 `bw get` 子串冲突） | A：`bw get password SHOPILOT_SMTP_PASS` 经 ssh 标准输入写入 | 同上 | ☑ 2026-10-15 |
| `SMTP_FROM` | 同上 | 配置值 `Shopilot <no-reply@shopilot.live>` | A：写入 | 同上 | ☑ 2026-10-15 |

## 2. 部署步骤清单

- [x] 1. 盘点问答完成、本清单建档（A+U）· 用户 2026-10-14 选定：香港、m7g.large + 100 GB、Shopee 回调也切、飞书企业邮箱、真实 DeepSeek
- [x] 2. 健康端点回显 `service`、`slot`、`version`（A）· 本机 `/api/health` 返回 `"slot":"local"`；服务器返回 `"slot":"primary"` 与 TAG
- [ ] 2b. 应用侧零停机前提 · N/A：最小上线单实例，见遗留登记
- [x] 3. 服务器初始化（A）· 验证摘要见 DEPLOY.md 第 10 节 2026-10-14
- [x] 4. 宿主端口分配（A）· 新机无其他项目，`ss -ltn` 与 `/srv/*/compose.yaml` 均无 3001；compose、Caddy 站点文件、DEPLOY.md 三处均为 3001
- [x] 5. 产物生成（A）· `Dockerfile`、`.dockerignore`、`deploy/compose.yaml`、`deploy/shopilot.caddy`、`deploy/backup.sh`、`deploy/release.sh`、`deploy/rsync-exclude`、本清单与 DEPLOY.md
- [x] 6. §1 密钥全配齐（A）· 全部 ☑
- [x] 7. 首次部署跑通（A）· `20261015-0003-7919068f`：web healthy、worker ready、`https://shopilot.live/api/health` 含 `"service":"shopilot"` 与该版本
- [ ] 8. 线上冒烟登记进 `docs/TEST.md`（A+U）· 已做注册接口与发信冒烟（DEPLOY.md 第 10 节），TEST.md 尚未登记线上轮次，§3 线上行仍写「无」
- [x] 9. 回滚演练（A）· 2026-10-15 从 `20261015-0019-27afec35` 切回 `20261015-0003-7919068f` 再切回，对外版本两次都随之变化，见 DEPLOY.md 第 10 节
- [x] 9c. 备份恢复演练（A）· 2026-10-15 通过，见 DEPLOY.md 第 10 节
- [x] 11. 交付自查（A）· 2026-10-15 `bash check.sh` 无硬错误；回滚演练（第 9 步）与线上冒烟登记（第 8 步）未完成

## 3. 提速优化菜单

- [ ] 备份异地存放：`backup.sh` 末尾同步到 S3（同区域，按量计费）· 收益：机器或磁盘丢失时数据可恢复；代价：多一个 IAM 角色与少量存储费
- [ ] 零停机发布：改双槽（web 主槽 + 接管槽）与 Caddy `lb_policy first` · 收益：发布时用户无感；前提：应用优雅停机实测、worker 只跑一份
- [ ] Cloudflare 橙云代理 · 代价：证书改用 Origin CA 或 DNS-01；平台推送来源 IP 变成 Cloudflare 的

## 4. 遗留与例外登记

| 日期 | 事项 | 说明 |
| --- | --- | --- |
| 2026-10-14 | 管线待搭 | 先按最小上线手动发布。2026-10-15 已建私有仓库 `Bearisbug/shopilot`、写好 `.github/workflows/deploy.yml` 与 `deploy.yaml`、配好 GitHub Secrets 与 AWS OIDC 角色；首次 Actions 运行（run 38599269230）没有启动，GitHub 报「最近一次账户扣款失败或花费上限需要调高」。用户处理 GitHub Billing 后重新运行，跑通即把本行改为「管线已搭」。在此之前用 `deploy/release.sh` 兜底发布 |
| 2026-10-15 | 镜像不进镜像仓库 | 服务器是 ARM，GitHub 托管的 x64 runner 要靠模拟构建 ARM 镜像，耗时长；改为服务器原生构建、按 commit 哈希打 tag、只留最新 5 个，更早的版本要回滚时需重新构建 |
| 2026-10-15 | 零停机未做 | 单实例 recreate，发布时 web 与 worker 重建，有几秒不可用；双槽方案列在优化菜单 |
| 2026-10-14 | 计费资源经用户确认 | EC2 m7g.large 约 US$82/月、100 GB gp3 约 US$10.6/月、固定公网 IPv4 约 US$3.7/月（ap-east-1 按需价，AWS Pricing API 2026-10-14 查询）；用户先确认 t4g.medium，后要求按 50+ 商户提升规格并选定 m7g.large |
| 2026-10-14 | 平台回调与现网共用 | OBSBOT 的 Shopee、TikTok 应用正被现网 Obsbot v2 使用。用户确认 Shopee 也一起切：在 Shopilot 填凭证时勾选「改发到 Shopilot」，6 家 Shopee 店的推送随即离开 Obsbot v2，直到切回 |
| 2026-10-15 | TikTok 授权链接不符合真实平台 | 现在的链接用 `app_key` 和 `TIKTOK_AUTH_HOST`；跨境店真实格式是 `https://seller.tiktokshopglobalselling.com/services/market/custom-authorize/<Service ID>?shop_region=<站点>`，凭证里还缺 Service ID。修好并发布前，服务器上接不了 TikTok 店 |
| 2026-10-15 | 备份与数据同盘 | 备份只在本机磁盘，机器丢失即一起丢失；异地存放列在优化菜单 |
| 2026-10-15 | SSH 只放行一个 IP | 安全组 22 端口只放行管理员当前 IP（CI 部署时临时放行 runner IP）；换网络后要先在安全组加新 IP |
