# RUN-012 · 局部轮（飞书群推送一期，DESIGN v1.13）

- 执行：AI（Claude Code 执行子会话），2026-10-16 00:47 至 01:44（UTC+8）
- 被测版本：`feat/feishu` 提交 `a246bfc`（应用代码与 `9644a8e` 相同，另合入 `feat/knowledge-ui` 到 `17a5bbf`）
- 环境：§3 本地行的独立副本，不碰本机共用库与 3360 端口：同一个 docker PostgreSQL 里另建库 `shopilot_fsrun`，起跑时 `db:reset` + `db:seed`；Web `pnpm exec next dev -H 127.0.0.1 -p 3363`（`APP_BASE_URL` 与模拟平台主机都改成 3363），Worker `pnpm exec tsx src/worker/main.ts`；`FEISHU_MODE=stub`、`KNOWLEDGE_MODE=stub`、`AI_MODE=stub`、`MOCK_PLATFORM=1`，`DATA_DIR` 指向临时目录。`TC-AUTH-014` 与 `TC-FEISHU-014` 之后各重建一次基线；`TC-MOCK-002` 以环境变量 `MOCK_PLATFORM=0` 重启再改回 1（不改 `.env`）；`TC-AI-002` 以 `AI_MODE=deepseek` 重启，跑完改回 stub。就绪判定：`/api/health` 返回 `"service":"shopilot"`、`"db":"ok"`，模拟器标题「Shopilot 模拟器」
- 手段：界面步骤 Playwright 1.64 + 本机 Edge（headless，`channel: "msedge"`，1440×900）；接口按 §3「curl 会话」的口径用 fetch 带 cookie 与 `Origin` 发出；「模拟器发消息」、下单、推进订单、申请退货、买家寄回、发图片、发商品卡与订单卡走 `POST /api/mock/sim/{action}`；场景与任务用 `pnpm scenario`、`pnpm job`；§3「连上飞书替身」按原文两个接口执行；只读 SQL 在 `shopilot_fsrun` 上执行；验证码按开启时显示的密钥用 RFC 6238 算出
- 执行顺序：建基线 → PERM-002（放最前，Nur 的权限被拒审计只有本条的 3 条）→ PERM-001 → PERM-005 → AUTH-004 → AUTH-001 → SHOP-001 → AI-001 → TKT-001 → ORD-015 → KB-001 → KB-024 → AUTH-011 → AUTH-013 → AUTH-015 → AUTH-021 → CONV-012 → CONV-013 → CONV-029 → CONV-036 → AI-015 → SET-004 → SET-006 → MOCK-004 → TEAM-012 → FEISHU-004 → FEISHU-001 → FEISHU-002 → FEISHU-003 → FEISHU-005 → FEISHU-006 → FEISHU-007 → FEISHU-008 → FEISHU-009 → FEISHU-013 → FEISHU-011 → FEISHU-012 → FEISHU-015 → FEISHU-010（要等 5 分钟）→ CONV-037（整分后几秒内起跑，避开 Worker 每分钟一次的提醒任务）→ AUTH-014 → 重建基线 → FEISHU-014 → 重建基线 → MOCK-002 → 切 DeepSeek → AI-002
- 计数：通过 40 · 失败 3 · 待人工 2（共 45）

执行脚本出错不计结果：下列用例第一次执行时脚本的选择器或等待写错（例如「默认群」同时匹配店铺行里的「跟随默认群」、确认框是 `alertdialog`、抽屉动画没结束就读文字），中断后修正脚本，从前置起用新数据重跑一次，表中登记的是重跑结果：`TC-AI-001`、`TC-TKT-001`、`TC-ORD-015`、`TC-KB-001`、`TC-AUTH-011`、`TC-AUTH-015`、`TC-CONV-012`、`TC-CONV-013`、`TC-CONV-029`、`TC-SET-006`、`TC-FEISHU-001`、`TC-FEISHU-003`、`TC-FEISHU-010`、`TC-FEISHU-011`、`TC-FEISHU-012`、`TC-FEISHU-015`、`TC-AUTH-014`。`TC-AUTH-001` 与 `TC-SHOP-001` 不能用同一邮箱重跑：`TC-AUTH-001` 第 1–5 步在第一次执行时观察通过，第 6 步改为等成员表加载完后在同一状态上重看；`TC-SHOP-001` 第 1–7 步在第一次执行时观察通过，第 8 步的回补状态改到店铺抽屉里读（列表行没有这一列）后在同一状态上重看通过；第 9 步见表中失败说明。`TC-AUTH-015` 第一次中断在第 3 步，Nur 的两步验证停在开启状态，重跑前用 SQL 把她恢复为未开启（只改本轮独立库）。

| 用例 | 结果 | 现象 / 证据 |
| --- | --- | --- |
| TC-PERM-002 | 通过 | 三个接口 403 `/errors/forbidden`；Nur 打开 `/reception` 原位显示「这个页面只对管理员开放」，返回后到 `/wb`；Nur 的被拒审计恰好 3 条 |
| TC-PERM-001 | 通过 | 三种角色侧栏符合；owner 收起后只有「展开侧栏」；三人 `nav-summary` 都无 `usage`；owner 子导航 5 项，lead 进 `/reception/knowledge` 只有知识库 |
| TC-PERM-005 | 通过 | 5 个读与 5 个写都 404；`/wb/<OC>`「找不到或已删除」；Other Store 5 个对象前后一致 |
| TC-AUTH-004 | 通过 | 表单登录到 `/wb`，账号卡 Nur Aisyah；退出回登录页，`/wb` 被带回；curl 登录 200、`/me` 200；退出后 `/me` 401；不带请求体退出 200；登录记录有成功记录 |
| TC-AUTH-001 | 通过 | 时区默认 Asia/Kuala_Lumpur（UTC+8）；注册 201 → `/shops/connect` 有两个平台；侧栏 9 项；`/me` 为 Signup Store / admin / 所有者；发件箱 `verify_email`；成员一行「测试店主 · 账号所有者 · 管理员 · 在线」 |
| TC-SHOP-001 | 失败 | 第 9 步：先发「接入后第一条」再打开 signup1 的 `/wb`，会话 00:59:29 入库，发出后 10.3 秒时待认领里仍没有它：页面首次取列表时会话还没进入待认领，下一次要等 10 秒轮询。用例要求 10 秒内；DESIGN §16 的口径是「别人的写入在下一次轮询（≤ 10 秒）可见」，从发出算起最长约 11 秒。另做一次先打开 `/wb` 再发，8.9 秒出现（只作参考，不改本轮结果）。没有截图（脚本重跑前清掉了），时间取自库里的入库时间与脚本的等待超时。第 1–8 步通过：5 项清单 → 全球控制台校验通过、回调已设置 → 授权页主账号 900100 列三家 → 检查页只有 PH 带「准备清单第 4 项」 → 完成接入；`/shops` 连接列「正常」「需处理 · 聊天不可用」「正常」，shadow / shadow，抽屉里回补三家都「已完成」 |
| TC-AI-001 | 通过 | 推送 code 10 HTTP 200；20 秒内出草稿，列表行带 Demo Shopee MY；0.85 与三个按钮；认领并发送后草稿区消失、会话进「我处理中」；买家视图 1 条同文，10 秒后刷新仍 1 条；本期已用 2 → 3，assist 2 → 3 |
| TC-TKT-001 | 通过 | 工单 T-1007：退货退款 · 待处理 · 平台时限 · Arif Rahman；同意退货 → 等买家（AWAITING_BUYER_SHIP）；寄回 → 待验货、截止时间变化；收货后同意退款 → RETURN_OR_REFUND_REQUEST_COMPLETE、已解决；时间线六条，人工动作来源「页面」、平台事件来源「平台」 |
| TC-ORD-015 | 通过 | 弹层 Invoice，订单与商品已预填；发票 INV-2026-000003；买家视图收到图片；发件箱 `invoice` 带 PDF；发票行聊天、邮件都「已发送」；PDF 文字含发票号与抬头 |
| TC-KB-001 | 通过 | 空态与「资料 0 / 500」、测试问答面板；弹窗两文件 3.0 MB / 1.0 MB「等待上传」与上限说明；上传后两行「已上传，排队解析」；30 秒内两行「可用」、AI 可用开、「2 / 500」；PDF 抽屉信息齐、内嵌预览，解析内容 1 段，刷新仍停在该标签；xlsx 无预览有下载；接口 2 条 ready、`counts` 2 / 500 |
| TC-KB-024 | 通过 | 推送 200；Nur 看到「依据：《保修政策.md》」且是普通文字；最近一次请求 `knowledge[0]` n=1、保修政策.md、含「保修 12 个月」，护栏句在；`lastQuery` 末两条「保修多久」hybrid；林晓点依据新标签打开资料抽屉；发送后买家 1 条卖家消息，不含依据 |
| TC-AUTH-011 | 通过 | 账号弹层两个商户、都是员工、Demo Store 当前；切到 Other Store 后侧栏只有工作台、工单、订单与开票，列表无 Demo 店铺；`/wb/<C1>`「找不到或已删除」、接口 404；切回后 C1 正常显示 |
| TC-AUTH-013 | 通过 | admin2 切到 Other Store 403 `/errors/forbidden`；admin2 账号弹层没有切换商户 |
| TC-AUTH-015 | 通过 | 开启后显示 10 个备用码并提示已开启；重新登录要验证码，填对进 `/wb`；关闭提示已关闭；再登录直接进 `/wb` |
| TC-AUTH-021 | 通过 | 新商户开两步验证；两步验证步骤有「手机不在身边？改用备用码」与「返回重新输入密码」；用 K 登录进 `/wb`；再用 K 提示「备用码不正确或已经用过。」并停在该步；返回回到邮箱密码步骤 |
| TC-CONV-012 | 通过 | 并发认领：Nur 200、Mei 409 `/errors/conflict`，`extra.claimedBy` 为 Nur；Mei 提示「Nur Aisyah 已经认领了这个会话」，对话栏「Nur Aisyah 已认领这个会话」与「回到会话列表」、无右栏；只有 Nur 的「我处理中」有 C |
| TC-CONV-013 | 通过 | v=2：v+1 → 409 conflict，`extra` 带当前 `handlingState` 与 `version`；v → 200、处理人 Nur；同一请求再发 200 |
| TC-CONV-029 | 通过 | 结束后买家再发，9.4 秒出现在 Mei 待认领顶部；打开无草稿，转人工原因「店铺未开 AI」（`shop_off`） |
| TC-CONV-036 | 通过 | 第一次 `unclaimed.remind` 退出码 0，Arif 新增 1 条「待认领已超过 10 分钟」、Nur 不变；第二次 Arif 不变 |
| TC-AI-015 | 通过 | 今天（周五）设为休息；买家视图 1 条安抚消息；Arif 待认领有该会话，原因 `keyword`，通知新增 1 条「需要人工接待」；本期已用不变；之后恢复周五工作 |
| TC-SET-004 | 通过 | 第一次 Nur 通知 +1、`ticket_alert` +1；关邮件保存提示已保存；第二次 Nur 通知 +1、`ticket_alert` 不变；之后恢复邮件开关 |
| TC-SET-006 | 通过 | 管理员与全员两步验证开关、登录有效期四档（8 小时、12 小时、24 小时、7 天）、IP 白名单；没有本人设备列表、没有飞书；lead 显示只对管理员开放 |
| TC-MOCK-004 | 通过 | 邀请弹层显示链接；`/dev/outbox` 顶部 outbox.test@demo.test · `invitation`，带主题与时间；正文链接打开 `/invite/<令牌>`，显示 Demo Store |
| TC-TEAM-012 | 通过 | c0=3、t0=2；停用返回 `releasedConversations` 5、`returnedTickets` 3；Mei 刷新回登录；两个会话回待认领、处理人空、时间线有停用事件；T1（T-1010，前置用 `POST /api/v1/tickets` 建）负责人 Arif、有负责人变更；重新启用后不再显示已停用；Mei 登录进 `/wb`，负责店铺仍是 Demo Shopee MY、Demo TikTok TH |
| TC-FEISHU-004 | 通过 | lead `GET /api/v1/feishu` 403 forbidden、`code` settings.manage；lead PUT、agent POST targets 都 403；lead 打开通知页「这个页面只对管理员开放」；owner 200 |
| TC-FEISHU-001 | 通过 | 未连接表单：「飞书应用（推荐）」已选、两个输入框、「校验并保存」、替身说明与「开发发件箱」链接；bad-secret → 422 `platform-credentials`，Secret 标红且有焦点，表单下方写 10014 与请求编号；good → 「飞书应用 cli_demo12345678」「校验通过 · 时间」、两个开关开、5 行群设置，店铺行「跟随默认群」「不推送（还没设默认群）」；选默认群后 4 行「推到默认群「Shopilot 客服群（替身）」」；TH 选泰国站后有「发测试卡片」；接口 verified、`oc_stub_th`、无明文；SQL `t\|0` |
| TC-FEISHU-002 | 失败 | 第 2 步：正文有「下面这张图片用来确认买家图片能显示在卡片里：」，但图片位置只显示文字「图片 img_stub_bytes_301」，没有图片：替身把上传的图片字节记成只带大小的 key，开发发件箱解不出原图。标题、说明行、按钮与 `schema` 2.0 都符合。`run-012-TC-FEISHU-002-2.png` |
| TC-FEISHU-003 | 通过 | 更换 → 群自定义机器人 → 确认框「换接法会清除已设置的群」（焦点在框内）→ 清除并保存；默认群「未设置：没有单独指定群的店不推」，每行「设置」；example.com 地址 422 `validation`、标红且焦点在地址框；改为飞书地址后「售后处理群 · …d3c4」有修改、清除、发测试卡片；测试卡片发出；泰国群 bad 地址测试 502 `platform`，提示含 19021，底部「最近一次推送失败（… · 泰国群）」；接口只有 `webhookHint` d3c4，SQL `0\|0`；断开提示并回到表单，`connection`、`defaultTarget` 为 null |
| TC-FEISHU-005 | 通过 | 推送 200；30 秒内最上面一张「待认领 · Demo TikTok TH」，发往客服群、橙色、已发出（替身）；正文 AI 总结、「平台 TikTok Shop · 泰国　买家 …　已等 不到 1 分钟」、无转人工原因、「买家 时:分　Halo, kamera …」与「译文：[译文] …」；认领与打开会话链接的 `m` 等于 `/me` 的 `active.merchantId`；待认领列表点开的地址与链接里的会话 ID 相同 |
| TC-FEISHU-006 | 通过 | hello 1 → C 的待认领卡；hello 2 等 30 秒无新卡、计数 1；认领并结束；hello 3 新段进入待认领，30 秒内第二张卡，计数 2、段 2 |
| TC-FEISHU-007 | 失败 | 第 3 步：「最近对话」里「买家 01:23　我要人工客服」下方多了一行「译文：[Shopee 机翻] 我要人工客服」，用例要求中文消息不放译文行：模拟 Shopee 推送带的平台机翻被原样放进卡片。第 1、2 步通过（待认领、命中转人工关键词，标题与「转人工原因」行符合）。`run-012-TC-FEISHU-007-3.png` |
| TC-FEISHU-008 | 通过 | TH 店铺群优先：卡发往「泰国站客服（替身）」且在最上面；删默认群后 SG（shadow）会话进待认领，30 秒无卡、投递记录 0；恢复默认群、关「待认领时推送」提示已关闭，SG 新会话 30 秒无卡 |
| TC-FEISHU-009 | 通过 | remind 后 30 秒内最上面一张「待认领超时 · Demo Shopee MY」，红色、「已等 11 分钟」「提醒时长 待认领超过 10 分钟」，认领链接含 C；再 remind 等 30 秒无第二张，超时卡计数 1 |
| TC-FEISHU-013 | 通过 | 未登录打开 L 到登录页，`next=/wb/<C>?claim=1&m=…`；Mei 登录后回到 `/wb/<C>`，提示已认领、「我处理中」、地址无 `claim` 与 `m` |
| TC-FEISHU-011 | 通过 | 打开 L1：提示已认领、「我处理中」、输入框可用、地址去掉 `claim` 与 `m`；刷新无提示，审计 1；再开 L1 无提示，审计仍 1；打开 L2：D 仍待认领、有「认领」、无提示 |
| TC-FEISHU-012 | 通过 | L1（Mei 已认领）：owner 提示「已由 Mei Lin 认领」、头部「Mei Lin 处理中」、没有发认领请求；Nur 认领 409 conflict、提示同上，对话栏「Mei Lin 已认领这个会话」与「回到会话列表」；Nur 开 L2「找不到或已删除」、无已认领提示；C3 结束后开 L3 提示「会话已经结束」、不能发送 |
| TC-FEISHU-015 | 通过 | Nur 打开 L：提示「已切换到「Other Store」」与「已认领」，账号卡 Other Store，F「我处理中」；`/me` 为 Other Store；Arif 打开 L：「看不到这个会话」与「回到会话列表」，账号卡仍 Demo Store |
| TC-FEISHU-010 | 通过 | X 发文字、图片、商品卡、订单卡后待认领、无卡；满 5 分钟 remind 后最上面「待认领超时 · Demo TikTok TH」；最近对话 4 条都是买家：「Saya mau tanya」与「译文：[译文] Saya mau tanya」、「[图片]」下方一张图片、「[商品] ชุดผ้าขนหนูใยไผ่ 3 ผืน」、「[订单] 576454314991934272 · 待发货」；改用自定义机器人后 Y 发图片，待认领卡里「[图片] 在 Shopilot 查看」链到 Y 的会话，卡片 JSON 没有 `img` |
| TC-CONV-037 | 通过 | 改为「不提醒」提示已保存；remind 后 Arif 通知 26 → 26 |
| TC-AUTH-014 | 通过 | 保存「管理员两步验证」（确认框点保存）后提示已保存、A 被带到 `/account/security`；admin2 登录进 `/account/security`，点「工作台」仍停在该页；接口 403 `two-factor-required`；开启前列出 10 个备用码，验证后提示已开启并回到 `/wb` 会话列表；错误验证码提示「验证码不正确。」、接口 401 `invalid-login`；正确码进 `/wb`；A 开启后打开全员两步验证，agent 登录进 `/account/security`，打开 `/wb` 被带回 |
| TC-FEISHU-014 | 通过 | L1 → 登录页 → admin2 登录到 `/account/security`，`next=/wb/<C1>?claim=1&m=…`，顶部「「Demo Store」要求开启两步验证」；开启后提示已开启，回到 `/wb/<C1>`、提示已认领、「我处理中」；退出后开 L2，输密码后出现两步验证，填码后回到 `/wb/<C2>`、提示已认领 |
| TC-MOCK-002 | 通过 | `MOCK_PLATFORM=0` 重启后 `/api/health` 含 `"service":"shopilot"`；`/mock/simulator`、`/api/mock/sim/state`、`/mock/shopee/sg/api/v2/public/get_shops_by_partner`、`/dev/outbox`、`/api/dev/outbox`、`/api/dev/feishu` 都 404；改回 1 重启后 `/mock/simulator` 标题「Shopilot 模拟器」 |
| TC-AI-002 | 通过 | `AI_MODE=deepseek`：订单推进到 SHIPPED；推送 200；20 秒内草稿写明订单号、承运商 SPX Express (MY) 与最新轨迹（Shah Alam Hub），置信度 0.9；认领并发送后买家视图收到同文；`run-012-TC-AI-002-2.json` |
| TC-SHOP-024 | 待人工 | 执行者为人工，AI 未执行 |
| TC-FEISHU-016 | 待人工 | 执行者为人工（真实飞书），AI 未执行；开发期间不向真实飞书群发消息 |
