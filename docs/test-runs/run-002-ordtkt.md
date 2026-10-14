# RUN-002 · 组 ordtkt · 订单、售后与开票 / 工单 / 看板

- 执行：AI（ordtkt 组），2026-10-12 07:16–08:07（Asia/Kuala_Lumpur，周一；执行时段在工作时间 09:00–18:00 之外）
- 环境：§3 本地行，http://127.0.0.1:3360，`AI_MODE=stub`；与 auth、convai 两组共用同一个库，基线 = 起跑时的库；AI 替身全程 `normal`、`sticky=false`，未改动
- 手段：UI 步骤用 Playwright + 本机 Edge（headless）；接口用带登录 cookie 的 HTTP 请求（每个账号只登录一次、复用会话）；模拟器动作走 `POST /api/mock/sim/{action}`，读数走 `GET /api/mock/sim/state`；发件箱读 `GET /api/dev/outbox?to=`，「标记退信」在 `/dev/outbox` 页面点；定时任务用 `pnpm job`，时间数据用 `pnpm scenario`。前置里的「认领并回复」、建手动工单用接口完成，被测步骤用界面
- 买家一律新建，名字前缀 `ordtkt2-`；手动工单说明前缀 `ordtkt2 TKT-`
- 计数：通过 40 · 失败 1 · 待人工 3 · 阻塞 0 · 跳过 0（共 44）

| 用例 | 结果 | 现象 / 证据 | 备注 |
| --- | --- | --- | --- |
| TC-ORD-001 | 通过 | 下单 261011GQHYWACJ 推进到 SHIPPED，推送 code 3（READY_TO_SHIP / PROCESSED / SHIPPED）、code 4「运单号 MY468716310529Q」、code 30 均 HTTP 200；6 秒后右栏显示 MYR 43.40、「运输中」+ SHIPPED、「最晚 10-14 发货」、「SPX Express (MY) · MY468716310529Q」、最新轨迹「Parcel has arrived at Shah Alam Hub.」；近 180 天 0 单 → 「1 单 · MYR 43.40」 | 买家 ordtkt2-o001-0uqu0 |
| TC-ORD-002 | 通过 | 第 1 次 202，`jobIds` 4 个，提示「已开始同步 4 家店的订单」；第 2 次 429 `/errors/rate-limited`，`Retry-After: 57`，提示「稍后再试 · 刚刚已经排过同步，57 秒后可以再点」 | |
| TC-ORD-003 | 通过 | 对话框按钮「先不取消」「取消订单」；右栏 2610110NT5K201 变「已取消」，时间线新增「订单 2610110NT5K201 已取消（买家要求），由 Nur Aisyah 操作」；模拟器 CANCELLED；`/settings/audit` 有「Nur Aisyah · 页面 · 订单与开票 · 取消订单 2610110NT5K201（买家要求）」 | |
| TC-ORD-004 | 通过 | 按钮置灰，悬停提示「订单已发货，平台不允许卖家取消」；接口 409 `/errors/not-allowed`（`order_not_cancellable`）；模拟器仍 SHIPPED | 幂等键用 `tc-ord-004-run2-ordtkt` |
| TC-ORD-005 | 通过 | 「待发货」4 行，店铺只有 Demo Shopee MY、Demo TikTok MY，含新单 261011HDFB6M9P、576469210999700537，无 TH 单 576424707007289075；CSV 4 行，店铺列同上，状态都是待发货；N = 2，等于两店未结的退货退款 / 取消申请工单（T-1003、T-1001），点后跳 `/tickets` 并列出这两张 | 卡片文案为「售后待处理 · 2 单 · 退货退款与取消申请工单 2 张」，没有「查看工单」字样 |
| TC-ORD-006 | 通过 | Nur 的 `/orders` 7 行都是 Demo Shopee MY；抽屉有订单信息、关联工单与「打开会话」「开票」「取消订单」「建工单」；TH 单接口 404 `/errors/not-found` | 「售后单」「发票」分区只在订单有对应数据时出现：第一行（无售后、无发票）只有「关联工单 · 没有」；250928T5LP4W9C 显示售后单，2610111D1M06PG 显示发票。按「分区随数据出现」判通过，若要求空分区也显示则此条应改判失败 |
| TC-ORD-007 | 通过 | IN_CANCEL 推送 200；T-1006 取消申请、待处理、商户时限、截止 10-13 07:21（= 现在 + 24 小时，早于最晚发货 10-14 07:21）；同意后对话框关闭，模拟器 CANCELLED；T-1006 已解决，时间线有「平台事件建单」与「Nur Aisyah 同意取消申请」 | 「处理」入口在订单详情抽屉的售后单分区 |
| TC-ORD-008 | 通过 | 拒绝后对话框关闭，模拟器回到 READY_TO_SHIP；T-1011 已解决、阶段「已拒绝」 | |
| TC-ORD-009 | 通过 | B（Arif）同意 → CANCELLED；A（Nur）拒绝 → 对话框提示「订单已不在取消申请中（当前 CANCELLED）」，接口 409 `/errors/not-allowed`（`aftersale_state`）；模拟器仍 CANCELLED | 工单 T-1012 |
| TC-ORD-010 | 通过 | T-1013 取消申请、待处理、平台截止；同意后取消单 CANCELLATION_REQUEST_SUCCESS、订单 CANCELLED；T-1013 已解决 | |
| TC-ORD-011 | 通过 | T-1014 详情有「处理申请」，弹层有「同意退货 / 拒绝」与「平台截止 10-14 07:27 · 剩 2 天」；原因下拉 3 项英文，与 `reject-reasons` 接口一致（含 Product was used or damaged by the buyer）；提交后弹层关闭，模拟器 REFUND_OR_RETURN_REQUEST_REJECT；T-1014 已解决、阶段已关闭 | |
| TC-ORD-012 | 通过 | 弹层只有「同意退款」「发起争议」；不选原因提交提示「请选择争议原因」、未发请求；选第一项「拒绝这次退货申请」后弹层关闭，模拟器 JUDGING；T-1015「等待中 · 等平台」 | 右栏入口文案是「处理」，不是「处理申请」 |
| TC-ORD-013 | 通过 | 同意退款后模拟器 ACCEPTED，T-1016 已解决（已退款）；再开弹层显示「「同意退款」不可用」「「发起争议」不可用」，提交置灰；接口 409 `/errors/not-allowed`（`aftersale_state`） | 前置偏差（用例问题）：T-1016 负责人是 Arif，`agent` 调 `GET /tickets/<T>` 返回 404，售后单 ID 改由 owner 取 |
| TC-ORD-014 | 通过 | 买家寄回后 T-1017「处理中 · 待验货」；选「拒收」+ 第一项原因提交，模拟器 REJECT_RECEIVE_PACKAGE，T-1017「等待中 · 等平台」、阶段平台仲裁中；仲裁买家胜后已解决（退款完成） | |
| TC-ORD-015 | 通过 | 弹层类型 Invoice，订单 2610111D1M06PG 与商品行预填；生成 INV-2026-000002，弹层关闭、页面提示发票号；买家视图收到图片；发件箱有发往 invoice1@demo.test、模板 invoice、主题「Invoice INV-2026-000002 from Demo Store」、附件 INV-2026-000002.pdf；发票记录「会话已发送 / 邮件已发送」；PDF 为 `application/pdf`，文本含发票号与抬头 | 冒烟 |
| TC-ORD-016 | 通过 | 标记退信后发件箱「已退信」；发票记录「邮件退信」并有「查看工单」；进入 T-1018（开票，关联订单 2610111D1M06PG）；重发后发件箱新增一封（1 → 2），发票记录回到「邮件已发送」 | 「来源为规则」按接口 `origin=rule` 判定；界面写「系统建单」、来源标「系统」，没有「规则」字样 |
| TC-ORD-017 | 通过 | RCT-2026-000002；买家视图无发票图片；发件箱有发往 receipt1@demo.test 的邮件；发票记录「会话未发送（跳过） / 邮件已发送」 | |
| TC-ORD-018 | 通过 | 勾「发送到聊天」→ 409 `/errors/not-allowed`（`no_conversation`），弹层提示「没有关联会话，不能发到聊天」；取消后邮箱留空生成 INV-2026-000003，两路都「未发送（跳过）」；重发 409 `/errors/not-allowed`（`no_email`），提示「这张发票没有接收邮箱」 | 订单 261011ZGA2PHWZ（无会话） |
| TC-ORD-019 | 通过 | 故障注入（once）后生成 INV-2026-000004，弹层关闭；发票记录「会话失败 Shopee 返回错误（error_server）…」「邮件已发送」，PDF 可下载；买家视图无发票图片 | 邮箱 invoice19@demo.test；故障已被消费，`faults` 为空 |
| TC-ORD-020 | 待人工 | — | 执行者 = 人工 |
| TC-TKT-001 | 通过 | webhook type 12 HTTP 200；T-1021 退货退款、待处理、平台截止、剩 47 时、Arif Rahman，D1 = 10-14 07:36；同意退货后「等待中 · 等买家」、AWAITING_BUYER_SHIP；买家寄回后「处理中 · 待验货」、截止 10-14 07:37 ≠ D1；收货后同意退款后 RETURN_OR_REFUND_REQUEST_COMPLETE、已解决；时间线依次为平台事件建单 / Arif Rahman 同意退货 / 平台事件 · 等买家寄回 / 平台事件 · 待验货 / Arif Rahman 收货后同意退款 / 平台事件 · 退款完成，两条人工动作来源「页面」 | 冒烟。另见：「平台事件 · 等买家寄回」「平台事件 · 退款完成」两条的来源也标「页面」（接口 `source=page`），「建单」「待验货」标「平台」；用例未约束平台事件的来源，未计入判定 |
| TC-TKT-002 | 通过 | 退货推送 200；T-1023 负责人林晓；工作台「我处理中」B 的会话行显示「工单 T-1023 · 剩 47 小时 59 分」 | 全局设置：周一接待时间原值 09:00–18:00、无节假日，07:38:14 改为 00:00–23:59，07:38:35 改回原值 |
| TC-TKT-003 | 通过 | 看板 T-1025 卡片有锁图标（标签「平台驱动，不能手动改状态」），没有「改状态」按钮；详情「由平台事件关闭」置灰，悬停「平台类工单的状态只随平台事件变化；在订单页处理售后后会自动推进」；接口 409 `/errors/not-allowed`（`platform_driven`） | |
| TC-TKT-004 | 通过 | RETRY_SHIP 推送 200；T-1028 物流异常、关联 261011FRB73GLU、待处理、截止 10-14 07:41 = S；看板卡片无锁，改「处理中」后位于「处理中」列，时间线「Arif Rahman 改为 处理中 · 物流异常」来源页面；再改「已解决」后状态已解决 | 首次执行脚本取列名出错重跑，T-1026、T-1027 为重跑前的同类工单（已解决） |
| TC-TKT-005 | 通过 | 关掉自动建单后 R = 11（界面与接口一致）；Demo TikTok MY 新单 576447445781518378 申请退货推送 200；刷新后仍 11，列表中没有该单 | 全局设置：「退货退款 自动建单」原值开启，07:42:06 关闭，07:42:21 恢复开启；后置未重建 |
| TC-TKT-006 | 通过 | 弹层提示「已有同一张未结工单 T-1029，不能重复建。打开 T-1029」；接口 409 `/errors/duplicate`，`extra.number = T-1029`；点链接进入 T-1029 详情 | 建工单弹层没有「退货单」选择项，只有「关联订单」；请求体只带 `orderId`，按订单 + 类型命中去重 |
| TC-TKT-007 | 失败 | 步 1：类型选「内部确认」后负责人显示只读的「Nur Aisyah（本人）」与提示「员工建的工单只能由自己负责」，预期文案「本人（默认）」未出现（不能改这一点成立）。证据 `docs/test-runs/run-002-TC-TKT-007-1.png` | 步 2、3 通过：T-1030 负责人 Nur Aisyah、商户时限、截止 10-13 18:00（周一 07:45 建单，按周一至周五 09:00–18:00 推算的 1 个工作日后）；指定 Mei Lin 返回 403 `/errors/forbidden`、`assignee_not_allowed`。入口偏差：会话没有订单时右栏没有「建工单」，改用会话头部的「建工单」图标按钮 |
| TC-TKT-008 | 通过 | T-1033 开票、Demo Shopee MY、负责人 Nur Aisyah、商户时限；Nur 未读 4 → 5，新增「新工单 T-1033 开票」，弹层可见 | 第一次执行在通知弹层定位失败中断，留下同类工单 T-1031 |
| TC-TKT-009 | 通过 | T1 = T-1035（缺货 / 到货跟进，关联 261011JSDBJRK4）；再建 409 `/errors/duplicate`，弹层「已有同一张未结工单 T-1035…打开 T-1035」；看板改 T-1035 已解决后再建得 T-1036；不关联订单连建两张内部确认 T-1037、T-1038 | 第一次执行脚本解析响应出错中断，留下 T-1034 |
| TC-TKT-010 | 通过 | Nur 的 `/tickets` 有 T-1039、无 T-1040，筛选栏只有类型 / 状态 / 平台与导出，没有「我的 / 全部」；`scope=all` 200，负责人只有 Nur Aisyah；T-1040 详情 404 `/errors/not-found` | |
| TC-TKT-011 | 通过 | T-1042 从「待处理」列移到「等待中」列；时间线「Nur Aisyah 改为 等待中 · 等内部」，来源页面，`waitingOn=internal` | |
| TC-TKT-012 | 通过 | T-1047 作废（原因「重复建单」）；T-1046 时限 10-13 18:00 → 10-14 18:00，时间线有改时限记录；审计日志工单模块有「Arif Rahman · T-1047 作废：重复建单」「Arif Rahman · T-1046 时限改为 10-14 18:00」；员工调 void、due 均 403 `/errors/forbidden` | 第一次执行作废弹层定位失败中断，留下 T-1044、T-1045 |
| TC-TKT-013 | 通过 | Nur 加备注后时间线「Nur Aisyah 加备注 · 已联系仓库」；Arif 改派 T-1050 给 Mei Lin，时间线「Arif Rahman 改派给 Mei Lin」；Mei 新增「工单 T-1050 内部确认 改派给你」 | 步 2 下拉为 Arif Rahman、Auth Two、Mei Lin、Nur Aisyah、Nur New、Run2 Mei、Used Link、林晓、陈卓：比用例列的 5 人多 4 人，都是 auth 组本轮新增、负责 Demo Shopee MY 的启用员工（`GET /members` 逐一核对），「只列负责该店的启用成员与管理员」成立。第一次执行留下 T-1048、T-1049 |
| TC-TKT-014 | 通过 | 类型「内部确认」19 行全为内部确认；状态「等待中」+ 平台 Shopee 2 行（T-1042、T-1015）都符合；CSV 2 行与列表一致，含「时限来源」「平台原始状态」列 | |
| TC-TKT-015 | 通过 | 已解决的 T-1052 改 in_progress → 409 `/errors/not-allowed`（`illegal_transition`）；作废 → 409 `/errors/not-allowed`（`ticket_finished`）；平台类 T-1054 改时限 → 409 `/errors/not-allowed`（`platform_due`）；T-1055 改 in_progress 后 version 2，用 version 1 改 resolved → 409 `/errors/conflict`（`version_mismatch`） | |
| TC-TKT-016 | 通过 | 场景 T-1056；第 1 次 `ticket.scan`（reminded 1）后 Arif 新增「工单 T-1056 退货退款 即将到期」，侧栏工单徽标前后都是 1；第 2 次 reminded 0，Arif 无新增 | |
| TC-TKT-017 | 通过 | 场景 T-1057；`ticket.scan` 退出码 0（overdue 1）；Arif 的 `/tickets` 中 T-1057 行标「已超时 1 时」；Nur、Arif 各新增「工单 T-1057 内部确认 已超时」；第 2 次 overdue 0，两人无新增工单通知 | 期间两人各收到一条 convai 组的会话通知，与本用例无关 |
| TC-TKT-018 | 通过 | 场景 T-1058；`ticket.auto_close`（closed 1）后 T-1058 已关闭，时间线「自动关闭 · 已解决超过 7 天」，来源系统 | |
| TC-TKT-019 | 通过 | 场景会话 scenario.99fa69d8；`handover.scan` 后有 T-1072 跨班交接，关联该会话，负责人 Arif Rahman，截止 10-13 10:00（下个工作时段周二 09:00 + 1 小时）；第 2 次 created 0 | 全局设置：场景把周一接待时间改为 00:00–08:00（08:01:30），08:01:47 改回 09:00–18:00。副作用：同一次 `handover.scan` 另建 13 张跨班交接工单（T-1059–T-1071），落在 convai 组会话与种子会话上，均未结 |
| TC-TKT-020 | 待人工 | — | 执行者 = 人工 |
| TC-DASH-001 | 通过 | Arif「近 7 天」：会话段 76、人工首响中位 30 分、草稿处置、按人统计、工单区都有数据或「数据不足」；平台口径分 Shopee、TikTok Shop 两张表并各写口径，只有 Demo Shopee MY、Demo TikTok MY；接口 `platformMetrics` 同为这两家；owner 同范围 4 家店，会话段 88 ≥ 76 | 平台指标值为「接口未返回 / 还没有取到平台数据」（本轮未跑 `shop.metrics`） |
| TC-DASH-002 | 通过 | 原位显示「这个页面只对管理员、组长开放」「你在「Demo Store」的角色是员工…」与「返回工作台」（`/wb`） | |
| TC-DASH-003 | 通过 | 本月：原样发送 1 → 2，忽略 2 → 3，转人工原因「人工转交」2 → 3；改「近 90 天」后 `/api/v1/dashboard?range=90d` 200、页面 07-15 至 10-12 无报错；「导出报表」CSV 列含「会话段」与原样发送 / 改后发送 / 忽略 / 过期 | 转人工原因的标签是「人工转交」（`reason=manual`），用例写「人工」。第一次执行时两个新买家的首条消息被「转人工：用量上限」（当时用量被其他组置满，之后恢复为 65 / 2000），未生成草稿，换两个新买家重做 |
| TC-DASH-004 | 待人工 | — | 执行者 = 人工 |

## 全局设置改动与还原

| 设置 | 原值 | 改动时段（当地） | 还原 |
| --- | --- | --- | --- |
| 接待时间 · 周一 | 工作，09:00–18:00；无节假日 | 07:38:14–07:38:35 改 00:00–23:59（TC-TKT-002） | 已还原，接口复核 |
| 工单类型 · 退货退款 自动建单 | 开启 | 07:42:06–07:42:21 关闭（TC-TKT-005） | 已还原，接口复核 |
| 接待时间 · 周一 | 工作，09:00–18:00 | 08:01:30–08:01:47 被场景 `handover-candidate` 改为 00:00–08:00（TC-TKT-019） | 已手工改回，接口复核 |
| 故障注入 · Demo Shopee MY 卖家发送 | 无 | 07:34:51 设 once（TC-ORD-019） | 已被消费，`faults` 为空 |

AI 替身未改动（`normal`、`sticky=false`）。用例后置均为「无」，未执行 `db:reset`。
