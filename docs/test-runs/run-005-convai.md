# RUN-005 · convai 组结果

- 执行：AI（Playwright + 本机 Edge headless、curl / fetch），2026-10-14 00:23–01:58（Asia/Kuala_Lumpur，与本机时区相同）；01:22–01:52 因额度中断，恢复后先核对全局设置（均为基线值）再续跑。
- 环境：§3 本地行，主会话重建的库，`AI_MODE=stub`、`MOCK_PLATFORM=1`；01:22 之前与 auth、ordtkt 组并行，续跑时库里只有本组。未执行 db:reset / db:seed，未重启 dev server，未改 .env。
- 手段：UI 步骤用 Playwright + Edge（接口登录后注入 cookie，HMR 刷新过滤）；接口用 fetch（与 §3「curl 会话」同样的登录与请求头，同一账号复用 cookie）；模拟器动作走 `POST /api/mock/sim/{action}`，读数走 `GET /api/mock/sim/state` 与 mock_* 表；替身走 `/api/dev/ai-stub`，故障走 `/api/mock/sim/faults`。
- 范围：`TC-CONV-*`（不含 002、003、032）、`TC-AI-*`（不含 002）、`TC-RCP-*`，共 71 条。
- 计数：通过 69，失败 0，待人工 2，阻塞 0，跳过 0。
- 新买家一律以 `convai5-` 开头。起跑时为商户时区周三 00:23，处在工作时间（09:00–18:00）之外；用例要求的「工作时间外」与当时状态一致，仍按 §3 在页面关掉周三再改回。
- 证据：本轮没有失败或阻塞项，`docs/test-runs/` 下没有新增本组证据文件。

## 全局设置的改动与还原

| 时间 | 改动（用例） | 还原 |
| --- | --- | --- |
| 00:51 | 新增快捷回复「发货时间」（CONV-035） | 用例结束即删除，快捷回复为空 |
| 00:52:20–00:52:29 | 待认领提醒「不提醒」（CONV-037） | 页面改回 10 分钟 |
| 00:54:58–00:55:05 | 售中提示词加「【售中测试标记】」、品牌语气「【语气标记】…」（AI-003） | 品牌语气清空，售中「恢复默认」 |
| 00:56:48–00:56:51 | Demo Shopee MY shadow / shadow（AI-005） | 接口改回 assist / assist |
| 01:03:01–01:03:06 | `pnpm scenario usage-exhausted`（AI-021） | SQL 还原 usage_period（quota 2000、topup 0、drafts_used = 本期实际草稿数、alerts_sent []）与 subscription（stop、阈值 80/100、接收人林晓、站内）；窗口内没有别组会话因用量转人工 |
| 01:03:39–01:03:48 | `pnpm scenario usage-near-quota`（AI-022） | 同上 |
| 01:06:30–01:06:37 | 转人工关键词加到 30 个（RCP-004） | 接口还原为默认 7 个 |
| 01:07:10–01:07:20 | 置信度阈值 0.95（01:07:10–01:07:14）、0.50（RCP-006） | 页面改回 0.60；窗口内没有别组会话转人工 |
| 01:07:50 | 接待时限 120（RCP-007 第 3 步） | 同一秒用接口改回 15 |
| 01:08:29–01:08:36 | 售前提示词「售前版本 A / B」（RCP-008） | 「恢复默认」 |
| 01:09:09–01:09:31 | 售中提示词 6,000 字与 v2–v11（RCP-009） | 「恢复默认」 |
| 01:10:41–01:10:52 | 开票时限 1 个工作日（RCP-010） | 页面改回 2 个工作日 |
| 01:11:40–01:11:47 | 退货退款提醒截止前 12 小时（RCP-011） | 页面改回截止前 6 小时 |
| 01:11:49–01:11:59 | 已解决后不自动关闭（RCP-012） | 页面改回 7 天后 |
| 01:13:29–01:14:13 | 固定为工作时间外：关周三（AI-007、015、017、020，RCP-005 第 1 步） | 页面重新打开周三 09:00–18:00 |
| 01:16:00–01:16:11、01:16:45–01:16:56 | 固定为工作时间内（周三 00:00–23:59）+ 接待时限 10（CONV-006 两次） | 接口还原周三 09:00–18:00、接待时限 15 |
| 01:18:00–01:18:26 | 固定为工作时间内（CONV-008、015、018、024、034 的入站，RCP-001，RCP-005 第 2–3 步）；其中 Demo TikTok MY auto / auto 01:18:04–01:18:05，节假日 2026-10-14 01:18:09–01:18:14 | 接口还原周三 09:00–18:00、节假日空；Demo TikTok MY 改回 assist / auto |
| 01:56:38–01:56:44、01:57:59–01:58:05 | Demo TikTok MY off / off（RCP-003 两次） | 接口改回 assist / auto，坐席接单恢复 true |
| 全程 | AI 替身每次只设一次性（sticky=false），设完立即发消息并确认被本组会话消费；故障注入只用 once | 结束时替身 normal、sticky=false；faults 为空 |

01:58 复核：四店模式、工作时间与节假日、关键词、阈值、待认领提醒、接待时限、提示词（三段内置默认、品牌语气空）、工单类型与自动关闭、快捷回复（空）、用量额度与提醒配置、坐席接单均与起跑时一致；usage_period drafts_used 与本期实际草稿数相同。

## 结果

| 用例 | 结果 | 现象 / 证据 | 备注 |
| --- | --- | --- | --- |
| TC-CONV-001 | 通过 | 1 带 `Authorization: 0000` POST 返回 401 `/errors/signature`；2 owner 打开 convai5-conv001，时间线只有「hello conv001」，没有「签名错误测试」 | |
| TC-CONV-004 | 通过 | 1 owner `/wb` 分组：待认领 6、AI 草稿 4、我处理中（0，不显示数字）、同事处理中 10、已结束 3；侧栏工作台子项数字相同；2 `counts` {queue 6, ai 4, mine 0, team 10, done 3} 与页面一致；3 平台下拉（全部平台 / Shopee / TikTok）选 TikTok 后五组共 8 行，每行都是 TikTok；4 店铺选 Demo TikTok MY 后五组 4 行，每行店铺都是 Demo TikTok MY | |
| TC-CONV-005 | 通过 | 前置 convai5-conv005 发「在吗」，Nur 点「认领」并发「您好」；1 「我处理中」行「我方：您好 · Nur Aisyah 处理中」，没有已等时长；2 B 发「订单什么时候发」后 7.1 秒该行移到顶部，显示「买家再回复 · 等待不到 1 分钟」；3 2 分钟后刷新显示「买家再回复 · 等 2 分钟」；4 Nur 回复「订单今天发出」后行显示「我方：订单今天发出 · Nur Aisyah 处理中」，没有已等时长（接口 `waitingSinceSec` 为 null） | |
| TC-CONV-006 | 通过 | 前置：固定为工作时间内（周三 00:00–23:59），接待时限改为 10 分钟，`pnpm scenario unclaimed-11m` → C；1 Nur 的「待认领」第一行是 C，显示「等 11 分钟 · 超过接待时限」，文字为警示色 rgb(122, 94, 0)（接口 overdue true）；2 改为工作时间外后刷新：C 显示「待认领 · 等 11 分钟」，普通色 rgb(107, 91, 81)（overdue false） | 第一次执行（C = scenario.66352f2a）时 C 排第 3：列表按最近消息倒序，本组 TC-RCP-006 留下的两个待认领会话更新，排在 C 前面；把这两个会话由 owner 认领后用新 C（scenario.69babe8e）整条重跑通过。两次窗口 01:16:00–01:16:11、01:16:45–01:16:56，结束后用接口还原周三 09:00–18:00、接待时限 15 |
| TC-CONV-007 | 通过 | 前置 convai5-conv007b，Nur 认领并回复，建「内部确认」工单 T-1006（201）；1 「我处理中」行显示「工单 T-1006 · 剩 41 小时 26 分」；2 右栏工单小节列出「T-1006 剩 41 小时 26 分」，点击后进入 `/tickets/01a1361c-…0a04`（即 T-1006） | 「建工单」入口是会话头部的图标按钮，右栏工单小节只有「全部工单」链接（与 RUN-002 相同） |
| TC-CONV-008 | 通过 | 前置：convai5-conv008（Demo TikTok MY）下单 576454620472038522 推进到 IN_TRANSIT；工作时间内依次发「Is my order shipped?」、一张图片、订单卡；owner 认领、回复后从「发卡片」→「退货退款卡」选该单商品发出（201）；Shopee 买家 convai5-conv008b 发「Bila sampai?」；1 点图片缩略图弹出大图（640×480）；时间线依次为文字（下方「译 · Shopilot [译文] Is my order shipped?」）、图片、订单卡（576454620472038522、MYR 47.80、「当前：运输中（IN_TRANSIT）」）、本方回复、本方「退货退款 · 订单 576454620472038522」卡；2 右栏有买家名 convai5-conv008、订单 576454620472038522、工单小节；3 B2 的消息下方「译 · Shopee [Shopee 机翻] Bila sampai?」 | 入站消息都在工作时间内窗口（01:18:00–01:18:26）发出；认领、发卡与查看在窗口关闭后做（不受工作时间影响）。stub 译文为「[译文] 原文」。卡片弹层的确认按钮是「发送退货退款卡」，用例写「发送卡片」 |
| TC-CONV-009 | 待人工 | | 执行者 = 人工 |
| TC-CONV-010 | 待人工 | | 执行者 = 人工；本轮看到的文案差异可一并核对：员工入口「转交给同事」、组长入口「改派给其他同事」（用例与 ui-interactions 为「转交给其他客服」「分配给客服」），结束按钮「结束会话（…）」，卡片弹层确认按钮「发送订单卡」等 |
| TC-CONV-011 | 通过 | Nur 在「已结束」打开 convai5-conv019：没有输入框（textarea 0 个），头部只有「建工单」「买家与订单」，没有认领、结束会话、转交；对话栏头部「Demo Shopee MY · 已结束」，时间线末尾「会话已结束。买家再发消息时会开新的会话段…」 | |
| TC-CONV-012 | 通过 | 前置 convai5-conv012（替身低置信，待认领），Nur、Mei 各开一个浏览器；1 两边同时点「认领」：Nur 200（处理中），Mei 409 `/errors/conflict`，`extra.claimedBy` 为 Nur Aisyah；2 Mei 页面 toast「没有认领成功 Nur Aisyah 已经认领了这个会话。」，对话栏显示「Nur Aisyah 已认领这个会话」「同事处理中的会话只有组长和管理员能查看…」与「回到会话列表」，没有右栏；3 Nur 的「我处理中」有 C，Mei 的没有 | |
| TC-CONV-013 | 通过 | 前置 convai5-conv013（替身低置信，进待认领），v = 2；1 `{"version":3}` 返回 409 `/errors/conflict`，`extra` 带 claimedBy null、version 2、handlingState awaiting_human；2 `{"version":2}` 返回 200，claimedBy 为 Nur 的 membership；3 重发返回 200 | 替身一次性，已被本用例消费 |
| TC-CONV-014 | 通过 | 前置 convai5-conv014，Nur 认领并回复，建「内部确认」T-1014（负责人 Nur Aisyah）；1 Nur 点「转交给同事」，对话框「转交会话」列出 Arif Rahman、Mei Lin、林晓、陈卓等同事，勾选项「关联的 1 张未结工单一并转交（T-1014）」默认已勾；2 选 Mei Lin 点「转交」，对话框关闭，会话从 Nur 的「我处理中」消失；3 Mei 的「我处理中」有该会话（行上「工单 T-1014」），通知弹层新增「Nur Aisyah 把会话和 1 张工单转给了你 · convai5-conv014」；4 owner 打开 T-1014，负责人 Mei Lin，时间线「Nur Aisyah 改派给 Mei Lin · 原负责人 Nur Aisyah」 | 入口文案是「转交给同事」，用例写「转交给其他客服」；同事列表另有 auth 组新建的 Auth Two、Nur New、Run5 Mei、Used Link；通知标题没有写工单号，只写「1 张工单」 |
| TC-CONV-015 | 通过 | 前置：工作时间内向 Demo TikTok MY 新买家 convai5-conv015 发一条，Arif 认领并回复；1 Arif 点「转交给同事」，对话框「接手人」只列林晓 · 管理员、陈卓 · 管理员，没有 Nur Aisyah、Mei Lin；2 `members/options?shopId=<Demo TikTok MY>` 返回 Arif Rahman、林晓、陈卓；3 assign 给 Nur 返回 422 `/errors/validation`（「接手人必须是负责该店的启用成员。」） | 入站在工作时间内窗口发出，后续步骤在窗口关闭后做；入口文案「转交给同事」，用例写「转交给其他客服」 |
| TC-CONV-016 | 通过 | 前置 convai5-conv016 由 Mei 认领并回复；1 Nur 调 assign 返回 404 `/errors/not-found`；2 owner 打开该会话，头部「Mei Lin 处理中」，库里 claimed_by 仍为 Mei | |
| TC-CONV-017 | 通过 | 前置 convai5-conv017 由 Nur 认领并回复；1 Arif「同事处理中」行「Nur Aisyah 处理中」；2 Arif 打开会话点「改派给其他同事」，对话框「改派会话」选 Mei Lin 点「改派」，头部变为「Mei Lin 处理中」，时间线「Arif Rahman 把会话转交给 Mei Lin」；3 Mei 的「我处理中」有该会话，Nur 的没有 | 按钮文案与用例不一致：组长的入口是「改派给其他同事」、确认按钮「改派」，用例与 ui-interactions 写「分配给客服」「转交」。对话框里还列出 auth 组新建的成员（Auth Two、Nur New、Used Link） |
| TC-CONV-018 | 通过 | 前置：工作时间内向 Demo TikTok MY 新买家 convai5-conv018 发一条，Arif 认领并回复，建「内部确认」T-1061（S = open）；1 点结束按钮，对话框写「同时结束 TikTok 上的这段会话…」与「这个会话还有 1 张未结工单（T-1061），结束会话不影响工单。」；2 点「结束会话」后会话 closed，头部「Demo TikTok MY · 已结束」，没有输入框；3 模拟器该买家的 TikTok session（7494222612215736413）sessionOpen false；4 T-1061 仍为 open | 按钮文案「结束会话（同步结束 TikTok 会话）」，用例写「结束会话：同时调用 TikTok End Session」；入站在工作时间内窗口发出 |
| TC-CONV-019 | 通过 | 前置 convai5-conv019，Nur 认领并回复；1 结束按钮 aria-label 与悬停提示为「结束会话（Shopee 没有结束会话接口，只在 Shopilot 内结束）」；2 确认对话框「结束会话」后会话 closed，出现在「已结束」；3 GET 取 version 3，再 close 返回 200 `{"handlingState":"closed","version":3}` | 文案与用例只差分隔符（用例「结束会话：…」，界面「结束会话（…）」），判通过，同 RUN-002 |
| TC-CONV-020 | 通过 | 前置 convai5-conv020；1 201，M = 01a13621-9cda-…；2 原样重发 201，`message.id` 仍为 M；3 买家视图「幂等测试」1 条；4 Nur 刷新后时间线「幂等测试」1 条 | `clientRequestId` 用 `tc-conv-020-run5`，避免与往轮重复 |
| TC-CONV-021 | 通过 | 前置 convai5-conv021；1 「发图片」选 2 MB PNG，上传 201，时间线出现该图片「已发送」（接口 sendStatus sent）；2 买家视图收到 1 条卖家图片消息 | |
| TC-CONV-022 | 通过 | 前置 convai5-conv022（Nur 处理中）；1 选 11 MB JPG：toast「图片没有发出 这张图片 11.0 MB，超过 10 MB 上限。」，没有发出；上传接口 413 `/errors/too-large`；2 选 GIF：toast「图片没有发出 只支持 JPG、PNG、WebP，不超过 10 MB。」；上传接口 415 `/errors/unsupported-type`；3 选 10,485,760 字节 PNG，上传 201，图片发出（买家视图收到图片） | 前两步页面在本地校验后直接拦下，不发上传请求；413、415 由同一账号直接调 `POST /api/v1/files` 得到 |
| TC-CONV-023 | 通过 | 前置 convai5-conv023；1 输入框填入 2,001 字，发送按钮不可用，输入栏显示「超出 1 字，最多 2,000 字」与「2,001 / 2,000」；2 接口发 2,001 字返回 422 `/errors/validation`；3 删到 2,000 字后发送按钮可用，发出后买家视图收到完整的 2,000 字 | |
| TC-CONV-024 | 通过 | 前置：convai5-conv024（Demo TikTok MY）下单 576462239178961653 推进到 IN_TRANSIT，工作时间内发一条，owner 认领并回复；1 「发卡片」弹层有订单卡、物流卡、退货退款卡、商品卡，商品卡不可选，写明「商品卡不可用：店铺没有授予商品读取权限。」；输入栏另有「发优惠券」按钮；2 订单卡选该单发送（201），买家视图收到订单卡 576462239178961653；3 物流卡选该单发送（201），买家视图收到物流卡 576462239178961653；4 「发优惠券」弹层列出「RM5 off min. spend RM50」「10% off Tumblers」；5 选第一张点「发送优惠券」（201），买家视图收到优惠券卡「RM5 off min. spend RM50」 | 弹层的确认按钮是「发送订单卡」「发送物流卡」，用例写「发送卡片」；入站在工作时间内窗口发出，发卡在窗口关闭后做 |
| TC-CONV-025 | 通过 | 前置 convai5-conv025；1 输入栏只有发图片、快捷回复、发送前翻译、发送，没有发卡片与优惠券入口；2 order_card 返回 409 `/errors/not-allowed`（「Shopee 店不支持发送这种卡片。」）；3 coupons 返回 409 `/errors/not-allowed`（「Shopee 店不支持在聊天里发优惠券。」） | |
| TC-CONV-026 | 通过 | 前置 convai5-conv026；1 故障注入 Demo Shopee MY 卖家发送 once / error，`GET faults` 显示该条；2 发送返回 502 `/errors/platform`，`extra.platformCode` = error_server；toast「发送失败 Shopee 返回错误（error_server）：Something wrong. Please try later.」，消息下方「发送失败」、同一说明与「重试」；买家视图没有这条；3 点「重试」后「已发送」，买家视图 1 条；4 对该消息再调 retry 返回 409 `/errors/conflict` | 故障为 once，已消费，faults 为空 |
| TC-CONV-027 | 通过 | 前置 convai5-conv027（Nur 处理中）；1 故障注入 once / timeout，面板列出该条；2 发送 10.1 秒后返回 504 `/errors/platform-timeout`，toast「发送失败 Shopee 10 秒内没有响应，结果未知，请先刷新确认再决定是否重试。」；3 刷新后该消息「发送失败」，说明为同一超时原因，带「重试」 | 故障为 once，已消费 |
| TC-CONV-028 | 通过 | 前置 convai5-conv028（assist），Nur 认领、回复后结束会话；1 B 发「还有一个问题」，8.7 秒内该会话在「AI 草稿」第一行（草稿待审），不在「已结束」；2 时间线上一段末尾有「Nur Aisyah 结束了会话 · 00:46」分段标记，新草稿「您好！关于「还有一个问题」…」置信度 0.85；claimedBy 为空，头部无处理人，历史会话 2 | |
| TC-CONV-029 | 通过 | 前置 convai5-conv029（Demo TikTok TH，off / off），Mei 认领、回复后结束会话；1 B 再发一条，8.7 秒内出现在 Mei 的「待认领」第一行；2 打开后没有草稿区，头部「Demo TikTok TH · 待认领 · 店铺未开 AI」（`handoffReason` shop_off） | |
| TC-CONV-030 | 通过 | 前置 convai5-conv030 下单 2610132K0LYGJQ 并推进到 SHIPPED（镜像同步为 SHIPPED）；1 B 发「什么时候到」，推送 HTTP 200；2 Nur 打开，右栏「本段阶段 售中」，「开段时自动判定：订单 2610132K0LYGJQ SHIPPED」 | 第一次执行脚本在下单后查镜像时写错列名中止，未发消息，续跑同一买家 |
| TC-CONV-031 | 通过 | 前置为 TC-CONV-030 的 convai5-conv030（售中），Nur 认领并回复；1 阶段下拉（售前 / 售中 / 售后 / 未确认）选「售后」，显示「售后 · 手动：Nur Aisyah 手动改判」（stageSource manual）；2 `/settings/audit` 有「Nur Aisyah 把 convai5-conv030 的会话段从售中改为售后」；3 Nur 结束会话，B 再发一条，新段「售中 · 开段时自动判定：订单 2610132K0LYGJQ SHIPPED」（stageSource auto） | 来源文案是「手动」，用例写「人工」 |
| TC-CONV-033 | 通过 | 1 convai5-conv033a（无订单）：「售前 · 开段时自动判定：本店无订单」；2 convai5-conv033b 下单 2610135KTSBTUS 推进到 COMPLETED 后申请退货 26101303B0FCE16（REQUESTED），再发一条：「售后 · 开段时自动判定：退货 26101303B0FCE16 REQUESTED」；3 convai5-conv033c 下单不付款后买家申请取消，订单 CANCELLED（镜像同步），再发一条：「售前 · 开段时自动判定：近 60 天无进行中订单」 | B3 的 CANCELLED 用「下单不付款 + 买家申请取消」构造（与 RUN-002 相同）；B2 的退货申请同时自动建了一张退货退款工单 |
| TC-CONV-034 | 通过 | 前置：工作时间内向 Demo TikTok MY 新买家 convai5-conv034 发「พัสดุของฉันอยู่ที่ไหน」；1 owner 打开，买家消息下方「译 · Shopilot [译文] พัสดุของฉันอยู่ที่ไหน」；2 点「认领」，输入「您的包裹今天发出」，「发送前翻译」下拉选「译成泰语」后发送（201），时间线该条显示「[译文] 您的包裹今天发出」与「原文 您的包裹今天发出」；3 买家视图收到「[译文] 您的包裹今天发出」，与原文不同 | stub 译文格式为「[译文] 原文」；入站在工作时间内窗口发出。第一次执行认领后脚本按 button 角色找翻译下拉（实际是 combobox）而中止，续跑同一会话 |
| TC-CONV-035 | 通过 | 前置：owner 在 `/reception/prompts`「新增快捷回复」建「发货时间」（售中），toast「已新增「发货时间」」；convai5-conv035 下单 261013Z8YZFJ0L 推进到 SHIPPED 后发消息，段为售中，Nur 认领并回复；1 「快捷回复」弹层写「当前会话段：售中」，选中的分组为「售中」，列出「发货时间」；2 点后弹层关闭，输入框为「订单会在 1–2 个工作日内发出。」，买家视图没有新消息；3 再开弹层切「全部」，列出全部快捷回复（库里只有这 1 条） | 用例结束后已删除这条快捷回复（00:51），库里快捷回复恢复为空 |
| TC-CONV-036 | 通过 | 前置 `pnpm scenario unclaimed-11m` → C = scenario.46ac38da；1 `pnpm job unclaimed.remind` 退出码 0；2 Arif 新增 1 条「scenario.46ac38da 待认领已超过 10 分钟」（链接 C），通知弹层第一条即此；Nur 没有新增；3 再跑 job 退出码 0，Arif 没有新增 | |
| TC-CONV-037 | 通过 | 前置 `pnpm scenario unclaimed-11m`（scenario.fe07d849）；1 owner 在 `/reception/hours` 待认领提醒选「不提醒」点「保存」，toast「已保存，下一条入站消息起生效」（库里 unclaimed_remind_minutes 为 NULL）；2 `pnpm job unclaimed.remind` 后 Arif 没有新增通知 | 全局设置窗口 00:52:20–00:52:29，随后在页面改回「10 分钟后通知组长」并保存 |
| TC-CONV-038 | 通过 | 前置 `pnpm scenario conversation-idle-73h` → C = scenario.7392bd2d；1 `pnpm job conversation.idle_close` 退出码 0（`ok: true`）；2 C 在 Nur 的「已结束」，不在「我处理中」；3 时间线末尾「72 小时无新消息，会话自动结束 · 00:52」 | |
| TC-CONV-039 | 通过 | 前置 convai5-conv039（替身低置信，待认领），v = 2；1 Nur 页面头部有「认领」，没有结束按钮；2 close 返回 403 `/errors/forbidden`（「只能结束自己处理中的会话。」）；3 Arif 点「结束会话（Shopee 没有结束会话接口…）」并在对话框点「结束会话」，会话 closed，出现在 Arif 的「已结束」 | |
| TC-CONV-040 | 通过 | 前置：`create_buyer` 给 Demo TikTok TH 建 convai5-conv040，连续 62 次 `buyer_message`（1.8 秒内发完，入库 62 条，按秒分布 37 / 22 / 3）；会话在 owner 的「待认领」；1 打开后时间线 50 条（同秒 13 到同秒 62），顶部有「查看更早的消息」；2 点击后时间线 62 条，同秒 01 到同秒 62 各 1 次、顺序正确，按钮消失；3 第一次 GET 50 条、`hasMore` true，取第一条 id 作 `before` 再 GET：12 条买家消息（同秒 01 到 12）、`hasMore` false，与第一次的 id 无重复 | |
| TC-AI-001 | 通过 | 记 U = 5、辅助草稿 A0 = 5（`/billing`「已用 5 次」）；1 convai5-ai001c 发「我的包裹到哪了」，推送 code 10 HTTP 200；2 0.8 秒内「AI 草稿」3 → 4，列表行「Demo Shopee MY · 草稿待审」；3 草稿区正文 X「您好！关于「我的包裹到哪了」，我们已经收到，会尽快为您处理。」、「置信度 0.85」，有「认领并发送」「改后发送」「忽略」；4 草稿区消失，时间线本方 X「已发送」，会话在「我处理中」；5 买家视图卖家消息 1 条，正文 X；6 10 秒后刷新 X 仍 1 条（页面与接口）；7 `/billing`「已用 6 次」，辅助草稿 6 / 6 | 窗口内 Demo Store 只有本用例的 1 份草稿。前两次执行（convai5-ai001、convai5-ai001b）是脚本问题：列表行链接选择器写错、草稿未出现就截了图，按新买家 convai5-ai001c 整条重跑 |
| TC-AI-003 | 通过 | 前置：convai5-ai003 下单 261013JXP3XZSW 推进到 SHIPPED；owner 把售中提示词改为以「【售中测试标记】」开头、品牌语气改为「【语气标记】亲切简洁」，保存 toast「已保存，下一条入站消息起生效」；1 B 发「我的包裹到哪了」，0.8 秒出现草稿；2 最近一次请求：system 以「【售中测试标记】」开头，护栏 G 位于 system 末尾；user 内容含 brand_voice「【语气标记】…」、order_facts（261013JXP3XZSW、SHIPPED、物流轨迹）与买家原文；没有检索或资料引用段 | 「知识」只出现在护栏第 2 条的禁用词里。全局设置窗口 00:54:58–00:55:05：之后品牌语气清空、售中「恢复默认」（历史版本多 1 条） |
| TC-AI-004 | 通过 | 1 convai5-ai004 依次发「第 01 条」到「第 25 条」（间隔约 1 秒），25 条推送均 HTTP 200；2 最后一份草稿（针对「第 25 条」）出现后，最近一次请求的 conversation 共 20 条，为第 06 条到第 25 条，不含第 01 到 05 条 | |
| TC-AI-005 | 通过 | 前置：owner 在 `/reception` 把 Demo Shopee MY 改为 shadow / shadow，toast「已保存 1 家店，下一条入站消息起生效」；S0 = 0；1 convai5-ai005 发「这款毛巾有蓝色吗」，Nur 在「待认领」打开：头部「待认领 · 影子模式」，没有草稿区和影子回复；2 Nur 的 GET 返回 200，`shadowDrafts` null、`draft` null；3 Arif 打开：触发消息下方有折叠的「AI 影子回复（未发送）· 置信度 0.85」，展开后显示正文，没有发送按钮；4 owner 同第 3 步；5 `/billing` 影子生成 0 → 1（「1 / 58」）；6 买家视图没有卖家消息 | Demo Shopee MY 的 shadow 窗口 00:56:48–00:56:51（影子草稿生成后立即用接口改回 assist / assist） |
| TC-AI-006 | 通过 | 前置 R0 = 当时的最近一次请求，U = 59；1 convai5-ai006 向 Demo TikTok TH 发一条，Mei 的「待认领」有该会话；打开后没有草稿区，头部「Demo TikTok TH · 待认领 · 店铺未开 AI」（shop_off）；2 本期已用仍为 59，最近一次请求与 R0 相同 | 窗口内 Demo Store 没有任何新草稿；第 2 步的已用次数读的是 `GET /api/v1/billing`（与 `/billing` 页面同一数据） |
| TC-AI-007 | 通过 | 前置：固定为工作时间外（关周三）；1 convai5-ai007（Demo TikTok MY）发「我的包裹到哪了」，1.6 秒后买家视图收到 1 条卖家回复；2 owner 打开：该回复发送方标「AI」，头部「Demo TikTok MY · AI 接待中」，没有处理人；3 `handlingState` 为 bot；4 「AI 草稿」分组有该会话（「AI 接待中」）；5 `/settings/audit` 工作台有「AI 自动回复 convai5-ai007」（data：mode auto、disposition sent） | 工作时间外窗口 01:13:29–01:14:13；审计页面行只显示摘要，模式与处置取自同一条记录的 data |
| TC-AI-008 | 通过 | 替身「非 JSON 文本」后 convai5-ai008 发一条，0.8 秒进待认领；Nur 的「待认领」有该会话，头部「待认领 · 模型出错」（model_error），没有草稿区 | 替身一次性，已消费 |
| TC-AI-009 | 通过 | 替身「超时」后 convai5-ai009 发一条，出现在 Nur 的「待认领」，没有草稿；头部「待认领 · 模型超时」（timeout） | 替身一次性，已消费 |
| TC-AI-010 | 通过 | 前置 E0 = 0（`/dashboard`「本月」改后发送 0），convai5-ai010 的草稿 X「您好！关于「hello ai010」…」；1 Nur 点「改后发送」，输入框填入 X；2 末尾加「（已核实）」后发送，买家视图收到「X（已核实）」；3 `/settings/audit` 有「Nur Aisyah 改后发送了 AI 草稿（编辑距离 5）」（模块工作台）；4 看板改后发送 0 → 1 | |
| TC-AI-011 | 通过 | 前置 I0 = 0，convai5-ai011 出现草稿；1 Nur 点「忽略」，草稿区消失，会话在「待认领」，头部「待认领 · 人工转交」（manual）；2 看板忽略 0 → 1 | |
| TC-AI-012 | 通过 | 前置 convai5-ai012 发「第一问」，D1 生成于 01:01:06；1 B 发「第二问：能改地址吗」，推送 HTTP 200；2 Nur 打开时草稿区只有 1 份草稿「您好！关于「第二问：能改地址吗」…」，生成于 01:01:08（晚于第 1 步），没有 D1（库里 D1 为 superseded）；3 最近一次请求的最后一条买家消息与 `latest_buyer_message` 都是「第二问：能改地址吗」 | |
| TC-AI-013 | 通过 | 前置 `pnpm scenario draft-25h` → C = scenario.6ea6943d，X0 = 0（看板「过期未处理 0」）；1 打开 C，草稿区显示草稿「Hi! Yes, the blue one is in stock.」；2 `pnpm job draft.expire`（ok）后刷新，草稿区不再显示（库里草稿 expired）；3 看板过期未处理 0 → 1 | |
| TC-AI-014 | 通过 | 前置 convai5-ai014 的草稿 D；1 ignore 返回 200 `{"ok":true}`；2 再发 200；3 带 draftId 发送返回 409 `/errors/conflict`（「这份草稿已经处置或过期。」，`extra.draftStatus` ignored） | |
| TC-AI-015 | 通过 | 前置：工作时间外，U = 72；1 convai5-ai015 发「我要投诉」，买家视图收到 1 条「感谢您的留言，客服同事会尽快为您处理。」；2 Arif 的「待认领」有该会话（handoff keyword），通知新增 1 条「convai5-ai015 需要人工接待 原因：命中转人工关键词」；3 本期已用仍为 72 | 工作时间外窗口同上 |
| TC-AI-016 | 通过 | 替身「低置信 0.4」后 convai5-ai016 发一条；1 Nur 的「待认领」有该会话，没有草稿区，头部「待认领 · AI 置信度低」，时间线「转人工：置信度低于阈值」（low_confidence）；2 买家视图没有卖家消息 | 替身一次性，已消费 |
| TC-AI-017 | 通过 | 前置：工作时间外，替身低置信 0.4；1 convai5-ai017 发「这个能用在 Mac 上吗」，买家视图只有 1 条安抚句；2 Arif 的「待认领」有该会话（low_confidence），行上「待认领 · 等待不到 1 分钟」，1 分 30 秒后为「待认领 · 等 1 分钟」（`waitingSinceSec` 8 → 92，安抚句没有清零等待） | 工作时间外窗口同上；替身已消费 |
| TC-AI-018 | 通过 | convai5-ai018 只发一张图片；Nur 的「待认领」有该会话（行预览「[图片]」），没有草稿，头部「待认领 · 非文本消息」（non_text） | |
| TC-AI-019 | 通过 | 面板「要求转人工」的 `reason` R = human_request；convai5-ai019 发「我要找真人」后进 Nur 的「待认领」，没有草稿，头部「待认领 · 买家要求人工」（handoffReason human_request = R） | 替身一次性，已消费；结束时替身为 normal、sticky=false |
| TC-AI-020 | 通过 | 前置：工作时间外，故障注入 Demo TikTok MY 卖家发送 once / error；1 convai5-ai020 发「我的包裹到哪了」，买家视图卖家消息 0 条；2 Arif 的「待认领」有该会话，头部「待认领 · 发送失败」（send_failed） | 故障已消费，faults 为空 |
| TC-AI-021 | 通过 | 前置 R0 = 当时的最近一次请求，`pnpm scenario usage-exhausted`；1 convai5-ai021 发一条，Nur 的「待认领」有该会话，没有草稿，头部「待认领 · 出稿用量已满」（quota）；2 owner `/billing`「已用 100 次」；3 最近一次请求与 R0 相同 | 用量窗口 01:03:01–01:03:06，随后用 SQL 还原 usage_period（quota 2000、topup 0、drafts_used = 本期实际草稿数 65、alerts_sent []）与 subscription（stop、阈值 80/100、接收人林晓、站内）；窗口内没有别组会话因用量转人工 |
| TC-AI-022 | 通过 | 前置 `pnpm scenario usage-near-quota`（79/100，阈值 80%，接收人林晓，站内），记 owner、admin2 现有通知；1 convai5-ai022a 出草稿后 `/billing`「已用 80 次」；2 owner 新增 1 条「出稿用量已到 80%」（弹层第一条，「本期已用 80 / 100 次…」）；3 convai5-ai022b 出草稿后「已用 81 次」，owner 没有新增用量提醒；4 admin2 没有新增 | 用量窗口 01:03:39–01:03:48，窗口内 Demo Store 只有这两份草稿；之后 SQL 还原（drafts_used = 67、quota 2000、alerts_sent []、阈值 80/100） |
| TC-AI-023 | 通过 | 前置 convai5-ai023 下单 261013K5UWLLH7 并发公司、地址、邮箱，出草稿后 Nur 认领并回复；U = 68；1 右栏「开 Invoice / Receipt」打开弹层，订单 261013K5UWLLH7 与商品行「Stainless Steel Vacuum Tumbler 900ml ×1 MYR 38.50」已预填；2 「从对话提取」（接口 200）后抬头、地址、接收邮箱（另有税号）填入非空值，均可编辑；3 关闭弹层后本期已用仍为 68 | 填入的是 stub 替身值（PT Contoh Sdn Bhd 等），不是对话原文；窗口内 Demo Store 没有新草稿 |
| TC-RCP-001 | 通过 | 前置：固定为工作时间内；1 owner 把 Demo TikTok MY 工作时间内改为 auto 点「保存」，toast「已保存 1 家店，下一条入站消息起生效」；2 `/settings/audit` 接待设置有「林晓 把「Demo TikTok MY」的接待模式改为工作时间内 auto、工作时间外 auto」；3 convai5-rcp001 发「我的包裹到哪了」，1.1 秒后买家视图收到 AI 回复 | Demo TikTok MY 的 auto 窗口 01:18:04–01:18:05，之后用接口改回 assist / auto（审计里随之多一条改回记录）；工作时间内窗口 01:18:00–01:18:26 |
| TC-RCP-002 | 通过 | 1 Demo Shopee MY 的 auto 置灰（aria-disabled、不透明度 0.38，aria-label「auto（不可用：Shopee 平台规则禁止 chatbot 回复，评审前不开放）」），悬停提示与点击 toast 都是「Shopee 平台规则禁止 chatbot 回复，评审前不开放」，点击后未选中；2 PUT modes 返回 409 `/errors/not-allowed`（code shopee_auto）；3 刷新后仍为 assist / assist | |
| TC-RCP-003 | 通过 | 前置：模拟器 TikTok Shop → Demo TikTok MY →「店铺」页显示「坐席接单」（`canAcceptChat` true）；1 owner 把 Demo TikTok MY 工作时间内、外都改为 off 点「保存」，toast「已保存 1 家店，下一条入站消息起生效」；2 模拟器刷新后该店显示「暂停接单」（`canAcceptChat` false） | off 窗口 01:57:59–01:58:05，之后用接口改回 assist / auto，`canAcceptChat` 恢复为 true。第一次执行（01:56:38–01:56:44）只读了接口没看模拟器页面，补做一次。旁见：Demo TikTok TH 种子为 off / off，模拟器里它的坐席接单却是开启 |
| TC-RCP-004 | 通过 | 1 关键词区默认 7 个：转人工、投诉、退款、人工客服、refund、complaint、human；2 逐个添加 kw08 到 kw30 点「保存」（toast「已保存，下一条入站消息起生效」），刷新后 30 个；3 满 30 个时输入框与「添加」都不可用，提示「已满 30 个，先移除一个再添加。」；4 PUT 31 个返回 422 `/errors/validation`（「转人工关键词最多 30 个」）；5 30 个中一个 41 字返回 422 `/errors/validation`（「每个关键词最多 40 个字」） | 满 30 个时输入框禁用，第 3 步的「再输入 kw31」无法输入，按「添加」不可用加提示判定（同 RUN-002）。全局窗口 01:06:30–01:06:37，之后用接口还原为默认 7 个 |
| TC-RCP-005 | 通过 | 1 固定为工作时间外（周三关闭，01:13 窗口内）向 Demo TikTok MY 新买家 convai5-rcp005a 发一条，1.6 秒收到 AI 回复；2 固定为工作时间内后「添加节假日」2026-10-14 并保存，convai5-rcp005b 1.6 秒收到 AI 回复；3 移除该节假日并保存，convai5-rcp005c 8 秒内买家视图没有卖家回复，Arif 的「AI 草稿」有该会话（草稿待审，mode assist） | 节假日窗口 01:18:09–01:18:14，已移除；工作时间窗口见 TC-RCP-001 |
| TC-RCP-006 | 通过 | 1 阈值设 0.95 保存，替身默认，convai5-rcp006a 没有草稿，进待认领，头部「待认领 · AI 置信度低」（low_confidence）；2 阈值 0.50、替身低置信 0.4，convai5-rcp006b 没有草稿，原因 low_confidence；3 阈值 0.50、替身默认，convai5-rcp006c 出草稿（0.85）；4 PUT 0.49 与 0.96 都返回 422 `/errors/validation`（「置信度阈值在 0.50 到 0.95 之间」） | 阈值窗口 01:07:10–01:07:20（0.95 只在 01:07:10–01:07:14），之后在页面改回 0.60；窗口内没有别组会话转人工 |
| TC-RCP-007 | 通过 | 1 `responseSlaMinutes` 4 返回 422；2 121 返回 422（「接待时限在 5 到 120 分钟之间」）；3 120 返回 200；4 `unclaimedRemindMinutes` 7 返回 422（「待认领提醒只能选 5、10、15 分钟或不提醒」）；5 待认领提醒下拉只有「5 分钟后通知组长」「10 分钟后通知组长」「15 分钟后通知组长」「不提醒」四项 | 第 3 步后立即（01:07:50）用接口把接待时限改回 15 |
| TC-RCP-008 | 通过 | 前置 P0 = 售前内置默认正文；1 售前改为「售前版本 A」保存、再改为「售前版本 B」保存（toast「已保存，下一条入站消息起生效」），「历史版本」弹层列出 B、A 两条，各带保存时间 2026-10-14 01:08；2 点售前「恢复默认」并确认，正文回到 P0，标「内置默认」，历史版本仍为 B、A 两条；3 护栏段标「护栏（不可编辑）」，未确认阶段标「固定正文 · 不可编辑」，两者都是纯文本，页面上只有品牌语气与三段阶段提示词 4 个可编辑框 | 售前提示词窗口 01:08:29–01:08:36 |
| TC-RCP-009 | 通过 | 1 售中正文填 6,001 字点「保存」：计数「6,001 / 6,000」与「每段最多 6,000 字」，页面不发请求、库里正文未变；接口 PUT 6,001 字返回 422（「每段最多 6,000 字」）；2 改为 6,000 字保存，toast「已保存…」，刷新后仍 6,000 字；3 再连续保存 v2 到 v11，历史版本共 10 条（v11 到 v2），6,000 字版本已不在列表 | 售中窗口 01:09:09–01:09:31，结束时点「恢复默认」回到内置默认 |
| TC-RCP-010 | 通过 | 前置 Arif 在 `/tickets`「新建工单」建「开票」T1 = T-1041（Demo Shopee MY，周三 01:10 建），D1 = 10-16 18:00（2 个工作日）；1 owner 把开票时限改为「1 个工作日」保存，toast「已保存，只影响之后新建的工单」；2 T-1041 截止仍为 10-16 18:00；3 Arif 再建 T2 = T-1044（01:10），截止 10-15 18:00 | 工作日从建单次日起算（周三 09:00 前建单，1 个工作日落在周四 18:00、2 个工作日落在周五 18:00），DESIGN 没写工作日计法，按「建单后 1 个工作日」判通过（同 RUN-002 的观察）。开票时限窗口 01:10:41–01:10:52，之后在页面改回 2 个工作日 |
| TC-RCP-011 | 通过 | 1 退货退款一行时限显示「以平台为准」，没有时限下拉；提醒阈值可选「截止前 3 / 6 / 12 小时」；2 PUT return_refund `merchantDue` 返回 409 `/errors/not-allowed`（「退货退款的时限以平台为准，只能改提醒阈值。」）；3 提醒改为「截止前 12 小时」保存（toast「已保存，只影响之后新建的工单」），刷新后仍为截止前 12 小时 | 提醒阈值窗口 01:11:40–01:11:47，之后在页面改回截止前 6 小时 |
| TC-RCP-012 | 通过 | 前置：自动关闭选「不自动关闭」保存（`autoCloseDays` null），`pnpm scenario ticket-resolved-8d` → T-1046；1 `pnpm job ticket.auto_close`（ok）后打开 T-1046，状态仍为「已解决」（库里 resolved） | 自动关闭窗口 01:11:49–01:11:59，之后在页面改回「7 天后」；T-1046 留在库里，下次自动关闭任务会把它关掉 |

## 用例措辞与旁见（判通过，不改本轮结果）

- 操作列里的按钮名与界面不一致（预期列都满足，按 RUN-002 的口径判通过）：员工转交入口「转交给同事」（用例「转交给其他客服」，`TC-CONV-014`、`TC-CONV-015`）；组长入口「改派给其他同事」、确认按钮「改派」（用例「分配给客服」「转交」，`TC-CONV-017`）；TikTok 结束按钮「结束会话（同步结束 TikTok 会话）」（用例「结束会话：同时调用 TikTok End Session」，`TC-CONV-018`）；Shopee 结束按钮用全角括号（`TC-CONV-019`）；卡片弹层确认按钮「发送订单卡 / 发送物流卡 / 发送退货退款卡」（用例「发送卡片」，`TC-CONV-008`、`TC-CONV-024`）；阶段来源「手动」（用例「人工」，`TC-CONV-031`）；「建工单」在会话头部，右栏没有（`TC-CONV-007`）。
- `TC-CONV-006` 第 1 步「C 的行在顶部」依赖队列里没有比 C 更新的待认领会话：列表按最近消息倒序，共享库里先跑的用例留下的待认领会话会排在 C 前面。
- `TC-CONV-014` 指派通知标题只写「1 张工单」，不带工单号。
- 种子 Demo TikTok TH 为 off / off，模拟器里它的坐席接单是开启（`TC-RCP-003` 只验证保存时同步，未判定）。

## 留在库里的对象

- 63 个 `convai5-*` 会话：human 27、bot 19、awaiting_human 14、closed 3；对应模拟平台订单 8 张，其中 2610135KTSBTUS 有退货申请 26101303B0FCE16（REQUESTED）。
- scenario 会话：unclaimed-11m 4 个（scenario.46ac38da、fe07d849、66352f2a、69babe8e，均待认领），conversation-idle-73h 1 个（scenario.7392bd2d，已结束），draft-25h 1 个（scenario.6ea6943d，草稿已过期）。
- 工单：本组建的 T-1006、T-1014、T-1061（内部确认）、T-1041、T-1044（开票）；平台事件自动建的 T-1018（convai5-conv033b 的退货退款）；handover 扫描在 convai5-conv013 上建的 T-1056；scenario 建的 T-1046（已解决，自动关闭恢复 7 天后已被定时任务关闭）。
- 上传的图片、提示词历史版本（售前 2 条、售中 10 条）、owner 与组长的通知，以及上述操作的审计日志。

收尾：`scripts/.tmp-run5-convai-*` 与临时目录 `/tmp/shopilot-run5-convai`（含 cookie、截图、测试图片）已删除。
