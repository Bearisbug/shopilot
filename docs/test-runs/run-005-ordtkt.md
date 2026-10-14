# RUN-005 · 组 ordtkt · 订单、售后与开票 / 工单 / 看板

- 执行：AI（ordtkt 组），2026-10-14 00:22–01:20（Asia/Kuala_Lumpur，周三；执行时段在工作时间 09:00–18:00 之外）
- 环境：§3 本地行，http://127.0.0.1:3360，`AI_MODE=stub`；被测版本为工作区 src 指纹 `6a816fe3e80d`；与 auth、convai 两组共用同一个库，基线是主会话 `db:reset && db:seed` 后的库，本组未重置
- 手段：UI 步骤用 Playwright + 本机 Edge（headless）；接口用带登录 cookie 的 HTTP 请求（每个账号只登录一次、复用会话）；模拟器动作走 `POST /api/mock/sim/{action}`，读数走 `GET /api/mock/sim/state` 与模拟库表；发件箱读 `GET /api/dev/outbox?to=`，「标记退信」在 `/dev/outbox` 页面点；定时任务用 `pnpm job`，时间数据用 `pnpm scenario`。前置里的「认领并回复」与 `TC-TKT-010` 至 `TC-TKT-015` 的手动工单 T1、T2 用接口完成，被测步骤用界面
- 买家一律新建，名字前缀 `ordtkt5-`；手动工单说明前缀 `ordtkt5 TKT-`
- 计数：通过 38 · 失败 4 · 待人工 3 · 阻塞 0 · 跳过 0（共 45）

| 用例 | 结果 | 现象 / 证据 | 备注 |
| --- | --- | --- | --- |
| TC-ORD-001 | 失败 | 第 2 步：推送到达后右栏要 28 秒才出现订单 O，预期是 10 秒内。右栏的 `/buyer` 接口按 30 秒轮询，t0 后 27.7 秒才重拉；首次尝试（订单 26101351A5NC9U）在 t0 + 8 秒看右栏，仍显示「近 180 天没有订单」。O 出现后内容符合预期：MYR 43.40、「运输中」+ SHIPPED、「最晚 10-16 发货」、「SPX Express (MY) · MY3493013927370」、最新轨迹「Parcel has arrived at Shah Alam Hub.」。第 1 步通过：推送 code 3（UNPAID / READY_TO_SHIP / PROCESSED / SHIPPED）、code 4（运单号）、code 30 都是 HTTP 200。第 3 步通过：「近 180 天 0 单」→「1 单 · MYR 43.40」。证据 `docs/test-runs/run-005-TC-ORD-001-2.json`、`docs/test-runs/run-005-TC-ORD-001-2.png` | 买家 ordtkt5-o001-m2ra（首次）、ordtkt5-o001b-dt4f，订单 26101329SXNWU9。DESIGN 前后矛盾：§19 Gherkin 写「推送到达后 10 秒内」，`API-CONV-003` 写「前端 30 秒轮询」，实现按后者。待裁决 |
| TC-ORD-002 | 通过 | 第 1 次点击返回 202，`jobIds` 4 个，提示「已开始同步 4 家店的订单」；第 2 次点击返回 429 `/errors/rate-limited`（`sync_cooldown`），`Retry-After: 55`，提示「稍后再试 · 刚刚已经排过同步，55 秒后可以再点。」 | 同一页面里，点击后按钮立即置灰为「59 秒后可再同步」，所以第 2 次点击在刷新后的页面完成（距第 1 次 5 秒）。另外，首次脚本在 00:27 已点过一次同步 |
| TC-ORD-003 | 通过 | 对话框有「先不取消」「取消订单」；右栏 2610136M98MJA0 变为「已取消」，时间线新增「订单 2610136M98MJA0 已取消（买家要求），由 Nur Aisyah 操作」；模拟器 CANCELLED；审计日志「Nur Aisyah · 页面 · 订单与开票 · 取消订单 2610136M98MJA0（买家要求）」 | 买家 ordtkt5-o003-omef |
| TC-ORD-004 | 通过 | 右栏「取消订单（买家要求）」置灰，悬停提示「订单已发货，平台不允许卖家取消」；接口 409 `/errors/not-allowed`（`order_not_cancellable`）；模拟器仍 SHIPPED | 买家 ordtkt5-o004-0dua，订单 26101364LFR38R；幂等键用 `tc-ord-004-run5-ordtkt` |
| TC-ORD-005 | 通过 | 「待发货」共 4 行，状态都是待发货，店铺只有 Demo Shopee MY、Demo TikTok MY；包含新单 261013MEACP1UG、576443826938047638，没有 TH 单 576471450766559525。CSV 4 行，店铺与状态同上。卡片「售后待处理 · 2 单 · 退货退款与取消申请工单 2 张」，N = 2，等于两店未结的 T-1003、T-1001；点击后跳到 `/tickets`，列出这两张 | 卡片上没有「查看工单」字样，点的是整张卡片 |
| TC-ORD-006 | 通过 | Nur 的 `/orders` 共 8 行，店铺都是 Demo Shopee MY；抽屉有订单信息、关联工单（没有）以及「打开会话」「开票」「取消订单」「建工单」；TH 单 576463590100998863 接口返回 404 `/errors/not-found` | 「售后单」「发票」分区只在订单有对应数据时出现：首行没有售后、没有发票，这两个分区不显示；250928T5LP4W9C 的抽屉显示了售后单分区。按 RUN-002 口径判通过 |
| TC-ORD-007 | 通过 | IN_CANCEL 推送 200；新建 T-1007：取消申请、待处理、商户时限，截止 10-15 00:33，取「现在 + 24 小时」，早于最晚发货 10-16 00:33。Nur 在 `/orders`「售后待处理」点「处理」，打开「处理买家取消申请」；选「同意取消」提交后对话框关闭，模拟器变为 CANCELLED。T-1007 已解决，时间线有「平台事件建单（平台）」「Nur Aisyah 同意取消申请（页面）」「平台事件 · 已取消（平台）」 | 买家 ordtkt5-o007-3gfy，订单 2610138TZ5F8QK。首次脚本定位单选项出错，没有提交，换脚本重做第 3–5 步 |
| TC-ORD-008 | 通过 | 选「拒绝取消」提交后对话框关闭，模拟器回到 READY_TO_SHIP；T-1008 已解决，阶段「已拒绝」 | 买家 ordtkt5-o008-5czm，订单 2610136PQS7RFH |
| TC-ORD-009 | 通过 | B（Arif）同意后模拟器变为 CANCELLED；A（Nur）再拒绝，对话框提示「订单已不在取消申请中（当前 CANCELLED），不能拒绝取消申请。」，接口 409 `/errors/not-allowed`（`aftersale_state`）；模拟器仍是 CANCELLED | 买家 ordtkt5-o009-tdfw，订单 2610137HM7H0LG，工单 T-1009 |
| TC-ORD-010 | 通过 | 新建 T-1010：取消申请、待处理、平台截止（剩 47 小时 59 分）；同意后模拟器取消单为 CANCELLATION_REQUEST_SUCCESS，订单 CANCELLED；T-1010 已解决 | 买家 ordtkt5-o010-d1uh，订单 576460121128168595。首次脚本按买家名找面板条目失败（TikTok 买家名打码），改按工单号重做第 2 步 |
| TC-ORD-011 | 通过 | T-1011 详情「处理申请」弹层有「同意退货 / 拒绝」与「平台截止 10-16 00:37 · 剩 2 天」；选拒绝后，原因下拉列出 3 项英文原因，与 `reject-reasons` 接口一致（含 Product was used or damaged by the buyer）；提交后弹层关闭，模拟器退货单为 REFUND_OR_RETURN_REQUEST_REJECT；刷新后 T-1011 已解决，阶段已关闭 | 买家 ordtkt5-o011-awpo，订单 576488895146530037。原因控件是下拉框，读取时先显示「正在读取平台原因」，没有名为「选择原因」的按钮。观察（用例未约束）：时间线写「原因：seller_reject_apply_product_used_or_damaged_by_buyer」，显示的是原因代码而不是原因文字 |
| TC-ORD-012 | 通过 | 弹层只有「同意退款」「发起争议」两项；不选原因直接提交，提示「请选择争议原因」，没有发请求；选第一项「拒绝这次退货申请」后弹层关闭，模拟器退货单变为 JUDGING；T-1012 显示「等待中 · 等平台」 | 买家 ordtkt5-o012-eydv，订单 261013E5ZJWPTT。右栏入口文案是「处理」，不是「处理申请」（同 RUN-002）。观察：时间线写「原因：2」，显示的是原因代码 |
| TC-ORD-013 | 通过 | 同意退款后模拟器退货单为 ACCEPTED，T-1013 已解决（已退款）；再打开弹层，显示「「同意退款」不可用」「「发起争议」不可用」，没有提交按钮；接口 409 `/errors/not-allowed`（`aftersale_state`） | 买家 ordtkt5-o013-fr9x，订单 261013M7816CNN。前置偏差（用例问题，同 RUN-002）：T-1013 的负责人是 Arif，`agent` 调 `GET /tickets/<T>` 返回 404，售后单 ID 改由 owner 取 |
| TC-ORD-014 | 通过 | 买家寄回后 T-1015 为「处理中 · 待验货」；选「拒收」和第一项原因提交后，模拟器为 REJECT_RECEIVE_PACKAGE，T-1015 变为「等待中 · 等平台」、阶段平台仲裁中；仲裁判买家胜后 T-1015 已解决（退款完成） | 买家 ordtkt5-o014-2okr，订单 576468899811950833 |
| TC-ORD-015 | 通过 | 弹层类型为 Invoice，订单 261013GQMPCJW2 与商品行已预填；生成 INV-2026-000002，弹层关闭，提示「已生成 INV-2026-000002」；买家视图收到发票图片；发件箱有一封发往 invoice1@demo.test 的邮件，模板 invoice，主题「Invoice INV-2026-000002 from Demo Store」，附件 INV-2026-000002.pdf；发票记录显示「聊天已发送 / 邮件已发送」；PDF 为 `application/pdf`，文本含发票号与抬头 | 冒烟；买家 ordtkt5-o015-uplr |
| TC-ORD-016 | 失败 | 第 2 步：发票记录该行显示「邮件退信」，但行上的入口是链接「工单 T-1017」，没有用例要求的「查看工单」（`docs/ui-interactions.md` 写的也是「查看工单」）。证据 `docs/test-runs/run-005-TC-ORD-016-2.png`。第 1 步发件箱显示「已退信」。第 3 步点「工单 T-1017」进入开票工单，接口 `origin=rule`，关联订单 261013GQMPCJW2。第 4 步点「重发」后发件箱 1 → 2 封，该行回到「邮件已发送」 | 只有入口文案不同，功能完整。界面写「系统建单」、来源「系统」，「来源为规则」按接口判定 |
| TC-ORD-017 | 失败 | 第 1 步：按用例只切 Receipt、取消「发送到聊天」、填邮箱，再点「生成并发送」，弹层报「请填写抬头」「请填写地址」，没有发请求。证据 `docs/test-runs/run-005-TC-ORD-017-1.png`。补填抬头与地址后生成 RCT-2026-000002；第 2、3 步符合预期：买家视图没有发票图片，发件箱有发往 receipt1@demo.test 的邮件，发票记录「聊天未发送（跳过） / 邮件已发送」 | 买家 ordtkt5-o017-igka，订单 261013HUQ8NYAD。用例问题：步骤没写填抬头与地址，而这两项必填（DESIGN `API-INV-002` 的 `buyerName`、`address` 也不是可选字段） |
| TC-ORD-018 | 失败 | 第 2 步：按用例取消「发送到聊天」、邮箱留空，再点「生成并发送」，弹层报「请填写抬头」「请填写地址」，没有发请求。证据 `docs/test-runs/run-005-TC-ORD-018-2.png`。第 1 步通过：选无会话订单 2610139JTX6A0R 后，「发送到聊天」置灰未勾，旁边写「这张订单没有关联会话」。补填抬头与地址后生成 INV-2026-000003，两路都「未发送（跳过）」。第 3 步通过：点「重发」提示「这张发票没有接收邮箱，填写邮箱后再重发。」，接口 409 `/errors/not-allowed`（`no_email`） | 买家 ordtkt5-o018-vmy2（没有会话）。用例问题，同 `TC-ORD-017` |
| TC-ORD-019 | 通过 | 故障注入后生成 INV-2026-000004，弹层关闭；发票记录显示「聊天失败 Shopee 返回错误（error_server）：Something wrong. Please try later.」与「邮件已发送」，PDF 可以下载；买家视图没有发票图片 | 买家 ordtkt5-o019-uhuo，订单 261013VFFHA0SE，邮箱 invoice19@demo.test。故障注入在 00:48:50 设为 once，被本次开票消费，之后 `faults` 为空 |
| TC-ORD-020 | 待人工 | — | 执行者 = 人工 |
| TC-ORD-021 | 通过 | C1 右栏「开 Invoice / Receipt」弹层只写「这个买家近 180 天没有订单，没有可开票的订单。」，没有订单选择，看不到 B2 的订单 261013Z4SRV3N8；接口 409 `/errors/conflict`，`detail` 为「这张订单不属于当前会话的买家。」；B1 的买家视图没有新增消息 | 买家 ordtkt5-o021a-lfm3（C1）、ordtkt5-o021b-vp5d；幂等键 `tc-ord-021-run5-ordtkt` |
| TC-TKT-001 | 通过 | 推送日志新增 TikTok webhook type 12，HTTP 200；新建 T-1019：退货退款、待处理、平台截止、剩 47 小时 59 分、负责人 Arif Rahman，D1 = 10-16 00:50。同意退货后为「等待中 · 等买家」，模拟器 AWAITING_BUYER_SHIP；买家寄回后为「处理中 · 待验货」，截止 10-16 00:51，与 D1 不同；收货后同意退款，模拟器为 RETURN_OR_REFUND_REQUEST_COMPLETE，T-1019 已解决。时间线依次为：平台事件建单 / Arif Rahman 同意退货 / 平台事件 · 等买家寄回 / 平台事件 · 待验货 / Arif Rahman 收货后同意退款 / 平台事件 · 退款完成；人工动作来源标「页面」，平台事件标「平台」 | 冒烟；买家 ordtkt5-t001-gvjc，订单 576418005465873557。同意退货后等到下一分钟再寄回，让截止时间在分钟粒度上能区分 |
| TC-TKT-002 | 通过 | 退货推送 200；新的退货退款工单 T-1020 负责人为林晓；工作台「我处理中」B 的会话行显示「工单 T-1020 · 剩 47 小时 59 分」 | 买家 ordtkt5-t002-z9e8。改过全局设置，见文末表 |
| TC-TKT-003 | 通过 | 看板 T-1021 卡片有锁图标（标签「平台驱动，不能手动改状态」），没有「改状态」；详情页「由平台事件关闭」置灰，悬停提示「平台类工单随平台事件推进，用上方「处理申请」处理」；接口 409 `/errors/not-allowed`（`platform_driven`） | 买家 ordtkt5-t003-gkvl |
| TC-TKT-004 | 通过 | RETRY_SHIP 推送 200；新建 T-1022：物流异常、关联 2610139SA90S7L、待处理，截止 10-16 00:53，等于 S；看板卡片没有锁，改「处理中」后移到处理中列，时间线「Arif Rahman 改为 处理中 · 物流异常」，来源页面；再改「已解决」后工单已解决 | 买家 ordtkt5-t004-7a9a |
| TC-TKT-005 | 通过 | 关掉自动建单后 R = 11；Demo TikTok MY 新单 576463512651249994 申请退货，推送 200；刷新后仍是 11，该单没有工单 | 买家 ordtkt5-t005-76e7。改过全局设置，见文末表 |
| TC-TKT-006 | 通过 | 弹层提示「已有同一张未结工单 T-1023，不能重复建。 打开 T-1023」；接口 409 `/errors/duplicate`，`extra.number` 为 T-1023；点「打开 T-1023」进入 T-1023 详情 | 买家 ordtkt5-t006-2ddt。建工单弹层没有「退货单」选择项，只有「关联订单」，选的是同一订单（同 RUN-002） |
| TC-TKT-007 | 通过 | 类型选「内部确认」后，负责人只读显示「Nur Aisyah（本人）」与「员工建的工单只能由自己负责」，没有下拉；建成 T-1024：负责人 Nur Aisyah、商户时限，截止 10-15 18:00（周三 00:57 建单，按周一至周五 09:00–18:00 推到下一个工作日收工，与 RUN-002 同口径）；指定 Mei Lin 时返回 403 `/errors/forbidden`，`code` 为 `assignee_not_allowed` | 买家 ordtkt5-t007-jydp。会话没有订单时右栏没有「建工单」，改用会话头部的「建工单」按钮（同 RUN-002） |
| TC-TKT-008 | 通过 | 建成 T-1025：开票，负责人 Nur Aisyah，商户时限；Nur 的工单类通知新增 1 条「新工单 T-1025 开票」，通知弹层里能看到 | Nur 的总未读数同时被 convai 组的会话通知拉高，这里只数工单类通知 |
| TC-TKT-009 | 通过 | 「缺货 / 到货跟进」关联 2610139JDFCPGQ 建成 T-1026；再建同类型同订单，返回 409 `/errors/duplicate`，弹层「已有同一张未结工单 T-1026… 打开 T-1026」；在看板把 T-1026 改为已解决后再建，得到 T-1027；不关联订单连建两张内部确认，得到 T-1028、T-1029 | 买家 ordtkt5-t009-ajh2 |
| TC-TKT-010 | 通过 | Nur 的 `/tickets` 有 T-1030，没有 T-1031，筛选只有类型 / 状态 / 平台，没有「我的 / 全部」切换；`scope=all` 返回 200，9 条的负责人都是 Nur Aisyah；T-1031 详情 404 `/errors/not-found` | |
| TC-TKT-011 | 通过 | T-1032 从「待处理」列移到「等待中」列；时间线「Nur Aisyah 改为 等待中 · 等内部」，来源页面 | |
| TC-TKT-012 | 通过 | T-1035 作废（原因「重复建单」）；T-1034 时限从 10-15 18:00 改到 10-16 18:00，时间线有一条改时限；审计日志模块「工单」有「Arif Rahman · T-1035 作废：重复建单」「Arif Rahman · T-1034 时限改为 10-16 18:00」；员工调 void、due 都返回 403 `/errors/forbidden` | 首次脚本没找到作废确认框（alertdialog），没有作废，重做 |
| TC-TKT-013 | 通过 | 加备注后时间线「Nur Aisyah 加备注 · 已联系仓库」；Arif 的负责人下拉为 Arif Rahman、Auth Two、Mei Lin、Nur Aisyah、Nur New、林晓、陈卓；选 Mei Lin 后时间线「Arif Rahman 改派给 Mei Lin」；Mei 新增 1 条「工单 T-1036 内部确认 改派给你」 | 下拉比用例列的 5 人多了 Auth Two、Nur New。两人是 auth 组本轮新增、负责 Demo Shopee MY 的启用员工，已核对库表；已停用的 Run5 Mei、Used Link 和只负责 SG 的 Run5 SG 都不在下拉里，「只列负责该店的启用成员与管理员」成立 |
| TC-TKT-014 | 通过 | 类型「内部确认」共 15 行，全是内部确认；状态「等待中」+ 平台 Shopee 共 2 行（T-1032、T-1012），都符合；CSV 2 行与列表一致，含「时限来源」「平台原始状态」列 | |
| TC-TKT-015 | 通过 | 已解决的 T-1039 改 in_progress，返回 409 `/errors/not-allowed`（`illegal_transition`）；作废返回 409 `/errors/not-allowed`（`ticket_finished`）；平台类 T-1042 改时限返回 409 `/errors/not-allowed`（`platform_due`）；T-1043 改为 in_progress 后 version 为 2，再用 version 1 改 resolved，返回 409 `/errors/conflict`（`version_mismatch`） | 买家 ordtkt5-t015-8wit。前置「Nur 在看板把 T1 改为已解决」用 Nur 的接口完成。平台类工单详情页的「改时限」按钮是置灰的 |
| TC-TKT-016 | 通过 | 场景工单 T-1045；第 1 次 `ticket.scan`（reminded 1）后，Arif 新增「工单 T-1045 退货退款 即将到期」，侧栏工单徽标前后都是 1；第 2 次 reminded 0，Arif 没有新增 | 两次扫描（01:12:09、01:12:30）作用于全库，只提醒了 T-1045 |
| TC-TKT-017 | 通过 | 场景工单 T-1047；`ticket.scan` 退出码 0（overdue 1）；Arif 的 `/tickets` 中 T-1047 行标「已超时 1 小时」；Nur、Arif 各新增 1 条「工单 T-1047 内部确认 已超时」；第 2 次 overdue 0，两人都没有新增 | 两次扫描（01:13:03、01:13:27）只标了 T-1047；通知按标题经接口核对 |
| TC-TKT-018 | 通过 | 场景工单 T-1051；`ticket.auto_close` 后 T-1051 已关闭，时间线「自动关闭 · 已解决超过 7 天」，来源系统 | 01:13:47 的 `auto_close` 作用于全库（closed 2），同时关闭了别组在 01:11:51 用场景 `ticket-resolved-8d` 建的 T-1046 |
| TC-TKT-019 | 通过 | 场景会话 scenario.cce86c94；`handover.scan` 后有 T-1057 跨班交接，关联该会话，负责人 Arif Rahman，截止 10-15 10:00（周四 09:00 开工 + 1 小时）；第 2 次 created 0 | 改过全局设置，见文末表。副作用：同一次扫描另建了 5 张未结跨班交接工单：T-1052（tanweiming88）、T-1053（sitirahmah_shop）、T-1054（dgoh.sg，负责人林晓）、T-1055（Jason Lee）、T-1056（convai 组的 convai5-conv013） |
| TC-TKT-020 | 待人工 | — | 执行者 = 人工 |
| TC-DASH-001 | 通过 | Arif「近 7 天」：会话段 85、人工首响中位 30 分 00 秒，草稿处置、按人统计、工单区都有数据或「数据不足」；平台指标分「Shopee · 平台口径」「TikTok Shop · 平台口径」两张表，各自写明口径，只有 Demo Shopee MY、Demo TikTok MY；接口 `platformMetrics` 也只有这两家；owner 同一范围看到 4 家店，会话段 98，不小于 85 | |
| TC-DASH-002 | 通过 | 原位显示「这个页面只对管理员、组长开放」「你在「Demo Store」的角色是员工。需要时请联系管理员调整角色。」和「返回工作台」（指向 `/wb`） | |
| TC-DASH-003 | 通过 | 本月：原样发送 2 → 3，忽略 2 → 3，转人工原因「人工转交」（`reason=manual`）2 → 3；改「近 90 天」后 `/api/v1/dashboard?range=90d` 返回 200，页面显示 07-17 至 10-14，没有报错；「导出报表」下载的 CSV 有「会话段」和原样发送 / 改后发送 / 忽略 / 过期列 | 买家 ordtkt5-d003a-c853（认领并发送）、ordtkt5-d003b-8fth（忽略）。转人工原因是图表，次数按接口读；界面标签叫「人工转交」，用例写「人工」。这次 manual +1 来自点「忽略」的那条会话，「认领并发送」那条的 `handoff_reason` 为空。各计数都只 +1，与本组两次操作对应；操作前已确认 AI 替身为 `normal` |
| TC-DASH-004 | 待人工 | — | 执行者 = 人工 |

## 失败项判断

| 用例 | 步骤 | 判断 |
| --- | --- | --- |
| TC-ORD-001 | 2 | DESIGN 前后矛盾：§19 写「10 秒内」，`API-CONV-003` 写「前端 30 秒轮询」，实现按后者。需裁决：要么把 Gherkin 与用例改成 30 秒以内，要么让右栏在推送到达后 10 秒内刷新 |
| TC-ORD-016 | 2 | 文案差异：实现把入口写成「工单 T-xxxx」，用例与 `docs/ui-interactions.md` 写「查看工单」。功能完整；由主会话决定改实现文案还是改用例 |
| TC-ORD-017 | 1 | 用例问题：步骤没写抬头、地址这两个必填项 |
| TC-ORD-018 | 2 | 用例问题：同 `TC-ORD-017` |

## 全局设置改动与还原

| 设置 | 原值 | 改动时段（当地） | 还原 |
| --- | --- | --- | --- |
| 接待时间 · 周三 | 工作，09:00–18:00；无节假日 | 00:51:57–00:52:08 经接口改为 00:00–23:59（TC-TKT-002） | 已还原，接口复核 |
| 工单类型 · 退货退款 自动建单 | 开启 | 00:54:26–00:55:01（首次脚本中断）与 00:55:41–00:55:58 经 `/reception/tickets` 关闭（TC-TKT-005） | 已还原，接口复核；窗口内别组的退货申请不会自动建单 |
| 接待时间 · 周三 | 工作，09:00–18:00 | 01:14:21–01:15:01 被场景 `handover-candidate` 改为 00:00–01:13（TC-TKT-019） | 已经接口改回，复核 |
| 故障注入 · Demo Shopee MY 卖家发送 | 无 | 00:48:50 设为 once（TC-ORD-019） | 已被本组开票消费，`faults` 为空 |

AI 替身没有改动（`normal`、`sticky=false`）。用例后置均为「无」，没有执行 `db:reset`。

## 作用于全库的定时任务

| 任务 | 时间（当地） | 波及别组的对象 |
| --- | --- | --- |
| `ticket.scan` ×4 | 01:12:09、01:12:30、01:13:03、01:13:27 | 无（只提醒 T-1045、只标超时 T-1047） |
| `ticket.auto_close` | 01:13:47 | 关闭了别组场景建的 T-1046 |
| `handover.scan` ×2 | 01:14:29、01:14:51 | 第 1 次新建 T-1052–T-1056（种子会话 tanweiming88、sitirahmah_shop、dgoh.sg、Jason Lee 与 convai 组的 convai5-conv013），均未结；第 2 次没有新建 |

## 仍留在库里的对象

- 模拟器买家 33 个（名字前缀 `ordtkt5-`），以及他们的会话、订单与售后单。
- 工单：T-1007–T-1013、T-1015、T-1017、T-1019–T-1037、T-1039、T-1040、T-1042、T-1043、T-1045、T-1047、T-1051、T-1057，以及 `handover.scan` 副作用产生的 T-1052–T-1056。T-1014、T-1016、T-1018、T-1038、T-1041、T-1044、T-1046、T-1048–T-1050、T-1058 及之后的工单不是本组建的。
- 发票：INV-2026-000002、INV-2026-000003、INV-2026-000004、RCT-2026-000002。
- 发件箱邮件：invoice1@demo.test 2 封（1 封已退信）、receipt1@demo.test 1 封、invoice19@demo.test 1 封。
- 场景对象：handover-candidate 的会话 scenario.cce86c94。
