# RUN-001 · 组 convai · 会话与工作台 / AI 出稿 / 接待设置

- 执行：AI（convai 组），2026-10-12 03:29–04:46（Asia/Kuala_Lumpur，周一；基线时段在工作时间外）
- 环境：§3 本地行，http://127.0.0.1:3360，`AI_MODE=stub`；与账号 / 团队 / 权限组共用同一个库，基线 = 起跑时的库
- 手段：UI 步骤用 Playwright + 本机 Edge（headless，复用接口登录得到的会话 cookie）；接口用带 cookie 的 HTTP 请求；模拟器动作走 `POST /api/mock/sim/{action}`、读数走 `GET /api/mock/sim/state`；AI 替身 `PUT /api/dev/ai-stub`、故障注入 `PUT /api/mock/sim/faults`；定时任务 `pnpm job`，时间数据 `pnpm scenario`。用例前置里的「固定为工作时间内 / 外」、店铺模式用接口改（与界面保存同一接口），用例步骤本身要求的设置改动在界面上做
- 计数：通过 61 · 失败 7 · 待人工 2 · 阻塞 3 · 跳过 1（共 74）
- 全局设置：每条用例改完立即改回，结束时核对过一遍与起跑原值一致——接待模式（四店）、工作时间与节假日、转人工关键词、置信度阈值 0.60、待认领提醒 10 分钟、接待时限 15 分钟、提示词（三段均为内置默认、品牌语气为空）、工单类型配置（含自动关闭 7 天）、快捷回复（空）、AI 替身 `normal` / `sticky=false`、故障注入（空）、TikTok MY 坐席接单 true。`usage-exhausted`、`usage-near-quota` 两个场景改了当期用量与订阅提醒设置，产品没有改回入口，用 SQL 恢复为原值（额度 2,000、加购 0、已发提醒 []、超量 stop、提醒 80/100 发给所有者站内；已用按「原值 74 + 场景期间新增」回填）
- 环境问题（不针对单条用例）：§3 说模拟器推送日志显示载荷，实际只显示摘要，原始载荷要从模拟库 `mock_push_log.body` 读；侧栏工作台子项计数比列表标签晚约 30 秒刷新

| 用例 | 结果 | 现象 / 证据 | 备注 |
| --- | --- | --- | --- |
| TC-CONV-001 | 通过 | 改文本与 message_id、`Authorization: 0000` → 401 `/errors/signature`；owner 打开该会话，时间线只有前置消息，没有「签名错误测试」 | 模拟器推送日志只显示摘要，不显示原始载荷；载荷从模拟库 `mock_push_log.body` 读取（§3 写「推送日志显示载荷」与实际不符） |
| TC-CONV-002 | 阻塞 | 前置「先执行 TC-SHOP-001」不满足：本轮还没有商户接入 Wizard 应用 2001001（模拟器 Wizard 店都是 unauthorized，库里 Signup Store 没有店铺）。由本组去接入会改写模拟平台 2001001 的回调与订阅、Wizard 店授权状态，破坏店铺组 TC-SHOP-001、003、006 等用例的初始条件，所以没有执行 | 补充的等价验证（不计入结果）：在 Demo Shopee MY（应用 1000101，Key `mock-key-1000101`）上新买家发「重放测试」，同一条推送按正确签名连发两次均 200，时间线仍 1 条。建议店铺组跑完 TC-SHOP-001 后用其商户补跑 |
| TC-CONV-003 | 阻塞 | 同 TC-CONV-002：前置 TC-SHOP-001 不满足，未执行 | 补充的等价验证（不计入结果）：Demo Shopee MY 的推送改 `shop_id=999999`、新消息 ID、文本「未知店铺convai」并正确签名 → 200；顶栏搜索与五个分组都没有该消息，`inbound_event` 记为 ignored |
| TC-CONV-004 | 失败 | 步 1：列表标签「已结束」没有数字（接口 `counts.done`=4），侧栏「同事处理中」「已结束」没有数字（列表标签「同事处理中 20」）；1440 宽时标签行被截断，「已结束」不可见。步 4：工作台只有平台下拉，没有店铺筛选控件，无法按店铺选 Demo TikTok MY。证据 `docs/test-runs/run-001-TC-CONV-004-1.png`、`docs/test-runs/run-001-TC-CONV-004-4.png` | 步 2 通过：接口 counts queue 10 / ai 7 / mine 1 / team 20 与页面一致；步 3 通过：选 TikTok 后 4 行全是 TikTok |
| TC-CONV-005 | 通过 | 步 1 行上「Nur Aisyah 处理中」无已等时长；步 2 买家再发后 8 秒移到「我处理中」顶部，显示「买家再回复 · 等 不到 1 分钟」；步 3 两分钟后「等 2 分钟」；步 4 回复后行上不再显示已等时长 | 工作台按钮文案是「认领」，不是用例写的「认领并回复」，前置按「认领」执行。买家 convai-C005 |
| TC-CONV-006 | 通过 | 工作时间内：C（scenario.9026413a）在待认领顶部，「等 11 分钟 · 超过接待时限」带警示图标，文字用 warning 色；改为工作时间外后刷新：「待认领 · 等 11 分钟」，普通链接色，无警示图标与「超过接待时限」 | 改过又改回：工作时间（周一 00:00–23:59 → 关 → 恢复 09:00–18:00）、接待时限 15→10→15 分钟 |
| TC-CONV-007 | 通过 | 「我处理中」行显示「工单 T-1050 · 剩 38 小时 15 分」；右栏工单小节列出 T-1050，点后进入 `/tickets/01a12c7e-…4a8f` | 买家 convai-C007 |
| TC-CONV-008 | 失败 | 步 1：图片在时间线里是普通 `<img>` 缩略图，点击没有打开大图、没有弹层或新页（「缩略图可点开」不满足）；其余（文字带「译 · Shopilot」译文、订单卡含订单号 / 金额 / 状态、本方退货退款卡已发送，按时间排列）符合。步 3：Shopee 买家 B2 的「Bila sampai?」下方没有任何译文，接口 `translation`、`translationSource` 均为 null（预期平台译文「译 · Shopee」）。证据 `docs/test-runs/run-001-TC-CONV-008-1.png`、`docs/test-runs/run-001-TC-CONV-008-3.json` | 步 2 通过。前置不可照做：订单刚下单（AWAITING_SHIPMENT）时「退货退款卡」提示「只能发给运输中、已送达或已完成的订单」，发送按钮置灰；改为把 O 推进到 IN_TRANSIT 后再发（用例前置需补「推进到 IN_TRANSIT」）。入口文案为「发卡片」，不是「发送卡片」。步 3 判断：模拟 Shopee 推送不带平台译文，实现（模拟平台）问题 |
| TC-CONV-009 | 待人工 | — | 执行者 = 人工 |
| TC-CONV-010 | 待人工 | — | 执行者 = 人工 |
| TC-CONV-011 | 通过 | 已结束会话页没有输入栏，没有认领、结束会话、转交按钮；页头「Demo Shopee MY · 已结束」，底部「会话已结束。买家再发消息时会开新的会话段…」 | 基线下 Nur 的「已结束」为空，先建买家 convai-C011 由 Nur 认领后结束，再执行 |
| TC-CONV-012 | 通过 | Playwright 同时点两个浏览器的「认领」：Mei 200 胜出；Nur 409 `/errors/conflict`，`extra.claimedBy` = Mei Lin；Nur 页 toast「没有认领成功 Mei Lin 已经认领了这个会话。」，页面刷新为只读（无输入栏与操作按钮）；只有 Mei 的「我处理中」有 C | 替身「低置信 0.4」一次性，已被本条消费，回到 normal。买家 convai-C012 |
| TC-CONV-013 | 通过 | version v+1 → 409 `/errors/conflict`，`extra` 带 `claimedBy:null`、`version:2`、`handlingState:awaiting_human`；version v → 200，处理人 Nur Aisyah；再发一次 → 200 | 买家 convai-C013 |
| TC-CONV-014 | 通过 | 对话框「转交会话」列出接手人并有「关联的 1 张未结工单一并转交（T-1051）」勾选项；选 Mei Lin 勾选后转交，对话框关闭，Nur「我处理中」不再有该会话；Mei「我处理中」有该会话，通知弹层第一条「Nur Aisyah 把会话和 1 张工单转给了你 · convai-C014」；owner 打开 T-1051：负责人 Mei Lin，时间线「Nur Aisyah 改派给 Mei Lin · 原负责人 Nur Aisyah」 | 按钮文案为「转交给同事」（用例写「转交给其他客服」）。接手人列表除 Mei Lin、Arif Rahman、林晓、陈卓外还有 Nur New、Run1 Mei、Used Link（并行的账号组在 Demo Store 新加的成员）。通知没写工单号，只写「1 张工单」 |
| TC-CONV-015 | 通过 | Arif 的转交对话框接手人只有「林晓 · 管理员」「陈卓 · 管理员」；`members/options?shopId=<Demo TikTok MY>` 200，items 为 Arif Rahman、林晓、陈卓；assign 给 Nur → 422 `/errors/validation`（`code: assignee_not_allowed`） | 改过又改回：工作时间（周一 00:00–23:59 → 恢复）。买家 convai-C015 |
| TC-CONV-016 | 通过 | Nur assign 同事 Mei 处理中的会话 → 404 `/errors/not-found`；owner 打开 C：「Demo Shopee MY · Mei Lin 处理中」 | 买家 convai-C016 |
| TC-CONV-017 | 失败 | 步 1：Arif 的「同事处理中」有 C，但行上显示「买家再回复 · 等 不到 1 分钟」，不显示处理人 Nur Aisyah（买家消息是最后一条的行都只显示等待时长，处理人名只在我方最后回复的行上出现，如 convai-C005「Nur Aisyah 处理中」）。证据 `docs/test-runs/run-001-TC-CONV-017-1.png` | 步 2、3 通过：转交给 Mei Lin 后接口 `claimedBy` = Mei Lin，Mei「我处理中」有 C、Nur 没有。按钮文案为「转交给同事」，不是「分配给客服」。买家 convai-C017（同屏 convai-C016 同样现象） |
| TC-CONV-018 | 通过 | 确认框「这个会话还有 1 张未结工单（T-1052），结束会话不影响工单」；结束后进「已结束」、无输入栏；模拟器该买家 TikTok session `sessionOpen=false`；T-1052 状态仍为 open（待处理） | 按钮无可见文字，可读名称为「结束会话（同步结束 TikTok 会话）」，用例写「结束会话：同时调用 TikTok End Session」。改过又改回：工作时间。买家 convai-C018 |
| TC-CONV-019 | 通过 | 结束按钮可读名称与悬停提示为「结束会话（Shopee 没有结束会话接口，只在 Shopilot 内结束）」；确认后进「已结束」；对已结束会话再 close → 200 | 文案与用例只差标点（括号 vs 冒号）。买家 convai-C019 |
| TC-CONV-020 | 通过 | 两次 POST 均 201，`message.id` 相同（01a12c8b-b403-…）；模拟器买家视图「幂等测试」1 条；刷新后时间线 1 条 | 买家 convai-C020 |
| TC-CONV-021 | 通过 | 约 2 MB PNG：`POST /api/v1/files` 201，消息 201，时间线出现图片且标「已发送」；模拟器买家视图收到卖家图片 | 买家 convai-C021 |
| TC-CONV-022 | 通过 | 11 MB JPG：上传 413 `/errors/too-large`，toast「图片没有发出 图片不能超过 10 MB。」；GIF：415 `/errors/unsupported-type`，toast「只支持 JPG、PNG、WebP 图片。」；10,485,760 字节 PNG：上传 201，图片发出（已发送） | 在 convai-C021 会话执行 |
| TC-CONV-023 | 通过 | 输入 2,001 字：发送按钮置灰，计数器红字「2001 / 2,000」；接口 2,001 字 → 422 `/errors/validation`；删到 2,000 字后可发，模拟器买家视图收到完整 2,000 字 | 「提示超过 2,000 字」由红色计数器表达，没有单独的文字提示。买家 convai-C023 |
| TC-CONV-024 | 失败 | 步 1：入口为「发卡片」，打开的是弹层（标签：订单卡 / 物流卡 / 退货退款卡 / 商品卡），没有「优惠券卡片」项，优惠券是输入栏里单独的「发优惠券」按钮；商品卡置灰，原因直接写在弹层里「商品卡不可用：店铺没有授予商品读取权限，商品卡不可用。」，悬停无提示，文案与预期「店铺还没给 Shopilot 商品权限，暂时选不了商品」不同。证据 `docs/test-runs/run-001-TC-CONV-024-1.png` | 步 2–5 通过：模拟器依次收到订单卡（订单号 O）、物流卡（订单号 O）；「发优惠券」弹层列出 2 张聊天可发的券，发出第一张后模拟器收到优惠券卡「RM5 off min. spend RM50」。判断：用例文案取自原型 `docs/ui-interactions.md`，DESIGN `PAGE-WB-CARDS` 只要求写「未授予商品读取权限」，以用例与原型对齐问题为主；实现文案「商品卡不可用」重复两次。改过又改回：工作时间。买家 convai-C024 |
| TC-CONV-025 | 通过 | Shopee 会话输入栏只有发图片、快捷回复、翻译、发送，没有发卡片与优惠券入口；`order_card` → 409 `/errors/not-allowed`（「Shopee 店不支持发送这种卡片。」）；`GET /shops/<S>/coupons` → 409 `/errors/not-allowed` | 买家 convai-C025 |
| TC-CONV-026 | 失败 | 步 2：接口 502 `/errors/platform`，但 `extra` 只有 `messageId`，没有 `platformCode`（平台错误码 error_server 只出现在 `detail` 文本里）。证据 `docs/test-runs/run-001-TC-CONV-026-2.json` | 步 2 其余符合：toast 与消息下方「Shopee 返回错误（error_server）：Something wrong. Please try later.」、消息标「发送失败」带「重试」，买家视图无此条。步 3、4 通过：重试 200 后「已发送」，买家视图 1 条；对已发送消息 retry → 409 `/errors/conflict`。故障为 once，已消费，GET faults 为空。买家 convai-C026 |
| TC-CONV-027 | 通过 | 发送后 10.1 秒接口 504 `/errors/platform-timeout`，消息下方「Shopee 10 秒内没有响应，结果未知，请先刷新确认再决定是否重试。」；刷新后该消息「发送失败」、原因超时、有「重试」 | 故障为 once 已消费，GET faults 为空。在 convai-C026 会话执行 |
| TC-CONV-028 | 通过 | 买家再发「还有一个问题」8 秒后该会话在「AI 草稿」顶部，不在「已结束」；时间线上一段末尾有分段行「Nur Aisyah 结束了会话 · 04:05」，新草稿正文针对「还有一个问题」，处理人为空（`claimedBy` null，状态 bot） | 买家 convai-C028 |
| TC-CONV-029 | 通过 | Mei 结束后买家再发，8 秒后在 Mei「待认领」顶部；打开后无草稿，页头「Demo TikTok TH · 待认领 · 店铺未开 AI」，接口 `handoffReason=shop_off` | 买家 convai-C029 |
| TC-CONV-030 | 通过 | 推送 HTTP 200；右栏「本段分类 售中」，依据「自动：订单 2610116Z40NDRT SHIPPED」 | 买家 convai-C030 |
| TC-CONV-031 | 失败 | 步 2：审计日志只有「Nur Aisyah 把阶段改为 aftersale」（模块工作台，action `stage_changed`）：没有原阶段「售中」，新阶段显示为英文枚举 aftersale 而不是「售后」。证据 `docs/test-runs/run-001-TC-CONV-031-2.png` | 步 1 通过：下拉选售后后显示「售后 · 手动：Nur Aisyah 手动改判」（`stageSource=manual`）；步 3 通过：结束后买家再发，新段「售中 · 自动：订单 2610116Z40NDRT SHIPPED」。买家 convai-C030 |
| TC-CONV-032 | 阻塞 | 前置要求另注册新商户接入 Wizard Shopee MY，并对它设「订单读取」持续故障；原因同 TC-CONV-002，未执行 | 没有等价验证手段（需要「订单镜像未完成首次同步」的店） |
| TC-CONV-033 | 通过 | 无订单买家：售前，「自动：本店无订单」；B2（订单 COMPLETED 后申请退货）：售后，「自动：退货 26101105762TKYM REQUESTED」；B3（订单 CANCELLED）：售前，「自动：近 60 天无进行中订单」 | 模拟器没有把订单直接推进到 CANCELLED 的动作，B3 用「未付款下单 + 买家申请取消」得到 CANCELLED。买家 convai-C033a / b / d（convai-C033c 是构造失败留下的 READY_TO_SHIP 单，未使用） |
| TC-CONV-034 | 通过 | 买家泰语消息下方「译 · Shopilot [译文] พัสดุของฉันอยู่ที่ไหน」（stub 替身译文，非空）；输入「您的包裹今天发出」选「译成泰语」发送，时间线该条显示译文「[译文] 您的包裹今天发出」与「原文 您的包裹今天发出」；模拟器买家收到「[译文] 您的包裹今天发出」，与原文不同 | 刚打开会话的第一屏译文尚未出现，几秒内补上。改过又改回：工作时间。买家 convai-C034 |
| TC-CONV-035 | 通过 | 「新增快捷回复」保存后提示「已新增「发货时间」」；Nur 在售中会话点「快捷回复」，弹层「当前会话段：售中」、默认选中「售中」，列表有「发货时间」；点后弹层关闭，输入框为「订单会在 1–2 个工作日内发出。」，买家视图无新消息；切到「全部」列出全部快捷回复 | 全商户只有这 1 条快捷回复，「全部」未能区分多阶段。改过又改回：用例结束后删除了「发货时间」快捷回复（DELETE 204，列表回到空）。买家 convai-C035 |
| TC-CONV-036 | 通过 | `pnpm job unclaimed.remind` 退出码 0；Arif 新增 1 条「scenario.be902278 待认领已超过 10 分钟 · 买家还在等回复，请安排同事认领。」（通知弹层首条可见），Nur 无新增；再跑一次，Arif 无新增 | 会话 01a12c98-4b2b-…（scenario.be902278） |
| TC-CONV-037 | 通过 | 待认领提醒选「不提醒」并保存，toast「已保存，下一条入站消息起生效」（接口 `unclaimedRemindMinutes=null`）；`pnpm job unclaimed.remind` 退出码 0，Arif 通知无新增 | 改过又改回：待认领提醒 10 分钟 → 不提醒 → 10 分钟。会话 scenario.fcc5b91e 留在待认领 |
| TC-CONV-038 | 通过 | `pnpm job conversation.idle_close` 退出码 0；Nur「已结束」有 scenario.d0cb38c0，「我处理中」没有；时间线末尾「72 小时无新消息，会话自动结束 · 04:14」 | 会话 01a12c99-dfe9-… |
| TC-CONV-039 | 通过 | Nur 打开待认领的 C：只有「认领」，没有结束会话；Nur 调 close → 403 `/errors/forbidden`（「只能结束自己处理中的会话。」）；Arif 页面有结束按钮，确认后 C 进「已结束」 | 按钮文案为「认领」（用例写「认领并回复」）。替身「低置信 0.4」一次性已消费。买家 convai-C039 |
| TC-AI-001 | 通过 | 推送 code 10 HTTP 200；列表内「AI 草稿」标签计数 ≤10 秒加 1 并出现该会话（店铺 Demo Shopee MY）；草稿区正文 X、置信度 0.85、三个按钮；认领并发送后时间线 1 条本方消息「已发送」、进「我处理中」；买家视图 1 条卖家消息 = X；10 秒后刷新仍 1 条；用量 19→20、辅助草稿 18→19 | 冒烟。侧栏「AI 草稿」数字比列表标签晚约 30 秒才更新。买家 convai-AI001-20233 |
| TC-AI-002 | 跳过 | — | 主会话在全部组结束后单独执行（要切 AI_MODE=deepseek 并重启 dev server） |
| TC-AI-003 | 通过 | 保存提示「已保存，下一条入站消息起生效」；3 秒出草稿；最近一次请求：system 以「【售中测试标记】」开头、护栏 G 为 system 结尾，user 部分含 `brand_voice`「【语气标记】语气亲切」、`order_facts` 订单 261011ZAJQC8Z2 / SHIPPED、买家原文「我的包裹到哪了」；没有检索或资料引用段 | 改过又改回：售中提示词「恢复默认」、品牌语气清空；售中版本列表因此多 1 条历史版本（无法删除）。买家 convai-AI003 |
| TC-AI-004 | 通过 | 25 条推送均 HTTP 200；最后一份草稿的请求里 `conversation` 共 20 条，从「第 06 条」到「第 25 条」，不含「第 01 条」至「第 05 条」 | 买家 convai-AI004 |
| TC-AI-005 | 通过 | Nur 打开待认领的 C：页头「待认领 · 影子模式」，没有草稿区与影子回复；Nur 调详情接口 `shadowDrafts` 为 null；Arif、owner 打开 C：买家消息下方折叠的「AI 影子回复（未发送）· 置信度 0.85」，展开显示正文，没有发送按钮；`/billing` 影子生成 0 → 1；买家视图无卖家消息 | 改过又改回：Demo Shopee MY 模式 assist/assist → shadow/shadow → assist/assist（前置用接口改）。买家 convai-AI005 |
| TC-AI-006 | 通过 | Demo TikTok TH 新买家：Mei「待认领」有该会话，无草稿，页头「待认领 · 店铺未开 AI」；`/billing` 已用仍为 67；最近一次请求与 R0 相同 | 买家 convai-AI006 |
| TC-AI-007 | 通过 | 6 秒内买家视图收到 1 条卖家回复；owner 打开 C：回复的发送方标「AI」、已发送，会话无处理人；接口 `handlingState=bot`；「AI 草稿」分组有 C（行上「AI 接待中」）；审计日志工作台模块有「系统 · AI 自动回复 convai-AI007」（action `draft_disposed`） | 审计行只写「AI 自动回复」，没有单独的「原样发送」「模式 auto」字样，行不可展开。改过又改回：工作时间（周一关 → 恢复）。买家 convai-AI007 |
| TC-AI-008 | 通过 | 替身「非 JSON 文本」：3 秒后会话进 Nur「待认领」，无草稿，页头「待认领 · 模型出错」，接口 `handoffReason=model_error` | 替身一次性已消费。买家 convai-AI008 |
| TC-AI-009 | 通过 | 替身「超时」：4 秒后会话进 Nur「待认领」，无草稿，页头「待认领 · 模型超时」，接口 `handoffReason=timeout` | 替身一次性已消费。买家 convai-AI009 |
| TC-AI-010 | 失败 | 步 3：审计日志工作台模块有「Nur Aisyah 改后发送了 AI 草稿」（action `draft_disposed`），但行上、行点击、CSV 导出都没有编辑距离（预期 5），无法核对。证据 `docs/test-runs/run-001-TC-AI-010-3.png` | 步 1、2、4 通过：点「改后发送」输入框填入 X；末尾加「（已核实）」发送，买家收到「X（已核实）」；看板「本月」改后发送 0 → 1。买家 convai-AI010 |
| TC-AI-011 | 通过 | 点「忽略」后草稿区消失，会话进「待认领」，页头「待认领 · 人工转交」（接口 `handoffReason=manual`）；看板「本月」忽略 1 → 2 | 买家 convai-AI011 |
| TC-AI-012 | 通过 | 第二问推送 200；之后草稿区只有 1 份草稿（生成于 20:23:52，晚于第 1 步 20:23:50），不再有 D1；最近一次请求最后一条买家消息为「第二问：能改地址吗」 | 买家 convai-AI012 |
| TC-AI-013 | 通过 | 打开 C 草稿区有一份草稿；`pnpm job draft.expire` 后刷新草稿区消失（接口 `draft` null）；看板「本月」过期未处理 0 → 1 | 会话 scenario.4d801048 |
| TC-AI-014 | 通过 | ignore 200；再 ignore 200；用该草稿 ID 发送（disposition sent）→ 409 `/errors/conflict`（`extra.draftStatus=ignored`） | 买家 convai-AI014 |
| TC-AI-015 | 通过 | 工作时间外 Demo TikTok MY 新买家发「我要投诉」：买家视图收到 1 条卖家安抚消息「感谢您的留言，客服同事会尽快为您处理。」；Arif「待认领」有该会话，页头「待认领 · 命中转人工关键词」（`keyword`）；Arif 通知新增 1 条「convai-AI015 需要人工接待 · 原因：命中转人工关键词」；`/billing` 已用仍为 73 | 改过又改回：工作时间。买家 convai-AI015 |
| TC-AI-016 | 通过 | 替身「低置信 0.4」：会话进 Nur「待认领」，无草稿区（无认领并发送 / 改后发送 / 忽略），页头「待认领 · AI 置信度低」（`low_confidence`）；买家视图无卖家消息 | 替身一次性已消费。买家 convai-AI016 |
| TC-AI-017 | 通过 | 工作时间外 + 替身「低置信 0.4」：买家视图只收到 1 条卖家消息（安抚句「感谢您的留言，客服同事会尽快为您处理。」）；Arif「待认领」有该会话，页头「待认领 · AI 置信度低」（`low_confidence`） | 改过又改回：工作时间；替身一次性已消费。买家 convai-AI017 |
| TC-AI-018 | 通过 | 买家只发一张图片：会话进 Nur「待认领」（行预览「[图片]」），无草稿区，页头「待认领 · 非文本消息」（`non_text`） | 新会话出现后约 2 秒内先短暂出现在「AI 草稿」组（`handlingState=bot`、无原因），随后转入待认领。买家 convai-AI018 |
| TC-AI-019 | 通过 | 面板「要求转人工」回复 JSON 的 `reason` R = `human_request`；新买家发「我要找真人」：Nur「待认领」有该会话，无草稿，页头「待认领 · 买家要求人工」，接口 `handoffReason=human_request` = R | 替身一次性已消费。买家 convai-AI019 |
| TC-AI-020 | 通过 | 工作时间外 + 故障注入 Demo TikTok MY 下一次卖家发送返回平台错误：买家视图卖家消息 0 条（≤1）；Arif「待认领」有该会话，页头「待认领 · 发送失败」（`send_failed`），AI 消息标 failed；Arif 通知新增「原因：发送失败」 | 改过又改回：工作时间；故障为 once 已消费，GET faults 为空。买家 convai-AI020 |
| TC-AI-021 | 通过 | 场景 `usage-exhausted` 后新买家：Nur「待认领」有该会话，无草稿，页头「待认领 · 出稿用量已满」（`quota`）；`/billing` 已用仍为 100；最近一次请求与 R0 相同 | 改过又改回：场景改了当期额度与订阅提醒设置，用例结束用 SQL 恢复为原值（已用 74、额度 2,000、加购 0、已发提醒 []、超量策略 stop、提醒阈值 80/100 发给所有者站内）。买家 convai-AI021 |
| TC-AI-022 | 通过 | 场景 `usage-near-quota` 后第 1 个新买家出草稿，`/billing` 已用 80；owner 通知弹层新增 1 条「出稿用量已到 80% · 本期已用 80 / 100 次…」；第 2 个新买家出草稿后已用 81，owner 无新增用量提醒；admin2 无新增 | 改过又改回：用例结束用 SQL 把当期用量恢复为「原值 74 + 场景后新增」、额度 2,000、已发提醒 []，订阅提醒设置恢复原值。买家 convai-AI022a / b |
| TC-AI-023 | 通过 | 右栏「开 Invoice / Receipt」打开开票弹层，订单 261011BEVZVVVY 与商品行（Bamboo Fibre Bath Towel Set ×1 · MYR 45.90）已预填；点「从对话提取」后 toast「已填入 4 项，发出前请核对」，抬头、地址、邮箱（及税号）填入非空值且均可编辑；关闭弹层后 `/billing` 已用仍为 77 | stub 返回的是替身值（PT Contoh Sdn Bhd 等），不是对话里的真实字段，符合 §3 约定。买家 convai-AI023 |
| TC-RCP-001 | 通过 | 把 Demo TikTok MY 工作时间内改为 auto 保存，toast「已保存 1 家店，下一条入站消息起生效」；审计日志「接待设置」模块有「林晓 · 把「Demo TikTok MY」的接待模式改为工作时间内 auto、工作时间外 auto」；新买家发消息 3 秒后买家视图收到 AI 回复 | 改过又改回：Demo TikTok MY 模式 assist/auto → auto/auto → assist/auto；工作时间。买家 convai-R001 |
| TC-RCP-002 | 通过 | Demo Shopee MY 的 auto 置灰（`aria-disabled`），悬停提示与点击 toast 均为「Shopee 平台规则禁止 chatbot 回复，评审前不开放」，点击不改选中；接口改 auto → 409 `/errors/not-allowed`（`code: shopee_auto`）；刷新后仍为 assist / assist | — |
| TC-RCP-003 | 通过 | 模拟器 Demo TikTok MY 坐席接单原为 true；把工作时间内、外都改为 off 保存，toast「已保存 1 家店，下一条入站消息起生效」；模拟器坐席接单变为 false | 改过又改回：模式 off/off → assist/auto，恢复后模拟器坐席接单回到 true |
| TC-RCP-004 | 通过 | 默认 7 个：转人工、投诉、退款、人工客服、refund、complaint、human；逐个加 kw08–kw30 后保存，刷新仍 30 个；满 30 个后输入框与「添加」都置灰，提示「已满 30 个，先移除一个再添加。」；接口 31 个 → 422 `/errors/validation`（「转人工关键词最多 30 个」）；30 个含一个 41 字 → 422 `/errors/validation`（`keywords.29`） | 满 30 个后输入框本身被禁用，第 3 步「再输入 kw31」无法键入，按「添加不可用 + 提示」判定。改过又改回：关键词恢复为原 7 个 |
| TC-RCP-005 | 通过 | 今天设为不工作后 Demo TikTok MY 新买家 20 秒内收到 AI 回复（工作时间外 auto）；固定为工作时间内并添加今天为节假日保存后，另一新买家收到 AI 回复；移除节假日保存后，第三个新买家 12 秒内无卖家回复，Arif「AI 草稿」有该会话（「草稿待审」） | 改过又改回：工作时间、节假日。买家 convai-R005a / b / c |
| TC-RCP-006 | 通过 | 阈值 0.95（界面保存）+ 替身默认 0.85：无草稿、进待认领、`low_confidence`；阈值 0.50 + 替身 0.4：无草稿、`low_confidence`；阈值 0.50 + 替身默认：出草稿（置信度 0.85）；接口 0.49、0.96 → 都 422 `/errors/validation` | 改过又改回：置信度阈值 0.60 → 0.95 → 0.50 → 0.60。买家 convai-R006a / b / c |
| TC-RCP-007 | 通过 | `responseSlaMinutes` 4 → 422、121 → 422、120 → 200；`unclaimedRemindMinutes` 7 → 422；界面待认领提醒下拉只有「5 分钟后通知组长 / 10 分钟后通知组长 / 15 分钟后通知组长 / 不提醒」四项 | 改过又改回：接待时限 15 → 120 → 15 分钟 |
| TC-RCP-008 | 通过 | 售前依次保存「售前版本 A」「售前版本 B」，「历史版本 2」弹层列出 B、A 两条，各带保存时间 2026-10-12 04:38；「恢复默认」确认后正文回到 P0，标「内置默认」，历史版本仍为 2 条（A、B）；护栏段标「护栏（不可编辑）」、未确认阶段标「固定正文 · 不可编辑」，两者都不是可编辑输入框 | 售前正文已由第 2 步恢复默认；历史版本 A、B 留在列表里（无法删除） |
| TC-RCP-009 | 通过 | 售中粘贴 6,001 字：计数「6,001 / 6,000」并提示「每段最多 6,000 字」，点保存未发出请求、未保存；接口 6,001 字 → 422 `/errors/validation`；恰好 6,000 字保存成功，刷新后仍 6,000 字；再连续保存 v2–v11 后「历史版本 10」只列 v11–v2，6,000 字版本已不在列表 | 改过又改回：售中提示词「恢复默认」；历史版本列表保留 v2–v11（无法删除） |
| TC-RCP-010 | 通过 | Arif 建开票工单 T1（T-1054），截止 D1 = 10-14 18:00（2 个工作日）；owner 把开票时限改为「1 个工作日」保存，toast「已保存，只影响之后新建的工单」；T1 截止仍为 10-14 18:00；再建 T2（T-1055），截止 10-13 18:00（建单后 1 个工作日） | 改过又改回：开票时限 2 个工作日 → 1 → 2（接口恢复，工单类型配置与原值一致）。T-1054、T-1055 留在库里 |
| TC-RCP-011 | 通过 | 退货退款行时限显示「平台：…以平台为准」，没有可编辑的时限控件；提醒阈值下拉为「截止前 3 / 6 / 12 小时」；接口改 `merchantDue {hours:24}` → 409 `/errors/not-allowed`（「退货退款的时限以平台为准，只能改提醒阈值。」）；提醒改为截止前 12 小时保存，刷新后仍为 12 小时 | 改过又改回：退货退款提醒阈值 6 → 12 → 6 小时 |
| TC-RCP-012 | 通过 | 自动关闭选「不自动关闭」保存（`autoCloseDays=null`）；场景 `ticket-resolved-8d` 得 T-1056；`pnpm job ticket.auto_close` 输出 closed 0；T-1056 状态仍为已解决 | 改过又改回：自动关闭 7 天 → 不自动关闭 → 7 天。T-1056 留在库里，恢复 7 天后定时任务会把它关闭 |

库里留下的本组对象：Demo Store 下名为 `convai-*` 的模拟买家与会话（Demo Shopee MY、Demo TikTok MY、Demo TikTok TH），其中若干带未处置的 AI 草稿或停在待认领；场景会话 scenario.9026413a、scenario.be902278、scenario.fcc5b91e（待认领）、scenario.d0cb38c0（已结束）、scenario.4d801048；工单 T-1050、T-1051、T-1052（内部确认）、T-1053（convai-C033b 退货自动建单）、T-1054、T-1055（开票）、T-1056（场景，已解决）；模拟订单若干（含 convai-C033c 的 READY_TO_SHIP 单）；售前、售中提示词历史版本（售前「售前版本 A / B」，售中 v2–v11）。
