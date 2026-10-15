# RUN-010 · 局部轮（知识库一期，DESIGN v1.12）

- 执行：AI（Claude Code 执行子会话），2026-10-15 23:53 至 2026-10-16 00:06（UTC+8）
- 被测版本：`feat/knowledge-ui` 提交 `e4a7034`（应用代码与 `855eb5d` 相同，另含补扫场景脚本 `63ef575`）
- 环境：§3 本地行的独立副本，不碰本机共用库与 3360 端口：同一个 docker PostgreSQL 里另建库 `shopilot_kbrun`，起跑时 `db:reset` + `db:seed`；Web `pnpm exec next dev -H 127.0.0.1 -p 3362`（`APP_BASE_URL` 与模拟平台主机都改成 3362），Worker `node --import tsx src/worker/main.ts`；`KNOWLEDGE_MODE=stub`、`AI_MODE=stub`、`MOCK_PLATFORM=1`，`DATA_DIR` 指向临时目录。`TC-AI-002` 前重建一次基线并以 `AI_MODE=deepseek` 重启。就绪判定：`/api/health` 返回 `"service":"shopilot"`、`"db":"ok"`，模拟器标题「Shopilot 模拟器」，AI 替身与检索替身都是 `normal`
- 手段：界面步骤 Playwright 1.64 + 本机 Edge（headless，`channel: "msedge"`）；接口用 §3「curl 会话」与「知识库 curl 函数」原样定义（`B` 指向 3362，`q` 的库名为 `shopilot_kbrun`）；「模拟器发消息」在模拟器页面上操作，下单、推进订单、申请退货、买家寄回走 `POST /api/mock/sim/{action}`；场景与任务用 `pnpm scenario`、`pnpm job`；§3「知识库测试文件」按原文命令生成
- 执行顺序：建基线 → PERM-002（放最前，Nur 的权限被拒审计只有本条的 3 条）→ PERM-001 → PERM-003 → PERM-005 → TEAM-013 → AUTH-004 → AUTH-001 → SHOP-001 → AI-001 → TKT-001 → ORD-015 → KB-001 至 KB-035（KB-005 除外，按编号）→ AI-003（改提示词）→ AI-005（改接待模式）→ KB-005（造满 500 份，最后跑）→ 重建基线、切 DeepSeek → AI-002
- 计数：通过 48 · 失败 1 · 待人工 2（共 51）

| 用例 | 结果 | 现象 / 证据 |
| --- | --- | --- |
| TC-PERM-002 | 通过 | 三个接口 403 `/errors/forbidden`；Nur 打开 `/reception` 原位显示「这个页面只对管理员开放」，返回后到 `/wb`；审计操作人 Nur Aisyah 恰好 3 条「被拒绝」 |
| TC-PERM-001 | 通过 | owner 侧栏 14 项、无用量卡与「知识库」「助手」、收起后只有「展开侧栏」；lead 多了「接待设置」，点进 `/reception/knowledge`，子导航只有「知识库」；agent 没有看板与接待设置；三人 `nav-summary` 都无 `usage`；owner 子导航依次 5 项，最后是「知识库」 |
| TC-PERM-003 | 通过 | 5 个管理员接口 403；`/team`「这个页面只对管理员开放」；看板 200 |
| TC-PERM-005 | 通过 | 5 个读与 5 个写都 404；`/wb/<OC>`「找不到或已删除」；Other Store 5 个对象前后一致 |
| TC-TEAM-013 | 通过 | 权限表与 `docs/roles.md`「权限表」逐行一致，含知识库「上传、查看、分类、停用、删除资料，测试问答 ✓ ✓ —」，没有「核验 AI 回复」「维护产品目录」与助手 |
| TC-AUTH-004 | 通过 | 表单登录到 `/wb`，账号卡 Nur Aisyah；退出回 `/login`；`/wb` 被带回登录；curl 登录 200、`/me` 200；退出后 `/me` 401；不带请求体退出也 200；登录记录有同一分钟的成功记录 |
| TC-AUTH-001 | 通过 | 注册 201 → `/shops/connect`；侧栏 9 项；`/me` 为 Signup Store / admin / 所有者；发件箱 `verify_email`；成员只有「测试店主」一行、在线 |
| TC-SHOP-001 | 通过 | 5 项清单 → 凭证 → `PUT platform-apps/shopee` 200（区域 sg）→ 模拟授权页列主账号 900100 下三家 → 勾选授权回 probe；PH 不能收发并带「准备清单第 4 项」；完成接入 200；`/shops` 三家 shadow / shadow；新买家消息 10 秒内进 signup1 的待认领 |
| TC-AI-001 | 通过 | 推送 200；20 秒内进「AI 草稿」；草稿置信度 0.85 与三个按钮；认领并发送后买家视图 1 条同文消息，10 秒后仍 1 条；用量 +1、assist +1 |
| TC-TKT-001 | 通过 | 申请退货 type 12 推送 200；新工单退货退款 · 待处理 · 负责人 Arif；同意退货 → 等待中 · 等买家（AWAITING_BUYER_SHIP）；买家寄回 → 处理中 · 待验货，截止时间变化；收货后同意退款 → COMPLETE、已解决；时间线六条，来源页面与平台 |
| TC-ORD-015 | 通过 | 弹层 Invoice、订单预填；生成的发票号符合 `INV-2026-` 加 6 位数字并显示在页面上；买家视图收到发票图片；发件箱 `invoice` 邮件带 PDF；发票记录聊天、邮件都「已发送」；下载的文件以 `%PDF-` 开头 |
| TC-KB-001 | 通过 | 空态与「资料 0 / 500」；弹窗列出 3.0 MB、1.0 MB 与格式上限说明；分类「售后政策」上传 2 个，都「已上传，排队解析」；30 秒内两行「可用」、「2 / 500」；PDF 抽屉内嵌预览、1 段分块、上传人林晓；「解析内容」带 `docTab=parsed`，刷新后仍停在该标签；xlsx 只给下载；接口 2 条 ready、`partsCount` 与 `chunksCount` 都为 1 |
| TC-KB-002 | 通过 | pptx 415 `ppt_export_pdf`；25 MB 413 `file_limit`；5 MB docx 413 `retrieval_limit`；exe 415 `unsupported`；伪装 PDF 415 `content_mismatch`；ALL 与 MY 同选 422；列表为空 |
| TC-KB-003 | 通过 | 文件选择框 `accept` 含 `.pptx`；四个文件前端直接写原因，「1 个可上传，4 个不能上传」；上传请求被拦住 5 秒期间没有关闭按钮、Esc 与点遮罩无效；放行后「已上传 1 个，4 个被拒」；服务端只有型号对照.xlsx |
| TC-KB-004 | 通过 | 副本 409 `document_duplicate`，`existingName` 保修政策.md；弹窗「已有同样的文件：《保修政策.md》 查看」，点查看打开该资料抽屉 |
| TC-KB-005 | 通过 | 造满 500 份后「500 / 500」为警示色并有「资料已满」提示；点上传只提示不开弹窗；上传 409 `document_quota`；删一份后 499 / 500，再上传 201 |
| TC-KB-006 | 通过 | 拆分.pdf 拆成 2 个条目，页码首尾相接覆盖第 1–30 页，抽屉「2 段分块 · 拆成 2 个条目」与两个页码标签 |
| TC-KB-007 | 通过 | 失败原因「第 12 页超过 10 MB，请压缩后重传」，`parts` 为空，抽屉解析内容写失败说明 |
| TC-KB-008 | 通过 | 替身报错一次后 ready，条目 `retries` 1；替身回到 normal |
| TC-KB-009 | 通过 | 重传 2 次后 failed，原因「检索服务索引失败（已重传 2 次）：workers_ai_timeout_error（替身）」；替身设回 normal 后点「重新解析」变为可用 |
| TC-KB-010 | 通过 | 新增、同名提示、改名、未分类不可改删；三份改分类不重新解析；删除分类确认文案与归入未分类，`readyAt` 不变；未分类改名删除 409 `builtin`；重复删除 404 |
| TC-KB-011 | 通过 | 49 个 201；第 50 个 409 `category_quota`；输入框「分类已满 50 个」且禁用，「已有 50 / 50 个分类」 |
| TC-KB-012 | 通过 | 「MY 可用」只列适用全部站点的保修政策.md、「TH 可用」两份、「只看全部站点」一份；非法参数被去掉；改站点只剩 MY、提示立即生效；清空站点提示且不保存；两个非法 PATCH 422；SG 店不检索、MY 店引用保修政策.md |
| TC-KB-013 | 通过 | 关掉 AI 可用后「已停用」，测试问答与两路分块都不再有它；「已停用」筛选只列它；打开后回到「可用」 |
| TC-KB-014 | 通过 | 排队中的资料重新解析 409 `processing`；抽屉「排队中」提示，重新解析不可用并写原因 |
| TC-KB-015 | 通过 | 重新解析 202，30 秒内 ready，`readyAt` 更新，解析内容是全文 |
| TC-KB-016 | 通过 | 确认框两句；删除后立即消失；详情与原文件 404；重复删除 204；30 秒后库里资料与条目都没有了 |
| TC-KB-017 | 通过 | 提问中「正在回答」与加载占位；回答、0.85、会出草稿；引用 1 条带片段，点开抽屉；检索明细两路各两段、合并 2 段不重复；用量不变；空问题与 501 字都被挡 |
| TC-KB-018 | 通过 | 「资料不足」、0.90、「按当前阈值会转人工（AI 置信度低）」与说明 |
| TC-KB-019 | 通过 | 没有资料时提示没有检索、引用 0、无检索明细；检索替身没有新的检索请求 |
| TC-KB-020 | 通过 | 降级提示与原因「检索失败（改写路：timeout；原话路：timeout）」；四组都「失败：超时」，合并 0 段 |
| TC-KB-021 | 通过 | 「AI 暂时不可用」且问题保留；再问出回答 |
| TC-KB-022 | 通过 | 20 次 200；第 21 次 429，`Retry-After` 在 1–60 秒；页面「提问太频繁」；等待后恢复 |
| TC-KB-023 | 通过 | 组长店铺下拉只有不选店铺、Demo Shopee MY、Demo TikTok MY；带 TH 店 404 且之后连续 20 次都 200 |
| TC-KB-024 | 通过 | 草稿下方「依据：《保修政策.md》」，员工看到的是普通文字；AI 替身请求 `knowledge[0]` 为保修政策.md、含「保修 12 个月」，护栏含知识库限定句；两路检索都是「保修多久」、hybrid；owner 点依据在新标签打开 `/reception/knowledge?doc=<ID>`；发出的消息不含依据与编号 |
| TC-KB-025 | 通过 | 删除资料后依据仍是文件名但不再是链接，接口 `available` 为 false |
| TC-KB-026 | 通过 | 四份写到「保修」的资料里只有可用、全部站点的保修政策.md 进入出稿请求 |
| TC-KB-027 | 通过 | 资料不足（0.9 高于阈值 0.60）仍转人工，`handoffReason` low_confidence、无草稿；审计 `handoff` 为 `low_confidence\|true` |
| TC-KB-028 | 通过 | 没有向量分时 3 条检索请求（2 hybrid、1 vector）；草稿快照记该路 `no_vector` 后紧接 `vector_only`，`degraded` false |
| TC-KB-029 | 通过 | 检索报 500 时同样紧接 `vector_only` 重试，草稿带依据 |
| TC-KB-030 | 通过 | 两路超时：草稿照常在 AI 草稿、无依据，请求无 `knowledge`，快照 `true\|检索失败（改写路：timeout；原话路：timeout）` |
| TC-KB-031 | 通过 | 影子回复下方有依据；资料不足时仍存影子回复（0.90），页面没有「资料不足」，会话在待认领 |
| TC-KB-032 | 通过 | 组长 `/reception` 跳到知识库、只有一个标签、看得到资料；`/reception/hours` 只对管理员开放；员工知识库页只对管理员、组长开放；员工两个接口 403、原文件 403「知识库资料只对管理员与组长开放。」 |
| TC-KB-033 | 通过 | 别的商户读、分块、改、重新解析都 404；删除 204 但资料仍 ready 且开着；原文件与分类改删 404；列表为空 |
| TC-KB-034 | 通过 | 审计「接待设置」模块 8 条：上传、修改、重新解析、删除资料，新增、改名、删除分类，系统的解析完成 |
| TC-KB-035 | 失败 | 第 2 步：`pnpm job knowledge.purge` 后 30 秒，D1 仍是 `queued`，没有新的入库任务。前置里用 `PATCH` 关掉 AI 可用把资料的更新时间刷成了当前，补扫按「最近一次更新」判断是否排队超过 10 分钟。第 3 步未执行。证据 `run-010-TC-KB-035-2.json`、`run-010-TC-KB-035-2.png` |
| TC-AI-003 | 通过 | 出稿请求含售中标记、语气标记、订单号与 SHIPPED、买家原文，护栏在最后，没有 `knowledge`；检索替身没有新的检索请求 |
| TC-AI-005 | 通过 | 员工看不到影子回复，接口无 `shadowDrafts`；组长与 owner 看到折叠的影子回复（0.85、无按钮）；shadow 用量 +1；买家没有收到卖家消息 |
| TC-AI-002 | 通过 | 真实 DeepSeek（`deepseek-flash`）3.6 秒出稿，置信度 0.90，正文写明订单号、已发货、承运商 SPX Express (MY) 与运单号；认领并发送后买家收到同一段正文 |
| TC-CONV-010 | 待人工 | 执行者为人工 |
| TC-KB-036 | 待人工 | 执行者为人工：要真实 Cloudflare AI Search 与 DeepSeek，token 由人解锁 Bitwarden 取 |
