# RUN-001 · 组 ordtkt · 订单、售后与开票 / 工单 / 看板

- 执行：AI（ordtkt 组），2026-10-12 02:22–03:30（Asia/Kuala_Lumpur，周一，执行时段在工作时间外）
- 环境：§3 本地行，http://127.0.0.1:3360，`AI_MODE=stub`，AI 替身全程为默认 `normal`、未改动；与其他组共用同一个库，基线 = 起跑时的库
- 手段：UI 步骤用 Playwright + 本机 Edge（headless）；接口用带登录 cookie 的 HTTP 请求；模拟器动作走 `POST /api/mock/sim/{action}`，推送结果读 `GET /api/mock/sim/state` 的推送日志；定时任务用 `pnpm job`，时间数据用 `pnpm scenario`
- 计数：通过 31 · 失败 10 · 待人工 3 · 阻塞 0 · 跳过 0（共 44）

| 用例 | 结果 | 现象 / 证据 | 备注 |
| --- | --- | --- | --- |
| TC-ORD-001 | 失败 | 步 2：右栏订单 261011KKHLJGGU 显示金额 MYR 43.40、「运输中」+ SHIPPED、最晚 10-14 发货、承运商 SPX Express (MY)；**没有运单号、没有轨迹事件**。模拟器已推 code 4「运单号 MY874863734333A」与 code 30「LOGISTICS_PICKUP_DONE」，均 HTTP 200；50 分钟后 `GET /conversations/{id}/buyer` 的 `tracking` 仍为 `{events:[], carrier, packageId}`，`/orders` 列表 `trackingNo:null`。状态标签为「运输中」，不是用例写的「已发货」。证据 `docs/test-runs/run-001-TC-ORD-001-2.png`、`docs/test-runs/run-001-TC-ORD-001-2.json` | 步 3 通过（K=0 → 1，金额合计 43.40）。买家 ordtkt-B001 |
| TC-ORD-002 | 通过 | 第 1 次 202，`jobIds` 4 个，提示「已开始同步 4 家店的订单」；第 2 次 429 `/errors/rate-limited`，`Retry-After: 59`，提示「稍后再试」 | |
| TC-ORD-003 | 通过 | 对话框有「先不取消」「取消订单」；右栏变「已取消」，时间线有「订单 261011JETX0YMU 已取消（买家要求），由 Nur Aisyah 操作」；模拟器 CANCELLED；审计日志有 Nur Aisyah 取消订单记录 | |
| TC-ORD-004 | 通过 | 按钮置灰，悬停「订单已发货，平台不允许卖家取消」；接口 409 `/errors/not-allowed`；模拟器仍 SHIPPED | 幂等键用 `tc-ord-004-run1-ordtkt`，避免与其他组撞键 |
| TC-ORD-005 | 通过 | 「待发货」5 行，店铺只有 Demo Shopee MY、Demo TikTok MY，含两张新单，无 TH 单；CSV 5 行、店铺列同上、状态都是待发货；售后待处理 N=2，与两店未结退货退款/取消申请工单（T-1003、T-1001）一致，点后跳 `/tickets` | 卡片文案为「售后待处理 · 2 单 · 退货退款与取消申请工单 2 张」，没有「查看工单」字样；跳转后的 `/tickets` 未带筛选，列表除这 2 张外还有其他工单 |
| TC-ORD-006 | 通过 | Nur 的 `/orders` 8 行都是 Demo Shopee MY；抽屉有订单信息、关联工单与「打开会话」「开票」「取消订单」「建工单」；TH 单接口 404 `/errors/not-found` | 「售后单」「发票」分区只在订单有对应数据时出现（用 261011QRFDMJ73、250928T5LP4W9C 核对过） |
| TC-ORD-007 | 通过 | IN_CANCEL 推送 200；T-1008 取消申请、待处理、商户时限、截止 10-13 02:40（= 现在 + 24 h，早于最晚发货 10-14）；同意取消后弹层关闭，模拟器 CANCELLED；T-1008 已解决，时间线有平台事件建单与 Nur Aisyah 处理售后 | 「处理」入口在订单详情抽屉里，不在列表行上 |
| TC-ORD-008 | 通过 | 拒绝后模拟器回到 READY_TO_SHIP；T-1009 已解决、阶段已拒绝 | |
| TC-ORD-009 | 通过 | B（Arif）同意 → CANCELLED；A（Nur）拒绝 → 409 `/errors/not-allowed`，弹层提示「订单已不在取消申请中（当前 CANCELLED）」；模拟器仍 CANCELLED。工单 T-1010 | |
| TC-ORD-010 | 通过 | T-1011 取消申请、待处理、平台截止；同意后取消单 CANCELLATION_REQUEST_SUCCESS、订单 CANCELLED；T-1011 已解决 | |
| TC-ORD-011 | 失败 | 步 2：「选择原因」下拉只有 3 项英文：You have reached an agreement with the buyer / Product was used or damaged by the buyer / Return window has expired；**没有「买家凭证不足」「其他」**，与 `GET /after-sales/{id}/reject-reasons` 返回一致。步 1：工单详情没有「处理申请」按钮，只有链接「去订单处理申请」，点后跳 `/orders` 订单抽屉，再点「处理」才出弹层（弹层内容有同意退货 / 拒绝与「剩 47 时 59 分」）。证据 `docs/test-runs/run-001-TC-ORD-011-1.png`、`docs/test-runs/run-001-TC-ORD-011-2.json` | 改选「Product was used or damaged by the buyer」继续：模拟器 REFUND_OR_RETURN_REQUEST_REJECT，T-1012 已解决、阶段已关闭。原因列表来自模拟平台，判断为模拟数据与用例 / ui-interactions 不符 |
| TC-ORD-012 | 失败 | 步 2：选「发起争议」后点「提交处理」，弹层不关，提示「请选择争议原因」，没有发出请求。证据 `docs/test-runs/run-001-TC-ORD-012-2.png` | 补选「和买家协商不成」后：模拟器 JUDGING，T-1013「等待中 · 等平台」。步 1 通过（只有同意退款 / 发起争议）。右栏入口名为「处理」而非「处理申请」；右栏工单区显示「这个会话没有未结工单」（T-1013 建于买家首条消息之前，`conversationId=null`） |
| TC-ORD-013 | 通过 | 同意退款后模拟器 ACCEPTED，T-1014 已解决（已退款）；再开弹层「同意退款」「发起争议」都不可用；接口 409 `/errors/not-allowed` | 前置问题：`agent` 调 `GET /tickets/<T>` 返回 404（T 负责人是 Arif，员工只看本人工单），售后单 ID 改由 owner 取得 |
| TC-ORD-014 | 失败 | 步 2：选「拒收」后点「提交处理」，弹层不关，提示「请选择原因」（下拉 2 项英文：Returned item does not match the order / Returned item is damaged or incomplete），没有发出请求。证据 `docs/test-runs/run-001-TC-ORD-014-2.png` | 步 1 通过（处理中 · 待验货）。补选原因后：模拟器 REJECT_RECEIVE_PACKAGE，T-1015「等待中 · 等平台」、阶段平台仲裁中；步 3 仲裁买家胜后 T-1015 已解决 |
| TC-ORD-015 | 通过 | 弹层类型 Invoice、订单 261011QRFDMJ73 与商品行已预填；生成 INV-2026-000002，弹层关闭；买家视图收到图片；发件箱有发往 invoice1@demo.test、模板 invoice、附件 INV-2026-000002.pdf 的邮件；发票记录「会话已发送 / 邮件已发送」；PDF 为 `application/pdf`，含发票号与抬头 | 冒烟 |
| TC-ORD-016 | 通过 | 标记退信后发件箱显示「已退信」；发票记录「邮件退信」并有「查看工单」；进入 T-1006（开票，关联订单 261011QRFDMJ73）；重发后发件箱新增一封，状态回到「邮件已发送」 | 「来源为规则」按接口 `origin=rule` 判定；界面显示「系统建单」，没有「规则」字样 |
| TC-ORD-017 | 通过 | RCT-2026-000002；买家视图无发票图片；发件箱有发往 receipt1@demo.test 的邮件；发票记录「会话未发送（跳过） / 邮件已发送」 | |
| TC-ORD-018 | 通过 | 勾「发送到聊天」→ 409 `/errors/not-allowed`（`no_conversation`），弹层提示不能发到聊天；取消后邮箱留空生成 INV-2026-000003，两路都「未发送（跳过）」；重发 409 `/errors/not-allowed`（`no_email`），提示没有邮箱 | 订单 261011LECRQSFM（无会话） |
| TC-ORD-019 | 通过 | 故障注入一次后生成 INV-2026-000004，提示聊天发送失败；发票记录「会话失败 + Shopee 返回错误（error_server）…」「邮件已发送」，PDF 可下载；买家视图无发票图片 | 邮箱用 invoice19@demo.test；故障为 once，已被消费，无需清除 |
| TC-ORD-020 | 待人工 | — | 执行者 = 人工 |
| TC-TKT-001 | 失败 | 步 5：「收货后同意退款」提交后，模拟器退货单为 **RETURN_OR_REFUND_REQUEST_SUCCESS**，预期 RETURN_OR_REFUND_REQUEST_COMPLETE；之后没有再推进到 COMPLETE。步 6：时间线为「平台事件建单 / Arif Rahman 处理售后 / 平台事件 · AWAITING_BUYER_SHIP（来源人工）/ 平台事件 · BUYER_SHIPPED_ITEM / Arif Rahman 处理售后 / 平台事件 · RETURN_OR_REFUND_REQUEST_SUCCESS（来源人工）」：Arif 的两条只写「处理售后」，看不出同意退货 / 确认收货，也没有平台事件「退款完成」。证据 `docs/test-runs/run-001-TC-TKT-001-5.json`、`docs/test-runs/run-001-TC-TKT-001-6.png`、`docs/test-runs/run-001-TC-TKT-001-6.json` | 冒烟。步 1–4 通过：webhook type 12 HTTP 200；T-1007 退货退款、待处理、平台截止、剩 47 时、Arif Rahman，D1 = 10-14 02:26；同意退货后「等待中 · 等买家」、AWAITING_BUYER_SHIP；买家寄回后「处理中 · 待验货」、截止 10-14 02:31 ≠ D1。入口同 TC-ORD-011（「去订单处理申请」→ 订单抽屉「处理」）；选项文案是「收货后同意退款」（与 DESIGN 一致），用例写「确认收货并退款」 |
| TC-TKT-002 | 通过 | 退货推送 200；T-1016 负责人林晓；会话行显示「工单 T-1016 · 剩 47 小时 59 分」 | 全局设置：见下方「改过又改回」第 1 条 |
| TC-TKT-003 | 通过 | 看板 T-1017 卡片有锁图标、无「改状态」；详情「由平台事件关闭」置灰，悬停「平台类工单的状态只随平台事件变化…」；接口 409 `/errors/not-allowed`（`platform_driven`） | |
| TC-TKT-004 | 失败 | 步 3：卡片无锁、移到「处理中」列，时间线新增「Arif Rahman 改为 处理中 · 物流异常」，但该行**来源标「人工」**，预期「来源页面」。接口 `source=page`；同页说明写「右侧标来源，与审计日志『来源』一致」，而审计日志同类操作的来源显示「页面」。证据 `docs/test-runs/run-001-TC-TKT-004-3.png` | 步 1、2、4 通过：T-1018 物流异常、关联 261011Y2G43APK、待处理、截止 = 最晚发货 10-14 03:01；改「已解决」成功。模拟器 RETRY_SHIP 只能从 PROCESSED 推进，先推到 PROCESSED |
| TC-TKT-005 | 通过 | 关闭「退货退款」自动建单后 R=10；新退货推送 200，12 秒后仍为 10；该订单 `openTicket=null` | 全局设置：见下方第 2 条。自动建单开关用 `PUT /api/v1/reception/ticket-types` 改，未走页面 |
| TC-TKT-006 | 通过 | 409 `/errors/duplicate`，`extra.number=T-1019`；弹层提示已有 T-1019 并给「打开 T-1019」，点后进入详情 | 建工单弹层没有「退货单」选择项，只能选关联订单，按订单 + 类型命中去重 |
| TC-TKT-007 | 通过 | 选「内部确认」后负责人显示「Nur Aisyah（本人）」与「员工建的工单只能由自己负责」，不可改；T-1021 负责人 Nur Aisyah、商户时限、截止 10-13 18:00；指定 Mei 403 `/errors/forbidden`、`assignee_not_allowed` | 文案不是「本人（默认）」。周一 03:06（工作时间前）建单，截止按「下一个工作日 18:00」推算 |
| TC-TKT-008 | 通过 | T-1022 负责人 Nur Aisyah、商户时限；Nur 通知 +1「新工单 T-1022 开票」 | |
| TC-TKT-009 | 通过 | T-1023 建成；再建 409 `/errors/duplicate` 并链到 T-1023；看板改已解决后再建得 T-1024；不关联订单连建两张内部确认 T-1025、T-1026 | |
| TC-TKT-010 | 通过 | Nur 的 `/tickets` 有 T-1027、无 T-1028，无「我的 / 全部」切换；`scope=all` 返回 `scope:"mine"`，负责人全是 Nur Aisyah；T-1028 详情 404 `/errors/not-found` | |
| TC-TKT-011 | 失败 | 步 2：时间线新增「Nur Aisyah 改为 等待中 · 等内部」，**来源标「人工」**，预期「来源页面」；审计日志同一操作来源为「页面」。证据 `docs/test-runs/run-001-TC-TKT-011-2.png` | 步 1 通过（T-1029 卡片移到等待中列） |
| TC-TKT-012 | 失败 | 步 2：T1（T-1030）建单时默认截止就是「明天 18:00」（10-13 18:00）；按用例改成同值后接口 200、提示「时限已改为 10-13 18:00」，**时间线没有时限变更**。步 3：审计日志只有 Arif 作废 T-1031，没有改 T-1030 时限的记录。证据 `docs/test-runs/run-001-TC-TKT-012-2.json`、`docs/test-runs/run-001-TC-TKT-012-3.png` | 步 1 通过（T-1031 已作废，原因「重复建单」）；步 4、5 均 403 `/errors/forbidden`。诊断：再改成 10-14 18:00 后时间线与审计都有记录，同值改动按幂等不留痕 |
| TC-TKT-013 | 通过 | Nur 加备注「已联系仓库」进时间线；Arif 改派给 Mei Lin，时间线「Arif Rahman 改派给 Mei Lin」；Mei 通知 +1「工单 T-1033 内部确认 改派给你」 | 负责人下拉 8 人：用例列的 5 人，加上其他组本轮新建的 Nur New、Run1 Mei、Used Link，三人都是启用员工且负责 Demo Shopee MY，规则成立 |
| TC-TKT-014 | 通过 | 「内部确认」10 行全是内部确认；等待中 + Shopee 2 行（T-1029、T-1013）；CSV 2 行，表头含「时限来源」「平台原始状态」 | |
| TC-TKT-015 | 失败 | 步 4：新建 T3（T-1035）的 version 是 1，按用例用「小 1」的 version=0 请求，返回 **422 `/errors/validation`**（version 须 ≥ 1），预期 409 `/errors/conflict`。证据 `docs/test-runs/run-001-TC-TKT-015-4.json` | 步 1–3 通过：已解决 T1（T-1034）改处理中、作废均 409 `/errors/not-allowed`；改平台类 T（T-1017）时限 409 `/errors/not-allowed`。诊断：T3 推到 version 2 后用 version 1 请求 → 409 `/errors/conflict`（`version_mismatch`） |
| TC-TKT-016 | 失败 | 步 1：Arif 通知 +1「工单 T-1036 退货退款 即将到期」，但侧栏工单徽标扫描前后都是 1（预期 n+1）。证据 `docs/test-runs/run-001-TC-TKT-016-1.json` | 步 2 通过（再扫无新增）。徽标口径是 API-NAV-001 的「6 小时内到期 + 已超时」，T-1036 截止在 5 小时后，场景建单后就已计入 n |
| TC-TKT-017 | 通过 | `ticket.scan` 退出码 0（overdue 1）；T-1037 行标「已超时 1 时」；Nur、Arif 各 +1「工单 T-1037 内部确认 已超时」；再扫两人都无新增 | |
| TC-TKT-018 | 通过 | `ticket.auto_close` closed 1；T-1039 已关闭，时间线「自动关闭 · 已解决超过 7 天」 | 自动关闭为默认 7 天（已核对） |
| TC-TKT-019 | 通过 | `handover.scan` 后有 T-1044 跨班交接，关联会话 C（01a12c6a-b7a5…），负责人 Arif Rahman，截止 10-13 10:00（周二 09:00 开工后 1 小时）；再扫 created 0 | 同一次扫描还给 4 个种子会话建了跨班交接 T-1040–T-1043。全局设置：见下方第 3 条 |
| TC-TKT-020 | 待人工 | — | 执行者 = 人工 |
| TC-DASH-001 | 通过 | Arif「近 7 天」：会话段 26、人工首响中位、草稿处置、按人统计、工单区都有数据；平台口径分 Shopee、TikTok 两表并各写口径，只有 Demo Shopee MY、Demo TikTok MY；接口 `platformMetrics` 同样只有这两家；owner 同范围 4 家店、会话段 35 | |
| TC-DASH-002 | 通过 | 原位显示「这个页面只对管理员、组长开放」与「返回工作台」 | |
| TC-DASH-003 | 通过 | 原样发送 10 → 11，忽略 0 → 1，转人工原因「人工转交」0 → 1；改「近 90 天」后请求 200、页面无报错；导出 `看板_近 90 天_2026-07-15_2026-10-12.csv`，含会话段与原样发送 / 改后发送 / 忽略 / 过期列 | 共享库里其他组同时在处置草稿，本次读数前后各只差 1，未受干扰 |
| TC-DASH-004 | 待人工 | — | 执行者 = 人工 |

## 改过又改回的全局设置（Demo Store）

1. TC-TKT-002「固定为工作时间内」：今天（周一）工作时段 09:00–18:00 → 00:00–23:59，约 02:58–03:00 生效，用例结束即改回 09:00–18:00，节假日为空未动。
2. TC-TKT-005：「退货退款 自动建单」开 → 关，约 03:03 持续约 15 秒，改回开；`autoCloseDays` 保持 7。期间其他组若有退货推送，不会自动建单。
3. TC-TKT-019：`pnpm scenario handover-candidate` 把今天时段改为 00:00–03:21，`handover.scan` 后改回 09:00–18:00（周一，非周末）。
4. 故障注入只设过一次 `send_message once`（TC-ORD-019），已被消费，当前列表为空。AI 替身未改动，当前 `next=normal`、`sticky=false`。

## 留在库里的对象

- 模拟器买家（前缀 ordtkt-）：B001、B003、B004、B005a/b/c、B007、B008、B009、B010、B011、B012、B013、B014、B015、B017、B019、T001、T002、T003、T004、T005、T006、T007、T009、D003a、D003b；另有一个误建的买家「x」（Demo Shopee MY，未发消息，应用里没有对应会话）。
- 工单：T-1006–T-1019、T-1021–T-1031、T-1033–T-1037、T-1039–T-1044（T-1040–T-1043 由 `handover.scan` 给种子会话建出）；T-1038 不是本组建的。
- 发票：INV-2026-000002、INV-2026-000003、INV-2026-000004、RCT-2026-000002；发件箱对应邮件（invoice1、receipt1、invoice19@demo.test）。
- 场景对象：ticket-due-soon（T-1036）、ticket-overdue（T-1037）、ticket-resolved-8d（T-1039）、handover-candidate（会话 01a12c6a-b7a5-72a7-a6af-8e6dd55b7731）。
