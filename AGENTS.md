# Shopilot

多商户聚合客服 SaaS：商户接入自建的 Shopee / TikTok Shop 应用，客服在一个工作台处理全部店铺的买家会话，AI 按店铺接待模式起草或代发。Next.js 16 全栈（页面、API、平台回调）+ 独立 Worker 进程（pg-boss）+ PostgreSQL。本期只接模拟平台（`src/mock`），不部署。

- 设计：`docs/DESIGN.md`；测试：`docs/TEST.md`；视觉：`brand/DESIGN.md`。
- 原型与依据材料：`docs/` 下的 `roles.md`、`ui-interactions.md`、`ui-feasibility.md`、`requirements-ui-impact.md`、`platform-api/`；原型生成脚本 `design/quilt/`（Python，不属于应用代码）。
- 本机：`docker compose up -d` 起数据库，`pnpm dev` 起 Web（http://127.0.0.1:3360）与 Worker。
- 现网 Obsbot v2（`~/Documents/Projects/Bots/Obsbot`）只作逻辑参考，不改、不连它的生产机。客服不主动发起会话：不实现主动联系买家、重新打开并联系、TikTok Create Conversation。

## 功能开发纪律
<!-- project-workflow:功能开发纪律 rev 2026-10 -->
本项目以设计文档 `docs/DESIGN.md` 为单一事实源，以测试文档 `docs/TEST.md` 为验收执行脚本与台账。适用范围看改动本身、不看措辞：新增功能，或改动会改变对外行为、接口、数据模型，即适用；拿不准时按适用处理。适用时先加载 `project-workflow` 技能并按它执行：先更新设计文档，再改实现代码，再同步测试文档中受影响的用例，按测试文档执行测试并在其执行记录中登记轮次；只改代码而未同步两份文档、或未执行并登记测试，视为未完成。动 `docs/DESIGN.md` 前加载 `design-doc`，动 `docs/TEST.md` 前加载 `test-doc`，改完跑各自的 `check.sh`；只做纯文本替换、且不新增 TC 与 RUN 时可以不加载。派给 subagent 时，在任务里写明要加载的技能（subagent 不继承）。技能不可用时停下告知用户，不要凭记忆补流程。

## 密钥纪律
<!-- project-workflow:密钥纪律 rev 2026-10 -->
适用范围看动作与文件：新增、存放、读取、轮换任何密钥（第三方 API key、平台 token、数据库口令、私钥），或往 `.env*`、`.env.example` 里加密钥键，即适用。动手前加载 `project-workflow` 技能，按其「密钥纪律」执行（集中层、会话与解锁、入库范围都以它为准）。密钥值不出现在聊天、代码、文档、commit、日志的任何位置，主密码与解锁只由人执行；发现仓内明文密钥立即停下提示轮换（git 历史同样已泄漏）。派给 subagent 时，在任务里写明要加载 `project-workflow`（subagent 不继承）。技能不可用时停下告知用户。

## 前端实现纪律
<!-- ui-constraints:前端实现纪律 rev 2026-10 -->
本项目任何 Web 前端改动——新建页面/组件、调样式、修 UI 缺陷、按截图还原、逐条体验优化——动码前必须加载 `ui-constraints` 技能并按它执行，交付前做它要求的真实浏览器验证。适用范围看**改到哪个文件**、不看措辞：碰 `.tsx/.jsx/.vue/.svelte/.css/.scss/.html` 或任何组件、样式文件即适用，「就改一行」「随手调一下」同样适用，拿不准时按适用处理；React Native / Expo 等原生 App 的界面文件不在本段范围，归 `mobile-ui-constraints`。长会话中每进入一次新的前端改动，都要重新按该技能查一遍规则，不要凭上一轮的记忆推进。把前端工作派给 subagent 时，任务里必须写明要加载 `ui-constraints`（subagent 不继承）。技能不可用时停下告知用户，不要凭记忆拼一套前端约束。

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 部署
<!-- deploy-pipeline:部署 rev 2026-10 -->
本项目已接 push 即部署：push main 自动发布，手册（发布、日志、回滚、密钥键名）见 `docs/DEPLOY.md`。适用范围看改到的文件与动作：改 `.github/workflows/`、`Dockerfile`、compose 文件、Caddy / nginx 站点、systemd 单元、`*.tf`、`deploy.yaml`、`docs/DEPLOY.md`，或重新部署、回滚、排查发布失败、发布含数据库迁移的改动，即适用；拿不准时按适用处理。适用时动手前加载 `deploy-pipeline` 技能并按它执行。日常功能改动先按测试文档过冒烟集再 push main。新增运行时密钥按序做：先登记进 `.env.example`，再按 `docs/LAUNCH.md` 密钥表配到运行环境，最后 push（缺环境变量的新版本起不来，会被健康门回滚）。派给 subagent 时，在任务里写明要加载 `deploy-pipeline`（subagent 不继承）。技能不可用时停下告知用户，不要徒手改管线或手工上线。
