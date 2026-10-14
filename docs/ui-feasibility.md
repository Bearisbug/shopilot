# Quilt 原型功能与实现路径对照

核对日期 2026-10-09，2026-10-11 按 5 条新需求与三种角色更新（需求分析见 [requirements-ui-impact.md](requirements-ui-impact.md)，角色见 [roles.md](roles.md)）。原型在 Quilt 项目「Shopilot」，生成脚本在 `design/quilt/`。每个功能写明靠哪个平台接口或 Shopilot 自身数据实现；接口细节查 [platform-api](platform-api/README.md)，权限现状查《Shopilot 平台能力清单 2026-10-09》。

规则：原型上出现的功能必须能落到本表的一行；落不到的不画，待确认的不画，写进文末「未画的」。

## 平台差异怎么在 UI 上体现

页面不分平台做两套。每个店铺 / 会话带一份能力表（平台常量来自官方文档，商户配置来自接入检查，如 `granted_scopes`、是否打码；运行时实测如检查页的聊天权限），UI 只读能力表：

| 差异类型 | 做法 | 例 |
| --- | --- | --- |
| 平台没有，Shopilot 能补 | 照常显示，标来源 | 译文标「译 · Shopee」或「译 · Shopilot」；Shopee 结束会话只在 Shopilot 内生效，按钮提示写明 |
| 平台有，商户没开通 | 置灰 + 原因 + 「查看方法」 | TikTok 缺商品 scope 时商品卡置灰；Shopee 未开敏感数据时收件人打码 |
| 平台没有或未证实 | 不显示 | Shopee 会话不出现视频、卡片按钮 |

定义不同的指标（回复率、满意度）不跨平台合并，每个数旁边写口径。原型里 `/wb` 与 `/wb/tiktok` 是同一页面在两个平台下的样子；接入向导两个平台都是 4 步（选择平台 → 应用凭证 → 授权店铺 → 检查并完成），Shopee（`/shops/connect/shopee/*`）与 TikTok Shop（`/shops/connect/tiktok/*`）每步内容不同，因为两边的凭证和授权方式不同。

每个可点元素做什么、调哪个接口，逐条列在 [ui-interactions.md](ui-interactions.md)（由脚本从原型生成）。

## 聚合客服工作台 /wb

| 功能 | 实现路径 | 状态 |
| --- | --- | --- |
| 两平台、全部店铺的会话列表 | Shopee 推送 code 10 + `v2.sellerchat.get_conversation_list`；TikTok webhook 14 + `GET /customer_service/202309/conversations` | 现网在用 |
| 待认领 / AI 草稿 / 我处理中 / 已结束、认领、转交、结束 | Shopilot 会话状态机；TikTok 另有 End Session 接口 | Obsbot v2 已有 |
| 按角色收窄：员工只看负责店铺的待认领与自己处理中的会话，组长可改派负责店铺内的会话 | Shopilot 成员的角色与负责店铺（[roles.md](roles.md)） | 自研 |
| 已结束会话只读，买家再发消息自动重新打开 | Shopilot 会话状态机，入站消息触发 | Obsbot v2 已有 |
| 本段分类（阶段、产品）与人工改判 | 见「知识库与接待设置」节的阶段判定与产品识别；改判只改当前会话段并写操作日志 | 自研 |
| 会话上的工单徽标、建工单、右栏工单小节 | Shopilot 工单表按买家、订单、会话关联；建单规则见「工单」节 | 自研 |
| 买家再回复置顶、已等时长、接待时限 15 分钟 | 消息时间戳 + 商户设置的阈值 | 自研 |
| Shopee 买家显示用户名 | 消息字段 `from_user_name`；真实姓名在订单收件人里且被打码 | 现网在用 |
| TikTok 买家显示昵称 | 消息 `sender.nickname` | 现网在用 |
| Shopee 消息的中文译文 | 推送与 `get_message` 的 `content.translation` | 现网在用 |
| TikTok 消息译文、发出前译成买家语言 | Shopilot 调大模型翻译 | 自研 |
| 收订单卡、图片、退货退款卡等 | Shopee `message_type` = order / image 等；TikTok `ORDER_CARD`、`RETURN_REFUND_CARD`、`IMAGE` | 现网在用 |
| 发文字、发图片 | Shopee `send_message` + `upload_image`；TikTok Send Message + Upload Buyer Messages Image | 现网在用 |
| 发商品卡、订单卡、优惠券（仅 TikTok 会话） | TikTok Send Message 的 `PRODUCT_CARD`（需 product_id）、`ORDER_CARD`、`COUPON_CARD`（券来自 Search Coupon List，0.5 QPS） | 接口有 |
| AI 草稿：依据订单与知识起草，原样发 / 改后发 / 忽略 | Shopilot 生成链路 + 订单事实 | Obsbot v2 已有（飞书卡），待搬进工作台 |
| 买家近 180 天订单与金额 | Shopee 订单镜像（`get_order_list` 按 ≤15 天分段 + `get_order_detail`）；TikTok `orders/search` 带 `buyer_user_id` | 现网在用 |
| 订单状态、最晚发货、物流轨迹 | `order_status`、`ship_by_date`、`v2.logistics.get_tracking_info`；TikTok 订单详情 + Get Tracking | 现网在用 |
| 售后子状态（REFUND_PAID 等） | Shopee `v2.returns.get_return_list / get_return_detail`；TikTok Search Returns | 现网在用 |
| 取消订单（买家要求） | Shopee `v2.order.cancel_order`，`cancel_reason = CUSTOMER_REQUEST`，仅发货前；TikTok Cancel Order | 接口有，未接 |
| 收件人打码提示 | 本应用 `has_pii_access = false`，订单收件人字段被平台打码 | 已实测 |
| 开 Invoice / Receipt | Shopilot 生成 PDF → 图片经聊天发出 + 邮件；商品名规则自研 | Obsbot v2 已有 Invoice，Receipt 待做 |

## 工作台 · TikTok 会话 /wb/tiktok

| 功能 | 实现路径 | 状态 |
| --- | --- | --- |
| 买家昵称；买家 ID 用订单侧 `user_id` | 消息 `sender.nickname`；订单详情 `user_id`（与卖家中心一致，修 10-08 的 ID 不一致问题） | 接口有 |
| 译文标「Shopilot」 | TikTok 不提供译文，Shopilot 调大模型翻译 | 自研 |
| 「TikTok 按 24 小时内首次响应计回复率」 | Get Customer Service Performance 字段定义 | 文档 |
| 输入栏：图片、订单卡、物流卡、退货退款卡、优惠券卡 | Send Message 的 `IMAGE`、`ORDER_CARD`、`LOGISTICS_CARD`、`RETURN_REFUND_CARD`、`COUPON_CARD` | 接口有（IMAGE 现网在用） |
| 商品卡置灰 | 缺商品 scope，选不了商品 | 已实测 |
| 文字计数 0 / 2000 | Send Message 文档：TEXT 最多 2000 字 | 文档 |
| 草稿附带物流卡、物流轨迹 | Get Tracking + `LOGISTICS_CARD` | 接口有 |
| 结束会话同步到 TikTok | End Session | 接口有，未实测 |
| 订单「按买家实时查询」 | `orders/search` 带 `buyer_user_id` | 现网在用 |

## 店铺与连接 /shops

| 功能 | 实现路径 | 状态 |
| --- | --- | --- |
| 平台口径回复率（Shopee，带目标值） | `v2.account_health.get_shop_performance`（metric 11 response_rate 及 target） | 已实测 |
| TikTok 回复率、响应分钟、满意度、会话数 | `GET /customer_service/202407/performance`（24 小时内首次响应占比） | 已实测 |
| 店铺总评、客服项不达标 | `get_shop_performance.overall_performance` | 已实测 |
| 店铺类型 CNSC、履约方式 | `v2.shop.get_shop_info`：`is_upgraded_cbsc`、`shop_fulfillment_flag` | 已实测 |
| 授权到期 | `v2.public.get_shops_by_partner` 的 `expire_time`；TikTok token 响应的 `refresh_token_expire_in` | 已实测 |
| Shopee 应用密钥到期日 | 开放接口查不到：接入时在「高级」里选填；用 Partner Key 签名失败时站内加邮件提醒「应用密钥可能已到期」 | 手填 / 自研 |
| 推送与 webhook 自动配置 | 保存 Shopee 凭证时用 `get_app_push_config` 回读、`set_app_push_config` 写回调并订阅买家消息、订单、物流、退货、授权到期等推送；TikTok 授权后用 Update Shop Webhook 按店注册、Get Shop Webhooks 回读；3 天内丢失的 Shopee 推送由后台定时 `get_lost_push_message` 补拉再 `confirm_consumed_lost_push_message` | 接口有 |
| 回调已指向其他系统 | 回读到的回调不为空且不是 Shopilot 时，凭证页让商户确认「改发到 Shopilot」，因为一个应用只有一个回调地址 | 自研 |
| 最近入站、7 天零入站 | Shopilot 入站事件表 | 现网在用 |
| 需要你在平台后台处理（Shopee IP 白名单、TikTok 商品权限） | 只能商户在平台控制台操作，原型只给「查看方法」 | 引导 |
| 连接事件 | 账户健康轮询、授权续期日志、坐席设置记录 | 自研 |
| 店铺详情抽屉：授权到期、平台指标、接待模式 | 同上各接口 + Shopilot 店铺配置 | 已实测 / 自研 |
| 检查连接 | 按店各调一次店铺信息、会话列表、订单列表；Shopee 比对 `get_app_push_config` 回调，TikTok 比对 Get Shop Webhooks；逐项写原因和处理入口 | 接口有 |
| 更新应用密钥 | 商户在平台控制台重置后填入；Shopilot 先用新密钥调 `get_shops_by_partner`（TikTok 刷新一次 token）验证再替换，失败保留旧密钥 | 接口有 |
| 续期授权 | Shopee 主账号授权链接 `/api/v2/shop/auth_partner`；TikTok 按站点带 `shop_region` 授权 | 现网在用 |
| 断开店铺 | 删除本地授权与任务；Shopee 另给撤销授权链接 `/api/v2/shop/cancel_auth_partner`；TikTok 无撤销接口（官方 Disconnecting shops 文档），只能引导卖家在 Seller Center 操作 | 接口有 / 引导 |

## 接入平台应用 /shops/connect/*

两个平台都不给服务商聊天接口：Shopee 自 2024-11-18 起不受理服务商的 Customer Service 应用和 Chat API 新申请（[公告 1026](https://open.shopee.cn/announcements/1026)），TikTok 客服 scope 只批给授权卖家 ≥1000 或日调用 ≥100 万次的服务商。所以商户必须自建应用。还没有应用的商户先走准备清单 `/shops/connect/<平台>/guide`，卡住时预约远程协助 `/shops/connect/assist`；之后在 Shopilot 内走 4 步：选择平台 → 应用凭证 → 授权店铺 → 检查并完成。演示表单里的密钥全是假值。

| 功能 | 实现路径 | 状态 |
| --- | --- | --- |
| 准备清单（建应用的 5 项任务，带控制台截图） | Shopilot 自有帮助内容，勾选进度存在接入草稿；平台审核状态没有接口可查，24 小时后和 3 个工作日后各发一封提醒邮件 | 自研 |
| 预约远程协助 | 新建接入协助单并通知 Shopilot 支持组；协助时由商户本人操作平台后台，Shopilot 不要平台账号密码 | 自研 |
| 控制台区域自动识别 | 依次用各区域主机签名调 `get_shops_by_partner`，通过的即所在区域；只有沙箱主机通过时提示换成 Live 凭证 | 接口有 |
| 录入 Live Partner ID / Key（Push Key、Key 到期日在「高级」里选填）、App Key / Secret | 加密存储，只写不读 | 自研 |
| 校验 Shopee ID 与 Key | 用录入凭证签名调 `get_shops_by_partner` | 已实测 |
| TikTok Secret 校验 | 没有授权码前无法单独校验，第一次换 token 时验证 | 文档 |
| 推送回调与订阅 | 保存凭证时自动设置，见上节「推送与 webhook 自动配置」 | 接口有 |
| Redirect Domain、出口 IP、TikTok Redirect URL | 开放接口改不了，准备清单里给出要粘贴的值 | 引导 |
| Shopee 主账号一次授权多店 | `/api/v2/shop/auth_partner` → `auth/token/get` → 按店 `access_token/get` | 现网在用 |
| TikTok 按站点授权 | 授权链接带 `shop_region`；Get Authorized Shops 取 cipher | 已实测 |
| 检查并完成：每店能不能收发聊天、查订单、看买家姓名地址 | Shopee 用店铺 token 调 `get_shop_info`、sellerchat 未读数、`get_order_list`，取一单看 `recipient_address` 是否打码；TikTok 读 `granted_scopes` | 已实测 |
| 坐席接单 | 授权后 Update Agent Settings 设 `can_accept_chat=true`；接待模式为 off 时关闭 | 现网在用 |
| 历史回补 | 授权后自动开始，进度显示在检查页。Shopee 会话约 90 天（实测上限）、订单镜像 180 天；TikTok 会话列表每页 20、消息每页 10，回补最多占每店每天 10,000 次配额的 30% | 自研 |
| AI 初始方式 | 对本次接入的店统一设置：默认「AI 只起草、不发送」（shadow），可选「暂不启用 AI」（off）；逐店在 /reception 调整 | 自研 |

## 订单与开票 /orders

| 功能 | 实现路径 | 状态 |
| --- | --- | --- |
| 订单列表、按平台与状态过滤、详情抽屉 | Shopee 订单镜像（`get_order_list` ≤15 天分段 + `get_order_detail`）；TikTok `orders/search` 实时查询 | 现网在用 |
| 售后待处理 | 从工单表读退货退款、取消申请类工单；平台数据来自 Shopee `v2.returns.*`、订单 IN_CANCEL，TikTok Search Returns / Cancellations | 接口有 / 自研 |
| 处理买家取消申请（Shopee） | `v2.order.handle_buyer_cancellation`（ACCEPT / REJECT） | 接口有 |
| 立即同步 | 订单镜像增量任务 | Obsbot v2 已有 |
| 发票记录与发送状态 | Shopilot 发票表；聊天发图、邮件、飞书三路发送结果 | 自研 |

## 看板 /dashboard

Shopilot 口径（会话段、AI 独立解决、人工首响、转人工原因、草稿处置、知识缺口、按人统计）全部来自 Shopilot 会话记录，两平台统一计算。平台口径单独成表、不合并：Shopee 取 `v2.account_health.get_shop_performance`，TikTok 取 `GET /customer_service/202407/performance`。按人统计只覆盖经 Shopilot 处理的会话，平台接口不暴露子账号。AI 回复核验（随机抽样准确率、判错原因）、草稿被改写率、工单区（未结、按时完成率、解决时长中位）都来自 Shopilot 自有的核验样本、草稿事件和工单表；「超时后被平台自动处理」是 Shopilot 推断：截止后状态变为成功，且没有 Shopilot 操作记录。看板只对管理员、组长开放，组长只看负责店铺。

## 知识库 /knowledge 与接待设置 /reception

全部是 Shopilot 自身数据与逻辑：资料上传与切分、经验卡审核（标记 → 提取 → 查重 → 审核 → 测试 → 发布 → 跟踪，可回滚）、AI 测试（不发给买家）；店铺 × 工作时间内外的接待模式、转人工关键词与置信度阈值、待认领超时、品牌语气与阶段提示词。和平台相关的只有两处：TikTok 店模式为 off 时同步关闭坐席接单（Update Agent Settings）；TikTok 商品要商品 scope，产品目录里 TikTok 商品改从订单行和买家商品卡积累。

| 功能 | 实现路径 | 状态 |
| --- | --- | --- |
| AI 回复核验 /knowledge/verify | 样本来自 Shopilot 出稿记录：自动发出的回复、采纳的草稿、影子模式的出稿（影子出稿是新开发，Obsbot v2 没有）。风险信号：回复后 10 分钟内追问、转人工、7 天内取消或退货（TikTok webhook 11 / 12，Shopee 推送 3 / 29）、TikTok 满意度 ≤ 3（Search Sessions 的 `satisfaction_score`，只查 90 天内）；Shopee 没有按会话的满意度 | 自研 / 接口有 |
| 核验结论回流 | 知识类原因进更新审核；阶段、产品判错改正会话段分类；行为类原因给接待设置的建议链接；改写只存为正确答案，不发给买家 | 自研 |
| 会话段阶段自动判定（售前 / 售中 / 售后 / 未确认） | 按本段指向的订单或买家在本店的订单与售后状态判定，接口失败时关键词兜底；规则表见 requirements-ui-impact.md 需求 3。Obsbot v2 的 stage.py 用 COMPLETED / CANCELLED 等判 TikTok 售后终态，与 TikTok 实际枚举对不上，要修 | 自研 |
| 产品目录与商品归类 /knowledge/products | Shopee `v2.product.get_item_list` + `get_item_base_info` + `get_model_list` 同步；TikTok 从 `orders/search` 的 line_items 与买家商品卡的 product_id 积累；按 seller SKU 前缀归入型号，未命中进待归类 | 已实测 / 自研 |
| 出稿检索按产品与阶段 | 阶段两轮优先；产品来自订单或商品卡时过滤为「该产品或通用」。现网对买家会话检索时 product 传 None，要先补 | 自研 |
| 工单类型与时限 /reception/tickets | Shopilot 配置；平台类型只能改提醒阈值，时限以平台截止字段为准 | 自研 |

## 工单 /tickets

只有两类事项建工单：平台给了处理截止时间的，或动作做完还要等买家、平台、内部某一方的。一步就能做完的动作（取消订单、发卡片、转交、结束会话）仍在工作台弹层里完成。

| 功能 | 实现路径 | 状态 |
| --- | --- | --- |
| 平台售后自动建单与推进 | Shopee 推送 code 29（退货）、3（订单，含 IN_CANCEL）、30（包裹履约异常）；TikTok webhook 12（退货）、11（取消）、1（订单）。Shopee 未订阅时每小时轮询 `v2.returns.get_return_list` 与订单镜像，工单最多晚 1 小时出现 | 接口有 |
| 平台截止时间 | Shopee `v2.returns.get_return_detail` 的 `due_date`、`return_seller_due_date`、`seller_proof.seller_evidence_deadline`；TikTok Search Returns / Search Cancellations 的 `seller_next_action_response[].deadline`，订单的 `shipping_due_time` 等。Shopee 买家取消申请没有截止字段，用商户时限 24 小时且不晚于 `ship_by_date` | 已实测（读接口） |
| 手动类工单（开票补信息、缺货跟进、跨班交接、内部确认） | Shopilot 工单表，时限取 /reception/tickets 的商户设置 | 自研 |
| 去重 | 按 `return_sn`、`cancel_id` 或「订单号 + 类型」 | 自研 |
| 看板改状态 | 只对手动类型；平台类型的状态只随推送 / webhook 变化 | 自研 |
| 工单里的平台动作 | TikTok Approve / Reject Return（写接口未实测，按同模块读接口推断可调）；Shopee `v2.order.handle_buyer_cancellation`；Shopee 退货第一期给 `v2.returns.confirm`、`v2.returns.dispute` | 接口有 |
| 到期提醒、超时标记 | 定时扫描 `due_at`，加上平台事件触发；站内、邮件、飞书私聊 | 自研 |

## 助手 /assistant

| 功能 | 实现路径 | 状态 |
| --- | --- | --- |
| 自然语言查询与代办 | 大模型函数调用；每次请求按角色 × 负责店铺生成工具清单（同 [roles.md](roles.md)），模型看不到无权工具 | 自研 |
| 查询类工具 | 我的待办、工单、搜索（复用 /search 索引）、订单、物流、售后、库存（Shopee `get_model_list`；TikTok 缺商品 scope 时返回不可用）、店铺指标（组长以上） | 自研 / 接口有 |
| 内部写操作：认领、转交、建工单、改派、改手动工单状态、加备注、标记知识缺口 | 先出确认卡，令牌绑定对象版本、5 分钟有效，执行前重读版本 | 自研 |
| 平台写操作：退货处理、取消申请、取消订单、开票 | 只预填现有弹层，由人在弹层里提交 | 自研 |
| 审计与计量 | 每次执行写审计（来源 = 助手）；不计出稿，/billing 只显示调用次数 | 自研 |

## 团队与权限、用量与套餐、商户设置

全部是 Shopilot 自身数据，不依赖平台能力：

| 功能 | 实现路径 | 状态 |
| --- | --- | --- |
| 成员、三种角色（管理员 / 组长 / 员工，账号所有者是管理员的属性）、负责店铺、邀请、停用、登录记录 | Shopilot 账号体系；权限按 [roles.md](roles.md)，负责店铺决定会话、工单的可见范围；停用时名下未结工单退回该店组长 | 自研 |
| 飞书同步成员、飞书登录、飞书群通知 | 飞书开放平台：群成员列表、OAuth 登录、机器人发消息 | Obsbot v2 已有群通知 |
| 出稿计量、上限、超量策略、用量提醒 | 每次生成草稿计 1 次（含影子模式）；出稿前检查当期用量与超量预算 | 自研 |
| 套餐、加购、付款方式、自动续费、发票信息 | 支付服务商托管收银与添卡（卡号不经过 Shopilot），服务商未定 | 待选型 |
| 商户资料、通知规则、安全策略、数据保存期限、导出、删除买家数据、审计日志 | Shopilot 配置与后台任务 | 自研 |

## 未画的（接口没有或未证实）

| 功能 | 原因 |
| --- | --- |
| 工作台发视频 | TikTok `VIDEO` 消息要 `vid`，客服模块没有视频上传接口；Shopee Chat 文档不公开 |
| Shopee 会话发商品卡、订单卡、优惠券 | Shopee Chat 文档不公开，现网只验证过 text、image |
| Shopee 平台回复时限倒计时 | 拉到的文档里没有 Shopee 回复率的统计窗口定义 |
| 「买家回复前还能发 N 条」 | 规则出处在不公开的 Chat 文档，无法核实 |
| 消息「已送达 / 已读」 | 发送接口只返回 message_id |
| TikTok 商品卡详情、商品选择器 | 缺商品 scope |
| Shopilot 以服务商身份上架、商户点授权即接入 | Shopee 自 2024-11-18 起不受理服务商的 Chat API 申请；TikTok 客服 scope 要求服务商授权卖家 ≥1000 或日调用 ≥100 万次 |
| 主动联系买家、重新打开已结束会话并发消息 | 产品规则：客服不主动发起会话（TikTok Create Conversation、Shopee 指定 to_id 发消息虽然存在也不做） |
