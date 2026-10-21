# Shopilot 测试文档

## 1. 元信息 / 变更记录

| 字段 | 值 |
| --- | --- |
| 状态 | 草稿 |
| Owner | 实现会话 |
| 关联设计文档 | `docs/DESIGN.md`（v1.30，已批准） |
| 被测系统 | Shopilot（本仓库）：Next.js Web 与 API、Worker 进程、同进程挂载的模拟平台与开发页 |
| 最后更新 | 2026-10-21 |

变更记录（登用例增改，不登执行轮次）：

| 日期 | 改动 | 作者 |
| --- | --- | --- |
| 2026-10-21 | 按 DESIGN v1.32 经验卡：新增 `TC-KB-058` 至 `TC-KB-065`（写卡、版本与回退、下架恢复删除、出稿按卡推进、按卡转人工与建工单、自动与影子模式、效果统计）、`TC-KB-066` 至 `TC-KB-071`（提交学习、新卡审核复测发布、Agent 改卡与复测没通过、审核结论、Agent 挑会话）、`TC-PERM-009`；§3 加经验卡与会话学习函数、卡 K、出稿用卡与会话学习的替身规则；RUN-066 后原位修正 `TC-KB-065` 第 2 步的 `clientRequestId`（接口要求至少 8 个字符） | 实现会话 |
| 2026-10-21 | 按 DESIGN v1.31 Shopee 会话可发 MOV：`TC-CONV-076` 废弃，被 `TC-CONV-079` 取代（源自缺陷：后缀 .mp4 的 QuickTime 视频在 Shopee 会话发送失败；不能发的格式改用 WebM 验证）；§3 测试视频加 `qt.mp4` | 实现会话 |
| 2026-10-21 | 按 DESIGN v1.30 视频按真实宽高比显示：新增 `TC-CONV-078`（TikTok、Shopee 会话发横屏与竖屏视频的缩略图比例、买家视频、没有宽高的旧视频加载后调整、上传接口宽高校验）；§3 测试视频加 `wide.mp4`（1280×720）、`tall.mp4`（720×1280） | 实现会话 |
| 2026-10-21 | 按 DESIGN v1.29 TikTok 会话可发视频：`TC-CONV-065` 废弃，Shopee 部分被 `TC-CONV-076` 取代（加发送接口拒 MOV 与超过 30 MB）；新增 `TC-CONV-077`（TikTok 会话粘贴视频和文字按顺序发出、MOV 与 WebM、100 MB 上限、31 MB 分两块上传）；原位给 `TC-CONV-068` 加第 5 步（真实 TikTok 会话发 20 MB 以上视频）；§3 测试视频加 `clip.webm`、`big31.mp4`、`big101.mp4` | 实现会话 |
| 2026-10-21 | 按 DESIGN v1.26 粘贴改为放进输入框、和文字一起按顺序发：`TC-CONV-064` 废弃，被 `TC-CONV-072` 取代；新增 `TC-CONV-073`（平台没发出即停、再点发送接着发）与 `TC-CONV-074`（附件被拒不进时间线，标「没发出」后接着发，需拦截请求，执行者 AI）；原位修改 `TC-CONV-065` 前置与第 1、6 步、`TC-CONV-021` 第 1 步、`TC-CONV-022` 第 1、3 步（按钮改名「添加图片或视频」，选的文件先进附件条，再点发送） | 实现会话 |
| 2026-10-21 | 按 DESIGN v1.28 新增 `TC-CONV-075`（打开会话：列表静置不预取、指到会话行预取整页与详情、点下即显示会话头与骨架且不留旧会话、换成真实会话不跳动、窄屏立即换栏、新标签打开不占位、减少动效时骨架静止、窄屏占位上返回即回列表） | 实现会话 |
| 2026-10-21 | 按 DESIGN v1.27 新增 `TC-PERM-008`（侧栏切换整页预取与加载骨架：预取请求、点击不再取页面与脚本、未预取时骨架与真实页头对齐、接待设置骨架带分组列、工作台切会话不出整页骨架、减少动效时骨架静止） | 实现会话 |
| 2026-10-21 | 按 RUN-057 的失败明细原位修正四条用例的前置与预期（实现与设计不变）：`TC-KB-045` 改用种子里真实存在的卖家 SKU `1729582718312480201`（Demo TikTok TH），未对应列表按三家有商品权限的店写；`TC-KB-049` 第 1 步改为命中且排第一、距离小于 0.3，第 3 步改为下架后 `qa` 为 `null`（没有已发布问答时不做问答检索），第 6 步改为第二次删除返回 404；`TC-DASH-015` 第 7 步改为 `consistency.rate` 为 `null`；`TC-KB-001` 按五个页签改写第 1、5 步（第 5 步写明抽屉标题是文件名） | 实现会话 |
| 2026-10-21 | 按 DESIGN v1.25 新增草稿对比 `TC-DASH-015` 至 `TC-DASH-019`（影子回复对比与数据不足、辅助草稿原样与修改后发送、买家插话与弃用后另回、看板面板与样例抽屉、线上人工抽检分类）；§3 `q` 的说明改为可执行任意 SQL（草稿对比用例要把草稿生成时间往前改） | 实现会话 |
| 2026-10-21 | 按 DESIGN v1.25 新增知识库第一批 `TC-KB-043` 至 `TC-KB-057`（产品清单 4 条、问答维护 3 条、整理与审核 3 条、出稿与测试问答检索问答 2 条、问答接口权限、线上真实向量化 1 条人工、工作台问答依据）；§3 加 `qaclear` 与 `qa` 函数；知识库页改为五个页签后原位修改 `TC-KB-024` 第 5 步（资料依据链接带 `tab=docs`） | 实现会话 |
| 2026-10-21 | 按 DESIGN v1.24 新增 `TC-CONV-069` 至 `TC-CONV-071`（发送前预翻译：预览与高度不变、带预译文发送、提交校验）；TikTok 读接口排队与限流重试只在代码仓 `pace.test.ts` 覆盖，模拟平台不产生限流，不新增用例 | 实现会话 |
| 2026-10-20 | 按 DESIGN v1.23 新增：会话 `TC-CONV-056` 至 `TC-CONV-068`（常见问题记录、发商品、粘贴与发视频、快捷回复语言版本，其中 `TC-CONV-057` 源自缺陷：常见问题记录早于买家首条消息到达时整条丢失，`TC-CONV-068` 人工在真实平台执行）、`TC-AI-035`、`TC-FEISHU-018`、工单 `TC-TKT-021` 至 `TC-TKT-024`、看板 `TC-DASH-010` 至 `TC-DASH-014`（`TC-DASH-011` 源自缺陷：多个客服首响显示 0 秒）；`TC-DASH-007` 废弃，被 `TC-DASH-010` 取代（首响改按平均）；原位修改 `TC-DASH-001` 第 1 步与 `TC-DASH-008` 第 1 步的「人工首响中位」为「人工首响平均」、`TC-DASH-006` 第 4 步的 CSV 列；§3 加「新建模拟买家」「问过 AI 助手后转人工」与测试视频 | 实现会话 |
| 2026-10-17 | 按 DESIGN v1.22 新增 `TC-AI-034`（影子模式开段是商品卡、之后补文字时按第一句文字出一份影子回复） | 实现会话 |
| 2026-10-17 | 按 DESIGN v1.22 新增 `TC-AI-030`（源自缺陷：品牌语气改成中文后影子回复用中文回外语买家）、`TC-AI-031`（买家先发商品卡、2 秒后补文字，只出一份影子回复）、`TC-AI-032`（影子模式下只发图片不出稿、不检索）、`TC-AI-033`（DeepSeek 调用日志）；`TC-KB-042` 废弃，被 `TC-AI-032` 取代（只发图片在影子模式下已不出稿，走不到检索） | 实现会话 |
| 2026-10-17 | 按 DESIGN v1.21 看板口径：新增 `TC-DASH-006` 至 `TC-DASH-009`（AI 接待段做分母、去向拆分、影子回复、无时限工单、首响按工作时段含平台后台回复、新段记开段模式、页面呈现）；`TC-DASH-005` 废弃，被 `TC-DASH-007` 取代；原位修改 `TC-DASH-003` 第 4 步的 CSV 列；§3 场景 `first-reply-off-hours` 换成 `dashboard-metrics` | 实现会话 |
| 2026-10-16 | 按 DESIGN v1.17 新增四条源自缺陷的用例：`TC-KB-042`（买家只发图片或商品卡时知识库检索报错）、`TC-SHOP-031`（Shopee 推送订阅缺失时店铺页仍显示正常）、`TC-SHOP-032`（手机宽度下回复率图表横轴文字重叠）、`TC-ORD-027`（已结束的售后单请求拒绝原因返回 502） | 实现会话 |
| 2026-10-16 | 新增 `TC-CONV-048`（源自缺陷：Shopee 卖家后台的回复没有进 Shopilot）、`TC-CONV-049`（本方回复的回声不算平台后台回复）、`TC-CONV-050`（店铺自动回复不算平台后台回复）；§3 加模拟器接口「卖家后台回复」 | 实现会话 |
| 2026-10-16 | 按 DESIGN v1.18 新增 `TC-CONV-054`（源自缺陷：平台后台处理过的会话在工作台列表里找不到）、`TC-CONV-055`（源自缺陷：平台英文系统提示原样显示英文）；「同事处理中」分组改名「他人处理中」、员工也有这一组，原位修改 `TC-PERM-001` 第 1–3 步、`TC-CONV-004` 第 1 步、`TC-CONV-017` 第 1 步、`TC-TEAM-009` 第 3 步（员工本来就有这一组，去掉「出现同事处理中」）；§3 场景加 `tiktok-system-notices` | 实现会话 |
| 2026-10-16 | RUN-019 之后修正 `TC-FEISHU-017`（原位修改）：前置记下 Mei Lin 原有的处理中会话数 K，第 5 步停用返回的 `releasedConversations` 改为 K + 1（原写 1，种子里 Mei 本来就有处理中的会话） | 实现会话 |
| 2026-10-16 | 按 DESIGN v1.15 新增 `TC-CONV-042`、`TC-CONV-043`（处理人取消认领、非处理人与过期版本 409）、`TC-FEISHU-017`（取消认领后再推待认领卡，之后停用退回不再推）、`TC-AI-024`（影子回复的译文与复制原文），用例共 288 条；§3 场景加 `shadow-foreign` | 实现会话 |
| 2026-10-16 | 新增 `TC-CONV-044`（源自缺陷：消息拉取不及时，新消息最长 10 秒才进工作台列表）；按 DESIGN v1.13 的新轮询间隔原位修改 `TC-AI-001` 第 2 步（侧栏计数 10 秒）与 `TC-SHOP-001` 第 9 步引用的 §16 口径（工作台会话列表 ≤ 3 秒） | 实现会话 |
| 2026-10-16 | 新增 `TC-DASH-005`（源自缺陷：团队页人工首响中位算进了工作时间外开始的会话段，与看板对不上）；§3 场景加 `first-reply-off-hours` | 实现会话 |
| 2026-10-16 | 新增 `TC-CONV-041`（源自缺陷：平台后台有人回复过的会话谁都认领不了）；§3 场景加 `platform-human` | 实现会话 |
| 2026-10-16 | RUN-013 之后修正 `TC-SHOP-001` 第 9 步措辞（原位修改）：原「10 秒内」比 DESIGN §16「下一次轮询（≤ 10 秒）可见」更严，改为下一次列表轮询后出现、从买家发出算起 15 秒内 | 实现会话 |
| 2026-10-16 | 按 DESIGN v1.13 补飞书群推送：新增功能域「飞书推送」`TC-FEISHU-001` 至 `TC-FEISHU-016`（冒烟 2、回归 14，其中人工 1），用例共 281 条；原位修改 `TC-AUTH-014` 第 4 步（开启后自动回到登录前要去的页面）、`TC-SHOP-024` 第 2 步（只查接入向导与店铺页没有飞书入口）、`TC-SET-006` 第 1 步（注明一期不做飞书登录）、`TC-MOCK-002` 第 2 步（加飞书投递记录接口）；§2 范围与不测项、§3 飞书发送替身与「连上飞书替身」、§5 冒烟集加两条 | 实现会话 |
| 2026-10-16 | RUN-010 之后修正 `TC-KB-035`（原位修改）：前置去掉「入库前关掉 AI 可用」，那一步刷新了资料的更新时间，补扫按最近一次更新计时（DESIGN v1.12 §17 写明）；第 2 步改为状态「可用」 | 实现会话 |
| 2026-10-15 | 按 DESIGN v1.11–v1.12 补知识库：新增功能域「知识库」`TC-KB-001` 至 `TC-KB-036`（冒烟 2、回归 28、边缘 6，其中人工 1），用例共 265 条；`TC-AI-003` 改为「没有可用资料时不检索」；`TC-PERM-001` 组长看到接待设置且只有知识库标签；`TC-TEAM-013` 权限表含知识库「资料与测试问答」一行；`TC-CONV-010` 对照项加草稿「依据」；§2 范围与不测项、§3 检索替身、AI 替身「资料不足」、知识库测试文件、补扫场景与 curl 函数 | 实现会话 |
| 2026-10-11 | 初稿：15 个功能域共 223 条用例（冒烟 10、回归 172、边缘 41），覆盖 DESIGN v1.0 §5 全部 76 条 REQ 与 §19 全部 88 个 Gherkin 场景；§3 按约定起草，标「未验证」 | 实现会话 |
| 2026-10-11 | 按 DESIGN v1.2 同步（尚无执行轮次，受影响用例原位修改），用例共 225 条：新增 `TC-SHOP-025`（接入后超套餐店铺上限）、`TC-CONV-039`（员工不能结束待认领会话）；授权失败回授权页及 `denied` 原因（`TC-SHOP-008` 至 `TC-SHOP-011`）；沙箱凭证不能继续授权（`TC-SHOP-005`）；两步验证、本人设备、个人偏好改在 `/account/security`（`TC-AUTH-014` 至 `TC-AUTH-017`、`TC-SET-005`、`TC-SET-006`）；阶段判定规则 5、6（`TC-CONV-032`、`TC-CONV-033`）；物流异常工单手动推进（`TC-TKT-004`）；授权失效发送的 `code`（`TC-SHOP-017`）、模型给出的转人工原因（`TC-AI-019`）、AI 草稿分组含 auto 会话（`TC-AI-007`）、员工指定负责人被拒（`TC-TKT-007`）、重复邀请与邀请失效的 `code`（`TC-TEAM-004`、`TC-TEAM-005`、`TC-TEAM-006`、`TC-TEAM-008`）、删除不存在买家返回 0（`TC-SET-008`）、账单开票资料快照（`TC-BILL-012`）、权限表不含知识库与助手（`TC-TEAM-013`）；§3 写入模拟器故障注入、最近一次请求、来源 IP 与场景 `shop-limit-full` | 实现会话 |
| 2026-10-14 | 按 DESIGN v1.10 同步（去掉侧栏出稿用量卡，原位修改）：`TC-PERM-001` 第 1 步改为导航下方没有用量卡、收起后只有「展开侧栏」按钮，第 2 步删去「没有用量卡」，第 4 步改为三个角色的 `nav-summary` 都没有 `usage` 键 | 实现会话 |
| 2026-10-14 | RUN-008 之后：`TC-AI-001` 第 2 步写明以会话列表的「AI 草稿」分组计数为准（侧栏按 30 秒轮询） | 实现会话 |
| 2026-10-14 | RUN-005 之后修正用例（原位修改）：`TC-ORD-013` 前置改由 owner 取售后单 ID；`TC-ORD-016` 入口为「工单 T-<编号>」；`TC-ORD-017`、`TC-ORD-018` 补填抬头与地址；`TC-SET-013` 改为看转让对象置灰并用接口验证 409；`TC-BILL-002`、`TC-SET-014` 提示为「只有账号所有者 X 能改套餐」；`TC-SHOP-015` 后置重建基线；工作台按钮名按界面（「转交给同事」「改派给其他同事」「结束会话（…）」「发送订单卡」「发送物流卡」，阶段来源「手动」）；§3 补清除故障注入的写法 | 实现会话 |
| 2026-10-14 | 按 DESIGN v1.8 同步（全面评审后的修复）：新增 `TC-AUTH-021`（备用码登录）、`TC-PERM-007`（被改派后不可见、不能处置草稿）、`TC-CONV-040`（同秒消息翻页）、`TC-ORD-021`（会话内开票只能选本买家订单），用例共 229 条；`TC-ORD-018` 第 1 步改为「发送到聊天」置灰并写原因；`TC-CONV-009` 按工作台宽度判断三栏 | 实现会话 |
| 2026-10-12 | RUN-004 之后修正措辞（原位修改，不新增 TC）：`TC-CONV-004` 平台筛选项「TikTok」；`TC-SHOP-001` 第 8 步按「连接」列的实际取值 | 实现会话 |
| 2026-10-12 | RUN-003 之后修正用例（原位修改，不新增 TC）：按钮名「认领并回复」统一为界面与 DESIGN 的「认领」（40 处）；`TC-TEAM-001` 新账号按钮「创建账号并加入」；`TC-TEAM-012` 前置记下 Mei 原有的会话与工单数；`TC-CONV-004` 计数为 0 不显示数字；`TC-TKT-001` 平台事件来源标「平台」 | 实现会话 |
| 2026-10-12 | RUN-002 之后按 DESIGN v1.6 修正用例（原位修改，不新增 TC）：`TC-TKT-007` 员工建单的负责人文案；`TC-CONV-012` 员工败方显示「X 已认领这个会话」与回列表；`TC-AI-017` 补「安抚句不清零等待」；`TC-SHOP-021` 按「已断开」组筛店；`TC-MOCK-002` 补区域段；§3 签名配方的变量 `path` 改为 `api_path`（zsh 里 `path` 绑定 `PATH`）；关联设计文档改为 v1.6 | 实现会话 |
| 2026-10-12 | RUN-001 之后按 DESIGN v1.5 修正用例（措辞与验证目标不变的原位修改，不新增 TC）：成员状态列口径（`TC-AUTH-001`、`TC-TEAM-001`、`TC-TEAM-002`、`TC-TEAM-010`、`TC-TEAM-012`）；`TC-AUTH-002` 登录入口与商户列表改看 `/me`；`TC-AUTH-004` 退出带 `-d '{}'`；`TC-AUTH-006` 未注册邮箱不进商户登录记录；`TC-AUTH-014` 所有者先开两步验证；`TC-NOTIF-001` 未读改看红点与弹层头部；`TC-ORD-001` 状态「运输中」与最新轨迹；`TC-ORD-011` 拒绝原因取平台列表；`TC-ORD-012`、`TC-ORD-014` 补选原因；`TC-TKT-001` 动作名「收货后同意退款」与时间线条目；`TC-TKT-012` 改成与默认值不同的时限；`TC-TKT-015` 版本冲突的构造；`TC-TKT-016` 徽标口径；`TC-CONV-008` 前置推进到 IN_TRANSIT、点开大图；`TC-CONV-024` 按「发卡片」弹层与「发优惠券」按钮；`TC-SHOP-006` 回调带路径；`TC-SHOP-013` 前置补 `pnpm job shop.metrics`；`TC-SHOP-015` 与 §3「Shopee 改回调」改用模拟商户自有系统 `API-MOCK-009`；`TC-SHOP-021` 勾选项措辞；`TC-SHOP-023` 单店商户无店铺筛选；`TC-SET-008` 订单镜像去掉买家信息；`TC-MOCK-001` 补区域段与官方出参；`TC-MOCK-005` 改为真实授权页路径 | 实现会话 |
| 2026-10-12 | 按 DESIGN v1.4 同步（尚无执行轮次，受影响用例原位修改）：`TC-SET-002` 时区立即生效；§3「Shopee 签名调用」「Shopee 改回调」配方补区域主机（`/mock/shopee/sg/...`）；场景 `auth-link-6min` 改为新签名链接、state 已过期（模拟授权页拒绝时间戳超过 5 分钟的链接） | 实现会话 |

## 2. 测试范围 / 不测什么

- 覆盖：DESIGN v1.15 全部 REQ 的黑盒功能验收，层面是浏览器界面（Playwright + Edge 或人工）、HTTP 接口（curl）、模拟器买家视图、发件箱 `/dev/outbox`。§19 的每个 Gherkin 场景至少由一条用例可操作化，用例标题行的「对应」列出 REQ。界面文案以 `docs/ui-interactions.md` 为准；助手的按钮与飞书登录、私聊、卡片回调不在本期范围，飞书只测群推送（设置、待认领卡、超时卡、点卡认领），知识库只测一期（资料上传与入库、分类、站点与开关、测试问答、出稿检索与依据），经验卡、更新审核、AI 核验、产品目录的按钮不在本期范围。
- 飞书在本地一律用发送替身（`FEISHU_MODE=stub`）：卡片不出网，在开发发件箱查看。真实飞书的发卡、图片上传与卡片显示只由人工用例 `TC-FEISHU-016` 验收。
- 知识库在本地一律用检索替身（`KNOWLEDGE_MODE=stub`）：替身入库即报完成、不理解语义，按关键词重合打分。真实 Cloudflare AI Search 与真实 DeepSeek 的跨语言检索与回答质量只由人工用例 `TC-KB-036` 验收。
- 本期验收口径（DESIGN §3）：对应 P0 REQ 的用例全部通过。一条用例同时对应 P0 与 P1 REQ 时按 P0 计。
- 不测：

| 不测项 | 归属 |
| --- | --- |
| 单元与集成自动化：阶段判定、状态机守卫穷举、权限矩阵三角色 × 每个端点、签名算法、§16 全部竞态（双击发送、同草稿双处置、额度临界并发、发票号并发、邀请双接受、同店双同步） | 代码仓测试套件（DESIGN §19 测试策略、§24 契约测试） |
| 性能与限流阈值：§15 延迟目标、每会话每分钟 600 次、同 IP 每分钟 30 次登录、10 条/秒入站不积压 | 无归属——已知风险（本期不压测） |
| 安全渗透：CSRF、会话固定、越权枚举之外的攻击面 | 无归属——已知风险 |
| 真实 Shopee / TikTok 接口与模拟平台的差异 | 接真实平台时逐接口实测（DESIGN §28 风险行） |
| 真实发信、真实支付 | 本期不做（DESIGN §2 非目标）；邮件只看发件箱，支付只用模拟卡 |
| 对话助手；飞书登录、成员同步、私聊、@人、卡片回调与状态更新；知识库的经验卡、更新审核与版本回滚、AI 回复核验、产品目录、知识缺口看板 | 本期不做（DESIGN §2 非目标） |
| 飞书 §16 竞态与发送重试：同一段两次触发同种卡、卡片排队时会话被认领、断开飞书时有卡片在排队；连不上飞书时退避重试 5 次、凭证失效记失败 | 代码仓测试套件 `src/server/feishu/feishu.test.ts`、`client.test.ts`；发送替身不出网、本地造不出精确交错 |
| 处理人被停用时退回待认领也推卡、提醒时长为「不提醒」时不推超时卡、AI 总结失败时不显示总结 | 无归属——已知风险：前两条只在 DESIGN §28 记现状，第三条 AI 替身的总结不会失败 |
| 知识库 §16 竞态：并发上传越过 500 份、入库途中资料被删除 | 代码仓测试套件 `src/server/knowledge/knowledge.test.ts` |
| 知识库 §16 其余竞态：同一内容同时上传两次、同商户并发建检索实例、资料解析中再点重新解析（并发那一刻）、两人同时删除同一份资料、删除分类时有资料正上传到它、停用与出稿检索交错 | 无归属——已知风险：本地没有让两个请求精确交错的手段，代码靠唯一索引、咨询锁与条件更新兜底（DESIGN §16） |
| 索引条目长时间停在「处理中」、按分块数连续两次不变判完成；检索服务删除后约 30 秒内仍查得到条目 | 人工用例 `TC-KB-036`（真实检索服务上观察）；检索替身上传即报完成、同步删除，本地走不到这两条 |
| 测试问答限流在多实例部署时按实例数放大 | 无归属——已知限制（DESIGN §28），本期单实例 |
| 定时任务的调度周期（每分钟、每 5 分钟等） | 无归属——已知风险；本文档用 `pnpm job <任务名>` 手动触发，只验证任务效果 |
| 入站处理失败与重试（11.3 `fail`、`lease_expire`、`retry`，`pnpm inbound:replay`） | 无归属——已知风险：§3 没有让入站处理抛错的手段 |
| 达人会话只记录不出稿（11.1 `record_only` 的达人分支） | 无归属——已知风险：模拟器没有达人买家 |
| 平台侧人工回复（11.1 `platform_human`：卖家在平台后台直接回复） | 无归属——已知风险：模拟器没有「卖家在平台后台回复」动作 |
| 发件箱写入失败（11.9 `outbox_failed`）、数据导出失败（11.12 `fail`） | 无归属——已知风险：§3 没有让它们失败的手段 |
| 平台返回聊天分配类错误时能力表改为 `chat = false`（11.7） | 无归属——已知风险：故障注入只给通用平台错误 |
| 买家 7 天外不可发（`API-CONV-007` 409） | 无归属——已知风险：§3 没有构造「买家 7 天未发言」的场景 |
| 登录锁定 15 分钟后自动解锁、会话 7 天滑动续期、所有权转让 7 天过期、商户 30 天后清除（`merchant.purge`） | 无归属——已知风险：§3 没有对应的时间场景 |
| 邀请受套餐席位上限（`API-TEAM-002`、`API-TEAM-009` 席位已满） | 无归属——已知风险：席位上限是演示值（DESIGN §28 假设行），未定 |
| 翻译与开票字段抽取的模型失败路径（502 / 504 `/errors/ai-unavailable`） | 无归属——已知风险：AI 替身只覆盖出稿 |
| CSV 超过 10,000 行返回 422、500 `/errors/internal` | 无归属——已知风险：种子数据量与故障手段都不够 |
| 浏览器兼容（Safari、Chrome）与完整无障碍审计 | 无归属——已知风险；本文档只在 Edge 上抽查键盘焦点（`TC-CONV-010`） |

## 3. 环境与前置

§3 状态：已验证（2026-10-12，RUN-001 起跑前照本地行从零走通：`docker compose up -d` → `pnpm install` → `pnpm db:reset && pnpm db:seed` → `pnpm dev`，`/api/health` 返回 `"service":"shopilot"`、`"db":"ok"`，模拟器标题含「Shopilot 模拟器」）。

- 环境：

| 环境 | 入口 | 就绪判定 | 测试账号 | 种子与重置 | 外部副作用 |
| --- | --- | --- | --- | --- | --- |
| 本地 | Web `http://127.0.0.1:3360`；API `http://127.0.0.1:3360/api/v1`（curl 带登录 cookie）；模拟器 `http://127.0.0.1:3360/mock/simulator`；发件箱 `http://127.0.0.1:3360/dev/outbox` | `curl -s http://127.0.0.1:3360/api/health` 返回 JSON，含 `"service":"shopilot"` 与 `"db":"ok"`；且 `http://127.0.0.1:3360/mock/simulator` 页面标题含「Shopilot 模拟器」 | 见下方测试账号表 | 可跑：数据库是本机 docker 卷 `shopilot_pgdata`，本期没有线上，不与任何线上数据共用 | 邮件只写发件箱；支付为模拟支付；平台为模拟平台；`AI_MODE=stub` 时出稿不出进程；`AI_MODE=deepseek` 时真实调用 DeepSeek，只有 `TC-AI-002` 这样跑，费用记在项目自己的 DeepSeek 账号，不触达任何真实买家；`KNOWLEDGE_MODE=stub` 时知识库检索走进程内替身，不调 Cloudflare（只有人工用例 `TC-KB-036` 改成 `cloudflare`） |
| 预发 | 无——本期只在本机运行 | — | — | — | — |
| 线上 | 无——本期只在本机运行 | — | — | 禁跑 | — |

- 启动（本地）：
  1. 没有 `.env` 时从 `.env.example` 复制生成，逐行按注释里的「获取」填值；密钥按 AGENTS.md「密钥纪律」处理，值不进文档、对话、日志。`DEEPSEEK_API_KEY` 取自 Bitwarden 条目 `DEEPSEEK_API_KEY`，vault 解锁由人执行，只有 `TC-AI-002` 需要它。设 `AI_MODE=stub`、`MOCK_PLATFORM=1`、`KNOWLEDGE_MODE=stub`、`FEISHU_MODE=stub`。
  2. `docker compose up -d`（PostgreSQL 17，`127.0.0.1:5460`），`docker compose ps` 显示 postgres 为 healthy。
  3. `pnpm install`，然后 `pnpm db:reset && pnpm db:seed`。
  4. `pnpm dev`（同时起 Web `http://127.0.0.1:3360` 与 Worker），按上表就绪判定检查。端口 3360 被别的进程占用时，`/api/health` 返回的 `service` 不是 `shopilot`，先停掉占用进程。
- 基线：执行完上面第 3 步并按第 4 步启动、`AI_MODE=stub`、`KNOWLEDGE_MODE=stub`、AI 替身为默认「正常回复」、检索替身为默认 `normal` 的状态；种子不含知识库资料，两个商户各只有内置分类「未分类」；两个商户都没有连接飞书。用例前置写「基线」时，若本轮前面的用例改过数据或配置，先重跑 `pnpm db:reset && pnpm db:seed`。
- 测试账号（本地，均由 `pnpm db:seed` 创建；密码一律 `Shopilot-Demo-2026`，本地演示值，非密钥）：

| 商户 | 账号 | 姓名 | 角色 | 负责店铺 |
| --- | --- | --- | --- | --- |
| Demo Store（时区 Asia/Kuala_Lumpur） | owner@demo.test | 林晓 | 管理员，账号所有者 | 全部（管理员隐含） |
| Demo Store | admin2@demo.test | 陈卓 | 管理员 | 全部（管理员隐含） |
| Demo Store | lead@demo.test | Arif Rahman | 组长 | Demo Shopee MY、Demo TikTok MY |
| Demo Store | agent@demo.test | Nur Aisyah | 员工 | Demo Shopee MY |
| Demo Store | agent2@demo.test | Mei Lin | 员工 | Demo Shopee MY、Demo TikTok TH |
| Other Store | other@demo.test | （种子姓名） | 管理员，账号所有者 | 全部 |
| Other Store | agent@demo.test | Nur Aisyah | 员工 | （种子设定） |

- 种子店铺（`pnpm db:seed` 后已接入，状态「已连接」）：

| 商户 | 店铺 | 平台 · 站点 | 接待模式（工作时间内 / 外） |
| --- | --- | --- | --- |
| Demo Store | Demo Shopee MY | Shopee · MY | assist / assist |
| Demo Store | Demo Shopee SG | Shopee · SG | shadow / shadow |
| Demo Store | Demo TikTok MY | TikTok · MY | assist / auto |
| Demo Store | Demo TikTok TH | TikTok · TH | off / off |
| Other Store | Other TikTok VN | TikTok · VN | （种子设定） |

  两个商户的种子都带会话、订单、工单、发票各若干条，每个列表页非空。Demo TikTok MY 的能力表没有商品权限（`productScope = false`），用于 `TC-CONV-024`。

- 模拟平台里尚未接入、供接入向导用的应用（全是假值，非密钥）：

| 平台 | 应用 | 区域 / 站点 | 店铺 | 用途 |
| --- | --- | --- | --- | --- |
| Shopee | Partner ID `2001001`，Key `mock-key-2001001` | sg | 主账号 `900100` 下 3 家：Wizard Shopee MY、Wizard Shopee SG、Wizard Shopee PH（PH 没有聊天权限）；Wizard Shopee MY 带历史会话与订单 | 正常接入 |
| Shopee | Partner ID `2001002`，Key `mock-key-2001002` | 只在沙箱登记 | — | 沙箱提示 |
| Shopee | Partner ID `2001003`，Key `mock-key-2001003` | cn；回调已指向 `https://erp.example.com/shopee/push` | — | 回调占用 |
| TikTok | App Key `mockttwiz01`，App Secret `mock-secret-wiz01` | MY、TH 各一店 | Wizard TikTok MY、Wizard TikTok TH | 按站点授权 |

- 模拟器 `/mock/simulator`：扮演买家与平台。选店铺与买家（可「新建买家」，得到一个在该店没有会话的买家），以买家身份发文字、图片、订单卡、商品卡；下单、推进订单状态（按各平台枚举）、申请取消、申请退货、买家寄回、平台仲裁、取消授权、授权到期。页面显示每个买家的会话（含卖家发出的消息与卡片）、订单与售后单的平台原始状态、TikTok 店的坐席接单（`can_accept_chat`）、TikTok 会话 session 是否已结束、推送日志（目标 URL、HTTP 状态、载荷）。
- 卖家后台回复（只有 Shopee 会话）：接口 `POST $B/api/mock/sim/seller_backend_reply`，请求体 `{"conversationId":"<模拟器会话 ID>","text":"<可选>","auto":<可选 true>}`。带 `text` 时把一条卖家消息写进平台会话（`get_message` 读得到）但不推送，与真实 Shopee 一致；随后推一条 code 10 的 `mark_as_replied` 会话通知。不带 `text` 时只推通知。`auto` 为 `true` 时这条消息的时刻取该会话最近一条买家消息的时刻，模拟店铺自动回复。
- 新建模拟买家：接口 `POST $B/api/mock/sim/create_buyer`，请求体 `{"platform":"shopee","shopId":"220001","name":"<买家名>","language":"en"}`（Demo Shopee MY 为 `220001`，Demo Shopee SG 为 `220002`），返回 `conversationId` 即模拟器会话 ID；买家发第一条消息之前，Shopilot 里还没有这个会话。
- 问过 AI 助手后转人工（只有 Shopee 会话）：接口 `POST $B/api/mock/sim/buyer_faq_transfer`，请求体 `{"conversationId":"<模拟器会话 ID>","question":"<可选>"}`；模拟器页同名按钮。先在平台写入会话分页读不到的商店 AI 助手对话（欢迎语、推荐 3 个商品、买家提问、助手回答「Thanks for asking! Our customer service team will check this for you shortly.」，买家提问带译文「[Shopee 机翻] <提问>」），再依次推送买家的 `faq_liveagent`「Chat with shop staff」与 `bundle_message`（只带成员消息 ID）。
- AI 替身（`AI_MODE=stub`）：模拟器页「AI 替身」面板设定下一次出稿的回复，可选「正常回复」（默认，confidence 0.85）、「低置信 0.4」、「要求转人工」、「非 JSON 文本」、「超时」；设定只作用于下一次出稿，之后回到默认；面板显示所选回复的 JSON（含 `reason`）。面板同时显示最近一次出稿请求（接口 `GET /api/dev/ai-stub` 的 `lastRequest`），用例写「最近一次请求」即指它。翻译与开票字段抽取在 stub 下返回非空的替身文本。另有「资料不足」（`insufficient = true`、confidence 0.9、`used_sources` 为空）：面板没有这一项，用接口设 `curl -s -X PUT $B/api/dev/ai-stub -H 'Content-Type: application/json' -d '{"next":"insufficient"}'`，同样只作用于下一次；其他选项也可以这样设，加 `"sticky":true` 则一直生效，用完设回 `{"next":"normal"}`。出稿请求带资料片段时，「正常回复」在 `used_sources` 里引用第 1 段；检索前的改写请求一律返回买家原话，不受设定影响，也不记入「最近一次请求」。测试问答（`API-KB-012`）与出稿共用同一个替身。
- 检索替身（`KNOWLEDGE_MODE=stub`，DESIGN `API-MOCK-010`）：入库时文本类资料（md、txt、csv、html）按 1,500 字切块，其余格式生成一段「替身解析：<文件名>」，上传即报索引完成；检索读该商户已解析的分块，按关键词重合打分（中文按相邻两字），每段都带向量分。下一次表现用接口设：`curl -s -X PUT $B/api/dev/knowledge-stub -H 'Content-Type: application/json' -d '{"next":"<值>"}'`，值为 `normal`（默认）、`no_vector`（混合检索结果没有向量分）、`timeout`（检索超时）、`error`（检索返回 HTTP 500）、`ingest_error`（入库时条目索引报 `workers_ai_timeout_error（替身）`）；默认只作用于下一次检索或下一次条目上传，加 `"sticky":true` 一直生效，用完设回 `{"next":"normal"}`。`curl -s $B/api/dev/knowledge-stub` 返回当前设定与 `lastQuery`（最近 6 次检索请求，旧的在前，每条有 `query` 与 `retrievalType`：`hybrid` 混合、`vector` 纯向量），用例写「最近检索请求」即指它。`AI_MODE=deepseek` 时调真实 DeepSeek，改 `.env` 后重启 `pnpm dev`。
- 飞书发送替身（`FEISHU_MODE=stub`，DESIGN `API-MOCK-011`）：不连飞书，「发出」的卡片记进投递记录，在 `/dev/outbox?tab=feishu` 查看（标题、颜色、正文、图片、按钮链接与卡片 JSON），接口 `GET /api/dev/feishu`。约定：App Secret 含 `bad` 时校验失败（飞书 10014）；Webhook 地址末段含 `bad` 时签名失败（19021）；机器人所在的群固定为「Shopilot 客服群（替身）」`oc_stub_service`、「售后处理群（替身）」`oc_stub_aftersale`、「泰国站客服（替身）」`oc_stub_th`。卡片里的 AI 总结在 `AI_MODE=stub` 下固定为「AI 替身总结：买家发来新消息，正在等待客服认领。」
- 故障注入：模拟器页「故障注入」面板（接口 `GET` / `PUT /api/mock/sim/faults`）对指定店铺设定「卖家发送消息」「订单读取」「售后写操作」下一次或持续失败：返回平台错误，或 12 秒后超时。用例写「故障注入」即指它；设了「持续」的用例在后置里清除。
- 来源 IP：`MOCK_PLATFORM=1` 时服务端把请求头 `X-Forwarded-For` 当作来源 IP，用于 IP 白名单用例（生产不信任该头）。

- 外部副作用去向：邮件不外发，全部写入发件箱 `/dev/outbox`（可点开邮件里的链接，可对单封「标记退信」）；支付为模拟支付，卡号 `4242 4242 4242 4242` 成功、`4000 0000 0000 0002` 失败；平台为模拟平台，推送与 webhook 从模拟器签名发到本机回调。
- 时间敏感数据：一律用 `pnpm scenario <名称>` 构造，不真等。每次执行都新建对象（不改已有对象），可重复执行；命令在终端输出构造出的对象（会话 ID、工单号、链接等）。定时任务用 `pnpm job <任务名>` 手动触发（任务名同 DESIGN §17），手动触发时不检查任务的时间窗（如 `data.retention_purge` 不限当地 03:00）。

| 场景 | 构造内容（Demo Store 内） |
| --- | --- |
| `invite-expired` | 一条员工邀请（负责 Demo Shopee MY），`expires_at` 已过、状态 expired；输出邀请邮箱与接受链接 |
| `invite-revoked` | 一条员工邀请，状态 revoked；输出邀请邮箱与接受链接 |
| `ticket-due-soon` | Demo TikTok MY 一张平台类「退货退款」工单，负责人 Arif Rahman，`due_at` = 现在 + 5 小时，提醒阈值截止前 6 小时，未提醒；输出工单号 |
| `ticket-overdue` | Demo Shopee MY 一张手动类「内部确认」工单，负责人 Nur Aisyah，`due_at` = 1 小时前，未发超时通知；输出工单号 |
| `ticket-resolved-8d` | 一张手动类工单，已解决，`resolved_at` = 8 天前；输出工单号 |
| `conversation-idle-73h` | Demo Shopee MY 一个 Nur Aisyah 处理中的会话，最后一条消息在 73 小时前；输出会话 ID |
| `draft-25h` | Demo Shopee MY 一个 AI 接待中的会话，带一份 25 小时前生成、未处置的草稿；输出会话 ID |
| `segment-200d` | Demo Shopee MY 一个 200 天前结束的会话段（含消息与草稿）；输出买家名与会话 ID |
| `usage-near-quota` | 当期额度 100、已用 79，提醒阈值 80%、接收人所有者、渠道站内，超量策略 stop，未发过 80% 提醒 |
| `usage-exhausted` | 当期额度 100、已用 100，超量策略 stop |
| `auth-expiring-20d` | Demo TikTok MY 授权到期 = 现在 + 20 天，未发过到期提醒 |
| `handover-candidate` | Demo Shopee MY 一个 Nur Aisyah 处理中的会话，最后一条是 20 分钟前的买家消息；今天的工作时段改为在 1 分钟前结束；输出会话 ID |
| `unclaimed-11m` | Demo Shopee MY 一个待认领会话，买家消息在 11 分钟前，本段未提醒；`unclaimed_remind_minutes = 10`；输出会话 ID |
| `platform-human` | Demo Shopee MY 一个处理中、`claimed_by` 为空的会话（`handoff_reason = platform_human`，即卖家在平台后台直接回复过），买家消息在 6 分钟前；输出会话 ID |
| `dashboard-metrics` | Demo Store 排班改为每天 09:00–18:00、无节假日；在 5 天前（商户时区，记为 D）的 Demo Shopee MY 造 7 个会话段：自动模式 AI 独立解决 1 段；自动模式 AI 回过买家后 10:10 转人工、林晓 10:20 回复 1 段；辅助模式 11:30 转人工、林晓 11:40 回复 1 段（11:00 开段）；影子模式 17:50 开段、林晓次日 09:10 回复 1 段；未开 AI 20:00 开段、林晓次日 09:05 回复 1 段；影子模式 14:00 开段、只有平台后台 14:02 回复 1 段（另有一条 13:00 的平台后台消息挂在本段）；未开 AI 15:00 开段、平台后台 15:01、林晓 15:30 回复 1 段；两个影子段各带一份影子回复；另有两张 D 日 12:00 解决的内部确认工单，一张截止 13:00、一张没有截止时间；输出 D、会话 ID 与工单号 |
| `shadow-foreign` | Demo Shopee MY 一个影子模式的待认领会话（`handoff_reason = shadow`），带一份英文影子回复、还没有译文（AI 替身的出稿是中文，用场景造）；输出会话 ID 与草稿 ID（`draftId`） |
| `tiktok-system-notices` | Demo TikTok MY 一个待认领会话：一条买家消息之后，依次 7 条 TikTok 英文系统提示（分配客服、开始接待、`[Other]` 卖家中心提示、要求转人工、客服结束、买家超时，最后一条「Your chat was rated 5 stars」不在 DESIGN 对照表里）；模拟器不能发系统提示，用场景造；输出会话 ID |
| `auth-link-6min` | Demo Store 的 Shopee 应用一条授权链接：链接本身是新签名，其中的 `state` 签发于 6 分钟前、已过期（模拟授权页本身拒绝时间戳超过 5 分钟的链接）；输出链接 |
| `session-aged-9h` | `agent@demo.test` 最近一个登录会话的创建时间改为 9 小时前 |
| `export-expired` | 一个已完成的数据导出，`expires_at` 已过；输出下载链接 |
| `shop-no-inbound-8d` | Demo TikTok TH 最近入站时间改为 8 天前 |
| `plan-over-shop-limit` | Demo Store 套餐改为高于基础版的套餐，并新增 4 家已连接的种子店（共 8 家），店铺数超过基础版上限 |
| `shop-limit-full` | Demo Store 套餐改为基础版，已接入店铺补到基础版店铺上限；Demo Store 的 Shopee 主账号下另有一家未接入的模拟店 Demo Shopee PH |
| `knowledge-queued-11m` | 一份「排队中」的资料（txt，未分类，全部站点），最近更新在 11 分钟前，没有排入库任务；输出资料 ID |
| `knowledge-processing-26m` | 一份「解析中」的资料（txt），最近更新在 26 分钟前，模拟入库任务中断；输出资料 ID |

- 通用操作（用例里写「按 §3 某某」即指这里）：
  - 「固定为工作时间内」：以 owner@demo.test 打开 `/reception/hours`，把今天（商户时区的星期几）设为「工作」、时段 00:00–23:59，删掉包含今天的节假日，点「保存」，页面提示已保存。
  - 「固定为工作时间外」：同页把今天的「周X 工作」开关关掉，点「保存」。
  - 「新注册商户」：在未登录的浏览器按 `TC-AUTH-001` 第 1–2 步注册，邮箱用一个未注册的 `<名字>@demo.test`，密码 `Signup-Test-01`，商户名自拟。用例写「新注册一个商户」即指这一步。
  - 「模拟器发消息」：打开模拟器，选指定店铺与买家（用例写「新买家」时点「新建买家」），在买家输入框发出文字；推送日志新增一条，HTTP 状态 200。
  - 「连上飞书替身」：先执行「curl 会话」，再 `login owner@demo.test`，`api owner@demo.test -X PUT $B/api/v1/feishu -d '{"method":"app","appId":"cli_demo12345678","appSecret":"good-secret-123"}'`，`api owner@demo.test -X POST $B/api/v1/feishu/targets -d '{"shopId":null,"chatId":"oc_stub_service"}'`，两次都 `HTTP 200`；之后 Demo Store 用飞书应用接法，默认群「Shopilot 客服群（替身）」，两个推送开关都开。
  - 清除故障注入：`PUT /api/mock/sim/faults` 同一组 `{ platform, shopId, category }` 带 `mode: "off"`（`DELETE` 不生效）。
  - 「curl 会话」：在终端先执行下面的函数定义，`login <邮箱> [密码]` 返回 200 即取到 cookie（不给密码时用种子密码）；之后 `api <邮箱> <curl 参数>` 发请求，输出末行为 `HTTP <状态码>`。本轮结束删除临时目录。

```bash
B=http://127.0.0.1:3360; SP_TMP=$(mktemp -d)
login() { pw=${2:-Shopilot-Demo-2026}; curl -s -c "$SP_TMP/$1" -H "Origin: $B" -H 'Content-Type: application/json' \
  -X POST "$B/api/auth/sign-in/email" -d "{\"email\":\"$1\",\"password\":\"$pw\"}" -o /dev/null -w '%{http_code}\n'; }
api() { who=$1; shift; curl -s -b "$SP_TMP/$who" -H "Origin: $B" -H 'Content-Type: application/json' -w '\nHTTP %{http_code}\n' "$@"; }
# 轮次结束：rm -rf "$SP_TMP"
```

  - 「Shopee 签名调用」：调模拟平台 Shopee 应用级接口（签名 = HMAC-SHA256(Partner Key, Partner ID + 路径 + 时间戳)，与官方一致）。例：读应用 `2001001` 的推送配置。

```bash
ts=$(date +%s); api_path=/api/v2/push/get_app_push_config
sign=$(printf '%s' "2001001${api_path}${ts}" | openssl dgst -sha256 -hmac 'mock-key-2001001' | awk '{print $NF}')
curl -s "$B/mock/shopee/sg${api_path}?partner_id=2001001&timestamp=${ts}&sign=${sign}"
```

  - 「Shopee 签名推送」：向 Shopilot 回调重放一条推送（`Authorization` = HMAC-SHA256(Partner Key, 回调 URL + `|` + 原始 body)，DESIGN `API-HOOK-001`）。回调 URL 与 body 从模拟器推送日志里复制。

```bash
url='<推送日志里的目标 URL>'; body='<推送日志里的原始载荷>'
sig=$(printf '%s|%s' "$url" "$body" | openssl dgst -sha256 -hmac 'mock-key-2001001' | awk '{print $NF}')
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$url" -H "Authorization: $sig" -H 'Content-Type: application/json' --data-raw "$body"
```

  - 「Shopee 改回调」：把应用 `2001001` 的推送回调改到别处，模拟商户在平台后台改了配置。模拟平台按官方行为先向新地址发一条测试推送，3 秒内拿不到 2xx 就拒绝修改，所以「别处」用模拟商户自有系统 `$B/mock/erp/...`（DESIGN `API-MOCK-009`，一律回 200）。

```bash
ts=$(date +%s); api_path=/api/v2/push/set_app_push_config
sign=$(printf '%s' "2001001${api_path}${ts}" | openssl dgst -sha256 -hmac 'mock-key-2001001' | awk '{print $NF}')
curl -s -X POST "$B/mock/shopee/sg${api_path}?partner_id=2001001&timestamp=${ts}&sign=${sign}" \
  -H 'Content-Type: application/json' -d "{\"callback_url\":\"$B/mock/erp/shopee/push\"}"
```

  - 以上三个配方换应用时，把 `2001001` 与 `mock-key-2001001` 换成对应的 Partner ID 与 Key，主机区域段换成该应用登记的区域（`1000101`、`2001001` 为 `sg`，`2001003` 为 `cn`，`2001002` 为 `sandbox`）。
- 测试图片（放 `$SP_TMP/img/`，执行前准备）：约 2 MB 的 PNG、恰好 10,485,760 字节的 PNG、约 11 MB 的 JPG、一张 GIF。
- 测试视频（同目录）：`ffmpeg -f lavfi -i testsrc=duration=3:size=320x240:rate=25 -pix_fmt yuv420p -y $SP_TMP/img/clip.mp4`，再把同样参数的输出换成 `clip.mov`；`ffmpeg -f lavfi -i testsrc=duration=2:size=320x240:rate=25 -c:v libvpx-vp9 -b:v 200k -y $SP_TMP/img/clip.webm`；只带 MP4 文件头、其余补零的大文件：`{ printf '\0\0\0\030ftypisom'; head -c $((31*1024*1024-12)) /dev/zero; } > $SP_TMP/img/big31.mp4`，把 31 换成 101 得到 `big101.mp4`；文件头是 QuickTime、后缀是 .mp4 的视频：`cp $SP_TMP/img/clip.mov $SP_TMP/img/qt.mp4`；横屏与竖屏视频：`ffmpeg -f lavfi -i testsrc=duration=3:size=1280x720:rate=25 -pix_fmt yuv420p -y $SP_TMP/img/wide.mp4`，把 `1280x720` 换成 `720x1280` 输出 `tall.mp4`。
- 知识库测试文件（放 `$KB`，执行前在仓库根运行下面的命令生成）：PDF 每页挂一段随机字节，页大小可控；xlsx、docx 是只存不压的 zip，文件头与 Office 文件相同。

```bash
KB=$SP_TMP/kb; mkdir -p "$KB"
node --input-type=module -e '
import { PDFDocument, PDFName } from "pdf-lib"; import { randomBytes } from "node:crypto"; import { writeFileSync } from "node:fs";
const MB = 1024 * 1024, dir = process.argv[1];
const pdf = async (sizes) => { const d = await PDFDocument.create(); for (const s of sizes) { const p = d.addPage([200, 200]); p.node.set(PDFName.of("Junk"), d.context.register(d.context.stream(randomBytes(Math.round(s))))); } return d.save({ useObjectStreams: true }); };
writeFileSync(`${dir}/保修政策.pdf`, await pdf([1.5 * MB, 1.5 * MB]));
writeFileSync(`${dir}/大文件.pdf`, await pdf(Array(25).fill(MB)));
writeFileSync(`${dir}/拆分.pdf`, await pdf(Array(30).fill(0.6 * MB)));
writeFileSync(`${dir}/单页超限.pdf`, await pdf(Array.from({ length: 15 }, (_, i) => (i === 11 ? 11 * MB : 0.2 * MB))));
' "$KB"
(cd "$KB" && head -c 1048576 /dev/urandom > _1m && head -c 5242880 /dev/urandom > _5m && zip -q -0 型号对照.xlsx _1m && zip -q -0 说明书.docx _5m && rm _1m _5m)
printf '# 保修政策\n\n所有相机保修 12 个月，自签收之日起计算。\n退货需在签收后 7 天内申请。\n' > "$KB/保修政策.md"
printf '运费说明：马来西亚境内订单满 100 令吉包邮。\n' > "$KB/运费说明.txt"
printf 'not really a ppt' > "$KB/产品介绍.pptx"; printf 'plain text, not a pdf\n' > "$KB/伪装.pdf"; printf 'MZ binary' > "$KB/工具.exe"
```

  得到：保修政策.pdf 约 3 MB（2 页）、大文件.pdf 约 25 MB、拆分.pdf 约 18 MB（30 页，每页约 0.6 MB）、单页超限.pdf 约 14 MB（15 页，第 12 页 11 MB）、型号对照.xlsx 约 1 MB、说明书.docx 约 5 MB、保修政策.md、运费说明.txt、产品介绍.pptx、伪装.pdf（扩展名是 pdf、内容是文本）、工具.exe。
- 知识库 curl 函数（先执行「curl 会话」，再执行下面的定义；`kbup` 上传一份资料，追加的参数原样交给 curl，如 `-F categoryId=<ID> -F markets=MY`；`kbclear` 删掉 Demo Store 全部资料与自建分类（先 `login owner@demo.test` 一次；登录每 IP 每分钟限 30 次，函数里不重复登录）；`q` 在本机库执行一条 SQL，库名默认 `shopilot`；除草稿对比用例把草稿生成时间往前改之外，用例里都只读）：

```bash
kbup() { who=$1; f=$2; shift 2; curl -s -b "$SP_TMP/$who" -H "Origin: $B" -F "file=@$f" "$@" -w '\nHTTP %{http_code}\n' "$B/api/v1/knowledge/documents"; }
kbclear() {
  while ids=$(curl -s -b "$SP_TMP/owner@demo.test" "$B/api/v1/knowledge/documents?limit=100" | jq -r '.items[].id') && [ -n "$ids" ]; do
    for id in $ids; do curl -s -o /dev/null -b "$SP_TMP/owner@demo.test" -H "Origin: $B" -X DELETE "$B/api/v1/knowledge/documents/$id"; done; done
  for id in $(curl -s -b "$SP_TMP/owner@demo.test" "$B/api/v1/knowledge/categories" | jq -r '.items[] | select(.builtin | not) | .id'); do
    curl -s -o /dev/null -b "$SP_TMP/owner@demo.test" -H "Origin: $B" -X DELETE "$B/api/v1/knowledge/categories/$id"; done; }
q() { docker compose exec -T postgres psql -U shopilot -d "${SP_DB:-shopilot}" -Atc "$1"; }
qa() { who=$1; shift; api "$who" "$@"; }
qaclear() {
  for id in $(curl -s -b "$SP_TMP/owner@demo.test" "$B/api/v1/knowledge/qa?limit=100" | jq -r '.items[].id'); do
    curl -s -o /dev/null -b "$SP_TMP/owner@demo.test" -H "Origin: $B" -X DELETE "$B/api/v1/knowledge/qa/$id"; done
  for id in $(curl -s -b "$SP_TMP/owner@demo.test" "$B/api/v1/products" | jq -r '.items[].id'); do
    curl -s -o /dev/null -b "$SP_TMP/owner@demo.test" -H "Origin: $B" -X DELETE "$B/api/v1/products/$id"; done; }
```

  - `qa` 与 `api` 相同，只是让问答步骤读起来更直；`qaclear` 先删 Demo Store 全部问答再删全部产品（问答还关联着产品时产品删不掉，所以顺序不能反）；列表每次最多 100 条，问答超过 100 条时重复执行。
- 经验卡与会话学习函数（先执行「curl 会话」与知识库 curl 函数，再执行下面的定义；`newbuyer <平台> <店铺号> <买家名>` 用模拟器接口新建买家并输出模拟器会话 ID（Demo Shopee MY `220001`、Demo Shopee SG `220002`、Demo TikTok MY `7000001`）；`say <模拟器会话 ID> <文字>` 以买家身份发一句，输出 `true`；`conv <买家名>` 输出 Shopilot 会话 ID；`waitq <SQL>` 每秒查一次、直到 SQL 有输出，最多 60 秒，超时输出 `TIMEOUT`；`cardk` 以 owner 建一张「卡 K」并输出卡 ID；`cardclear` 删掉 Demo Store 全部经验卡）：

```bash
sim() { curl -s -X POST "$B/api/mock/sim/$1" -H 'Content-Type: application/json' -d "$2"; }
newbuyer() { sim create_buyer "{\"platform\":\"$1\",\"shopId\":\"$2\",\"name\":\"$3\",\"language\":\"zh\"}" | jq -r .conversationId; }
say() { sim buyer_message "{\"conversationId\":\"$1\",\"text\":\"$2\"}" | jq -r .ok; }
conv() { q "select id from conversation where buyer_name = '$1' order by created_at desc limit 1"; }
waitq() { n=0; r=$(q "$1"); until [ -n "$r" ] || [ $n -ge 60 ]; do sleep 1; n=$((n+1)); r=$(q "$1"); done; echo "${r:-TIMEOUT}"; }
cat > "$SP_TMP/card-k.json" <<'JSON'
{"title":"摄像头识别不到：帮买家恢复使用","stage":"any","markets":["ALL"],"conditions":["买家说摄像头识别不到"],"conditionMode":"all","steps":[{"text":"问清电脑系统和连接方式","branches":[{"when":"急用","action":"handoff"}]},{"text":"换线、换接口","branches":[{"when":"保修","action":"ticket"}]},{"text":"安装或更新配套软件","branches":[]}],"tips":"每次只让买家做一步"}
JSON
cardk() { curl -s -b "$SP_TMP/owner@demo.test" -H "Origin: $B" -H 'Content-Type: application/json' -X POST "$B/api/v1/knowledge/cards" -d @"$SP_TMP/card-k.json" | jq -r .card.id; }
cardclear() { for id in $(curl -s -b "$SP_TMP/owner@demo.test" "$B/api/v1/knowledge/cards?limit=100" | jq -r '.items[].id'); do curl -s -o /dev/null -b "$SP_TMP/owner@demo.test" -H "Origin: $B" -X DELETE "$B/api/v1/knowledge/cards/$id"; done; }
```

  - 卡 K：标题「摄像头识别不到：帮买家恢复使用」，阶段「全部阶段」，站点「全部站点」，一条调用条件「买家说摄像头识别不到」（全部满足）；第 1 步「问清电脑系统和连接方式」，分支「急用」→ 转人工；第 2 步「换线、换接口」，分支「保修」→ 建工单；第 3 步「安装或更新配套软件」；沟通提示「每次只让买家做一步」。
  - 出稿替身用卡（`AI_MODE=stub`，出稿、测试问答、模拟出稿共用）：请求带候选卡时，本段有正在用的卡就接着用它、步骤加 1（不超过最后一步），否则用第 1 张候选卡（拟发布的卡、正在用的卡排在最前）的第 1 步；这一步某个分支的条件原文出现在买家最新一条消息里时按这个分支走（转人工、建工单、跳到第 n 步）。用卡理由一律「替身：调用条件成立」，建工单的说明是「替身：<分支条件>」；按卡转人工时替身同时给出 `handoff = true`、`reason = card`。
  - 会话学习替身（`learn`）：备注或消息里有「无需」→ 诊断「已有内容覆盖」，任务结束、结论「无需更新」；有「新卡」，或相似卡里没有一张的标题与某条买家消息有两个相连的相同字 → 诊断「流程需要补充」，写一张新卡（标题「替身：<最后一条勾选的买家文字前 20 字>」，一条调用条件「买家提到「<同前>」」，一步「替身第一步：问清情况」），进待审核；否则改那张相似卡，在最后加一步「替身补充的一步」，直接复测。判断依据「替身：按关键词判断」，建议「替身：按建议更新」。复测判定替身（`judge`）：载荷里出现「变差」判「改后变差」，否则「不比改前差」。替身不会给出「知识缺失」「证据不足」「内容冲突」，也不会分析失败。
  - Agent 挑会话：`pnpm job learning.pick '{"merchantId":"<Demo Store 的商户 ID>"}'` 只挑这一家（商户 ID 用 `q "select id from merchant where name = 'Demo Store'"` 取）；挑出的段由 Worker 的 `learning.analyze` 分析，几秒内出结论。

- 工具：浏览器自动化用 Playwright + 本机 Microsoft Edge（`channel: 'msedge'`），人工执行同样用 Edge；接口用 curl（见「curl 会话」）与 jq；两步验证码用验证器 App，或 `oathtool --totp -b <密钥>`（密钥取自开启时显示的 `totpURI` 里的 `secret`）；定时任务用 `pnpm job`，时间敏感数据用 `pnpm scenario`；邮件看 `/dev/outbox`。
- 证据目录：`docs/test-runs/`。截图与响应体按 `run-NNN-<TC ID>-<步骤号>.png` / `.json` 命名，文中引用一律写以项目根为基准的相对路径。cookie 文件不放证据目录。

## 4. 用例库

约定：「Nur」= agent@demo.test，「Mei」= agent2@demo.test，「Arif」= lead@demo.test，「林晓」或 owner = owner@demo.test，「陈卓」或 admin2 = admin2@demo.test。「api <邮箱>」「login <邮箱>」见 §3「curl 会话」。错误响应写「HTTP 状态 + `type`」，指 RFC 9457 problem+json 响应体的 `type` 字段。会话 ID 取自工作台地址栏 `/wb/<ID>`，工单 ID 取自 `/tickets/<ID>`，商户 ID 取自 `GET /api/v1/me` 的 `memberships[].merchantId`，店铺与成员 ID 取自 `GET /api/v1/me`、`GET /api/v1/shops`、`GET /api/v1/members` 的响应。

### 认证与账号

#### `TC-AUTH-001` 注册商户后成为所有者并进入接入向导 — 对应 `REQ-AUTH-001` · 级别: 冒烟 · 执行者: 皆可

前置：基线；邮箱 signup1@demo.test 未注册；浏览器未登录。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 打开 `/signup` | 表单有邮箱、密码、姓名、商户名、时区（默认 Asia/Kuala_Lumpur (UTC+8)）与「创建商户」按钮 |
| 2 | 填 signup1@demo.test、密码 `Signup-Test-01`、姓名「测试店主」、商户名「Signup Store」、时区 Asia/Kuala_Lumpur，点「创建商户」 | 跳到 `/shops/connect`，页面有 Shopee 与 TikTok Shop 两个平台选项；`POST /api/v1/signup` 返回 201 |
| 3 | 看侧栏 | 有工作台、工单、订单与开票、看板、接待设置、店铺与连接、团队与权限、用量与套餐、商户设置 |
| 4 | 同一浏览器打开 `/api/v1/me` | JSON 中 `active.merchantName` 为 Signup Store，`active.role` 为 `admin`，`active.isOwner` 为 `true` |
| 5 | 打开 `/dev/outbox` | 有一封发往 signup1@demo.test、模板 `verify_email` 的邮件 |
| 6 | 打开 `/team` | 成员列表只有「测试店主」一行：角色管理员，带账号所有者标记，状态列显示在线（不是「已停用」） |

后置：无（`TC-SHOP-001` 等用例承接这个新商户）。

#### `TC-AUTH-002` 重复邮箱注册被拒 — 对应 `REQ-AUTH-001` · 级别: 回归 · 执行者: 皆可

前置：基线；浏览器未登录。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 在 `/signup` 用 owner@demo.test 与其他合法字段（商户名「Dup Store」）提交 | 邮箱字段下提示该邮箱已注册、请直接登录；接口 409，`type` 为 `/errors/duplicate` |
| 2 | 点表单底部的「登录」链接 | 跳到 `/login` |
| 3 | `login owner@demo.test`，`api owner@demo.test $B/api/v1/me` | `memberships` 只有 Demo Store，没有 Dup Store（只属一个商户时账号弹层不列商户，见 `TC-AUTH-013`） |

后置：无。

#### `TC-AUTH-003` 注册表单非法输入与边界 — 对应 `REQ-AUTH-001` · 级别: 边缘 · 执行者: 皆可

前置：基线；浏览器未登录；终端已按 §3「curl 会话」定义 `B`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `/signup` 填 signup2@demo.test、9 位密码 `Abcdefgh1`，其余合法，提交 | 不跳转；密码字段标红并提示至少 10 位（若请求已发出，接口 422，`type` 为 `/errors/validation`，`extra.fields` 含 `password`） |
| 2 | 把密码改为 10 位 `Abcdefgh12` 再提交 | 跳到 `/shops/connect`；接口 201 |
| 3 | `curl -s -X POST $B/api/v1/signup -H 'Content-Type: application/json' -H "Origin: $B" -d '{"email":"signup3@demo.test","password":"Abcdefgh12","name":"T","merchantName":"S3","timezone":"Europe/London"}'` | 422，`type` 为 `/errors/validation`，`extra.fields` 含 `timezone` |
| 4 | 同上命令，时区改为 `Asia/Bangkok`、`merchantName` 为 81 个字 | 422，`extra.fields` 含 `merchantName` |
| 5 | 同上命令，`merchantName` 改回 `S3`、`email` 为 `not-an-email` | 422，`extra.fields` 含 `email` |

后置：无。

#### `TC-AUTH-004` 登录与退出 — 对应 `REQ-AUTH-002` · 级别: 冒烟 · 执行者: 皆可

前置：基线；浏览器未登录；终端已定义「curl 会话」函数。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 在 `/login` 用 agent@demo.test 与 `Shopilot-Demo-2026` 点「登录」 | 跳到 `/wb`，顶栏账号卡显示 Nur Aisyah |
| 2 | 打开账号弹层点「退出登录」 | 跳到 `/login` |
| 3 | 直接打开 `/wb` | 被带回 `/login` |
| 4 | `login agent@demo.test`，再 `api agent@demo.test $B/api/v1/me` | 先输出 200；`/me` 返回 HTTP 200，`user.email` 为 agent@demo.test |
| 5 | `api agent@demo.test -X POST $B/api/auth/sign-out -d '{}'`，再 `api agent@demo.test $B/api/v1/me` | 退出返回 200；`/me` 返回 401，`type` 为 `/errors/unauthenticated`（退出请求不带请求体与 Content-Type 时同样返回 200） |
| 6 | 以 owner@demo.test 登录，`/team` 打开「登录记录」 | 有 agent@demo.test 结果为成功的记录，时间与第 1 步一致 |

后置：无。

#### `TC-AUTH-005` 同一邮箱连续输错 10 次锁定 — 对应 `REQ-AUTH-002` · 级别: 回归 · 执行者: 皆可

前置：基线；终端已定义 `B`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 用错误密码 `wrong-pass-00` 对 agent@demo.test 请求 `POST $B/api/auth/sign-in/email` 共 10 次 | 每次 401，`type` 为 `/errors/invalid-login` |
| 2 | 第 11 次用正确密码请求 | 423，`type` 为 `/errors/locked`，`extra.retryAfter` 大于 0 且不超过 900 秒 |
| 3 | 以 owner@demo.test 登录，`/team`「登录记录」选「失败」 | agent@demo.test 有 10 条失败（原因密码错误 `bad_password`）与 1 条失败（原因锁定 `locked`） |
| 4 | 在另一个未登录的浏览器上下文用 agent@demo.test 正确密码登录 | 不进入 `/wb`；页面提示账号已锁定并显示剩余分钟数 |

后置：`pnpm db:reset && pnpm db:seed`（解除锁定）。

#### `TC-AUTH-006` 登录错误不区分邮箱是否存在 — 对应 `REQ-AUTH-002` · 级别: 回归 · 执行者: 皆可

前置：基线；浏览器未登录。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `/login` 用 nobody@demo.test 与任意密码登录 | 表单显示错误提示，记下原文 M1；接口 401，`type` 为 `/errors/invalid-login` |
| 2 | 用 agent@demo.test 与错误密码登录 | 错误提示原文与 M1 相同；接口 401，`type` 为 `/errors/invalid-login` |
| 3 | 以 owner@demo.test 登录看「登录记录」 | agent@demo.test 一条失败（`bad_password`）；nobody@demo.test 不属于任何商户，不出现在商户的登录记录里 |

后置：无。

#### `TC-AUTH-007` 未登录访问受保护页面跳登录并回跳 — 对应 `REQ-AUTH-002` · 级别: 回归 · 执行者: 皆可

前置：基线；浏览器未登录。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 打开 `/tickets` | 跳到 `/login`，地址带 `next=/tickets` |
| 2 | 以 agent@demo.test 登录 | 登录后停在 `/tickets` |
| 3 | 不带 cookie `curl -s -o /dev/null -w '%{http_code}' $B/api/v1/conversations` | 输出 401 |

后置：无。

#### `TC-AUTH-008` 找回密码并吊销其他会话 — 对应 `REQ-AUTH-003` · 级别: 回归 · 执行者: 皆可

前置：基线；浏览器 A 以 agent2@demo.test 登录并停在 `/wb`；浏览器 B 未登录。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | B：`/login` 点「忘记密码」，填 agent2@demo.test 提交 | 页面提示已发送（不说明邮箱是否存在）；接口 202 |
| 2 | 打开 `/dev/outbox` | 有一封发往 agent2@demo.test、模板 `password_reset` 的邮件，含 `/reset-password?token=` 链接 |
| 3 | B 打开该链接，设新密码 `Mei-New-Pass-2026` 并提交 | 跳到 `/login` 并提示密码已重置 |
| 4 | B 用新密码登录 | 进入 `/wb` |
| 5 | B 退出后用旧密码 `Shopilot-Demo-2026` 登录 | 提示邮箱或密码错误，停在 `/login` |
| 6 | A 刷新 `/wb` | 被带回 `/login` |
| 7 | 再次打开第 2 步的链接并提交新密码 | 页面提示链接已使用；接口 410，`type` 为 `/errors/expired`，`code` 为 `used` |

后置：`pnpm db:reset && pnpm db:seed`。

#### `TC-AUTH-009` 找回密码防枚举、限频与新密码校验 — 对应 `REQ-AUTH-003` · 级别: 边缘 · 执行者: 皆可

前置：基线；终端已定义 `B`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `POST $B/api/v1/password/forgot` 体 `{"email":"nobody@demo.test"}` | 202；`/dev/outbox` 没有发往 nobody@demo.test 的邮件 |
| 2 | 60 秒内对 agent@demo.test 连发两次同样请求 | 两次都 202；发件箱只新增一封发往 agent@demo.test 的 `password_reset` |
| 3 | 打开该邮件链接，新密码填 9 位 `Abcdefgh1` 提交 | 页面提示至少 10 位；接口 422，`type` 为 `/errors/validation` |
| 4 | 用旧密码登录 agent@demo.test | 进入 `/wb`（密码未被改动） |

后置：无。

#### `TC-AUTH-010` 账号弹层修改密码发出链接 — 对应 `REQ-AUTH-003` · 级别: 回归 · 执行者: 皆可

前置：基线；以 agent@demo.test 登录。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 打开账号弹层，点「修改密码」 | 提示已发送修改邮件（30 分钟有效） |
| 2 | 打开 `/dev/outbox` | 有一封发往 agent@demo.test、模板 `password_reset` 的邮件 |
| 3 | 刷新 `/wb` | 仍在工作台（发链接不登出当前会话） |

后置：无。

#### `TC-AUTH-011` 员工在两个商户之间切换 — 对应 `REQ-AUTH-004` · 级别: 回归 · 执行者: 皆可

前置：基线；以 agent@demo.test 登录（Demo Store 与 Other Store 的员工）；当前商户不是 Demo Store 时先在账号弹层切到 Demo Store。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 打开账号弹层 | 列出 Demo Store 与 Other Store 两个商户及各自角色（员工），Demo Store 标为当前 |
| 2 | 在 `/wb` 打开任一会话，记下会话 ID C1 | 地址为 `/wb/<C1>`，会话的店铺属于 Demo Store |
| 3 | 账号弹层点 Other Store | 页面重新加载到 `/wb`；侧栏只有工作台、工单、订单与开票；会话列表里没有 Demo Store 的店铺名 |
| 4 | 打开 `/wb/<C1>`；同时 `api agent@demo.test $B/api/v1/conversations/<C1>`（curl 会话也先切到 Other Store：`api agent@demo.test -X POST $B/api/v1/me/active-merchant -d '{"merchantId":"<Other Store ID>"}'`） | 页面显示「找不到或已删除」；接口 404，`type` 为 `/errors/not-found` |
| 5 | 账号弹层切回 Demo Store，打开 `/wb/<C1>` | 显示该会话的时间线与右栏 |

后置：无。

#### `TC-AUTH-012` 不同商户不同角色，切换后权限重载 — 对应 `REQ-AUTH-004`、`REQ-TEAM-002` · 级别: 回归 · 执行者: 皆可

前置：先执行 `TC-TEAM-002`（other@demo.test 已是 Demo Store 员工，同时是 Other Store 管理员）。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 以 other@demo.test 登录，打开账号弹层 | 列出 Other Store（管理员）与 Demo Store（员工） |
| 2 | 切到 Other Store，看侧栏 | 有接待设置、店铺与连接、团队与权限、用量与套餐、商户设置 |
| 3 | 切到 Demo Store，看侧栏并打开 `/team` | 侧栏只有工作台、工单、订单与开票；`/team` 显示「这个页面只对管理员开放」 |
| 4 | `login other@demo.test`，按当前商户 Demo Store 请求 `api other@demo.test $B/api/v1/members` | 403，`type` 为 `/errors/forbidden` |
| 5 | `api other@demo.test -X POST $B/api/v1/me/active-merchant -d '{"merchantId":"<Other Store ID>"}'` 后再请求 `/api/v1/members` | 切换返回 200；`/members` 返回 200 |

后置：无。

#### `TC-AUTH-013` 切换到非成员商户被拒，单商户不显示切换 — 对应 `REQ-AUTH-004` · 级别: 边缘 · 执行者: 皆可

前置：基线。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `login other@demo.test`，`api other@demo.test $B/api/v1/me` | 记下 `active.merchantId` 为 OS_ID |
| 2 | `login admin2@demo.test`，`api admin2@demo.test -X POST $B/api/v1/me/active-merchant -d '{"merchantId":"<OS_ID>"}'` | 403，`type` 为 `/errors/forbidden` |
| 3 | 浏览器以 admin2@demo.test 登录，打开账号弹层 | 不显示商户切换列表（只属于 Demo Store） |

后置：无。

#### `TC-AUTH-014` 商户要求两步验证时未开启者只能先开启 — 对应 `REQ-AUTH-005`、`REQ-SET-003` · 级别: 回归 · 执行者: 皆可

前置：基线；浏览器 A 以 owner@demo.test 登录；admin2 与 agent 都未开两步验证。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | A：`/settings/security` 打开「管理员两步验证」，点「保存」 | 提示已保存；A 自己（未开两步验证的管理员，含所有者）随后也被带到 `/account/security` |
| 2 | 浏览器 B 以 admin2@demo.test 登录 | 进入 `/account/security`；点侧栏「工作台」仍停在该页 |
| 3 | `login admin2@demo.test`，`api admin2@demo.test $B/api/v1/conversations` | 403，`type` 为 `/errors/two-factor-required` |
| 4 | B：在该页输入密码开启，用验证器扫码后输入当前验证码 | 开启前页面列出备用码；验证后提示已开启，随即回到登录前要去的 `/wb` 并显示会话列表 |
| 5 | B：退出后重新登录，输完密码后填一个错误验证码 | 提示验证码错误；接口 401，`type` 为 `/errors/invalid-login` |
| 6 | B：填正确验证码 | 进入 `/wb` |
| 7 | A：先在 `/account/security` 开启两步验证，再到 `/settings/security` 打开「全员两步验证」并保存；浏览器 C 以 agent@demo.test 登录 | C 进入 `/account/security`，其他页面不可用 |

后置：`pnpm db:reset && pnpm db:seed`。

#### `TC-AUTH-015` 个人开启与关闭两步验证 — 对应 `REQ-AUTH-005` · 级别: 回归 · 执行者: 皆可

前置：基线；以 agent@demo.test 登录；商户没有两步验证要求。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 打开 `/account/security`，输入密码开启，扫码后输入当前验证码 | 显示备用码并提示已开启 |
| 2 | 退出后重新登录 | 输完密码后要求输入验证码；填正确验证码后进入 `/wb` |
| 3 | 回到 `/account/security`，输入密码关闭 | 提示已关闭 |
| 4 | 退出后重新登录 | 不再要求验证码，直接进入 `/wb` |

后置：无。

#### `TC-AUTH-016` 员工退出其他设备 — 对应 `REQ-AUTH-006` · 级别: 回归 · 执行者: 皆可

前置：基线；agent@demo.test 在浏览器 A、浏览器 B 各登录一次。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | A：打开账号弹层，点「账号安全」 | 进入 `/account/security`；本人设备列表 2 条，当前设备有标记；页面另有两步验证与个人偏好（桌面通知、提示音）两块 |
| 2 | A：点「退出其他设备」 | 设备列表只剩当前设备 |
| 3 | B：刷新 `/wb` | 被带回 `/login` |
| 4 | A：刷新 `/wb` | 仍在工作台 |

后置：无。

#### `TC-AUTH-017` 在账号安全页退出单个设备 — 对应 `REQ-AUTH-006` · 级别: 回归 · 执行者: 皆可

前置：基线；owner@demo.test 在浏览器 A、浏览器 B 各登录一次。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | A：打开 `/account/security` | 本人设备列表 2 条，当前设备有标记 |
| 2 | A：对不是当前设备的那条点「退出」 | 列表剩 1 条 |
| 3 | B：刷新 `/wb` | 被带回 `/login` |

后置：无。

#### `TC-AUTH-018` IP 白名单拦截登录 — 对应 `REQ-AUTH-006`、`REQ-SET-003` · 级别: 回归 · 执行者: 皆可

前置：基线；以 owner@demo.test 登录。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `/settings/security` 打开「IP 限制」，白名单填 `127.0.0.1/32`，点「保存」 | 提示已保存 |
| 2 | 以 agent@demo.test 正确密码请求登录，请求头加 `X-Forwarded-For: 203.0.113.9` | 403，`type` 为 `/errors/ip-blocked` |
| 3 | 同样请求但不加该请求头 | 200 |
| 4 | `/team`「登录记录」 | agent@demo.test 一条失败（`ip_blocked`），IP 为 203.0.113.9 |

后置：`pnpm db:reset && pnpm db:seed`。

#### `TC-AUTH-019` 白名单不含当前 IP 时拒绝保存 — 对应 `REQ-AUTH-006`、`REQ-SET-003` · 级别: 回归 · 执行者: 皆可

前置：基线；以 owner@demo.test 登录。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `/settings/security` 打开「IP 限制」，白名单只填 `203.0.113.0/24`，点「保存」 | 页面提示新白名单不含当前 IP，未保存；接口 422 |
| 2 | 刷新页面 | 「IP 限制」仍为关闭，白名单为空 |

后置：无。

#### `TC-AUTH-020` 商户会话时长 8 小时 — 对应 `REQ-AUTH-006`、`REQ-SET-003` · 级别: 回归 · 执行者: 皆可

前置：基线；浏览器 A 以 owner@demo.test 登录；浏览器 B 以 agent@demo.test 登录。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | A：`/settings/security` 会话时长选「8 小时」，点「保存」 | 提示已保存 |
| 2 | 终端执行 `pnpm scenario session-aged-9h` | 输出被改动的会话（agent@demo.test，创建于 9 小时前） |
| 3 | B：刷新 `/wb` | 被带回 `/login` |
| 4 | B：重新登录 | 进入 `/wb` |

后置：`pnpm db:reset && pnpm db:seed`。


#### `TC-AUTH-021` 丢了验证器时用备用码登录 — 对应 `REQ-AUTH-005` · 级别: 回归 · 执行者: 皆可

前置：基线；`/signup` 新注册一个商户（邮箱 `tc-auth-021-<序号>@demo.test`），登录后在 `/account/security` 开启两步验证，记下第 2 步显示的一个备用码 K；退出登录。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `/login` 输完密码，进入两步验证步骤 | 除验证码输入框外，有「手机不在身边？改用备用码」与「返回重新输入密码」 |
| 2 | 点「改用备用码」，填 K，提交 | 进入 `/wb` |
| 3 | 退出后再登录，到两步验证步骤改用备用码，仍填 K | 提示备用码不正确，停在两步验证步骤（备用码只能用一次） |
| 4 | 点「返回重新输入密码」 | 回到填邮箱与密码的步骤 |

后置：无。

### 团队与成员

#### `TC-TEAM-001` 邀请员工并以新账号接受 — 对应 `REQ-TEAM-001`、`REQ-TEAM-002` · 级别: 回归 · 执行者: 皆可

前置：基线；浏览器 A 以 owner@demo.test 登录；nur.new@demo.test 不是成员。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | A：`/team` 点「邀请成员」 | 弹层有邮箱输入、角色（默认员工）、负责店铺勾选与「发送邀请」 |
| 2 | 填 nur.new@demo.test，角色员工，勾 Demo Shopee MY，点「发送邀请」 | 弹层显示该邮箱的邀请链接（带复制按钮）与 7 天后的到期时间；成员列表新增 nur.new@demo.test，状态待接受 |
| 3 | 打开 `/dev/outbox` | 有一封发往 nur.new@demo.test、模板 `invitation` 的邮件，正文链接与第 2 步相同 |
| 4 | 在未登录的浏览器 B 打开该链接 | 邀请页显示商户 Demo Store、邀请人林晓、角色员工、负责店铺 Demo Shopee MY，并要求填姓名与密码 |
| 5 | B：填姓名「Nur New」、密码 `Nur-New-Pass-01`，点「创建账号并加入」 | 跳到 `/wb` |
| 6 | B：看侧栏与会话列表 | 侧栏没有「看板」「店铺与连接」；会话列表每行的店铺都是 Demo Shopee MY |
| 7 | A：刷新 `/team` | 该行显示 Nur New，角色员工，负责店铺 Demo Shopee MY，状态列显示在线或最近活跃时间（不是「已停用」） |

后置：无。

#### `TC-TEAM-002` 已有账号登录后接受邀请 — 对应 `REQ-TEAM-002` · 级别: 回归 · 执行者: 皆可

前置：基线；浏览器 A 以 owner@demo.test 登录。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | A：邀请 other@demo.test 为员工，负责 Demo Shopee MY | 弹层显示邀请链接 |
| 2 | 在未登录的浏览器 B 打开该链接 | 邀请页提示该邮箱已有账号，需要先登录，没有姓名与密码输入框 |
| 3 | B：按提示以 other@demo.test 登录 | 回到邀请页，显示接受按钮 |
| 4 | B：点接受 | 跳到 `/wb`，账号弹层当前商户为 Demo Store |
| 5 | A：刷新 `/team` | other@demo.test 一行，角色员工，状态列显示在线或最近活跃时间（不是「已停用」） |

后置：无（`TC-AUTH-012` 承接）。

#### `TC-TEAM-003` 登录邮箱与邀请不一致时被拒 — 对应 `REQ-TEAM-002` · 级别: 边缘 · 执行者: 皆可

前置：基线；owner@demo.test 已邀请 other@demo.test 为员工并拿到链接（同 `TC-TEAM-002` 第 1 步）。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 以 agent2@demo.test 登录后打开该链接并点接受 | 页面提示登录账号与邀请邮箱不一致；接口 403，`type` 为 `/errors/forbidden` |
| 2 | owner 刷新 `/team` | 该邀请仍为待接受；agent2 的商户列表没有变化 |

后置：无。

#### `TC-TEAM-004` 已撤销的邀请链接给出原因 — 对应 `REQ-TEAM-001`、`REQ-TEAM-002` · 级别: 回归 · 执行者: 皆可

前置：基线；终端执行 `pnpm scenario invite-revoked`，记下链接 L 与其中的令牌 T。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 未登录浏览器打开 L | 页面显示「邀请已撤销，请联系管理员重发」，没有接受表单 |
| 2 | `curl -s $B/api/v1/invitations/by-token/<T>` | 410，`type` 为 `/errors/expired`，`code` 为 `revoked` |

后置：无。

#### `TC-TEAM-005` 过期邀请重发后旧链接失效 — 对应 `REQ-TEAM-001`、`REQ-TEAM-002` · 级别: 回归 · 执行者: 皆可

前置：基线；终端执行 `pnpm scenario invite-expired`，记下邀请邮箱 E 与链接 L1；浏览器 A 以 owner@demo.test 登录。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 未登录浏览器打开 L1 | 页面提示邀请已过期、请联系管理员重发；by-token 接口 410，`code` 为 `expired` |
| 2 | A：`/team` 在 E 的「更多操作」点「重发邀请」 | 提示已重发 |
| 3 | 打开 `/dev/outbox` | 新增一封发往 E 的 `invitation` 邮件，链接 L2 与 L1 不同 |
| 4 | 打开 L1 | 仍提示邀请不可用；接口 410 |
| 5 | 打开 L2 | 邀请页显示接受表单 |

后置：无。

#### `TC-TEAM-006` 已用的链接与已接受邀请的重发 — 对应 `REQ-TEAM-002`、`REQ-TEAM-001` · 级别: 边缘 · 执行者: 皆可

前置：基线；`login owner@demo.test`；从 `api owner@demo.test $B/api/v1/me` 取 Demo Shopee MY 的店铺 ID S。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `api owner@demo.test -X POST $B/api/v1/invitations -d '{"emails":["used.link@demo.test"],"role":"agent","shopIds":["<S>"]}'` | 201，记下 `items[0].id` 为 I、链接里的令牌 T |
| 2 | 不带 cookie `POST $B/api/v1/invitations/accept`，体 `{"token":"<T>","name":"Used Link","password":"Used-Link-01"}` | 200 |
| 3 | 浏览器打开该邀请链接 | 页面提示邀请已使用；by-token 接口 410，`code` 为 `used` |
| 4 | 同一体再请求一次 accept | 410，`type` 为 `/errors/expired`，`code` 为 `used` |
| 5 | `api owner@demo.test -X POST $B/api/v1/invitations/<I>/resend` | 409，`type` 为 `/errors/conflict` |
| 6 | `curl -s $B/api/v1/invitations/by-token/not-a-real-token` | 410，`type` 为 `/errors/expired`，`code` 为 `invalid` |

后置：无。

#### `TC-TEAM-007` 撤销待接受邀请 — 对应 `REQ-TEAM-001` · 级别: 回归 · 执行者: 皆可

前置：基线；以 owner@demo.test 登录；已邀请 revoke.me@demo.test 为员工并记下链接 L 与邀请 ID I（`GET /api/v1/members` 的 `invitations`）。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `/team` 在 revoke.me@demo.test 的「更多操作」点「撤销邀请」 | 该邀请不再显示为待接受 |
| 2 | 未登录浏览器打开 L | 页面显示「邀请已撤销，请联系管理员重发」 |
| 3 | `api owner@demo.test -X POST $B/api/v1/invitations/<I>/revoke` | 200（重复撤销不报错） |

后置：无。

#### `TC-TEAM-008` 邀请的非法输入 — 对应 `REQ-TEAM-001` · 级别: 边缘 · 执行者: 皆可

前置：基线；以 owner@demo.test 登录并打开「邀请成员」弹层；终端已 `login owner@demo.test`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 填 agent@demo.test（已是成员），点「发送邀请」 | 弹层提示该邮箱已是成员；接口 409，`type` 为 `/errors/duplicate`，`code` 为 `already_member`，响应逐个列出 agent@demo.test |
| 2 | 填 `bad@`，点「发送邀请」 | 邮箱输入标红；不生成邀请 |
| 3 | 用 api 一次提交 21 个不同的新邮箱 | 422，`type` 为 `/errors/validation` |
| 4 | 刷新 `/team` | 没有新增待接受邀请 |
| 5 | 邀请 dup.invite@demo.test 为员工（成功），再对同一邮箱点一次「发送邀请」 | 第二次弹层提示该邮箱已有待接受邀请；接口 409，`type` 为 `/errors/duplicate`，`code` 为 `already_invited`；`/team` 里 dup.invite@demo.test 只有一行待接受 |

后置：无。

#### `TC-TEAM-009` 改角色与负责店铺立即生效 — 对应 `REQ-TEAM-003` · 级别: 回归 · 执行者: 皆可

前置：基线；浏览器 A 以 owner@demo.test 打开 `/team`；浏览器 B 以 agent2@demo.test（Mei，员工）停在 `/wb`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | A：Mei Lin 行的角色下拉选「组长」 | 行内角色显示组长 |
| 2 | A：Mei Lin「更多操作」→「分配店铺」，勾 Demo Shopee MY、Demo TikTok MY，取消 Demo TikTok TH，点「保存」 | 行内负责店铺显示 Demo Shopee MY、Demo TikTok MY |
| 3 | B：刷新页面 | 侧栏出现「看板」；会话列表里没有 Demo TikTok TH 的会话 |
| 4 | B：打开 `/dashboard` | 显示看板卡片与图表，没有无权提示；平台指标与按店数据只出现 Demo Shopee MY、Demo TikTok MY |

后置：无。

#### `TC-TEAM-010` 所有者不能被降级或停用 — 对应 `REQ-TEAM-003`、`REQ-TEAM-004` · 级别: 回归 · 执行者: 皆可

前置：基线；以 admin2@demo.test 登录并打开 `/team`；`login admin2@demo.test`，从 `GET /api/v1/members` 取林晓的 membershipId O。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 看林晓那一行 | 角色是纯文本「管理员」（没有下拉），「更多操作」置灰；悬停两处都显示「账号所有者不能改角色、不能停用；要先在商户设置里转让所有权」 |
| 2 | `api admin2@demo.test -X PATCH $B/api/v1/members/<O> -d '{"role":"agent"}'` | 409，`type` 为 `/errors/not-allowed` |
| 3 | `api admin2@demo.test -X POST $B/api/v1/members/<O>/disable` | 409，`type` 为 `/errors/not-allowed` |
| 4 | 刷新 `/team` | 林晓仍为管理员，状态不是「已停用」 |

后置：无。

#### `TC-TEAM-011` 管理员不能停用本人 — 对应 `REQ-TEAM-004` · 级别: 边缘 · 执行者: 皆可

前置：基线；`login admin2@demo.test`，取陈卓本人的 membershipId A。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `api admin2@demo.test -X POST $B/api/v1/members/<A>/disable` | 409，`type` 为 `/errors/not-allowed` |
| 2 | `api admin2@demo.test $B/api/v1/me` | 200（本人仍可用） |

后置：无。

#### `TC-TEAM-012` 停用成员释放会话与工单，重新启用后恢复 — 对应 `REQ-TEAM-004` · 级别: 回归 · 执行者: 皆可

前置：基线；`login owner@demo.test`，从 `GET /api/v1/conversations?view=team` 数出 Mei Lin 处理中的会话数 c0，从 `GET /api/v1/tickets?scope=all` 数出负责人为 Mei Lin 的未结工单数 t0（种子里 Mei 已有）；按 §3「模拟器发消息」向 Demo Shopee MY 两个新买家各发 1 条；浏览器 B 以 agent2@demo.test（Mei）登录，对这两个会话点「认领」并各发一句；浏览器 A 以 owner@demo.test 在 `/tickets` 点「新建工单」，建「内部确认」工单（店铺 Demo Shopee MY，负责人 Mei Lin），记工单号 T1。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | A：`/team` 在 Mei Lin 的「更多操作」点「停用」并确认 | 行状态变为已停用；接口返回 `releasedConversations` 为 c0 + 2、`returnedTickets` 为 t0 + 1 |
| 2 | B：刷新 `/wb` | 被带回 `/login` |
| 3 | A：`/wb`「待认领」 | 两个会话回到待认领，处理人为空，时间线有一条系统事件说明处理人被停用 |
| 4 | A：打开 T1 | 负责人为 Arif Rahman，时间线有一条负责人变更记录 |
| 5 | A：在 Mei Lin 的「更多操作」点「重新启用」 | 行状态不再是「已停用」，显示最近活跃时间 |
| 6 | B：以 agent2@demo.test 登录 | 进入 `/wb`；A 的 `/team` 中 Mei Lin 负责店铺仍是 Demo Shopee MY、Demo TikTok TH |

后置：无。

#### `TC-TEAM-013` 成员列表与权限表 — 对应 `REQ-TEAM-005` · 级别: 回归 · 执行者: 皆可

前置：基线；以 owner@demo.test 登录。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 打开 `/team` | 每行显示姓名、邮箱、角色、负责店铺（管理员显示全部店铺）、状态、本周处理会话段数；林晓行有账号所有者标记 |
| 2 | 点「权限表」 | 弹层的模块、操作与管理员 / 组长 / 员工三列，和 `docs/roles.md`「权限表」中工作台、订单与开票、工单、看板、接待设置、店铺与连接、团队与权限、用量与套餐、商户设置各行，以及知识库「上传、查看、分类、停用、删除资料，测试问答」一行（管理员 ✓、组长 ✓、员工 —）逐行一致，取值用词（✓、—、负责店铺内、仅所有者）相同；没有知识库的「核验 AI 回复」「维护产品目录与商品归类」两行，没有助手组 |

后置：无。

#### `TC-TEAM-014` 成员列表筛选与本周处理量 — 对应 `REQ-TEAM-005` · 级别: 回归 · 执行者: 皆可

前置：基线；以 owner@demo.test 登录；已邀请 pending.me@demo.test 为员工（未接受）；在 `/team` 周期「本周」下记下 Nur Aisyah 的处理量 N。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 角色筛选选「组长」 | 只剩 Arif Rahman 一行 |
| 2 | 角色选「全部角色」，状态选「待接受」 | 列表含 pending.me@demo.test，且每行都是待接受 |
| 3 | 按 §3「模拟器发消息」向 Demo Shopee MY 新买家发一条；Nur 登录后对该会话点「认领」，发一句后点「结束会话」确认 | 会话进入已结束 |
| 4 | owner 刷新 `/team`（周期本周） | Nur Aisyah 的处理量为 N + 1 |

后置：无。

#### `TC-TEAM-015` 登录记录筛选与导出 CSV — 对应 `REQ-TEAM-006` · 级别: 回归 · 执行者: 皆可

前置：基线；用错误密码登录 agent2@demo.test 一次；以 owner@demo.test 登录。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `/team` 打开「登录记录」 | 弹层列表同时有成功与失败的记录 |
| 2 | 结果选「失败」 | 只剩失败行，其中有 agent2@demo.test 那条 |
| 3 | 点「导出 CSV」 | 下载一个 CSV；每条数据行的结果列都是失败，行数与弹层列表一致 |

后置：无。

#### `TC-TEAM-016` 管理员给成员发重置密码链接 — 对应 `REQ-TEAM-006` · 级别: 回归 · 执行者: 皆可

前置：基线；浏览器 A 以 owner@demo.test 打开 `/team`；浏览器 B 以 agent@demo.test 停在 `/wb`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | A：Nur Aisyah「更多操作」点「重置密码」 | 提示已发送 |
| 2 | 打开 `/dev/outbox` | 新增一封发往 agent@demo.test 的 `password_reset` 邮件 |
| 3 | 60 秒内 A 再点一次「重置密码」 | 页面不报错；发件箱没有第二封新邮件 |
| 4 | B：刷新 `/wb` | 仍在工作台（发链接不登出该成员） |

后置：无。

### 权限与商户隔离

#### `TC-PERM-001` 三种角色的侧栏 — 对应 `REQ-PERM-001` · 级别: 冒烟 · 执行者: 皆可

前置：基线。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 以 owner@demo.test 登录看侧栏与顶栏，再点「收起侧栏」 | 侧栏：工作台（子项待认领、AI 草稿、我处理中、他人处理中、已结束）、工单、订单与开票、看板、接待设置、店铺与连接、团队与权限、用量与套餐、商户设置；导航下方没有出稿用量卡，收起后底部只有「展开侧栏」按钮；没有「知识库」；顶栏没有「助手」 |
| 2 | 以 lead@demo.test 登录看侧栏 | 工作台（含他人处理中）、工单、订单与开票、看板、接待设置；没有店铺与连接、团队与权限、用量与套餐、商户设置 |
| 3 | 以 agent@demo.test 登录看侧栏 | 工作台（待认领、AI 草稿、我处理中、他人处理中、已结束）、工单、订单与开票；没有看板、接待设置 |
| 4 | 三个账号分别请求 `GET /api/v1/nav-summary` | 三个响应都是 200，都没有 `usage` 键 |
| 5 | owner 点侧栏「接待设置」 | 进入 `/reception`；左侧子导航依次为店铺模式、工作时间与转人工、语气与提示词、工单类型与时限、知识库 |
| 6 | lead 点侧栏「接待设置」 | 进入 `/reception/knowledge`；子导航只有「知识库」 |

后置：无。

#### `TC-PERM-002` 员工直接调管理员接口被拒 — 对应 `REQ-PERM-001` · 级别: 冒烟 · 执行者: 皆可

前置：基线；`login agent@demo.test`；浏览器以 agent@demo.test 登录。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `api agent@demo.test -X PUT $B/api/v1/reception/modes -d '{"shops":[]}'` | 403，`type` 为 `/errors/forbidden` |
| 2 | `api agent@demo.test $B/api/v1/members` | 403，`type` 为 `/errors/forbidden` |
| 3 | `api agent@demo.test $B/api/v1/dashboard` | 403，`type` 为 `/errors/forbidden` |
| 4 | 浏览器打开 `/reception` | 原位显示「这个页面只对管理员开放」与返回工作台的入口；点入口回到 `/wb` |
| 5 | 以 owner@demo.test 打开 `/settings/audit`，近 7 天，操作人 Nur Aisyah | 有 3 条权限被拒记录（`permission_denied`） |

后置：无。

#### `TC-PERM-003` 组长调管理员接口被拒 — 对应 `REQ-PERM-001` · 级别: 回归 · 执行者: 皆可

前置：基线；`login lead@demo.test`；浏览器以 lead@demo.test 登录。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 依次请求 `GET /api/v1/members`、`GET /api/v1/shops`、`GET /api/v1/billing`、`GET /api/v1/audit-logs`、`PUT /api/v1/reception/modes`（体 `{"shops":[]}`） | 每个都 403，`type` 为 `/errors/forbidden` |
| 2 | 浏览器打开 `/team` | 显示「这个页面只对管理员开放」 |
| 3 | `api lead@demo.test $B/api/v1/dashboard` | 200 |

后置：无。

#### `TC-PERM-004` 员工看不到同事的会话与非负责店铺的会话 — 对应 `REQ-PERM-001` · 级别: 回归 · 执行者: 皆可

前置：基线；按 §3「模拟器发消息」向 Demo Shopee MY 新买家 B1 发「Mei 的会话」，Mei 登录后对它点「认领」并回复一句，记会话 ID C1；向 Demo TikTok TH（off 店）新买家 B2 发「TH 待认领」，owner 在 `/wb` 待认领找到它，记会话 ID C2；`login agent@demo.test`、`login agent2@demo.test`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `api agent@demo.test $B/api/v1/conversations/<C1>` | 404，`type` 为 `/errors/not-found` |
| 2 | `api agent@demo.test $B/api/v1/conversations/<C2>` | 404，`type` 为 `/errors/not-found` |
| 3 | 浏览器以 Nur 登录，依次看待认领、AI 草稿、我处理中、已结束 | 没有 B1、B2 的会话 |
| 4 | `api agent2@demo.test $B/api/v1/conversations/<C1>` | 200（对照：处理人本人可见） |

后置：无。

#### `TC-PERM-005` 跨商户访问一律 404 — 对应 `REQ-PERM-002` · 级别: 冒烟 · 执行者: 皆可

前置：基线；`login other@demo.test`，从 Other Store 的列表接口各取一个 ID 并记下当前状态：会话 OC（`GET /api/v1/conversations?view=done`）、工单 OT（`GET /api/v1/tickets?scope=all`）、订单 OO（`GET /api/v1/orders`）、发票 OI（`GET /api/v1/invoices`）、店铺 OS（`GET /api/v1/shops`）；`login owner@demo.test`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | owner 依次请求 `GET /api/v1/conversations/<OC>`、`/api/v1/tickets/<OT>`、`/api/v1/orders/<OO>`、`/api/v1/invoices/<OI>/pdf`、`/api/v1/shops/<OS>` | 5 个都 404，`type` 为 `/errors/not-found` |
| 2 | owner 依次请求 `POST /conversations/<OC>/claim`（体 `{"version":1}`）、`POST /tickets/<OT>/notes`（体 `{"text":"cross"}`）、`POST /orders/<OO>/cancel`（体 `{"reason":"buyer_request"}`，头 `Idempotency-Key: tc-perm-005`）、`POST /invoices/<OI>/resend-email`（体 `{}`）、`POST /shops/<OS>/disconnect`（体 `{"keepHistory":true}`） | 5 个都 404，`type` 为 `/errors/not-found` |
| 3 | owner 浏览器打开 `/wb/<OC>` | 显示「找不到或已删除」 |
| 4 | other 重新读取这 5 个对象 | 会话的接待状态与处理人、工单时间线（没有 cross 备注）、订单状态、发票邮件状态、店铺状态都与前置记录相同 |

后置：无。

#### `TC-PERM-006` 员工看不到无权操作的入口 — 对应 `REQ-PERM-001` · 级别: 回归 · 执行者: 皆可

前置：基线；owner 在 `/tickets` 建一张「内部确认」工单（Demo Shopee MY，负责人 Nur Aisyah），记工单号 T；以 agent@demo.test 登录。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 打开 `/tickets` | 只有「我的」视图，没有「我的 / 全部」切换 |
| 2 | 打开 T 的详情 | 没有「作废」；负责人不能改；没有改时限入口；有「加备注」 |
| 3 | 打开 `/orders` | 列表每行店铺都是 Demo Shopee MY |

后置：无。


#### `TC-PERM-007` 员工的会话被改派后看不到，也不能处置其草稿 — 对应 `REQ-PERM-001`、`REQ-CONV-004` · 级别: 回归 · 执行者: 皆可

前置：基线；按 §3「固定为工作时间内」；按 §3「模拟器发消息」向 Demo Shopee MY 新买家 B 发一条，等「AI 草稿」里出现该会话，记会话 ID C；Nur 在浏览器打开 C 并点「认领」，停在该页；`login agent@demo.test`、`login lead@demo.test`；从 `GET /api/v1/conversations/<C>`（Nur 的会话）记下草稿 ID D 与 `version` V，从 `GET /api/v1/members/options?shopId=<Demo Shopee MY 的店铺 ID>`（组长会话）记下 Mei Lin 的 membershipId M。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `api lead@demo.test -X POST $B/api/v1/conversations/<C>/assign -d '{"toMembershipId":"<M>","withTickets":false,"version":<V>}'` | 200 |
| 2 | 看 Nur 的页面（10 秒内） | 对话栏显示「这个会话已不在你名下」与「回到会话列表」 |
| 3 | `api agent@demo.test $B/api/v1/conversations/<C>` | 404，`type` 为 `/errors/not-found` |
| 4 | `api agent@demo.test -X POST $B/api/v1/conversations/<C>/drafts/<D>/ignore -d '{}'` | 409，`type` 为 `/errors/conflict`，`extra.claimedBy.name` 为 Mei Lin |

后置：无。


#### `TC-PERM-008` 侧栏切换：整页预取与加载骨架 — 对应 `REQ-PERM-001` · 级别: 回归 · 执行者: 皆可

前置：基线；预取只在生产构建里生效：`pnpm build` 后 `pnpm start`（同 §3 本地环境变量，端口自定），浏览器开发者工具网络面板打开。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 以 owner@demo.test 登录，打开 `/wb`，停留 3 秒，看网络面板 | 有对 `/tickets`、`/orders`、`/dashboard`、`/reception`、`/shops`、`/team`、`/billing`、`/settings` 的预取请求（请求头带 `Next-Router-Prefetch`），均为 200 |
| 2 | 点侧栏「工单」 | 地址变为 `/tickets`，页面标题「工单」随即出现；点击触发的请求里没有 `/tickets` 页面请求（新页面里的链接进入视口后发的、带 `Next-Router-Prefetch` 的预取不算），也没有新的 `/_next/static/chunks/` 脚本请求 |
| 3 | 关掉页面，新开一个无痕窗口登录并打开 `/wb`；在网络面板屏蔽带 `Next-Router-Prefetch` 的请求、把网速限到慢速 3G，立即点侧栏「订单与开票」 | 地址变为 `/orders` 后、真实页面出来之前，先出现骨架：页头两条灰条与 6 条加载行，读屏文字「正在打开页面」；之后换成真实页面，标题「订单与开票」的左缘、顶边、高度与骨架第一条灰条一致，页面不跳动 |
| 4 | 同第 3 步的条件点侧栏「接待设置」 | 骨架多一列左侧分组（5 条灰条，宽度与真实分组导航一致）；之后换成真实页面，标题「接待设置」与骨架第一条灰条位置一致 |
| 5 | 恢复网络设置，在工作台会话列表里点另一个会话 | 对话区直接换成新会话，不出现整页骨架 |
| 6 | 操作系统打开「减少动态效果」后重复第 3 步 | 骨架灰条静止，不闪动 |

后置：无。

#### `TC-PERM-009` 经验卡与学习审核只给管理员、组长，三种角色都能提交学习 — 对应 `REQ-KB-011`、`REQ-KB-013`、`REQ-PERM-001` · 级别: 回归 · 执行者: 皆可

前置：基线；`login owner@demo.test`、`login lead@demo.test`、`login agent2@demo.test`；`cardclear`；`cardk` 记为 K；`X=$(newbuyer shopee 220001 "Perm A")`；`say $X "你好"`；记 Shopilot 会话 ID 为 C、买家那条消息 ID 为 MSG；取一个 Demo TikTok MY 的会话 ID 为 C2（Mei Lin 不负责这家店）。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `api agent2@demo.test $B/api/v1/knowledge/cards`；`api agent2@demo.test -X POST $B/api/v1/knowledge/cards -d @$SP_TMP/card-k.json`；`api agent2@demo.test $B/api/v1/knowledge/learning` | 三次都是 `HTTP 403` `/errors/forbidden` |
| 2 | `api lead@demo.test $B/api/v1/knowledge/cards`；`api lead@demo.test $B/api/v1/knowledge/learning` | 都是 `HTTP 200` |
| 3 | `api agent2@demo.test -X POST $B/api/v1/conversations/<C>/learning -d '{"messageIds":["<MSG>"]}'` | `HTTP 201`，`task.status` `analyzing` |
| 4 | `api agent2@demo.test -X POST $B/api/v1/conversations/<C2>/learning -d '{"messageIds":["<C2 的任一消息>"]}'` | `HTTP 404` |
| 5 | 浏览器以 Mei Lin 登录，打开会话 C | 会话头有「提交学习」按钮；侧栏没有「接待设置」 |

后置：`cardclear`。

### 店铺接入与授权

#### `TC-SHOP-001` Shopee 接入全流程：主账号一次授权多店 — 对应 `REQ-SHOP-001`、`REQ-SHOP-002`、`REQ-SHOP-004`、`REQ-SHOP-005` · 级别: 冒烟 · 执行者: 皆可

前置：先执行 `TC-AUTH-001`（signup1@demo.test 已登录、商户 Signup Store 没有店铺）。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `/shops/connect` 在 Shopee 下点「还没有应用，跟着建」 | 进入 `/shops/connect/shopee/guide`，显示 5 项准备清单 |
| 2 | 勾全部 5 项，点「下一步：填凭证」 | 进入 `/shops/connect/shopee`，有 Partner ID、Partner Key 输入与「验证并保存」 |
| 3 | 填 `2001001` 与 `mock-key-2001001`，点「验证并保存」 | 显示校验通过、区域 sg、回调已设置；可以进入授权店铺步骤 |
| 4 | 在 `/shops/connect/shopee/auth` 点「打开授权页」 | 打开模拟授权页，列出主账号 900100 下 Wizard Shopee MY、Wizard Shopee SG、Wizard Shopee PH |
| 5 | 勾三家，点授权 | 回到 Shopilot 的 `/shops/connect/shopee/probe` |
| 6 | 看检查页 | 三家逐行显示：MY、SG 的收发聊天与订单都可用；PH 的收发聊天不可用，写明原因并带「准备清单第 4 项」入口；每家显示收件人是否打码 |
| 7 | 选「AI 只起草、不发送」，点「完成接入」 | 提示接入完成 |
| 8 | 打开 `/shops` | 三家 Wizard 店都在列表里，「连接」列为「正常」或「需处理 · …」（不是授权失效、已断开），接待模式 shadow / shadow，回补状态为排队中、进行中或已完成之一 |
| 9 | 按 §3「模拟器发消息」向 Wizard Shopee MY 新买家发「接入后第一条」 | signup1 的 `/wb` 待认领在下一次列表轮询后出现该会话（DESIGN §16 工作台会话列表「≤ 3 秒」，从买家发出算起 15 秒内） |

后置：无（`TC-SHOP-015`、`TC-SHOP-016`、`TC-CONV-002` 等承接）。

#### `TC-SHOP-002` 接入向导保存草稿后恢复进度 — 对应 `REQ-SHOP-001` · 级别: 回归 · 执行者: 皆可

前置：基线；按 `TC-AUTH-001` 第 1–2 步注册 draft1@demo.test（商户名 Draft Store）。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | Shopee 下点「还没有应用，跟着建」，勾第 1、2 项，点「保存草稿」 | 提示已保存 |
| 2 | 退出后以 draft1@demo.test 重新登录，打开 `/shops/connect/shopee/guide` | 第 1、2 项为已勾选，第 3–5 项未勾选 |
| 3 | `login draft1@demo.test Signup-Test-01`，`api draft1@demo.test $B/api/v1/connect/drafts/shopee` | 200，`step` 为 `guide`，`checklist` 中 1、2 为 `true`，3–5 为 `false` |

后置：无。

#### `TC-SHOP-003` Shopee 凭证识别区域并写回调订阅 — 对应 `REQ-SHOP-002` · 级别: 回归 · 执行者: 皆可

前置：基线；按 `TC-AUTH-001` 第 1–2 步注册一个新商户并停在 `/shops/connect`；终端已定义 `B`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 进入 Shopee 应用凭证页，填 `2001001` 与 `mock-key-2001001`，点「验证并保存」 | 显示区域 sg、校验通过、回调已设置；接口 200，`status` 为 `verified`，`region` 为 `sg`，`callbackState` 为 `set`，`sandboxOnly` 为 `false` |
| 2 | 按 §3「Shopee 签名调用」读 2001001 的推送配置 | 回调地址为 `http://127.0.0.1:3360/api/webhooks/shopee/<应用 ID>`；订阅 code 为 10、3、4、29、30、1、2、12、28 |

后置：无。

#### `TC-SHOP-004` Shopee 错误 Key 时逐区域列出失败原因 — 对应 `REQ-SHOP-002` · 级别: 回归 · 执行者: 皆可

前置：基线；新注册一个商户并停在 Shopee 应用凭证页；按 §3「Shopee 签名调用」先读一次 2001001 的推送配置并记下。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 填 `2001001` 与 `wrong-key`，点「验证并保存」 | 页面逐个区域列出失败原因；接口 422，`type` 为 `/errors/platform-credentials`，`extra.attempts` 每个区域主机一项 |
| 2 | `login <该商户邮箱> Signup-Test-01` 后用 api 请求 `POST /api/v1/platform-apps/shopee/auth-url`（体 `{}`） | 409，`type` 为 `/errors/not-allowed` |
| 3 | 再读 2001001 的推送配置 | 与前置记录相同 |

后置：无。

#### `TC-SHOP-005` 只在沙箱登记的凭证提示换 Live 且不能继续授权 — 对应 `REQ-SHOP-002` · 级别: 回归 · 执行者: 皆可

前置：基线；新注册一个商户并停在 Shopee 应用凭证页。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 填 `2001002` 与 `mock-key-2001002`，点「验证并保存」 | 页面提示「这是沙箱凭证，请换成 Live」；接口响应 `sandboxOnly` 为 `true` |
| 2 | 进入授权店铺步骤 | 「打开授权页」不可用 |
| 3 | `login <该商户邮箱> Signup-Test-01` 后用 api 请求 `POST /api/v1/platform-apps/shopee/auth-url`（体 `{}`） | 409，`type` 为 `/errors/not-allowed` |

后置：无。

#### `TC-SHOP-006` 回调已指向其他系统时须确认覆盖 — 对应 `REQ-SHOP-002` · 级别: 回归 · 执行者: 皆可

前置：基线；新注册一个商户并停在 Shopee 应用凭证页。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 填 `2001003` 与 `mock-key-2001003`，不勾确认，点「验证并保存」 | 页面展开确认区，显示当前回调 `https://erp.example.com/shopee/push` 与「改发到 Shopilot」勾选项；接口 409，`type` 为 `/errors/callback-occupied` |
| 2 | 按 §3「Shopee 签名调用」（换成 2001003 与其 Key）读推送配置 | 回调仍为 `https://erp.example.com/shopee/push` |
| 3 | 勾「改发到 Shopilot」，再点「验证并保存」 | 校验通过，区域 cn，回调已设置 |
| 4 | 再读推送配置 | 回调为 `http://127.0.0.1:3360/api/webhooks/shopee/<应用 ID>` |

后置：无。

#### `TC-SHOP-007` TikTok 凭证与按站点授权 — 对应 `REQ-SHOP-003`、`REQ-SHOP-004`、`REQ-SHOP-005` · 级别: 回归 · 执行者: 皆可

前置：基线；新注册一个商户并停在 `/shops/connect`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | TikTok Shop 下点「已有应用，直接填」 | 进入 `/shops/connect/tiktok`，有 App Key、App Secret 与「保存并去授权」 |
| 2 | 填 `mockttwiz01` 与 `mock-secret-wiz01`，站点选 MY，点「保存并去授权」 | 打开模拟 TikTok 授权页，列出 Wizard TikTok MY |
| 3 | 点授权 | 回到 Shopilot 检查页，列表有 Wizard TikTok MY |
| 4 | 回到授权店铺步骤点「连接新站点」，选 TH 并在模拟授权页授权 | 检查页同时列出 Wizard TikTok MY 与 Wizard TikTok TH |
| 5 | 选「AI 只起草、不发送」，点「完成接入」后打开 `/shops` | 两家 Wizard TikTok 店已连接，接待模式 shadow / shadow |
| 6 | 看模拟器两家店 | 坐席接单都为 true |

后置：无。

#### `TC-SHOP-008` TikTok Secret 错误时授权失败并说明原因 — 对应 `REQ-SHOP-003` · 级别: 回归 · 执行者: 皆可

前置：基线；新注册一个商户并停在 TikTok 应用凭证页。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 填 `mockttwiz01` 与 `wrong-secret`，站点 MY，点「保存并去授权」，在模拟授权页授权 | 回到 `/shops/connect/tiktok/auth`，地址带 `result=error&reason=secret_or_redirect_mismatch`，页面提示「Secret 错误或 Redirect URL 不一致」 |
| 2 | 打开 `/shops` | 没有 Wizard TikTok 店 |

后置：无。

#### `TC-SHOP-009` Shopee 子账号授权给出提示 — 对应 `REQ-SHOP-004` · 级别: 回归 · 执行者: 皆可

前置：基线；新注册一个商户，按 `TC-SHOP-001` 第 1–3 步通过 2001001 校验，停在授权店铺页。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 点「打开授权页」，在模拟授权页点「模拟子账号授权」 | 回到 `/shops/connect/shopee/auth`，地址带 `result=error&reason=sub_account`，页面提示商户用了子账号或单店授权 |
| 2 | 打开 `/shops` | 没有新店铺 |

后置：无。

#### `TC-SHOP-010` 授权链接过期 — 对应 `REQ-SHOP-004` · 级别: 回归 · 执行者: 皆可

前置：基线；以 owner@demo.test 登录；在 `/shops` 记下 Demo Shopee MY、Demo Shopee SG 的授权到期日期。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 终端执行 `pnpm scenario auth-link-6min` | 输出一条授权链接 L |
| 2 | 浏览器打开 L，在模拟授权页授权 | 回到 `/shops/connect/shopee/auth`，地址带 `result=error&reason=state_invalid`，页面提示「授权链接已过期，请重新打开」 |
| 3 | 刷新 `/shops` | 店铺数量不变；两家 Shopee 店的授权到期日期与前置记录相同 |

后置：无。

#### `TC-SHOP-011` 平台授权页拒绝与伪造 state — 对应 `REQ-SHOP-004` · 级别: 边缘 · 执行者: 皆可

前置：基线；新注册一个商户，按 `TC-SHOP-001` 第 1–3 步通过 2001001 校验。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 点「打开授权页」，在模拟授权页点「模拟拒绝」 | 回到 `/shops/connect/shopee/auth`，地址带 `result=error&reason=denied`，页面提示商户在平台授权页拒绝了授权 |
| 2 | 同一浏览器打开 `/api/v1/oauth/shopee/callback?code=fake&main_account_id=900100&state=forged` | 跳到 `/shops/connect/shopee/auth`，地址带 `result=error&reason=state_invalid`，页面有失败提示 |
| 3 | 打开 `/shops` | 没有新店铺 |

后置：无。

#### `TC-SHOP-012` 没有已授权店铺时不能完成接入 — 对应 `REQ-SHOP-005` · 级别: 边缘 · 执行者: 皆可

前置：基线；新注册一个商户，按 `TC-SHOP-001` 第 1–3 步通过 2001001 校验，不授权任何店铺。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 打开 `/shops/connect/shopee/probe` | 没有店铺行；「完成接入」置灰 |
| 2 | `login <该商户邮箱> Signup-Test-01` 后用 api 请求 `POST /api/v1/connect/shopee/complete`（体 `{"initialMode":"shadow"}`） | 409，`type` 为 `/errors/not-allowed` |

后置：无。

#### `TC-SHOP-013` 店铺列表与详情抽屉 — 对应 `REQ-SHOP-006` · 级别: 回归 · 执行者: 皆可

前置：基线；执行 `pnpm job shop.metrics`（种子不带平台指标，该任务每小时才跑一次）；以 owner@demo.test 登录。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 打开 `/shops` | 4 行，每行有平台、站点、授权到期日期、接待模式（工作时间内 / 外）、最近入站时间、平台口径回复率；Shopee 行与 TikTok 行各自写明指标口径，页面没有跨平台合计的回复率 |
| 2 | 点 Demo TikTok MY | 打开详情抽屉，显示能力表（收发聊天、订单、收件人打码、商品权限、卡片、优惠券、结束会话）与最近连接事件（不超过 20 条） |
| 3 | 平台筛选选 TikTok Shop | 只剩 Demo TikTok MY、Demo TikTok TH |
| 4 | 周期选「近 30 天」 | 页面重新加载数据不报错；Shopee 行注明指标只有当期值 |

后置：无。

#### `TC-SHOP-014` 7 天零入站的店标「需处理」 — 对应 `REQ-SHOP-006` · 级别: 回归 · 执行者: 皆可

前置：基线；以 owner@demo.test 登录。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 终端执行 `pnpm scenario shop-no-inbound-8d` 后刷新 `/shops` | Demo TikTok TH 行标「需处理」，原因说明 7 天没有入站 |
| 2 | 状态筛选选「需处理」 | 列表包含 Demo TikTok TH |

后置：无。

#### `TC-SHOP-015` 检查连接发现推送配置被改 — 对应 `REQ-SHOP-007` · 级别: 回归 · 执行者: 皆可

前置：先执行 `TC-SHOP-001`（Signup Store 已接入三家 Wizard Shopee 店）。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `/shops` 点「检查连接」 | 每家店逐项显示店铺信息、会话列表、订单列表、推送配置的结果；MY、SG 全部通过；PH 的会话列表不通过并写原因 |
| 2 | 按 §3「Shopee 改回调」把 2001001 的回调改为 `$B/mock/erp/shopee/push` | 返回 JSON 的 `error` 为空 |
| 3 | 再点「检查连接」 | 三家店的「推送配置」都不通过，原因说明回调指向别处，并给出处理入口 |

后置：`pnpm db:reset && pnpm db:seed`（2001001 的回调指向别处时，下一个接入该应用的商户会先遇到回调占用）。

#### `TC-SHOP-016` 更新应用密钥：先验证后替换 — 对应 `REQ-SHOP-008` · 级别: 回归 · 执行者: 皆可

前置：先执行 `TC-SHOP-001`；以 signup1@demo.test 登录。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `/shops` 点「更新应用密钥」，选 Shopee 应用，填 `wrong-key`，点「验证并替换」 | 弹层提示校验失败；接口 422，`type` 为 `/errors/platform-credentials` |
| 2 | 按 §3「模拟器发消息」向 Wizard Shopee MY 新买家发一条；在 `/wb` 对它点「认领」，发「旧密钥仍可用」 | 模拟器买家视图收到「旧密钥仍可用」 |
| 3 | 再次「更新应用密钥」，填 `mock-key-2001001`，点「验证并替换」 | 提示已替换；接口 200 |
| 4 | 打开 `/settings/audit`，模块店铺与连接 | 有一条更新应用密钥的记录；记录摘要与导出的 CSV 里都没有 `mock-key-2001001` 与 `wrong-key` |

后置：无。

#### `TC-SHOP-017` 取消授权后续期授权 — 对应 `REQ-SHOP-009`、`REQ-SHOP-012` · 级别: 回归 · 执行者: 皆可

前置：基线；按 §3「固定为工作时间内」；向 Demo TikTok MY 新买家发一条，owner 对它点「认领」并回复一句，记会话 C。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 模拟器对 Demo TikTok MY 点「取消授权」 | 推送日志新增 TikTok webhook type 6，HTTP 200 |
| 2 | owner 刷新 `/shops`，打开通知弹层 | Demo TikTok MY 状态为「授权失效」；通知里有一条该店被取消授权的通知 |
| 3 | 在 C 发「授权失效时发送」 | 页面提示店铺授权失效，消息没有发出；接口 409，`type` 为 `/errors/not-allowed`，`code` 为 `shop_auth_expired`；模拟器买家视图没有这条消息 |
| 4 | `/shops` 对该店点「续期授权」，在弹层 MY 站点点「续期」，在模拟授权页授权 | 回到 Shopilot；该店状态为已连接 |
| 5 | 在 C 发「续期后发送」 | 模拟器买家视图收到这条消息 |

后置：无。

#### `TC-SHOP-018` 授权 30 天内到期只提醒一次 — 对应 `REQ-SHOP-012` · 级别: 回归 · 执行者: 皆可

前置：基线；owner 在 `/settings/notify` 确认「店铺授权即将到期」的站内与邮件都开（关的打开并保存）。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 终端执行 `pnpm scenario auth-expiring-20d`，再执行 `pnpm job token.refresh` | 命令退出码为 0 |
| 2 | owner 与陈卓分别打开通知弹层；打开 `/dev/outbox` | 两人各有一条 Demo TikTok MY 授权即将到期的通知；发件箱有发往 owner@demo.test 与 admin2@demo.test 的 `auth_expiring` 邮件各一封 |
| 3 | 再执行 `pnpm job token.refresh` | 两人没有新增该通知；发件箱没有新增 `auth_expiring` |

后置：无。

#### `TC-SHOP-019` token 刷新失败转为授权失效 — 对应 `REQ-SHOP-012` · 级别: 回归 · 执行者: 皆可

前置：基线；以 owner@demo.test 登录。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 模拟器对 Demo Shopee SG 点「授权到期」 | 模拟器显示该店授权已到期 |
| 2 | 终端执行 `pnpm job token.refresh`，刷新 `/shops` | Demo Shopee SG 状态为「授权失效」 |
| 3 | 打开通知弹层 | 有一条 Demo Shopee SG 被取消授权或断开的通知 |

后置：无。

#### `TC-SHOP-020` 断开 TikTok 店并保留历史，之后重新授权 — 对应 `REQ-SHOP-010`、`REQ-SHOP-009` · 级别: 回归 · 执行者: 皆可

前置：基线；按 §3「固定为工作时间内」；向 Demo TikTok MY 新买家发一条（会话 C 未结束）；owner 在 `/wb` 已结束里记下 Demo TikTok MY 任一历史会话的买家名 H。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `/shops` 打开 Demo TikTok MY 详情，点「断开」，在弹层选保留历史数据，点「断开」 | 该店状态为已断开 |
| 2 | 看模拟器 Demo TikTok MY | 坐席接单为 false |
| 3 | owner 打开 `/wb` 已结束 | C 在已结束；H 的会话仍能打开查看 |
| 4 | 向 Demo TikTok MY 新买家再发「断开后的消息」 | 推送日志该条 HTTP 200；`/wb` 各分组都没有这条消息 |
| 5 | 在 `/shops/connect/tiktok/auth` 对 MY 点「重新连接」并在模拟授权页授权 | Demo TikTok MY 回到已连接；H 的历史会话仍在（沿用原店铺记录） |

后置：无。

#### `TC-SHOP-021` 断开 Shopee 店并删除历史，撤销授权链接只给 Shopee — 对应 `REQ-SHOP-010` · 级别: 边缘 · 执行者: 皆可

前置：基线；以 owner@demo.test 登录；`login owner@demo.test`，取 Demo TikTok TH 的店铺 ID TH。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `/shops` 打开 Demo Shopee SG 详情点「断开」，在弹层点「打开撤销授权页」 | 新标签打开模拟平台的撤销授权页 |
| 2 | 回到弹层，勾「同时删除这家店的历史会话与订单镜像」，点「断开」 | 该店状态为已断开 |
| 3 | `/wb` 已结束按店铺筛 Demo Shopee SG（店铺下拉的「已断开」组）；`/orders` 同样按店铺筛 Demo Shopee SG | 都没有记录 |
| 4 | `api owner@demo.test -X POST $B/api/v1/shops/<TH>/cancel-auth-url` | 409，`type` 为 `/errors/not-allowed` |

后置：`pnpm db:reset && pnpm db:seed`。

#### `TC-SHOP-022` 预约远程协助 — 对应 `REQ-SHOP-011` · 级别: 回归 · 执行者: 皆可

前置：基线；以 owner@demo.test 登录。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `/shops/connect` 点「预约远程协助」 | 弹层有平台、卡住的步骤、时段、联系方式与「提交」 |
| 2 | 选 Shopee、「Shopee · 第 4 项 确认聊天权限」、「明天 10:00–12:00」、联系方式「邮箱」，填 owner@demo.test，点「提交」 | 弹层关闭，提示已提交；接口 201 |
| 3 | 打开 `/settings/audit` | 有一条预约远程协助的记录，操作人林晓 |

后置：无。

#### `TC-SHOP-023` 接入后历史回补 — 对应 `REQ-SHOP-013` · 级别: 回归 · 执行者: 皆可

前置：基线；新注册一个商户；在模拟器记下 Wizard Shopee MY 的历史会话数 N 与订单数 M（N、M 均 ≥ 1）。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 新商户打开 `/dashboard`，范围「近 90 天」 | 会话段数为 0 |
| 2 | 按 `TC-SHOP-001` 第 1–7 步接入，第 5 步只勾 Wizard Shopee MY，第 7 步选「暂不启用」 | 接入完成 |
| 3 | 在 `/shops` 打开该店详情，等待回补（每 30 秒刷新，最多 5 分钟） | 回补状态为已完成，显示会话 N、订单 M |
| 4 | `/wb` 已结束按店铺筛 Wizard Shopee MY | 共 N 个会话，处理人都为空，没有草稿 |
| 5 | `/orders`（新商户只有这一家店，页面不出店铺筛选） | 共 M 张订单，店铺都是 Wizard Shopee MY |
| 6 | 回到 `/dashboard`「近 90 天」 | 会话段数仍为 0 |

后置：无。

#### `TC-SHOP-024` 接入向导与店铺页对照原型 — 对应 `REQ-SHOP-001`、`REQ-SHOP-006` · 级别: 回归 · 执行者: 人工

前置：基线；按 `docs/implementation-handoff.md` 的方法导出 Quilt 原型并用 Edge 打开；以 owner@demo.test 登录。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 逐屏对照 `/shops/connect`、Shopee 的 guide / 凭证 / 授权 / 检查四屏、TikTok 对应四屏、`/shops` 与其三个弹层 | 布局、配色、文案、按钮位置与原型一致；差异逐条截图记入证据目录 |
| 2 | 检查接入向导与店铺页 | 没有飞书相关的入口与文案（飞书推送只在商户设置的通知页） |

后置：无。

#### `TC-SHOP-025` 接入后店铺数超过套餐上限时拒绝 — 对应 `REQ-SHOP-004` · 级别: 回归 · 执行者: 皆可

前置：基线；终端执行 `pnpm scenario shop-limit-full`；以 owner@demo.test 登录，在 `/shops` 记下店铺数 N。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 打开 `/shops/connect/shopee/auth`，点「打开授权页」 | 模拟授权页列出 Demo Shopee MY、Demo Shopee SG 与未接入的 Demo Shopee PH |
| 2 | 勾全部三家，点授权 | 回到 `/shops/connect/shopee/auth`，地址带 `result=error&reason=shop_limit`，页面提示店铺数超过套餐上限并给出升级套餐的入口 |
| 3 | 刷新 `/shops` | 店铺数仍为 N，没有 Demo Shopee PH |

后置：`pnpm db:reset && pnpm db:seed`。

#### `TC-SHOP-031` Shopee 推送没订阅到 Shopilot 时店铺页标需处理并给重新校验入口 — 对应 `REQ-SHOP-006` · 级别: 回归 · 执行者: 皆可 · 源自缺陷 2026-10-16 Shopee 推送订阅缺失时店铺页仍显示正常

前置：基线；`login owner@demo.test`；终端执行 `docker compose exec -T postgres psql -U shopilot -d "${SP_DB:-shopilot}" -c "update platform_app set callback_state = 'unset' where app_key = '1000101'"`（Demo Store 的 Shopee 应用从没设过推送回调，同线上导入的应用）；浏览器以 owner@demo.test 登录，视口 1440×900。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 打开 `/shops` | Demo Shopee MY、Demo Shopee SG 两行「连接」列为「需处理 · 推送未订阅」；右侧「平台应用」的 Shopee 应用卡写「推送没有订阅到 Shopilot」，带「重新校验」链接；TikTok 应用卡没有这一句 |
| 2 | `api owner@demo.test $B/api/v1/shops` | 两家 Shopee 店的 `issues` 含 `key` 为 `push_unsubscribed` 的一项，文案写「订单、物流、售后状态要等每小时同步才更新」；`apps` 里 Shopee 应用 `pushSubscribed` 为 false，TikTok 应用为 true；`summary.attention` ≥ 2 |
| 3 | 点 Demo Shopee MY 打开详情抽屉 | 顶部提示同一句文案，下面有「重新校验 Shopee 应用」链接 |
| 4 | 打开 `/orders` | 提示「Demo Shopee MY、Demo Shopee SG 的平台推送没有订阅到 Shopilot…」，带链接「重新校验 Shopee 应用」，指向 `/shops/connect/shopee` |
| 5 | 点该链接 | 进入 Shopee「应用凭证」页，Live Partner ID 已填 1000101 |
| 6 | Live Partner Key 填 `mock-key-1000101`，点「验证并保存」 | 提示「校验通过，推送回调已设置」 |
| 7 | 按 §3「Shopee 签名调用」读应用 1000101 的推送配置（Key 换成 `mock-key-1000101`） | `push_config_on_list` 含 1、2、3、4、10、12、28、29、30 九个 code |
| 8 | 刷新 `/shops` | 两家 Shopee 店的「连接」列不再有「推送未订阅」；Shopee 应用卡没有「重新校验」 |
| 9 | 刷新 `/orders` | 没有「平台推送没有订阅到 Shopilot」提示 |

后置：无。

#### `TC-SHOP-032` 手机宽度下回复率图表横轴文字不重叠 — 对应 `REQ-SHOP-006` · 级别: 回归 · 执行者: 皆可 · 源自缺陷 2026-10-16 手机宽度下店铺页回复率图表横轴文字重叠

前置：基线；终端执行 `pnpm scenario plan-over-shop-limit`（Demo Store 共 8 家已连接店）与 `pnpm job shop.metrics`；浏览器以 owner@demo.test 登录。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 视口 390×844 打开 `/shops`，看回复率图表横轴 | 8 根柱子各有一组文字，相邻两组之间留有空隙、不重叠；每组只写站点代码（MY、SG、TH 等），图例仍写「Shopee」「TikTok Shop」区分平台 |
| 2 | 点任一根柱子 | 提示框显示该店全名与回复率 |
| 3 | 视口 1440×900 刷新 `/shops` | 横轴写「Shopee MY」这类平台加站点（一行放不下时拆成两行），相邻两组之间留有空隙 |

后置：`pnpm db:reset && pnpm db:seed`。

### 会话与工作台

#### `TC-CONV-001` 入站签名错误返回 401 且不落库 — 对应 `REQ-CONV-001` · 级别: 回归 · 执行者: 皆可

前置：基线；按 §3「模拟器发消息」向 Demo Shopee MY 买家发一条，从推送日志复制该条的目标 URL U 与载荷 P；以 owner@demo.test 登录。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 把 P 里的消息文本改为「签名错误测试」、消息 ID 改为新值，带请求头 `Authorization: 0000` POST 到 U | HTTP 401 |
| 2 | owner 在 `/wb` 打开该买家的会话 | 时间线没有「签名错误测试」 |

后置：无。

#### `TC-CONV-002` 同一推送重放只生成一条消息 — 对应 `REQ-CONV-001` · 级别: 回归 · 执行者: 皆可

前置：先执行 `TC-SHOP-001`（Signup Store 用 2001001 接入，Key 已知）；以 signup1@demo.test 登录。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 向 Wizard Shopee MY 新买家发「重放测试」 | signup1 的 `/wb` 待认领出现该会话，时间线 1 条「重放测试」 |
| 2 | 从推送日志复制该条 URL 与载荷，按 §3「Shopee 签名推送」连发两次 | 两次都输出 200 |
| 3 | 刷新该会话 | 「重放测试」仍只有 1 条 |

后置：无。

#### `TC-CONV-003` 未知店铺的推送记为忽略 — 对应 `REQ-CONV-001` · 级别: 边缘 · 执行者: 皆可

前置：先执行 `TC-SHOP-001`；以 signup1@demo.test 登录；从推送日志复制一条 Wizard Shopee MY 聊天推送的 URL 与载荷。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 把载荷里的 `shop_id` 改为 `999999`、消息 ID 改为新值、文本改为「未知店铺」，按 §3「Shopee 签名推送」发出 | 输出 200 |
| 2 | 在 `/wb` 各分组与顶栏搜索「未知店铺」 | 没有任何会话或消息 |

后置：无。

#### `TC-CONV-004` 会话列表分组、计数与筛选 — 对应 `REQ-CONV-002` · 级别: 回归 · 执行者: 皆可

前置：基线；以 owner@demo.test 登录；`login owner@demo.test`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 打开 `/wb` | 分组为待认领、AI 草稿、我处理中、他人处理中、已结束，计数大于 0 的分组带数字、为 0 的不显示数字；侧栏工作台子项的数字与之相同 |
| 2 | `api owner@demo.test "$B/api/v1/conversations?view=queue"` | `counts` 中 queue、ai、mine、team、done 与页面数字一致 |
| 3 | 平台筛选选 TikTok | 列表每行平台为 TikTok |
| 4 | 再按店铺选 Demo TikTok MY | 列表每行店铺为 Demo TikTok MY |

后置：无。

#### `TC-CONV-005` 买家再回复时置顶并显示已等时长 — 对应 `REQ-CONV-002` · 级别: 回归 · 执行者: 皆可

前置：基线；向 Demo Shopee MY 新买家 B 发「在吗」；Nur 登录后打开该会话点「认领」，发「您好」。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | Nur 打开「我处理中」 | B 的行没有已等时长 |
| 2 | 模拟器以 B 发「订单什么时候发」 | 10 秒内 B 的行移到「我处理中」顶部，显示已等时长 |
| 3 | 2 分钟后刷新 | 已等时长比第 2 步大 |
| 4 | Nur 在该会话回复一句 | B 的行不再显示已等时长 |

后置：无。

#### `TC-CONV-006` 超过接待时限标警示（只在工作时间内） — 对应 `REQ-CONV-002`、`REQ-RCP-002` · 级别: 回归 · 执行者: 皆可

前置：基线；按 §3「固定为工作时间内」；owner 在 `/reception/hours` 把接待时限设为 10 分钟并保存；终端执行 `pnpm scenario unclaimed-11m`，记会话 ID C。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | Nur 打开「待认领」 | C 的行在顶部，显示已等 11 分钟以上，并用警示色标出 |
| 2 | owner 按 §3「固定为工作时间外」后，Nur 刷新 | C 仍显示已等时长，但没有警示色 |

后置：无。

#### `TC-CONV-007` 会话行显示未结工单与剩余时限 — 对应 `REQ-CONV-002` · 级别: 回归 · 执行者: 皆可

前置：基线；向 Demo Shopee MY 新买家发一条；Nur 对该会话点「认领」并回复一句，在右栏点「建工单」，类型「内部确认」，点「建工单」，记工单号 T。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | Nur 打开「我处理中」 | 该会话行显示 T 与剩余时限 |
| 2 | 打开会话，看右栏工单小节，点 T | 小节列出 T；点后进入 `/tickets/<ID>` |

后置：无。

#### `TC-CONV-008` 会话详情时间线与译文标签 — 对应 `REQ-CONV-003`、`REQ-CONV-008` · 级别: 回归 · 执行者: 皆可

前置：基线；按 §3「固定为工作时间内」；模拟器为 Demo TikTok MY 新买家 B 下单（订单 O）并推进到 IN_TRANSIT，以 B 依次发文字「Is my order shipped?」、一张图片、订单 O 的订单卡；owner 对该会话点「认领」并回复一句，再从「发卡片」→「退货退款卡」选 O 的商品发出；向 Demo Shopee MY 新买家 B2 发「Bila sampai?」。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | owner 打开 B 的会话，点图片缩略图 | 弹出大图；时间线按时间显示文字、图片、订单卡（订单号 O、金额、状态）、本方退货退款卡；B 的文字下方有中文译文，标「译 · Shopilot」 |
| 2 | 看右栏 | 显示买家名、订单 O、工单小节 |
| 3 | 打开 B2 的会话 | 买家文字下方显示平台译文，标「译 · Shopee」 |

后置：无。

#### `TC-CONV-009` 窄屏时右栏收成抽屉 — 对应 `REQ-CONV-003` · 级别: 回归 · 执行者: 人工

前置：基线；以 owner@demo.test 登录，打开任一有订单的会话。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 把 Edge 窗口内容宽度调到 1200 px（侧栏展开） | 右栏收成抽屉，留有展开入口；对话栏宽度不小于 400 px；页面没有横向滚动条 |
| 2 | 打开抽屉 | 买家与订单内容完整可读；关闭后对话栏恢复原宽 |
| 3 | 宽度调到 1440 px（侧栏展开），再调回 1280 px 并收起侧栏 | 两种情况都是列表、对话、右栏三栏并排，对话栏不小于 400 px |

后置：无。

#### `TC-CONV-010` 工作台视觉与键盘操作对照原型 — 对应 `REQ-CONV-003`、`REQ-CONV-004`、`REQ-KB-006` · 级别: 回归 · 执行者: 人工

前置：基线；按 `docs/implementation-handoff.md` 的方法导出 Quilt 原型；以 owner@demo.test 登录。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 对照原型 `/wb`、`/wb/tiktok`、`/wb/jason`、`/wb/kittisak`、`/wb/siti`、`/wb/thuha` 与工作台各弹层 | 布局、配色、文案、按钮位置一致；原型里的「标记为知识」「标记知识缺口」「打开 AI 核验」「在 AI 测试里试」与产品下拉不出现；差异逐条截图记入证据目录 |
| 2 | 只用键盘 Tab 遍历工作台 | 每个可交互元素都能聚焦，焦点框可见，顺序从左到右、从上到下 |
| 3 | 打开「转交给其他客服」对话框后按 Tab 与 Esc | 焦点停留在对话框内；Esc 关闭对话框，焦点回到触发按钮 |
| 4 | 悬停或用读屏读图标按钮 | 图标按钮有可读名称（如「发送输入框里的内容」） |
| 5 | 先按 `TC-KB-024` 前置与第 1 步造一份带依据的草稿，看草稿区与影子回复 | 草稿正文下方一行小字「依据：《保修政策.md》」，与草稿区其余文字层级一致，不挤压草稿按钮；Demo Shopee SG（影子模式）的影子回复展开后同样有依据行 |

后置：无。

#### `TC-CONV-011` 已结束会话只读 — 对应 `REQ-CONV-003` · 级别: 边缘 · 执行者: 皆可

前置：基线；以 Nur 登录。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 打开「已结束」里任一会话 | 没有可用的输入栏；没有「认领」「结束会话」「转交给其他客服」；页面标明会话已结束 |

后置：无。

#### `TC-CONV-012` 并发认领只有一人成功 — 对应 `REQ-CONV-004` · 级别: 回归 · 执行者: AI

前置：基线；AI 替身设为「低置信 0.4」；向 Demo Shopee MY 新买家发一条（会话进入待认领，记 ID C）；Nur、Mei 各在一个浏览器打开 C。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 两个浏览器在同一时刻点「认领」（Playwright 并发触发） | 一方进入处理中；另一方的认领请求返回 409，`type` 为 `/errors/conflict`，`extra.claimedBy` 为胜者 |
| 2 | 看败方页面 | 提示「<胜者姓名> 已经认领了这个会话」；败方是员工，看不到同事处理中的会话：对话栏显示「<胜者姓名> 已认领这个会话」与「回到会话列表」，不显示右栏（组长以上的败方会话刷新为只读） |
| 3 | 两人分别打开「我处理中」 | 只有胜者列表里有 C |

后置：无。

#### `TC-CONV-013` 认领时版本不一致返回 409 — 对应 `REQ-CONV-004` · 级别: 边缘 · 执行者: 皆可

前置：基线；AI 替身设为「低置信 0.4」；向 Demo Shopee MY 新买家发一条（会话 C 待认领）；`login agent@demo.test`，`GET /api/v1/conversations/<C>` 记 `conversation.version` 为 v。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `api agent@demo.test -X POST $B/api/v1/conversations/<C>/claim -d '{"version":<v+1>}'` | 409，`type` 为 `/errors/conflict`，响应带当前状态 |
| 2 | 用 `{"version":<v>}` 再请求 | 200，处理人为 Nur |
| 3 | 同一请求再发一次 | 200（本人重复认领） |

后置：无。

#### `TC-CONV-014` 转交会话并带上关联工单 — 对应 `REQ-CONV-004` · 级别: 回归 · 执行者: 皆可

前置：基线；向 Demo Shopee MY 新买家发一条；Nur 对该会话点「认领」并回复一句，在右栏建「内部确认」工单，记工单号 T（负责人 Nur）。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | Nur 点「转交给同事」 | 对话框列出可选同事（Mei Lin、Arif Rahman、林晓、陈卓）与「关联工单一并转交」勾选项 |
| 2 | 选 Mei Lin，勾「关联工单一并转交」，点「转交」 | 对话框关闭；该会话从 Nur 的「我处理中」消失 |
| 3 | Mei 登录，打开「我处理中」与通知弹层 | 列表有该会话；通知有一条 T 指派给我的通知 |
| 4 | owner 打开 T | 负责人为 Mei Lin；时间线有一条转交记录（Nur Aisyah → Mei Lin） |

后置：无。

#### `TC-CONV-015` 转交只能选负责该店的启用成员 — 对应 `REQ-CONV-004` · 级别: 边缘 · 执行者: 皆可

前置：基线；按 §3「固定为工作时间内」；向 Demo TikTok MY 新买家发一条；Arif 对该会话点「认领」并回复一句，记会话 ID C 与 version；`login lead@demo.test`，取 Nur 的 membershipId N、Demo TikTok MY 店铺 ID S。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | Arif 点「转交给同事」 | 对话框只列林晓、陈卓；没有 Nur Aisyah、Mei Lin |
| 2 | `api lead@demo.test "$B/api/v1/members/options?shopId=<S>"` | `items` 只有 Arif Rahman、林晓、陈卓 |
| 3 | `api lead@demo.test -X POST $B/api/v1/conversations/<C>/assign -d '{"toMembershipId":"<N>","withTickets":false,"version":<version>}'` | 422 |

后置：无。

#### `TC-CONV-016` 员工不能改派同事的会话 — 对应 `REQ-CONV-004` · 级别: 回归 · 执行者: 皆可

前置：基线；向 Demo Shopee MY 新买家发一条，Mei 对该会话点「认领」并回复一句，记会话 ID C；`login agent@demo.test`，取 Nur 本人 membershipId N。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `api agent@demo.test -X POST $B/api/v1/conversations/<C>/assign -d '{"toMembershipId":"<N>","withTickets":false,"version":1}'` | 404，`type` 为 `/errors/not-found`（同事处理中的会话对员工不可见，DESIGN §10 行级可见性） |
| 2 | owner 打开 C | 处理人仍为 Mei Lin |

后置：无。

#### `TC-CONV-017` 组长改派同事处理中的会话 — 对应 `REQ-CONV-004` · 级别: 回归 · 执行者: 皆可

前置：基线；向 Demo Shopee MY 新买家发一条，Nur 对该会话点「认领」并回复一句，记会话 C。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | Arif 打开「他人处理中」 | 列表有 C，处理人 Nur Aisyah |
| 2 | 打开 C，点「改派给其他同事」，选 Mei Lin，点「改派」 | 处理人变为 Mei Lin |
| 3 | Mei 与 Nur 分别打开「我处理中」 | Mei 的列表有 C；Nur 的列表没有 C |

后置：无。

#### `TC-CONV-018` 结束 TikTok 会话并同步结束平台 session — 对应 `REQ-CONV-004` · 级别: 回归 · 执行者: 皆可

前置：基线；按 §3「固定为工作时间内」；向 Demo TikTok MY 新买家发一条；Arif 对该会话点「认领」并回复一句，在右栏建「内部确认」工单 T，记 T 的状态 S。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 点「结束会话（同步结束 TikTok 会话）」 | 对话框提示该会话有未结工单，结束后工单不受影响 |
| 2 | 点「结束会话」 | 会话进入「已结束」，变为只读 |
| 3 | 看模拟器该买家的会话 | session 显示已结束 |
| 4 | 打开 T | 状态仍为 S |

后置：无。

#### `TC-CONV-019` 结束 Shopee 会话只在 Shopilot 内结束 — 对应 `REQ-CONV-004` · 级别: 边缘 · 执行者: 皆可

前置：基线；向 Demo Shopee MY 新买家发一条；Nur 对该会话点「认领」并回复一句，记会话 C；`login agent@demo.test`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | Nur 看结束按钮 | 文案为「结束会话（Shopee 没有结束会话接口，只在 Shopilot 内结束）」 |
| 2 | 点它并确认「结束会话」 | 会话进入「已结束」 |
| 3 | 先 `GET /api/v1/conversations/<C>` 取当前 version，再 `api agent@demo.test -X POST $B/api/v1/conversations/<C>/close -d '{"version":<当前 version>}'` | 200（已结束再结束） |

后置：无。

#### `TC-CONV-020` 发送文字按 clientRequestId 幂等 — 对应 `REQ-CONV-005` · 级别: 回归 · 执行者: 皆可

前置：基线；向 Demo Shopee MY 新买家 B 发一条；Nur 对该会话点「认领」并回复一句，记会话 C；`login agent@demo.test`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `api agent@demo.test -X POST $B/api/v1/conversations/<C>/messages -d '{"clientRequestId":"tc-conv-020","type":"text","text":"幂等测试"}'` | 201，记 `message.id` 为 M |
| 2 | 原样再发一次 | 201，`message.id` 仍为 M |
| 3 | 看模拟器 B 的买家视图 | 「幂等测试」只出现 1 次 |
| 4 | Nur 刷新会话 | 时间线「幂等测试」只有 1 条 |

后置：无。

#### `TC-CONV-021` 发送图片 — 对应 `REQ-CONV-005` · 级别: 回归 · 执行者: 皆可

前置：基线；准备 §3 的约 2 MB PNG；向 Demo Shopee MY 新买家 B 发一条；Nur 对该会话点「认领」并回复一句。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 点「添加图片或视频」选该 PNG，等缩略图不再显示上传中后点发送 | 选完后附件条出现这张图；点发送后附件条消失，时间线出现该图片，状态为已发送 |
| 2 | 看模拟器 B 的买家视图 | 收到这张图片 |

后置：无。

#### `TC-CONV-022` 上传图片的大小与类型校验 — 对应 `REQ-CONV-005` · 级别: 边缘 · 执行者: 皆可

前置：基线；准备 §3 的 11 MB JPG、GIF、恰好 10,485,760 字节的 PNG；Nur 处于一个自己处理中的 Demo Shopee MY 会话。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 「添加图片或视频」选 11 MB 的 JPG | 提示超过 10 MB 上限，附件条不出现；上传接口 413，`type` 为 `/errors/too-large` |
| 2 | 选 GIF | 提示只支持 JPG / PNG / WebP；上传接口 415，`type` 为 `/errors/unsupported-type` |
| 3 | 选 10,485,760 字节的 PNG，等上传完点发送 | 上传接口 201，图片进附件条；点发送后图片发出 |

后置：无。

#### `TC-CONV-023` 文字 2,000 字上限 — 对应 `REQ-CONV-005` · 级别: 回归 · 执行者: 皆可

前置：基线；向 Demo Shopee MY 新买家 B 发一条；Nur 对该会话点「认领」并回复一句，记会话 C；`login agent@demo.test`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 输入框粘贴 2,001 个字 | 发送按钮不可用，并提示超过 2,000 字 |
| 2 | 用 api 发 `text` 为 2,001 个字的消息（`clientRequestId` 为 `tc-conv-023-a`） | 422，`type` 为 `/errors/validation` |
| 3 | 输入框删到恰好 2,000 字并发送 | 发出；模拟器 B 的买家视图收到完整的 2,000 字 |

后置：无。

#### `TC-CONV-024` TikTok 会话发送卡片与优惠券 — 对应 `REQ-CONV-005` · 级别: 回归 · 执行者: 皆可

前置：基线；按 §3「固定为工作时间内」；模拟器为 Demo TikTok MY 新买家 B 下单（订单 O）并推进到 IN_TRANSIT，以 B 发一条文字；owner 对该会话点「认领」并回复一句。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 点「发卡片」 | 弹层有订单卡、物流卡、退货退款卡、商品卡；商品卡不可选，弹层写明「商品卡不可用：店铺没有授予商品读取权限。」；输入栏另有「发优惠券」按钮 |
| 2 | 选「订单卡」，选 O，点「发送订单卡」 | 模拟器 B 的买家视图收到订单卡，订单号 O |
| 3 | 再点「发卡片」，选「物流卡」，选 O，点「发送物流卡」 | 模拟器收到物流卡，订单号 O |
| 4 | 点「发优惠券」 | 弹层列出可在聊天发送的券 |
| 5 | 选第一张，点「发送优惠券」 | 模拟器收到优惠券卡，券名与所选一致 |

后置：无。

#### `TC-CONV-025` Shopee 会话没有卡片与优惠券 — 对应 `REQ-CONV-005` · 级别: 回归 · 执行者: 皆可

前置：基线；向 Demo Shopee MY 新买家发一条；Nur 对该会话点「认领」并回复一句，记会话 C；`login agent@demo.test`，取 Demo Shopee MY 店铺 ID S 与一张该店订单 ID O。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 看输入栏 | 没有「发卡片」与「发优惠券」入口 |
| 2 | `api agent@demo.test -X POST $B/api/v1/conversations/<C>/messages -d '{"clientRequestId":"tc-conv-025","type":"order_card","orderId":"<O>"}'` | 409，`type` 为 `/errors/not-allowed` |
| 3 | `api agent@demo.test $B/api/v1/shops/<S>/coupons` | 409，`type` 为 `/errors/not-allowed` |

后置：无。

#### `TC-CONV-026` 平台发送失败给出重试 — 对应 `REQ-CONV-005`、`REQ-AI-003`、`REQ-AI-004` · 级别: 回归 · 执行者: 皆可

前置：基线；向 Demo Shopee MY 新买家 B 发一条；Nur 对该会话点「认领」并回复一句，记会话 C；`login agent@demo.test`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 模拟器「故障注入」：Demo Shopee MY 下一次卖家发送返回平台错误 | 面板显示已设定 |
| 2 | Nur 发「失败重试测试」 | 页面显示平台错误的中文说明与「重试」；该消息标发送失败；接口 502，`type` 为 `/errors/platform`，`extra.platformCode` 非空；模拟器 B 的买家视图没有这条 |
| 3 | 点「重试」 | 消息变为已发送；模拟器 B 的买家视图收到 1 条「失败重试测试」 |
| 4 | 对这条已发送的消息调 `POST /api/v1/conversations/<C>/messages/<消息 ID>/retry` | 409，`type` 为 `/errors/conflict` |

后置：无。

#### `TC-CONV-027` 平台发送超时提示先刷新 — 对应 `REQ-CONV-005` · 级别: 边缘 · 执行者: 皆可

前置：基线；Nur 处于一个自己处理中的 Demo Shopee MY 会话。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 模拟器「故障注入」：Demo Shopee MY 下一次卖家发送超时 | 面板显示已设定 |
| 2 | Nur 发「超时测试」 | 约 10 秒后页面提示「结果未知，先刷新确认」；接口 504，`type` 为 `/errors/platform-timeout` |
| 3 | 刷新会话 | 该消息标发送失败（原因超时），有「重试」 |

后置：无。

#### `TC-CONV-028` 已结束会话收到买家消息后重开并出稿 — 对应 `REQ-CONV-006` · 级别: 回归 · 执行者: 皆可

前置：基线；向 Demo Shopee MY（assist）新买家 B 发一条；Nur 对该会话点「认领」并回复一句后「结束会话」。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 模拟器以 B 发「还有一个问题」 | 20 秒内该会话出现在「AI 草稿」顶部，不再在「已结束」 |
| 2 | 打开会话 | 时间线在上一段末尾有分段标记；新草稿针对「还有一个问题」；处理人为空 |

后置：无。

#### `TC-CONV-029` off 店的已结束会话重开后进待认领 — 对应 `REQ-CONV-006` · 级别: 回归 · 执行者: 皆可

前置：基线；向 Demo TikTok TH（off / off）新买家 B 发一条；Mei 对该会话点「认领」并回复一句后「结束会话」。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 模拟器以 B 再发一条 | 10 秒内该会话出现在 Mei 的「待认领」顶部 |
| 2 | 打开会话 | 没有草稿；转人工原因显示店铺未开 AI（`shop_off`） |

后置：无。

#### `TC-CONV-030` 阶段按订单判定为售中 — 对应 `REQ-CONV-007` · 级别: 回归 · 执行者: 皆可

前置：基线；模拟器为 Demo Shopee MY 新买家 B 下单（订单 O）并推进到 SHIPPED。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 模拟器以 B 发「什么时候到」 | 推送日志 HTTP 200 |
| 2 | Nur 打开该会话 | 阶段显示「售中」，依据显示「订单 O SHIPPED」 |

后置：无。

#### `TC-CONV-031` 人工改判只改当前段 — 对应 `REQ-CONV-007` · 级别: 回归 · 执行者: 皆可

前置：按 `TC-CONV-030` 的前置与步骤得到阶段为售中的会话；Nur 对它点「认领」并回复一句。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 阶段下拉选「售后」 | 阶段显示售后，来源显示手动 |
| 2 | owner 打开 `/settings/audit` | 有一条 Nur Aisyah 把该会话段从售中改为售后的记录 |
| 3 | Nur「结束会话」，模拟器以 B 再发一条 | 新段阶段为售中，来源为自动 |

后置：无。

#### `TC-CONV-032` 订单镜像未完成首次同步时按关键词判定阶段 — 对应 `REQ-CONV-007` · 级别: 边缘 · 执行者: 皆可

前置：基线；新注册一个商户；模拟器「故障注入」对 Wizard Shopee MY 设「订单读取」持续返回平台错误；新商户按 `TC-SHOP-001` 第 1–7 步接入，第 5 步只勾 Wizard Shopee MY，第 7 步选「暂不启用」。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 新商户在 `/shops` 打开 Wizard Shopee MY 详情 | 回补状态不是已完成，订单数为 0 |
| 2 | 向 Wizard Shopee MY 新买家 B1 发「I want a refund」，新商户打开「待认领」里的该会话 | 阶段为「售后」，来源为关键词，依据为「订单尚未同步，关键词：refund」 |
| 3 | 向新买家 B2 发「where is my shipping」并打开该会话 | 阶段为「售中」，来源为关键词 |
| 4 | 向新买家 B3 发「hello」并打开该会话 | 阶段为「未确认」，来源为关键词 |

后置：在模拟器「故障注入」清除 Wizard Shopee MY 的持续故障。

#### `TC-CONV-033` 无订单或只有已取消订单判为售前，有未结退货判为售后 — 对应 `REQ-CONV-007` · 级别: 边缘 · 执行者: 皆可

前置：基线。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 向 Demo Shopee MY 新买家（无订单）发一条，Nur 打开该会话 | 阶段为「售前」，依据「本店无订单」 |
| 2 | 模拟器为另一新买家 B2 下单并推进到 COMPLETED，再「申请退货」；以 B2 发一条 | Nur 打开 B2 的会话，阶段为「售后」，依据含该退货单与 REQUESTED |
| 3 | 模拟器为第三个新买家 B3 下单并推进到 CANCELLED；以 B3 发一条 | Nur 打开 B3 的会话，阶段为「售前」，依据「近 60 天无进行中订单」 |

后置：无。

#### `TC-CONV-034` 翻译：买家消息译文与发送前译成买家语言 — 对应 `REQ-CONV-008` · 级别: 回归 · 执行者: 皆可

前置：基线；按 §3「固定为工作时间内」；向 Demo TikTok MY 新买家 B 发泰语「พัสดุของฉันอยู่ที่ไหน」；以 owner@demo.test 登录。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 打开该会话 | 买家消息下方有非空的中文译文，标「译 · Shopilot」 |
| 2 | 点「认领」，输入「您的包裹今天发出」，翻译下拉选「译成泰语」，发送 | 时间线该条同时显示原文「您的包裹今天发出」与译文 |
| 3 | 看模拟器 B 的买家视图 | 收到的文本是译文，与原文「您的包裹今天发出」不同 |

后置：无。

#### `TC-CONV-035` 快捷回复按阶段筛选并插入输入框 — 对应 `REQ-CONV-009` · 级别: 回归 · 执行者: 皆可

前置：基线；owner 在 `/reception/prompts` 的快捷回复区新增一条：标题「发货时间」、阶段售中、正文「订单会在 1–2 个工作日内发出。」，保存；按 `TC-CONV-030` 的前置得到售中会话，Nur 对它点「认领」并回复一句。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | Nur 点「快捷回复」 | 弹层默认选中「售中」，列表有「发货时间」 |
| 2 | 点「发货时间」 | 弹层关闭，输入框内容为「订单会在 1–2 个工作日内发出。」；模拟器买家视图没有新消息 |
| 3 | 重新打开弹层切到「全部」 | 列出所有阶段的快捷回复 |

后置：无。

#### `TC-CONV-036` 待认领超时提醒组长一次 — 对应 `REQ-CONV-010` · 级别: 回归 · 执行者: 皆可

前置：基线；终端执行 `pnpm scenario unclaimed-11m`，记会话 C；Arif、Nur 分别记下各自通知弹层的条数。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 执行 `pnpm job unclaimed.remind` | 命令退出码为 0 |
| 2 | Arif 与 Nur 打开通知弹层 | Arif 新增 1 条 C 待认领超时的通知；Nur 没有新增 |
| 3 | 再执行 `pnpm job unclaimed.remind` | Arif 没有新增 |

后置：无。

#### `TC-CONV-037` 待认领提醒设为「不提醒」 — 对应 `REQ-CONV-010` · 级别: 边缘 · 执行者: 皆可

前置：基线；终端执行 `pnpm scenario unclaimed-11m`；Arif 记下通知条数。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | owner 在 `/reception/hours` 的待认领提醒选「不提醒」，点「保存」 | 提示已保存 |
| 2 | 执行 `pnpm job unclaimed.remind` | Arif 的通知没有新增 |

后置：无。

#### `TC-CONV-038` 72 小时无新消息自动结束 — 对应 `REQ-CONV-011` · 级别: 回归 · 执行者: 皆可

前置：基线；终端执行 `pnpm scenario conversation-idle-73h`，记会话 C。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 执行 `pnpm job conversation.idle_close` | 命令退出码为 0 |
| 2 | Nur 打开「已结束」 | C 在列表里，不在「我处理中」 |
| 3 | 打开 C | 时间线末尾标明本段因 72 小时无新消息结束 |

后置：无。

#### `TC-CONV-039` 员工不能结束待认领的会话，组长可以 — 对应 `REQ-CONV-004` · 级别: 回归 · 执行者: 皆可

前置：基线；AI 替身设为「低置信 0.4」；向 Demo Shopee MY 新买家发一条（会话 C 进入待认领）；`login agent@demo.test`，`GET /api/v1/conversations/<C>` 记 version v。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | Nur 打开 C | 有「认领」，没有「结束会话」 |
| 2 | `api agent@demo.test -X POST $B/api/v1/conversations/<C>/close -d '{"version":<v>}'` | 403，`type` 为 `/errors/forbidden` |
| 3 | Arif 打开 C，点「结束会话」并在对话框确认 | C 进入「已结束」 |

后置：无。


#### `TC-CONV-040` 同一秒的多条消息翻页时不丢、不重 — 对应 `REQ-CONV-003` · 级别: 边缘 · 执行者: AI

前置：基线；用接口 `POST /api/mock/sim/create_buyer` 给 Demo TikTok TH 建新买家 B，再连续调用 62 次 `POST /api/mock/sim/buyer_message`（正文「同秒 01」到「同秒 62」，不加间隔，使多条消息落在同一秒）；owner 在 `/wb` 找到 B 的会话 C；`login owner@demo.test`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | owner 打开 C | 时间线先显示最新的 50 条，顶部有「查看更早的消息」 |
| 2 | 点「查看更早的消息」 | 时间线共 62 条，「同秒 01」到「同秒 62」各出现一次；顶部不再有「查看更早的消息」 |
| 3 | `api owner@demo.test "$B/api/v1/conversations/<C>"` 取第一条消息的 id P，再 `api owner@demo.test "$B/api/v1/conversations/<C>?before=<P>"` | 第二次返回 12 条买家消息、`hasMore` 为 `false`，与第一次返回的消息 id 没有重复 |

后置：无。

#### `TC-CONV-041` 平台后台有人回复过的会话可以认领接手 — 对应 `REQ-CONV-004`、`REQ-FEISHU-006` · 级别: 回归 · 执行者: 皆可 · 源自缺陷（2026-10-16：这类会话谁都认领不了，只提示「平台后台有人处理」）

前置：基线；终端执行 `pnpm scenario platform-human`，记会话 C 与商户 M（Demo Store）；`login agent@demo.test`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | Nur 打开 `/wb/<C>?m=<M>` | 对话栏显示会话；顶部状态「平台后台已有人回复」，有「认领」按钮；输入区位置提示「平台后台有人回复过这个会话。点上方「认领」接手，之后在这里继续回复。」 |
| 2 | 打开 `/wb/<C>?claim=1&m=<M>`（飞书卡片「认领」的链接） | 自动认领：地址里的 `claim`、`m` 被去掉，输入框出现；`api owner@demo.test "$B/api/v1/conversations/<C>"` 返回 `handlingState = human`、`claimedBy` 为 Nur |

后置：无。

#### `TC-CONV-042` 处理人取消认领，会话回到待认领 — 对应 `REQ-CONV-012` · 级别: 回归 · 执行者: 皆可

前置：基线（Demo Shopee MY 工作时间内外都是 assist）；模拟器选 Demo Shopee MY 新买家发「Do you ship to Penang?」，30 秒内会话出现在「AI 草稿」（记会话 ID C）；Nur 打开 C 点「认领」；`login agent@demo.test`，`api agent@demo.test -X POST $B/api/v1/tickets -d '{"type":"internal","shopId":"<Demo Shopee MY 的店铺 ID>","conversationId":"<C>"}'` 返回 201，记响应的 `id` 为 T（`assignee.name` 为 Nur Aisyah）。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | Nur 看 C 的会话头部 | 状态「我处理中」；有「取消认领（放回待认领）」图标按钮，没有「认领」 |
| 2 | 点「取消认领（放回待认领）」 | 弹出确认框「取消认领这个会话？」，说明会话回到待认领、飞书再推一张待认领卡、没处置的 AI 草稿保留、1 张未结工单的负责人不变；按钮「继续处理」「取消认领」 |
| 3 | 点「继续处理」 | 确认框关闭，会话仍是「我处理中」 |
| 4 | 再点「取消认领（放回待认领）」，在确认框点「取消认领」 | 提示「已取消认领，会话放回待认领」；头部状态「待认领 · 人工转交」，出现「认领」，没有「取消认领」；时间线新增系统事件「Nur Aisyah 取消认领，会话放回待认领」；AI 草稿区仍在 |
| 5 | Nur 打开会话列表的「待认领」与「我处理中」 | 「待认领」里有 C，「我处理中」里没有 |
| 6 | `api agent@demo.test "$B/api/v1/conversations/<C>"` | `conversation.handlingState` 为 `awaiting_human`，`claimedBy` 为 null，`handoffReason` 为 `manual`；`draft` 不为空；`openTickets` 里有 T |
| 7 | `api agent@demo.test "$B/api/v1/tickets/<T>"` | `ticket.assignee.name` 仍为 Nur Aisyah |

后置：无。

#### `TC-CONV-043` 不是处理人或版本过期时不能取消认领 — 对应 `REQ-CONV-012` · 级别: 边缘 · 执行者: 皆可

前置：基线；模拟器选 Demo Shopee MY 新买家发「我要人工客服」（会话 C 进入待认领）；`login agent@demo.test`、`login agent2@demo.test`、`login lead@demo.test`；`api agent@demo.test -X POST $B/api/v1/conversations/<C>/claim -d '{}'` 返回 200，记响应的 `version` 为 v。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | Arif 打开 C | 头部「Nur Aisyah 处理中」，有「改派给其他同事」，没有「取消认领（放回待认领）」；`api lead@demo.test "$B/api/v1/conversations/<C>"` 的 `permissions.canUnclaim` 为 false |
| 2 | `api lead@demo.test -X POST $B/api/v1/conversations/<C>/unclaim -d '{"version":<v>}'` | 409，`type` 为 `/errors/conflict`，`extra.claimedBy.name` 为 Nur Aisyah |
| 3 | 用 agent2@demo.test（Mei）发同一请求 | 409，`type` 为 `/errors/conflict` |
| 4 | Nur 带 `{"version":<v-1>}` 请求 | 409，`type` 为 `/errors/conflict` |
| 5 | `api agent@demo.test "$B/api/v1/conversations/<C>"` | `handlingState` 仍为 `human`，处理人 Nur Aisyah，`version` 仍为 v |
| 6 | Nur 带 `{"version":<v>}` 请求 | 200，`handlingState` 为 `awaiting_human`，`claimedBy` 为 null |
| 7 | 第 6 步的请求原样再发一次 | 409，`type` 为 `/errors/conflict`，`extra.handlingState` 为 `awaiting_human` |

后置：无。

#### `TC-CONV-044` 新消息及时出现在工作台 — 对应 `REQ-CONV-002`、`REQ-CONV-003` · 级别: 回归 · 执行者: 皆可 · 源自缺陷 2026-10-16 消息拉取不及时，新消息最长 10 秒才进工作台列表

前置：基线；浏览器 A 以 owner@demo.test 登录，窗口宽 1440 px（侧栏展开），打开 `/wb?view=queue`，标签页保持在前台，开发者工具网络面板筛 `/api/v1/`；浏览器 B 打开模拟器。计时从模拟器发出消息那一刻起算。阈值 = DESIGN §15 的轮询间隔（列表 3 秒、详情 2 秒、导航摘要 10 秒）加本地入库余量 1–2 秒；第 2、4、6 步等一次对应请求返回后再发，保证要等满一个轮询间隔。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | B：选 Demo TikTok TH（接待模式 off），新建买家 X | 模拟器出现买家 X |
| 2 | A 的网络面板出现一次 `GET /api/v1/conversations?view=queue` 返回后，B 立即以 X 发「poll check 1」，记发出时刻 T1 | 推送日志新增一条，HTTP 200 |
| 3 | A：看待认领列表 | T1 后 5 秒内列表出现 X 的会话，预览「poll check 1」 |
| 4 | A：点开 X 的会话；网络面板出现一次 `GET /api/v1/conversations/<该会话 ID>` 返回后，B 立即以 X 发「poll check 2」，记 T2 | 推送日志新增一条，HTTP 200 |
| 5 | A：看对话栏时间线 | T2 后 3 秒内出现「poll check 2」 |
| 6 | B：新建买家 Y；A 的网络面板出现一次 `GET /api/v1/nav-summary` 返回后，B 立即以 Y 发「poll check 3」，记 T3，记该响应里的 `counts.queue` 为 Q | 推送日志新增一条，HTTP 200 |
| 7 | A：看侧栏「工作台」下「待认领」的计数 | T3 后 12 秒内变为 Q + 1 |

后置：无。

#### `TC-CONV-048` 卖家在 Shopee 后台的回复补拉进会话并转为平台后台处理 — 对应 `REQ-CONV-001` · 级别: 回归 · 执行者: 皆可 · 源自缺陷 2026-10-16 Shopee 卖家后台的回复没有进 Shopilot

前置：基线；执行 §3「curl 会话」，`login owner@demo.test`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `curl -s -X POST $B/api/mock/sim/create_buyer -H 'Content-Type: application/json' -d '{"platform":"shopee","shopId":"220001","name":"Backend Reply","language":"en"}'`，记返回的 `conversationId` 为 X；再 `curl -s -X POST $B/api/mock/sim/buyer_message -H 'Content-Type: application/json' -d '{"conversationId":"<X>","text":"Is the camera in stock?"}'` | 两次都返回 `"ok":true`；第二次的 `pushes` 有 1 条，`httpStatus` 为 200 |
| 2 | 等 20 秒，`api owner@demo.test "$B/api/v1/conversations?view=ai"`，在 `items` 里找 `buyerName` 为 Backend Reply 的一行，记 `id` 为 C | 该行 `handlingState` 为 `bot`，`draftPending` 为 `true` |
| 3 | `curl -s -X POST $B/api/mock/sim/seller_backend_reply -H 'Content-Type: application/json' -d '{"conversationId":"<X>","text":"Yes, in stock. Ships today."}'` | 返回 `"ok":true`，`pushes` 只有 1 条（mark_as_replied 通知），`httpStatus` 为 200 |
| 4 | 等 20 秒，`api owner@demo.test "$B/api/v1/conversations/<C>"` | `conversation.handlingState` 为 `human`，`claimedBy` 为 null，`handoffReason` 为 `platform_human`；`messages` 里有一条正文「Yes, in stock. Ships today.」，`senderRole` 为 `platform_human`、`senderName` 为「平台后台」；其后有一条正文「平台侧已有人处理」的系统事件；`draft` 为 null |
| 5 | 再调一次第 3 步的接口，请求体只有 `{"conversationId":"<X>"}`（只推通知）；等 20 秒后重复第 4 步的查询 | 正文「Yes, in stock. Ships today.」的消息仍只有 1 条 |

后置：无。

#### `TC-CONV-049` 本方从 Shopilot 发出的回复不算平台后台回复 — 对应 `REQ-CONV-001` · 级别: 回归 · 执行者: 皆可

前置：基线；执行 §3「curl 会话」，`login agent@demo.test`（Nur，负责 Demo Shopee MY）。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 同 `TC-CONV-048` 第 1 步，买家名 Echo Check，消息「Do you ship to Penang?」，记 X | 两次都返回 `"ok":true` |
| 2 | 等 20 秒，`api agent@demo.test "$B/api/v1/conversations?view=ai"`，找 `buyerName` 为 Echo Check 的行，记 `id` 为 C | 该行 `handlingState` 为 `bot` |
| 3 | `api agent@demo.test -X POST $B/api/v1/conversations/<C>/messages -d '{"clientRequestId":"tc-conv-049","type":"text","text":"Yes, we ship to Penang."}'` | HTTP 201 |
| 4 | `curl -s -X POST $B/api/mock/sim/seller_backend_reply -H 'Content-Type: application/json' -d '{"conversationId":"<X>"}'`（只推通知，模拟平台对本方回复发的 mark_as_replied） | 返回 `"ok":true`，`pushes` 只有 1 条，`httpStatus` 为 200 |
| 5 | 等 20 秒，`api agent@demo.test "$B/api/v1/conversations/<C>"` | `conversation.handlingState` 为 `human`，`claimedBy.name` 为 Nur Aisyah；正文「Yes, we ship to Penang.」的消息只有 1 条，`senderRole` 为 `agent`；没有 `senderRole` 为 `platform_human` 的消息，没有「平台侧已有人处理」 |

后置：无。

#### `TC-CONV-050` 店铺自动回复不算平台后台回复 — 对应 `REQ-CONV-001` · 级别: 回归 · 执行者: 皆可

前置：基线；执行 §3「curl 会话」，`login owner@demo.test`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 同 `TC-CONV-048` 第 1 步，买家名 Auto Reply，消息「Hello, anyone there?」，记 X | 两次都返回 `"ok":true` |
| 2 | 等 20 秒，`api owner@demo.test "$B/api/v1/conversations?view=ai"`，找 `buyerName` 为 Auto Reply 的行，记 `id` 为 C | 该行 `handlingState` 为 `bot`，`draftPending` 为 `true` |
| 3 | `curl -s -X POST $B/api/mock/sim/seller_backend_reply -H 'Content-Type: application/json' -d '{"conversationId":"<X>","text":"Thanks for messaging Demo Shopee MY!","auto":true}'` | 返回 `"ok":true`，`pushes` 只有 1 条，`httpStatus` 为 200 |
| 4 | 等 20 秒，`api owner@demo.test "$B/api/v1/conversations/<C>"` | `conversation.handlingState` 仍为 `bot`，`handoffReason` 为 null；`draft.status` 为 `generated`；正文「Thanks for messaging Demo Shopee MY!」的消息 `senderRole` 为 `platform_bot`、`senderName` 为「平台自动回复」；没有「平台侧已有人处理」 |

后置：无。

#### `TC-CONV-054` 平台后台处理的会话列在他人处理中 — 对应 `REQ-CONV-002` · 级别: 回归 · 执行者: 皆可 · 源自缺陷 2026-10-16 平台后台处理过的会话在工作台列表里找不到

前置：基线；执行「curl 会话」，`login agent@demo.test`、`login owner@demo.test`；`api agent@demo.test "$B/api/v1/nav-summary"`，记 `counts.queue` 为 Q0、`counts.team` 为 T0；然后 `pnpm scenario platform-human`，记会话 C 与买家名 X；浏览器以 agent@demo.test（Nur，员工，负责 Demo Shopee MY）登录。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 打开 `/wb`，点侧栏工作台下的「他人处理中」 | 有「他人处理中」子项；列表里有买家 X 的会话，行上标「平台后台」 |
| 2 | `api agent@demo.test "$B/api/v1/nav-summary"`，再看侧栏「工作台」的徽标 | `counts.queue` 等于 Q0，`counts.team` 等于 T0 + 1；徽标数字等于 `counts.queue + counts.ai` |
| 3 | `api owner@demo.test "$B/api/v1/conversations?view=team"` | `items` 里有 C，`claimedBy` 为 null；`api owner@demo.test "$B/api/v1/conversations?view=queue"` 的 `items` 里没有 C |
| 4 | 浏览器里点买家 X 这一行 | 对话栏打开这个会话，顶部有「认领」按钮 |

后置：无。

#### `TC-CONV-055` 平台英文系统提示显示中文 — 对应 `REQ-CONV-003` · 级别: 回归 · 执行者: 皆可 · 源自缺陷 2026-10-16 平台英文系统提示在会话里原样显示英文

前置：基线；`pnpm scenario tiktok-system-notices`，记会话 C；浏览器以 owner@demo.test 登录。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 打开 `/wb/<C>`，看时间线里买家消息之后的系统提示 | 从上到下依次为「对话已分配给 Yuiki」「Yuiki 开始接待」「一条开放接口取不到的消息，请到 TikTok 卖家中心查看」「买家要求转人工客服，请尽快回复」「客服已结束对话」「买家长时间未回复，对话超时结束」，最后一条是表外提示，照原文显示「Your chat was rated 5 stars」 |
| 2 | 点「客服已结束对话」这一行 | 下方展开平台原文「Chat ended by customer service agent.」；表外提示那一行不能展开 |
| 3 | `q "select text from message where conversation_id = '<C>' and sender_role = 'system' order by sent_at"` | 7 行都是英文原文，第 5 行为「Chat ended by customer service agent.」 |

后置：无。

#### `TC-CONV-056` Shopee 常见问题记录拉回对话并折叠显示 — 对应 `REQ-CONV-013` · 级别: 回归 · 执行者: 皆可

前置：基线；执行「curl 会话」；按 §3「新建模拟买家」在 Demo Shopee MY 建买家 X，记模拟器会话 ID T；浏览器以 owner@demo.test 登录。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 按 §3「问过 AI 助手后转人工」对 T 执行，`question` 为「Is the magnetic mount sold separately?」 | 返回 `"ok":true`；模拟器推送日志新增 2 条（`faq_liveagent`、`bundle_message`），HTTP 200 |
| 2 | 15 秒后打开 `/wb`，在会话列表找到买家 X 并打开 | 时间线有卡片「常见问题记录 · Shopee 商店 AI 助手」；收起时显示最后 2 条：买家的提问与助手的回答；有展开按钮 |
| 3 | 点展开 | 共 4 条，从上到下：助手欢迎语、「推荐了 3 个商品」、买家「Is the magnetic mount sold separately?」（下方「译 · Shopee」译文「[Shopee 机翻] Is the magnetic mount sold separately?」）、助手回答「Thanks for asking! Our customer service team will check this for you shortly.」 |
| 4 | `q "select m.payload->'bundle'->>'status', jsonb_array_length(m.payload->'bundle'->'items') from message m join conversation c on c.id = m.conversation_id where c.buyer_name = '<X>' and m.payload->>'platformType' = 'bundle_message'"` | 一行：`ok\|4` |
| 5 | 把窗口改为 390 宽，重看第 2–3 步 | 卡片收起与展开都完整显示，页面没有横向滚动条 |

后置：无。

#### `TC-CONV-057` 常见问题记录先于会话建立到达时补拉入库 — 对应 `REQ-CONV-013` · 级别: 回归 · 执行者: 皆可 · 源自缺陷 2026-10-20 常见问题记录早于买家首条消息到达时整条丢失

前置：基线；执行「curl 会话」；按 §3「新建模拟买家」在 Demo Shopee MY 建买家 X，记模拟器会话 ID T。下文「Shopee 签名调用」「Shopee 改回调」「Shopee 签名推送」用 §3 配方，应用换成 `1000101`（Key `mock-key-1000101`，区域段 `sg`）。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 「Shopee 签名调用」读 `/api/v2/push/get_app_push_config` | 记 `response.callback_url` 为 U（Shopilot 的回调地址） |
| 2 | 「Shopee 改回调」把回调改为 `$B/mock/erp/shopee/push` | 响应没有 `error` |
| 3 | 按 §3「问过 AI 助手后转人工」对 T 执行 | 推送日志新增 2 条，目标 URL 是 `$B/mock/erp/shopee/push`；Shopilot 工作台里还没有买家 X |
| 4 | 「Shopee 改回调」把回调改回 U | 响应没有 `error` |
| 5 | 从推送日志（或 `curl -s $B/api/mock/sim/state` 里的推送日志）复制 `bundle_message` 那条的原始载荷，「Shopee 签名推送」按 U 重放 | `200` |
| 6 | 同样重放 `faq_liveagent` 那条的原始载荷 | `200` |
| 7 | 等 30 秒，执行 `TC-CONV-056` 第 4 步的查询（买家名换成 X） | 一行：`ok\|4`，常见问题记录已入库并拉回成员 |
| 8 | `q "select status from inbound_event where payload->'data'->'content'->>'message_type' = 'bundle_message' order by received_at desc limit 1"` | `done` |

后置：再读一次 `get_app_push_config`，`callback_url` 为 U。

#### `TC-CONV-058` 常见问题记录拉不到时提示到卖家中心查看 — 对应 `REQ-CONV-013` · 级别: 边缘 · 执行者: 皆可

前置：先执行 `TC-CONV-056`（得到买家 X）；从推送日志复制那条 `bundle_message` 的原始载荷，把 `message_id` 改成一个新的 19 位数字 N、`content.messages` 改成 `["1000000000000000001"]`，记为载荷 P。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 「Shopee 签名推送」（应用 `1000101`）把 P 推到 Shopilot 的回调地址 | `200` |
| 2 | 20 秒后刷新买家 X 的会话 | 时间线多一张常见问题记录卡，没有对话内容，提示到 Shopee 卖家中心查看；输入框照常可用 |
| 3 | `q "select payload->'bundle'->>'status' from message where external_message_id = '<N>'"` | `failed` |

后置：无。

#### `TC-CONV-059` 历史常见问题记录补拉脚本 — 对应 `REQ-CONV-013` · 级别: 边缘 · 执行者: 皆可

前置：先执行 `TC-CONV-056`；`q "select m.id from message m join conversation c on c.id = m.conversation_id where c.buyer_name = '<X>' and m.payload->'bundle'->>'status' = 'ok'"` 记为 M（执行过 `TC-CONV-058` 时这个会话里还有一条取不到的记录，按状态取拉到的那条）；把这条改回上线前的样子（只在本地库执行）：`docker compose exec -T postgres psql -U shopilot -d shopilot -c "update message set payload = payload - 'bundle' where id = '<M>'"`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `pnpm shopee:bundles --days 1` | 首行「最近 1 天待补的常见问题记录：K 条」，K ≥ 1；末行「完成：拉到 A，取不到 F，出错 0」，A ≥ 1；输出里没有消息内容 |
| 2 | `q "select payload->'bundle'->>'status', jsonb_array_length(payload->'bundle'->'items') from message where id = '<M>'"` | `ok\|4` |

后置：无。

#### `TC-CONV-060` 商品页签列出与搜索本店在售商品 — 对应 `REQ-CONV-014` · 级别: 回归 · 执行者: 皆可

前置：基线；执行「curl 会话」，`login agent@demo.test`；按 §3「模拟器发消息」给 Demo Shopee MY 新买家发一条文字；浏览器以 agent@demo.test（Nur，负责 Demo Shopee MY）登录，打开这个会话。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 右栏点「商品」页签 | 地址带 `side=products`；列出 4 件商品：Bamboo Fibre Bath Towel Set (3 pcs)、Stainless Steel Vacuum Tumbler 900ml、Silicone Kitchen Utensil Set (6 pcs)、Linen Cushion Cover 45x45cm；每件有图、名、价格，库存依次为 87、67、47、27 |
| 2 | 搜索框输入「tumbler 900」 | 只剩 Stainless Steel Vacuum Tumbler 900ml |
| 3 | 改为「tumbler towel」 | 没有商品，显示没有匹配的商品 |
| 4 | 改为商品 ID「24580011003」 | 只剩 Silicone Kitchen Utensil Set (6 pcs) |
| 5 | `api agent@demo.test "$B/api/v1/me"` 取 Demo Shopee MY 的店铺 ID S，`api agent@demo.test "$B/api/v1/shops/<S>/products"` | `HTTP 200`；`items` 4 条，`truncated` 为 false；每条有 `productId`、`url` |

后置：无。

#### `TC-CONV-061` 发商品卡，待认领的会话先认领 — 对应 `REQ-CONV-014` · 级别: 回归 · 执行者: 皆可

前置：基线；按 §3「模拟器发消息」给 Demo Shopee MY 新买家发一条文字，记会话 C；浏览器以 agent@demo.test 登录，打开 C（还没有处理人）。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 右栏「商品」里 Silicone Kitchen Utensil Set (6 pcs) 一行点「发商品卡」 | 提示已发商品卡；会话处理人变为 Nur Aisyah；时间线出现商品卡，显示该商品的图、名与价格，已发送 |
| 2 | 模拟器打开这个买家的会话 | 买家视图出现这张商品卡 |
| 3 | `q "select type, payload->>'productId', send_status from message where conversation_id = '<C>' and direction = 'out' order by created_at desc limit 1"` | `product_card\|24580011003\|sent` |

后置：无。

#### `TC-CONV-062` Shopee 店发商品链接，TikTok 店只能发商品卡 — 对应 `REQ-CONV-014` · 级别: 回归 · 执行者: 皆可

前置：基线；按 §3「模拟器发消息」给 Demo Shopee MY、Demo TikTok TH 各一个新买家发一条文字；浏览器以 agent2@demo.test（Mei Lin，负责这两家店）登录。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 打开 Shopee 买家的会话，「商品」里 Linen Cushion Cover 45x45cm 一行点「发链接」 | 时间线出现一条已发送的文字消息 `https://shopee.com.my/product/220001/24580011004` |
| 2 | 打开 TikTok TH 买家的会话，右栏「商品」 | 列出 3 件泰文商品，每行只有「发商品卡」，没有「发链接」 |
| 3 | 在第一件「ชุดผ้าขนหนูใยไผ่ 3 ผืน」点「发商品卡」 | 时间线出现商品卡，已发送；模拟器里该买家收到商品卡 |

后置：无。

#### `TC-CONV-063` 没有商品权限的店与不能发送的会话 — 对应 `REQ-CONV-014` · 级别: 回归 · 执行者: 皆可

前置：基线；执行「curl 会话」，`login lead@demo.test`、`login agent@demo.test`；按 §3「模拟器发消息」给 Demo TikTok MY 新买家发一条文字（会话 C1），再给 Demo Shopee MY 新买家发一条（会话 C2）；`api agent@demo.test -X POST $B/api/v1/conversations/<C2>/claim -d '{}'` 返回 `HTTP 200`；浏览器以 lead@demo.test（Arif）登录。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 打开 C1，右栏「商品」 | 显示「不能列出这家店的商品」，说明店铺没有授予商品读取权限、请管理员到「店铺与连接」续期授权；不列商品 |
| 2 | `api lead@demo.test "$B/api/v1/me"` 取 Demo TikTok MY 的店铺 ID，`api lead@demo.test "$B/api/v1/shops/<店铺 ID>/products"` | `HTTP 409`，`code` 为 `product_scope_missing` |
| 3 | 打开 C2（Nur 处理中），右栏「商品」 | 照常列出商品；上方提示「只有这个会话的处理人能发送商品。」；点「发商品卡」「发链接」都不发送，时间线不变 |

后置：无。

#### `TC-CONV-064` 粘贴图片确认后发出，带文字按文字粘贴，PDF 给原因（已废弃） — 对应 `REQ-CONV-015` · 级别: 回归 · 执行者: 皆可

已废弃，被 `TC-CONV-072` 取代：DESIGN v1.26 起粘贴不再弹确认框逐个发出，改为放进输入框的附件条，和文字一起按顺序发。


前置：基线；准备 §3 测试图片里约 2 MB 的 PNG 与恰好 10,485,760 字节的 PNG，另 `printf '%%PDF-1.4\n' > $SP_TMP/img/a.pdf`；按 §3「模拟器发消息」给 Demo Shopee MY 新买家发一条文字，记会话 C；浏览器以 agent@demo.test 登录，打开 C 并点「认领」。粘贴的做法：人工在访达里选中文件复制，再在输入框按 ⌘V；AI 对输入框派发一个 `paste` 事件，`clipboardData` 里放这些文件（与文字）。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 在空输入框粘贴两张 PNG | 弹出确认框「发给 <买家名>？」，写「从剪贴板粘贴了 2 个文件，确认后按顺序逐个发出。」，预览两张缩略图，按钮「发送 2 个」 |
| 2 | 点「发送 2 个」 | 两张依次打勾，确认框自动关闭；时间线多两张图片，都已发送 |
| 3 | 粘贴同时带文字「你好」与一张 PNG 的剪贴板内容 | 输入框里出现「你好」，不弹确认框 |
| 4 | 清空输入框后粘贴 a.pdf | 不弹确认框；提示「平台聊天只能发图片和 MP4 视频，PDF 等文件发不出去。」 |
| 5 | 模拟器打开这个买家的会话 | 买家视图收到 2 张图片 |

后置：无。

#### `TC-CONV-065` Shopee 会话发 MP4 视频，TikTok 会话不能发视频（已废弃） — 对应 `REQ-CONV-015` · 级别: 回归 · 执行者: 皆可

已废弃，被 `TC-CONV-076` 取代：DESIGN v1.29 起 TikTok 会话也能发视频，第 6、7 步的预期不再成立，TikTok 部分见 `TC-CONV-077`。

前置：基线；执行「curl 会话」，`login agent2@demo.test`；准备 §3 测试视频 clip.mp4 与 clip.mov；按 §3「模拟器发消息」给 Demo Shopee MY、Demo TikTok TH 各一个新买家发一条文字，记会话 C1、C2；浏览器以 agent2@demo.test（Mei Lin）登录，两个会话都点「认领」。粘贴做法同 `TC-CONV-072`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 打开 C1，用输入框下方的附件按钮选 clip.mp4，等缩略图不再显示上传中后点发送 | 附件条出现一个视频缩略图；点发送后它移出附件条，时间线出现视频气泡，标「发送中」 |
| 2 | 等 15 秒 | 视频气泡变为已发送，点播放能播放 |
| 3 | `q "select type, send_status from message where conversation_id = '<C1>' and type = 'video'"` | `video\|sent` |
| 4 | 模拟器打开这个买家的会话 | 买家视图收到一条视频 |
| 5 | 在 C1 输入框粘贴 clip.mov | 不发送；提示「只支持 MP4 视频，MOV 等格式请先导出为 MP4。」 |
| 6 | 打开 C2，在输入框粘贴 clip.mp4 | 提示「TikTok 接口暂不支持发视频。」；附件条不出现 |
| 7 | `q "select id from file where kind = 'chat_video' order by created_at desc limit 1"` 记 F；`api agent2@demo.test -X POST $B/api/v1/conversations/<C2>/messages -d '{"clientRequestId":"tc065-video","type":"video","fileId":"<F>"}'` | `HTTP 409`，提示 TikTok 接口暂不支持发视频 |

后置：无。

#### `TC-CONV-066` 快捷回复按会话发送语言插入对应版本 — 对应 `REQ-CONV-009` · 级别: 回归 · 执行者: 皆可

前置：基线；执行「curl 会话」，`login owner@demo.test`；`api owner@demo.test -X POST $B/api/v1/quick-replies -d '{"title":"测试问候","stage":"any","text":"您好，有什么可以帮您？","variants":[{"lang":"ms","text":"Hai, ada apa yang boleh saya bantu?"},{"lang":"en","text":"Hi, how can I help you?"}]}'` 返回 `HTTP 201`；按 §3「模拟器发消息」给 Demo Shopee MY 新买家发一条文字；浏览器以 agent@demo.test 登录，打开这个会话并点「认领」；看输入框下方的翻译下拉，记当前目标语言 L（马来语或英语）。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 在空输入框输入「/测试」 | 菜单里有「测试问候」，预览的是 L 版内容，并显示这条有 3 个版本 |
| 2 | 回车选中 | 输入框内容是 L 版：马来语为「Hai, ada apa yang boleh saya bantu?」，英语为「Hi, how can I help you?」；翻译下拉显示「不翻译 · 已插入<L>版」 |
| 3 | 清空输入框 | 翻译下拉回到「译成<L>」 |
| 4 | 输入「谢谢 」，接着输入「/测试」并回车 | 输入框是「谢谢 」加默认版「您好，有什么可以帮您？」；翻译下拉仍是「译成<L>」 |
| 5 | 清空后再插入一次 L 版，点发送 | 时间线发出的是 L 版原文，没有「原文」对照；翻译下拉回到「译成<L>」 |

后置：删除「测试问候」。

#### `TC-CONV-067` 快捷回复语言版本的编辑与校验 — 对应 `REQ-CONV-009` · 级别: 回归 · 执行者: 皆可

前置：基线；执行「curl 会话」，`login owner@demo.test`；浏览器以 owner@demo.test 登录。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 打开 `/reception/prompts`，快捷回复点新增：标题「语言版本测试」，默认页签填「请稍等」，再加一个「越南语」页签填「Vui lòng đợi」，保存 | 列表出现这一条，下方写「另有越南语版」 |
| 2 | 再新增一条，加越南语页签但内容留空，保存 | 不保存；越南语页签提示「请填写这个语言版本的内容，不需要就删掉这个版本」 |
| 3 | `api owner@demo.test -X POST $B/api/v1/quick-replies -d '{"title":"重复语言","stage":"any","text":"a","variants":[{"lang":"vi","text":"x"},{"lang":"vi","text":"y"}]}'` | `HTTP 422`，提示同一种语言只能有一个版本 |
| 4 | `api owner@demo.test "$B/api/v1/quick-replies"` | 「语言版本测试」一项的 `variants` 为 `[{"lang":"vi","text":"Vui lòng đợi"}]` |

后置：删除「语言版本测试」。

#### `TC-CONV-068` 真实平台发商品卡、商品链接与视频 — 对应 `REQ-CONV-014`、`REQ-CONV-015` · 级别: 回归 · 执行者: 人工

前置：已接真实 Shopee、TikTok 店铺的环境（shopilot.live）；在买家确实问到某件商品或需要视频的真实会话里操作，不为测试打扰无关买家。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | Shopee 会话，右栏「商品」搜到买家问的商品，点「发商品卡」 | Shopilot 时间线已发送；卖家中心同一会话出现商品卡 |
| 2 | 同一会话点「发链接」 | 买家收到能打开的商品页地址 |
| 3 | TikTok 会话发商品卡 | Shopilot 时间线已发送；卖家中心出现商品卡 |
| 4 | Shopee 会话发一个 30 MB 以内的 MP4 | 2 分钟内变已发送；卖家中心可播放；Shopilot 时间线能播放 |
| 5 | TikTok 会话发一个 20 MB 以上、100 MB 以内的 MP4 | 2 分钟内变已发送；卖家中心同一会话出现这条视频且可播放；Shopilot 时间线能播放 |

后置：无。

#### `TC-CONV-069` 停止输入后预翻译：预览出现、改字刷新、切「不翻译」消失，输入框高度不变 — 对应 `REQ-CONV-016` · 级别: 回归 · 执行者: 皆可

前置：基线；按 §3「模拟器发消息」给 Demo Shopee MY 新买家发「Boleh saya tahu bila barang sampai?」；浏览器窗口 1440×900，以 agent@demo.test 登录，打开这个会话并点「认领」；记翻译下拉的当前目标语言 L（不是「不翻译」）。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 在输入框输入「您好，今天会发货」，输入完立刻量输入框外框高度 h | 工具栏显示「将发送」与「翻译中…」 |
| 2 | 停止输入，等 2 秒 | 「将发送」后面换成译文（或只显示「将发送」标签）；输入框外框高度仍为 h |
| 3 | 点「将发送」 | 浮层显示 L 语言的完整译文；输入框外框高度仍为 h |
| 4 | 关掉浮层，把文字改成「您好，明天会发货」，停止输入等 2 秒，再点「将发送」 | 浮层显示的是新文字的译文，与第 3 步不同 |
| 5 | 翻译下拉切到「不翻译」 | 「将发送」消失；输入框外框高度仍为 h |

后置：无。

#### `TC-CONV-070` 发送时带上预译文，没翻好就由服务端照旧翻译 — 对应 `REQ-CONV-016` · 级别: 回归 · 执行者: 皆可

前置：基线；按 §3「模拟器发消息」给 Demo Shopee MY 新买家发「Boleh saya tahu bila barang sampai?」；浏览器以 agent@demo.test 登录，打开这个会话并点「认领」；记翻译下拉的当前目标语言 L（不是「不翻译」）；记录浏览器发出的请求（开发者工具网络面板或脚本拦截）。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 输入「好的，马上为您处理」，停止输入，等到点「将发送」能看到译文 T | 浮层显示译文 T |
| 2 | 点发送 | `POST /api/v1/conversations/<id>/messages` 请求体含 `"translateTo":"<L>"` 与 `"translatedText":"<T>"`；返回 `201` |
| 3 | 看时间线最新一条本方消息 | 正文为 T，下方「原文」为「好的，马上为您处理」；状态已发送 |
| 4 | 输入「请稍等」后不停顿，立刻点发送 | 请求体有 `translateTo`、没有 `translatedText`；返回 `201`；时间线最新一条有「原文 请稍等」对照 |

后置：无。

#### `TC-CONV-071` 预译文的提交校验 — 对应 `REQ-CONV-016` · 级别: 边缘 · 执行者: 皆可

前置：基线；按 §3「模拟器发消息」给 Demo Shopee MY 新买家发「hello」；执行「curl 会话」，`login agent@demo.test`；`api agent@demo.test "$B/api/v1/conversations?view=queue"` 取这个买家的会话 ID 记为 C；`api agent@demo.test -X POST $B/api/v1/conversations/C/claim -d '{}'` 返回 `HTTP 200`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `api agent@demo.test -X POST $B/api/v1/conversations/C/messages -d '{"clientRequestId":"pt-tc071-1","type":"text","text":"你好","translatedText":"Hello"}'` | `HTTP 422`，`fields.translatedText` 写着译文只能随文字消息和翻译目标语言一起提交 |
| 2 | 同上，body 换成 `{"clientRequestId":"pt-tc071-2","type":"image","fileId":"00000000-0000-0000-0000-000000000000","translateTo":"en","translatedText":"Hello"}` | `HTTP 422`，`fields.translatedText` 同第 1 步 |
| 3 | 同上，body 为 `{"clientRequestId":"pt-tc071-3","type":"text","text":"你好","translateTo":"en","translatedText":"   "}` | `HTTP 422`，`fields.translatedText` 为「译文不能为空」 |
| 4 | 同上，`translatedText` 为 2,001 个字母 a，`clientRequestId` 为 `pt-tc071-4` | `HTTP 422`，`fields.translatedText` 为「译文最多 2,000 字」 |
| 5 | 同上，body 为 `{"clientRequestId":"pt-tc071-5","type":"text","text":"你好","translateTo":"en","translatedText":"Hello there"}` | `HTTP 201` |
| 6 | `api agent@demo.test "$B/api/v1/conversations/C"` | 最后一条本方消息 `text` 为「Hello there」、`originalText` 为「你好」 |

后置：无。

### AI 出稿


#### `TC-CONV-072` 粘贴的图片放进输入框，和文字一起按顺序发出 — 对应 `REQ-CONV-015` · 级别: 回归 · 执行者: 皆可

前置：基线；准备三张颜色不同的 PNG（红、绿、蓝，各 48×48 即可）与 `printf '%%PDF-1.4\n' > $SP_TMP/img/a.pdf`；按 §3「模拟器发消息」给 Demo Shopee MY 新买家发一条文字，记会话 C；浏览器以 owner@demo.test 登录，打开 C。粘贴的做法：人工在访达里按红、绿、蓝的顺序选中三个文件复制，再在输入框按 ⌘V；AI 对输入框派发一个 `paste` 事件，`clipboardData` 里按同样顺序放这些文件（与文字）。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 量一次输入框外框高度 H0；粘贴红、绿、蓝三张 | 不弹任何确认框；文字区下方出现附件条，从左到右依次是红、绿、蓝，读屏名依次为「第 1 个附件：图片」至「第 3 个附件：图片」；上传中的缩略图带转圈，传完后消失 |
| 2 | 在文字区输入「先发文字，再按顺序发图片」 | 文字在上、附件条在下，输入框外框比 H0 高 |
| 3 | 点绿图右上角的「移除第 2 个附件：图片」 | 附件条只剩红、蓝两个，顺序不变 |
| 4 | 点发送 | 发送按钮转圈；完成后附件条消失、文字区清空，输入框外框回到 H0 |
| 5 | 看时间线最后三条 | 依次是这句话（带译文）、红图、蓝图，都已发送 |
| 6 | 模拟器打开这个买家的会话 | 买家视图依次收到这句话、红图、蓝图 |
| 7 | 粘贴同时带文字「你好」与一张 PNG 的剪贴板内容 | 输入框里出现「你好」，附件条不出现 |
| 8 | 清空输入框后粘贴 a.pdf | 提示「平台聊天只能发图片和 MP4 视频，PDF 等文件发不出去。」；附件条不出现 |
| 9 | 用附件按钮一次选两张 PNG | 两张按选择顺序进附件条，不直接发出；逐个点「移除」清空 |

后置：无。

#### `TC-CONV-073` 附件在平台没发出：存成失败气泡，后面的停下，再点发送接着发 — 对应 `REQ-CONV-015` · 级别: 回归 · 执行者: 皆可

前置：基线；准备两张颜色不同的 PNG（绿、红）；按 §3「模拟器发消息」给 Demo Shopee SG 新买家发一条文字，记会话 C；浏览器以 owner@demo.test 登录，打开 C。粘贴做法同 `TC-CONV-072`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 模拟器「故障注入」：Demo Shopee SG 下一次卖家发送返回平台错误 | 面板显示已设定 |
| 2 | 在 C 的空输入框依次粘贴绿、红两张，等上传完 | 附件条依次是绿、红 |
| 3 | 点发送 | 出现「发送失败」提示；时间线最后一条是绿图、标发送失败；附件条只剩红图，没有发出 |
| 4 | 再点发送 | 红图发出；附件条消失；时间线最后一条是红图、已发送 |

后置：模拟器「故障注入」清除 Demo Shopee SG 卖家发送的设定（一次性故障已用掉时面板为空）。

#### `TC-CONV-074` 附件被拒、没进时间线：标「没发出」，后面的停下，再点发送接着发 — 对应 `REQ-CONV-015` · 级别: 边缘 · 执行者: AI

前置：基线；准备三张颜色不同的 PNG（红、绿、蓝）；按 §3「模拟器发消息」给 Demo Shopee SG 新买家发一条文字，记会话 C；浏览器以 owner@demo.test 登录，打开 C。要拦截浏览器请求，只能由 AI 用可脚本化浏览器执行。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 依次粘贴红、绿、蓝三张，输入「失败即停：这句先发」，等上传完 | 附件条依次是红、绿、蓝 |
| 2 | 设拦截：本页第 3 个 `POST /api/v1/conversations/<C>/messages`（即第二个附件）直接返回 `409`，problem 的 `detail` 为「模拟：平台拒绝这张图」；点发送 | 出现「没有发出」提示；时间线新增这句话与红图；附件条剩绿、蓝，绿图标「没发出」，文字区清空 |
| 3 | 取消拦截，再点发送 | 绿图、蓝图依次发出，附件条消失；时间线最后四条依次是这句话、红、绿、蓝 |

后置：无。

#### `TC-CONV-075` 打开会话：指到会话行先预取，点下即显示会话头与骨架 — 对应 `REQ-CONV-003` · 级别: 回归 · 执行者: 皆可

前置：基线；预取只在生产构建里生效：`pnpm build` 后 `pnpm start`（同 §3 本地环境变量，端口自定），Worker 同库；浏览器窗口宽 1440 px，开发者工具网络面板打开；以 owner@demo.test 登录。记待认领列表前三行的会话为 C1、C2、C3，买家名为 N1、N2、N3。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 打开 `/wb?view=queue`，不动指针停留 3 秒，看网络面板 | 没有任何 `/wb/<会话 ID>` 请求，也没有 `/api/v1/conversations/<会话 ID>` 与 `/buyer` 请求 |
| 2 | 点 C1，等会话内容出现；再把指针移到 C2 行上停 1 秒，不点 | 指上去后出现对 C2 的 `GET /api/v1/conversations/<C2>`、`GET /api/v1/conversations/<C2>/buyer` 与 `GET /wb/<C2>`（请求头带 `RSC: 1`），都是 200 |
| 3 | 点 C2 | 地址变为 `/wb/<C2>`，会话头是 N2，时间线随即出现；点击后 500 ms 内没有新的 `GET /api/v1/conversations/<C2>` 请求 |
| 4 | 把 `/api/v1/conversations/<C3>` 的响应延后 3 秒（网络面板限速或请求拦截），点 C3 | 点下即：列表高亮换到 C3；对话栏读屏名「正在打开与 N3 的会话」；会话头是 N3 与平台、店铺、「待认领」，下面一条「买家已等 …」；时间线、输入框与右栏是灰色骨架；对话栏里不再有 N2 的会话 |
| 5 | 等详情返回 | 换成「与 N3 的会话」：买家名的位置、会话头底边、输入框顶边与骨架时相同，时间线出现消息 |
| 6 | 窗口改为宽 390 px，打开 `/wb?view=queue`，同第 4 步延后 C1 的详情，点 C1 | 列表立即隐藏，对话栏显示 N1 的会话头、返回按钮与骨架；详情返回后换成「与 N1 的会话」 |
| 7 | 窗口宽 1440 px，打开 C1 后按住 Cmd（Windows 为 Ctrl）点 C2 | 新标签打开 `/wb/<C2>`；原标签仍显示「与 N1 的会话」，没有出现占位 |
| 8 | 操作系统打开「减少动态效果」后重复第 4 步 | 骨架灰条静止，不闪动 |
| 9 | 窗口宽 390 px，打开 `/wb?view=queue`，把 `/wb/<C2>` 的页面请求延后 3 秒，点 C2 后立即点占位上的返回按钮 | 立即回到会话列表；4 秒后仍停在列表，没有自己打开 C2 |

后置：无。

#### `TC-CONV-076` Shopee 会话发 MP4 视频，MOV 与超过 30 MB 的不能发（已废弃） — 对应 `REQ-CONV-015` · 级别: 回归 · 执行者: 皆可

已废弃，被 `TC-CONV-079` 取代：DESIGN v1.31 起 Shopee 会话也能发 MOV 视频，第 5、8 步的预期不再成立。

前置：基线；执行「curl 会话」，`login agent2@demo.test`；准备 §3 测试视频 clip.mp4、clip.mov、big31.mp4；按 §3「模拟器发消息」给 Demo Shopee MY 一个新买家发一条文字，记会话 C；浏览器以 agent2@demo.test（Mei Lin）登录，打开 C 点「认领」。粘贴做法同 `TC-CONV-072`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 用输入框下方的附件按钮选 clip.mp4，等缩略图不再显示上传中后点发送 | 附件条出现一个视频缩略图；点发送后它移出附件条，时间线出现视频气泡，标「发送中」 |
| 2 | 等 15 秒 | 视频气泡变为已发送，点播放能播放 |
| 3 | `q "select type, send_status from message where conversation_id = '<C>' and type = 'video'"` | `video\|sent` |
| 4 | 模拟器打开这个买家的会话 | 买家视图收到一条视频 |
| 5 | 在输入框粘贴 clip.mov | 不发送；提示「只支持 MP4 视频，MOV 等格式请先导出为 MP4。」；附件条不出现 |
| 6 | 粘贴 big31.mp4 | 提示「视频 31.0 MB，超过 30 MB 上限。」；附件条不出现 |
| 7 | `curl -s -b "$SP_TMP/agent2@demo.test" -H "Origin: $B" -F "file=@$SP_TMP/img/clip.mov" -w '\nHTTP %{http_code}\n' $B/api/v1/files`，记返回的 `id` 为 M | `HTTP 201`，`kind` 为 `video`；`q "select mime from file where id = '<M>'"` 为 `video/quicktime` |
| 8 | `api agent2@demo.test -X POST $B/api/v1/conversations/<C>/messages -d '{"clientRequestId":"tc076-mov","type":"video","fileId":"<M>"}'` | `HTTP 415` `/errors/unsupported-type`，`detail` 为「Shopee 只能发 MP4 视频。」；时间线没有新增 |
| 9 | 同第 7 步上传 big31.mp4 记为 G，再同第 8 步发 G（`clientRequestId` 换成 `tc076-big`） | 上传 `HTTP 201`；发送 `HTTP 413` `/errors/too-large`，`detail` 为「Shopee 视频不能超过 30 MB。」 |

后置：无。

#### `TC-CONV-077` TikTok 会话发视频：和文字按顺序发出，MOV、WebM 可发，上限 100 MB — 对应 `REQ-CONV-015` · 级别: 回归 · 执行者: 皆可

前置：基线；执行「curl 会话」，`login owner@demo.test`；准备 §3 测试视频 clip.mp4、clip.mov、clip.webm、big31.mp4、big101.mp4；按 §3「模拟器发消息」给 Demo TikTok MY 一个新买家发一条文字，记会话 C，模拟器会话 ID 记 X；浏览器以 owner@demo.test 登录，打开 C。粘贴做法同 `TC-CONV-072`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 看输入框下方附件按钮的读屏名 | 「添加图片或视频（JPG、PNG、WebP 图片不超过 10 MB，MP4、MOV、WebM 视频不超过 100 MB）」 |
| 2 | 在文字区输入「这是安装视频」，粘贴 clip.mp4 | 不弹提示；附件条出现一个视频缩略图 |
| 3 | 等缩略图不再显示上传中，点发送 | 附件条消失；时间线先出现这句话（带译文），再出现视频气泡 |
| 4 | 等 10 秒，点视频气泡 | 视频气泡已发送；灯箱里视频在播放，进度走动 |
| 5 | `q "select type, send_status, external_message_id is not null, payload->>'url' from message where conversation_id = '<C>' and direction = 'out' order by created_at"` | 最后两行依次为 `text\|sent\|t\|`、`video\|sent\|t\|/api/v1/files/<文件 ID>` |
| 6 | 模拟器打开这个买家的会话 | 买家视图依次收到这句话、一条视频 |
| 7 | 用附件按钮一次选 clip.mov 与 clip.webm，等上传完点发送 | 两个视频缩略图按选择顺序进附件条；发出后时间线依次新增两条视频，10 秒内都已发送 |
| 8 | 粘贴 big101.mp4 | 提示「视频 101.0 MB，超过 100 MB 上限。」；附件条不出现 |
| 9 | `curl -s -b "$SP_TMP/owner@demo.test" -H "Origin: $B" -F "file=@$SP_TMP/img/big101.mp4" -w '\nHTTP %{http_code}\n' $B/api/v1/files` | `HTTP 413` `/errors/too-large`，`detail` 为「视频不能超过 100 MB，图片不能超过 10 MB。」 |
| 10 | 同第 9 步上传 big31.mp4，记返回的 `id` 为 G；`api owner@demo.test -X POST $B/api/v1/conversations/<C>/messages -d '{"clientRequestId":"tc077-big","type":"video","fileId":"<G>"}'` | 上传 `HTTP 201`；发送 `HTTP 201`，`sendStatus` 为 `sending` |
| 11 | 等 10 秒；`q "select send_status from message where conversation_id = '<C>' and client_request_id = 'tc077-big'"`；看 `pnpm dev` 终端输出里这次发送的模拟平台请求 | `sent`；依次有 `POST /mock/tiktok/open-api/open/202512/file/init`、两次 `PUT /mock/tiktok/open-api/file/v1/upload`（`chunk_num=1`、`chunk_num=2`）、`POST /mock/tiktok/open-api/customer_service/202309/conversations/<X>/messages`，都是 200 |

后置：无。

#### `TC-CONV-078` 视频按真实宽高比显示：横屏、竖屏、买家视频与没有宽高的旧视频 — 对应 `REQ-CONV-015` · 级别: 回归 · 执行者: 皆可

前置：基线；执行「curl 会话」，`login owner@demo.test`；准备 §3 测试视频 wide.mp4、tall.mp4；按 §3「模拟器发消息」给 Demo TikTok MY、Demo Shopee MY 各一个新买家发一条文字，记会话 C1、C2；浏览器窗口宽 1440 px，开发者工具网络面板打开，以 owner@demo.test 登录。缩略图尺寸量视频气泡里「播放视频」按钮的外框。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 打开 C1，用附件按钮选 wide.mp4，等缩略图不再显示上传中，看这次 `POST /api/v1/files` | 请求表单带 `width` 1280、`height` 720；响应 201，`width` 1280、`height` 720 |
| 2 | 点发送，等 10 秒 | 视频气泡已发送；缩略图宽 240 px、高 135 px，画面上下左右没有黑边 |
| 3 | 点这个视频气泡 | 灯箱里视频在播放，进度走动；关掉灯箱 |
| 4 | 同第 1、2 步发 tall.mp4 | 新的视频气泡已发送；缩略图宽 144 px、高 256 px |
| 5 | `q "select payload->>'width', payload->>'height' from message where conversation_id = '<C1>' and type = 'video' order by created_at"` | 两行依次为 `1280\|720`、`720\|1280` |
| 6 | 打开 C2，同第 1、2 步发 wide.mp4，等 15 秒后点视频气泡 | 已发送；缩略图宽 240 px、高 135 px；灯箱里视频在播放 |
| 7 | `q "insert into message (id, merchant_id, conversation_id, segment_id, direction, sender_role, type, payload, sent_at) select gen_random_uuid(), merchant_id, conversation_id, segment_id, 'in', 'buyer', 'video', payload, now() from message where conversation_id = '<C1>' and type = 'video' and payload->>'height' = '1280'"`，打开 C1 | 时间线最后一条是买家发来的视频，在左侧；缩略图宽 144 px、高 256 px |
| 8 | `q "update message set payload = payload - 'width' - 'height' where conversation_id = '<C1>' and direction = 'out' and type = 'video' and payload->>'width' = '1280'"`；把这条视频的文件请求 `/api/v1/files/<文件 ID>` 延后 3 秒（网络面板限速或请求拦截），刷新 C1 | 这条视频先按竖屏占位，宽 144 px、高 256 px；文件到了以后变成宽 240 px、高 135 px，之后不再变 |
| 9 | 窗口改为宽 390 px，打开 C1 | 三条视频缩略图都在对话栏内，页面没有横向滚动；横屏一条宽高比 16:9，竖屏两条 9:16 |
| 10 | `curl -s -b "$SP_TMP/owner@demo.test" -H "Origin: $B" -F "file=@$SP_TMP/img/wide.mp4" -F width=0 -F height=720 -w '\nHTTP %{http_code}\n' $B/api/v1/files`；再只带 `-F width=1280` 上传一次 | 两次都是 `HTTP 422` `/errors/validation`，`detail` 为「视频宽高要是 1–8192 的整数，两个要一起给。」 |
| 11 | 同第 10 步，带 `-F width=1280 -F height=720` 上传一次，再不带宽高上传一次 | 两次都是 `HTTP 201`；第一次 `width` 1280、`height` 720，第二次 `width`、`height` 都是 null |

后置：无。

#### `TC-CONV-079` Shopee 会话发 MP4 与 MOV 视频，WebM 与超过 30 MB 的不能发 — 对应 `REQ-CONV-015` · 级别: 回归 · 执行者: 皆可 · 源自缺陷 2026-10-21 后缀 .mp4 的 QuickTime 视频在 Shopee 会话发送失败

前置：基线；执行「curl 会话」，`login agent2@demo.test`；准备 §3 测试视频 clip.mp4、qt.mp4、clip.mov、clip.webm、big31.mp4；按 §3「模拟器发消息」给 Demo Shopee MY 一个新买家发一条文字，记会话 C；浏览器以 agent2@demo.test（Mei Lin）登录，打开 C 点「认领」。粘贴做法同 `TC-CONV-072`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 用输入框下方的附件按钮选 clip.mp4，等缩略图不再显示上传中后点发送 | 附件条出现一个视频缩略图；点发送后它移出附件条，时间线出现视频气泡，标「发送中」 |
| 2 | 等 15 秒 | 视频气泡变为已发送，点播放能播放 |
| 3 | 用附件按钮选 qt.mp4，等缩略图不再显示上传中后点发送，等 15 秒 | 附件条出现视频缩略图，没有提示；点发送后时间线出现视频气泡，15 秒内变为已发送，没有「发送失败」或「没发出」 |
| 4 | 在输入框粘贴 clip.mov，点发送，等 15 秒 | 附件条出现视频缩略图，没有提示；发送后视频气泡变为已发送 |
| 5 | `q "select f.mime, m.send_status from message m join file f on f.id = (m.payload->>'fileId')::uuid where m.conversation_id = '<C>' and m.type = 'video' order by m.created_at"` | 三行依次为 `video/mp4\|sent`、`video/quicktime\|sent`、`video/quicktime\|sent` |
| 6 | 模拟器打开这个买家的会话 | 买家视图收到三条视频 |
| 7 | 在输入框粘贴 clip.webm | 不发送；提示「只支持 MP4、MOV 视频，其他格式请先导出为 MP4。」；附件条不出现 |
| 8 | 粘贴 big31.mp4 | 提示「视频 31.0 MB，超过 30 MB 上限。」；附件条不出现 |
| 9 | `curl -s -b "$SP_TMP/agent2@demo.test" -H "Origin: $B" -F "file=@$SP_TMP/img/clip.webm" -w '\nHTTP %{http_code}\n' $B/api/v1/files`，记返回的 `id` 为 W | `HTTP 201`，`kind` 为 `video`；`q "select mime from file where id = '<W>'"` 为 `video/webm` |
| 10 | `api agent2@demo.test -X POST $B/api/v1/conversations/<C>/messages -d '{"clientRequestId":"tc079-webm","type":"video","fileId":"<W>"}'` | `HTTP 415` `/errors/unsupported-type`，`detail` 为「Shopee 只能发 MP4、MOV 视频。」；时间线没有新增 |
| 11 | 同第 9 步上传 big31.mp4 记为 G，再同第 10 步发 G（`clientRequestId` 换成 `tc079-big`） | 上传 `HTTP 201`；发送 `HTTP 413` `/errors/too-large`，`detail` 为「Shopee 视频不能超过 30 MB。」 |

后置：无。

#### `TC-AI-001` 主链路：买家消息生成 assist 草稿，员工认领并发送到买家 — 对应 `REQ-AI-001`、`REQ-AI-002`、`REQ-AI-003`、`REQ-CONV-001`、`REQ-CONV-004`、`REQ-CONV-005`、`REQ-MOCK-002` · 级别: 冒烟 · 执行者: 皆可

前置：基线；浏览器 A 以 agent@demo.test（Nur）登录停在 `/wb`；浏览器 B 打开模拟器；浏览器 C 以 owner@demo.test 打开 `/billing`，记下本期已用 U 与 assist 次数 A0。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | B：选 Demo Shopee MY、新建买家，发「我的包裹到哪了」 | 推送日志新增一条 Shopee code 10 推送，HTTP 200 |
| 2 | A：等待最多 20 秒 | 会话列表的「AI 草稿」分组计数加 1，列表出现该买家的会话，行上店铺为 Demo Shopee MY（侧栏计数按 10 秒轮询，可能稍后才变） |
| 3 | A：打开该会话 | 时间线有买家消息；草稿区显示草稿正文 X 与置信度 0.85，有「认领并发送」「改后发送」「忽略」 |
| 4 | A：点「认领并发送」 | 草稿区消失；时间线新增一条本方消息，正文 X，状态已发送；该会话出现在「我处理中」 |
| 5 | B：看该买家的买家视图 | 出现 1 条卖家消息，正文与 X 相同 |
| 6 | A：10 秒后刷新会话 | 正文 X 的本方消息仍只有 1 条（平台回推的本方消息没有重复入库） |
| 7 | C：刷新 `/billing` | 本期已用为 U + 1，assist 为 A0 + 1 |

后置：无。

#### `TC-AI-002` 真实 DeepSeek 出稿 — 对应 `REQ-AI-001`、`REQ-AI-002` · 级别: 冒烟 · 执行者: 皆可

前置：基线；`.env` 中 `AI_MODE=deepseek`、`DEEPSEEK_API_KEY` 已按 §3 填好，重启 `pnpm dev` 并通过就绪判定；模拟器为 Demo Shopee MY 新买家 B 下单（订单 O）并推进到 SHIPPED；Nur 登录停在 `/wb`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 模拟器以 B 发「我的包裹到哪了」 | 推送日志 HTTP 200 |
| 2 | Nur 等待最多 20 秒后打开该会话 | 「AI 草稿」里有该会话；草稿正文同时提到订单号 O 与物流状态（右栏显示的承运商、运单号或轨迹描述之一）；显示 0 到 1 之间的置信度 |
| 3 | 点「认领并发送」 | 模拟器 B 的买家视图收到与草稿正文相同的消息 |

后置：`.env` 改回 `AI_MODE=stub`，重启 `pnpm dev`。

#### `TC-AI-003` 出稿请求带阶段提示词、品牌语气、订单事实与护栏；没有可用资料时不检索 — 对应 `REQ-AI-002`、`REQ-RCP-003`、`REQ-KB-006` · 规则 `RULE-KB-001` · 级别: 回归 · 执行者: 皆可

前置：基线（Demo Store 没有知识库资料）；owner 在 `/reception/prompts` 把售中提示词改为以「【售中测试标记】」开头、品牌语气改为以「【语气标记】」开头，点「保存」；`login owner@demo.test`，`GET /api/v1/reception` 记下 `prompts.guardrails` 正文 G；`curl -s $B/api/dev/knowledge-stub` 记下 `lastQuery` 的条数 N；模拟器为 Demo Shopee MY 新买家 B 下单（订单 O）并推进到 SHIPPED。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 模拟器以 B 发「我的包裹到哪了」 | 20 秒内出现草稿，草稿下方没有「依据」 |
| 2 | 看「AI 替身」面板「最近一次请求」 | 含「【售中测试标记】」「【语气标记】」、订单号 O 与 SHIPPED、B 的消息原文；G 位于提示部分的最后；user 载荷没有 `knowledge` 字段 |
| 3 | `curl -s $B/api/dev/knowledge-stub` | `lastQuery` 仍为 N 条：这次出稿没有改写、没有检索 |

后置：无。

#### `TC-AI-004` 出稿只带最近 20 条消息 — 对应 `REQ-AI-002` · 级别: 边缘 · 执行者: 皆可

前置：基线。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 模拟器向 Demo Shopee MY 新买家依次发「第 01 条」到「第 25 条」，每条间隔约 1 秒 | 推送日志 25 条，均 HTTP 200 |
| 2 | 等最后一份草稿出现后看「最近一次请求」 | 对话部分包含「第 06 条」到「第 25 条」，不包含「第 01 条」到「第 05 条」 |

后置：无。

#### `TC-AI-005` shadow 模式：影子回复只给管理员与组长看 — 对应 `REQ-AI-001`、`REQ-AI-005` · 级别: 回归 · 执行者: 皆可

前置：基线；owner 在 `/reception` 把 Demo Shopee MY 的工作时间内、外都改为 shadow，点「保存」；在 `/billing` 记下 shadow 次数 S0；`login agent@demo.test`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 向 Demo Shopee MY 新买家发一条，Nur 打开「待认领」里的该会话（记 ID C） | 没有草稿区，也没有影子回复 |
| 2 | `api agent@demo.test $B/api/v1/conversations/<C>` | 200，响应里没有 `shadowDrafts` 或为空 |
| 3 | Arif 打开 C | 触发消息下方有折叠的「AI 影子回复（未发送）」，展开后显示正文与置信度，没有发送按钮 |
| 4 | owner 打开 C | 同第 3 步 |
| 5 | owner 刷新 `/billing` | shadow（影子生成）为 S0 + 1 |
| 6 | 看模拟器该买家的买家视图 | 没有卖家消息 |

后置：无。

#### `TC-AI-006` off 模式不出稿直接进待认领 — 对应 `REQ-AI-001` · 级别: 回归 · 执行者: 皆可

前置：基线；记下「最近一次请求」的内容 R0；owner 在 `/billing` 记下本期已用 U。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 向 Demo TikTok TH（off / off）新买家发一条；Mei 打开「待认领」 | 有该会话，没有草稿，转人工原因为店铺未开 AI |
| 2 | owner 刷新 `/billing`，看「最近一次请求」 | 本期已用仍为 U；「最近一次请求」与 R0 相同 |

后置：无。

#### `TC-AI-007` auto 模式在工作时间外直接回复 — 对应 `REQ-AI-001`、`REQ-RCP-001` · 级别: 回归 · 执行者: 皆可

前置：基线；按 §3「固定为工作时间外」（Demo TikTok MY 工作时间外为 auto）；`login owner@demo.test`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 向 Demo TikTok MY 新买家 B 发「我的包裹到哪了」 | 20 秒内模拟器 B 的买家视图收到 1 条卖家回复 |
| 2 | owner 打开该会话（记 ID C） | 该回复的发送方标为 AI；会话没有处理人 |
| 3 | `api owner@demo.test $B/api/v1/conversations/<C>` | `conversation.handlingState` 为 `bot` |
| 4 | owner 打开「AI 草稿」分组 | 列表里有 C |
| 5 | `/settings/audit` 模块工作台 | 有一条草稿处置为原样发送、模式 auto 的记录 |

后置：无。

#### `TC-AI-008` 模型输出不合法时转人工 — 对应 `REQ-AI-002`、`REQ-AI-004` · 级别: 回归 · 执行者: 皆可

前置：基线；AI 替身设为「非 JSON 文本」。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 向 Demo Shopee MY 新买家发一条，Nur 打开「待认领」 | 有该会话，没有草稿；转人工原因为模型出错（`model_error`） |

后置：无。

#### `TC-AI-009` 模型超时转人工 — 对应 `REQ-AI-004` · 级别: 回归 · 执行者: 皆可

前置：基线；AI 替身设为「超时」。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 向 Demo Shopee MY 新买家发一条，等 30 秒 | 该会话出现在 Nur 的「待认领」，没有草稿；转人工原因为模型超时（`timeout`） |

后置：无。

#### `TC-AI-010` 改后发送 — 对应 `REQ-AI-003` · 级别: 回归 · 执行者: 皆可

前置：基线；owner 在 `/dashboard`「本月」记下草稿「改后发送」数 E0；向 Demo Shopee MY 新买家 B 发一条，等草稿出现，记草稿正文 X。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | Nur 打开该会话点「改后发送」 | 输入框填入 X |
| 2 | 在末尾加「（已核实）」后发送 | 模拟器 B 的买家视图收到「X（已核实）」 |
| 3 | owner 打开 `/settings/audit` 模块工作台 | 有一条草稿处置为改后发送的记录，编辑距离 5 |
| 4 | owner 刷新 `/dashboard`「本月」 | 改后发送为 E0 + 1 |

后置：无。

#### `TC-AI-011` 忽略草稿后会话进待认领 — 对应 `REQ-AI-003` · 级别: 回归 · 执行者: 皆可

前置：基线；owner 在 `/dashboard`「本月」记下草稿「忽略」数 I0；向 Demo Shopee MY 新买家发一条，等草稿出现。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | Nur 打开该会话点「忽略」 | 草稿区消失；会话移到「待认领」，转人工原因为人工（`manual`） |
| 2 | owner 刷新 `/dashboard`「本月」 | 忽略为 I0 + 1 |

后置：无。

#### `TC-AI-012` 新买家消息作废旧草稿并重新出稿 — 对应 `REQ-AI-003` · 级别: 回归 · 执行者: 皆可

前置：基线；向 Demo Shopee MY 新买家 B 发「第一问」，等草稿 D1 出现并记下其生成时间。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 模拟器以 B 发「第二问：能改地址吗」 | 推送日志 HTTP 200 |
| 2 | 等最多 20 秒，Nur 打开该会话 | 草稿区只有 1 份草稿，生成时间晚于第 1 步；没有 D1 |
| 3 | 看「最近一次请求」 | 最后一条买家消息为「第二问：能改地址吗」 |

后置：无。

#### `TC-AI-013` 草稿 24 小时未处置过期 — 对应 `REQ-AI-003` · 级别: 回归 · 执行者: 皆可

前置：基线；终端执行 `pnpm scenario draft-25h`，记会话 C；owner 在 `/dashboard`「本月」记下草稿「过期」数 X0。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 打开 C | 草稿区显示一份草稿 |
| 2 | 执行 `pnpm job draft.expire` 后刷新 C | 草稿区不再显示该草稿 |
| 3 | owner 刷新 `/dashboard`「本月」 | 过期为 X0 + 1 |

后置：无。

#### `TC-AI-014` 已处置的草稿不能再处置 — 对应 `REQ-AI-003` · 级别: 边缘 · 执行者: 皆可

前置：基线；向 Demo Shopee MY 新买家发一条，等草稿出现；`login agent@demo.test`，`GET /api/v1/conversations/<C>` 记草稿 ID D。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `api agent@demo.test -X POST $B/api/v1/conversations/<C>/drafts/<D>/ignore` | 200 |
| 2 | 同一请求再发一次 | 200 |
| 3 | `api agent@demo.test -X POST $B/api/v1/conversations/<C>/messages -d '{"clientRequestId":"tc-ai-014","type":"text","text":"x","draftId":"<D>","disposition":"sent"}'` | 409，`type` 为 `/errors/conflict` |

后置：无。

#### `TC-AI-015` auto 模式命中转人工关键词：先安抚再转人工 — 对应 `REQ-AI-004` · 级别: 回归 · 执行者: 皆可

前置：基线；按 §3「固定为工作时间外」；owner 在 `/billing` 记下本期已用 U；Arif 记下通知条数。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 向 Demo TikTok MY 新买家发「我要投诉」 | 模拟器该买家的买家视图收到 1 条卖家安抚消息 |
| 2 | Arif 打开「待认领」与通知弹层 | 有该会话，转人工原因为关键词（`keyword`）；通知新增 1 条买家要求人工 / AI 转人工 |
| 3 | owner 刷新 `/billing` | 本期已用仍为 U |

后置：无。

#### `TC-AI-016` assist 模式低置信不出草稿 — 对应 `REQ-AI-004` · 级别: 回归 · 执行者: 皆可

前置：基线；AI 替身设为「低置信 0.4」（阈值为默认 0.60）。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 向 Demo Shopee MY 新买家发一条，Nur 打开「待认领」 | 有该会话，没有草稿；转人工原因为置信度低（`low_confidence`） |
| 2 | 看模拟器该买家的买家视图 | 没有卖家消息 |

后置：无。

#### `TC-AI-017` auto 模式低置信只发安抚句 — 对应 `REQ-AI-004` · 级别: 回归 · 执行者: 皆可

前置：基线；按 §3「固定为工作时间外」；AI 替身设为「低置信 0.4」。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 向 Demo TikTok MY 新买家发「这个能用在 Mac 上吗」 | 模拟器该买家的买家视图只收到 1 条卖家消息（安抚句） |
| 2 | Arif 打开「待认领」 | 有该会话，转人工原因为置信度低（`low_confidence`）；行上显示「待认领 · 等 N 分钟」（安抚句不清零等待） |

后置：无。

#### `TC-AI-018` 非文本消息转人工 — 对应 `REQ-AI-004` · 级别: 回归 · 执行者: 皆可

前置：基线。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 模拟器以 Demo Shopee MY 新买家发一张图片，Nur 打开「待认领」 | 有该会话，没有草稿；转人工原因为非文本消息（`non_text`） |

后置：无。

#### `TC-AI-019` 模型要求转人工 — 对应 `REQ-AI-004` · 级别: 回归 · 执行者: 皆可

前置：基线；AI 替身设为「要求转人工」，记下面板上该回复 JSON 的 `reason` 为 R。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 向 Demo Shopee MY 新买家发「我要找真人」，Nur 打开「待认领」 | 有该会话，没有草稿；R 为 `human_request`、`policy`、`keyword`、`low_confidence` 之一时，转人工原因等于 R；R 为其他值时，转人工原因为 `policy` |

后置：无。

#### `TC-AI-020` auto 模式发送失败转人工 — 对应 `REQ-AI-004` · 级别: 边缘 · 执行者: 皆可

前置：基线；按 §3「固定为工作时间外」；模拟器「故障注入」设 Demo TikTok MY 下一次卖家发送返回平台错误。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 向 Demo TikTok MY 新买家发「我的包裹到哪了」 | 模拟器该买家的买家视图里卖家消息不超过 1 条 |
| 2 | Arif 打开「待认领」 | 有该会话，转人工原因为发送失败（`send_failed`） |

后置：无。

#### `TC-AI-021` 额度用尽且策略为停止时不出稿 — 对应 `REQ-AI-005` · 级别: 回归 · 执行者: 皆可

前置：基线；终端执行 `pnpm scenario usage-exhausted`；记下「最近一次请求」的内容 R0。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 向 Demo Shopee MY 新买家发一条，Nur 打开「待认领」 | 有该会话，没有草稿；转人工原因为用量上限（`quota`） |
| 2 | owner 打开 `/billing` | 本期已用仍为 100 |
| 3 | 看「最近一次请求」 | 与 R0 相同（没有调用模型） |

后置：无。

#### `TC-AI-022` 用量跨过提醒阈值只提醒一次 — 对应 `REQ-AI-005` · 级别: 回归 · 执行者: 皆可

前置：基线；终端执行 `pnpm scenario usage-near-quota`（已用 79/100，阈值 80%，接收人所有者，渠道站内）；owner、admin2 各记下通知条数。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 向 Demo Shopee MY 新买家发一条，等草稿出现 | owner 的 `/billing` 已用为 80 |
| 2 | owner 打开通知弹层 | 新增 1 条用量提醒（80%） |
| 3 | 向另一新买家发一条，等草稿出现 | 已用为 81；owner 没有新增用量提醒 |
| 4 | admin2 打开通知弹层 | 没有新增用量提醒 |

后置：无。

#### `TC-AI-023` 从对话提取开票字段 — 对应 `REQ-AI-006` · 级别: 回归 · 执行者: 皆可

前置：基线；模拟器为 Demo Shopee MY 新买家 B 下单，并以 B 发「公司：Demo Buyer Sdn Bhd，地址：1 Jalan Demo, Kuala Lumpur，邮箱：buyer@demo.test」；等草稿出现后 Nur 对该会话点「认领」并回复一句；owner 在 `/billing` 记下本期已用 U。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | Nur 在右栏点「开 Invoice / Receipt」 | 打开开票弹层，订单与商品行已预填 |
| 2 | 点「从对话提取」 | 抬头、地址、邮箱被填入非空值，三个字段都可编辑 |
| 3 | 关闭弹层，owner 刷新 `/billing` | 本期已用仍为 U |

后置：无。

#### `TC-AI-024` 影子回复显示中文译文，可复制原文 — 对应 `REQ-AI-007`、`REQ-AI-001` · 级别: 回归 · 执行者: 皆可

前置：基线；终端执行 `pnpm scenario shadow-foreign`，记会话 C 与草稿 D（Demo Shopee MY 待认领，影子回复是英文、还没有译文）；以 owner@demo.test 登录。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | owner 打开 `/wb/<C>`，展开触发消息下方的「AI 影子回复（未发送）」 | 显示英文原文「Hi! Yes, it works with macOS 12 or later. Just plug it in via USB-C, no driver needed.」，没有译文行；有「复制」按钮，没有发送按钮 |
| 2 | 终端执行 `pnpm job draft.translate '{"draftId":"<D>"}'`，等 5 秒 | 原文下方出现「译 · Shopilot」标签与 AI 替身的译文「[译文] Hi! Yes, it works with macOS 12 or later. …」；按钮变为「复制原文」 |
| 3 | 点「复制原文」 | 提示「已复制」；剪贴板内容与英文原文逐字相同，不含译文 |
| 4 | `api owner@demo.test "$B/api/v1/conversations/<C>"` | `shadowDrafts[0].text` 为英文原文，`shadowDrafts[0].translation` 以「[译文] Hi! Yes」开头 |
| 5 | `login agent@demo.test`，`api agent@demo.test "$B/api/v1/conversations/<C>"` | `shadowDrafts` 为 null，员工拿不到影子回复与译文 |
| 6 | 模拟器选 Demo Shopee SG（影子模式）新买家发「Is it waterproof?」，30 秒后 owner 在「待认领」打开该会话并展开影子回复 | 影子回复是 AI 替身的中文回复，没有译文行，按钮写「复制」 |

后置：无。

#### `TC-AI-030` 出稿按买家语言定回复语言，中文品牌语气不改变它 — 对应 `REQ-AI-002`、`REQ-RCP-003` · 级别: 回归 · 执行者: 皆可 · 源自缺陷 2026-10-16 品牌语气改成中文后影子回复用中文回外语买家

前置：基线；先执行「curl 会话」，`login owner@demo.test`，`api owner@demo.test -X PUT $B/api/v1/reception/prompts -d '{"brandVoice":"请用亲切、专业的中文语气，称呼买家为「您」，多说谢谢。"}'` 末行 `HTTP 200`；在终端定义下面三个函数（`say` 以模拟器买家身份发一条文字，`lang` 取最近一次出稿请求的 `reply_language`，`at` 取它的时间）。

```bash
say() { curl -s -X POST "$B/api/mock/sim/buyer_message" -H 'Content-Type: application/json' -d "{\"conversationId\":\"$1\",\"text\":\"$2\"}" | jq -r .ok; }
lang() { curl -s "$B/api/dev/ai-stub" | jq -r '.lastRequest.messages[] | select(.role=="user") | .content | fromjson | .reply_language'; }
at() { curl -s "$B/api/dev/ai-stub" | jq -r '.lastRequest.at'; }
```

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `curl -s -X POST $B/api/mock/sim/create_buyer -H 'Content-Type: application/json' -d '{"platform":"shopee","shopId":"220001","name":"TH Buyer","language":"th"}' \| jq -r .conversationId` 记为 M；记 `at` 为 T0；`say <M> 'สรุปทำไม่ได้ใช่ไหม'` | 输出 `true` |
| 2 | 每 2 秒查一次 `at`，最多 20 秒，直到它不等于 T0；然后 `lang`，再 `curl -s $B/api/dev/ai-stub \| jq -r '.lastRequest.messages[0].content \| fromjson \| .brand_voice'` | `lang` 输出 `Thai`；品牌语气是前置里那段中文 |
| 3 | `curl -s $B/api/dev/ai-stub \| jq -r '.lastRequest.system'` | 护栏里有「回复语言只由 reply_language 决定」；最后一行是「本次回复语言：Thai。reply 只用 Thai 写，不夹用别的语言。」 |
| 4 | 记 `at` 为 T1；`say <M> 'Nếu ko có máy tính có sd được ko ạ'`，同第 2 步等 `at` 变化后 `lang` | `Vietnamese` |
| 5 | 记 `at` 为 T2；`say <M> '👍'`，同第 2 步等 `at` 变化后 `lang` | `Vietnamese`：这条判不出语言，取同一买家前一条文字消息的语言 |
| 6 | 同第 1 步在 Demo Shopee MY 新建买家 N；记 `at` 为 T3；`say <N> '0123438960'`，同第 2 步等 `at` 变化后 `lang` | `Malay`：买家没有判得出语言的文字，用店铺站点 MY 的默认语言 |

后置：`api owner@demo.test -X PUT $B/api/v1/reception/prompts -d '{"brandVoice":""}'`。

#### `TC-AI-031` 买家先发商品卡、2 秒后补文字：只出一份影子回复，按那句文字出 — 对应 `REQ-AI-001` · 级别: 回归 · 执行者: 皆可

前置：基线（Demo Shopee SG 为影子模式）；按 §3「知识库 curl 函数」定义 `q`；`say` 同 `TC-AI-030` 前置。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `curl -s -X POST $B/api/mock/sim/create_buyer -H 'Content-Type: application/json' -d '{"platform":"shopee","shopId":"220002","name":"Card Buyer","language":"en"}' \| jq -r .conversationId` 记为 S；`curl -s -X POST $B/api/mock/sim/buyer_product_card -H 'Content-Type: application/json' -d '{"conversationId":"<S>","itemId":"24580022002"}' \| jq -r .ok`；等 2 秒，`say <S> 'Does this tumbler keep drinks cold for 24 hours?'` | 两次都输出 `true` |
| 2 | 等 20 秒，`q "select d.status, m.type, m.text from draft d join message m on m.id = d.trigger_message_id join conversation c on c.id = d.conversation_id where c.external_conversation_id = '<S>'"` | 只有一行：`shadow\|text\|Does this tumbler keep drinks cold for 24 hours?` |
| 3 | `q "select extract(epoch from d.created_at - m.created_at) >= 6 from draft d join message m on m.id = d.trigger_message_id join conversation c on c.id = d.conversation_id where c.external_conversation_id = '<S>'"` | `t`：影子回复在那句文字到达 6 秒之后才生成 |

后置：无。

#### `TC-AI-032` 影子模式下买家只发图片：不出影子回复、不检索、不计用量 — 对应 `REQ-AI-001`、`REQ-KB-006` · 级别: 回归 · 执行者: 皆可

前置：基线（Demo Shopee SG 为影子模式）；`$KB` 已备；`login owner@demo.test`；`kbup owner@demo.test "$KB/保修政策.md"` 等列表显示可用；`curl -s $B/api/dev/knowledge-stub | jq '.lastQuery'` 为 `null` 或 `[]`；`q "select drafts_used from usage_period u join merchant m on m.id = u.merchant_id where m.name = 'Demo Store' order by u.period_start desc limit 1"` 记为 U0。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 同 `TC-AI-031` 第 1 步在 Demo Shopee SG 新建买家 S，`curl -s -X POST $B/api/mock/sim/buyer_image -F conversationId=<S> \| jq -r .ok` | `true` |
| 2 | 等 20 秒，`q "select c.handling_state, c.handoff_reason, (select count(*) from draft d where d.conversation_id = c.id) from conversation c where c.external_conversation_id = '<S>'"` | `awaiting_human\|shadow\|0`：会话进了待认领，没有影子回复 |
| 3 | `curl -s $B/api/dev/knowledge-stub \| jq '.lastQuery'` | 仍为 `null` 或 `[]`：检索服务没有收到请求 |
| 4 | 同前置查用量 | 仍为 U0 |

后置：`kbclear`。

#### `TC-AI-034` 影子模式开段是商品卡、20 秒后才补文字：按这句文字出一份影子回复，之后不再出 — 对应 `REQ-AI-001` · 级别: 回归 · 执行者: 皆可

前置：基线（Demo Shopee SG 为影子模式）；按 §3「知识库 curl 函数」定义 `q`；`say` 同 `TC-AI-030` 前置。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 同 `TC-AI-031` 第 1 步在 Demo Shopee SG 新建买家 S，只发商品卡 `24580022002` | 输出 `true` |
| 2 | 等 20 秒，`q "select c.handling_state, c.handoff_reason, (select count(*) from draft d where d.conversation_id = c.id) from conversation c where c.external_conversation_id = '<S>'"` | `awaiting_human\|shadow\|0`：商品卡没有出影子回复 |
| 3 | `say <S> 'Does this tumbler keep drinks cold for 24 hours?'`，等 20 秒，同 `TC-AI-031` 第 2 步查影子回复 | 只有一行：`shadow\|text\|Does this tumbler keep drinks cold for 24 hours?` |
| 4 | `say <S> 'Thanks!'`，等 20 秒，`q "select count(*) from draft d join conversation c on c.id = d.conversation_id where c.external_conversation_id = '<S>'"` | `1`：本段已有影子回复，不再出 |

后置：无。

#### `TC-AI-033` 每次调用 DeepSeek 记一行日志，不含买家内容 — 对应 `REQ-AI-002` · 级别: 回归 · 执行者: 皆可

前置：基线；`.env` 中 `AI_MODE=deepseek`、`DEEPSEEK_API_KEY` 已按 §3 填好，Worker 的输出写进文件（如 `pnpm worker > $SP_TMP/worker.log 2>&1`，或在运行 `pnpm dev` 的终端里看），重启并通过就绪判定；`say` 同 `TC-AI-030` 前置。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 同 `TC-AI-030` 第 1 步在 Demo Shopee MY 新建买家 B，`say <B> 'Can I return the towel set if the colour is wrong?'` | `true` |
| 2 | 等 30 秒，在 Worker 输出里找含 `"msg":"deepseek call"` 的行 | 至少一行 `"kind":"draft"`，带 `"model"`、`"ms"`、大于 0 的 `"promptTokens"` 与 `"completionTokens"`、`"ok":true`、`"error":null` |
| 3 | 在这些行里找买家原话的片段 `towel set` 与 `colour` | 找不到：日志不含买家内容与提示词 |

后置：`.env` 改回 `AI_MODE=stub`，重启并通过就绪判定。

#### `TC-AI-035` 出稿看到常见问题记录里的买家原话 — 对应 `REQ-CONV-013` · 级别: 回归 · 执行者: 皆可

前置：基线；执行「curl 会话」；按 §3「新建模拟买家」在 Demo Shopee MY（辅助模式）建买家 X，记模拟器会话 ID T。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 按 §3「问过 AI 助手后转人工」对 T 执行，`question` 为「Is the magnetic mount sold separately?」 | 返回 `"ok":true` |
| 2 | 15 秒后看模拟器「AI 替身」面板的最近一次请求（`curl -s $B/api/dev/ai-stub \| jq .lastRequest`） | 请求里的对话按时间排着：`shopee_ai_assistant` 的欢迎语、买家「Is the magnetic mount sold separately?」、`shopee_ai_assistant` 的回答，最后是买家「Chat with shop staff」 |
| 3 | 浏览器以 owner@demo.test 打开买家 X 的会话 | 有一份 AI 草稿；时间线有常见问题记录卡 |

后置：无。

### 订单、售后与开票

#### `TC-ORD-001` 订单镜像与会话右栏 — 对应 `REQ-ORD-001` · 级别: 回归 · 执行者: 皆可

前置：基线；向 Demo Shopee MY 新买家 B 发一条；Nur 对该会话点「认领」并回复一句，记下右栏近 180 天订单数 K。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 模拟器为 B 下单（订单 O，记金额），推进到 SHIPPED | 推送日志新增订单状态与运单号推送，HTTP 200 |
| 2 | 10 秒内看 Nur 的右栏「买家与订单」 | 显示 O：金额与模拟器一致、状态运输中（SHIPPED）、最晚发货时间、物流（承运商、运单号、最新一条轨迹事件） |
| 3 | 看右栏汇总 | 近 180 天订单数为 K + 1，金额合计包含 O |

后置：无。

#### `TC-ORD-002` 立即同步与 60 秒内重复点击限流 — 对应 `REQ-ORD-001` · 级别: 回归 · 执行者: 皆可

前置：基线；以 owner@demo.test 打开 `/orders`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 点「立即同步」 | 提示已开始同步；接口 202，带 `jobIds` |
| 2 | 60 秒内再点一次 | 提示稍后再试；接口 429，`type` 为 `/errors/rate-limited`，带 `Retry-After` 响应头 |

后置：无。

#### `TC-ORD-003` 发货前取消订单 — 对应 `REQ-ORD-002` · 级别: 回归 · 执行者: 皆可

前置：基线；模拟器为 Demo Shopee MY 新买家 B 下单（订单 O，停在 READY_TO_SHIP），以 B 发一条；Nur 对该会话点「认领」并回复一句。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 右栏 O 点「取消订单（买家要求）」 | 对话框有「取消订单」「先不取消」 |
| 2 | 点「取消订单」 | 右栏 O 状态变为已取消；时间线新增一条订单已取消的系统事件 |
| 3 | 看模拟器 O | 状态 CANCELLED |
| 4 | owner 打开 `/settings/audit` | 有一条 Nur Aisyah 取消订单 O 的记录 |

后置：无。

#### `TC-ORD-004` 已发货订单不能取消 — 对应 `REQ-ORD-002` · 级别: 回归 · 执行者: 皆可

前置：基线；模拟器为 Demo Shopee MY 新买家 B 下单（订单 O）并推进到 SHIPPED，以 B 发一条；Nur 对该会话点「认领」并回复一句；`login agent@demo.test`，取 O 的订单 ID。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 看右栏 O | 「取消订单（买家要求）」置灰，悬停说明已发货不可取消 |
| 2 | `api agent@demo.test -X POST $B/api/v1/orders/<O 的 ID>/cancel -H 'Idempotency-Key: tc-ord-004' -d '{"reason":"buyer_request"}'` | 409，`type` 为 `/errors/not-allowed` |
| 3 | 看模拟器 O | 状态仍为 SHIPPED |

后置：无。

#### `TC-ORD-005` 组长按状态筛选订单并导出 — 对应 `REQ-ORD-003` · 级别: 回归 · 执行者: 皆可

前置：基线；模拟器分别为 Demo Shopee MY（停 READY_TO_SHIP）、Demo TikTok MY（停 AWAITING_SHIPMENT）、Demo TikTok TH（停 AWAITING_SHIPMENT）各一个新买家下单；以 lead@demo.test 登录。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `/orders` 状态选「待发货」 | 每行状态为待发货；店铺只有 Demo Shopee MY 与 Demo TikTok MY；有刚下的两单，没有 Demo TikTok TH 那单 |
| 2 | 点「导出」 | 下载 CSV，数据行数与列表总数一致，店铺列只有这两家，状态都是待发货 |
| 3 | 看「售后待处理 N 单，查看工单」并点它 | N 等于这两家店未结的退货退款与取消申请工单数；跳到 `/tickets` 并列出这些工单 |

后置：无。

#### `TC-ORD-006` 订单详情抽屉与员工的订单范围 — 对应 `REQ-ORD-003` · 级别: 回归 · 执行者: 皆可

前置：基线；模拟器为 Demo TikTok TH 新买家下单，owner 在 `/orders` 记下该订单 ID TH1；以 agent@demo.test 登录；`login agent@demo.test`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 打开 `/orders` | 每行店铺都是 Demo Shopee MY |
| 2 | 点任一行 | 打开详情抽屉：订单信息、售后单、关联工单、发票，以及「打开会话」「开票」「取消订单」「建工单」 |
| 3 | `api agent@demo.test $B/api/v1/orders/<TH1>` | 404，`type` 为 `/errors/not-found` |

后置：无。

#### `TC-ORD-007` Shopee 买家取消申请：同意 — 对应 `REQ-ORD-004`、`REQ-TKT-001` · 级别: 回归 · 执行者: 皆可

前置：基线；模拟器为 Demo Shopee MY 新买家 B 下单（订单 O，停 READY_TO_SHIP），记下 O 的最晚发货时间 S。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 模拟器对 O 点「申请取消」 | 模拟器 O 状态为 IN_CANCEL；推送日志 HTTP 200 |
| 2 | owner 打开 `/tickets` | 新增一张「取消申请」工单 T，状态待处理，时限来源为商户时限，截止时间为「现在 + 24 小时」与 S 中较早者 |
| 3 | Nur 在 `/orders` 对 O 点「处理」 | 打开处理取消申请对话框 |
| 4 | 选同意，点「提交」 | 对话框关闭；模拟器 O 变为 CANCELLED |
| 5 | 打开 T | 状态已解决；时间线有平台事件与 Nur Aisyah 的处理记录 |

后置：无。

#### `TC-ORD-008` Shopee 买家取消申请：拒绝 — 对应 `REQ-ORD-004` · 级别: 回归 · 执行者: 皆可

前置：基线；同 `TC-ORD-007` 前置与第 1 步，得到 IN_CANCEL 的订单 O 与工单 T。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | Nur 在 `/orders` 对 O 点「处理」，选拒绝，点「提交」 | 对话框关闭；模拟器 O 回到 READY_TO_SHIP |
| 2 | 打开 T | 状态已解决，阶段为已拒绝 |

后置：无。

#### `TC-ORD-009` 订单已不在 IN_CANCEL 时再提交 — 对应 `REQ-ORD-004` · 级别: 边缘 · 执行者: 皆可

前置：基线；同 `TC-ORD-007` 前置与第 1 步，得到 IN_CANCEL 的订单 O；浏览器 A 以 agent@demo.test、浏览器 B 以 lead@demo.test 各自在 `/orders` 对 O 点「处理」打开对话框。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | B：选同意，点「提交」 | 模拟器 O 变为 CANCELLED |
| 2 | A：选拒绝，点「提交」 | 对话框提示订单已不在取消申请中；接口 409，`type` 为 `/errors/not-allowed`；模拟器 O 仍为 CANCELLED |

后置：无。

#### `TC-ORD-010` TikTok 买家取消申请：同意 — 对应 `REQ-ORD-004` · 级别: 回归 · 执行者: 皆可

前置：基线；模拟器为 Demo TikTok MY 新买家下单（订单 O，停 AWAITING_SHIPMENT），对 O 点「申请取消」；以 lead@demo.test 登录。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 打开 `/tickets` | 新增一张「取消申请」工单 T，状态待处理，时限来源平台 |
| 2 | `/orders` 对 O 点「处理」，选同意，点「提交」 | 模拟器中该取消单状态为 CANCELLATION_REQUEST_SUCCESS，订单 O 为 CANCELLED |
| 3 | 打开 T | 状态已解决 |

后置：无。

#### `TC-ORD-011` TikTok 拒绝退货并选平台原因 — 对应 `REQ-ORD-005` · 级别: 回归 · 执行者: 皆可

前置：基线；模拟器为 Demo TikTok MY 新买家下单（订单 O）并推进到 DELIVERED，对 O 点「申请退货」；以 lead@demo.test 登录，在 `/tickets` 找到新建的「退货退款」工单 T。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 打开 T，点「处理申请」 | 弹层有「同意退货 / 拒绝」与平台截止倒计时 |
| 2 | 选「拒绝」，点「选择原因」 | 下拉列出平台返回的原因，与 `GET /api/v1/after-sales/<ID>/reject-reasons` 一致（模拟平台为 3 项英文原因，含「Product was used or damaged by the buyer」） |
| 3 | 选「Product was used or damaged by the buyer」，点「提交处理」 | 弹层关闭；模拟器退货单状态为 REFUND_OR_RETURN_REQUEST_REJECT |
| 4 | 刷新 T | 状态已解决，阶段为已关闭 |

后置：无。

#### `TC-ORD-012` Shopee 退货发起争议 — 对应 `REQ-ORD-005` · 级别: 回归 · 执行者: 皆可

前置：基线；模拟器为 Demo Shopee MY 新买家 B 下单并推进到 COMPLETED，对该单点「申请退货」（退货单 REQUESTED），以 B 发一条；Nur 对该会话点「认领」并回复一句；owner 在 `/tickets` 找到新建的「退货退款」工单 T。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | Nur 在右栏点「处理申请」 | 弹层只有「同意退款」与「发起争议」两种处理 |
| 2 | 选「发起争议」，先不选原因点「提交处理」；再选争议原因第一项，点「提交处理」 | 第一次提示「请选择争议原因」、不发请求；第二次弹层关闭，模拟器退货单状态 JUDGING |
| 3 | 刷新 T | 状态「等待中 · 等平台」 |

后置：无。

#### `TC-ORD-013` Shopee 同意退款后不能再发起争议 — 对应 `REQ-ORD-005` · 级别: 回归 · 执行者: 皆可

前置：基线；同 `TC-ORD-012` 前置得到 REQUESTED 退货单与工单 T；`login owner@demo.test`、`login agent@demo.test`，从 `api owner@demo.test $B/api/v1/tickets/<T>` 的 `links.afterSaleId` 取售后单 ID A（T 的负责人不是 Nur，Nur 读不到这张工单）。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | Nur 点「处理申请」，选「同意退款」，点「提交处理」 | 模拟器退货单状态 ACCEPTED；T 变为已解决 |
| 2 | 再打开「处理申请」 | 「发起争议」不可用 |
| 3 | `api agent@demo.test -X POST $B/api/v1/after-sales/<A>/return-decision -H 'Idempotency-Key: tc-ord-013' -d '{"decision":"dispute"}'` | 409，`type` 为 `/errors/not-allowed` |

后置：无。

#### `TC-ORD-014` TikTok 收货后拒收进入平台仲裁 — 对应 `REQ-ORD-005` · 级别: 边缘 · 执行者: 皆可

前置：基线；同 `TC-ORD-011` 前置得到退货工单 T；Arif 在 T「处理申请」选「同意退货」提交；模拟器对该退货点「买家寄回」。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 刷新 T | 状态「处理中 · 待验货」 |
| 2 | 「处理申请」选「拒收」，选原因第一项，点「提交处理」 | 模拟器退货单状态 REJECT_RECEIVE_PACKAGE；T 为「等待中 · 等平台」，阶段平台仲裁中 |
| 3 | 模拟器对该退货点「平台仲裁」并判买家胜 | T 变为已解决 |

后置：无。

#### `TC-ORD-015` 开票并经聊天与邮件两路发送 — 对应 `REQ-ORD-006` · 级别: 冒烟 · 执行者: 皆可

前置：基线；模拟器为 Demo Shopee MY 新买家 B 下单（订单 O），以 B 发一条；Nur 对该会话点「认领」并回复一句。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 右栏点「开 Invoice / Receipt」 | 弹层类型为 Invoice，订单 O 与商品行已预填 |
| 2 | 填抬头「Demo Buyer Sdn Bhd」、地址「1 Jalan Demo, Kuala Lumpur」、邮箱 invoice1@demo.test，保持发送到聊天与发送邮件都勾选，点「生成并发送」 | 弹层关闭；页面显示发票号，格式为 `INV-<当年>-` 加 6 位数字 |
| 3 | 看模拟器 B 的买家视图 | 收到一张发票图片 |
| 4 | 打开 `/dev/outbox` | 有一封发往 invoice1@demo.test、模板 `invoice` 的邮件，带 PDF 附件，主题或正文含该发票号 |
| 5 | 打开 `/orders/invoices` | 该发票一行：聊天「已发送」、邮件「已发送」 |
| 6 | 点该行「PDF」 | 下载到 `application/pdf` 文件，内容含该发票号与抬头 |

后置：无（`TC-ORD-016` 承接）。

#### `TC-ORD-016` 发票邮件退信自动建工单，重发后恢复 — 对应 `REQ-ORD-006` · 级别: 回归 · 执行者: 皆可

前置：先执行 `TC-ORD-015`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `/dev/outbox` 对那封发票邮件点「标记退信」 | 邮件状态显示退信 |
| 2 | 刷新 `/orders/invoices` | 该发票邮件状态为退信，发送一栏有「工单 T-<编号>」入口 |
| 3 | 点「工单 T-<编号>」 | 进入一张「开票」工单，来源为规则，关联订单 O |
| 4 | 回到发票记录点「重发」 | 发件箱新增一封发往 invoice1@demo.test 的发票邮件；该发票邮件状态回到已发送 |

后置：无。

#### `TC-ORD-017` Receipt 只发邮件 — 对应 `REQ-ORD-006` · 级别: 回归 · 执行者: 皆可

前置：基线；同 `TC-ORD-015` 前置。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 「开 Invoice / Receipt」切到 Receipt，取消「发送到聊天」，填抬头「Receipt Buyer」、地址「1 Jalan Test」、邮箱 receipt1@demo.test，点「生成并发送」 | 发票号格式为 `RCT-<当年>-` 加 6 位数字 |
| 2 | 看模拟器买家视图与 `/dev/outbox` | 买家视图没有发票图片；发件箱有发往 receipt1@demo.test 的发票邮件 |
| 3 | 打开 `/orders/invoices` | 该行聊天为未发送（跳过），邮件「已发送」 |

后置：无。

#### `TC-ORD-018` 没有会话或没有邮箱时的开票限制 — 对应 `REQ-ORD-006` · 级别: 边缘 · 执行者: 皆可

前置：基线；以 agent@demo.test 打开 `/orders`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 点「新建发票」，选一张 Demo Shopee MY 订单（其买家的会话不在 Nur 名下或没有会话） | 「发送到聊天」不可勾选，旁边写明原因（「这张订单没有关联会话」或「认领这个会话后才能发到聊天」） |
| 2 | 填抬头「No Mail Buyer」、地址「1 Jalan Test」，邮箱留空，点「生成并发送」 | 发票生成；发票记录该行聊天与邮件都为未发送（跳过） |
| 3 | 对该行点「重发」 | 提示没有邮箱；接口 409，`type` 为 `/errors/not-allowed` |

后置：无。

#### `TC-ORD-019` 发票聊天发送失败时如实记录 — 对应 `REQ-ORD-006` · 级别: 边缘 · 执行者: 皆可

前置：基线；同 `TC-ORD-015` 前置；模拟器「故障注入」设 Demo Shopee MY 下一次卖家发送返回平台错误。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 按 `TC-ORD-015` 第 1–2 步开票并「生成并发送」 | 弹层关闭或提示聊天发送失败；发票号已生成 |
| 2 | 打开 `/orders/invoices` | 该行聊天「失败」并显示原因，邮件「已发送」；「PDF」可下载 |
| 3 | 看模拟器买家视图 | 没有发票图片 |

后置：无。

#### `TC-ORD-020` 发票 PDF 与聊天图片内容一致 — 对应 `REQ-ORD-006` · 级别: 回归 · 执行者: 人工

前置：先执行 `TC-ORD-015`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 并排查看下载的 PDF 第 1 页与模拟器收到的发票图片 | 两者版式与内容一致：发票号、抬头、地址、商品行、小计、税额、合计、币种；中文与马来文字符显示完整无乱码 |

后置：无。


#### `TC-ORD-021` 会话里开票只能选本买家的订单 — 对应 `REQ-ORD-006` · 级别: 回归 · 执行者: 皆可

前置：基线；按 §3「模拟器发消息」向 Demo Shopee MY 新买家 B1 发一条（B1 没有订单），Nur 对 B1 的会话点「认领」并回复一句，记会话 ID C1；模拟器为另一新买家 B2 下单，记 Shopilot 里的订单 ID O2（`GET /api/v1/orders?q=<O2 的订单号>`）；`login agent@demo.test`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | Nur 在 C1 右栏点「开 Invoice / Receipt」 | 订单选择里没有别的买家的订单，说明这个买家近 180 天没有订单 |
| 2 | `api agent@demo.test -X POST $B/api/v1/invoices -H 'Idempotency-Key: tc-ord-021' -d '{"kind":"invoice","conversationId":"<C1>","orderId":"<O2>","fields":{"buyerName":"x","address":"x","items":[{"name":"x","qty":1,"unitPrice":"1.00"}],"currency":"MYR"},"sendToChat":true,"sendEmail":false}'` | 409，`type` 为 `/errors/conflict`，`detail` 写明订单不属于当前会话的买家；模拟器 B1 的买家视图没有新图片 |

后置：无。

#### `TC-ORD-027` 已结束的 TikTok 售后单取拒绝原因直接 409 — 对应 `REQ-ORD-005` · 级别: 回归 · 执行者: 皆可 · 源自缺陷 2026-10-16 已结束的售后单请求拒绝原因返回 502

前置：基线；模拟器为 Demo TikTok MY 新买家下单（订单 O，停 AWAITING_SHIPMENT），对 O 点「申请取消」；lead@demo.test 在 `/orders` 对 O 点「处理」，选同意，点「提交」（模拟器里该取消单为 CANCELLATION_REQUEST_SUCCESS）；`login lead@demo.test`；`q "select id from after_sale where external_order_id = '<O>' and kind = 'cancel'"` 记为 A。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `api lead@demo.test $B/api/v1/after-sales/<A>` | `platformStatus` 为 `CANCELLATION_REQUEST_SUCCESS`；`actions` 里 `reject` 的 `allowed` 为 false |
| 2 | `api lead@demo.test $B/api/v1/after-sales/<A>/reject-reasons` | `HTTP 409`，`type` 为 `/errors/not-allowed`，`code` 为 `aftersale_state`，`detail` 写明这张售后单已结束 |
| 3 | 看 `pnpm dev` 终端里第 2 步那次请求前后的输出 | 没有 `reject_reasons` 的 `platform call` 行；该请求的日志行 `level` 为 `info`、`status` 为 409 |

后置：无。

### 工单

#### `TC-TKT-001` TikTok 退货：自动建单、同意退货、按平台事件推进到解决 — 对应 `REQ-TKT-001`、`REQ-ORD-005` · 级别: 冒烟 · 执行者: 皆可

前置：基线；模拟器为 Demo TikTok MY 新买家 B 下单（订单 O）并推进到 DELIVERED（B 没有会话）；以 lead@demo.test 登录。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 模拟器对 O 点「申请退货」 | 推送日志新增 TikTok webhook type 12，HTTP 200 |
| 2 | 打开 `/tickets` | 新增一张工单 T：类型退货退款，状态待处理，时限来源平台，显示剩余时间，负责人 Arif Rahman；记下截止时间 D1 |
| 3 | 打开 T，点「处理申请」，选「同意退货」，点「提交处理」 | 弹层关闭；T 状态「等待中 · 等买家」；模拟器退货单为 AWAITING_BUYER_SHIP |
| 4 | 模拟器对该退货点「买家寄回」，刷新 T | T 状态「处理中 · 待验货」，截止时间与 D1 不同 |
| 5 | 「处理申请」选「收货后同意退款」，点「提交处理」 | 模拟器退货单为 RETURN_OR_REFUND_REQUEST_COMPLETE；刷新后 T 为已解决 |
| 6 | 看 T 的时间线 | 依次有：平台事件建单、Arif Rahman 同意退货、平台事件 · 等买家寄回、平台事件 · 待验货、Arif Rahman 收货后同意退款、平台事件 · 退款完成；人工动作来源标「页面」，平台事件来源标「平台」 |

后置：无。

#### `TC-TKT-002` 退货工单负责人为会话认领人 — 对应 `REQ-TKT-001` · 级别: 回归 · 执行者: 皆可

前置：基线；按 §3「固定为工作时间内」；模拟器为 Demo TikTok MY 新买家 B 下单并推进到 DELIVERED，以 B 发一条；owner 对该会话点「认领」并回复一句。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 模拟器对该单点「申请退货」 | 推送日志 HTTP 200 |
| 2 | owner 打开 `/tickets` | 新的退货退款工单负责人为林晓；B 的会话行显示该工单号 |

后置：无。

#### `TC-TKT-003` 平台驱动工单不能手动改状态 — 对应 `REQ-TKT-001`、`REQ-TKT-003` · 级别: 回归 · 执行者: 皆可

前置：基线；按 `TC-TKT-001` 前置与第 1–2 步得到待处理的退货工单 T；`login lead@demo.test`，`GET /api/v1/tickets/<T>` 记 version。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 打开 `/tickets/board` | T 的卡片有锁图标，没有「改状态」菜单 |
| 2 | 打开 T 的详情 | 「由平台事件关闭」置灰，悬停说明原因 |
| 3 | `api lead@demo.test -X POST $B/api/v1/tickets/<T>/status -d '{"status":"resolved","version":<version>}'` | 409，`type` 为 `/errors/not-allowed` |

后置：无。

#### `TC-TKT-004` Shopee 物流异常自动建单并手动推进 — 对应 `REQ-TKT-001`、`REQ-TKT-003` · 级别: 回归 · 执行者: 皆可

前置：基线；模拟器为 Demo Shopee MY 新买家下单（订单 O，停 READY_TO_SHIP），记 O 的最晚发货时间 S；以 lead@demo.test 登录。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 模拟器把 O 推进到 RETRY_SHIP | 推送日志 HTTP 200 |
| 2 | 打开 `/tickets` | 新增一张「物流异常」工单，关联 O，状态待处理，截止时间为 S |
| 3 | 打开 `/tickets/board`，在该工单卡片「改状态」选「处理中」 | 卡片没有锁图标；移到处理中列；时间线新增一条状态变更（Arif Rahman，来源页面） |
| 4 | 在该卡片「改状态」选「已解决」 | 工单状态为已解决 |

后置：无。

#### `TC-TKT-005` 关闭自动建单后平台事件不再建单 — 对应 `REQ-TKT-001`、`REQ-RCP-004` · 级别: 边缘 · 执行者: 皆可

前置：基线；owner 在 `/reception/tickets` 关掉「退货退款 自动建单」，点「保存」；在 `/tickets` 记下退货退款工单数 R。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 模拟器为 Demo TikTok MY 新买家下单，推进到 DELIVERED，点「申请退货」 | 推送日志 HTTP 200 |
| 2 | owner 刷新 `/tickets`，类型筛「退货退款」 | 数量仍为 R |

后置：无。

#### `TC-TKT-006` 手动建单按退货单去重 — 对应 `REQ-TKT-002` · 级别: 回归 · 执行者: 皆可

前置：基线；按 `TC-TKT-001` 前置与第 1–2 步得到退货工单 T；以 B 在模拟器发一条，Arif 对该会话点「认领」并回复一句。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | Arif 在右栏点「建工单」，类型退货退款，选同一退货单，点「建工单」 | 弹层提示已有同一工单，并给出「打开 T」链接；接口 409，`type` 为 `/errors/duplicate`，响应带已有工单号 |
| 2 | 点「打开 T」 | 进入 T 的详情 |

后置：无。

#### `TC-TKT-007` 员工建内部确认工单，负责人固定为本人 — 对应 `REQ-TKT-002` · 级别: 回归 · 执行者: 皆可

前置：基线；向 Demo Shopee MY 新买家发一条，Nur 对该会话点「认领」并回复一句；`login agent@demo.test`，取 Demo Shopee MY 店铺 ID S，从 `GET /api/v1/members/options?shopId=<S>` 取 Mei Lin 的 membershipId M。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 右栏点「建工单」，类型选「内部确认」 | 负责人显示只读的「Nur Aisyah（本人）」，并提示「员工建的工单只能由自己负责」，没有可改的下拉 |
| 2 | 点「建工单」，打开新工单 | 负责人 Nur Aisyah，时限来源商户，截止时间为按 `/reception/hours` 排班推算的 1 个工作日后 |
| 3 | `api agent@demo.test -X POST $B/api/v1/tickets -d '{"type":"internal","shopId":"<S>","assigneeId":"<M>"}'` | 403，`type` 为 `/errors/forbidden`，`code` 为 `assignee_not_allowed` |

后置：无。

#### `TC-TKT-008` 组长建单并指定负责人 — 对应 `REQ-TKT-002` · 级别: 回归 · 执行者: 皆可

前置：基线；以 lead@demo.test 登录；Nur 记下通知条数。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `/tickets` 点「新建工单」，类型「开票」，店铺 Demo Shopee MY，负责人下拉选 Nur Aisyah，点「建工单」 | 新工单负责人为 Nur Aisyah，时限来源商户 |
| 2 | Nur 打开通知弹层 | 新增 1 条工单指派给我的通知 |

后置：无。

#### `TC-TKT-009` 订单号加类型去重，已解决后可再建，无订单的手动类不去重 — 对应 `REQ-TKT-002` · 级别: 边缘 · 执行者: 皆可

前置：基线；模拟器为 Demo Shopee MY 新买家下单（订单 O），以该买家发一条，Nur 对该会话点「认领」并回复一句。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 「建工单」类型「缺货 / 到货跟进」，关联 O | 建成工单 T1 |
| 2 | 再建同类型、同订单的工单 | 409，`type` 为 `/errors/duplicate`，弹层链到 T1 |
| 3 | 在看板把 T1 改为「已解决」，再建同类型、同订单的工单 | 建成新工单 T2 |
| 4 | 不关联订单连建两张「内部确认」 | 两张都建成，编号不同 |

后置：无。

#### `TC-TKT-010` 员工只看到指派给自己的工单 — 对应 `REQ-TKT-003` · 级别: 回归 · 执行者: 皆可

前置：基线；owner 在 `/tickets`「新建工单」建两张「内部确认」（店铺 Demo Shopee MY），负责人分别为 Nur Aisyah（T1）与 Mei Lin（T2）；`login agent@demo.test`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | Nur 打开 `/tickets` | 有 T1，没有 T2；没有「我的 / 全部」切换 |
| 2 | `api agent@demo.test "$B/api/v1/tickets?scope=all"` | 200，`items` 的负责人都是 Nur Aisyah，不含 T2 |
| 3 | `api agent@demo.test $B/api/v1/tickets/<T2 的 ID>` | 404，`type` 为 `/errors/not-found` |

后置：无。

#### `TC-TKT-011` 员工在看板改手动工单的状态 — 对应 `REQ-TKT-003` · 级别: 回归 · 执行者: 皆可

前置：基线；同 `TC-TKT-010` 前置得到 T1。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | Nur 打开 `/tickets/board`，在 T1 卡片「改状态」选「等待中 · 等内部」 | T1 卡片移到等待中列 |
| 2 | 打开 T1 详情 | 时间线新增一条状态变更：操作人 Nur Aisyah，来源页面，等待对象内部 |

后置：无。

#### `TC-TKT-012` 组长作废与改单张时限，员工调这两个接口被拒 — 对应 `REQ-TKT-003` · 级别: 回归 · 执行者: 皆可

前置：基线；同 `TC-TKT-010` 前置得到 T1、T2；`login agent@demo.test`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | Arif 打开 T2，点「作废」并填原因「重复建单」 | T2 状态已作废 |
| 2 | Arif 打开 T1，把时限改为后天 18:00（与建单默认的明天 18:00 不同） | T1 截止时间为后天 18:00；时间线有一条时限变更 |
| 3 | owner 打开 `/settings/audit` 模块工单 | 有 Arif Rahman 作废 T2 与改 T1 时限两条记录 |
| 4 | `api agent@demo.test -X POST $B/api/v1/tickets/<T1>/void -d '{"reason":"x"}'` | 403，`type` 为 `/errors/forbidden` |
| 5 | `api agent@demo.test -X PATCH $B/api/v1/tickets/<T1>/due -d '{"dueAt":"2030-01-01T10:00:00+08:00"}'` | 403，`type` 为 `/errors/forbidden` |

后置：无。

#### `TC-TKT-013` 工单备注与改派 — 对应 `REQ-TKT-003` · 级别: 回归 · 执行者: 皆可

前置：基线；同 `TC-TKT-010` 前置得到 T1；Mei 记下通知条数。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | Nur 打开 T1，点「加备注」写「已联系仓库」 | 时间线新增备注，操作人 Nur Aisyah |
| 2 | Arif 打开 T1，展开负责人下拉 | 只列负责 Demo Shopee MY 的启用成员与管理员：Arif Rahman、Nur Aisyah、Mei Lin、林晓、陈卓 |
| 3 | 选 Mei Lin | 负责人变为 Mei Lin；时间线有改派记录 |
| 4 | Mei 打开通知弹层 | 新增 1 条 T1 指派给我的通知 |

后置：无。

#### `TC-TKT-014` 工单筛选与导出 CSV — 对应 `REQ-TKT-003` · 级别: 回归 · 执行者: 皆可

前置：基线；以 owner@demo.test 打开 `/tickets` 并切到「全部」。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 类型选「内部确认」 | 每行类型为内部确认 |
| 2 | 类型改回全部，状态选「等待中」，平台选 Shopee | 每行状态为等待中、平台为 Shopee |
| 3 | 点「导出」 | 下载 CSV，数据行与当前列表一致，含时限来源与平台原始状态两列 |

后置：无。

#### `TC-TKT-015` 非法迁移、平台时限不可改与版本冲突 — 对应 `REQ-TKT-003` · 级别: 边缘 · 执行者: 皆可

前置：基线；同 `TC-TKT-010` 前置得到 T1，Nur 在看板把 T1 改为「已解决」；按 `TC-TKT-001` 前置与第 1–2 步得到平台类工单 T；`login lead@demo.test`，分别取 T1、T 的 version。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `api lead@demo.test -X POST $B/api/v1/tickets/<T1>/status -d '{"status":"in_progress","version":<T1 version>}'` | 409，`type` 为 `/errors/not-allowed` |
| 2 | `api lead@demo.test -X POST $B/api/v1/tickets/<T1>/void -d '{"reason":"x"}'` | 409，`type` 为 `/errors/not-allowed` |
| 3 | `api lead@demo.test -X PATCH $B/api/v1/tickets/<T>/due -d '{"dueAt":"2030-01-01T10:00:00+08:00"}'` | 409，`type` 为 `/errors/not-allowed` |
| 4 | 新建一张内部确认 T3，先把它改为 in_progress（version 变为 2），再用 version 1 请求改为 resolved | 409，`type` 为 `/errors/conflict` |

后置：无。

#### `TC-TKT-016` 到期前提醒负责人一次 — 对应 `REQ-TKT-004` · 级别: 回归 · 执行者: 皆可

前置：基线；终端执行 `pnpm scenario ticket-due-soon`，记工单号 T；以 lead@demo.test 登录，记下侧栏「工单」徽标数 n 与通知条数。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 执行 `pnpm job ticket.scan`，Arif 刷新页面 | 通知新增 1 条 T 即将到期；侧栏工单徽标仍为 n（徽标按「6 小时内到期 + 已超时」计，T 建单时已计入） |
| 2 | 再执行 `pnpm job ticket.scan` | Arif 的通知没有新增 |

后置：无。

#### `TC-TKT-017` 超时标记并通知负责人与组长 — 对应 `REQ-TKT-004` · 级别: 回归 · 执行者: 皆可

前置：基线；终端执行 `pnpm scenario ticket-overdue`，记工单号 T；Nur、Arif 记下通知条数。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 执行 `pnpm job ticket.scan` | 命令退出码为 0 |
| 2 | Arif 打开 `/tickets` | T 的行标超时 |
| 3 | Nur 与 Arif 打开通知弹层 | 各新增 1 条 T 已超时的通知 |
| 4 | 再执行 `pnpm job ticket.scan` | 两人都没有新增 |

后置：无。

#### `TC-TKT-018` 已解决 N 天后自动关闭 — 对应 `REQ-TKT-004` · 级别: 回归 · 执行者: 皆可

前置：基线（自动关闭为默认 7 天）；终端执行 `pnpm scenario ticket-resolved-8d`，记工单号 T。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 执行 `pnpm job ticket.auto_close`，owner 打开 T | 状态已关闭；时间线有一条自动关闭记录 |

后置：无。

#### `TC-TKT-019` 跨班交接自动建单 — 对应 `REQ-TKT-005` · 级别: 回归 · 执行者: 皆可

前置：基线；终端执行 `pnpm scenario handover-candidate`，记会话 C。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 执行 `pnpm job handover.scan`，owner 打开 `/tickets` | 新增一张「跨班交接」工单，关联 C，负责人 Arif Rahman，截止时间为下个工作时段开始后 1 小时 |
| 2 | 再执行 `pnpm job handover.scan` | 没有新增跨班交接工单 |

后置：无。

#### `TC-TKT-020` 工单页与看板对照原型 — 对应 `REQ-TKT-003` · 级别: 回归 · 执行者: 人工

前置：基线；导出 Quilt 原型；以 owner@demo.test 登录。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 对照原型 `/tickets`、`/tickets/board`、`/tickets/siti`、`/wb/ticket` | 布局、配色、文案、按钮位置一致；平台驱动卡片的锁图标与置灰提示可辨认；差异逐条截图记入证据目录 |

后置：无。

#### `TC-TKT-021` 把工单转发到飞书群 — 对应 `REQ-TKT-006` · 级别: 回归 · 执行者: 皆可

前置：基线；按 §3「连上飞书替身」；模拟器为 Demo Shopee MY 新买家下单（订单 O），先推进到 PROCESSED，再推进到 RETRY_SHIP（模拟平台不允许从 READY_TO_SHIP 直接到 RETRY_SHIP），`/tickets` 出现关联 O 的「物流异常」工单，记为 K；`q "select id from merchant where name = 'Demo Store'"` 记为 DM；浏览器以 owner@demo.test 登录，打开 `/tickets/<K>`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 页头点「转发到飞书」 | 弹窗列出「Shopilot 客服群（替身）」「售后处理群（替身）」「泰国站客服（替身）」，已预选「Shopilot 客服群（替身）」，标「默认群」 |
| 2 | 备注填「请仓库核对」，点发送 | 提示已转发；时间线新增「林晓 转发到飞书 · Shopilot 客服群（替身）」，带备注 |
| 3 | 打开 `/dev/outbox?tab=feishu`，看最新一张卡 | 标题为「工单 <K 的编号> · 物流异常 - 订单需要重新发货」；正文有订单号 O、店铺 Demo Shopee MY、商品名与规格、数量、备注「请仓库核对」；按钮「在 Shopilot 打开」的链接以 `/tickets/<K>?m=<DM>` 结尾，另有「打开卖家后台订单」 |
| 4 | 刷新工单页 | 时间线那条转发记录不再显示「发送中」 |

后置：重建基线（场景连了飞书）。

#### `TC-TKT-022` 没连飞书时不能转发 — 对应 `REQ-TKT-006` · 级别: 回归 · 执行者: 皆可

前置：基线（两个商户都没有连飞书）；执行「curl 会话」，`login owner@demo.test`；`api owner@demo.test "$B/api/v1/tickets?scope=all"` 取第一张工单 K；浏览器以 owner@demo.test 打开 `/tickets/<K>`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 看页头「转发到飞书」，鼠标移上去 | 按钮不可用；提示写还没有连接飞书，请管理员在「商户设置 → 通知」连接后再转发 |
| 2 | `api owner@demo.test "$B/api/v1/tickets/<K>/feishu"` | `HTTP 409`，`code` 为 `feishu_unavailable` |
| 3 | `api owner@demo.test -X POST "$B/api/v1/tickets/<K>/feishu" -d '{"chatId":"oc_stub_service"}'` | `HTTP 409`，`code` 为 `feishu_unavailable` |

后置：无。

#### `TC-TKT-023` 工单卡链接带商户参数时先切商户 — 对应 `REQ-TKT-006` · 级别: 回归 · 执行者: 皆可

前置：基线；执行「curl 会话」，`login agent@demo.test`；`api agent@demo.test "$B/api/v1/me"` 记 Demo Store 的商户 ID DM、Other Store 的 OM；`api agent@demo.test -X POST $B/api/v1/me/active-merchant -d '{"merchantId":"<OM>"}'`，`api agent@demo.test "$B/api/v1/tickets?scope=all"` 取第一张工单 K2，再切回 DM；浏览器以 agent@demo.test 登录（当前商户 Demo Store）。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 打开 `/tickets/<K2>?m=<OM>` | 提示已切换到 Other Store，随后显示工单 K2；地址里的 `m` 参数已去掉；顶栏商户为 Other Store |
| 2 | 再打开同一链接 | 不再提示切换，直接显示 K2，地址去掉 `m` |
| 3 | 另开一个浏览器上下文，以 lead@demo.test（只在 Demo Store）登录后打开同一链接 | 显示「看不到这张工单」与「返回工单列表」；当前商户仍是 Demo Store |

后置：`api agent@demo.test -X POST $B/api/v1/me/active-merchant -d '{"merchantId":"<DM>"}'`。

#### `TC-TKT-024` 工单页的平台状态与异常说明显示中文 — 对应 `REQ-TKT-003` · 级别: 回归 · 执行者: 皆可

前置：基线；同 `TC-TKT-021` 前置造一张关联订单 O 的「物流异常」工单 K；浏览器以 owner@demo.test 打开 `/tickets/<K>`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 看「进度」区 | 平台状态显示「需重新发货」，说明显示「订单需要重新发货」 |
| 2 | 看时间线与右侧「关联」里的订单 | 订单状态显示中文；整页找不到 `RETRY_SHIP` |

后置：无。

### 接待设置

#### `TC-RCP-001` TikTok 店改为 auto 并留痕，下一条入站起生效 — 对应 `REQ-RCP-001` · 级别: 回归 · 执行者: 皆可

前置：基线；按 §3「固定为工作时间内」；以 owner@demo.test 打开 `/reception`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 把 Demo TikTok MY 的工作时间内改为 auto，点「保存」 | 提示已保存，并说明下一条入站消息起生效 |
| 2 | 打开 `/settings/audit` 模块接待设置 | 有一条林晓修改 Demo TikTok MY 接待模式的记录 |
| 3 | 向 Demo TikTok MY 新买家发「我的包裹到哪了」 | 20 秒内模拟器该买家的买家视图收到 AI 回复 |

后置：无。

#### `TC-RCP-002` Shopee 店不能设为 auto — 对应 `REQ-RCP-001` · 级别: 回归 · 执行者: 皆可

前置：基线；以 owner@demo.test 打开 `/reception`；`login owner@demo.test`，取 Demo Shopee MY 的店铺 ID S。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 看 Demo Shopee MY 的模式选项 | auto 置灰，悬停或点击显示「Shopee 平台规则禁止 chatbot 回复，评审前不开放」 |
| 2 | `api owner@demo.test -X PUT $B/api/v1/reception/modes -d '{"shops":[{"shopId":"<S>","modeInHours":"auto","modeOffHours":"assist"}]}'` | 409，`type` 为 `/errors/not-allowed` |
| 3 | 刷新 `/reception` | Demo Shopee MY 仍为 assist / assist |

后置：无。

#### `TC-RCP-003` TikTok 店设为 off 时同步关闭坐席接单 — 对应 `REQ-RCP-001` · 级别: 回归 · 执行者: 皆可

前置：基线；模拟器显示 Demo TikTok MY 坐席接单为 true；以 owner@demo.test 打开 `/reception`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 把 Demo TikTok MY 工作时间内、外都改为 off，点「保存」 | 提示已保存 |
| 2 | 刷新模拟器 | Demo TikTok MY 坐席接单为 false |

后置：无。

#### `TC-RCP-004` 转人工关键词最多 30 个 — 对应 `REQ-RCP-002` · 级别: 回归 · 执行者: 皆可

前置：基线；以 owner@demo.test 打开 `/reception/hours`；`login owner@demo.test`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 看关键词区 | 默认 7 个：转人工、投诉、退款、人工客服、refund、complaint、human |
| 2 | 逐个添加 kw08 到 kw30，点「保存」 | 共 30 个，保存后刷新仍为 30 个 |
| 3 | 再输入 kw31 | 「添加」不可用，提示最多 30 个 |
| 4 | 用 api `PUT /api/v1/reception/hours` 提交 31 个关键词（其余字段取自 `GET /api/v1/reception`） | 422，`type` 为 `/errors/validation` |
| 5 | 同上提交 30 个，其中一个为 41 个字 | 422，`type` 为 `/errors/validation` |

后置：无。

#### `TC-RCP-005` 休息日与节假日按工作时间外的模式处理 — 对应 `REQ-RCP-002` · 级别: 回归 · 执行者: 皆可

前置：基线（Demo TikTok MY 为 assist / auto）。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 按 §3「固定为工作时间外」（今天设为不工作），向 Demo TikTok MY 新买家发一条 | 20 秒内模拟器买家视图收到 AI 回复（按工作时间外的 auto） |
| 2 | 按 §3「固定为工作时间内」，再「添加节假日」选今天并保存；向另一新买家发一条 | 20 秒内收到 AI 回复（节假日按工作时间外） |
| 3 | 删除今天的节假日并保存；向第三个新买家发一条 | 模拟器买家视图没有卖家回复；Arif 的「AI 草稿」出现该会话（工作时间内的 assist） |

后置：无。

#### `TC-RCP-006` 置信度阈值的边界 — 对应 `REQ-RCP-002` · 级别: 边缘 · 执行者: 皆可

前置：基线；以 owner@demo.test 打开 `/reception/hours`；`login owner@demo.test`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 置信度阈值设 0.95 保存；替身保持默认（0.85）；向 Demo Shopee MY 新买家发一条 | 没有草稿，会话进待认领，原因置信度低 |
| 2 | 阈值设 0.50 保存；替身设「低置信 0.4」；向新买家发一条 | 没有草稿，原因置信度低 |
| 3 | 阈值保持 0.50；替身默认；向新买家发一条 | 出现草稿 |
| 4 | 用 api 分别提交阈值 0.49 与 0.96 | 都是 422，`type` 为 `/errors/validation` |

后置：无。

#### `TC-RCP-007` 接待时限与待认领提醒的取值校验 — 对应 `REQ-RCP-002` · 级别: 边缘 · 执行者: 皆可

前置：基线；`login owner@demo.test`；从 `GET /api/v1/reception` 取当前设置作为请求体底稿。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `PUT /api/v1/reception/hours`，`responseSlaMinutes` 为 4 | 422 |
| 2 | `responseSlaMinutes` 为 121 | 422 |
| 3 | `responseSlaMinutes` 为 120 | 200 |
| 4 | `unclaimedRemindMinutes` 为 7 | 422 |
| 5 | 浏览器打开 `/reception/hours` 展开待认领提醒下拉 | 只有 5 分钟、10 分钟、15 分钟、不提醒四项 |

后置：无。

#### `TC-RCP-008` 提示词版本与恢复默认，护栏只读 — 对应 `REQ-RCP-003` · 级别: 回归 · 执行者: 皆可

前置：基线；以 owner@demo.test 打开 `/reception/prompts`，记下售前提示词的默认正文 P0。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 售前改为「售前版本 A」保存；再改为「售前版本 B」保存 | 售前的版本列表有 A、B 两条，带保存时间 |
| 2 | 点售前的「恢复默认」 | 售前正文回到 P0，标为默认；版本列表仍有 A、B |
| 3 | 看护栏段与未确认阶段 | 护栏段只读，不能编辑；未确认阶段显示固定正文，不能编辑 |

后置：无。

#### `TC-RCP-009` 提示词长度上限与只保留最近 10 个版本 — 对应 `REQ-RCP-003` · 级别: 边缘 · 执行者: 皆可

前置：基线；以 owner@demo.test 打开 `/reception/prompts`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 售中正文粘贴 6,001 个字，点「保存」 | 提示超过 6,000 字，未保存；接口 422 |
| 2 | 改为恰好 6,000 字保存 | 提示已保存，刷新后正文仍为 6,000 字 |
| 3 | 售中再连续保存 10 次不同正文（v2 到 v11） | 版本列表共 10 条，最早的 6,000 字版本已不在列表 |

后置：无。

#### `TC-RCP-010` 工单类型配置只影响之后新建的工单 — 对应 `REQ-RCP-004` · 级别: 回归 · 执行者: 皆可

前置：基线；Arif 在 `/tickets`「新建工单」建一张「开票」工单 T1（Demo Shopee MY），记下截止时间 D1（2 个工作日）。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | owner 在 `/reception/tickets` 把开票的时限改为「1 个工作日」，点「保存」 | 提示已保存 |
| 2 | 打开 T1 | 截止时间仍为 D1 |
| 3 | Arif 再建一张「开票」工单 T2 | T2 的截止时间为建单后 1 个工作日 |

后置：无。

#### `TC-RCP-011` 平台类工单的时限只读，只能改提醒阈值 — 对应 `REQ-RCP-004` · 级别: 回归 · 执行者: 皆可

前置：基线；以 owner@demo.test 打开 `/reception/tickets`；`login owner@demo.test`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 看退货退款一行 | 时限显示为平台截止，不可编辑；提醒阈值可选截止前 3 / 6 / 12 小时 |
| 2 | `api owner@demo.test -X PUT $B/api/v1/reception/ticket-types -d '{"types":[{"type":"return_refund","merchantDue":{"hours":24}}],"autoCloseDays":7}'` | 409，`type` 为 `/errors/not-allowed` |
| 3 | 退货退款提醒阈值改为「截止前 12 小时」，点「保存」 | 提示已保存，刷新后仍为截止前 12 小时 |

后置：无。

#### `TC-RCP-012` 设为不自动关闭 — 对应 `REQ-RCP-004` · 级别: 边缘 · 执行者: 皆可

前置：基线；owner 在 `/reception/tickets` 把自动关闭选「不自动关闭」并保存；终端执行 `pnpm scenario ticket-resolved-8d`，记工单号 T。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 执行 `pnpm job ticket.auto_close`，打开 T | 状态仍为已解决 |

后置：无。

### 知识库

约定：本节用例在 Demo Store 里操作；「资料 ID」取自 `kbup` 响应的 `document.id` 或资料抽屉地址 `?doc=<ID>`；「等可用」= 每 2 秒请求一次 `api owner@demo.test "$B/api/v1/knowledge/documents/<ID>"`，30 秒内 `document.status` 变为 `ready`；「AI 替身设为 X」「检索替身设为 X」用 §3 的接口写法。本节用例的后置执行 `kbclear`，并把两个替身设回 `normal`。

#### `TC-KB-001` 批量上传两份资料，解析后可用，抽屉看原文件与解析内容 — 对应 `REQ-KB-001`、`REQ-KB-002` · 级别: 冒烟 · 执行者: 皆可

前置：基线；按 §3 备好 `$KB`；`login owner@demo.test`，`api owner@demo.test -X POST $B/api/v1/knowledge/categories -d '{"name":"售后政策"}'` 返回 201；浏览器以 owner@demo.test 登录。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 打开 `/reception/knowledge`，点「资料」页签 | 接待设置子导航选中「知识库」；页签依次为问答、待审核、资料、产品、测试问答，打开时选中「问答」；点「资料」后地址带 `tab=docs`，标题「资料 0 / 500」，空态写「还没有资料。把产品手册、保修与退换政策拖到这里」 |
| 2 | 点「上传资料」，在弹窗里选择 `$KB/保修政策.pdf` 与 `$KB/型号对照.xlsx` | 弹窗列出两个文件与大小（3.0 MB、1.0 MB），都写「等待上传」；弹窗写明支持的格式，以及「单个文件不超过 20 MB，PDF 以外的文件不超过 4 MB；PPT 请先导出为 PDF 再上传」；按钮为「上传 2 个文件」 |
| 3 | 分类选「售后政策」，适用站点保持「全部站点」，点「上传 2 个文件」 | 两个文件依次显示进度，最后都显示「已上传，排队解析」；弹窗底部写「已上传 2 个」，按钮变为「完成」 |
| 4 | 点「完成」，看资料列表，最多等 30 秒 | 列表两行，分类「售后政策」、站点「全部站点」；状态从「排队中」或「解析中」变为「可用」，「AI 可用」开关为开；标题旁资料数为「2 / 500」 |
| 5 | 点「保修政策.pdf」一行 | 地址带 `tab=docs` 与 `doc=<ID>`；资料抽屉打开，标题是文件名「保修政策.pdf」（加载中与出错时标题为「资料详情」），显示状态「可用」、「1 段分块」、分类、适用站点「全部站点」、上传人林晓；「原文件」标签内嵌 PDF 预览 |
| 6 | 点「解析内容（1 段）」标签，再刷新页面 | 地址多了 `docTab=parsed`；列出 #1「替身解析：保修政策.pdf」；刷新后抽屉仍打开并停在「解析内容」 |
| 7 | 关掉抽屉，点「型号对照.xlsx」一行 | 「原文件」标签没有内嵌预览，写「这种格式不能在页面里预览，点上方「下载原文件」查看」；有「下载原文件」按钮 |
| 8 | `api owner@demo.test "$B/api/v1/knowledge/documents"` | 200；`items` 2 条，`status` 都是 `ready`、`aiEnabled` 为 true、`markets` 为 `["ALL"]`、`partsCount` 与 `chunksCount` 都为 1（不超过 10 MB 的 PDF 不拆）；`counts` 为 `{"total":2,"limit":500}` |

后置：`kbclear`。

#### `TC-KB-002` 服务端拒收不支持、超限或内容不符的文件 — 对应 `REQ-KB-001` · 级别: 回归 · 执行者: 皆可

前置：基线；`$KB` 已备；`login owner@demo.test`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `kbup owner@demo.test "$KB/产品介绍.pptx"` | 415，`type` 为 `/errors/unsupported-type`，`code` 为 `ppt_export_pdf`，`detail` 为「请先把 PPT 导出为 PDF 再上传。」 |
| 2 | `kbup owner@demo.test "$KB/大文件.pdf"` | 413，`type` 为 `/errors/too-large`，`code` 为 `file_limit`，`detail` 为「单个文件不能超过 20 MB。」 |
| 3 | `kbup owner@demo.test "$KB/说明书.docx"` | 413，`type` 为 `/errors/too-large`，`code` 为 `retrieval_limit`，`detail` 为「PDF 以外的文件不能超过 4 MB。」 |
| 4 | `kbup owner@demo.test "$KB/工具.exe"` | 415，`code` 为 `unsupported`，`detail` 以「这种格式暂不支持」开头并列出支持的格式 |
| 5 | `kbup owner@demo.test "$KB/伪装.pdf"` | 415，`code` 为 `content_mismatch`，`detail` 含「文件内容与扩展名 .pdf 不符」 |
| 6 | `kbup owner@demo.test "$KB/保修政策.md" -F markets=ALL -F markets=MY` | 422，`type` 为 `/errors/validation`（全部站点不能与具体站点同选） |
| 7 | `api owner@demo.test "$B/api/v1/knowledge/documents"` | `items` 为空，`counts.total` 为 0 |

后置：`kbclear`。

#### `TC-KB-003` 上传弹窗：选文件时先挡一遍，上传中不能关闭 — 对应 `REQ-KB-001` · 级别: 回归 · 执行者: 皆可

前置：基线；`$KB` 已备；浏览器以 owner@demo.test 打开 `/reception/knowledge`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 点「上传资料」，在文件选择框里选 `产品介绍.pptx`、`大文件.pdf`、`说明书.docx`、`工具.exe`、`型号对照.xlsx` | 文件选择框能选中 pptx；弹窗五行：产品介绍.pptx「请先把 PPT 导出为 PDF 再上传」、大文件.pdf「单个文件不能超过 20 MB」、说明书.docx「PDF 以外的文件不能超过 4 MB」、工具.exe「这种格式暂不支持」，型号对照.xlsx「等待上传」；底部「1 个可上传，4 个不能上传」，按钮「上传 1 个文件」 |
| 2 | 让上传持续数秒（开发者工具 Network 限速，或自动化脚本拦住上传请求 5 秒再放行），点「上传 1 个文件」，在上传进行中按 Esc，再点弹窗外的遮罩 | 上传进行中弹窗右上角没有关闭按钮，按钮显示「上传中，请不要关闭」；按 Esc、点遮罩后弹窗仍在 |
| 3 | 取消限速或放行请求，等上传结束 | 型号对照.xlsx 显示「已上传，排队解析」；底部「已上传 1 个，4 个被拒」，按钮为「完成」，右上角关闭按钮出现 |
| 4 | `api owner@demo.test "$B/api/v1/knowledge/documents"` | 只有型号对照.xlsx 一份：被前端挡下的四个文件没有发给服务端 |

后置：`kbclear`。

#### `TC-KB-004` 内容与已有资料相同的文件被拒，给出已有资料 — 对应 `REQ-KB-001` · 级别: 回归 · 执行者: 皆可

前置：基线；`$KB` 已备；`login owner@demo.test`；`kbup owner@demo.test "$KB/保修政策.md"` 返回 201；`cp "$KB/保修政策.md" "$KB/保修政策-副本.md"`；浏览器以 owner@demo.test 打开 `/reception/knowledge`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `kbup owner@demo.test "$KB/保修政策-副本.md"` | 409，`type` 为 `/errors/duplicate`，`code` 为 `document_duplicate`，`extra.existingName` 为「保修政策.md」，`extra.existingId` 为已有资料的 ID |
| 2 | 浏览器点「上传资料」，选 `保修政策-副本.md`，点「上传 1 个文件」 | 该行显示「已有同样的文件：《保修政策.md》」与「查看」；底部「已上传 0 个，1 个被拒」 |
| 3 | 点「查看」 | 上传弹窗关闭，打开保修政策.md 的资料抽屉 |

后置：`kbclear`；`rm "$KB/保修政策-副本.md"`。

#### `TC-KB-005` 资料满 500 份时拒绝上传 — 对应 `REQ-KB-001` · 级别: 边缘 · 执行者: 皆可

前置：基线；`login owner@demo.test`；用 500 个内容各不相同的小文件造满：`for i in $(seq -w 1 500); do printf '资料 %s\n' "$i" > "$SP_TMP/kb-$i.txt"; kbup owner@demo.test "$SP_TMP/kb-$i.txt" >/dev/null; done`；浏览器以 owner@demo.test 打开 `/reception/knowledge`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 看资料区 | 标题旁「500 / 500」为警示色；列表上方提示「资料已满（500 / 500），请先删除不用的资料再上传。」 |
| 2 | 点「上传资料」 | 不打开上传弹窗，提示「资料已满，请先删除不用的」 |
| 3 | `kbup owner@demo.test "$KB/保修政策.md"` | 409，`type` 为 `/errors/not-allowed`，`code` 为 `document_quota`，`detail` 为「资料已满 500 份，请先删除不用的。」 |
| 4 | 打开列表第一份资料的抽屉，点「删除」再点「删除资料」；再执行一次第 3 步的命令 | 资料数变为「499 / 500」；上传返回 201 |

后置：`kbclear`；`rm "$SP_TMP"/kb-*.txt`。

#### `TC-KB-006` 超过 10 MB 的 PDF 按页拆成多个条目 — 对应 `REQ-KB-001`、`REQ-KB-002` · 级别: 回归 · 执行者: 皆可

前置：基线；`$KB` 已备；`login owner@demo.test`；浏览器以 owner@demo.test 打开 `/reception/knowledge`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `kbup owner@demo.test "$KB/拆分.pdf"`，记资料 ID D | 201，`document.status` 为 `queued` |
| 2 | 最多等 60 秒，`api owner@demo.test "$B/api/v1/knowledge/documents/<D>"` | `document.status` 为 `ready`、`partsCount` 为 2；`parts` 两条，`status` 都是 `indexed`；第一条 `pageFrom` 为 1，第二条 `pageFrom` 等于第一条 `pageTo` 加 1，第二条 `pageTo` 为 30 |
| 3 | 浏览器打开 D 的抽屉，点「解析内容」 | 抽屉写「2 段分块 · 拆成 2 个条目」；两段分块上方分别标「条目 1 · 第 1–N 页」「条目 2 · 第 N+1–30 页」，N 与第 2 步一致 |

后置：`kbclear`。

#### `TC-KB-007` PDF 有一页超过 10 MB 时入库失败并写明页码 — 对应 `REQ-KB-001`、`REQ-KB-002` · 级别: 回归 · 执行者: 皆可

前置：基线；`$KB` 已备；`login owner@demo.test`；浏览器以 owner@demo.test 打开 `/reception/knowledge`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `kbup owner@demo.test "$KB/单页超限.pdf"`，记资料 ID D | 201 |
| 2 | 看列表，最多等 60 秒 | 该行状态「失败」，行下写「第 12 页超过 10 MB，请压缩后重传」与「重新解析」 |
| 3 | `api owner@demo.test "$B/api/v1/knowledge/documents/<D>"` | `document.status` 为 `failed`，`failureReason` 同上；`parts` 为空（检索服务里没有留下它的条目） |
| 4 | 打开 D 的抽屉，点「解析内容」 | 抽屉顶部「解析失败」与同一原因；解析内容写「解析失败，没有解析内容。重新解析成功后在这里按序号列出分块文字。」 |

后置：`kbclear`。

#### `TC-KB-008` 索引报错一次：删除后同名重传，资料最终可用 — 对应 `REQ-KB-001` · 级别: 回归 · 执行者: 皆可

前置：基线；`$KB` 已备；`login owner@demo.test`；检索替身设为 `ingest_error`（只用一次）。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `kbup owner@demo.test "$KB/保修政策.md"`，记资料 ID D | 201 |
| 2 | 等可用后 `api owner@demo.test "$B/api/v1/knowledge/documents/<D>"` | `document.status` 为 `ready`；`parts` 一条，`status` 为 `indexed`、`retries` 为 1 |
| 3 | `curl -s $B/api/dev/knowledge-stub` | `next` 已回到 `normal` |

后置：`kbclear`。

#### `TC-KB-009` 索引一直报错：重传 2 次后失败，重新解析后可用 — 对应 `REQ-KB-001`、`REQ-KB-004` · 级别: 回归 · 执行者: 皆可

前置：基线；`$KB` 已备；`login owner@demo.test`；检索替身设为 `ingest_error` 并保持（`"sticky":true`）；浏览器以 owner@demo.test 打开 `/reception/knowledge`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `kbup owner@demo.test "$KB/保修政策.md"`，记资料 ID D | 201 |
| 2 | 最多等 30 秒，`api owner@demo.test "$B/api/v1/knowledge/documents/<D>"` | `document.status` 为 `failed`，`failureReason` 为「检索服务索引失败（已重传 2 次）：workers_ai_timeout_error（替身）」；`parts` 一条，`status` 为 `failed`、`retries` 为 2 |
| 3 | 看列表 | 该行「失败」，行下写同一原因与「重新解析」 |
| 4 | 检索替身设回 `normal`，点该行「重新解析」 | 状态变为「排队中」或「解析中」，30 秒内变为「可用」 |

后置：`kbclear`；检索替身设回 `normal`。

#### `TC-KB-010` 分类增改删，内置「未分类」不能改名删除 — 对应 `REQ-KB-003` · 级别: 回归 · 执行者: 皆可

前置：基线；`$KB` 已备；`login owner@demo.test`；`kbup` 依次上传 `保修政策.md`、`运费说明.txt`、`型号对照.xlsx` 并等可用；`api owner@demo.test $B/api/v1/knowledge/categories` 记下「未分类」（`builtin` 为 true）的 ID U；浏览器以 owner@demo.test 打开 `/reception/knowledge`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 点「分类管理」，输入「售后政策」点「新增」 | 列表出现「售后政策」「0 份资料」；输入框下写「最多 20 个字；已有 2 / 50 个分类」 |
| 2 | 再输入「售后政策」点「新增」 | 输入框下提示「已有同名分类」，列表没有多出一行 |
| 3 | 点「改名「售后政策」」，改为「保修与退换」点「保存」 | 该行变为「保修与退换」；关掉弹窗后，资料列表的分类筛选里有「保修与退换」，没有「售后政策」 |
| 4 | 再打开「分类管理」，看「未分类」一行 | 写「3 份资料 · 删除分类后资料归到这里」与「内置，不能改名或删除」，没有改名、删除按钮 |
| 5 | 逐个打开三份资料的抽屉，分类改为「保修与退换」；记下 `api owner@demo.test "$B/api/v1/knowledge/documents"` 里三份的 `readyAt` | 每次提示「分类已改，立即生效」；列表分类列都是「保修与退换」，状态仍为「可用」 |
| 6 | 分类管理里点「删除「保修与退换」」 | 确认框写「其中 3 份资料会归入「未分类」，资料本身不变，也不重新解析。」 |
| 7 | 点「删除分类」 | 该分类消失，「未分类」变为「3 份资料」；三份资料仍为「可用」，`readyAt` 与第 5 步记下的相同 |
| 8 | `api owner@demo.test -X PATCH $B/api/v1/knowledge/categories/<U> -d '{"name":"改名"}'`；`api owner@demo.test -X DELETE $B/api/v1/knowledge/categories/<U>` | 两个都 409，`type` 为 `/errors/not-allowed`，`code` 为 `builtin` |
| 9 | 对第 7 步删掉的分类 ID 再请求一次 `DELETE` | 404，`type` 为 `/errors/not-found` |

后置：`kbclear`。

#### `TC-KB-011` 分类最多 50 个 — 对应 `REQ-KB-003` · 级别: 边缘 · 执行者: 皆可

前置：基线；`login owner@demo.test`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `for i in $(seq -w 1 49); do api owner@demo.test -X POST $B/api/v1/knowledge/categories -d "{\"name\":\"分类$i\"}" \| tail -1; done` | 49 行都是 `HTTP 201`（连同「未分类」共 50 个） |
| 2 | `api owner@demo.test -X POST $B/api/v1/knowledge/categories -d '{"name":"分类50"}'` | 409，`type` 为 `/errors/not-allowed`，`code` 为 `category_quota`，`detail` 为「分类最多 50 个。」 |
| 3 | 浏览器以 owner 打开 `/reception/knowledge`，点「分类管理」 | 输入框占位「分类已满 50 个」且不能输入；下方写「已有 50 / 50 个分类」 |

后置：`kbclear`。

#### `TC-KB-012` 改适用站点立即生效，站点筛选的口径 — 对应 `REQ-KB-003`、`REQ-KB-005` · 规则 `RULE-KB-001` · 级别: 回归 · 执行者: 皆可

前置：基线；`$KB` 已备；`login owner@demo.test`；`kbup owner@demo.test "$KB/保修政策.md"`（全部站点）与 `kbup owner@demo.test "$KB/运费说明.txt" -F markets=TH`，都等可用；浏览器以 owner@demo.test 打开 `/reception/knowledge`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 站点筛选选「MY 可用」 | 只列保修政策.md（适用全部站点的也列出）；地址带 `market=MY` |
| 2 | 站点筛选改为「TH 可用」 | 两份都列出 |
| 3 | 站点筛选改为「只看全部站点」 | 只列保修政策.md；地址带 `market=ALL` |
| 4 | 把地址改成 `/reception/knowledge?market=XX&state=bad` 回车 | 筛选显示「不限站点」「全部状态」，地址里这两个参数被去掉，两份都列出 |
| 5 | 打开保修政策.md 的抽屉，适用站点点「MY」 | 「全部站点」取消选中、只剩 MY；提示「适用站点已改，下一次出稿起按新站点检索」；状态仍为「可用」 |
| 6 | 再点一次「MY」，一个站点都不选 | 站点下方提示「至少选一个站点」；`api owner@demo.test "$B/api/v1/knowledge/documents/<ID>"` 的 `markets` 仍为 `["MY"]` |
| 7 | `api owner@demo.test -X PATCH "$B/api/v1/knowledge/documents/<ID>" -d '{"markets":[]}'`；同一地址 `-d '{"markets":["ALL","MY"]}'` | 两个都 422，`type` 为 `/errors/validation` |
| 8 | 关掉抽屉，测试问答店铺选「Demo Shopee SG」，问「保修多久」 | 提示「没有对这个范围可用的资料，这次没有检索，回答只依据订单事实与提示词。」；「引用 0」 |
| 9 | 店铺改选「Demo Shopee MY」，再问「保修多久」 | 引用列出 [1]《保修政策.md》 |

后置：`kbclear`。

#### `TC-KB-013` 停用资料后不再被引用 — 对应 `REQ-KB-004`、`REQ-KB-005` · 规则 `RULE-KB-001` · 级别: 回归 · 执行者: 皆可

前置：基线；`$KB` 已备；`login owner@demo.test`；`kbup` 上传 `保修政策.md` 与 `运费说明.txt` 并等可用；浏览器以 owner@demo.test 打开 `/reception/knowledge`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 测试问答不选店铺，问「保修多久」 | 引用列出 [1]《保修政策.md》 |
| 2 | 资料列表里关掉保修政策.md 的「AI 可用」开关 | 该行状态变为「已停用」，开关为关 |
| 3 | 再问「保修多久」，展开「检索明细」 | 引用里没有《保修政策.md》；两路检索的分块里都没有保修政策.md |
| 4 | 状态筛选选「已停用」 | 只列保修政策.md；地址带 `state=disabled` |
| 5 | 打开保修政策.md 的「AI 可用」开关 | 状态回到「可用」 |

后置：`kbclear`。

#### `TC-KB-014` 资料排队或解析中时不能重新解析 — 对应 `REQ-KB-004` · 级别: 回归 · 执行者: 皆可

前置：基线；`login owner@demo.test`；`pnpm scenario knowledge-queued-11m`，记输出的资料 ID D；浏览器以 owner@demo.test 打开 `/reception/knowledge?doc=<D>`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `api owner@demo.test -X POST "$B/api/v1/knowledge/documents/<D>/reparse" -d '{}'` | 409，`type` 为 `/errors/conflict`，`code` 为 `processing`，`detail` 为「这份资料正在解析，完成后再试。」 |
| 2 | 看抽屉 | 写「排队中：完成前 AI 不会引用这份资料，这里每 5 秒刷新一次。」；「重新解析」不可用，旁边写「正在解析，完成后才能重新解析」 |

后置：`kbclear`。

#### `TC-KB-015` 重新解析：完成后重新可用 — 对应 `REQ-KB-004` · 级别: 回归 · 执行者: 皆可

前置：基线；`$KB` 已备；`login owner@demo.test`；`kbup owner@demo.test "$KB/保修政策.md"` 等可用，记资料 ID D 与 `readyAt` R0；浏览器以 owner@demo.test 打开 `/reception/knowledge?doc=<D>`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 抽屉点「重新解析」 | 状态变为「排队中」或「解析中」 |
| 2 | 最多等 30 秒，`api owner@demo.test "$B/api/v1/knowledge/documents/<D>"` | `document.status` 为 `ready`，`chunksCount` 为 1，`readyAt` 晚于 R0 |
| 3 | 抽屉点「解析内容」 | 列出 #1，正文是保修政策.md 的全文 |

后置：`kbclear`。

#### `TC-KB-016` 删除资料：立即消失，原文件与检索副本随后删除 — 对应 `REQ-KB-004` · 级别: 回归 · 执行者: 皆可

前置：基线；`$KB` 已备；`login owner@demo.test`；`kbup owner@demo.test "$KB/保修政策.md"` 等可用，记资料 ID D 与详情里的 `fileUrl` F；浏览器以 owner@demo.test 打开 `/reception/knowledge?doc=<D>`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 抽屉点「删除」 | 确认框写「资料会立即从列表消失，检索服务里的副本与原文件随后一并删除，删除后不能恢复。」与「已生成草稿的依据仍显示文件名，但不能再点开。」 |
| 2 | 点「删除资料」 | 提示「已删除《保修政策.md》」；抽屉关闭，列表里没有它 |
| 3 | `api owner@demo.test "$B/api/v1/knowledge/documents/<D>"`；`api owner@demo.test "$B<F>"` | 两个都 404 |
| 4 | `api owner@demo.test -X DELETE "$B/api/v1/knowledge/documents/<D>"` | 204（重复删除不报错） |
| 5 | 30 秒后 `q "select count(*) from knowledge_document where id='<D>'"` 与 `q "select count(*) from knowledge_part where document_id='<D>'"` | 都是 0 |

后置：无。

#### `TC-KB-017` 测试问答：同链路回答，给出引用与检索明细，不计用量 — 对应 `REQ-KB-005` · 级别: 回归 · 执行者: 皆可

前置：基线；`$KB` 已备；`login owner@demo.test`；`kbup` 上传 `保修政策.md` 与 `运费说明.txt` 并等可用；浏览器 A 以 owner@demo.test 打开 `/billing`，记下本期已用 U；浏览器 B 以 owner@demo.test 打开 `/reception/knowledge`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | B：问题框输入「保修多久」，店铺选「Demo Shopee MY」，点「提问」 | 提问中按钮显示「正在回答」并有加载占位；完成后显示回答（替身回答含「保修多久」）、「置信度 0.85」、「按当前阈值会出草稿」与耗时 |
| 2 | B：看「引用」 | 「引用 1」：[1]《保修政策.md》，片段以「# 保修政策」开头、含「保修 12 个月」 |
| 3 | B：点这条引用 | 打开保修政策.md 的资料抽屉 |
| 4 | B：关掉抽屉，展开「检索明细」 | 「改写后的问题」为「保修多久」（替身改写返回原话）；「改写路」「原话路」各一组「混合检索」，各自列出同样两段分块（保修政策.md #1、运费说明.txt #1）与分数（向量、关键词、重排）；「合并后给 AI 的 2 段」：[1] 保修政策.md、[2] 运费说明.txt，两路重复的分块只出现一次 |
| 5 | A：刷新 `/billing` | 本期已用仍为 U |
| 6 | B：清空问题框点「提问」；再输入 501 个字点「提问」 | 依次提示「请输入问题」「问题最多 500 个字」，计数「501 / 500」标红；两次都不出新回答 |

后置：`kbclear`。

#### `TC-KB-018` 测试问答：模型判定资料不足时标出，并显示会转人工 — 对应 `REQ-KB-005` · 规则 `RULE-KB-003` · 级别: 回归 · 执行者: 皆可

前置：基线；`$KB` 已备；`login owner@demo.test`；`kbup owner@demo.test "$KB/保修政策.md"` 等可用；AI 替身设为 `insufficient`；浏览器以 owner@demo.test 打开 `/reception/knowledge`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 测试问答不选店铺，问「这款相机防水吗」 | 回答标「资料不足」；「置信度 0.90」，但显示「按当前阈值会转人工（AI 置信度低）」；下方写「AI 判定资料不足以回答：真实出稿时这类问题一律转人工。」 |

后置：`kbclear`。

#### `TC-KB-019` 测试问答：没有可用资料时不检索 — 对应 `REQ-KB-005` · 规则 `RULE-KB-001` · 级别: 回归 · 执行者: 皆可

前置：基线（没有资料）；`curl -s $B/api/dev/knowledge-stub` 记下 `lastQuery` 的条数 N；浏览器以 owner@demo.test 打开 `/reception/knowledge`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 测试问答问「保修多久」 | 出回答；提示「没有对这个范围可用的资料，这次没有检索，回答只依据订单事实与提示词。」；「引用 0」「回答没有引用资料。」；没有「检索明细」 |
| 2 | `curl -s $B/api/dev/knowledge-stub` | `lastQuery` 仍为 N 条 |

后置：无。

#### `TC-KB-020` 测试问答：两路检索都失败时降级，回答不带引用 — 对应 `REQ-KB-005` · 规则 `RULE-KB-002` · 级别: 回归 · 执行者: 皆可

前置：基线；`$KB` 已备；`login owner@demo.test`；`kbup owner@demo.test "$KB/保修政策.md"` 等可用；检索替身设为 `timeout` 并保持；浏览器以 owner@demo.test 打开 `/reception/knowledge`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 测试问答问「保修多久」 | 结果区顶部「这次没查到资料，回答没有引用」与「原因：检索失败（改写路：timeout；原话路：timeout）」；回答照常显示；「引用 0」 |
| 2 | 展开「检索明细」 | 改写路、原话路各有「混合检索」与「纯向量重试」两组，都写「失败：超时」；「合并后给 AI 的 0 段」「两路都没有结果。」 |

后置：`kbclear`；检索替身设回 `normal`。

#### `TC-KB-021` 测试问答：AI 不可用时保留问题，可再试 — 对应 `REQ-KB-005` · 级别: 回归 · 执行者: 皆可

前置：基线；AI 替身设为 `timeout`（只用一次）；浏览器以 owner@demo.test 打开 `/reception/knowledge`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 测试问答问「保修多久」 | 提示「AI 暂时不可用」「问题已保留，稍后再点「提问」重试。」；问题框仍是「保修多久」 |
| 2 | 再点「提问」 | 出回答（替身已回到正常） |

后置：无。

#### `TC-KB-022` 测试问答每商户每分钟最多 20 次 — 对应 `REQ-KB-005` · 级别: 边缘 · 执行者: 皆可

前置：基线；过去 1 分钟内 Demo Store 没有测试问答；`login owner@demo.test`；浏览器以 owner@demo.test 打开 `/reception/knowledge`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 一分钟内连续 20 次 `api owner@demo.test -X POST $B/api/v1/knowledge/test -d '{"question":"保修多久"}' \| tail -1` | 20 行都是 `HTTP 200` |
| 2 | 立即 `curl -s -D - -o /dev/null -b "$SP_TMP/owner@demo.test" -H "Origin: $B" -H 'Content-Type: application/json' -X POST $B/api/v1/knowledge/test -d '{"question":"保修多久"}'` | `HTTP/1.1 429`，响应头 `Retry-After` 为 1 到 60 之间的秒数 |
| 3 | 浏览器测试问答问「保修多久」 | 提示「提问太频繁」与「测试问答每分钟最多 20 次」 |
| 4 | 等 `Retry-After` 秒后再点「提问」 | 出回答 |

后置：无。

#### `TC-KB-023` 测试问答的店铺按本人可见范围 — 对应 `REQ-KB-005`、`REQ-PERM-001` · 级别: 回归 · 执行者: 皆可

前置：基线；`$KB` 已备；过去 1 分钟内 Demo Store 没有测试问答；`login owner@demo.test`、`login lead@demo.test`；`kbup owner@demo.test "$KB/保修政策.md"` 等可用；`api owner@demo.test $B/api/v1/shops` 记下 Demo TikTok TH 的店铺 ID T 与 Demo Shopee MY 的店铺 ID M；浏览器以 lead@demo.test 打开 `/reception/knowledge`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 展开测试问答的「店铺」下拉 | 只有「不选店铺：不按站点过滤」、Demo Shopee MY、Demo TikTok MY |
| 2 | `api lead@demo.test -X POST $B/api/v1/knowledge/test -d '{"question":"保修多久","shopId":"<T>"}'` | 404，`type` 为 `/errors/not-found`，`detail` 为「店铺不存在或不在你负责的范围内。」 |
| 3 | 紧接着连续 20 次 `api lead@demo.test -X POST $B/api/v1/knowledge/test -d '{"question":"保修多久","shopId":"<M>"}' \| tail -1` | 20 行都是 `HTTP 200`：第 2 步的 404 没有计入限流 |

后置：`kbclear`。

#### `TC-KB-024` 出稿检索资料，草稿下方显示依据 — 对应 `REQ-AI-002`、`REQ-KB-006` · 级别: 冒烟 · 执行者: 皆可

前置：基线；`$KB` 已备；`login owner@demo.test`；`kbup` 上传 `保修政策.md` 与 `运费说明.txt` 并等可用；浏览器 A 以 agent@demo.test（Nur）停在 `/wb`；浏览器 B 打开模拟器；浏览器 C 以 owner@demo.test 登录。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | B：选 Demo Shopee MY、新建买家，发「保修多久」 | 推送日志新增一条，HTTP 200 |
| 2 | A：20 秒内打开「AI 草稿」里该买家的会话 | 草稿正文下方一行「依据：《保修政策.md》」；文件名是普通文字，点了不跳转 |
| 3 | 看「AI 替身」面板「最近一次请求」 | user 载荷有 `knowledge` 数组，第一项 `n` 为 1、`title` 为「保修政策.md」、`text` 含「保修 12 个月」；system 末尾护栏写「产品参数、兼容性、保修与政策只能依据 knowledge 与 order_facts」 |
| 4 | `curl -s $B/api/dev/knowledge-stub` | `lastQuery` 最后两条是这次出稿的两路检索：`query` 都是「保修多久」（替身改写返回原话），`retrievalType` 都是 `hybrid` |
| 5 | C：打开同一会话，点依据里的《保修政策.md》 | 新开一个标签，地址为 `/reception/knowledge?tab=docs&doc=<保修政策.md 的 ID>`，停在资料页签，资料抽屉显示保修政策.md |
| 6 | A：点「认领并发送」；B：看该买家的买家视图 | 买家收到 1 条卖家消息，正文与草稿正文相同，不含「依据」、文件名或片段编号 |

后置：`kbclear`。

#### `TC-KB-025` 依据的资料删除后只显示文件名 — 对应 `REQ-KB-006` · 级别: 回归 · 执行者: 皆可

前置：基线；`$KB` 已备；`login owner@demo.test`；`kbup owner@demo.test "$KB/保修政策.md"` 等可用，记资料 ID D；按 §3「模拟器发消息」向 Demo Shopee MY 新买家发「保修多久」，20 秒内出草稿，记会话 ID C；浏览器以 owner@demo.test 打开 `/wb/<C>`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 看草稿下方 | 「依据：《保修政策.md》」，文件名是链接 |
| 2 | `api owner@demo.test -X DELETE "$B/api/v1/knowledge/documents/<D>"` | 204 |
| 3 | 刷新 `/wb/<C>` | 依据仍写「依据：《保修政策.md》」，文件名不再是链接 |
| 4 | `api owner@demo.test "$B/api/v1/conversations/<C>"` | `draft.citations` 一条：`name` 为「保修政策.md」、`available` 为 false |

后置：`kbclear`。

#### `TC-KB-026` 出稿只引用解析完成、AI 可用开着且站点相符的资料 — 对应 `REQ-KB-006` · 规则 `RULE-KB-001` · 级别: 回归 · 执行者: 皆可

前置：基线；`$KB` 已备；`login owner@demo.test`；准备四份都写到「保修」的资料：A `kbup owner@demo.test "$KB/保修政策.md"`（全部站点）；B `printf '泰国站保修 6 个月\n' > "$SP_TMP/保修-TH.txt"; kbup owner@demo.test "$SP_TMP/保修-TH.txt" -F markets=TH`；C `printf '旧版保修 3 个月\n' > "$SP_TMP/保修-旧版.txt"; kbup owner@demo.test "$SP_TMP/保修-旧版.txt"`，等可用后 `api owner@demo.test -X PATCH "$B/api/v1/knowledge/documents/<C>" -d '{"aiEnabled":false}'`；D 检索替身设为 `ingest_error` 并保持，`printf '保修草稿 1 个月\n' > "$SP_TMP/保修-草稿.txt"; kbup owner@demo.test "$SP_TMP/保修-草稿.txt"`，等它变为 `failed` 后检索替身设回 `normal`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 按 §3「模拟器发消息」向 Demo Shopee MY 新买家发「保修多久」 | 20 秒内出草稿，草稿下方「依据：《保修政策.md》」 |
| 2 | 看「最近一次请求」的 `knowledge` | 只有保修政策.md 的片段；没有「泰国站保修」「旧版保修」「保修草稿」 |

后置：`kbclear`；`rm "$SP_TMP"/保修-*.txt`。

#### `TC-KB-027` 模型判定资料不足时一律转人工 — 对应 `REQ-KB-006`、`REQ-AI-004` · 规则 `RULE-KB-003` · 级别: 回归 · 执行者: 皆可

前置：基线（置信度阈值 0.60）；`$KB` 已备；`login owner@demo.test`、`login agent@demo.test`；`kbup owner@demo.test "$KB/保修政策.md"` 等可用；AI 替身设为 `insufficient`（confidence 0.9，高于阈值）；浏览器以 Nur 登录停在 `/wb`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 按 §3「模拟器发消息」向 Demo Shopee MY 新买家发「这款相机防水吗」 | 推送 HTTP 200 |
| 2 | Nur：20 秒内看「待认领」 | 该会话在待认领，打开后没有草稿区 |
| 3 | `api agent@demo.test "$B/api/v1/conversations/<该会话 ID>"` | `conversation.handoffReason` 为 `low_confidence`，`draft` 为 null |
| 4 | `q "select data->>'reason', data->>'insufficient' from audit_log where action='handoff' order by created_at desc limit 1"` | `low_confidence\|true` |

后置：`kbclear`。

#### `TC-KB-028` 混合检索没有向量分时改用纯向量重试 — 对应 `REQ-KB-006` · 级别: 回归 · 执行者: 皆可

前置：基线；`$KB` 已备；`login owner@demo.test`；`kbup owner@demo.test "$KB/保修政策.md"` 等可用；`curl -s $B/api/dev/knowledge-stub` 记下 `lastQuery` 最后一条的时间 T0；检索替身设为 `no_vector`（只用一次）。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 按 §3「模拟器发消息」向 Demo Shopee MY 新买家发「保修多久」 | 20 秒内出草稿，草稿下方「依据：《保修政策.md》」 |
| 2 | `curl -s $B/api/dev/knowledge-stub` | 晚于 T0 的检索请求共 3 条：2 条 `hybrid`、1 条 `vector` |
| 3 | `q "select retrieval from draft order by created_at desc limit 1"` | `routes` 里有一组 `mode` 为 `hybrid`、`error` 为 `no_vector`，同一路紧接着一组 `mode` 为 `vector_only`、没有 `error`；`degraded` 为 false |

后置：`kbclear`。

#### `TC-KB-029` 检索返回错误时同样改用纯向量重试 — 对应 `REQ-KB-006` · 级别: 边缘 · 执行者: 皆可

前置：同 `TC-KB-028`，检索替身改设为 `error`（只用一次）。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 按 §3「模拟器发消息」向 Demo Shopee MY 新买家发「保修多久」 | 20 秒内出草稿，草稿下方「依据：《保修政策.md》」 |
| 2 | `q "select retrieval from draft order by created_at desc limit 1"` | `routes` 里有一组 `mode` 为 `hybrid`、`error` 为「500 检索服务错误（替身）」，同一路紧接着一组 `mode` 为 `vector_only`、没有 `error`；`degraded` 为 false |

后置：`kbclear`。

#### `TC-KB-030` 两路检索都失败时不带资料出稿，不转人工 — 对应 `REQ-KB-006` · 规则 `RULE-KB-002` · 级别: 回归 · 执行者: 皆可

前置：基线；`$KB` 已备；`login owner@demo.test`；`kbup owner@demo.test "$KB/保修政策.md"` 等可用；检索替身设为 `timeout` 并保持；浏览器以 Nur 登录停在 `/wb`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 按 §3「模拟器发消息」向 Demo Shopee MY 新买家发「保修多久」 | 推送 HTTP 200 |
| 2 | Nur：20 秒内看「AI 草稿」 | 该会话在「AI 草稿」，不在待认领；草稿下方没有「依据」 |
| 3 | 看「最近一次请求」 | user 载荷没有 `knowledge` 字段 |
| 4 | `q "select retrieval->>'degraded', retrieval->>'degradedReason' from draft order by created_at desc limit 1"` | `true\|检索失败（改写路：timeout；原话路：timeout）` |

后置：`kbclear`；检索替身设回 `normal`。

#### `TC-KB-031` 影子模式：依据给管理员看，资料不足照常存影子回复 — 对应 `REQ-AI-001`、`REQ-KB-006` · 级别: 边缘 · 执行者: 皆可

前置：基线（Demo Shopee SG 为影子模式）；`$KB` 已备；`login owner@demo.test`；`kbup owner@demo.test "$KB/保修政策.md"` 等可用；浏览器以 owner@demo.test 登录。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 按 §3「模拟器发消息」向 Demo Shopee SG 新买家 B1 发「保修多久」；owner 在待认领打开该会话，展开「AI 影子回复（未发送）」 | 影子回复下方「依据：《保修政策.md》」 |
| 2 | AI 替身设为 `insufficient`；向 Demo Shopee SG 新买家 B2 发「这款相机防水吗」；owner 打开该会话，展开影子回复 | 有影子回复正文与「置信度 0.90」；页面上没有「资料不足」字样；会话在待认领 |

后置：`kbclear`。

#### `TC-KB-032` 知识库按角色开放 — 对应 `REQ-KB-002`、`REQ-PERM-001` · 级别: 回归 · 执行者: 皆可

前置：基线；`$KB` 已备；`login owner@demo.test`、`login agent@demo.test`；`kbup owner@demo.test "$KB/保修政策.md"` 等可用，记详情里的 `fileUrl` F。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 浏览器以 lead@demo.test 登录，打开 `/reception` | 自动跳到 `/reception/knowledge`；子导航只有「知识库」；能看到保修政策.md |
| 2 | lead 打开 `/reception/hours` | 显示「这个页面只对管理员开放」 |
| 3 | 浏览器以 agent@demo.test 登录，打开 `/reception/knowledge` | 显示「这个页面只对管理员、组长开放」 |
| 4 | `api agent@demo.test $B/api/v1/knowledge/documents`；`api agent@demo.test -X POST $B/api/v1/knowledge/test -d '{"question":"保修多久"}'` | 两个都 403，`type` 为 `/errors/forbidden` |
| 5 | `api agent@demo.test "$B<F>"` | 403，`detail` 为「知识库资料只对管理员与组长开放。」 |

后置：`kbclear`。

#### `TC-KB-033` 别的商户的资料与分类一律看不到、改不了 — 对应 `REQ-PERM-002`、`REQ-KB-004` · 级别: 回归 · 执行者: 皆可

前置：基线；`$KB` 已备；`login owner@demo.test`、`login other@demo.test`；`kbup owner@demo.test "$KB/保修政策.md"` 等可用，记资料 ID D 与 `fileUrl` F；`api owner@demo.test $B/api/v1/knowledge/categories` 记下 Demo Store「未分类」的 ID U。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | other 依次请求 `GET /api/v1/knowledge/documents/<D>`、`GET /api/v1/knowledge/documents/<D>/chunks`、`PATCH /api/v1/knowledge/documents/<D>`（体 `{"aiEnabled":false}`）、`POST /api/v1/knowledge/documents/<D>/reparse`（体 `{}`） | 4 个都 404，`type` 为 `/errors/not-found` |
| 2 | `api other@demo.test -X DELETE "$B/api/v1/knowledge/documents/<D>"` | 204（与已删除不可区分，不做任何改动） |
| 3 | `api owner@demo.test "$B/api/v1/knowledge/documents/<D>"` | 200，`status` 为 `ready`、`aiEnabled` 为 true |
| 4 | `api other@demo.test "$B<F>"`；`api other@demo.test -X PATCH $B/api/v1/knowledge/categories/<U> -d '{"name":"x"}'`；`api other@demo.test -X DELETE $B/api/v1/knowledge/categories/<U>` | 3 个都 404 |
| 5 | `api other@demo.test $B/api/v1/knowledge/documents` | `items` 为空 |

后置：`kbclear`。

#### `TC-KB-034` 知识库的写操作记审计 — 对应 `REQ-SET-005`、`REQ-KB-001`、`REQ-KB-003`、`REQ-KB-004` · 级别: 回归 · 执行者: 皆可

前置：基线；`$KB` 已备；`login owner@demo.test`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `kbup owner@demo.test "$KB/保修政策.md"` 等可用，记资料 ID D；`api owner@demo.test -X PATCH "$B/api/v1/knowledge/documents/<D>" -d '{"aiEnabled":false}'`；`api owner@demo.test -X POST "$B/api/v1/knowledge/documents/<D>/reparse" -d '{}'` 后等可用；`api owner@demo.test -X DELETE "$B/api/v1/knowledge/documents/<D>"` | 依次 201、200、202、204 |
| 2 | 新增分类「审计测试」，改名为「审计测试 2」，再删除（`POST`、`PATCH`、`DELETE /api/v1/knowledge/categories`） | 依次 201、200、200 |
| 3 | 浏览器以 owner 打开 `/settings/audit`，模块选「接待设置」 | 有林晓的「上传资料「保修政策.md」」「修改资料「保修政策.md」」「重新解析资料「保修政策.md」」「删除资料「保修政策.md」」「新增资料分类「审计测试」」「资料分类「审计测试」改名为「审计测试 2」」「删除资料分类「审计测试 2」，0 份资料归入「未分类」」，以及系统的「资料「保修政策.md」解析完成」 |

后置：无。

#### `TC-KB-035` 补扫：排队过久的重新入库，解析中断的标失败 — 对应 `REQ-KB-001` · 级别: 边缘 · 执行者: 皆可

前置：基线；`login owner@demo.test`；`pnpm scenario knowledge-queued-11m` 记资料 ID D1；`pnpm scenario knowledge-processing-26m` 记资料 ID D2；之后到第 1 步之前不要改这两份资料（改分类、站点、AI 可用都会刷新更新时间，补扫重新计时）。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `pnpm job knowledge.purge` | 输出 `"ok":true` |
| 2 | 最多等 30 秒，`api owner@demo.test "$B/api/v1/knowledge/documents/<D1>"` | `document.status` 为 `ready`；浏览器以 owner 打开 `/reception/knowledge`，D1 一行状态为「可用」 |
| 3 | `api owner@demo.test "$B/api/v1/knowledge/documents/<D2>"` | `document.status` 为 `failed`，`failureReason` 为「入库任务中断，请重新解析」 |

后置：`kbclear`。

#### `TC-KB-036` 真实检索服务与真实模型验收（跨语言检索、入库判完成、异步删除） — 对应 `REQ-KB-001`、`REQ-KB-005`、`REQ-KB-006` · 级别: 回归 · 执行者: 人工

前置：本机 `.env` 改为 `KNOWLEDGE_MODE=cloudflare`、`AI_MODE=deepseek`，填 `CLOUDFLARE_ACCOUNT_ID` 与 `CLOUDFLARE_API_TOKEN`（Bitwarden 条目 `SHOPILOT_AI_SEARCH_TOKEN`，vault 解锁由人执行）；本机走代理时 Web 与 Worker 都带 `NODE_USE_ENV_PROXY=1` 启动，通过就绪判定；基线；准备一份写明「所有相机保修 12 个月，自签收之日起计算」的文字版 PDF「保修政策.pdf」；以 owner@demo.test 登录。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 在 `/reception/knowledge` 上传保修政策.pdf，看列表 | 一般 1 分钟内变为「可用」（条目在检索服务里还显示处理中时，分块数连续两次不变即算完成），最长不超过 20 分钟 |
| 2 | 打开抽屉看「解析内容」 | 分块正文是 PDF 里的真实文字，含「保修 12 个月」 |
| 3 | 测试问答问马来语「Berapa lama waranti?」，店铺选 Demo Shopee MY | 回答说明保修 12 个月；引用《保修政策.pdf》；检索明细里改写后的问题是中文 |
| 4 | 删除这份资料，在 Cloudflare 控制台该商户实例（`sp-` 开头）的条目列表里观察 | 列表里资料立即消失；控制台里条目在约 30 秒内消失 |

后置：`.env` 改回 `KNOWLEDGE_MODE=stub`、`AI_MODE=stub`，删掉两个 Cloudflare 键的值，重启 `pnpm dev`；`pnpm job knowledge.purge '{"instance":"<sp- 开头的实例名>"}'` 删掉本次建的检索实例。

#### `TC-KB-042` 买家只发图片时不用空查询检索（已废弃） — 对应 `REQ-KB-006` · 级别: 回归 · 执行者: 皆可 · 源自缺陷 2026-10-16 买家只发图片或商品卡时知识库检索报错

已废弃，被 `TC-AI-032` 取代：DESIGN v1.22 起影子模式下买家只发图片不出稿，走不到检索；检索服务没收到空查询由 `TC-AI-032` 第 3 步检查。

前置：基线（Demo Shopee SG 为影子模式）；`$KB` 已备；`login owner@demo.test`；`kbup owner@demo.test "$KB/保修政策.md"` 等可用；`curl -s $B/api/dev/knowledge-stub | jq '.lastQuery'` 为 `null` 或 `[]`（上传不检索）。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 模拟器向 Demo Shopee SG 新买家只发一张图片（页面「发图片」不选文件即发示例图；或 `POST /api/mock/sim/create_buyer` 后 `POST /api/mock/sim/buyer_image`，multipart 只带 `conversationId`） | 推送 HTTP 200 |
| 2 | 20 秒内 `q "select status, retrieval->'routes', retrieval->>'degraded' from draft order by created_at desc limit 1"` | `shadow\|[]\|false`：影子回复已生成，检索快照没有检索记录、不标降级 |
| 3 | `curl -s $B/api/dev/knowledge-stub \| jq '.lastQuery'` | 仍为 `null` 或 `[]`：检索服务没有收到请求，没有 `query` 为空串的条目 |

后置：`kbclear`。

#### `TC-KB-043` 导入产品清单：新增、更新、跳过与逐行错误 — 对应 `REQ-KB-007` · 级别: 回归 · 执行者: 皆可

前置：基线；`login owner@demo.test`；`qaclear`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `qa owner@demo.test -X POST "$B/api/v1/products/import" -d '{"text":"物料编码,官方产品名称,别名\n1729582718312480101,竹纤维浴巾三件套,towel set;浴巾套装\n\nTMB-900,保温杯 900ml\nNONAME-1"}'` | HTTP 200；`created` 为 2，`skipped` 为 2（表头与空行），`errors` 只有一条，`line` 为 5、`message` 含「缺少官方产品名称」 |
| 2 | `qa owner@demo.test "$B/api/v1/products"` | `items` 按编码排序两条：`1729582718312480101` 名称「竹纤维浴巾三件套」、别名 `towel set`、`浴巾套装`；`TMB-900` 名称「保温杯 900ml」、别名为空 |
| 3 | `qa owner@demo.test -X POST "$B/api/v1/products/import" -d '{"text":"TMB-900,不锈钢保温杯 900ml"}'` | HTTP 200；`created` 0、`updated` 1；再列表时 `TMB-900` 名称变为「不锈钢保温杯 900ml」，别名仍为空 |
| 4 | 浏览器以 owner 打开 `/reception/knowledge?tab=products` | 清单显示两个产品，物料编码、官方名称、别名、对应平台商品数各一列 |

后置：`qaclear`。

#### `TC-KB-044` 改产品名称与别名，被问答关联的产品不能删 — 对应 `REQ-KB-007` · 级别: 回归 · 执行者: 皆可

前置：基线；`login owner@demo.test`；`qaclear`；导入一行 `TMB-900,保温杯 900ml`，记下它的 `id` 为 P。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `qa owner@demo.test -X PATCH "$B/api/v1/products/P" -d '{"aliases":["tumbler"]}'` | HTTP 200；`product.aliases` 为 `["tumbler"]`，`code` 不变 |
| 2 | `qa owner@demo.test -X POST "$B/api/v1/knowledge/qa" -d '{"questions":["保温杯能保温多久"],"answer":"保温 12 小时。","productIds":["P"],"stage":"any"}'` | HTTP 201；`qa.products` 含 TMB-900 |
| 3 | `qa owner@demo.test -X DELETE "$B/api/v1/products/P"` | HTTP 409，`type` 为 `/errors/conflict`，`code` 为 `product_in_use`，`detail` 为「有 1 条问答关联这个产品，请先在问答里去掉它再删除。」 |
| 4 | 删掉第 2 步的问答，再删 P | 两次都 HTTP 204；`qa owner@demo.test "$B/api/v1/products"` 的 `items` 为空 |

后置：`qaclear`。

#### `TC-KB-045` 同步平台商品，按卖家 SKU 对应产品，列出未对应的商品 — 对应 `REQ-KB-007` · 级别: 回归 · 执行者: 皆可

前置：基线（授予了商品读取权限的店是 Demo Shopee MY、Demo Shopee SG、Demo TikTok TH；Demo TikTok TH 的商品「ชุดผ้าขนหนูใยไผ่ 3 ผืน」卖家 SKU 为 `1729582718312480201`，同店另有 `1729582718312480202`、`1729582718312480203`）；`login owner@demo.test`；`qaclear`；Worker 在跑。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `qa owner@demo.test -X POST "$B/api/v1/products/listings/sync"` | HTTP 202；`queuedShops` 大于 0 |
| 2 | 等 20 秒，`qa owner@demo.test "$B/api/v1/products/unmapped"` | 按店分三组：Demo Shopee MY、Demo Shopee SG、Demo TikTok TH；Demo TikTok TH 一组里有 `1729582718312480201`、`1729582718312480202`、`1729582718312480203`（还没有产品清单，全部未对应） |
| 3 | 导入一行 ` 1729582718312480201 ,竹纤维浴巾三件套`（编码首尾带空格），等 20 秒 | 导入 `created` 为 1；产品列表里这个产品的 `listingCount` 为 1 |
| 4 | 再请求未对应列表 | `1729582718312480201` 不在列表里；Demo TikTok TH 一组仍有 `1729582718312480202`、`1729582718312480203` |

后置：`qaclear`。

#### `TC-KB-046` 产品清单：组长只读，员工无权 — 对应 `REQ-KB-007` · 级别: 回归 · 执行者: 皆可

前置：基线；`login lead@demo.test`；`login agent@demo.test`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `qa lead@demo.test "$B/api/v1/products"` | HTTP 200 |
| 2 | `qa lead@demo.test -X POST "$B/api/v1/products/import" -d '{"text":"X-1,测试"}'` | HTTP 403，`type` 为 `/errors/forbidden` |
| 3 | `qa agent@demo.test "$B/api/v1/products"` | HTTP 403 |
| 4 | 浏览器以 Arif 打开 `/reception/knowledge?tab=products` | 能看清单，顶部提示「产品清单由管理员导入和维护，组长可以查看。」；没有「导入产品」「同步平台商品」按钮，行上没有修改与删除操作 |

后置：无（只读请求或被拒的写请求，不留数据）。

#### `TC-KB-047` 手写问答保存即发布，字段校验 — 对应 `REQ-KB-008` · 级别: 冒烟 · 执行者: 皆可

前置：基线；`login lead@demo.test`；`login owner@demo.test`；`qaclear`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `qa lead@demo.test -X POST "$B/api/v1/knowledge/qa" -d '{"questions":["可以退货吗","怎么退货"],"answer":"签收后 7 天内可申请退货。","productIds":[],"stage":"aftersale"}'` | HTTP 201；`qa.status` 为 `published`，`source` 为 `manual`，`products` 为空，`markets` 为 `["ALL"]`，`embedded` 为 true，`version` 为 1 |
| 2 | `qa lead@demo.test -X POST "$B/api/v1/knowledge/qa" -d '{"questions":["a","a"],"answer":"x","stage":"any"}'` | HTTP 422，`type` 为 `/errors/validation`，字段错误含「问法不能重复」 |
| 3 | 同上，`questions` 为空数组 | HTTP 422，字段错误含「至少写一个问法」 |
| 4 | 浏览器以 Arif 打开 `/reception/knowledge?tab=qa` | 列表第一行是「可以退货吗」，显示「通用」、阶段售后、已发布 |

后置：`qaclear`。

#### `TC-KB-048` 编辑问答：版本冲突被拒，改问法重算向量 — 对应 `REQ-KB-008` · 级别: 回归 · 执行者: 皆可

前置：基线；`login owner@demo.test`；`qaclear`；按 `TC-KB-047` 第 1 步建一条问答，记 `id` 为 Q。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `qa owner@demo.test -X PATCH "$B/api/v1/knowledge/qa/Q" -d '{"version":1,"answer":"签收后 7 天内可申请退货，需保留包装。"}'` | HTTP 200；`version` 为 2，`status` 仍为 `published` |
| 2 | 再用 `"version":1` 改一次回复 | HTTP 409，`type` 为 `/errors/conflict`，`code` 为 `version_conflict`，`detail` 为「这条问答刚被别人改过，请刷新后再操作。」 |
| 3 | `q "select md5(embedding::text) from knowledge_qa where id = 'Q'"` 记为 H1；用 `"version":2` 把问法改成 `["支持退换吗"]` 后再查一次 | 第二次的值与 H1 不同；HTTP 200，`version` 为 3 |

后置：`qaclear`。

#### `TC-KB-049` 下架、恢复与删除问答，下架后测试问答不再命中 — 对应 `REQ-KB-008`、`REQ-KB-010` · 级别: 回归 · 执行者: 皆可

前置：基线；`login owner@demo.test`；`qaclear`；`kbclear`；按 `TC-KB-047` 第 1 步建问答 Q（阶段改为 `any`）。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `qa owner@demo.test -X POST "$B/api/v1/knowledge/test" -d '{"question":"可以退货吗"}'` | HTTP 200；`qa.merged` 有一条且 `qaId` 为 Q；`qa.hits` 里 Q 排第一，`distance` 小于 0.3（向量按全部问法拼接计算，只用其中一个问法提问不会完全重合） |
| 2 | `qa owner@demo.test -X POST "$B/api/v1/knowledge/qa/Q/archive" -d '{"version":1}'` | HTTP 200；`status` 为 `archived` |
| 3 | 重复第 1 步 | HTTP 200；`qa` 为 `null`（商户没有已发布问答时不做问答检索），没有命中 Q |
| 4 | 再下架一次（`"version":2`） | HTTP 409，`code` 为 `invalid_state` |
| 5 | `/restore`（`"version":2`），再重复第 1 步 | 恢复后 `status` 为 `published`；测试问答再次命中 Q |
| 6 | `qa owner@demo.test -X DELETE "$B/api/v1/knowledge/qa/Q"` 两次 | 第一次 HTTP 204；第二次 HTTP 404 `/errors/not-found`；再查 Q 返回 404 |

后置：`qaclear`。

#### `TC-KB-050` 资料整理成问答候选：状态、守卫与产品只从清单选 — 对应 `REQ-KB-009` · 级别: 回归 · 执行者: 皆可

前置：基线；`$KB` 已备；`login owner@demo.test`；`qaclear`；`kbclear`；导入一行 `TMB-900,保温杯 900ml`；Worker 在跑；AI 替身设为 `normal`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `kbup owner@demo.test "$KB/保修政策.md"` 后立即对它 `POST $B/api/v1/knowledge/documents/<ID>/qa-extract` | HTTP 409，`code` 为 `not_ready`，`detail` 为「这份资料还在解析，解析完成后再整理。」 |
| 2 | 等资料可用，再发起整理 | HTTP 202；`document.qaExtract.status` 为 `running` |
| 3 | 立刻再发起一次 | HTTP 409，`code` 为 `extract_running` |
| 4 | 每 2 秒查资料，60 秒内 | `qaExtract.status` 变为 `done`，`count` 大于 0 |
| 5 | `qa owner@demo.test "$B/api/v1/knowledge/qa?status=pending&documentId=<ID>"` | 条数等于 `count`；每条 `source` 为 `import`、`sourceDocument.name` 为「保修政策.md」、`sourceExcerpt` 非空、`markets` 与资料相同；`products` 只含清单里的产品或为空 |
| 6 | 浏览器打开 `/reception/knowledge?tab=review` | 页签「待审核」后面的数字等于候选数；列出这些候选，每条有「通过」「改后通过」「驳回」，可展开原文片段 |

后置：`qaclear`；`kbclear`。

#### `TC-KB-051` 重新整理先删旧候选，疑似重复并排显示 — 对应 `REQ-KB-009` · 级别: 边缘 · 执行者: 皆可

前置：先执行 `TC-KB-050` 第 1–4 步（不做后置），记下候选 ID 集合 C1；任选一条候选的第一个问法 X。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 以 X 为问法手写一条已发布问答（阶段 `any`） | HTTP 201 |
| 2 | 对同一份资料再发起整理，等 `done` | 待审核候选的 ID 与 C1 没有交集（旧候选已删） |
| 3 | 找问法为 X 的新候选 | `duplicateOf.id` 是第 1 步那条问答，`duplicateOf.status` 为 `published` |
| 4 | 浏览器打开待审核页签里这条候选 | 候选与已有问答并排显示 |

后置：`qaclear`；`kbclear`。

#### `TC-KB-052` 审核：改后通过、驳回，资料提示可关掉 AI 可用 — 对应 `REQ-KB-009` · 级别: 回归 · 执行者: 皆可

前置：先执行 `TC-KB-050` 第 1–4 步（不做后置）；取两条候选 A、B 与各自的 `version`；`login lead@demo.test`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `qa lead@demo.test -X POST "$B/api/v1/knowledge/qa/A/approve" -d '{"version":<A 的版本>,"questions":["保修期多长"],"stage":"any"}'` | HTTP 200；`status` 为 `published`，`questions` 为「保修期多长」，`reviewedByName` 为 Arif Rahman，`embedded` 为 true |
| 2 | 用同一个旧版本号再通过 A | HTTP 409，`code` 为 `version_conflict` |
| 3 | `qa lead@demo.test -X POST "$B/api/v1/knowledge/qa/B/reject" -d '{"version":<B 的版本>,"reason":"与政策不符"}'` | HTTP 200；`status` 为 `rejected`，`rejectReason` 为「与政策不符」 |
| 4 | 查资料 | `publishedQaCount` 为 1，`aiEnabled` 仍为 true |
| 5 | 浏览器打开资料页签 | 这份资料行下写「已有 1 条问答由它整理发布，可以关掉这份资料的「AI 可用」，让 AI 只引用审核过的问答。」 |

后置：`qaclear`；`kbclear`。

#### `TC-KB-053` 出稿先查问答：编号在资料前，按站点、阶段与产品过滤 — 对应 `REQ-KB-010` · 规则 `RULE-KB-004` · 级别: 冒烟 · 执行者: 皆可

前置：基线（Demo Shopee MY 工作时间内为 assist）；`$KB` 已备；`login owner@demo.test`；`qaclear`；`kbclear`；`kbup owner@demo.test "$KB/保修政策.md"` 等可用；导入 `1729582718312480101,竹纤维浴巾三件套,towel set` 与 `TMB-900,保温杯 900ml`，记产品 ID 为 T 与 M；用 `POST /api/v1/knowledge/qa` 建四条已发布问答：
- QA1：问法「towel set 可以退货吗」，产品 T，阶段 `any`，站点全部
- QA2：问法「towel set 可以退货吗」，产品 M，阶段 `any`，站点全部
- QA3：问法「towel set 可以退货吗」，不选产品，阶段 `any`，站点 `["TH"]`
- QA4：问法「towel set 可以退货吗」，不选产品，阶段 `aftersale`，站点全部

浏览器 B 打开模拟器。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | B：选 Demo Shopee MY、新建买家，发「towel set 可以退货吗」 | 推送日志新增一条，HTTP 200 |
| 2 | 20 秒内看「AI 替身」面板「最近一次请求」的 user 载荷 | `knowledge` 第一项标题为「问答：towel set 可以退货吗」，正文以「问：」开头；问答在资料「保修政策.md」之前 |
| 3 | `q "select retrieval->'qa' from draft d join conversation c on c.id = d.conversation_id where c.buyer_name = '<新建买家名>' order by d.created_at desc limit 1"` | `productIds` 只含 T；`merged` 的 `qaId` 只有 QA1（QA2 产品不符、QA3 站点不符、QA4 阶段不符：新会话本店无订单，阶段为售前） |
| 4 | 以 Nur 打开该会话 | 草稿下方「依据：」里有一项「问答「towel set 可以退货吗」」 |

后置：`qaclear`；`kbclear`。

#### `TC-KB-054` 测试问答带问答命中，可选阶段与产品 — 对应 `REQ-KB-005`、`REQ-KB-010` · 级别: 回归 · 执行者: 皆可

前置：与 `TC-KB-053` 相同的问答与产品（不需要资料）；`login owner@demo.test`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `qa owner@demo.test -X POST "$B/api/v1/knowledge/test" -d '{"question":"towel set 可以退货吗","stage":"presale","productId":"M"}'` | HTTP 200；`qa.stage` 为 `presale`，`qa.productIds` 为 `["M"]`；`qa.merged` 含 QA2 与 QA3、不含 QA1 与 QA4；`qa.latencyMs` 为数字 |
| 2 | 不带阶段与产品再问一次 | `qa.stage` 为 null；四条都可能出现在 `qa.hits`（不按阶段与产品过滤，没选店铺不看站点） |
| 3 | 浏览器打开测试问答页签，同样提问 | 问答命中与资料命中分两块显示，问答命中显示问法与距离 |

后置：`qaclear`。

#### `TC-KB-055` 员工不能读写问答 — 对应 `REQ-KB-008` · 级别: 回归 · 执行者: 皆可

前置：基线；`login agent@demo.test`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `qa agent@demo.test "$B/api/v1/knowledge/qa"` | HTTP 403，`type` 为 `/errors/forbidden` |
| 2 | `qa agent@demo.test -X POST "$B/api/v1/knowledge/qa" -d '{"questions":["a"],"answer":"b","stage":"any"}'` | HTTP 403 |

后置：无（只读请求或被拒的写请求，不留数据）。

#### `TC-KB-056` 线上真实向量化：手写问答可被测试问答检索到 — 对应 `REQ-KB-010` · 级别: 回归 · 执行者: 人工

前置：线上 shopilot.live；管理员账号；`KNOWLEDGE_MODE=cloudflare`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 在知识库「问答」页签新建一条通用问答，问法「Tail 2 有没有内置麦克风」，回复按实际产品填写 | 保存后提示「已发布新问答」，且没有「检索向量稍后在后台补上，最多 5 分钟后 AI 才能检索到」的说明；列表里这条没有「检索向量生成中，最多 5 分钟后 AI 才能检索到」 |
| 2 | 在测试问答里问「Does Tail 2 have a built-in mic」 | 问答命中里出现这条，距离小于 0.55，回答引用它 |
| 3 | 下架这条问答后再问一次 | 问答命中里不再有它 |

后置：删除这条问答。

#### `TC-KB-057` 工作台草稿依据显示问答，下架后标「已下架」 — 对应 `REQ-KB-010` · 级别: 回归 · 执行者: 皆可

前置：先执行 `TC-KB-053` 第 1–4 步（不做后置）；浏览器 A 以 Nur、浏览器 C 以 owner 打开同一会话。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | A：看草稿依据 | 「问答「towel set 可以退货吗」」是普通文字，点了不跳转 |
| 2 | C：点同一项依据 | 新开标签，地址为 `/reception/knowledge?tab=qa&qa=<QA1 的 ID>`，问答页签打开这条问答的编辑弹窗 |
| 3 | 下架 QA1，A、C 刷新会话 | 依据变为「问答「towel set 可以退货吗」（已下架）」，C 也不能点开 |

后置：`qaclear`；`kbclear`。

#### `TC-KB-058` 写卡：步骤与分支、校验、测试这张卡，保存即发布 — 对应 `REQ-KB-011` · 级别: 冒烟 · 执行者: 皆可

前置：基线；`login owner@demo.test`；`cardclear`；浏览器以 owner（林晓）登录。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 打开 `/reception/knowledge?tab=cards` | 页签「经验卡」选中；空态标题「还没有经验卡」，有「新建经验卡」按钮 |
| 2 | 点「新建经验卡」 | 弹窗标题「新建经验卡」；有「标题与目标」「调用条件」「处理步骤」「沟通提示（选填）」「产品」「服务阶段」「适用站点」「关联问答（选填）」「标签（选填）」；底部主按钮「发布」 |
| 3 | 按 §3「卡 K」填写：标题、调用条件 1 条（全部满足）、3 个步骤；第 1 步「加分支」，如果「急用」怎么办选「转人工」；第 2 步「加分支」，如果「保修」选「建工单」；服务阶段「全部阶段」；沟通提示 | 每一步左侧有步号 1、2、3；分支行显示条件与动作 |
| 4 | 在弹窗里「测试这张卡」一节输入「摄像头识别不到，我急用」，点「测试」 | 数秒内出结果：「用到了这张卡：第 1 步 · 转人工」，下方「按当前设置这条会转人工。」 |
| 5 | 点「发布」 | 提示「已发布新经验卡」；列表出现一行：标题，下方「全部满足：买家说摄像头识别不到」，再下「3 步 · 第 1 版」；页头「已发布 1」 |
| 6 | `api owner@demo.test "$B/api/v1/knowledge/cards"` | `HTTP 200`；`counts.published` 为 1；唯一一项 `version` 1、`status` `published`、`source` `member`、`embedded` true、`steps` 3 项、`agentUnseen` false |
| 7 | `api owner@demo.test -X POST $B/api/v1/knowledge/cards -d '{"title":"x","stage":"any","conditions":["a"],"conditionMode":"all","steps":[{"text":"一","branches":[{"when":"x","action":"goto","goto":1}]},{"text":"二","branches":[]}]}'` | `HTTP 422` `/errors/validation`；`extra.fields` 里 `steps.0.branches.0.goto` 为「跳到的步骤要是本卡里的另一步」 |
| 8 | 同第 7 步，把 `conditions` 改成 `[]`、`steps` 改成 `[]` | `HTTP 422`；`extra.fields` 有 `conditions`「至少写一条调用条件」与 `steps`「至少写一个步骤」 |

后置：`cardclear`。

#### `TC-KB-059` 改卡写新版本、版本对比、内容不变不写版本、并发 409、回退 — 对应 `REQ-KB-011` · 级别: 回归 · 执行者: 皆可

前置：基线；`login owner@demo.test`；`cardclear`；`cardk` 记卡 ID 为 K；浏览器以林晓打开 `/reception/knowledge?tab=cards&card=<K>`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 看卡抽屉 | 显示「调用条件（全部满足）」「处理步骤」3 步与分支、「沟通提示」「适用范围」「近 30 天效果」（「近 30 天 AI 出稿还没有用到这张卡。」）；版本列表一行「第 1 版」、作者林晓，标「当前」 |
| 2 | 点「编辑」，把沟通提示改为「先安抚，再一步步排查」，点「保存」 | 提示「已保存为第 2 版」；抽屉版本列表最上面一行是「第 2 版」、作者林晓，标「当前」 |
| 3 | 在「对比」里旧版本选第 1 版、新版本选第 2 版 | 只列出「沟通提示」一项，改前「每次只让买家做一步」，改后「先安抚，再一步步排查」 |
| 4 | 再点「编辑」，不改任何内容直接「保存」 | 提示「内容没有变化」；版本仍是第 2 版 |
| 5 | `api owner@demo.test -X PATCH $B/api/v1/knowledge/cards/<K> -d "{\"version\":1,\"card\":$(cat $SP_TMP/card-k.json)}"` | `HTTP 409` `/errors/conflict`，`code` `version_conflict`，`detail`「这张经验卡刚被别人改过，请刷新后再操作。」 |
| 6 | 抽屉里第 1 版那行点「回退到这一版」 | 确认框标题「回退到第 1 版？」，正文写「用第 1 版的内容保存为新的第 3 版并立即生效……」 |
| 7 | 点「回退」 | 提示「已回退到第 1 版，保存为第 3 版」；沟通提示变回「每次只让买家做一步」 |
| 8 | `api owner@demo.test $B/api/v1/knowledge/cards/<K>` | `card.version` 3；`versions` 依次为 3、2、1，第 3 版 `note`「回退到第 1 版」、`author` `member` |

后置：`cardclear`。

#### `TC-KB-060` 下架、恢复与删除，下架的卡不参与出稿 — 对应 `REQ-KB-011` · 级别: 回归 · 执行者: 皆可

前置：基线；`login owner@demo.test`；`cardclear`；`cardk` 记为 K；浏览器以林晓打开卡 K 的抽屉。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 点「下架」 | 提示「已下架，AI 出稿不再用这张卡」；抽屉标「已下架」 |
| 2 | `api owner@demo.test $B/api/v1/knowledge/cards/<K>` | `card.status` `archived`；`card.version` 仍是 1；`versions` 只有 1 项 |
| 3 | `api owner@demo.test -X POST $B/api/v1/knowledge/test -d '{"question":"摄像头识别不到，怎么办"}'` | `HTTP 200`；`card` 为 null |
| 4 | 点「恢复发布」，再重复第 3 步 | 提示「已恢复发布」；第 3 步的 `card.cardId` 为 K、`step` 1 |
| 5 | `api owner@demo.test -X POST $B/api/v1/knowledge/cards/<K>/restore -d '{"version":1}'` | `HTTP 409`，`code` `invalid_state` |
| 6 | 点「删除」 | 确认框「删除经验卡「摄像头识别不到：帮买家恢复使用」？」，写明版本记录一起删掉 |
| 7 | 点确认框里的「删除」 | 提示「已删除经验卡「摄像头识别不到：帮买家恢复使用」」；列表回到空态 |
| 8 | `api owner@demo.test $B/api/v1/knowledge/cards/<K>` | `HTTP 404` |

后置：无。

#### `TC-KB-061` 辅助草稿按卡出稿：显示卡与第几步、同段接着走、员工只看文字 — 对应 `REQ-KB-012` · 级别: 冒烟 · 执行者: 皆可

前置：基线；按 §3「固定为工作时间内」；`login owner@demo.test`；`cardclear`；`cardk` 记为 K。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `X=$(newbuyer shopee 220001 "Card Draft A")`；`say $X "摄像头识别不到，怎么办"`；`waitq "select d.id from draft d join conversation c on c.id = d.conversation_id where c.buyer_name = 'Card Draft A' and d.status = 'generated'"` | 输出草稿 ID |
| 2 | `q "select d.card_id, d.card->>'step', d.card->>'action' from draft d join conversation c on c.id = d.conversation_id where c.buyer_name = 'Card Draft A'"` | `<K>\|1\|continue` |
| 3 | 林晓打开该会话（`/wb/$(conv "Card Draft A")`） | 草稿下方一行「经验卡：「摄像头识别不到：帮买家恢复使用」 · 第 1 步」，标题是链接；点「看理由」展开「用卡理由：替身：调用条件成立」 |
| 4 | 点卡标题 | 新标签打开 `/reception/knowledge?tab=cards&card=<K>`，卡抽屉显示卡 K |
| 5 | `say $X "换了线还是不行"`，等新草稿出现 | 新草稿那行是「· 第 2 步」；库里新草稿 `card->>'step'` 为 2 |
| 6 | 浏览器以 Nur（agent@demo.test）打开同一会话 | 看到同一行文字，卡标题不是链接 |

后置：无。

#### `TC-KB-062` 按卡转人工与辅助模式「按卡建工单」 — 对应 `REQ-KB-012` · 级别: 回归 · 执行者: 皆可

前置：基线；按 §3「固定为工作时间内」；`login owner@demo.test`；`cardclear`；`cardk` 记为 K；浏览器以林晓登录。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `X=$(newbuyer shopee 220001 "Card Handoff A")`；`say $X "摄像头识别不到，我急用"`；`waitq "select handling_state \|\| '\|' \|\| handoff_reason from conversation where buyer_name = 'Card Handoff A' and handling_state = 'awaiting_human'"` | `awaiting_human\|card` |
| 2 | `q "select count(*) from draft d join conversation c on c.id = d.conversation_id where c.buyer_name = 'Card Handoff A'"`；`q "select data->>'reason', data->>'card_id' from audit_log where action = 'handoff' and target_id = '$(conv "Card Handoff A")'"` | 草稿数 0；审计一行 `card\|<K>` |
| 3 | 林晓打开该会话 | 时间线有系统消息「转人工：经验卡要求转人工」；会话头显示待认领 · 经验卡要求转人工 |
| 4 | `Y=$(newbuyer shopee 220001 "Card Ticket A")`；`say $Y "摄像头识别不到"`，等草稿出现；再 `say $Y "这台还在保修期内"`，等新草稿出现 | 新草稿那行「经验卡：「摄像头识别不到：帮买家恢复使用」 · 第 2 步 · 按卡建工单」；草稿按钮多一个「按卡建工单」 |
| 5 | 点「按卡建工单」 | 弹窗「建工单」：类型已选「内部确认」，说明预填「摄像头识别不到：帮买家恢复使用：替身：保修」，「关联当前会话（Card Ticket A）」已勾选 |
| 6 | 点弹窗的建单按钮 | 提示建成；`q "select type, description from ticket where conversation_id = '$(conv "Card Ticket A")'"` 为 `internal\|摄像头识别不到：帮买家恢复使用：替身：保修` |

后置：无。

#### `TC-KB-063` 自动模式按卡建工单后转人工、按卡转人工发回复 — 对应 `REQ-KB-012` · 级别: 回归 · 执行者: 皆可

前置：基线；按 §3「固定为工作时间外」（Demo TikTok MY 工作时间外为 auto）；`login owner@demo.test`；`cardclear`；`cardk` 记为 K。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `X=$(newbuyer tiktok 7000001 "Card Auto A")`；`say $X "摄像头识别不到"`；`waitq "select d.status from draft d join conversation c on c.id = d.conversation_id where c.buyer_name = 'Card Auto A' and d.status = 'sent'"` | `sent`；会话 `handling_state` 仍为 `bot`；草稿 `card->>'step'` 为 1 |
| 2 | `say $X "这台还在保修期内"`；`waitq "select handling_state \|\| '\|' \|\| handoff_reason from conversation where buyer_name = 'Card Auto A' and handling_state = 'awaiting_human'"` | `awaiting_human\|card` |
| 3 | `q "select type, origin, description from ticket where conversation_id = '$(conv "Card Auto A")'"`；`q "select count(*) from message where conversation_id = '$(conv "Card Auto A")' and sender_role = 'ai'"` | 工单一行 `internal\|rule\|摄像头识别不到：帮买家恢复使用：替身：保修`；AI 发出的消息共 2 条（第 1、2 步各一条，没有另发安抚句） |
| 4 | `Y=$(newbuyer tiktok 7000001 "Card Auto B")`；`say $Y "摄像头识别不到，我急用"`；等会话进入待认领 | `handoff_reason` 为 `card`；模拟器里买家 B 收到 1 条卖家消息（模型的回复作安抚句）；`q "select count(*) from draft d join conversation c on c.id = d.conversation_id where c.buyer_name = 'Card Auto B'"` 为 0 |

后置：按 §3「固定为工作时间内」。

#### `TC-KB-064` 影子模式只记录用卡；卡下架后草稿标「已下架」 — 对应 `REQ-KB-012` · 级别: 回归 · 执行者: 皆可

前置：基线；`login owner@demo.test`；`cardclear`；`cardk` 记为 K；浏览器以林晓登录。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `X=$(newbuyer shopee 220002 "Card Shadow A")`；`say $X "摄像头识别不到，我急用"`；`waitq "select d.card->>'action' from draft d join conversation c on c.id = d.conversation_id where c.buyer_name = 'Card Shadow A' and d.status = 'shadow'"` | `handoff` |
| 2 | `q "select handling_state, handoff_reason from conversation where buyer_name = 'Card Shadow A'"` | `awaiting_human\|shadow`（没有改成 card） |
| 3 | 林晓打开该会话，展开影子回复 | 影子回复里一行「经验卡：「摄像头识别不到：帮买家恢复使用」 · 第 1 步 · 按卡转人工」 |
| 4 | `api owner@demo.test -X POST $B/api/v1/knowledge/cards/<K>/archive -d '{"version":1}'`，刷新会话 | 那一行变为「经验卡：「摄像头识别不到：帮买家恢复使用」（已下架） · 第 1 步 · 按卡转人工」，标题不是链接 |

后置：`cardclear`。

#### `TC-KB-065` 卡的近 30 天效果：调用、采纳、转人工 — 对应 `REQ-KB-011`、`REQ-KB-012` · 级别: 回归 · 执行者: 皆可

前置：基线；按 §3「固定为工作时间内」；`login owner@demo.test`、`login agent2@demo.test`；`cardclear`；`cardk` 记为 K。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 对买家名 Stat A、Stat B、Stat C 各执行 `newbuyer shopee 220001 <名>` 并 `say <ID> "摄像头识别不到"`；Stat D 执行 `say <ID> "摄像头识别不到，我急用"`；等 A、B、C 各有一份待审草稿、D 进入待认领 | 三份草稿 `card_id` 都是 K |
| 2 | 取 A 的草稿 ID 与正文，`api agent2@demo.test -X POST $B/api/v1/conversations/<A>/messages -d '{"clientRequestId":"stat-card-a","type":"text","text":"<草稿正文>","draftId":"<A 草稿>","disposition":"sent"}'`；B 同样发，`clientRequestId` 为 `stat-card-b`，正文末尾加「（已改）」、`disposition` 为 `edited_sent`；`api agent2@demo.test -X POST $B/api/v1/conversations/<C>/drafts/<C 草稿>/ignore` | 前两次 `HTTP 201`，第三次 `HTTP 200` |
| 3 | `api owner@demo.test $B/api/v1/knowledge/cards/<K>` | `card.stats` 为 `calls` 4、`sent` 1、`edited` 1、`ignored` 1、`handoffs` 1 |
| 4 | 林晓打开卡 K 的抽屉看「近 30 天效果」 | 调用「4 次」；采纳率「67%」，注「原样 1 · 改后 1 · 弃用 1」；转人工率「25%」，注「转人工或建工单 1 次」 |
| 5 | 看「经验卡」列表这一行的「近 30 天」 | 「调用 4 次」，下方「采纳 67% · 转人工 25%」 |

后置：`cardclear`。

#### `TC-KB-066` 员工提交学习：勾选消息与备注、「已提交学习」与进度、校验与限流 — 对应 `REQ-KB-013` · 级别: 冒烟 · 执行者: 皆可

前置：基线；`login agent2@demo.test`；`cardclear`；`X=$(newbuyer shopee 220001 "Learn A")`；`say $X "设备坏了想换货"`；等「AI 草稿」里出现该会话；浏览器以 Mei Lin（agent2@demo.test）打开该会话并点「认领」，回复一句「好的，给您安排换货」。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 点会话头的「提交学习」按钮 | 按钮呈按下状态；时间线每条消息左侧出复选框；输入框换成底部条「提交学习」，写着「勾选能说明这次怎么处理的消息……」 |
| 2 | 勾选买家「设备坏了想换货」与本方「好的，给您安排换货」，备注填「换货流程要记下来」，点「提交」 | 提示「已提交学习」，说明「AI 分析后，组长或管理员会在知识库「学习」页签审核。」；选择模式退出，两条消息下方各标「已提交学习」 |
| 3 | 等 10 秒后刷新会话 | 两条消息下方标「已提交学习 · 待审核」 |
| 4 | `api agent2@demo.test $B/api/v1/conversations/$(conv "Learn A")/learning` | `HTTP 200`；`items` 1 项，`source` `member`，`status` `pending_review`，`messageIds` 是这两条消息、`submittedByName` 为 Mei Lin |
| 5 | 等 60 秒，再以 `{"messageIds":["<买家那条>"]}` 连续调用 `api agent2@demo.test -X POST $B/api/v1/conversations/$(conv "Learn A")/learning` 6 次 | 前 5 次 `HTTP 201`；第 6 次 `HTTP 429` `/errors/rate-limited`，`detail`「同一个会话每分钟最多提交 5 次学习，请稍后再试。」 |
| 6 | 等 60 秒，以 `{"messageIds":["<任意另一会话的消息 ID>"]}` 提交 | `HTTP 422` `/errors/validation`，`detail`「有消息不属于这个会话，请刷新后重新勾选。」 |

后置：无。

#### `TC-KB-067` 新卡：内部测试、审核改内容、复测通过才能发布 — 对应 `REQ-KB-013` · 级别: 冒烟 · 执行者: 皆可

前置：先执行 `TC-KB-066` 第 1–3 步（不做后续步骤）；`login owner@demo.test`；浏览器以林晓登录。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 打开 `/reception/knowledge?tab=learning` | 页签「学习」带待审核数 1；列表一行「Learn A · Demo Shopee MY」，下方「「设备坏了想换货」」与「客服提交（Mei Lin） · 流程需要补充」，状态「待审核」 |
| 2 | 点这一行 | 任务抽屉依次有「原始消息」（勾选的两条标「（已勾选）」）、「背景」（产品「没识别到」与「待确认产品：在下方的建议内容里选定」）、「判断依据与建议」（「替身：按关键词判断」）、「相似内容」、「测试结果」（「改前（现有知识）」写「没有用经验卡」，「改后（加上这张卡）」写「经验卡：替身：设备坏了想换货 · 第 1 步 · 继续处理」）、「建议更新内容」（标题「替身：设备坏了想换货」） |
| 3 | 看底部 | 「复测：当前内容还没复测，复测通过才能发布」；「发布」不可点 |
| 4 | `api owner@demo.test -X POST $B/api/v1/knowledge/learning/<任务 ID>/publish -d "{\"version\":<任务 version>,\"card\":<任务 proposal>}"` | `HTTP 409`，`code` `retest_required`，`detail`「内容改过后还没复测通过，请先复测。」 |
| 5 | 把标题改为「换货流程：设备故障时安排换货」，点「复测」 | 数秒到 40 秒内提示「复测通过，可以发布」；底部「复测：当前内容已复测通过」；复测区「原问题（用拟发布的内容）」用到这张卡；「发布」可点 |
| 6 | 把沟通提示改为「先确认订单号」 | 底部变回「复测：当前内容还没复测，复测通过才能发布」，「发布」不可点 |
| 7 | 点「复测」，通过后点「发布」 | 提示「已发布经验卡「换货流程：设备故障时安排换货」」；任务状态「已发布」，结论写「林晓 审核后新建了」这张卡 |
| 8 | `api owner@demo.test "$B/api/v1/knowledge/cards?q=换货流程"` | 一张卡，`version` 1、`source` `member`、`tips`「先确认订单号」 |
| 9 | Mei Lin 刷新会话 | 两条消息下方标「已提交学习 · 新建了经验卡」 |

后置：`cardclear`。

#### `TC-KB-068` Agent 改已有卡：复测通过写 Agent 版本、标还没人看过、标为已看 — 对应 `REQ-KB-013`、`REQ-KB-011` · 级别: 冒烟 · 执行者: 皆可

前置：基线；`login owner@demo.test`、`login agent2@demo.test`；`cardclear`；`cardk` 记为 K；`X=$(newbuyer shopee 220001 "Learn B")`；`say $X "摄像头识别不到，换线也没用"`；Mei Lin 认领并回复「请装最新的配套软件试试」；浏览器以林晓登录。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `api agent2@demo.test -X POST $B/api/v1/conversations/$(conv "Learn B")/learning -d '{"messageIds":["<买家那条消息 ID>"]}'` 记任务 ID 为 T；`waitq "select status from learning_task where id = '<T>' and status <> 'analyzing'"` | `HTTP 201`；状态 `published` |
| 2 | `api owner@demo.test $B/api/v1/knowledge/cards/<K>` | `card.version` 2，`agentUnseen` true，`lastAuthor` `agent`，`steps` 4 项、最后一步「替身补充的一步」；`versions[0]` 的 `author` `agent`、`learningTaskId` 为 T、`retest.passed` true |
| 3 | 林晓打开 `/reception/knowledge?tab=cards` | 页签「经验卡」带数字 1；卡 K 那行标「Agent 改过，未看」，最近改动「Agent」；打开「Agent 改过未看」开关后只列卡 K |
| 4 | 打开卡 K 抽屉 | 版本列表最上面一行「第 2 版」、作者「Agent」，下方「复测通过 · 回归用例 0 个」；有「标为已看」按钮 |
| 5 | 点「标为已看」 | 提示「已标为看过」；「Agent 改过，未看」标记消失，页签数字消失；`api owner@demo.test $B/api/v1/knowledge/cards/<K>` 的 `versions[0].seenByName` 为林晓 |
| 6 | 打开 `/reception/knowledge?task=<T>` | 停在「学习」页签并打开任务 T：状态「已发布」，结论写「Agent 复测通过后直接改了」卡 K（第 2 版），并提示可在经验卡里查看改前改后或一键回退 |

后置：`cardclear`。

#### `TC-KB-069` Agent 改卡复测没通过：任务结束、卡不变 — 对应 `REQ-KB-013` · 级别: 回归 · 执行者: 皆可

前置：基线；`login owner@demo.test`、`login agent2@demo.test`；`cardclear`；`cardk` 记为 K；浏览器以林晓登录。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `X=$(newbuyer shopee 220001 "Learn C")`；`say $X "摄像头识别不到，用了一周越来越变差"`；Mei Lin 认领后对买家那条消息提交学习（接口同 `TC-KB-068` 第 1 步），等任务结束 | 任务 `published`、结论 `card_updated`；卡 K 为第 2 版 |
| 2 | `Y=$(newbuyer shopee 220001 "Learn D")`；`say $Y "摄像头识别不到，还是不行"`；同样提交学习，记任务 ID 为 T2，等任务结束 | T2 `status` `closed`、`result` `retest_failed` |
| 3 | `api owner@demo.test $B/api/v1/knowledge/cards/<K>` | `card.version` 仍为 2 |
| 4 | 林晓打开 `/reception/knowledge?task=<T2>` | 状态「已结束」，结论写「Agent 想改「摄像头识别不到：帮买家恢复使用」，复测没通过，卡没有改动。」；复测区有一条以前测过的问题「摄像头识别不到，用了一周越来越变差」，标「改后变差」 |

后置：`cardclear`。

#### `TC-KB-070` 审核结论：已有内容覆盖、驳回、无需更新 — 对应 `REQ-KB-013` · 级别: 回归 · 执行者: 皆可

前置：基线；`login owner@demo.test`、`login agent2@demo.test`；`cardclear`；新建买家 Learn E、Learn F、Learn G（Demo Shopee MY），各 `say` 一句：E「设备坏了想换货」、F「设备坏了想退货」、G「设备坏了想维修」；Mei Lin 认领三个会话；浏览器以林晓登录。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 对 E 提交学习，`note` 为「这个无需记」，等任务结束 | 任务 `closed`、诊断 `covered`、结论 `none_needed`；「学习」列表这一行写「客服提交（Mei Lin） · 已有内容覆盖 · 无需更新」 |
| 2 | 对 F、G 各提交学习，等两个任务都进待审核 | 两个任务 `pending_review` |
| 3 | 打开 F 的任务，点「驳回」，原因填「不是通用流程」，确认 | 确认框标题「驳回这个学习任务？」；提示「已驳回」；任务「已结束」，结论处显示「原因：不是通用流程」 |
| 4 | 打开 G 的任务，点「无需更新」并确认 | 提示「已标为无需更新」；任务「已结束」 |
| 5 | 在「学习」页签按结论筛「已驳回」 | 只列 F |
| 6 | `api owner@demo.test -X POST $B/api/v1/knowledge/learning/<G 的任务>/reanalyze -d '{"version":<G 的 version>}'` | `HTTP 409`，`code` `invalid_state` |

后置：无。

#### `TC-KB-071` Agent 每天挑会话：按信号挑段、不重复挑 — 对应 `REQ-KB-013` · 级别: 回归 · 执行者: 皆可

前置：基线；`login agent2@demo.test`；`cardclear`；`X=$(newbuyer shopee 220001 "Pick A")`；`say $X "我要转人工"`（命中转人工关键词「转人工」）；Mei Lin 认领并回复「您好，我来处理」，再点会话头的「结束会话」并在弹窗里点「结束会话」；记 Demo Store 商户 ID 为 M。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `q "select handed_off, human_replied, ended_at is not null from segment where conversation_id = '$(conv "Pick A")'"` | `t\|t\|t` |
| 2 | `pnpm job learning.pick "{\"merchantId\":\"<M>\"}"` | 输出 `"ok":true` |
| 3 | `waitq "select source \|\| '\|' \|\| status from learning_task where conversation_id = '$(conv "Pick A")' and status <> 'analyzing'"` | `agent\|pending_review` |
| 4 | 林晓打开 `/reception/knowledge?tab=learning`，按来源筛「Agent 挑选」 | 有「Pick A · Demo Shopee MY」这一行，来源写「Agent 挑选」；打开后「原始消息」标「Agent 挑的整段会话」 |
| 5 | 再执行第 2 步 | `q "select count(*) from learning_task where conversation_id = '$(conv "Pick A")'"` 仍为 1 |

后置：无。

### 看板

#### `TC-DASH-001` 组长的看板只含负责店铺 — 对应 `REQ-DASH-001` · 级别: 回归 · 执行者: 皆可

前置：基线；`login lead@demo.test`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | Arif 打开 `/dashboard`，范围选「近 7 天」 | 会话段数、人工首响平均、草稿处置、按人统计、工单区都有数据或空态；平台指标分 Shopee、TikTok 两张表，各自写明口径，只出现 Demo Shopee MY、Demo TikTok MY |
| 2 | `api lead@demo.test "$B/api/v1/dashboard?range=7d"` | `platformMetrics` 的店铺只有 Demo Shopee MY、Demo TikTok MY |
| 3 | owner 打开同一范围的看板 | 平台指标出现 4 家店；会话段数不小于 Arif 看到的值 |

后置：无。

#### `TC-DASH-002` 员工访问看板被拒 — 对应 `REQ-DASH-001` · 级别: 回归 · 执行者: 皆可

前置：基线；以 agent@demo.test 登录。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 打开 `/dashboard` | 原位显示「这个页面只对管理员、组长开放」与返回工作台的入口 |

后置：无。

#### `TC-DASH-003` 看板数字随操作变化，切换范围与导出 — 对应 `REQ-DASH-001` · 级别: 回归 · 执行者: 皆可

前置：基线；owner 打开 `/dashboard`「本月」，记下草稿的发送数 S0、忽略数 I0 与转人工原因「人工」的次数 M0。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 向 Demo Shopee MY 两个新买家各发一条；Nur 对第一份草稿点「认领并发送」，对第二份点「忽略」 | 两个操作都完成 |
| 2 | owner 刷新看板 | 发送为 S0 + 1，忽略为 I0 + 1，转人工原因「人工」为 M0 + 1 |
| 3 | 范围改为「近 90 天」 | 页面重新加载数据，不报错 |
| 4 | 点「导出报表」 | 下载 CSV，含会话段数、Shopilot 回复、平台后台回复、草稿处置、影子回复与工单无时限的列 |

后置：无。

#### `TC-DASH-004` 看板对照原型与数据不足态 — 对应 `REQ-DASH-001` · 级别: 回归 · 执行者: 人工

前置：基线；导出 Quilt 原型；新注册一个商户。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | owner@demo.test 打开 `/dashboard` 与原型 `/dashboard` 对照 | 卡片、图表类型、文案一致；图表为 Chart.js 渲染；原型里「去补资料」「去核验」不出现 |
| 2 | 新商户打开 `/dashboard` | 比率类指标显示数据不足，而不是 0% 或 100% |

后置：无。

#### `TC-DASH-005` 团队页与看板的人工首响中位同口径（已废弃） — 对应 `REQ-DASH-001`、`REQ-TEAM-005` · 级别: 回归 · 执行者: 皆可 · 源自缺陷 2026-10-16 团队页人工首响中位算进了工作时间外开始的会话段

已废弃，被 `TC-DASH-007` 取代：DESIGN v1.21 起首响按工作时段累计，工作时间外开始的段也进样本，本用例第 1、2 步的预期不再成立。

前置：基线；终端执行 `pnpm scenario first-reply-off-hours`，记会话 C（周一 00:30 前执行时这一段落在上周，改到之后执行）；`login owner@demo.test`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `api owner@demo.test "$B/api/v1/dashboard?range=7d"` | `HTTP 200`；`people` 里林晓一行 `segments = 1`、`firstReplyMedianSec = null`：这一段在工作时间外开始，不进首响样本 |
| 2 | `api owner@demo.test "$B/api/v1/members?period=week"` | `HTTP 200`；林晓的 `handled.segments = 1`、`handled.firstReplyMedianSec = null`，与第 1 步一致 |

后置：无。

#### `TC-DASH-006` AI 接待段做比率分母，去向拆分，影子回复与无时限工单单列 — 对应 `REQ-DASH-001` · 级别: 回归 · 执行者: 皆可

前置：基线；`login owner@demo.test`；`api owner@demo.test "$B/api/v1/dashboard?range=7d"` 记 `kpis.aiResolved` 为 a / b（分子 / 分母）、`kpis.handoffRate` 为 h / H、`drafts.shadow` 为 W、`tickets.noDue` 为 N、`tickets.onTimeRate.den` 为 O；然后终端执行 `pnpm scenario dashboard-metrics`，记输出的 `date` 为 D。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `api owner@demo.test "$B/api/v1/dashboard?range=7d"` | `HTTP 200`；`kpis.aiResolved` 为 a + 1 / b + 3，`kpis.handoffRate` 为 h + 2 / H + 3：7 段里只有自动 2 段、辅助 1 段是 AI 接待段；`handoffReasons` 的 `count` 合计等于 `kpis.handoffRate.num` |
| 2 | 看同一响应 `trend` 里 `date` 为 D 的一行 | `segments` 7、`aiResolved` 1、`handedOff` 2、`shopilot` 3、`platform` 1、`pending` 0 |
| 3 | 看同一响应的 `drafts` 与 `tickets` | `drafts.shadow` 为 W + 2；`tickets.noDue` 为 N + 1；`tickets.onTimeRate.den` 为 O + 1；`byType` 里内部确认一行的 `noDue` 至少为 1 |
| 4 | `api owner@demo.test "$B/api/v1/dashboard?range=7d&format=csv"` | 首行为「日期,会话段,AI 独立解决,转人工,Shopilot 回复,平台后台回复,未回复或进行中,人工首响平均（秒）,12 小时内回复,12 小时回复率分母,辅助草稿,原样发送,改后发送,忽略,过期,影子回复,工单已解决,工单按时解决,工单无时限」；D 那一行为「D,7,1,2,3,1,0,780,4,7,0,0,0,0,0,2,2,1,1」 |

后置：重建基线（场景改了 Demo Store 的排班）。

#### `TC-DASH-007` 人工首响按工作时段累计，含平台后台回复，团队页同口径（已废弃） — 对应 `REQ-DASH-001`、`REQ-TEAM-005` · 级别: 回归 · 执行者: 皆可

已废弃，被 `TC-DASH-010` 取代：DESIGN v1.23 起看板首响按平均，CSV 列名改为「人工首响平均（秒）」，第 1、2 步的预期不再成立。

前置：基线；终端执行 `pnpm scenario dashboard-metrics`，记输出的 `date` 为 D；`login owner@demo.test`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `api owner@demo.test "$B/api/v1/dashboard?range=7d&format=csv"`，看 D 那一行的「人工首响中位（秒）」 | 450：6 个样本依次是 600（从转人工 10:10 起算）、2400（辅助模式从 11:00 起算）、1200（下班前 10 分钟加次日上班 10 分钟）、300（工作时间外开段，从次日 09:00 起算）、120（平台后台回复，13:00 那条开段前的不算）、60（平台后台先回） |
| 2 | `api owner@demo.test "$B/api/v1/dashboard?range=7d"`，看 `people` 里林晓一行 | `segments` 5，`firstReplyMedianSec` 1200：只算林晓自己的回复，样本 600、2400、1200、300、1800 |
| 3 | `api owner@demo.test "$B/api/v1/members?period=30d"`，看林晓的 `handled` | `segments` 5，`firstReplyMedianSec` 1200，与第 2 步一致 |

后置：重建基线。

#### `TC-DASH-008` 看板页面呈现新口径，桌面与手机宽度 — 对应 `REQ-DASH-001` · 级别: 回归 · 执行者: 皆可

前置：基线；终端执行 `pnpm scenario dashboard-metrics`；以 owner@demo.test 登录，打开 `/dashboard?range=7d`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 桌面宽度（1440）看「每日会话段去向」 | 图例 5 项：AI 独立解决、转人工、Shopilot 回复、平台后台回复、未回复或进行中；右侧「AI 独立解决」下写「分母：已结束的 AI 接待段 X」；「人工首响平均」下写「只累计工作时段 · 样本 X 段」，旁边有「12 小时回复率」；「转人工」下写「占 AI 接待段 X%」或「样本 X，满 10 才计算」 |
| 2 | 看「辅助草稿处置」面板底部 | 一行「影子回复 X 份：只给管理员、组长看，不发送，不计入采纳率」，X 等于接口的 `drafts.shadow` |
| 3 | 看工单区「按时完成率」与「按类型的时限达成」 | 按时完成率的说明里有「无时限 X 张不计」；类型图图例 4 项，含「无时限」 |
| 4 | 把窗口改为 390 宽重看第 1–3 步 | 内容都在，图例换行显示，页面没有横向滚动条 |

后置：重建基线。

#### `TC-DASH-009` 新开的会话段记开段模式，影子模式的段不进 AI 接待段 — 对应 `REQ-DASH-001` · 级别: 回归 · 执行者: 皆可

前置：基线；`login owner@demo.test`；`api owner@demo.test "$B/api/v1/dashboard?range=7d"` 记 `kpis.segments` 为 S、`kpis.handoffRate.den` 为 H。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `curl -s -X POST $B/api/mock/sim/create_buyer -H 'Content-Type: application/json' -d '{"platform":"shopee","shopId":"220001","name":"Mode Assist","language":"en"}'` 记 `conversationId` 为 X1，再对 X1 调 `POST $B/api/mock/sim/buyer_message`，正文「Is it in stock?」 | 两次都返回 `"ok":true` |
| 2 | 同样给 Demo Shopee SG（`shopId` 为 220002，影子模式）建买家「Mode Shadow」并发一条「Is it in stock?」 | 两次都返回 `"ok":true` |
| 3 | 等 20 秒，再取一次看板接口 | `kpis.segments` 为 S + 2；`kpis.handoffRate.den` 为 H + 1：辅助模式那段是 AI 接待段，影子模式那段不是 |

后置：无。

#### `TC-DASH-010` 人工首响平均与 12 小时回复率，团队页仍取中位 — 对应 `REQ-DASH-001`、`REQ-TEAM-005` · 级别: 回归 · 执行者: 皆可

前置：基线；终端执行 `pnpm scenario dashboard-metrics`，记输出的 `date` 为 D；执行「curl 会话」，`login owner@demo.test`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `api owner@demo.test "$B/api/v1/dashboard?range=7d&format=csv"`，看 D 那一行的「人工首响平均（秒）」「12 小时内回复」「12 小时回复率分母」 | 依次为 780、4、7：首响 6 个样本 600、2400、1200、300、120、60 取平均；12 小时内有回复的 4 段是 10:00、11:00 开段的两段（人工 10:20、11:40 回复）与 14:00、15:00 开段的两段（平台后台 14:02、15:01 回复）；场景里 AI 独立解决的段只打了标记、没有 AI 发出的消息，17:50 与 20:00 开段的两段次日才回复 |
| 2 | `api owner@demo.test "$B/api/v1/dashboard?range=7d"`，看 `people` 里林晓一行 | `segments` 5；`firstReplyAvgSec` 1260（600、2400、1200、300、1800 的平均）；`replied12h` 为 `num` 3、`den` 5、`rate` null（样本不满 10） |
| 3 | `api owner@demo.test "$B/api/v1/members?period=30d"`，看林晓的 `handled` | `segments` 5，`firstReplyMedianSec` 1200 |

后置：重建基线。

#### `TC-DASH-011` 工作时间外开始、上班前已回复的段不进首响 — 对应 `REQ-DASH-001` · 级别: 回归 · 执行者: 皆可 · 源自缺陷 2026-10-19 看板按人统计里多个客服首响显示 0 秒

前置：基线；执行「curl 会话」，`login owner@demo.test`；按 §3「固定为工作时间外」把今天设为不工作；`api owner@demo.test "$B/api/v1/dashboard?range=7d"` 记 `kpis.firstReplySamples` 为 N0；浏览器以 agent@demo.test 登录。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 按 §3「模拟器发消息」给 Demo Shopee MY 新买家发一条文字；Nur 打开这个会话，点「认领」，输入「您好，马上为您查询」发送 | 时间线里这条回复已发送 |
| 2 | `api owner@demo.test "$B/api/v1/dashboard?range=7d"` | `kpis.firstReplySamples` 仍为 N0：这段在工作时间外开始、下一个上班时刻之前已回复，不进首响样本 |

后置：按 §3「固定为工作时间内」恢复今天的排班。

#### `TC-DASH-012` 看板范围：预设与自定义起止日 — 对应 `REQ-DASH-001` · 级别: 回归 · 执行者: 皆可

前置：基线；执行「curl 会话」，`login owner@demo.test`；浏览器以 owner@demo.test 打开 `/dashboard`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 看页头的范围 | 默认「本月」，地址不带范围参数 |
| 2 | 打开范围选择器 | 左侧预设依次为今天、昨天、近 7 天、近 28 天、本周、本月、上月、近 90 天；右侧是双月日历 |
| 3 | 点「近 28 天」，然后刷新页面 | 地址带 `range=28d`；页头写近 28 天的起止日；刷新后不变 |
| 4 | 在日历里先点 7 天前，再点昨天，点「应用」 | 地址带 `from=<7 天前>&to=<昨天>`；刷新后不变 |
| 5 | `api owner@demo.test "$B/api/v1/dashboard?range=this_week"` | `HTTP 200`；`range.preset` 为 `this_week`，`range.from` 是本周一（商户时区），`range.to` 是今天 |
| 6 | `api owner@demo.test "$B/api/v1/dashboard?from=2026-01-01&to=2026-07-31"` | `HTTP 422`（超过 180 天） |
| 7 | `api owner@demo.test "$B/api/v1/dashboard?from=2026-10-01"` | `HTTP 422`（只给了开始日） |
| 8 | `api owner@demo.test "$B/api/v1/dashboard?range=7d&from=2026-10-01&to=2026-10-02"` | `HTTP 422`（预设与起止日同时给） |
| 9 | 把窗口改为 390 宽，打开范围选择器 | 预设与日历完整显示，页面没有横向滚动条 |

后置：无。

#### `TC-DASH-013` 问题提取：AI 写一句问题并按类别统计 — 对应 `REQ-DASH-002` · 级别: 回归 · 执行者: 皆可

前置：基线；按 §3「模拟器发消息」给 Demo Shopee MY 新买家 X 发「包裹三天没动了，帮我查下物流」；记今天的 UTC 日期 U（`date -u +%F`）。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `pnpm job issue.extract`，然后 `q "select s.issue_extracted_at is null from segment s join conversation c on c.id = s.conversation_id where c.buyer_name = '<X>'"` | `t`：买家刚发言，不满 30 分钟，不提取 |
| 2 | `pnpm issues:backfill --from <U> --to <U> --rate 10` | 末行「完成：共 N 段，成功 S，无买家消息 B，失败 0」，S ≥ 1 |
| 3 | `q "select s.issue_summary, ic.name from segment s join conversation c on c.id = s.conversation_id join issue_category ic on ic.id = s.issue_category_id where c.buyer_name = '<X>'"` | 类别为「物流查询」；总结以「买家咨询：包裹三天没动了，帮我查下物流」开头（AI 替身取买家第一句，可能带着平台译文） |
| 4 | 浏览器以 owner@demo.test 打开 `/dashboard?range=today`，看「问题与转人工原因」面板 | 当前是「全部问题」；类别列表里「物流查询」至少为 1；有按日趋势图与按日明细表 |
| 5 | 点「物流查询」 | 抽屉打开，地址带 `issue=<类别 ID>`；列表里有买家 X 这一段，总结以「买家咨询：包裹三天没动了，帮我查下物流」开头，能点开会话 |
| 6 | 关闭抽屉，切到「转人工的」 | 地址带 `issues=handoff`；X 这段不在其中 |

后置：无。

#### `TC-DASH-014` 管理问题类别 — 对应 `REQ-DASH-002` · 级别: 回归 · 执行者: 皆可

前置：基线；执行「curl 会话」，`login owner@demo.test`、`login lead@demo.test`；浏览器以 owner@demo.test 打开 `/dashboard`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `api owner@demo.test "$B/api/v1/issue-categories"` | 8 个类别依次为物流查询、退换货与退款、产品使用与故障、商品咨询（库存、规格、价格）、优惠与活动、开票、订单修改与取消、其他；只有「其他」`builtin` 为 true |
| 2 | 面板点「管理类别」，新增「保修」 | 列表里「保修」排在「其他」之前 |
| 3 | `api owner@demo.test -X POST $B/api/v1/issue-categories -d '{"name":"保修"}'` | `HTTP 409`，`code` 为 `category_duplicate` |
| 4 | 在「管理类别」里删除「保修」 | 提示其中的会话段归入「其他」；列表不再有「保修」 |
| 5 | 取「其他」的 ID，`api owner@demo.test -X PATCH $B/api/v1/issue-categories/<ID> -d '{"name":"杂项"}'`，再 `api owner@demo.test -X DELETE $B/api/v1/issue-categories/<ID>` | 两次都 `HTTP 409`，`code` 为 `builtin` |
| 6 | 以 lead@demo.test 打开 `/dashboard`；`api lead@demo.test -X POST $B/api/v1/issue-categories -d '{"name":"x"}'` | 面板有类别，没有「管理类别」；接口 `HTTP 403` |

后置：无。

#### `TC-DASH-015` 影子回复对比：没有人工回复不比，人工回复后记一条，不足 10 份显示数据不足 — 对应 `REQ-DASH-003` · 级别: 回归 · 执行者: 皆可

前置：基线；执行「curl 会话」，`login owner@demo.test`；商户时区当天 00:30 之后执行（草稿生成时间往前改 20 分钟后仍在今天）。`D` 是本用例的草稿 ID。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `pnpm job draft.compare`（先比完种子里可比的草稿），再 `curl -s -b "$SP_TMP/owner@demo.test" "$B/api/v1/dashboard?range=today" \| jq -c .draftReview.shadow`，记 `compared` 为 N0、`same` 为 S0 | 任务输出末行带 `"job":"draft.compare","ok":true`；N0 < 9 |
| 2 | `curl -s -X POST $B/api/mock/sim/create_buyer -H 'Content-Type: application/json' -d '{"platform":"shopee","shopId":"220002","name":"Compare Shadow","language":"en"}'`，记 `conversationId` 为 X；`curl -s -X POST $B/api/mock/sim/buyer_message -H 'Content-Type: application/json' -d '{"conversationId":"<X>","text":"Does this webcam work with a Mac?"}'`；等 10 秒，`q "select d.id, d.conversation_id, d.text from draft d join conversation c on c.id = d.conversation_id where c.buyer_name = 'Compare Shadow' and d.status = 'shadow'"`，记草稿 ID 为 D、会话 ID 为 C、正文为 T | 一行；T 为「您好！关于「Does this webcam work with a Mac?」，我们已经收到，会尽快为您处理。」 |
| 3 | `pnpm job draft.compare`；`q "select count(*) from draft_review where draft_id = '<D>'"` | `0`：草稿不满 15 分钟 |
| 4 | `q "update draft set created_at = created_at - interval '20 minutes' where id = '<D>'"`；`pnpm job draft.compare`；再查 `draft_review` | 仍是 `0`：还没有人工回复，不挑 |
| 5 | `api owner@demo.test -X POST $B/api/v1/conversations/<C>/messages -d '{"clientRequestId":"tc-dash-015","type":"text","text":"<T>"}'` | `HTTP 201` |
| 6 | `pnpm job draft.compare`；`q "select kind, draft_status, edit_class, consistency, model, cardinality(human_message_ids), human_text from draft_review where draft_id = '<D>'"` | `shadow\|shadow\|same\|same\|stub\|1\|<T>` |
| 7 | 再请求一次第 1 步的看板接口 | `compared` 为 N0 + 1，`same` 为 S0 + 1；`consistency` 是对象 `{ num, den, rate }`，`num` 为 S0 + 1、`den` 为 N0 + 1，`rate` 为 `null`（不足 10 份） |
| 8 | 浏览器以 owner@demo.test 打开 `/dashboard?range=today`，找到「AI 草稿与人工回复」面板 | 「影子回复」处于选中；一致率位置显示「数据不足」，下方写「一致 / 已对比 = <S0 + 1> / <N0 + 1>，满 10 份才计算」；修改分类表 6 行依次为语义一致、仅语言润色、补充信息、事实更正、流程改变、弃用重写 |

后置：无（`TC-DASH-018` 要用本用例的对比记录，本轮不重置）。

#### `TC-DASH-016` 辅助草稿：原样发送记语义一致，修改后发送比发出的译文 — 对应 `REQ-DASH-003` · 级别: 回归 · 执行者: 皆可

前置：同 `TC-DASH-015`（Demo Shopee MY 工作时间内外都是 assist，不用改排班）。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `curl -s -b "$SP_TMP/owner@demo.test" "$B/api/v1/dashboard?range=today" \| jq -c .draftReview.assist`，记为 A0 | 返回 `compared`、`sent`、`editedSent`、`ignored` 四个数 |
| 2 | 按 `TC-DASH-015` 第 2 步的接口给 Demo Shopee MY（`shopId` 为 `220001`）建买家「Compare Sent」与「Compare Edited」，各发「Is the camera in stock?」；等 10 秒，`q "select c.buyer_name, d.id, d.conversation_id, d.text from draft d join conversation c on c.id = d.conversation_id where c.buyer_name in ('Compare Sent', 'Compare Edited') and d.status = 'generated'"`，草稿 ID 记为 D1、D2，会话 ID 记为 C1、C2，正文记为 T | 两行，正文都是「您好！关于「Is the camera in stock?」，我们已经收到，会尽快为您处理。」 |
| 3 | `api owner@demo.test -X POST $B/api/v1/conversations/<C1>/messages -d '{"clientRequestId":"tc-dash-016-a","type":"text","text":"<T>","draftId":"<D1>","disposition":"sent"}'` | `HTTP 201` |
| 4 | `api owner@demo.test -X POST $B/api/v1/conversations/<C2>/messages -d '{"clientRequestId":"tc-dash-016-b","type":"text","text":"<T>今天下单明天发货。","translateTo":"en","translatedText":"Hi! We have received your question about the camera. Order today and it ships tomorrow.","draftId":"<D2>","disposition":"edited_sent"}'` | `HTTP 201` |
| 5 | `q "update draft set created_at = created_at - interval '20 minutes' where id in ('<D1>', '<D2>')"`；`pnpm job draft.compare`；`q "select draft_status, edit_class, consistency, model, reason from draft_review where draft_id = '<D1>'"` | `sent\|same\|same\|rule\|原样发送` |
| 6 | `q "select draft_status, edit_class, consistency, model, human_text from draft_review where draft_id = '<D2>'"` | `edited_sent\|rewrite\|different\|stub\|Hi! We have received your question about the camera. Order today and it ships tomorrow.`：存的是发出的译文；AI 替身按字面比，中文草稿对英文回复判为弃用重写 |
| 7 | 再请求一次第 1 步的看板接口 | 与 A0 相比，`compared` + 2，`sent` + 1，`editedSent` + 1，`ignored` 不变 |

后置：无（本轮不重置）。

#### `TC-DASH-017` 配对边界：人工回复前买家又插话不比，弃用后另回最多取 3 条 — 对应 `REQ-DASH-003` · 级别: 回归 · 执行者: 皆可

前置：同 `TC-DASH-016`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 给 Demo Shopee SG（`220002`）建买家「Compare Interject」，发「Do you ship to Penang?」；等 10 秒，按 `TC-DASH-015` 第 2 步的查询取影子回复，记为 D3、会话 C3 | 一行 |
| 2 | 同一买家再发「Hello? Anyone there?」；等 10 秒，`q "select count(*) from draft where conversation_id = '<C3>'"` | `1`：本段已有影子回复，不再出 |
| 3 | `api owner@demo.test -X POST $B/api/v1/conversations/<C3>/messages -d '{"clientRequestId":"tc-dash-017-a","type":"text","text":"Yes, we ship to Penang."}'`；把 D3 生成时间往前改 20 分钟，`pnpm job draft.compare`；`q "select count(*) from draft_review where draft_id = '<D3>'"` | 发送 `HTTP 201`；查询为 `0`：人工回复在买家插话之后，不比 |
| 4 | 给 Demo Shopee MY（`220001`）建买家「Compare Ignored」，发「Is the camera in stock?」；等 10 秒，取 `generated` 的草稿，记为 D4、会话 C4、正文 T | 一行 |
| 5 | `api owner@demo.test -X POST $B/api/v1/conversations/<C4>/drafts/<D4>/ignore`；再依次发 4 条文字：「<T>今天就能发货。」「还有别的问题吗？」「祝您购物愉快。」「再见。」（`clientRequestId` 依次 `tc-dash-017-b1` 至 `b4`） | 忽略 `HTTP 200`，4 次发送都 `HTTP 201` |
| 6 | 把 D4 生成时间往前改 20 分钟，`pnpm job draft.compare`；`q "select draft_status, edit_class, consistency, cardinality(human_message_ids), human_text from draft_review where draft_id = '<D4>'"` | `ignored\|supplement\|partial\|3\|…`：`human_text` 是前 3 条以换行连起来，不含「再见。」 |

后置：无（本轮不重置）。

#### `TC-DASH-018` 看板草稿对比面板：切换、样例抽屉、组长范围与权限 — 对应 `REQ-DASH-003` · 级别: 回归 · 执行者: 皆可

前置：本轮已执行 `TC-DASH-015` 至 `TC-DASH-017`、没有重置；执行「curl 会话」，`login owner@demo.test`、`login lead@demo.test`、`login agent@demo.test`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 浏览器以 owner@demo.test 打开 `/dashboard?range=today`，在「AI 草稿与人工回复」面板点「语义一致」 | 地址带 `review=same`；右侧抽屉标题「语义一致 · 影子回复」，写「按草稿生成时间从新到旧，最多显示 50 份」；列表里有 Demo Shopee SG · Compare Shadow 一条，带「一致」标签、AI 草稿与人工回复两栏、「打开会话」链接指向 `/wb/<TC-DASH-015 的 C>` 且新标签打开 |
| 2 | 关闭抽屉，点「辅助草稿」 | 地址去掉 `review`、带 `reviews=assist`；左侧标题「客服怎么处置草稿」，原样发送、修改后发送、弃用后人工另回都至少为 1 |
| 3 | 点「补充信息」 | 抽屉标题「补充信息 · 辅助草稿」；有 Compare Ignored 一条，带「部分一致」与「弃用后人工另回」两个标签 |
| 4 | `api owner@demo.test "$B/api/v1/dashboard/draft-reviews?range=today&kind=foo"` | `HTTP 422`，`type` 为 `/errors/validation` |
| 5 | `curl -s -b "$SP_TMP/lead@demo.test" "$B/api/v1/dashboard/draft-reviews?range=today&kind=shadow" \| jq -r '.items[].shopName' \| sort -u` | 没有 Demo Shopee SG（组长不负责这家店） |
| 6 | `api agent@demo.test "$B/api/v1/dashboard/draft-reviews?range=today"` | `HTTP 403` |

后置：基线重置（`pnpm db:reset && pnpm db:seed`）后再跑后面的用例。

#### `TC-DASH-019` 线上抽检草稿对比的修改分类 — 对应 `REQ-DASH-003` · 级别: 边缘 · 执行者: 人工

前置：线上 shopilot.live；组长或管理员账号；草稿对比上线满 7 天。只读，不改任何数据。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 打开 `/dashboard?range=7d`，看「AI 草稿与人工回复」面板的影子回复与辅助草稿 | 两边都有已对比份数；影子回复满 10 份时显示一致率百分数 |
| 2 | 在补充信息、事实更正、流程改变、弃用重写四类里各打开抽屉，共抽 20 条，逐条按人的判断看分类与语义一致性 | 每条都有 AI 草稿、人工回复与一句中文理由；草稿与人工回复语言不同的样例按语义判，不因语言不同判为弃用重写；在执行记录里写下与人判断不一致的条数 |

后置：无。

### 用量与套餐

#### `TC-BILL-001` 用量页各口径合计一致 — 对应 `REQ-BILL-001` · 级别: 回归 · 执行者: 皆可

前置：基线；以 owner@demo.test 打开 `/billing`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 看用量概览 | 显示已用、额度、加购额度、剩余；剩余 = 额度 + 加购额度 − 已用 |
| 2 | 每日出稿范围选「本计费周期」，看按模式堆叠 | auto、assist、shadow 三项之和等于已用 |
| 3 | 看按店表格（本月） | 各店合计等于已用 |
| 4 | 看 AI 独立解决会话段与账单列表（近 3 月） | 两块都显示数据或空态，不报错 |

后置：无。

#### `TC-BILL-002` 非所有者改套餐被拒 — 对应 `REQ-BILL-002` · 级别: 回归 · 执行者: 皆可

前置：基线；以 admin2@demo.test 打开 `/billing/plans`；`login admin2@demo.test`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 点「改为年付」 | 按钮置灰，提示「只有账号所有者 林晓 能改套餐」 |
| 2 | `api admin2@demo.test -X POST $B/api/v1/billing/plan -H 'Idempotency-Key: tc-bill-002' -d '{"planCode":"pro","cycle":"yearly"}'` | 403，`type` 为 `/errors/owner-only` |

后置：无。

#### `TC-BILL-003` 店铺数超过上限时不能降级 — 对应 `REQ-BILL-002` · 级别: 回归 · 执行者: 皆可

前置：基线；终端执行 `pnpm scenario plan-over-shop-limit`；`login owner@demo.test`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | owner 打开 `/billing/plans` | 基础版的降级按钮置灰，说明当前接入 8 家店、超过基础版上限，需先断开（8 − 上限）家店才能降级（上限取页面所示基础版店铺上限） |
| 2 | `api owner@demo.test -X POST $B/api/v1/billing/plan -H 'Idempotency-Key: tc-bill-003' -d '{"planCode":"basic","cycle":"monthly"}'` | 409，`type` 为 `/errors/not-allowed` |

后置：`pnpm db:reset && pnpm db:seed`。

#### `TC-BILL-004` 所有者改年付在下个周期生效 — 对应 `REQ-BILL-002` · 级别: 回归 · 执行者: 皆可

前置：基线；以 owner@demo.test 打开 `/billing/plans`（当前为月付）。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 点「改为年付」 | 提示将在下个计费周期生效，并显示生效日期 |
| 2 | 打开 `/billing` | 当前周期仍为月付，另显示下周期改为年付 |

后置：无。

#### `TC-BILL-005` 联系销售记录线索 — 对应 `REQ-BILL-002` · 级别: 回归 · 执行者: 皆可

前置：基线；以 owner@demo.test 打开 `/billing/plans`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 点「联系销售」，填联系人「林晓」、联系方式 owner@demo.test，提交 | 提示已记录；接口 201 |

后置：无。

#### `TC-BILL-006` 加购出稿包后额度立即增加 — 对应 `REQ-BILL-003` · 级别: 回归 · 执行者: 皆可

前置：基线；以 owner@demo.test 打开 `/billing`，记下加购额度 T0、剩余 R0；付款方式为成功卡（4242 结尾）。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 点「加购」，选 1,000 次包，点「支付」 | 弹层关闭；加购额度为 T0 + 1,000，剩余为 R0 + 1,000 |
| 2 | 看账单列表 | 新增一条加购账单，状态已支付 |

后置：无。

#### `TC-BILL-007` 模拟卡失败时加购被拒 — 对应 `REQ-BILL-003` · 级别: 回归 · 执行者: 皆可

前置：基线；以 owner@demo.test 打开 `/billing`，记下剩余 R0。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 「付款」→「更换」，填卡号 4000 0000 0000 0002 与有效期，保存 | 付款方式显示尾号 0002 |
| 2 | 「加购」选 1,000 次包，点「支付」 | 提示支付失败、请换卡；接口 402，`type` 为 `/errors/payment-failed` |
| 3 | 刷新 `/billing` | 剩余仍为 R0 |

后置：无。

#### `TC-BILL-008` 超量策略改为继续后额度用尽仍出稿 — 对应 `REQ-BILL-004` · 级别: 回归 · 执行者: 皆可

前置：基线；终端执行 `pnpm scenario usage-exhausted`；以 owner@demo.test 打开 `/billing`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 「修改超量策略」选继续，预算填 50，点「保存」 | 弹层关闭，页面显示策略为继续、预算 50 美元 |
| 2 | 向 Demo Shopee MY 新买家发一条 | 20 秒内出现草稿 |
| 3 | 刷新 `/billing` | 已用 101，显示超量 1 次 |

后置：无。

#### `TC-BILL-009` 超量策略选继续时必须填预算 — 对应 `REQ-BILL-004` · 级别: 边缘 · 执行者: 皆可

前置：基线；`login owner@demo.test`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `api owner@demo.test -X PUT $B/api/v1/billing/overage -d '{"policy":"continue"}'` | 422，`type` 为 `/errors/validation` |
| 2 | 浏览器「修改超量策略」选继续、预算留空 | 「保存」不可用或预算字段标红 |

后置：无。

#### `TC-BILL-010` 用量提醒按接收人与渠道投递 — 对应 `REQ-BILL-004` · 级别: 回归 · 执行者: 皆可

前置：基线；终端执行 `pnpm scenario usage-near-quota`；以 owner@demo.test 打开 `/billing`；`login owner@demo.test`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 「设置用量提醒」：阈值 80%，接收人林晓与陈卓，打开「邮件提醒」（站内保持开），点「保存」 | 弹层关闭 |
| 2 | 向 Demo Shopee MY 新买家发一条，等草稿出现 | `/billing` 已用为 80 |
| 3 | 林晓、陈卓分别打开通知弹层；打开 `/dev/outbox` | 两人各新增 1 条用量提醒；发件箱有发往 owner@demo.test、admin2@demo.test 的 `usage_alert` 各一封 |
| 4 | `api owner@demo.test -X PUT $B/api/v1/billing/alerts -d '{"thresholds":[49],"recipients":[],"email":false,"inApp":true}'` | 422，`type` 为 `/errors/validation` |

后置：无。

#### `TC-BILL-011` 付款方式与自动续费只限所有者 — 对应 `REQ-BILL-005` · 级别: 回归 · 执行者: 皆可

前置：基线；以 owner@demo.test 打开 `/billing`；`login owner@demo.test`、`login admin2@demo.test`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 「付款」→「更换」，填 4242 4242 4242 4242 与有效期，保存 | 付款方式显示尾号 4242 |
| 2 | 关闭「自动续费」 | 页面显示「本期结束后不再扣款」 |
| 3 | `api owner@demo.test $B/api/v1/billing` | `paymentMethod` 只有品牌、尾号与有效期，没有完整卡号 |
| 4 | `api owner@demo.test -X PUT $B/api/v1/billing/payment -d '{"card":{"number":"1234","expiry":"12/30"}}'` | 422 |
| 5 | `api admin2@demo.test -X PUT $B/api/v1/billing/payment -d '{"autoRenew":true}'` | 403，`type` 为 `/errors/owner-only` |

后置：无。

#### `TC-BILL-012` 保存开票资料并用于之后的账单 — 对应 `REQ-BILL-005` · 级别: 回归 · 执行者: 皆可

前置：基线；以 owner@demo.test 打开 `/billing`，付款方式为成功卡（4242 结尾）；`login owner@demo.test`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 点「发票」，填公司名「Demo Store Sdn Bhd」、地址「2 Jalan Demo」、邮箱 billing@demo.test，点「保存」 | 弹层关闭 |
| 2 | 重新打开「发票」 | 显示刚保存的三项 |
| 3 | `api owner@demo.test $B/api/v1/billing` | `invoiceInfo` 与第 1 步一致 |
| 4 | 点「加购」，选 1,000 次包，点「支付」 | 账单列表新增一条加购账单，抬头显示「Demo Store Sdn Bhd」 |
| 5 | 「发票」把公司名改为「Demo Store Two Sdn Bhd」并保存，刷新账单列表 | 第 4 步那条账单的抬头仍为「Demo Store Sdn Bhd」 |

后置：无。

### 商户设置

#### `TC-SET-001` 账单邮箱格式不对时不能保存 — 对应 `REQ-SET-001` · 级别: 回归 · 执行者: 皆可

前置：基线；以 owner@demo.test 打开 `/settings`；`login owner@demo.test`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 账单邮箱填 `billing@` | 保存按钮变为「账单邮箱改正后才能保存」且不可点 |
| 2 | `api owner@demo.test -X PUT $B/api/v1/merchant -d '{"billingEmail":"billing@"}'` | 422，`type` 为 `/errors/validation` |
| 3 | 改为 billing@demo.test，点保存后刷新 | 账单邮箱为 billing@demo.test |

后置：无。

#### `TC-SET-002` 修改商户时区 — 对应 `REQ-SET-001` · 级别: 回归 · 执行者: 皆可

前置：基线；以 owner@demo.test 打开 `/settings`；`login owner@demo.test`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 时区选 Asia/Bangkok (UTC+7)，点保存 | 提示已保存，并说明立即生效、影响此后的接待时间与看板分日 |
| 2 | `api owner@demo.test $B/api/v1/merchant` | `timezone` 为 `Asia/Bangkok` |
| 3 | 打开 `/settings/audit` 模块商户设置 | 有一条林晓修改时区的记录 |

后置：无。

#### `TC-SET-003` 商户名与时区的边界 — 对应 `REQ-SET-001` · 级别: 边缘 · 执行者: 皆可

前置：基线；以 owner@demo.test 打开 `/settings`；`login owner@demo.test`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 商户名改为 80 个字，保存 | 提示已保存，刷新后商户名为这 80 个字 |
| 2 | `api owner@demo.test -X PUT $B/api/v1/merchant -d '{"name":"<81 个字>"}'` | 422 |
| 3 | `api owner@demo.test -X PUT $B/api/v1/merchant -d '{"timezone":"Europe/London"}'` | 422 |
| 4 | 页面上改动商户名后点「放弃修改」 | 表单恢复为已保存的值 |

后置：无。

#### `TC-SET-004` 关闭「工单已超时 · 邮件」后只发站内 — 对应 `REQ-SET-002` · 级别: 回归 · 执行者: 皆可

前置：基线；owner 在 `/settings/notify` 确认「工单已超时 · 站内」与「工单已超时 · 邮件」都开（关的打开并点「保存」）。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 执行 `pnpm scenario ticket-overdue` 与 `pnpm job ticket.scan` | Nur 新增 1 条超时通知；发件箱新增发往 agent@demo.test 的 `ticket_alert` 一封（对照组） |
| 2 | owner 关掉「工单已超时 · 邮件」，点「保存」 | 提示已保存 |
| 3 | 再执行 `pnpm scenario ticket-overdue` 与 `pnpm job ticket.scan` | Nur 又新增 1 条超时通知；发件箱没有新增 `ticket_alert` |

后置：无。

#### `TC-SET-005` 个人提示音只影响本人 — 对应 `REQ-SET-002` · 级别: 回归 · 执行者: 皆可

前置：基线；浏览器 A 以 agent@demo.test、浏览器 B 以 agent2@demo.test 登录；终端 `login agent@demo.test`、`login agent2@demo.test`，从 `GET /api/v1/me` 记下 agent2 的 `preferences.sound` 为 S2。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | A：打开 `/account/security`，在个人偏好里关掉「提示音」 | 开关变为关，页面提示已保存 |
| 2 | A：刷新页面；`api agent@demo.test $B/api/v1/me` | 「提示音」仍为关；`preferences.sound` 为 `false` |
| 3 | B：打开 `/account/security`；`api agent2@demo.test $B/api/v1/me` | B 的「提示音」开关与 S2 一致；`preferences.sound` 仍为 S2 |

后置：无。

#### `TC-SET-006` 安全与登录页内容 — 对应 `REQ-SET-003` · 级别: 回归 · 执行者: 皆可

前置：基线。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | owner 打开 `/settings/security` | 有管理员两步验证、全员两步验证、会话时长（8 小时 / 12 小时 / 24 小时 / 7 天）、IP 限制与白名单；没有本人设备列表（在 `/account/security`）；没有飞书登录开关（一期飞书只做群推送） |
| 2 | lead@demo.test 打开 `/settings/security` | 显示「这个页面只对管理员开放」 |

后置：无。

#### `TC-SET-007` 按保存期限清理过期会话段 — 对应 `REQ-SET-004` · 级别: 回归 · 执行者: 皆可

前置：基线；以 owner@demo.test 打开 `/settings/data`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 保存期限选「180 天」，点「保存」 | 提示已保存 |
| 2 | 执行 `pnpm scenario segment-200d`，记会话 C；打开 `/wb/<C>` | 时间线显示该段的消息 |
| 3 | 执行 `pnpm job data.retention_purge`，刷新 `/wb/<C>` | 该段的消息与草稿不再显示（会话已无其他段时显示「找不到或已删除」） |
| 4 | 打开 `/settings/audit` | 第 1 步的保存期限修改记录仍在 |

后置：无。

#### `TC-SET-008` 按平台与买家 ID 删除买家数据 — 对应 `REQ-SET-004` · 级别: 回归 · 执行者: 皆可

前置：基线；模拟器为 Demo Shopee MY 新买家 B 下单，记下 B 的买家 ID 与买家名；以 B 发「删除测试」；Nur 对该会话点「认领」并回复一句，再「开 Invoice / Receipt」只发聊天生成一张发票。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | owner 在 `/settings/data` 填平台 Shopee、B 的买家 ID，点「查找并删除」 | 弹出二次确认，说明不可恢复 |
| 2 | 确认 | 显示删除计数：会话 1、消息至少 2、草稿至少 1、发票 1，订单去掉买家信息 1 张 |
| 3 | 顶栏搜索「删除测试」与 B 的买家名；打开 `/orders/invoices` | 搜索无结果（订单镜像还在，但买家名已清空，按买家名搜不到）；发票记录里没有那张发票 |
| 4 | 打开 `/settings/audit` | 有一条林晓删除买家数据的记录 |
| 5 | 对 B 的买家 ID 再执行一次「查找并删除」并确认 | 删除计数全为 0；接口 200 |
| 6 | 买家 ID 填 `no-such-buyer`，点「查找并删除」并确认 | 删除计数全为 0；接口 200 |

后置：无。

#### `TC-SET-009` 全量导出 — 对应 `REQ-SET-004` · 级别: 回归 · 执行者: 皆可

前置：基线；以 owner@demo.test 打开 `/settings/data`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 点「导出」 | 导出列表新增一条，状态排队中或进行中 |
| 2 | 立即再点「导出」 | 提示已有进行中的导出；接口 409 |
| 3 | 每 30 秒刷新，最多 10 分钟 | 该条状态变为已完成，显示 24 小时内有效的下载链接 |
| 4 | 打开 `/dev/outbox` | 有一封发往 owner@demo.test、模板 `export_ready` 的邮件，含下载链接 |
| 5 | 打开下载链接 | 下载 ZIP，内含会话、消息、订单、工单、发票的 CSV |

后置：无。

#### `TC-SET-010` 导出链接过期后失效 — 对应 `REQ-SET-004` · 级别: 边缘 · 执行者: 皆可

前置：基线；以 owner@demo.test 登录。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 执行 `pnpm scenario export-expired`，记下载链接 L | 输出 L |
| 2 | 执行 `pnpm job data.retention_purge`，打开 `/settings/data` | 该导出状态为已过期，没有下载链接 |
| 3 | 打开 L | 不下载文件，页面提示链接已失效 |

后置：无。

#### `TC-SET-011` 审计日志按操作人、模块、时间筛选并导出 — 对应 `REQ-SET-005` · 级别: 回归 · 执行者: 皆可

前置：基线；owner 建一张「内部确认」工单（Demo Shopee MY，负责人 Nur）T；Arif 对 T「加备注」并改派给 Mei Lin。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | owner 在 `/settings/audit` 选模块「工单」、操作人「Arif Rahman」、「近 30 天」 | 只列出 Arif Rahman 的工单操作，其中有对 T 的备注与改派 |
| 2 | 点「导出 CSV」 | CSV 数据行与列表一致 |

后置：无。

#### `TC-SET-012` 审计日志不含密钥、令牌与完整卡号 — 对应 `REQ-SET-005` · 级别: 回归 · 执行者: 皆可

前置：先执行 `TC-SHOP-016`（Signup Store 做过一次密钥更新）；signup1@demo.test 在 `/billing`「付款」→「更换」填 4242 4242 4242 4242；再邀请 audit.token@demo.test，记下邀请链接里的令牌 T。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | signup1 在 `/settings/audit` 选「近 7 天」、全部操作人与模块，点「导出 CSV」 | 下载 CSV |
| 2 | 在 CSV 中查找 `mock-key-2001001`、`4242424242424242`、`4242 4242 4242 4242`、T | 都找不到 |

后置：无。

#### `TC-SET-013` 转让所有权要求对方已开两步验证 — 对应 `REQ-SET-006` · 级别: 回归 · 执行者: 皆可

前置：基线（陈卓未开两步验证）；以 owner@demo.test 打开 `/settings`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 展开转让对象下拉 | 陈卓显示「（未开两步验证，开启后才能接收）」且不可选，「转让」不可点 |
| 1b | `login owner@demo.test`，从 `api owner@demo.test $B/api/v1/members` 取陈卓的 membershipId A，`api owner@demo.test -X POST $B/api/v1/merchant/ownership-transfers -H 'Idempotency-Key: tc-set-013' -d '{"toMembershipId":"<A>"}'` | 409，`type` 为 `/errors/not-allowed`，`code` 为 `two_factor_disabled` |
| 2 | 打开 `/dev/outbox` | 没有 `ownership_transfer` 邮件 |

后置：无。

#### `TC-SET-014` 转让所有权，旧链接被新转让作废 — 对应 `REQ-SET-006` · 级别: 回归 · 执行者: 皆可

前置：基线；陈卓按 `TC-AUTH-015` 第 1 步的方法开启两步验证；以 owner@demo.test 打开 `/settings`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 转让对象选陈卓，点「转让」 | 提示已发出确认邮件；发件箱有一封发往 admin2@demo.test 的 `ownership_transfer`，链接 L1 |
| 2 | 再点一次「转让」给陈卓 | 发件箱新增一封，链接 L2 |
| 3 | 以 owner@demo.test 打开 L2 | 页面提示登录账号不是受让人 |
| 4 | 陈卓登录（含验证码）打开 L1 | 页面提示链接已失效 |
| 5 | 陈卓打开 L2 并确认 | 跳到 `/settings`，所有者显示陈卓 |
| 6 | 林晓打开 `/team` 与 `/billing/plans` | 林晓角色仍为管理员，没有所有者标记；点「改为年付」提示「只有账号所有者 陈卓 能改套餐」 |

后置：`pnpm db:reset && pnpm db:seed`。

#### `TC-SET-015` 删除商户与 30 天内撤销 — 对应 `REQ-SET-006` · 级别: 回归 · 执行者: 皆可

前置：基线；以 owner@demo.test 打开 `/settings`；模拟器显示 Demo TikTok MY、Demo TikTok TH 坐席接单为 true。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 展开「删除商户」，输入「Demo Stor」，点「确认删除」 | 提示名称不一致，未删除；接口 422 |
| 2 | 输入「Demo Store」，点「确认删除」 | 页面顶部出现待删除横幅，显示 30 天后的清除日期与「撤销」 |
| 3 | 看模拟器与 `/dev/outbox` | 两家 TikTok 店坐席接单为 false；发件箱有发往 owner@demo.test 与 admin2@demo.test 的 `merchant_deletion` 各一封 |
| 4 | 以 agent2@demo.test 登录 | 登录被拒；owner 的登录记录有该次失败，原因 `disabled` |
| 5 | owner 点「撤销」 | 横幅消失，商户恢复 |
| 6 | owner 打开 `/shops` 与 `/team` | 4 家店都为已断开；除林晓外的成员都为已停用 |

后置：`pnpm db:reset && pnpm db:seed`。

#### `TC-SET-016` 非所有者不能转让所有权与删除商户 — 对应 `REQ-SET-006` · 级别: 边缘 · 执行者: 皆可

前置：基线；以 admin2@demo.test 打开 `/settings`；`login admin2@demo.test`，取陈卓本人 membershipId A。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 看转让与删除商户区 | 置灰，悬停说明只有账号所有者林晓能操作 |
| 2 | `api admin2@demo.test -X POST $B/api/v1/merchant/ownership-transfers -H 'Idempotency-Key: tc-set-016' -d '{"toMembershipId":"<A>"}'` | 403，`type` 为 `/errors/owner-only` |
| 3 | `api admin2@demo.test -X POST $B/api/v1/merchant/deletion -d '{"confirmName":"Demo Store"}'` | 403，`type` 为 `/errors/owner-only` |

后置：无。

### 通知

#### `TC-NOTIF-001` 未读数与全部标为已读 — 对应 `REQ-NOTIF-001` · 级别: 回归 · 执行者: 皆可

前置：基线；Nur 登录后打开通知弹层点「全部标为已读」；owner 在 `/tickets` 建 3 张「内部确认」工单，负责人都是 Nur Aisyah。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | Nur 刷新页面 | 顶栏通知图标带红点，图标的无障碍名称为「通知，3 条未读」 |
| 2 | 打开通知弹层 | 头部显示「3 条未读」，列出 3 条工单指派通知 |
| 3 | 点「全部标为已读」 | 头部为「0 条未读」，图标上的红点消失 |

后置：无。

#### `TC-NOTIF-002` 按类型筛选并从通知跳到对象 — 对应 `REQ-NOTIF-001` · 级别: 回归 · 执行者: 皆可

前置：基线；同 `TC-NOTIF-001` 前置；`login agent@demo.test`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | Nur 打开通知弹层，切到「工单」标签 | 只列工单类通知 |
| 2 | 点其中一条 | 跳到该工单的 `/tickets/<ID>` |
| 3 | `api agent@demo.test "$B/api/v1/notifications?type=ticket"` | 每条 `type` 都是 `ticket` |

后置：无。

#### `TC-NOTIF-003` 同一事件 10 分钟内不重复通知 — 对应 `REQ-NOTIF-001` · 级别: 回归 · 执行者: 皆可

前置：基线；owner 建一张「内部确认」工单 T（Demo Shopee MY，负责人 Mei Lin）；Nur 打开通知弹层点「全部标为已读」。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | Arif 把 T 改派给 Nur Aisyah | Nur 新增 1 条 T 指派给我的通知 |
| 2 | 1 分钟内 Arif 把 T 改派给 Mei Lin，再改回 Nur Aisyah | Nur 关于 T 的指派通知仍只有 1 条 |

后置：无。

### 飞书推送

本节用例都在发送替身下执行（`FEISHU_MODE=stub`，§3「飞书发送替身」）：卡片不出网，记进投递记录，在 `/dev/outbox?tab=feishu` 查看；「最上面一张」指该页卡片列表的第一行。`TC-FEISHU-016` 是唯一连真实飞书的用例，执行者为人工。

#### `TC-FEISHU-001` 用飞书应用连接，选默认群与店铺群 — 对应 `REQ-FEISHU-001`、`REQ-FEISHU-002` · 级别: 回归 · 执行者: 皆可

前置：基线；以 owner@demo.test 登录；终端已按 §3「curl 会话」定义 `B` 与函数。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 打开 `/settings/notify`，看通知规则下方 | 有「飞书群推送」一节：两个接法单选（「飞书应用（推荐）」已选中、「群自定义机器人」）、App ID 与 App Secret 输入框、「校验并保存」；本节顶部写明本机替身模式，「开发发件箱」是链接 |
| 2 | App ID 填 `cli_demo12345678`，App Secret 填 `bad-secret`，点「校验并保存」 | App Secret 下标红「飞书没有通过这组 App ID 与 App Secret」，焦点在 App Secret 输入框；表单下方写原因（含 `10014`）与请求编号；接口 422，`type` 为 `/errors/platform-credentials` |
| 3 | App Secret 改填 `good-secret-123`，点「校验并保存」 | 提示校验通过；本节显示「飞书应用 cli_demo12345678」与「校验通过 · <时间>」、两个开关（都开）、「推送到哪个群」：默认群一行加 4 家店各一行；店铺行的下拉框为「跟随默认群」，下方写「不推送（还没设默认群）」 |
| 4 | 默认群一行的下拉框选「Shopilot 客服群（替身）」 | 提示已保存；4 个店铺行下方都写「推到默认群「Shopilot 客服群（替身）」」；默认群一行出现「发测试卡片」 |
| 5 | Demo TikTok TH 一行的下拉框选「泰国站客服（替身）」 | 提示已保存；该行下方不再写「推到默认群」，行尾出现「发测试卡片」 |
| 6 | `login owner@demo.test`，`api owner@demo.test $B/api/v1/feishu` | 200；`connection.method` 为 `app`、`connection.status` 为 `verified`，`defaultTarget.name` 为「Shopilot 客服群（替身）」，Demo TikTok TH 的 `target.chatId` 为 `oc_stub_th`；响应里没有 `good-secret-123` |
| 7 | `q "select app_secret_enc like 'v1.%', position('good-secret' in app_secret_enc) from feishu_integration"` | `t\|0`（存的是密文，不含明文） |

后置：无。

#### `TC-FEISHU-002` 发测试卡片与两个推送开关 — 对应 `REQ-FEISHU-002`、`REQ-MOCK-004` · 级别: 回归 · 执行者: 皆可

前置：基线；按 §3「连上飞书替身」；以 owner@demo.test 打开 `/settings/notify`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 默认群一行点「发测试卡片」 | 提示「测试卡片已发出（替身，已记进开发发件箱），去飞书群里看看」 |
| 2 | 打开 `/dev/outbox?tab=feishu`，点最上面一张 | 标题「测试卡片 · Demo Store」；说明行写发往「Shopilot 客服群（替身）」、测试卡片、标题颜色蓝色、已发出（替身）；正文有「下面这张图片用来确认买家图片能显示在卡片里」与一张图片；按钮「打开通知设置」链到 `$B/settings/notify`；「卡片 JSON」展开后 `schema` 为 `2.0` |
| 3 | 回到通知页，关掉「待认领超时推送」 | 提示「待认领超时推送已关闭」；刷新后仍为关，「待认领时推送」仍为开 |
| 4 | `api owner@demo.test $B/api/v1/feishu` | `notifyOverdue` 为 `false`，`notifyUnclaimed` 为 `true` |
| 5 | 打开 `/settings/audit`，模块选「商户设置」 | 有「飞书推送：连接飞书应用 cli_demo12345678」「飞书推送：默认群设为「Shopilot 客服群（替身）」」「飞书推送：测试卡片已发往「Shopilot 客服群（替身）」」「飞书推送：待认领超时推送关」四条 |

后置：无。

#### `TC-FEISHU-003` 群自定义机器人：地址校验、签名失败与断开 — 对应 `REQ-FEISHU-001`、`REQ-FEISHU-002` · 级别: 回归 · 执行者: 皆可

前置：基线；按 §3「连上飞书替身」；以 owner@demo.test 打开 `/settings/notify`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 点「更换」，选「群自定义机器人」，点「使用群自定义机器人」 | 弹出确认框「换接法会清除已设置的群」，焦点在框内 |
| 2 | 点「清除并保存」 | 提示「已改用群自定义机器人；下一步设置默认群」；本节显示「群自定义机器人」；默认群一行写「未设置：没有单独指定群的店不推」，每行有「设置」 |
| 3 | 默认群一行点「设置」，群名「售后处理群」、Webhook 地址 `https://example.com/hook/abcdefgh`、签名密钥 `sign-secret`，点「保存」 | 弹窗不关；地址框标红「应为 https://open.feishu.cn/open-apis/bot/v2/hook/… 开头的地址」，焦点在地址框；接口 422，`type` 为 `/errors/validation` |
| 4 | 地址改为 `https://open.feishu.cn/open-apis/bot/v2/hook/e2e0f1e2d3c4`，点「保存」 | 弹窗关闭，提示已保存；默认群一行写「售后处理群 · …d3c4」，有「修改」「清除」「发测试卡片」 |
| 5 | 默认群一行点「发测试卡片」 | 提示测试卡片已发出（替身，已记进开发发件箱） |
| 6 | Demo TikTok TH 一行点「设置」，群名「泰国群」、地址 `https://open.feishu.cn/open-apis/bot/v2/hook/badbadbad123`、签名密钥 `x`，保存后点该行「发测试卡片」 | 提示「测试卡片没有发出」，说明含「签名校验没有通过，请核对签名密钥（飞书返回 19021」；本节底部出现「最近一次推送失败（<时间> · 泰国群）：签名校验没有通过…」；接口 502，`type` 为 `/errors/platform` |
| 7 | `api owner@demo.test $B/api/v1/feishu`；`q "select position('e2e0f1e2d3c4' in webhook_enc), position('sign-secret' in secret_enc) from feishu_target where name='售后处理群'"` | 响应里 `defaultTarget.webhookHint` 为 `d3c4`，没有完整地址与签名密钥；SQL 为 `0\|0` |
| 8 | 点「断开」，确认框点「断开」 | 提示「已断开飞书，之后不再推送卡片」；本节回到未连接的表单；接口返回的 `connection` 与 `defaultTarget` 都为 `null` |

后置：无。

#### `TC-FEISHU-004` 飞书设置只对管理员开放 — 对应 `REQ-FEISHU-001`、`REQ-PERM-001` · 级别: 回归 · 执行者: 皆可

前置：基线；终端已定义 §3「curl 会话」。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `login lead@demo.test`，`api lead@demo.test $B/api/v1/feishu` | 403，`type` 为 `/errors/forbidden`，`code` 为 `settings.manage` |
| 2 | `api lead@demo.test -X PUT $B/api/v1/feishu -d '{"method":"webhook"}'`；`login agent@demo.test`，`api agent@demo.test -X POST $B/api/v1/feishu/targets -d '{"shopId":null,"chatId":"oc_stub_service"}'` | 都是 403，`type` 为 `/errors/forbidden` |
| 3 | 以 lead@demo.test 在浏览器打开 `/settings/notify` | 显示「这个页面只对管理员开放」 |
| 4 | `login owner@demo.test`，`api owner@demo.test $B/api/v1/feishu` | 200 |

后置：无。

#### `TC-FEISHU-005` 新会话直接进待认领时推待认领卡 — 对应 `REQ-FEISHU-003`、`REQ-FEISHU-005`、`REQ-MOCK-004` · 级别: 冒烟 · 执行者: 皆可

前置：基线；按 §3「连上飞书替身」；以 owner@demo.test 登录。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 模拟器选 Demo TikTok TH（接待模式 off）新买家，发「Halo, kamera ini bisa dipakai di Mac?」 | 推送日志新增一条，HTTP 200 |
| 2 | 30 秒内打开 `/dev/outbox?tab=feishu` | 最上面一张：标题「待认领 · Demo TikTok TH」，发往「Shopilot 客服群（替身）」，待认领卡 · 已发出（替身），标题颜色橙色 |
| 3 | 点开看正文 | 第一行「AI 总结　AI 替身总结：买家发来新消息，正在等待客服认领。」；字段行依次「平台 TikTok Shop · 泰国」「买家 <买家名>」「已等 不到 1 分钟」；没有「转人工原因」；「最近对话」下有「买家 <时:分>　Halo, kamera ini bisa dipakai di Mac?」，下一行「译文：[译文] Halo, kamera ini bisa dipakai di Mac?」 |
| 4 | 看按钮 | 「认领」链到 `$B/wb/<会话 ID>?claim=1&m=<Demo Store 商户 ID>`，「打开会话」链到 `$B/wb/<会话 ID>?m=<Demo Store 商户 ID>`；`<Demo Store 商户 ID>` 与 `api owner@demo.test $B/api/v1/me` 的 `active.merchantId` 相同 |
| 5 | owner 打开 `/wb` 的待认领 | 有这个买家的会话，地址里的会话 ID 与按钮链接里的相同 |

后置：无。

#### `TC-FEISHU-006` 同一段只推一次，新段再推 — 对应 `REQ-FEISHU-003` · 级别: 回归 · 执行者: 皆可

前置：基线；按 §3「连上飞书替身」；以 owner@demo.test 登录。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 模拟器选 Demo TikTok TH 新买家 X，发「hello 1」 | 30 秒内发件箱最上面多一张「待认领 · Demo TikTok TH」；记会话 ID C |
| 2 | X 再发「hello 2」，等 30 秒 | 发件箱没有新卡；`q "select count(*) from feishu_delivery where conversation_id='<C>'"` 为 `1` |
| 3 | owner 打开 `/wb/<C>`，点「认领」，再点结束会话并确认 | 会话变为已结束 |
| 4 | X 再发「hello 3」 | 会话开新段进入待认领；30 秒内发件箱多一张 C 的待认领卡；SQL 计数为 `2`，`q "select count(distinct segment_id) from feishu_delivery where conversation_id='<C>'"` 为 `2` |

后置：无。

#### `TC-FEISHU-007` AI 转人工时推卡并写原因 — 对应 `REQ-FEISHU-003`、`REQ-FEISHU-005` · 级别: 回归 · 执行者: 皆可

前置：基线；按 §3「连上飞书替身」；按 §3「固定为工作时间内」（Demo Shopee MY 为 assist）。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 模拟器选 Demo Shopee MY 新买家，发「我要人工客服」 | 30 秒内工作台待认领里有这个会话，状态「待认领 · 命中转人工关键词」 |
| 2 | 打开 `/dev/outbox?tab=feishu` 最上面一张 | 标题「待认领 · Demo Shopee MY」；字段行「平台 Shopee · 马来西亚」，下一行「转人工原因 命中转人工关键词」 |
| 3 | 看「最近对话」 | 只有「买家 <时:分>　我要人工客服」一条，没有「转人工：命中转人工关键词」这类系统事件；这条是中文，下方没有译文行 |

后置：无。

#### `TC-FEISHU-008` 店铺群优先，没有群或开关关着时不推 — 对应 `REQ-FEISHU-002`、`REQ-FEISHU-003` · 级别: 回归 · 执行者: 皆可

前置：基线；按 §3「连上飞书替身」；`api owner@demo.test $B/api/v1/feishu` 记默认群 ID `D` 与 Demo TikTok TH 的店铺 ID `TH`；`api owner@demo.test -X POST $B/api/v1/feishu/targets -d '{"shopId":"<TH>","chatId":"oc_stub_th"}'` 返回 200。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 模拟器选 Demo TikTok TH 新买家，发「to th group」 | 30 秒内发件箱最上面一张发往「泰国站客服（替身）」 |
| 2 | `api owner@demo.test -X DELETE $B/api/v1/feishu/targets/<D>`；模拟器选 Demo Shopee SG（shadow）新买家，发「no group」 | 会话进入待认领；30 秒后发件箱没有 Demo Shopee SG 的新卡 |
| 3 | `api owner@demo.test -X POST $B/api/v1/feishu/targets -d '{"shopId":null,"chatId":"oc_stub_service"}'`；owner 在 `/settings/notify` 关掉「待认领时推送」；模拟器选 Demo Shopee SG 新买家，发「toggle off」 | 提示「待认领时推送已关闭」；30 秒后发件箱没有新卡 |

后置：无。

#### `TC-FEISHU-009` 待认领超时推超时卡，每段一次 — 对应 `REQ-FEISHU-004` · 级别: 回归 · 执行者: 皆可

前置：基线；按 §3「连上飞书替身」；终端 `pnpm scenario unclaimed-11m`，记输出的会话 ID C。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `pnpm job unclaimed.remind` | 30 秒内发件箱最上面一张：标题「待认领超时 · Demo Shopee MY」，标题颜色红色；字段行「已等 11 分钟」，另一行「提醒时长 待认领超过 10 分钟」；「认领」链接含 C |
| 2 | 再执行 `pnpm job unclaimed.remind`，等 30 秒 | 没有第二张；`q "select count(*) from feishu_delivery where conversation_id='<C>' and kind='overdue'"` 为 `1` |

后置：无。

#### `TC-FEISHU-010` 卡片里的图片、商品卡、订单卡与译文 — 对应 `REQ-FEISHU-005` · 级别: 回归 · 执行者: 皆可

前置：基线；按 §3「连上飞书替身」；owner 在 `/settings/notify` 关掉「待认领时推送」（超时推送保持开）；在 `/reception/hours` 把待认领提醒改为 5 分钟并保存。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 模拟器选 Demo TikTok TH 新买家 X：发文字「Saya mau tanya」，发一张图片，发一张商品卡，为 X 下单后发这张订单的订单卡 | 会话进入待认领；发件箱没有 X 的卡 |
| 2 | 等到 X 的第一条消息满 5 分钟，执行 `pnpm job unclaimed.remind` | 30 秒内发件箱最上面一张「待认领超时 · Demo TikTok TH」 |
| 3 | 看「最近对话」 | 依次 4 条，都标「买家」：文字与下一行「译文：…」；「[图片]」下方显示一张图片；「[商品] <商品名>」；「[订单] <订单号> · <中文状态>」；没有系统事件行 |
| 4 | 通知页点「更换」改用群自定义机器人并确认，默认群设为地址 `https://open.feishu.cn/open-apis/bot/v2/hook/e2e0f1e2d3c4`、签名密钥 `sign-secret`，打开「待认领时推送」；模拟器选 Demo TikTok TH 新买家 Y，发一张图片 | 30 秒内发件箱最上面一张「待认领 · Demo TikTok TH」：最近对话里是「[图片] 在 Shopilot 查看」，链接指向 Y 的会话；卡片 JSON 里没有 `"tag": "img"` |

后置：无。

#### `TC-FEISHU-011` 已登录成员点卡片认领 — 对应 `REQ-FEISHU-006` · 级别: 冒烟 · 执行者: 皆可

前置：基线；按 §3「连上飞书替身」；模拟器选 Demo TikTok TH 新买家 X 发「claim me」、新买家 Y 发「just open」；在发件箱分别打开两张卡，记 X 的「认领」链接 L1 与会话 ID C，Y 的「打开会话」链接 L2 与会话 ID D；以 owner@demo.test 登录（当前商户 Demo Store）。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 浏览器打开 L1 | 工作台打开 C，提示「已认领」；会话头部为「我处理中」，输入框可用；地址变为 `/wb/<C>`，没有 `claim` 与 `m` |
| 2 | 刷新页面 | 不再提示已认领；`q "select count(*) from audit_log where action='conversation_claimed' and target_id='<C>'"` 为 `1` |
| 3 | 再打开一次 L1 | 直接打开 C，没有「已认领」提示；审计计数仍为 `1` |
| 4 | 打开 L2 | 打开 D，地址变为 `/wb/<D>`；D 仍是待认领，头部有「认领」按钮，没有「已认领」提示 |

后置：无。

#### `TC-FEISHU-012` 点卡片时已被同事认领、会话不在范围或已结束 — 对应 `REQ-FEISHU-006`、`REQ-CONV-004` · 级别: 回归 · 执行者: 皆可

前置：基线；按 §3「连上飞书替身」；按 §3「固定为工作时间内」；模拟器选 Demo Shopee MY 新买家 P1、P3 各发「我要人工客服」，Demo TikTok TH 新买家 P2 发「hi」；从发件箱记三张卡的「认领」链接 L1、L2、L3 与会话 ID C1、C2、C3；`login agent2@demo.test`，`api agent2@demo.test -X POST $B/api/v1/conversations/<C1>/claim -d '{}'` 返回 200（Mei Lin 认领 C1）。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 以 owner@demo.test 登录后打开 L1 | 提示「已由 Mei Lin 认领」；会话照常显示，头部「Mei Lin 处理中」；没有发出认领请求；地址去掉 `claim` 与 `m` |
| 2 | 以 agent@demo.test（Nur，负责 Demo Shopee MY）登录后打开 L1 | 提示「已由 Mei Lin 认领」；对话栏「Mei Lin 已认领这个会话」与「回到会话列表」；认领请求 409，`type` 为 `/errors/conflict` |
| 3 | Nur 打开 L2（Demo TikTok TH 不在她的范围） | 对话栏「找不到或已删除」，没有「已认领」提示 |
| 4 | owner 打开 `/wb/<C3>`，点「认领」，再结束会话并确认；然后打开 L3 | 提示「会话已经结束」；会话为已结束，不能发送 |

后置：无。

#### `TC-FEISHU-013` 未登录时先登录再回来认领 — 对应 `REQ-FEISHU-006`、`REQ-AUTH-002` · 级别: 回归 · 执行者: 皆可

前置：基线；按 §3「连上飞书替身」；模拟器选 Demo TikTok TH 新买家发「login first」，从发件箱记「认领」链接 L 与会话 ID C；浏览器没登录。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 打开 L | 到登录页，地址带 `next=/wb/<C>?claim=1&m=…` |
| 2 | 以 agent2@demo.test（Mei，负责 Demo TikTok TH）登录 | 回到 `/wb/<C>`，提示「已认领」，会话头部「我处理中」；地址里没有 `claim` 与 `m` |

后置：无。

#### `TC-FEISHU-014` 两步验证后回到卡片链接认领 — 对应 `REQ-FEISHU-006`、`REQ-AUTH-005` · 级别: 回归 · 执行者: 皆可

前置：基线；按 §3「连上飞书替身」；`login owner@demo.test`，`api owner@demo.test -X PUT $B/api/v1/security-policy -d '{"requireTwoFactorAdmins":true,"requireTwoFactorAll":false,"sessionMaxHours":168,"ipAllowlist":[],"ipRestrictionOn":false}'` 返回 200；模拟器选 Demo TikTok TH 新买家 X、Y 各发一条，从发件箱记两张卡的「认领」链接 L1、L2 与会话 ID C1、C2；浏览器没登录；准备一个验证器（或按开启时显示的密钥算出当前 6 位验证码）。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 打开 L1，以 admin2@demo.test 登录 | 到 `/account/security`，地址带 `next=/wb/<C1>?claim=1&m=…`；顶部「「Demo Store」要求开启两步验证」 |
| 2 | 输入密码点「开启两步验证」，扫码或手动输入密钥后填当前验证码，点「验证并开启」 | 提示两步验证已开启，随即回到 `/wb/<C1>`，提示「已认领」，会话头部「我处理中」 |
| 3 | 退出；打开 L2，以 admin2@demo.test 输入密码 | 出现「两步验证」输入验证码的步骤 |
| 4 | 填当前验证码，点「验证并登录」 | 回到 `/wb/<C2>`，提示「已认领」 |

后置：`pnpm db:reset && pnpm db:seed`。

#### `TC-FEISHU-015` 卡片属于另一个商户 — 对应 `REQ-FEISHU-006`、`REQ-AUTH-004` · 级别: 回归 · 执行者: 皆可

前置：基线；按 §3「固定为工作时间内」；模拟器选 Other TikTok VN（Other Store，assist）新买家发「我要人工客服」，会话进入待认领，记会话 ID F；`q "select id from merchant where name='Other Store'"` 记 O；拼出 `L = $B/wb/<F>?claim=1&m=<O>`；以 agent@demo.test（Nur，同属 Demo Store 与 Other Store）登录，账号卡显示 Demo Store。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 打开 L | 提示「已切换到「Other Store」」与「已认领」；账号卡显示 Other Store；会话 F 头部「我处理中」 |
| 2 | 同一浏览器打开 `/api/v1/me` | JSON 里 `active.merchantName` 为 Other Store |
| 3 | 以 lead@demo.test（Arif，只属 Demo Store）登录后打开 L | 对话栏「看不到这个会话」与「回到会话列表」；账号卡仍是 Demo Store |

后置：无。

#### `TC-FEISHU-016` 真实飞书：连接、测试卡片、待认领卡与点卡认领 — 对应 `REQ-FEISHU-001`、`REQ-FEISHU-002`、`REQ-FEISHU-003`、`REQ-FEISHU-005`、`REQ-FEISHU-006` · 级别: 回归 · 执行者: 人工

前置：服务器或本机以 `FEISHU_MODE=live` 运行；有一个飞书企业自建应用：开了机器人能力与「以应用的身份发消息」「获取群组信息」「获取与上传图片或文件资源」三项权限并已发布，机器人已在一个测试群里；另在该群加一个开启签名校验的自定义机器人。不要用有真实买家沟通的群。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 管理员在 `/settings/notify` 用该应用的 App ID 与 App Secret「校验并保存」 | 显示已连接与校验时间；默认群下拉里有测试群 |
| 2 | 默认群选测试群，点「发测试卡片」 | 测试群收到蓝色「测试卡片 · <商户名>」，卡里显示一张橙色测试图片；页面没有「图片上传没有成功」 |
| 3 | 让一个会话进入待认领（模拟器或测试买家） | 测试群收到橙色待认领卡，内容与 `TC-FEISHU-005` 第 3 步同构；买家发过图片时显示缩略图 |
| 4 | 在飞书里点卡片上的「认领」 | 浏览器打开 Shopilot（没登录先登录），会话被本人认领 |
| 5 | 改用群自定义机器人，填该机器人的地址与签名密钥，发测试卡片 | 测试群收到测试卡片 |

后置：断开飞书，或换回替身环境。

#### `TC-FEISHU-017` 取消认领后再推待认领卡，之后停用退回不再推 — 对应 `REQ-FEISHU-003`、`REQ-CONV-012` · 级别: 回归 · 执行者: 皆可

前置：基线；按 §3「连上飞书替身」；`login agent2@demo.test`；从 `api owner@demo.test "$B/api/v1/members"` 记 Mei Lin 的 `membershipId` 为 M；`q "select count(*) from conversation where claimed_by='<M>' and handling_state='human'"` 记为 K（Mei 原有的处理中会话数）。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 模拟器选 Demo TikTok TH 新买家 X，发「Can I return it?」 | 30 秒内发件箱 `/dev/outbox?tab=feishu` 最上面多一张「待认领 · Demo TikTok TH」；记会话 ID C |
| 2 | Mei 登录后打开 `/wb/<C>`，点「认领」 | 头部「我处理中」；发件箱没有新卡 |
| 3 | Mei 点「取消认领（放回待认领）」，在确认框点「取消认领」 | C 回到待认领；30 秒内发件箱最上面多一张 C 的「待认领 · Demo TikTok TH」，正文有「转人工原因 人工转交」，卡尾灰字「Shopilot · 会话进入待认领，同一段会话只推一次，处理人取消认领后再推」 |
| 4 | `q "select kind, seq, status from feishu_delivery where conversation_id='<C>' order by seq"` | 两行：`unclaimed\|0\|sent`、`unclaimed\|1\|sent` |
| 5 | `api agent2@demo.test -X POST $B/api/v1/conversations/<C>/claim -d '{}'` 返回 200 后，`api owner@demo.test -X POST $B/api/v1/members/<M>/disable` | 停用返回 200，`releasedConversations` 为 K + 1；C 回到待认领 |
| 6 | 等 30 秒，看发件箱并重跑第 4 步的 SQL | 没有 C 的新卡；SQL 仍是两行 |

后置：`api owner@demo.test -X POST $B/api/v1/members/<M>/enable` 恢复 Mei Lin。

#### `TC-FEISHU-018` 待认领卡带常见问题记录里的对话 — 对应 `REQ-CONV-013`、`REQ-FEISHU-005` · 级别: 回归 · 执行者: 皆可

前置：基线；按 §3「连上飞书替身」；按 §3「新建模拟买家」在 Demo Shopee SG（影子模式，新会话段进待认领）建买家 X，记模拟器会话 ID T。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 按 §3「问过 AI 助手后转人工」对 T 执行，`question` 为「Is the magnetic mount sold separately?」 | 返回 `"ok":true` |
| 2 | 20 秒后打开 `/dev/outbox?tab=feishu`，看买家 X 的待认领卡 | 最近对话里有说话人标「Shopee AI」的助手发言，以及说话人标「买家」的「Is the magnetic mount sold separately?」，它们排在买家「Chat with shop staff」之前 |

后置：重建基线（场景连了飞书）。

### 搜索

#### `TC-SEARCH-001` 员工搜不到非负责店铺的订单 — 对应 `REQ-SEARCH-001` · 级别: 回归 · 执行者: 皆可

前置：基线；模拟器为 Demo TikTok TH 新买家下单，记订单号 O。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | Nur 在顶栏搜索 O | 进入 `/search?q=<O>`，各分组都没有结果 |
| 2 | owner 搜索 O | 「订单」分组 1 条 |

后置：无。

#### `TC-SEARCH-002` 搜索自己的工单号进入详情 — 对应 `REQ-SEARCH-001` · 级别: 回归 · 执行者: 皆可

前置：基线；owner 建一张「内部确认」工单（Demo Shopee MY，负责人 Nur Aisyah），记工单号 T。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | Nur 在顶栏搜索 T | 「工单」分组 1 条 |
| 2 | 点该条 | 进入 T 的详情页 |

后置：无。

#### `TC-SEARCH-003` 按消息文本与买家名搜索 — 对应 `REQ-SEARCH-001` · 级别: 回归 · 执行者: 皆可

前置：基线；向 Demo Shopee MY 新买家 B 发「searchable-token-xyz」，记 B 的买家名。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | owner 搜索 searchable-token-xyz | 「消息」分组 1 条；点它打开 B 的会话 |
| 2 | owner 搜索 B 的买家名 | 「买家」分组 1 条 |
| 3 | Mei 搜索 searchable-token-xyz（Mei 负责 Demo Shopee MY，会话待处理） | 「消息」分组 1 条 |

后置：无。

#### `TC-SEARCH-004` 少于 2 个字不搜索 — 对应 `REQ-SEARCH-001` · 级别: 边缘 · 执行者: 皆可

前置：基线；以 owner@demo.test 登录；`login owner@demo.test`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 顶栏搜索输入「a」回车 | 页面提示至少输入 2 个字，没有结果列表 |
| 2 | `api owner@demo.test "$B/api/v1/search?q=a"` | 422，`type` 为 `/errors/validation` |

后置：无。

### 模拟平台与发件箱

#### `TC-MOCK-001` 模拟平台的签名校验与响应外层 — 对应 `REQ-MOCK-001` · 级别: 回归 · 执行者: 皆可

前置：基线；终端已定义 `B`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `curl -s "$B/mock/shopee/sg/api/v2/order/get_order_list?partner_id=2001001&timestamp=$(date +%s)&sign=bad&shop_id=1&access_token=x"` | JSON 顶层为 `request_id`、`error`、`message`（错误响应不带 `response`，与官方一致）；`error` 为 `error_sign` |
| 2 | 按 §3「Shopee 签名调用」把路径换成 `/api/v2/public/get_shops_by_partner` 并请求 | JSON 顶层为 `request_id`、`error`、`message`、`authed_shop_list`、`more`（该接口官方出参不包 `response`，见 `docs/platform-api/shopee/public.md`），`error` 为空；基线时 2001001 的店都未授权，`authed_shop_list` 为空 |
| 3 | `curl -s "$B/mock/tiktok/open-api/authorization/202309/shops?app_key=mockttwiz01&timestamp=$(date +%s)&sign=bad"` | JSON 顶层为 `code`、`message`、`request_id`、`data`；`code` 不为 0 |

后置：无。

#### `TC-MOCK-002` 关闭 MOCK_PLATFORM 后模拟路由与发件箱 404 — 对应 `REQ-MOCK-001`、`REQ-MOCK-003` · 级别: 边缘 · 执行者: 皆可

前置：基线。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `.env` 改 `MOCK_PLATFORM=0`，重启 `pnpm dev`，`/api/health` 含 `"service":"shopilot"` | 服务就绪 |
| 2 | 依次请求 `/mock/simulator`、`/api/mock/sim/state`、`/mock/shopee/sg/api/v2/public/get_shops_by_partner`、`/dev/outbox`、`/api/dev/outbox`、`/api/dev/feishu` | 都是 404 |
| 3 | 改回 `MOCK_PLATFORM=1` 并重启 | `/mock/simulator` 标题含「Shopilot 模拟器」 |

后置：确认 `.env` 为 `MOCK_PLATFORM=1`。

#### `TC-MOCK-003` 模拟器扮演 TikTok 买家与平台 — 对应 `REQ-MOCK-002` · 级别: 回归 · 执行者: 皆可

前置：基线；按 §3「固定为工作时间内」；以 owner@demo.test 登录。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 模拟器选 Demo TikTok MY 新买家 B，发「hello from sim」 | 推送日志新增 TikTok webhook type 14，HTTP 200 |
| 2 | owner 打开 `/wb` | 10 秒内出现 B 的会话，时间线有「hello from sim」 |
| 3 | 点「认领」，发「hello from seller」 | 模拟器 B 的买家视图出现「hello from seller」 |
| 4 | 模拟器为 B 下单并推进到 DELIVERED | owner 在右栏或 `/orders` 看到该订单状态为已送达（DELIVERED） |

后置：无。

#### `TC-MOCK-004` 发件箱列出邀请邮件并可打开其中链接 — 对应 `REQ-MOCK-003` · 级别: 回归 · 执行者: 皆可

前置：基线；以 owner@demo.test 登录。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 邀请 outbox.test@demo.test 为员工 | 弹层显示邀请链接 |
| 2 | 打开 `/dev/outbox` | 列表顶部是这封邮件：收件人 outbox.test@demo.test、模板 `invitation`、主题、时间 |
| 3 | 点开邮件，再点正文里的邀请链接 | 打开 `/invite/<令牌>`，页面显示商户 Demo Store |

后置：无。

#### `TC-MOCK-005` 模拟授权页对未登记应用报错 — 对应 `REQ-MOCK-001` · 级别: 边缘 · 执行者: 皆可

前置：基线。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 终端 `echo "$B/mock/shopee/sg/api/v2/shop/auth_partner?partner_id=9999999&timestamp=$(date +%s)&sign=x&redirect=$B/"`，浏览器打开输出的地址 | 页面提示授权链接无效（`invalid_partner_id`），没有授权按钮 |

后置：无。

## 5. 回归策略

冒烟级共 14 条，每轮必跑，合起来证明主链路：

| 主链路环节 | 冒烟用例 |
| --- | --- |
| 注册商户 → 接入 Shopee 店铺 | `TC-AUTH-001` → `TC-SHOP-001` |
| 登录与退出 | `TC-AUTH-004` |
| 模拟器买家发消息 → assist 草稿 → 员工认领发送 → 模拟器收到 | `TC-AI-001`；真实 DeepSeek 跑一遍 `TC-AI-002` |
| 退货自动建工单 → 同意退货 → 按平台事件推进到解决 | `TC-TKT-001` |
| 开票，经聊天与邮件两路发出 | `TC-ORD-015` |
| 三种角色的侧栏、员工调管理员接口 403 | `TC-PERM-001`、`TC-PERM-002` |
| 跨商户访问 404 | `TC-PERM-005` |
| 上传资料 → 解析为可用 | `TC-KB-001` |
| 买家提问 → 出稿检索资料 → 草稿显示依据 → 发送时不带依据 | `TC-KB-024` |
| 会话进入待认领 → 飞书群收到卡片 → 成员点卡认领 | `TC-FEISHU-005` → `TC-FEISHU-011` |

本期没有线上环境，冒烟用例都不标「线上可跑」，不设线上冒烟轮；上线前由 deploy-pipeline 补 §3 线上行后再按 TEMPLATE 头部判据逐条判定。

- **全量轮**（全部用例）：首次成稿后的第一轮、DESIGN §26 里程碑第 6 步的交付轮、跨功能域改动、地基变更（环境、鉴权、数据模型、模拟平台）。本期验收以对应 P0 REQ 的用例全部通过为准（§2）。
- **局部轮**（受影响用例 + 全部冒烟级）：单一功能改动。受影响用例的判定：先列出本次 DESIGN 改动触及的 `REQ-*`；改的是 §8 接口，取该接口「实现」列的 REQ；改的是 §11 状态机，取该节标题与迁移表里的接口所对应的 REQ；然后在仓库根执行 `grep -n '<REQ ID>' docs/TEST.md`，命中的 `####` 标题行即受影响用例。例：只改工单状态机 11.4 → `REQ-TKT-001`、`REQ-TKT-003`、`REQ-TKT-004` → `grep` 得到 `TC-TKT-*`、`TC-ORD-007`、`TC-RCP-*` 中引用这些 REQ 的用例。无 REQ 变更的改动（重构、依赖升级、纯 bug 修）按改动触及的功能域取 §4 对应 `###` 小节的全部用例；影响面拿不准时升级为全量轮。
- **复测轮**（上轮失败用例 + 全部冒烟级）：修复失败项之后。
- **人工收口轮**（仅上轮「待人工」用例）：AI 轮之后由人工补测收口，不要求冒烟级。当前执行者为人工的用例：`TC-SHOP-024`、`TC-CONV-009`、`TC-CONV-010`、`TC-TKT-020`、`TC-DASH-004`、`TC-ORD-020`、`TC-KB-036`、`TC-FEISHU-016`。

## 6. 执行记录

轮次汇总：

| 轮次 | 日期 | 环境 | 被测版本 | 执行者 | 范围 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| RUN-001 | 2026-10-12 | 本地 | 工作区 src 指纹 `3ce4a6b00939`（无 git） | AI（Claude Code 执行子会话 ×4 + 主会话；Playwright + Edge、curl） | 全量（225 条；结果分组见 `docs/test-runs/run-001-{auth,ordtkt,convai,shopset}.md`） | 通过 175/225 · 失败 44 · 待人工 6 |
| RUN-002 | 2026-10-12 | 本地 | 工作区 src 指纹 `253918dc9ffb`（无 git） | AI（Claude Code 执行子会话 ×4 + 主会话；Playwright + Edge、curl） | 全量（225 条；修复 RUN-001 失败项后的全量轮，按 §5 鉴权与模拟平台改动升为全量；分组结果见 `docs/test-runs/run-002-{auth,ordtkt,convai,shopset}.md`） | 通过 215/225 · 失败 4 · 待人工 6 |
| RUN-003 | 2026-10-12 | 本地 | 工作区 src 指纹 `1fed27c251af`（无 git） | AI（Claude Code 执行子会话；Playwright + Edge、curl） | 复测轮（RUN-002 失败 4 条 + 冒烟 9 条（`TC-AI-002` 未跑，见备注）+ 本次修复波及 7 条，共 20 条；`docs/test-runs/run-003-retest.md`） | 通过 17/20 · 失败 3 |
| RUN-004 | 2026-10-12 | 本地 | 工作区 src 指纹 `e2b917ec9642`（无 git） | AI（Claude Code 执行子会话 + 主会话；Playwright + Edge、curl） | 复测轮（RUN-003 失败 3 条 + 冒烟 10 条，`TC-PERM-005` 两者兼有，共 12 条；`docs/test-runs/run-004-retest.md`） | 通过 12/12 |
| RUN-005 | 2026-10-14 | 本地 | 工作区 src 指纹 `6a816fe3e80d`（未提交） | AI（Claude Code 执行子会话 ×4 + 主会话；Playwright + Edge、curl） | 全量（229 条；DESIGN v1.8 全面评审修复后的全量轮；分组结果见 `docs/test-runs/run-005-{auth,ordtkt,convai,shopset}.md`） | 通过 213/229 · 失败 10 · 待人工 6 |
| RUN-006 | 2026-10-14 | 本地 | 工作区 src 指纹 `6d146b82766f`（未提交） | AI（Claude Code 执行子会话 + 主会话；Playwright + Edge、curl） | 复测轮，去重共 30 条：RUN-005 失败 `TC-AUTH-014`、`TC-ORD-001`、`TC-ORD-016`、`TC-ORD-017`、`TC-ORD-018`、`TC-SHOP-001`、`TC-SET-013`、`TC-BILL-002`、`TC-SET-014`、`TC-AI-002` + 冒烟级 + 波及 `TC-ORD-012`、`TC-ORD-013`、`TC-ORD-014`、`TC-SET-008`、`TC-BILL-001`、`TC-CONV-014`、`TC-CONV-015`、`TC-CONV-017`、`TC-CONV-018`、`TC-CONV-019`、`TC-CONV-024`、`TC-CONV-031`（`docs/test-runs/run-006-retest.md`） | 通过 28/30 · 失败 2 |
| RUN-007 | 2026-10-14 | 本地 | 工作区 src 指纹 `eb256984cd71`（未提交） | AI（Claude Code 执行子会话 + 主会话；Playwright + Edge、curl） | 复测轮，共 14 条：RUN-006 失败 `TC-AUTH-014`、`TC-SET-013` + 冒烟级（含主会话执行的 `TC-AI-002`）+ 波及 `TC-SET-008`、`TC-BILL-001`（`docs/test-runs/run-007-retest.md`） | 通过 13/14 · 失败 1 |
| RUN-008 | 2026-10-14 | 本地 | 工作区 src 指纹 `5bf7106de632`（未提交） | AI（Claude Code 执行子会话 + 主会话；Playwright + Edge、curl） | 复测轮，共 11 条：RUN-007 失败 `TC-AUTH-014` + 冒烟级（含主会话执行的 `TC-AI-002`）（`docs/test-runs/run-008-retest.md`） | 通过 11/11 |
| RUN-009 | 2026-10-14 | 本地 | 工作区 src 指纹 `2e62fc541350`（未提交） | AI（Claude Code 执行子会话 + 主会话；Playwright + Edge、curl） | 局部轮（DESIGN v1.10 去掉侧栏出稿用量卡），共 25 条：受影响 `TC-PERM-001`、`TC-PERM-002`、`TC-PERM-003`、`TC-PERM-004`、`TC-PERM-006`、`TC-PERM-007`、`TC-BILL-001`、`TC-CONV-004`、`TC-CONV-005`、`TC-CONV-006`、`TC-CONV-007`、`TC-TKT-016`、`TC-TKT-017`、`TC-TKT-018`、`TC-NOTIF-001`、`TC-NOTIF-002`、`TC-NOTIF-003` + 其余冒烟 `TC-AUTH-001`、`TC-SHOP-001`、`TC-AUTH-004`、`TC-AI-001`、`TC-AI-002`（主会话执行）、`TC-TKT-001`、`TC-ORD-015`、`TC-PERM-005`（`docs/test-runs/run-009-local.md`） | 通过 25/25 |
| RUN-010 | 2026-10-15 | 本地 | `e4a7034` | AI（Claude Code 执行子会话；Playwright + Edge、curl） | 局部（TC-KB-001、TC-KB-002、TC-KB-003、TC-KB-004、TC-KB-005、TC-KB-006、TC-KB-007、TC-KB-008、TC-KB-009、TC-KB-010、TC-KB-011、TC-KB-012、TC-KB-013、TC-KB-014、TC-KB-015、TC-KB-016、TC-KB-017、TC-KB-018、TC-KB-019、TC-KB-020、TC-KB-021、TC-KB-022、TC-KB-023、TC-KB-024、TC-KB-025、TC-KB-026、TC-KB-027、TC-KB-028、TC-KB-029、TC-KB-030、TC-KB-031、TC-KB-032、TC-KB-033、TC-KB-034、TC-KB-035、TC-KB-036、TC-AI-003、TC-AI-005、TC-PERM-003、TC-TEAM-013、TC-CONV-010、TC-AUTH-001、TC-SHOP-001、TC-AUTH-004、TC-AI-001、TC-AI-002、TC-TKT-001、TC-ORD-015、TC-PERM-001、TC-PERM-002、TC-PERM-005） | 通过 48/51 · 失败 1 · 待人工 2 |
| RUN-011 | 2026-10-16 | 本地 | `adfc875` | AI（Claude Code 执行子会话；Playwright + Edge、curl） | 复测（RUN-010：TC-KB-035、TC-AUTH-001、TC-SHOP-001、TC-AUTH-004、TC-AI-001、TC-AI-002、TC-TKT-001、TC-ORD-015、TC-PERM-001、TC-PERM-002、TC-PERM-005、TC-KB-001、TC-KB-024） | 通过 13/13 |
| RUN-012 | 2026-10-16 | 本地 | `a246bfc` | AI（Claude Code 执行子会话；Playwright + Edge、curl） | 局部（TC-PERM-002、TC-PERM-001、TC-PERM-005、TC-AUTH-004、TC-AUTH-001、TC-SHOP-001、TC-AI-001、TC-TKT-001、TC-ORD-015、TC-KB-001、TC-KB-024、TC-AUTH-011、TC-AUTH-013、TC-AUTH-015、TC-AUTH-021、TC-CONV-012、TC-CONV-013、TC-CONV-029、TC-CONV-036、TC-AI-015、TC-SET-004、TC-SET-006、TC-MOCK-004、TC-TEAM-012、TC-FEISHU-004、TC-FEISHU-001、TC-FEISHU-002、TC-FEISHU-003、TC-FEISHU-005、TC-FEISHU-006、TC-FEISHU-007、TC-FEISHU-008、TC-FEISHU-009、TC-FEISHU-013、TC-FEISHU-011、TC-FEISHU-012、TC-FEISHU-015、TC-FEISHU-010、TC-CONV-037、TC-AUTH-014、TC-FEISHU-014、TC-MOCK-002、TC-AI-002、TC-SHOP-024、TC-FEISHU-016） | 通过 40/45 · 失败 3 · 待人工 2 |
| RUN-013 | 2026-10-16 | 本地 | `c248a6e` | AI（Claude Code 执行子会话；Playwright + Edge、curl） | 复测（RUN-012：TC-SHOP-001、TC-FEISHU-002、TC-FEISHU-007、TC-FEISHU-010、TC-PERM-002、TC-PERM-001、TC-PERM-005、TC-AUTH-004、TC-AUTH-001、TC-AI-001、TC-KB-001、TC-KB-024、TC-FEISHU-005、TC-FEISHU-011、TC-TKT-001、TC-ORD-015、TC-AI-002） | 通过 16/17 · 失败 1 |
| RUN-014 | 2026-10-16 | 本地 | `c41fff9` + 工作区改动（平台后台回复过的会话可接手） | AI（Claude Code 主会话；Playwright + Edge） | 局部（缺陷修复：TC-CONV-041） | 通过 1/1 |
| RUN-015 | 2026-10-16 | 本地 | `c6fc3a3` + 场景 `first-reply-off-hours`（未修复） | AI（Claude Code 执行子会话；curl） | 局部（TC-DASH-005） | 通过 0/1 · 失败 1 |
| RUN-016 | 2026-10-16 | 本地 | `c6fc3a3` + 工作区改动（团队页首响与看板同口径） | AI（Claude Code 执行子会话；curl） | 复测（RUN-015：TC-DASH-005） | 通过 1/1 |
| RUN-017 | 2026-10-16 | 本地 | `c6fc3a3` | AI（Claude Code 执行子会话；Playwright + Edge） | 局部（TC-CONV-044） | 通过 0/1 · 失败 1 |
| RUN-018 | 2026-10-16 | 本地 | `c6fc3a3` + 工作区改动（工作台轮询改为 3 / 2 / 10 秒） | AI（Claude Code 执行子会话；Playwright + Edge） | 复测（RUN-017：TC-CONV-044） | 通过 1/1 |
| RUN-019 | 2026-10-16 | 本地 | `1eaa7ec` + 工作区改动（取消认领、影子回复译文） | AI（Claude Code 执行子会话；Playwright + Edge、curl） | 局部（TC-CONV-042、TC-CONV-043、TC-AI-024、TC-FEISHU-017、TC-FEISHU-005、TC-FEISHU-006、TC-FEISHU-011、TC-AI-005） | 通过 7/8 · 失败 1 |
| RUN-020 | 2026-10-16 | 本地 | `1eaa7ec` + 工作区改动（取消认领、影子回复译文） | AI（Claude Code 执行子会话；Playwright + Edge、curl） | 复测（RUN-019：TC-FEISHU-017） | 通过 1/1 |
| RUN-025 | 2026-10-16 | 本地 | `1eaa7ec` + 模拟器动作 `seller_backend_reply`（未修复） | AI（Claude Code 执行子会话；curl） | 局部（TC-CONV-048） | 通过 0/1 · 失败 1 |
| RUN-026 | 2026-10-16 | 本地 | `1eaa7ec` + 工作区改动（Shopee 卖家后台回复补拉） | AI（Claude Code 执行子会话；curl、Playwright + Edge） | 复测（RUN-025：TC-CONV-048、TC-CONV-049、TC-CONV-050、TC-AI-001） | 通过 4/4 |
| RUN-030 | 2026-10-16 | 本地 | `1eaa7ec`（未修复） | AI（Claude Code 执行子会话；Playwright + Edge、curl） | 局部（TC-KB-042、TC-SHOP-031、TC-SHOP-032、TC-ORD-027） | 通过 0/4 · 失败 4 |
| RUN-031 | 2026-10-16 | 本地 | `1eaa7ec` + 工作区改动（空查询不检索、推送未订阅入口、窄屏横轴、已结束售后单不取原因） | AI（Claude Code 执行子会话；Playwright + Edge、curl） | 复测（RUN-030：TC-KB-042、TC-SHOP-031、TC-SHOP-032、TC-ORD-027、TC-KB-024） | 通过 5/5 |
| RUN-040 | 2026-10-16 | 本地 | `aa34591` + 场景 `tiktok-system-notices`（未修复） | AI（Claude Code 执行子会话；Playwright + Edge、curl） | 局部（TC-CONV-054、TC-CONV-055） | 通过 0/2 · 失败 2 |
| RUN-041 | 2026-10-16 | 本地 | `aa34591` + 工作区改动（他人处理中含平台后台会话、系统提示显示中文） | AI（Claude Code 执行子会话；Playwright + Edge、curl） | 复测（RUN-040：TC-CONV-054、TC-CONV-055、TC-PERM-001、TC-CONV-004） | 通过 4/4 |
| RUN-042 | 2026-10-17 | 本地 | `13a0a12` + 工作区改动（看板口径 DESIGN v1.21） | AI（Claude Code 执行子会话；Playwright + Edge、curl） | 局部（TC-DASH-001、TC-DASH-002、TC-DASH-003、TC-DASH-004、TC-DASH-006、TC-DASH-007、TC-DASH-008、TC-DASH-009、TC-BILL-001） | 通过 8/9 · 待人工 1 |
| RUN-050 | 2026-10-17 | 本地 | `ba4b462`（未修复） | AI（Claude Code 子会话；curl） | 局部（TC-AI-030） | 通过 0/1 · 失败 1 |
| RUN-051 | 2026-10-17 | 本地 | `ba4b462` + 工作区改动（回复语言、出稿防抖、影子模式非文字不出稿、混合检索 5 秒、DeepSeek 调用日志） | AI（Claude Code 子会话；Playwright + Edge、curl） | 复测（RUN-050：TC-AI-030、TC-AI-031、TC-AI-032、TC-AI-033、TC-AI-001、TC-KB-024、TC-AI-005、TC-AI-012、TC-AI-018、TC-KB-028、TC-KB-030） | 通过 11/11 |
| RUN-052 | 2026-10-17 | 本地 | `d464519` + 工作区改动（影子模式段内第一句文字出稿） | AI（Claude Code 子会话；curl） | 局部（TC-AI-034、TC-AI-031、TC-AI-032） | 通过 3/3 |
| RUN-053 | 2026-10-20 | 本地 | `67dd209`（未修复） | AI（Claude Code 子会话；Playwright + Edge、curl） | 局部（TC-CONV-057、TC-DASH-011） | 通过 0/2 · 失败 2 |
| RUN-054 | 2026-10-20 | 本地 | `c7deb15` + 工作区改动（只改 `docs/`） | AI（Claude Code 子会话；Playwright + Edge、curl） | 局部（TC-CONV-056、TC-CONV-057、TC-CONV-058、TC-CONV-059、TC-CONV-060、TC-CONV-061、TC-CONV-062、TC-CONV-063、TC-CONV-064、TC-CONV-065、TC-CONV-066、TC-CONV-067、TC-CONV-068、TC-AI-035、TC-FEISHU-018、TC-TKT-021、TC-TKT-022、TC-TKT-023、TC-TKT-024、TC-DASH-006、TC-DASH-008、TC-DASH-010、TC-DASH-011、TC-DASH-012、TC-DASH-013、TC-DASH-014） | 通过 24/26 · 失败 1 · 待人工 1 |
| RUN-055 | 2026-10-20 | 本地 | `d2660ca` | AI（Claude Code 主会话；Playwright + Edge） | 复测（RUN-054：TC-DASH-012） | 通过 1/1 |
| RUN-056 | 2026-10-21 | 本地 | `e4ac880` + 工作区改动（只改 `docs/`） | AI（Claude Code 子会话；Playwright + Edge、curl） | 局部（TC-CONV-069、TC-CONV-070、TC-CONV-071） | 通过 3/3 |
| RUN-057 | 2026-10-21 | 本地 | `e6994cc` + 工作区改动（只改 `docs/`、`AGENTS.md`） | AI（Claude Code 子会话；Playwright + Edge、curl） | 局部（TC-KB-043、TC-KB-044、TC-KB-045、TC-KB-046、TC-KB-047、TC-KB-048、TC-KB-049、TC-KB-050、TC-KB-051、TC-KB-052、TC-KB-053、TC-KB-054、TC-KB-055、TC-KB-056、TC-KB-057、TC-DASH-015、TC-DASH-016、TC-DASH-017、TC-DASH-018、TC-DASH-019、TC-KB-001、TC-KB-024、TC-AI-001、TC-PERM-001、TC-FEISHU-005） | 通过 19/25 · 失败 4 · 待人工 2 |
| RUN-058 | 2026-10-21 | 本地 | `e6994cc` + 工作区改动（只改 `docs/`、`AGENTS.md`） | AI（Claude Code 子会话；Playwright + Edge、curl） | 复测（RUN-057：TC-KB-045、TC-KB-049、TC-DASH-015、TC-KB-001） | 通过 4/4 |
| RUN-059 | 2026-10-21 | 本地 | `053c092` + 工作区改动（只改 `docs/`） | AI（Claude Code 子会话；Playwright + Edge、curl） | 局部（TC-CONV-072、TC-CONV-073、TC-CONV-074、TC-CONV-065、TC-CONV-068、TC-CONV-021、TC-CONV-022、TC-CONV-026、TC-CONV-070、TC-AI-010） | 通过 9/10 · 待人工 1 |
| RUN-060 | 2026-10-21 | 本地 | `wt/navperf` 工作区改动（侧栏整页预取、`(app)` 与接待设置加载骨架；基于 `d54a586`） | AI（Claude Code 子会话；Playwright + Edge） | 局部（TC-PERM-008） | 通过 1/1 |
| RUN-061 | 2026-10-21 | 本地 | `wt/convperf` 工作区改动（指到会话行预取会话、点下即显示会话头与骨架；基于 `d1ff89f`） | AI（Claude Code 子会话；Playwright + Edge） | 局部（TC-CONV-075、TC-PERM-008） | 通过 2/2 |
| RUN-062 | 2026-10-21 | 本地 | `wt/ttvideo` 工作区改动（TikTok 会话发视频：分块上传后用 202309 版发出；基于 `bb3f383`） | AI（Claude Code 子会话；Playwright + Edge、Playwright 请求） | 局部（TC-CONV-076、TC-CONV-077、TC-CONV-072、TC-CONV-022、TC-CONV-068） | 通过 4/5 · 待人工 1 |
| RUN-063 | 2026-10-21 | 本地 | `wt/vdims` 工作区改动（视频上传带宽高、时间线按真实比例显示；基于 `fcd1ea8`） | AI（Claude Code 子会话；Playwright + Edge、Playwright 请求） | 局部（TC-CONV-078） | 通过 1/1 |
| RUN-064 | 2026-10-21 | 本地 | `c956fea` + 工作区改动（只改 `docs/`；未修复） | AI（Claude Code 主会话；Playwright + Edge、curl） | 局部（TC-CONV-079） | 通过 0/1 · 失败 1 |
| RUN-065 | 2026-10-21 | 本地 | `c956fea` + 工作区改动（`docs/`、`src/lib/attachments.ts` 与其测试） | AI（Claude Code 主会话；Playwright + Edge、curl） | 复测（RUN-064：TC-CONV-079） | 通过 1/1 |
| RUN-066 | 2026-10-21 | 本地 | `d7a3c17` + 工作区改动（`docs/`、`learning-analyze.ts` 的审计动作名） | AI（Claude Code 子会话；Playwright + Edge、Node 请求） | 局部（TC-KB-058、TC-KB-059、TC-KB-060、TC-KB-061、TC-KB-062、TC-KB-063、TC-KB-064、TC-KB-065、TC-PERM-009、TC-KB-066、TC-KB-067、TC-KB-068、TC-KB-069、TC-KB-070、TC-KB-071、TC-AI-001、TC-KB-053、TC-PERM-001） | 通过 15/18 · 失败 3 |
| RUN-067 | 2026-10-22 | 本地 | `d7a3c17` + 工作区改动（`docs/`、`learning-analyze.ts`、`learning-bar.tsx`、`timeline.tsx`、`learning-drawer.tsx`） | AI（Claude Code 子会话；Playwright + Edge、Node 请求） | 复测（RUN-066：TC-KB-065、TC-KB-066、TC-KB-067） | 通过 3/3 |

明细（仅登非「通过」项）：
| RUN-002 | `TC-TEAM-002` | 失败 | 第 3 步已有账号从邀请页去登录、登录成功回到邀请页后仍显示「请先用 … 登录」，没有接受按钮，手动刷新后才出现；`run-002-TC-TEAM-002-3.png` | 实现修复（登录后沿用了登录前的邀请数据），RUN-003 复测 |
| RUN-002 | `TC-TEAM-012` | 失败 | 第 5 步重新启用后状态列显示「在线」：停用已退出该成员全部设备，`lastSeenAt` 仍在 5 分钟内；`run-002-TC-TEAM-012-5.json` | 实现修复（在线须有未过期会话），RUN-003 复测 |
| RUN-002 | `TC-TKT-007` | 失败 | 第 1 步负责人显示只读「Nur Aisyah（本人）」与提示「员工建的工单只能由自己负责」，用例写「本人（默认）」（取自工单详情改派下拉的文案）；`run-002-TC-TKT-007-1.png` | 用例修正，RUN-003 按新用例复测 |
| RUN-002 | `TC-CONV-012` | 失败 | 第 2 步败方（员工 Nur）收到「Mei Lin 已经认领了这个会话」，但对话栏变为「找不到或已删除」：员工看不到同事处理中的会话（§10），与 §19「刷新为只读」冲突；`run-002-TC-CONV-012-2.png` | 设计裁定：组长以上的败方刷新为只读，员工的败方显示「已由 X 认领」并回列表；实现修复，RUN-003 复测 |
| RUN-002 | `TC-SHOP-024` | 待人工 | 执行者为人工，AI 未执行 | 人工收口轮 |
| RUN-002 | `TC-CONV-009` | 待人工 | 执行者为人工，AI 未执行 | 人工收口轮 |
| RUN-002 | `TC-CONV-010` | 待人工 | 执行者为人工，AI 未执行 | 人工收口轮 |
| RUN-002 | `TC-ORD-020` | 待人工 | 执行者为人工，AI 未执行 | 人工收口轮 |
| RUN-002 | `TC-TKT-020` | 待人工 | 执行者为人工，AI 未执行 | 人工收口轮 |
| RUN-002 | `TC-DASH-004` | 待人工 | 执行者为人工，AI 未执行 | 人工收口轮 |
| RUN-003 | `TC-PERM-005` | 失败 | 第 3 步 owner 打开别的商户的会话显示「看不到这个会话」，不是 DESIGN §14 的「找不到或已删除」（RUN-002 修复时改了 404 文案）；`run-003-TC-PERM-005-3.png` | 实现修复（恢复 §14 文案），RUN-004 复测 |
| RUN-003 | `TC-TEAM-012` | 失败 | 第 1 步接口返回释放会话 4、退回工单 3，用例写 2 与 1：种子里 Mei 已有 2 个处理中会话与 2 张未结工单，前置没扣除；第 5 步（上轮失败点）已修好；`run-003-TC-TEAM-012-1.json` | 用例修正（前置记下原有数量），RUN-004 按新用例复测 |
| RUN-003 | `TC-CONV-004` | 失败 | 第 1 步 owner「我处理中」计数为 0，标签与侧栏都不显示数字，用例写「各带数字」；`run-003-TC-CONV-004-1.png` | 设计裁定计数为 0 不显示数字（`PAGE-WB`），用例修正，RUN-004 复测 |
| RUN-005 | `TC-AUTH-014` | 失败 | 第 1 步保存「管理员两步验证」后接口 200，但所有者随即被整页带到 `/account/security`，「已保存」提示被整页跳转冲掉；`run-005-TC-AUTH-014-1.png` | 实现修复，RUN-006 复测 |
| RUN-005 | `TC-ORD-001` | 失败 | 第 2 步订单推送到达后右栏 28 秒才显示（右栏每 30 秒轮询），用例要求 10 秒内；DESIGN §19 写 10 秒、`API-CONV-003` 写 30 秒轮询，前后矛盾；`run-005-TC-ORD-001-2.png` | 设计裁定右栏 10 秒轮询，实现修复，RUN-006 复测 |
| RUN-005 | `TC-ORD-016` | 失败 | 第 2 步发票行的入口文字是「工单 T-1017」，用例写「查看工单」，点进去与重发都正常；`run-005-TC-ORD-016-2.png` | 用例修正，RUN-006 按新用例复测 |
| RUN-005 | `TC-ORD-017` | 失败 | 第 1 步只填邮箱就生成，弹层提示「请填写抬头」「请填写地址」（`API-INV-002` 必填）；补填后其余步骤符合；`run-005-TC-ORD-017-1.png` | 用例修正（补填抬头与地址），RUN-006 复测 |
| RUN-005 | `TC-ORD-018` | 失败 | 第 2 步同 `TC-ORD-017` 缺抬头与地址；`run-005-TC-ORD-018-2.png` | 用例修正，RUN-006 复测 |
| RUN-005 | `TC-SHOP-001` | 失败 | 第 6 步检查页 PH 行的「准备清单第 4 项」是纯文字，不能跳转（RUN-002 时是链接）；`run-005-TC-SHOP-001-6.png` | 实现修复，RUN-006 复测 |
| RUN-005 | `TC-SET-013` | 失败 | 第 1 步未开两步验证的陈卓在转让对象里置灰、选不中（v1.8 只列合格受让人），用例仍写「选陈卓，点转让」；接口直调 409 `two_factor_disabled`；`run-005-TC-SET-013-1.png` | 用例修正，RUN-006 复测 |
| RUN-005 | `TC-BILL-002` | 失败 | 第 1 步提示为「只有账号所有者 林晓 能改套餐」，用例写「…能操作」；接口仍 403 `/errors/owner-only`；`run-005-TC-BILL-002-1.png` | 用例修正（界面提示按动作写明），RUN-006 复测 |
| RUN-005 | `TC-SET-014` | 失败 | 第 6 步同 `TC-BILL-002` 的提示文案；`run-005-TC-SET-014-6.png` | 用例修正，RUN-006 复测 |
| RUN-005 | `TC-AI-002` | 失败 | 第 2 步真实 DeepSeek 的草稿写了物流与运单号，但没有写订单号；`run-005-TC-AI-002-2.json` | 实现修复（提示词要求问订单、物流时写明订单号），RUN-006 复测 |
| RUN-005 | `TC-SHOP-024` | 待人工 | 执行者为人工，AI 未执行 | 人工收口轮 |
| RUN-005 | `TC-CONV-009` | 待人工 | 执行者为人工，AI 未执行 | 人工收口轮 |
| RUN-005 | `TC-CONV-010` | 待人工 | 执行者为人工，AI 未执行 | 人工收口轮 |
| RUN-005 | `TC-ORD-020` | 待人工 | 执行者为人工，AI 未执行 | 人工收口轮 |
| RUN-005 | `TC-TKT-020` | 待人工 | 执行者为人工，AI 未执行 | 人工收口轮 |
| RUN-005 | `TC-DASH-004` | 待人工 | 执行者为人工，AI 未执行 | 人工收口轮 |
| RUN-006 | `TC-AUTH-014` | 失败 | 第 1 步「已保存」提示出现约 11 ms 后页面整页跳到 `/account/security`，跳过去的页面没有提示（客户端跳转之前，被两步验证拦下的请求触发了整页跳转）；`run-006-TC-AUTH-014-1.png` | 实现修复，RUN-007 复测 |
| RUN-006 | `TC-SET-013` | 失败 | 第 1 步唯一的候选人不可选时，「转让给」下拉的选项列表渲染在屏幕外（x=0、y=900），看不到「陈卓（未开两步验证…）」；第 1b、2 步通过；`run-006-TC-SET-013-1.png` | 实现修复，RUN-007 复测 |
| RUN-007 | `TC-AUTH-014` | 失败 | 第 1 步提示改由账号安全页显示后，旧页面先被客户端跳转带到账号安全页并取走提示，随后被拦下的请求触发整页刷新，刷新后的页面没有提示（在屏约 26 ms）；`run-007-TC-AUTH-014-1.png` | 实现修复，RUN-008 复测 |

| 轮次 | 用例 | 结果 | 现象 / 证据 | 跟进 |
| --- | --- | --- | --- | --- |
| RUN-001 | `TC-AUTH-001` | 失败 | 第 6 步成员状态列显示「在线」或最近活跃时间，不是「已启用」（与原型一致）；`run-001-auth.md` | 用例修正，RUN-002 按新用例复测 |
| RUN-001 | `TC-AUTH-002` | 失败 | 第 1 步提示里没有登录链接（表单底部常驻「已有账号？登录」）；第 3 步与 `TC-AUTH-013` 矛盾：只属一个商户时账号弹层不列商户；`run-001-auth.md` | 用例修正，RUN-002 按新用例复测 |
| RUN-001 | `TC-AUTH-004` | 失败 | 第 5 步用例的退出命令没有请求体，接口 422；不带 Content-Type 时返回 500；`run-001-auth.md` | 用例补 `-d '{}'`；无请求体退出改为正常退出（实现修复） |
| RUN-001 | `TC-AUTH-006` | 失败 | 第 3 步未注册邮箱的失败登录不归属任何商户，不出现在商户登录记录；`run-001-auth.md` | 用例修正，RUN-002 按新用例复测 |
| RUN-001 | `TC-AUTH-008` | 失败 | 第 3 步设新密码后停在重置页给「去登录」，没有回到 `/login`；第 7 步重复使用链接 `code` 为 `used_or_expired` 不是 `used`；`run-001-auth.md` | 实现修复，RUN-002 复测 |
| RUN-001 | `TC-AUTH-016` | 失败 | 第 1 步账号弹层没有「账号安全」入口，只能经「两步验证（未开启）」进入；`run-001-auth.md` | 实现修复，RUN-002 复测 |
| RUN-001 | `TC-AUTH-018` | 失败 | 第 2 步白名单外 IP 登录返回 200 并建立会话，之后的接口才 403 `ip-blocked`；登录记录记成功；`run-001-TC-AUTH-018-2.json` | 实现修复，RUN-002 复测 |
| RUN-001 | `TC-TEAM-001` | 失败 | 第 2 步邀请弹层没有显示到期时间，链接卡片与「复制链接」溢出弹层右缘；第 7 步状态列同 `TC-AUTH-001`；`run-001-auth.md` | 实现修复，RUN-002 复测；状态列用例修正 |
| RUN-001 | `TC-TEAM-002` | 失败 | 第 5 步状态列同 `TC-AUTH-001`；`run-001-auth.md` | 用例修正，RUN-002 按新用例复测 |
| RUN-001 | `TC-TEAM-004` | 失败 | 第 1 步撤销邀请页文案「邀请已被撤销。如有疑问请联系邀请你的管理员。」与 DESIGN §19「邀请已撤销，请联系管理员重发」不一致；`run-001-auth.md` | 实现修复，RUN-002 复测 |
| RUN-001 | `TC-TEAM-007` | 失败 | 第 2 步同 `TC-TEAM-004` 的文案；`run-001-auth.md` | 实现修复，RUN-002 复测 |
| RUN-001 | `TC-TEAM-010` | 失败 | 第 1 步所有者的角色是纯文本「管理员」，不是置灰的下拉（与原型一致）；`run-001-auth.md` | 用例修正，RUN-002 按新用例复测 |
| RUN-001 | `TC-TEAM-012` | 失败 | 第 3 步会话回到待认领，但工作台时间线没有「处理人被停用」系统事件（接口 `events` 有）；第 5 步状态列同 `TC-AUTH-001`；`run-001-auth.md` | 实现修复，RUN-002 复测；状态列用例修正 |
| RUN-001 | `TC-TEAM-016` | 失败 | 第 3 步 60 秒内第二次「重置密码」又发出一封邮件；`run-001-auth.md` | 实现修复，RUN-002 复测 |
| RUN-001 | `TC-NOTIF-001` | 失败 | 第 1 步通知图标只显示红点，没有数字 3（与原型一致；数字在 `aria-label`）；`run-001-auth.md` | 用例修正，RUN-002 按新用例复测 |
| RUN-001 | `TC-ORD-001` | 失败 | 第 2 步右栏没有运单号与轨迹事件（推送 code 4、code 30 都 200，订单 `tracking` 只有承运商）；状态显示「运输中」，用例写「已发货」；`run-001-ordtkt.md` | 实现修复，RUN-002 复测；状态文案用例修正 |
| RUN-001 | `TC-ORD-011` | 失败 | 第 2 步拒绝原因取自平台列表（3 项英文），没有用例写的「买家凭证不足」「其他」；工单页没有「处理申请」按钮，要经订单抽屉；`run-001-ordtkt.md` | 工单页加「处理申请」（实现修复）；原因列表用例修正 |
| RUN-001 | `TC-ORD-012` | 失败 | 第 2 步「发起争议」要先选争议原因，用例没有这一步；选了原因后行为符合；`run-001-TC-ORD-012-2.png` | 用例修正，RUN-002 按新用例复测 |
| RUN-001 | `TC-ORD-014` | 失败 | 第 2 步「拒收」要先选原因，用例没有这一步；选了原因后行为符合；`run-001-ordtkt.md` | 用例修正，RUN-002 按新用例复测 |
| RUN-001 | `TC-TKT-001` | 失败 | 第 5 步模拟器停在 `RETURN_OR_REFUND_REQUEST_SUCCESS`，不到 `_COMPLETE`（工单已解决）；第 6 步时间线人工动作只写「处理售后」，没有「同意退货」「确认收货」，没有平台「退款完成」事件；`run-001-ordtkt.md` | 实现修复，RUN-002 复测 |
| RUN-001 | `TC-TKT-004` | 失败 | 第 3 步时间线来源标「人工」，用例与审计日志都是「页面」；`run-001-TC-TKT-004-3.png` | 实现修复，RUN-002 复测 |
| RUN-001 | `TC-TKT-011` | 失败 | 第 2 步同 `TC-TKT-004` 的来源标签；`run-001-TC-TKT-011-2.png` | 实现修复，RUN-002 复测 |
| RUN-001 | `TC-TKT-012` | 失败 | 第 2 步「明天 18:00」恰好是建单默认截止，改成同值不产生时间线与审计；`run-001-ordtkt.md` | 用例修正，RUN-002 按新用例复测 |
| RUN-001 | `TC-TKT-015` | 失败 | 第 4 步新工单 version = 1，「小 1」得 0，返回 422 不是 409（先改一次再用旧版本号得 409）；`run-001-TC-TKT-015-4.json` | 用例修正，RUN-002 按新用例复测 |
| RUN-001 | `TC-TKT-016` | 失败 | 第 1 步工单徽标本就计入 6 小时内到期的工单，扫描前已计入，预期 n+1 与 DESIGN 徽标口径矛盾；`run-001-TC-TKT-016-1.json` | 用例修正，RUN-002 按新用例复测 |
| RUN-001 | `TC-CONV-004` | 失败 | 第 1 步「已结束」标签与侧栏「同事处理中」「已结束」没有数字，1440 宽标签行被截断看不到「已结束」；第 4 步没有店铺筛选；`run-001-convai.md` | 实现修复，RUN-002 复测 |
| RUN-001 | `TC-CONV-008` | 失败 | 第 1 步时间线图片缩略图点不开大图；第 3 步 Shopee 买家消息没有平台译文（模拟平台推送不带译文）；`run-001-convai.md` | 图片点开（实现修复）；Shopee 平台译文待裁决 |
| RUN-001 | `TC-CONV-017` | 失败 | 第 1 步「同事处理中」里买家最后发言的行只显示等待时长，不显示处理人；`run-001-convai.md` | 实现修复，RUN-002 复测 |
| RUN-001 | `TC-CONV-024` | 失败 | 第 1 步入口为「发卡片」弹层，优惠券是单独按钮；商品卡置灰原因文案重复「商品卡不可用」；`run-001-convai.md` | 用例按 DESIGN 修正入口；重复文案实现修复 |
| RUN-001 | `TC-CONV-026` | 失败 | 第 2 步 502 的 `extra` 没有 `platformCode`；`run-001-TC-CONV-026-2.json` | 实现修复，RUN-002 复测 |
| RUN-001 | `TC-CONV-031` | 失败 | 第 2 步审计只写「把阶段改为 aftersale」，没有原阶段，新阶段是英文枚举；`run-001-convai.md` | 实现修复，RUN-002 复测 |
| RUN-001 | `TC-AI-010` | 失败 | 第 3 步审计行与 CSV 都看不到编辑距离；`run-001-convai.md` | 实现修复，RUN-002 复测 |
| RUN-001 | `TC-SHOP-006` | 失败 | 第 1 步显示的当前回调是种子值 `https://erp.example.com/shopee/push`，用例写 `https://erp.example.com`；`run-001-shopset.md` | 用例修正，RUN-002 按新用例复测 |
| RUN-001 | `TC-SHOP-013` | 失败 | 第 1 步基线刚重建时回复率是「等待首次同步」，要先跑 `pnpm job shop.metrics`；`run-001-shopset.md` | 用例修正，RUN-002 按新用例复测 |
| RUN-001 | `TC-SHOP-014` | 失败 | 第 1 步 TH 行显示「7 天零入站」但行上没有「需处理」标记（只在顶部卡片与筛选）；`run-001-shopset.md` | 实现修复，RUN-002 复测 |
| RUN-001 | `TC-SHOP-015` | 失败 | 第 2 步配方把回调改到 `https://erp.example.com`，模拟平台测试推送连不上，改不成；`run-001-shopset.md` | 用例修正，RUN-002 按新用例复测 |
| RUN-001 | `TC-SHOP-021` | 失败 | 第 3 步 `/wb`、`/orders` 没有店铺筛选，无法按店铺核对；`run-001-shopset.md` | 实现修复，RUN-002 复测 |
| RUN-001 | `TC-SHOP-023` | 失败 | 第 4、5 步同 `TC-SHOP-021` 缺店铺筛选；`run-001-shopset.md` | 实现修复，RUN-002 复测 |
| RUN-001 | `TC-SET-002` | 失败 | 第 1 步保存提示与字段说明仍写「从次日 00:00 起生效」，DESIGN v1.4 为立即生效；`run-001-shopset.md` | 实现修复，RUN-002 复测 |
| RUN-001 | `TC-SET-003` | 失败 | 第 4 步「放弃修改」后表单不恢复；`run-001-shopset.md` | 实现修复，RUN-002 复测 |
| RUN-001 | `TC-SET-008` | 失败 | 第 3 步删除买家数据后按买家名仍能搜到订单镜像（DESIGN 删除范围不含订单镜像）；`run-001-shopset.md` | 待裁决（倾向把订单镜像纳入删除） |
| RUN-001 | `TC-SET-015` | 失败 | 第 4 步被停用成员登录接口 200，页面提示「还没有加入任何商户」，登录记录没有 `disabled` 失败原因；`run-001-shopset.md` | 实现修复，RUN-002 复测 |
| RUN-001 | `TC-MOCK-001` | 失败 | 第 1、2 步用例地址缺区域段（404）；Shopee 响应按官方文档无 `response` 包裹；`run-001-shopset.md` | 用例修正，RUN-002 按新用例复测 |
| RUN-001 | `TC-MOCK-005` | 失败 | 第 1 步用例地址 `/mock/shopee/authorize` 已改为真实平台路径（DESIGN v1.4 `API-MOCK-003`），返回 404；`run-001-TC-MOCK-005-1.png` | 用例修正，RUN-002 按新用例复测 |
| RUN-001 | `TC-SHOP-024` | 待人工 | 执行者为人工，AI 未执行 | 人工收口轮 |
| RUN-001 | `TC-CONV-009` | 待人工 | 执行者为人工，AI 未执行 | 人工收口轮 |
| RUN-001 | `TC-CONV-010` | 待人工 | 执行者为人工，AI 未执行 | 人工收口轮 |
| RUN-001 | `TC-ORD-020` | 待人工 | 执行者为人工，AI 未执行 | 人工收口轮 |
| RUN-001 | `TC-TKT-020` | 待人工 | 执行者为人工，AI 未执行 | 人工收口轮 |
| RUN-001 | `TC-DASH-004` | 待人工 | 执行者为人工，AI 未执行 | 人工收口轮 |
| RUN-010 | TC-KB-035 | 失败 | 第 2 步预期补扫后 D1 重新入库变为 `ready`；实际 30 秒后仍 `queued`，没有新的入库任务：前置里关掉 AI 可用把资料的更新时间刷成了当前，补扫按资料最近一次更新判断「排队超过 10 分钟」；第 3 步未执行；证据 `docs/test-runs/run-010-TC-KB-035-2.json`、`docs/test-runs/run-010-TC-KB-035-2.png` | 设计裁定：补扫按资料最近一次更新计时（DESIGN §17 写明，改分类、站点、AI 可用都重新计时），用例前置去掉关 AI 可用一步；RUN-011 复测 |
| RUN-010 | TC-CONV-010 | 待人工 | 执行者为人工，AI 未执行 | 人工收口轮 |
| RUN-010 | TC-KB-036 | 待人工 | 执行者为人工（真实 Cloudflare AI Search 与 DeepSeek，token 由人解锁 Bitwarden 取），AI 未执行 | 人工收口轮 |
| RUN-012 | TC-SHOP-001 | 失败 | 第 9 步先发消息再打开 signup1 的 `/wb`，发出后 10.3 秒待认领里仍没有该会话：首次取列表时会话还没进入待认领，下一次要等 10 秒轮询；DESIGN §16 的口径是下一次轮询（≤ 10 秒）可见，从发出算起最长约 11 秒；另做一次先开页面再发为 8.9 秒；证据：`run-012-local.md` 记的入库时间与等待超时（无截图） | 用例口径待裁定（「10 秒内」从发出算起还是从进入待认领算起），RUN-013 照原用例复测 |
| RUN-012 | TC-FEISHU-002 | 失败 | 第 2 步测试卡片正文有图片说明，图片位置只显示文字「图片 img_stub_bytes_301」：替身把上传的图片字节记成只带大小的 key，开发发件箱解不出原图；证据 `run-012-TC-FEISHU-002-2.png` | 实现修复，RUN-013 复测 |
| RUN-012 | TC-FEISHU-007 | 失败 | 第 3 步中文消息「我要人工客服」下方多了「译文：[Shopee 机翻] 我要人工客服」：模拟 Shopee 推送带的平台机翻被原样放进卡片；证据 `run-012-TC-FEISHU-007-3.png` | 实现修复（原文是中文时不放译文），DESIGN §12.9 构卡规则写明，RUN-013 复测 |
| RUN-012 | TC-SHOP-024 | 待人工 | 执行者为人工，AI 未执行 | 人工收口轮 |
| RUN-012 | TC-FEISHU-016 | 待人工 | 执行者为人工（真实飞书），AI 未执行；开发期间不向真实飞书群发消息 | 人工收口轮 |
| RUN-013 | TC-SHOP-001 | 失败 | 第 9 步照用例先发消息再打开 `/wb`，发出后 10.0 秒待认领里仍没有该会话，与 RUN-012 相同：会话入库后约 2 秒影子草稿生成，页面首次取列表时还不可见，下一次要等 10 秒轮询；证据 `run-013-TC-SHOP-001-9.png` | 用例口径待裁定（「10 秒内」从发出算起，还是改为下一次列表刷新后可见），裁定前不改用例 |
| RUN-015 | TC-DASH-005 | 失败 | 第 2 步林晓的 `handled.firstReplyMedianSec` 为 1200，预期 null（第 1 步看板为 null）：团队页的首响中位没排除工作时间外开始的会话段；证据 `docs/test-runs/run-015-TC-DASH-005-2.json` | 实现修复（团队页改用看板的首响样本），RUN-016 复测 |
| RUN-017 | TC-CONV-044 | 失败 | 第 3 步预期 T1 后 5 秒内列表出现 X 的会话，实际 10.1 秒才出现（列表每 10 秒刷新一次）；第 5 步时间线 4.4 秒（预期 3 秒内）；第 7 步侧栏计数 30.1 秒（预期 12 秒内）；证据 `docs/test-runs/run-017-TC-CONV-044-3.png`（列表头已是「待认领 7」，侧栏仍是 6） | 实现修复（轮询改为列表 3 秒、详情 2 秒、导航摘要 10 秒，DESIGN v1.13 §15、ADR-007），RUN-018 复测 |
| RUN-019 | TC-FEISHU-017 | 失败 | 第 5 步预期停用返回 `releasedConversations` 为 1，实际 3（另退回 2 张工单）：种子里 Mei Lin 原本就有 2 个处理中的会话，用例前置没记下来。第 1–4、6 步通过：取消认领后 C 的第二张卡序号为 1，正文有「转人工原因 人工转交」、卡尾「处理人取消认领后再推」；停用退回后 C 没有新卡；证据 `docs/test-runs/run-019-TC-FEISHU-017-5.json` | 用例修正（前置记 Mei 原有处理中会话数 K，预期 K + 1），RUN-020 复测通过 |
| RUN-025 | TC-CONV-048 | 失败 | 第 4 步预期会话转 `human`、时间线出现「Yes, in stock. Ships today.」（平台后台），实际 `handlingState` 仍为 `bot`、时间线只有买家消息、草稿仍在；这条 `mark_as_replied` 通知被记为 ignored「聊天通知 mark_as_replied，不是消息」；证据 `docs/test-runs/run-025-TC-CONV-048-4.json` | 实现修复（收到通知后补拉，DESIGN v1.16 §11.1），RUN-026 复测 |
| RUN-030 | TC-KB-042 | 失败 | 第 2 步预期检索快照 `routes` 为 `[]`，实际有一条原话路的混合检索；第 3 步 `lastQuery` 有一条 `query` 为空串的请求（检索替身不拒空查询，线上 Cloudflare 对它返回 400 7001）；证据 `docs/test-runs/run-030-TC-KB-042-2.json` | 实现修复，RUN-031 复测 |
| RUN-030 | TC-SHOP-031 | 失败 | 第 1 步两家 Shopee 店「连接」列都是「正常」，Shopee 应用卡没有「重新校验」；订单页提示的链接仍是「去检查连接」指向 `/shops`；证据 `docs/test-runs/run-030-TC-SHOP-031-1.png` | 实现修复，RUN-031 复测 |
| RUN-030 | TC-SHOP-032 | 失败 | 第 1 步 390 宽下 8 组横轴文字都写成「Shopee / MY」两行，相邻 7 处重叠，最小间距 -7.6 像素；证据 `docs/test-runs/run-030-TC-SHOP-032-1.png` | 实现修复，RUN-031 复测 |
| RUN-030 | TC-ORD-027 | 失败 | 第 2 步预期 409，实际 HTTP 200 并返回 3 条原因，日志有一次 `reject_reasons` 平台调用（模拟平台对已结束的取消单照样给原因；线上真实 TikTok 报错，接口返回 502）；证据 `docs/test-runs/run-030-TC-ORD-027-2.json` | 实现修复，RUN-031 复测 |
| RUN-040 | TC-CONV-054 | 失败 | 第 1 步 Nur 的侧栏工作台只有待认领、AI 草稿、我处理中、已结束，没有「他人处理中」，C 在五个分组的接口结果里都没有；第 2 步 `counts.team` 为 0，预期 T0 + 1 = 1；第 3 步 owner 的 `view=team` 里也没有 C；证据 `docs/test-runs/run-040-TC-CONV-054-1.png` | 实现修复（他人处理中含平台后台处理、没有处理人的会话，员工也有这一组），RUN-041 复测 |
| RUN-040 | TC-CONV-055 | 失败 | 第 1 步 6 条系统提示都原样显示英文，如「Chat ended by customer service agent.」；第 2 步没有「客服已结束对话」可点；证据 `docs/test-runs/run-040-TC-CONV-055-1.png` | 实现修复（时间线按对照表显示中文，可点开看原文），RUN-041 复测 |
| RUN-042 | TC-DASH-004 | 待人工 | 执行者为人工，AI 未执行 | 人工收口轮 |
| RUN-050 | TC-AI-030 | 失败 | 第 2 步预期 `lang` 输出 `Thai`，实际 `null`：出稿请求没有 `reply_language`，`brand_voice` 是前置里那段中文，模型只能从品牌语气和对话里猜回复语言；第 3 步护栏只写「brand_voice 只调整语气」；证据 `docs/test-runs/run-050-TC-AI-030-2.json` | 实现修复，RUN-051 复测 |
| RUN-053 | TC-CONV-057 | 失败 | 第 7 步查不到常见问题记录，第 8 步那条 `bundle_message` 入站事件为 `ignored`，原因「会话不存在的卖家侧消息」；证据 `docs/test-runs/run-053-TC-CONV-057-5.json`、`docs/test-runs/run-053-TC-CONV-057-8.txt` | 实现修复，RUN-054 复测 |
| RUN-053 | TC-DASH-011 | 失败 | 第 2 步 `kpis.firstReplySamples` 由 7 变为 8，预期仍为 7；Nur 的 `firstReplyMedianSec` 为 0；证据 `docs/test-runs/run-053-TC-DASH-011-2.json` | 实现修复，RUN-054 复测 |
| RUN-054 | TC-DASH-012 | 失败 | 第 4 步先点 7 天前（10-13）再点昨天（10-19）、点「应用」后地址为 `from=2026-09-23&to=2026-10-19`，预期 `from=2026-10-13&to=2026-10-19`：日历里已有选中范围时，第一下点在范围内只改了结束日，不能用两下点出一个新范围；从默认「本月」打开同样得到 `from=2026-10-01&to=2026-10-19`；证据 `docs/test-runs/run-054-TC-DASH-012-4.png`、`docs/test-runs/run-054-TC-DASH-012-4b.png` | 待修复后复测 |
| RUN-054 | TC-CONV-068 | 待人工 | 执行者为人工，要在已接真实 Shopee、TikTok 店的环境里对真实会话执行 | 交用户在 shopilot.live 执行 |
| RUN-057 | TC-KB-045 | 失败 | 第 2 步未对应列表只有 Demo Shopee MY、Demo Shopee SG、Demo TikTok TH 三组，没有 Demo TikTok MY，也没有卖家 SKU `1729582718312480101`：种子里 Demo TikTok MY 没有商品读取权限（§3 写明 `productScope = false`），用例前置写成「授予了商品读取权限」；第 3 步导入后 `listingCount` 为 0（预期 1），第 4 步同店没有可比的其他 SKU。补充观察（不计入判定）：改导入种子里存在的 `1729582718312480201`（Demo TikTok TH，编码首尾带空格），20 秒后 `listingCount` 为 1、它从未对应列表里消失；证据 `run-057-TC-KB-045-1.json`、`run-057-TC-KB-045-2.json`、`run-057-TC-KB-045-3.json`、`run-057-TC-KB-045-4b.txt` | 用例前置与种子不符，待用例修正（改用 Demo TikTok TH 与 `1729582718312480201`）后复测 |
| RUN-057 | TC-KB-049 | 失败 | 第 1 步 `qa.hits` 里 Q 的 `distance` 为 0.1659，用例写 0：问答向量按全部问法（「可以退货吗；怎么退货」）拼接计算，只用其中一个问法提问不会完全重合；第 6 步第二次 `DELETE` 返回 HTTP 404，用例写两次都 204；其余步骤符合（第 3 步下架后测试问答返回 `qa: null`，没有命中，按「不再命中」判符合）；证据 `run-057-TC-KB-049-1.json`、`run-057-TC-KB-049-3.json` | 待裁决：用例改预期（距离小于阈值、重复删除 404），还是实现改为重复删除返回 204 |
| RUN-057 | TC-DASH-015 | 失败 | 第 7 步 `draftReview.shadow` 的 `consistency` 是对象 `{"num":1,"den":1,"rate":null}`，用例写「`consistency` 为 `null`」；为 null 的是 `consistency.rate`，`compared`、`same` 都是 N0 + 1；其余 7 步符合；证据 `run-057-TC-DASH-015.txt`、`run-057-TC-DASH-015-8.png` | 用例措辞待修正（改为 `consistency.rate` 为 `null`）后复测 |
| RUN-057 | TC-KB-001 | 失败 | 第 1 步打开 `/reception/knowledge` 默认进「问答」页签，页面没有「资料 0 / 500」的左栏，也没有右栏「测试问答」面板：v1.25 知识库改成问答、待审核、资料、产品、测试问答五个页签，用例仍按旧的左右两栏写。补充观察（不计入判定）：在 `?tab=docs` 按第 2–8 步上传 `保修政策.pdf` 与 `型号对照.xlsx`，弹窗文案、上传进度、分类、状态变为可用、抽屉与 `documents` 接口返回都和原预期一致；证据 `run-057-TC-KB-001-1.png`、`run-057-TC-KB-001-5b.png` | 用例待按页签布局修正后复测 |
| RUN-057 | TC-KB-056 | 待人工 | 执行者为人工，要在线上真实 Cloudflare 向量化环境执行 | 交用户在 shopilot.live 执行 |
| RUN-057 | TC-DASH-019 | 待人工 | 执行者为人工，要在线上草稿对比上线满 7 天后抽检 | 交用户在 shopilot.live 执行 |
| RUN-059 | TC-CONV-068 | 待人工 | 执行者为人工，要在已接真实 Shopee、TikTok 店的环境里对真实会话执行 | 交用户在 shopilot.live 执行 |
| RUN-062 | TC-CONV-068 | 待人工 | 执行者为人工，第 5 步要在已接真实 TikTok 店的环境里对真实会话发 20 MB 以上视频 | 交用户在 shopilot.live 执行 |
| RUN-064 | TC-CONV-079 | 失败 | 第 3 步 qt.mp4 上传 HTTP 201，点发送后它在附件条里标「没发出」，时间线没有新增视频，库里视频消息仍只有 clip.mp4 一条：文件头是 QuickTime，上传记为 `video/quicktime`，发送接口按 Shopee 只收 MP4 拒绝。连带：第 4 步粘贴 clip.mov 提示「只支持 MP4 视频，MOV 等格式请先导出为 MP4。」不进附件条，第 5、6 步只有一条视频，第 7 步是同一句旧提示，第 10 步 `detail` 为「Shopee 只能发 MP4 视频。」；第 1、2、8、9、11 步符合；证据 `docs/test-runs/run-064-TC-CONV-079-3.png`、`docs/test-runs/run-064-TC-CONV-079.json` | 实现修复，RUN-065 复测通过 |
| RUN-066 | TC-KB-065 | 失败 | 第 2 步发送 A、B 的草稿返回 HTTP 422 `/errors/validation`，`clientRequestId`「数值过小：期望 string >=8 字符」：用例写的 `stat-a`、`stat-b` 只有 6 个字符，接口要求 8–80 个；第 3–5 步因此只统计到弃用 1、转人工 1（调用 4 次、采纳率 0%）。用例错；证据 `docs/test-runs/run-066-results.json` | 原位改为 `stat-card-a`、`stat-card-b`，RUN-067 复测通过 |
| RUN-066 | TC-KB-066 | 失败 | 第 3 步刷新会话后两条消息下方仍只写「已提交学习」，预期「已提交学习 · 待审核」（DESIGN FLOW-KB-LEARN S9：员工在会话里看到「已提交学习」与结论）；此时 API-CONV-019 已返回 `pending_review`，界面没有显示；其余 5 步符合；证据 `docs/test-runs/run-066-TC-KB-066-3.png` | 实现缺陷：时间线标记后接最近一次提交的进度或结论，RUN-067 复测通过 |
| RUN-066 | TC-KB-067 | 失败 | 第 2 步没有相似卡时任务抽屉整节不显示「相似内容」（六样材料只出现五样）；第 9 步消息下方只写「已提交学习」，预期「已提交学习 · 新建了经验卡」；其余 7 步符合；证据 `docs/test-runs/run-066-TC-KB-067-2.png`、`docs/test-runs/run-066-TC-KB-067-9.png` | 实现缺陷：抽屉一直显示「相似内容」，没有相似卡时写「没有找到相似的已发布经验卡。」；时间线标记补结论；RUN-067 复测通过 |

RUN-001 备注：`TC-CONV-002`、`TC-CONV-003`、`TC-CONV-032` 在 convai 组因前置 `TC-SHOP-001` 未满足登「阻塞」，同轮由 shopset 组接入 Wizard 应用后补跑通过；`TC-AI-002`（真实 DeepSeek，`AI_MODE=deepseek`）与 `TC-MOCK-002`（`MOCK_PLATFORM=0`）要改 `.env` 并重启 dev server，由主会话在各组结束后单独执行，均通过（`run-001-TC-AI-002-2.json`）。证据文件都在 `docs/test-runs/`。

RUN-002 备注：`TC-AI-002`（`AI_MODE=deepseek`，模型 `deepseek-flash`）与 `TC-MOCK-002`（`MOCK_PLATFORM=0`）由主会话在四组结束后执行，均通过（`run-002-TC-AI-002-2.json`），`.env` 已改回 `AI_MODE=stub`、`MOCK_PLATFORM=1`。各组判通过但记了观察的条目（后续修复或用例措辞，不改本轮结果）：`TC-AUTH-005` 首跑时并行登录占满同 IP 限频，429 的尝试被记成「密码错误」并计入锁定（换账号与来源 IP 重跑通过）；`TC-PERM-001` lead、agent 的 `nav-summary` 带 `usage: null` 键；`TC-SHOP-021`、`TC-SHOP-020` 已断开的店不在 `/wb`、`/orders` 的店铺筛选里，保留的历史按店铺筛不到；§3「Shopee 签名调用」配方的变量名 `path` 在 zsh 里覆盖 `PATH`；场景 `plan-over-shop-limit` 店铺编号偶发撞号、失败时留下半截数据。convai 组另记：auto 模式低置信转人工后，AI 发的安抚句把等待计时清零，待认领超时提醒与「已等」都不出现。

RUN-003 备注：上轮 4 个失败项（`TC-TEAM-002`、`TC-TEAM-012` 第 5 步、`TC-TKT-007`、`TC-CONV-012`）都已通过。冒烟里的 `TC-AI-002`（真实 DeepSeek）留到 RUN-004 由主会话执行。执行者另记：工单时间线里成员处理后回读到的平台事件来源标「页面」（已改为「平台」，RUN-004 随 `TC-TKT-001` 复测）；用例里「认领并回复」「接受」与界面按钮名不一致（已统一用例措辞）；`/orders` 右侧「售后待处理」不随店铺筛选变化；店铺重新连接后未点「完成接入」时接待模式为 off / off。

RUN-004 备注：`TC-AI-002` 由主会话执行（`AI_MODE=deepseek`，草稿提到订单号与运单号，置信度 0.90，认领并发送后买家视图收到同文；`run-004-TC-AI-002-2.json`），之后 `.env` 改回 `AI_MODE=stub` 并重建基线。执行者记的措辞差异（判通过）：平台筛选项叫「TikTok」；接入后店铺「连接」列显示「正常」或「需处理 · …」；发票号只在提示里出现。前两条已在本次修正用例措辞。

RUN-005 备注：convai 组中途因用量额度中断约 30 分钟，恢复后先核对全局设置均为基线值再续跑。`TC-AI-002`（`AI_MODE=deepseek`）与 `TC-MOCK-002`（`MOCK_PLATFORM=0`）由主会话在四组结束后执行，`.env` 已改回 `AI_MODE=stub`、`MOCK_PLATFORM=1` 并重建基线。判通过但记了观察的条目：工单时间线的拒绝、争议原因显示为原因代码；`TC-ORD-013` 前置让 Nur 读组长名下的工单会 404（改由 owner 取售后单 ID）；工作台多处按钮名与用例写法不同（「转交给同事」「改派给其他同事」「发送订单卡」等，阶段来源「手动」）；删除买家数据后用量页「已用」比按模式、按店的合计多出被删的那次；`TC-SHOP-015` 把 2001001 的回调改到别处后没有改回，会让下一个接入该应用的商户先遇到回调占用。

RUN-006 备注：`TC-AI-002` 由主会话以 `AI_MODE=deepseek` 执行并通过（草稿写明订单号、商品、物流与运单号；`run-006-TC-AI-002-2.json`），之后改回 `AI_MODE=stub`。执行者记：`TC-BILL-001` 在基线上为 0 = 0；删除买家数据后「出稿来源」已注明被删的次数，「按店铺用量」卡片的合计仍比已用少、没有说明。

RUN-007 备注：`TC-SET-013` 已通过（下拉列表显示在选择框下方）。`TC-AI-002` 由主会话以 `AI_MODE=deepseek` 执行并通过（`run-007-TC-AI-002-2.json`），之后改回 `AI_MODE=stub`。执行者记：`TC-AI-001` 列表与分组标签在 9.1 秒出现新会话，侧栏「AI 草稿」计数按 30 秒轮询在 27.8 秒才变；`TC-SET-008` 之后 `/billing` 已用 3、按模式与按店铺合计 2，两张卡片都注明「另有 1 次出稿的草稿已随买家数据删除」（`run-007-TC-SET-008-billing.png`）。

RUN-008 备注：`TC-AUTH-014` 第 1 步在 Demo Store 与新注册商户上各做一次，跳到账号安全页后提示都显示约 4 秒（`run-008-TC-AUTH-014-1.png`、`run-008-TC-AUTH-014-1b.png`）。`TC-AI-002` 由主会话以 `AI_MODE=deepseek` 执行并通过（`run-008-TC-AI-002-2.json`），之后改回 `AI_MODE=stub` 并重建基线。`TC-AI-001` 第 2 步按列表的「AI 草稿」分组判定（8.5 秒出现）；侧栏计数按 `API-NAV-001` 30 秒轮询，28.4 秒才变，用例已写明以列表为准。

RUN-009 备注：`TC-PERM-001` 展开态导航下方没有用量卡、收起后底部只有「展开侧栏」按钮，三个角色的 `nav-summary` 都没有 `usage` 键（`run-009-TC-PERM-001-1.png`、`run-009-TC-PERM-001-1b.png`）。`TC-TKT-016` 按第二次执行登记：第一次在前置与第 1 步之间隔了约 1 分钟，Worker 按计划先跑了 `ticket.scan`，改用新场景 T-1007 后立即执行通过；`TC-TKT-016`、`TC-TKT-017` 的场景与第 1 步之间不能隔近 1 分钟。`TC-CONV-005` 第 2 步 9.1 秒，接近 10 秒上限。`TC-BILL-001` 排在出稿用例之后执行，已用 5 次，各口径合计一致。中途脚本触发登录限频（每分钟 30 次，429），等 60 秒后复用已登录会话继续，没有步骤因此改判。`TC-AI-002` 由主会话以 `AI_MODE=deepseek` 执行并通过：草稿写明订单号、商品、承运商与运单号，置信度 0.90，买家收到同样正文（`run-009-TC-AI-002-2.json`）；切换时重启的开发服务出现热更新循环（登录页 5 秒内重载 53 次），删除 `.next/dev` 后重启恢复，之后改回 `AI_MODE=stub` 并重建基线。

RUN-010 证据：知识库一期的局部轮，范围是全部知识库用例、受影响的旧用例（`TC-AI-003`、`TC-AI-005`、`TC-PERM-003`、`TC-TEAM-013`、`TC-CONV-010`）与冒烟级 12 条。环境是 §3 本地行的独立副本：同一 PostgreSQL 实例里另建库 `shopilot_kbrun` 并按 §3 重建基线，Web 跑在 3362、Worker 单独起，`KNOWLEDGE_MODE=stub`、`AI_MODE=stub`；`TC-AI-002` 前重建基线并以 `AI_MODE=deepseek` 重启。逐条结果、执行顺序与手段见 `docs/test-runs/run-010-local.md`。没有跑走查用例，未刷新截图。

RUN-011 证据：复测轮，承接 RUN-010 失败的 `TC-KB-035`（按修正后的用例：前置不再改资料）加冒烟级 12 条。环境与手段同 RUN-010（独立库 `shopilot_kbrun` 起跑重建基线、Web 3362、`KNOWLEDGE_MODE=stub`；`TC-AI-002` 前重建基线并以 `AI_MODE=deepseek` 重启），2026-10-16 00:11–00:14。应用代码与 RUN-010 相同，只改了设计文档与用例。`TC-KB-035`：补扫后 D1 30 秒内变为 `ready`、列表「可用」，D2 为 `failed`、原因「入库任务中断，请重新解析」。

RUN-012 证据：飞书群推送一期的局部轮，范围是新增的飞书用例（`TC-FEISHU-016` 待人工）、受影响的旧用例（认领与并发认领、两步验证回跳、商户切换、停用成员、通知规则、安全页、发件箱、`TC-SHOP-024`）与冒烟级 14 条。环境是 §3 本地行的独立副本：同一 PostgreSQL 实例里另建库 `shopilot_fsrun` 并按 §3 重建基线，Web 跑在 3363、Worker 单独起，`FEISHU_MODE=stub`；`TC-AUTH-014`、`TC-FEISHU-014` 之后各重建一次基线，`TC-MOCK-002` 用环境变量切换 `MOCK_PLATFORM`，`TC-AI-002` 以 `AI_MODE=deepseek` 重启后改回。17 条用例第一次执行时脚本的选择器或等待写错，中断后修正脚本、从前置起用新数据重跑，登记的是重跑结果；`TC-AUTH-001` 第 6 步与 `TC-SHOP-001` 第 8 步在同一状态上重看。逐条结果、执行顺序与手段见 `docs/test-runs/run-012-local.md`。没有跑走查用例，未刷新截图。

RUN-013 证据：复测轮，承接 RUN-012 的三条失败加冒烟级 13 条，另加修复波及的 `TC-FEISHU-010`。被测版本 `c248a6e` 修了 `TC-FEISHU-002`（替身上传的图片字节在开发发件箱可预览）与 `TC-FEISHU-007`（中文消息不放平台机翻的译文），两条都通过；`TC-SHOP-001` 第 9 步没有改代码也没有改用例，照原用例执行仍失败，等口径裁定。环境与手段同 RUN-012，2026-10-16 01:54–02:07；脚本拼接错误与登录限频导致的中断不计结果，修正后重跑，逐条结果见 `docs/test-runs/run-013-retest.md`。

RUN-015 证据：修复前那一轮，只跑源自缺陷的 `TC-DASH-005`。环境是 §3 本地行的独立副本：`c6fc3a3` 的独立工作区，同一 PostgreSQL 实例里另建库 `shopilot_dashrun` 并按 §3 重建基线，Web 与 Worker 跑在 3364；工作区里只加了场景 `first-reply-off-hours`。第 1 步通过（看板林晓 `segments = 1`、首响为 null），第 2 步失败。

RUN-016 证据：复测轮，承接 RUN-015，环境同 RUN-015，起跑前重建基线再执行场景。被测版本只比 RUN-015 多改团队页首响中位的取数（`API-TEAM-001` 改用看板的首响样本），第 1、2 步林晓的首响都是 null（`docs/test-runs/run-016-TC-DASH-005-2.json`）。冒烟级未跑：按 10-14 起的快速开发约定小改动不跑整轮，同 RUN-014。服务端用例 `src/server/dashboard/first-reply.test.ts` 修复前失败（团队页 80 秒、看板 60 秒），修复后通过；全部 vitest 29 个文件 197 条通过。

RUN-017 证据：源自缺陷用例在未修复版本上的一轮。环境是 §3 本地行的独立副本：被测版本 `c6fc3a3` 检出到单独的 git 工作区，同一 PostgreSQL 实例里另建库 `shopilot_pollrun` 并按 §3 重建基线，Web 跑在 3363、Worker 单独起，`AI_MODE=stub`、`FEISHU_MODE=stub`；Playwright 1.64 + 本机 Edge（headless），等对应请求返回后立即调 `POST /api/mock/sim/buyer_message` 发消息，从发出时刻计时，2026-10-16 13:39–13:41（UTC+8）。实测：列表 10.1 秒、时间线 4.4 秒、侧栏计数 30.1 秒，三处都超时限，首个失败在第 3 步。

RUN-018 证据：复测轮，承接 RUN-017。被测版本为 `c6fc3a3` 加本次两处前端改动（`src/app/(app)/wb/wb-shared.tsx` 列表 3 秒、详情 2 秒；`src/components/shell/app-shell.tsx` 导航摘要 10 秒），环境与手段同 RUN-017，2026-10-16 13:41–13:42。实测：列表 3.4 秒、时间线 2.3 秒、侧栏计数 10.1 秒。按 2026-10-14 起的快速开发约定（小修不跑整轮）本轮未跑冒烟级；冒烟级里涉及列表刷新的 `TC-AI-001`（20 秒内）与 `TC-SHOP-001` 第 9 步（15 秒内）时限都宽于新的 3 秒间隔。

RUN-019 证据：取消认领与影子回复译文（DESIGN v1.15）的局部轮：4 条新用例，加受影响的飞书待认领卡（`TC-FEISHU-005`、`TC-FEISHU-006`、`TC-FEISHU-011`，投递去重与卡尾文字改了）与影子回复显示（`TC-AI-005`）。环境是 §3 本地行的独立副本：同一 PostgreSQL 实例里另建库 `shopilot_ucrun` 并按 §3 重建基线，Web 跑在 3360、Worker 用 `pnpm worker` 单独起，`AI_MODE=stub`、`FEISHU_MODE=stub`、`KNOWLEDGE_MODE=stub`，2026-10-16 13:47–13:55。8 条按 `TC-CONV-042`、`TC-CONV-043`、`TC-AI-024`、`TC-FEISHU-005`、`TC-FEISHU-006`、`TC-FEISHU-011`、`TC-FEISHU-017`、`TC-AI-005` 的顺序跑，中间不重建基线：每条都新建买家，只有 `TC-AI-005` 改店铺配置，放在最后。`TC-AI-005` 前置的改接待模式与记影子次数用接口（`API-RCP-002`、`API-BILL-001`）代替页面操作，第 6 步查模拟平台该会话的卖家消息条数（0）。脚本出错不计结果：`TC-CONV-042` 第 4 步在确认框淡出时就查头部按钮，`TC-FEISHU-005` 第 3 步拿转义过方括号的卡片 JSON 比对译文，`TC-AI-005` 第 1 步的选择器命中了侧栏「AI 草稿」，三条都修正脚本后从前置起用新买家重跑，登记的是重跑结果。截图：确认框 `docs/test-runs/run-019-TC-CONV-042-2.png`、取消后的会话页 `docs/test-runs/run-019-TC-CONV-042-4.png`、组长看别人的会话没有取消认领 `docs/test-runs/run-019-TC-CONV-043-1.png`、影子回复的译文 `docs/test-runs/run-019-TC-AI-024-2.png`、复制原文 `docs/test-runs/run-019-TC-AI-024-3.png`、中文影子回复不带译文 `docs/test-runs/run-019-TC-AI-024-6.png`、飞书发件箱 `docs/test-runs/run-019-TC-FEISHU-005-2.png`。冒烟级未跑：按 2026-10-14 起的快速开发约定，冒烟里与本次改动相交的只有 `TC-FEISHU-005`、`TC-FEISHU-011`，已在本轮范围内；代码仓 vitest 另覆盖取消认领的状态、权限、重推与停用不重推（`src/server/feishu/feishu.test.ts`），影子回复译文入库与翻译失败（`src/server/ai/translate.test.ts`）。

RUN-020 证据：复测轮，承接 RUN-019 的 `TC-FEISHU-017`，按修正后的用例执行。被测版本与 RUN-019 相同，只改了用例；起跑前停 Worker、重建基线再起 Worker，前置 K 为 2，停用返回 `releasedConversations` 3，C 只有两张待认领卡（序号 0、1）。取消认领后那张卡：`docs/test-runs/run-020-TC-FEISHU-017-3.png`。

RUN-025 证据：修复前那一轮，只跑源自缺陷的 `TC-CONV-048`。环境是 §3 本地行的独立副本：分支 `fix/shopee-refetch` 的独立 git 工作区，同一 PostgreSQL 实例里另建库 `shopilot_ingest` 并按 §3 重建基线，Web 跑在 3365、Worker 单独起，`AI_MODE=stub`、`KNOWLEDGE_MODE=stub`、`FEISHU_MODE=stub`；被测版本 `1eaa7ec` 只加了模拟器动作 `seller_backend_reply`（测试手段，不改入站处理），2026-10-16 14:12–14:14（UTC+8）。第 1–3 步通过，第 4 步失败，现象与线上一致：卖家后台回复只来一条通知，Shopilot 不处理。

RUN-026 证据：复测轮，承接 RUN-025，环境同 RUN-025，起跑前重建基线，2026-10-16 14:21–14:27。第一次起跑时发现之前起的两个未修复版本 Worker 仍连着本库、抢走了通知事件（RUN-025 时它们同为未修复版本，不影响该轮结果），停掉全部旧进程、重建基线后整轮重跑，下列结果都来自重跑。`TC-CONV-048` 第 4 步会话 `human`、`platform_human`，回复由「平台后台」发出，草稿为 null（`docs/test-runs/run-026-TC-CONV-048-4.json`），第 5 步再推通知后回复仍 1 条（`run-026-TC-CONV-048-5.json`）；`TC-CONV-049` 本方回复 1 条、仍由 Nur 处理（`run-026-TC-CONV-049-5.json`）；`TC-CONV-050` 自动回复记「平台自动回复」，会话仍为 `bot`、草稿保留（`run-026-TC-CONV-050-4.json`）；冒烟 `TC-AI-001` 用 Playwright 1.64 + 本机 Edge（headless）跑完 7 步，已用 3 → 4、assist 3 → 4，截图 `docs/test-runs/run-026-TC-AI-001-{1..5}.png`。其余 13 条冒烟级未跑：本次只改 Shopee 聊天通知的处理与入库时间，按 2026-10-14 起的快速开发约定小修不跑整轮，同 RUN-014；冒烟级里经过入站与回声判定的 `TC-AI-001` 已跑。服务端用例 `src/server/inbound/refetch.test.ts` 8 条、`process.test.ts` 3 条通过；其中「最近消息时间不往回退」在去掉 `ingest.ts` 的改动后失败。

RUN-030 证据：修复前那一轮，只跑四条源自缺陷的用例。环境是 §3 本地行的独立副本：分支 `fix/smoke-batch` 的独立 git 工作区（被测版本 `1eaa7ec`），同一 PostgreSQL 实例里另建库 `shopilot_smokefix` 并按 §3 重建基线，Web 跑在 3371、Worker 单独起，`AI_MODE=stub`、`KNOWLEDGE_MODE=stub`；工作区目录名不是项目名，`q` 与前置里的改库命令改用 `docker exec shopilot-postgres-1 psql -U shopilot -d shopilot_smokefix`；模拟器动作用 `POST /api/mock/sim/*`；Playwright 1.64 + 本机 Edge（headless），2026-10-16 14:12–14:17（UTC+8），每条用例前重建基线。四条都在描述现象的那一步失败。`TC-ORD-027` 的实际与线上不同：线上返回 502，本机返回 200，因为模拟平台对已结束的售后单仍给原因列表；两者都源于接口去问了平台，本轮按第 2 步没有返回 409 判失败。`TC-SHOP-032` 的重叠由 Chart.js 横轴标签位置加 canvas 实测文字宽度算出。

RUN-031 证据：复测轮，承接 RUN-030，环境与手段同 RUN-030，2026-10-16 14:19–14:28，每条用例前重建基线。被测版本为 `1eaa7ec` 加本次改动：空查询不检索（`src/server/knowledge/retrieve.ts`）；店铺页「推送未订阅」判定与「重新校验」入口（`src/server/shops/service.ts`、`src/app/(app)/shops/`、`src/app/(app)/orders/orders-client.tsx`）；窄屏横轴逐级收短（`shops-client.tsx`）；已结束的售后单不取原因（`src/server/orders/after-sales.ts`）。实测：`TC-KB-042` 检索快照 `routes` 为 `[]`、`lastQuery` 为空；`TC-SHOP-031` 九步都通过，重新校验后应用回调状态为 `already_ours`，模拟平台订阅 9 类推送；`TC-SHOP-032` 390 宽只写站点，相邻最小间距 16.3 像素，另在 360、768、1024、1280 宽各量一次都没有重叠；`TC-ORD-027` 返回 409 `aftersale_state`，没有平台调用，日志 `level` 为 `info`。冒烟级只跑了与检索主链路相关的 `TC-KB-024`，其余冒烟按 2026-10-14 起的快速开发约定（小修不跑整轮）未跑。vitest 全部 29 个文件 198 条通过，其中新增的 `knowledge.test.ts`「买家原话没有文字、改写也为空时不调检索」在修复前失败。

RUN-040 证据：修复前那一轮，只跑两条源自缺陷的用例。环境是 §3 本地行的独立副本：同一 PostgreSQL 实例里另建库 `shopilot_wbfix` 并按 §3 重建基线，`pnpm dev` 起 Web 与 Worker（3360，`DATABASE_URL` 指向该库），`AI_MODE=stub`、`FEISHU_MODE=stub`。被测版本 `aa34591`，工作区只多了文档与场景 `tiktok-system-notices`，实现代码未改。前置 Q0 = 1、T0 = 0。`TC-CONV-054` 在第 1 步失败，与线上现象一致：会话不在员工的任何分组里，owner 的「同事处理中」也没有它，该分组只取 `claimed_by` 不等于本人的行，`claimed_by` 为空的比不出来。`TC-CONV-055` 在第 1 步失败，时间线显示英文原文。

RUN-041 证据：复测轮，承接 RUN-040，另加分组改名与员工可见「他人处理中」波及的 `TC-PERM-001`（冒烟）与 `TC-CONV-004`。环境同 RUN-040，起跑前停服务、重建基线再起。`TC-CONV-054`：前置 Q0 = 1、T0 = 0；Nur 的侧栏子项为待认领 1、AI 草稿 1、我处理中 1、他人处理中 1、已结束，列表行显示「平台后台」与「买家再回复 · 等 6 分钟」（场景只有一条买家消息，按置顶显示等待）；之后 `counts` 为 queue 1、team 1，徽标「工作台 2」= 1 + 1；owner 的 `view=team` 有 C、`claimedBy` 为 null，`view=queue` 没有 C；点开后顶部有「认领」（`docs/test-runs/run-041-TC-CONV-054-1.png`、`docs/test-runs/run-041-TC-CONV-054-4.png`）。`TC-CONV-055`：7 条依次符合，点开「客服已结束对话」显示「原文 Chat ended by customer service agent.」，表外那一行不能展开，库里 7 行仍是英文（`docs/test-runs/run-041-TC-CONV-055-1.png`、`docs/test-runs/run-041-TC-CONV-055-2.png`）。`TC-PERM-001`：三个角色的工作台子项都有「他人处理中」，员工侧栏见 `docs/test-runs/run-041-TC-PERM-001-3.png`。另在 390 px 宽度看了时间线与列表，没有横向溢出。本轮之后把「要求转人工」一条改为按开头匹配（DESIGN 对照表同步），重新打开本轮的会话 C 确认仍显示中文。冒烟级其余 13 条未跑：按 10-14 起的快速开发约定，小改动只跑源自缺陷与受影响的用例。

RUN-042 证据：看板口径改动（DESIGN v1.21）的局部轮。环境是 §3 本地行的独立副本：同一 PostgreSQL 实例里另建库 `shopilot_dashv` 并按 §3 重建基线，Web 与 Worker 跑在 3365，`AI_MODE=stub`。执行顺序：基线上跑 `TC-DASH-001`、`TC-DASH-002`、`TC-DASH-009`、`TC-DASH-003`；重建基线后跑 `TC-DASH-006`（其中执行场景 `dashboard-metrics`），同一状态接着跑 `TC-DASH-007`、`TC-DASH-008`、`TC-BILL-001`。`TC-DASH-006` 场景前后：AI 独立解决 0 / 1 → 1 / 4，转人工 2 / 8 → 4 / 11，影子回复 2 → 4，无时限 0 → 1，导出里 D 那一行为「2026-10-12,7,1,2,3,1,0,450,0,0,0,0,0,2,2,1,1」；`TC-DASH-007` 林晓在看板与团队页都是 5 段、1200 秒；接口响应摘录见 `docs/test-runs/run-042-dashboard-api.json`。`TC-DASH-008` 截图 `docs/test-runs/run-042-TC-DASH-008-desktop.png`、`docs/test-runs/run-042-TC-DASH-008-390.png`，两种宽度都没有横向滚动、没有控制台报错。基线种子的回复时刻按执行时间倒推，本轮在当地 03:50 执行、场景把排班改为每天 09:00–18:00，种子里的回复都落在工作时段外，总体首响显示 0 秒，符合「只累计工作时段」。冒烟级未跑：按 10-14 起的快速开发约定，同 RUN-014。

RUN-050 证据：修复前那一轮，只跑源自缺陷的 `TC-AI-030`。环境是 §3 本地行的独立副本：同一 PostgreSQL 实例里另建库 `shopilot_aiq` 并按 §3 重建基线，Web 起在 3381（`APP_BASE_URL`、模拟平台地址同步改端口），Worker 单独起，`AI_MODE=stub`、`KNOWLEDGE_MODE=stub`、`FEISHU_MODE=stub`；`q` 改用 `docker exec shopilot-postgres-1 psql -d shopilot_aiq`。被测版本 `ba4b462`，工作区只多了文档与未接入的 `language.ts`，出稿代码未改。第 1 步推送成功，第 2 步最近一次出稿请求里 `reply_language` 为 `null`、品牌语气是中文，与线上现象（中文品牌语气下 31 条影子回复 11 条中文）的成因一致，第 3 步护栏没有回复语言的规定。本轮之后把第 3 步加了一项：提示词最后一行写出这次的语言名（失败步骤不变）。

RUN-051 证据：复测轮，承接 RUN-050，环境同 RUN-050，起跑前重建基线、重启 Web 与 Worker。`TC-AI-030` 六步依次为 `Thai`（品牌语气仍是那段中文）、护栏含「回复语言只由 reply_language 决定」且最后一行「本次回复语言：Thai。reply 只用 Thai 写，不夹用别的语言。」、`Vietnamese`、`Vietnamese`（👍 判不出，沿用前一条）、`Malay`（只有数字，用 MY 默认），每次出稿在买家消息后 8–10 秒出现（`docs/test-runs/run-051-TC-AI-030-2.json`）。`TC-AI-031` 只有一份影子回复，触发消息是那句文字，生成时间在文字到达后 7.4 秒（`docs/test-runs/run-051-TC-AI-031-2.txt`）。`TC-AI-032` 会话 `awaiting_human|shadow|0`，`lastQuery` 为 `[]`，用量 5 → 5。`TC-AI-033` 在 `AI_MODE=deepseek` 下跑，Worker 输出两行：`rewrite` 1,101 ms、195/15 token，`draft` 1,611 ms、649/141 token，都 `"ok":true`，两行都找不到 towel 与 colour（`docs/test-runs/run-051-TC-AI-033-2.log`），之后改回 `AI_MODE=stub`。`TC-AI-001`：草稿置信度 0.85，认领并发送后本方消息 1 条、10 秒后仍 1 条，模拟器收到同文，用量 0 → 1、assist 0 → 1（`docs/test-runs/run-051-TC-AI-001-3.png`）。`TC-KB-024`：员工看到「依据：《保修政策.md》」且不是链接，两路检索都是 `hybrid`，管理员点依据打开 `/reception/knowledge?doc=<ID>`，买家只收到正文（`docs/test-runs/run-051-TC-KB-024-2.png`）。`TC-AI-005` 第一次执行时脚本在管理员页面没加载完就计数，判成失败；改为等页面出现影子回复后重跑，员工看不到、接口 `shadowDrafts` 为 null，组长展开有正文与 0.85、没有发送按钮，管理员可见，shadow 用量 +1，模拟器没有卖家消息（`docs/test-runs/run-051-TC-AI-005-3.png`）。`TC-AI-012` 旧草稿 `superseded`，只剩 1 份待审草稿，最近一次请求的最后一条买家消息是第二问。`TC-AI-018` 会话 `awaiting_human|non_text`、没有草稿。`TC-KB-028` 新检索 2 条 `hybrid`、1 条 `vector`，改写路 `no_vector` 后紧接纯向量重试，`degraded` 为 false。`TC-KB-030` 会话仍在 AI 接待，没有依据，载荷没有 `knowledge`，`degradedReason` 为「检索失败（改写路：timeout；原话路：timeout）」（`docs/test-runs/run-051-TC-KB-030-2.png`）。冒烟级其余 12 条未跑：按 10-14 起的快速开发约定，只跑源自缺陷、新增与受影响的用例。vitest 全部 35 个文件 231 条通过，其中新增 `src/server/ai/draft.test.ts`（防抖重排、影子模式非文字不出稿、`reply_language`）、`language.test.ts`、`client.test.ts` 的日志用例与 `knowledge.test.ts`「混合检索每路 5 秒」。

RUN-052 证据：局部轮，环境同 RUN-050（独立库 `shopilot_aiq`、端口 3381、`AI_MODE=stub`），起跑前重建基线。`TC-AI-034`：商品卡 20 秒后会话 `awaiting_human|shadow|0`；补文字后只有一份影子回复，触发消息是那句文字；再发「Thanks!」20 秒后仍 1 份（`docs/test-runs/run-052-TC-AI-034-4.txt`）。`TC-AI-031` 仍只有一份、按文字出，生成在文字到达后 7.9 秒。`TC-AI-032` 只发图片 20 秒后 `awaiting_human|shadow|0`，`lastQuery` 为 `[]`，用量 2 → 2。vitest 全部 35 个文件 233 条通过，新增 `draft.test.ts`「影子模式开段是图片、7 / 35 秒后补文字」两条，在去掉入站触发的版本上失败。

RUN-053 证据：修复前那一轮，只跑两条源自缺陷的用例。被测版本 `67dd209` 用 `git worktree` 检出到独立目录，独立库 `shopilot_old`（同一 PostgreSQL 实例），Web 起在 3367，`APP_BASE_URL`、`SHOPEE_HOSTS`、`TIKTOK_*` 都改成 3367，`AI_MODE`、`KNOWLEDGE_MODE`、`FEISHU_MODE` 为 `stub`，按 §3 重建基线。`TC-CONV-057`：这个版本的模拟器还没有「问过 AI 助手后转人工」，第 2–6 步改为按线上 2026-10-20 实拉的字段手工拼一条 `bundle_message` 推送（载荷见 `run-053-TC-CONV-057-5.json`），签名后先推到 Shopilot，再用模拟器发买家第一条消息开会话；30 秒后库里没有这条记录，入站事件 `ignored`。`TC-DASH-011`：今天设为不工作后，新买家发消息、Nur 认领并回复（已发送），`firstReplySamples` 7 → 8，Nur 的首响中位为 0 秒，与 10-19 会议截图「多个客服首响 0 秒」一致。轮次结束删除了该目录与库。

RUN-054 证据：局部轮，其中 `TC-CONV-057`、`TC-DASH-011` 是 RUN-053 两条失败的复测。被测版本是本地 main `c7deb15`（已合并 wt/faq、wt/product、wt/forward、wt/composer、wt/dash），工作区只改了 `docs/`。独立库 `shopilot_run`，Web 起在 3366，环境变量同 RUN-053 换成 3366，起跑前重建基线；看板三条（`TC-DASH-006`、`TC-DASH-008`、`TC-DASH-010`）前再重建一次基线并执行一次 `dashboard-metrics`，三条只读，共用这份数据。两条复测都通过：`TC-CONV-057` 第 3 步 Shopilot 里没有该会话，第 5–6 步各 200，30 秒后 `ok|4`、入站事件 `done`，回调已改回原地址；`TC-DASH-011` 前后 `firstReplySamples` 都是 0（新版本下种子里的段同样按新口径排除），Nur 的首响平均为 null（`run-054-TC-DASH-011-2.json`）。常见问题记录：卡片收起 2 条、展开 4 条，顺序与译文同预期，390 宽无横向滚动（`run-054-TC-CONV-056-3.png`）；`TC-AI-035` 用 `TC-CONV-056` 那个新买家，最近一次出稿请求的对话依次是助手欢迎语、推荐商品、买家提问、助手回答、买家「Chat with shop staff」（`run-054-TC-AI-035-2.json`）；伪造成员 ID 的记录 `failed`「平台没有返回记录里的消息」，卡片提示到卖家中心查看；补拉脚本拉到 1、取不到 1（`run-054-TC-CONV-059-1.txt`）。发商品：4 件商品与库存 87、67、47、27，三种搜索结果同预期；商品卡发出后处理人变为 Nur，模拟平台收到 `item {item_id: 24580011003}`（`run-054-TC-CONV-061-1.png`）；Shopee 链接 `https://shopee.com.my/product/220001/24580011004`；TikTok TH 没有「发链接」、`PRODUCT_CARD` 发出；TikTok MY 页签显示没有商品权限，接口 409 `product_scope_missing`；组长看 Nur 的会话时按钮不可用，强点也没有发出。粘贴：两张 PNG 弹确认框「发送 2 个」并发出；带文字的剪贴板用真实剪贴板加 ⌘V 验证，输入框得到「你好」、不弹框；PDF 提示原文与用例一致。视频：附件按钮 accept 含 `video/mp4`，发出前「发送中」，约 15 秒内已发送、可播放（`currentTime` 1.5 秒）；MOV 与 TikTok 视频提示原文一致，接口 409。快捷回复：菜单「通用 · 3 个版本 · 马来语版」，插入后「不翻译 · 已插入马来语版」，有文字时插默认版，发出的是马来语原文、`original_text` 为空。工单：未连飞书时按钮不可用、两个接口 409 `feishu_unavailable`；连上替身后转发 T-1007，卡片标题「工单 T-1007 · 物流异常 - 订单需要重新发货」，含订单号、店铺、商品与规格 Matte Black、数量、备注与带 `?m=` 的链接，投递 `sent`（`run-054-TC-TKT-021-3.json`）；`?m=` 落地先提示「已切换到「Other Store」」，组长看到「看不到这张工单」；工单页显示「需重新发货」「订单需要重新发货」、整页没有 `RETRY_SHIP`。飞书待认领卡里助手发言标「Shopee AI」、买家提问排在「Chat with shop staff」之前（`run-054-TC-FEISHU-018-2.json`）。看板：`TC-DASH-006` 四步都对，CSV 首行与 D 行为「…,780,4,7,…」；`TC-DASH-010` 林晓 `segments` 5、`firstReplyAvgSec` 1260、`replied12h` 3/5，团队页中位 1200；`TC-DASH-008` 桌面与 390 宽各项都在、无横向滚动；问题提取替身把新买家归到「物流查询」，`issue.extract` 在买家刚发言时不提取，补算脚本「共 15 段，成功 15」；类别管理各步同预期，组长没有「管理类别」、接口 403。

RUN-056 证据：局部轮，被测版本本地 main `e4ac880`（已合并预翻译 586c478、24e839d），工作区只改了 `docs/`。独立库 `shopilot_run_pt`（同一 PostgreSQL 实例），Web 起在 3373、Worker 同库，`APP_BASE_URL`、`SHOPEE_HOSTS`、`TIKTOK_*` 改成 3373，`AI_MODE`、`KNOWLEDGE_MODE`、`FEISHU_MODE` 为 `stub`，起跑前迁移加种子。三个新买家都按 §3「模拟器发消息」在 Demo Shopee MY 建，会话落在「AI 接待中」，Nur 在该视图打开后认领；目标语言 L 为马来语。`TC-CONV-069`：输入后工具栏为「将发送 翻译中…」，输入框外框高度在输入后、译文出现后、打开浮层时、切到「不翻译」后都是 106 px；两次浮层译文分别为「[译文] 您好，今天会发货」「[译文] 您好，明天会发货」（AI 替身译文）；切「不翻译」后没有「将发送」。`TC-CONV-070`：带预译文那次请求体含 `"translateTo":"ms"` 与 `"translatedText":"[译文] 好的，马上为您处理"`，返回 201，时间线有译文与原文；不停顿那次请求体只有 `translateTo`，返回 201（`run-056-TC-CONV-069-070.json`，截图 `run-056-TC-CONV-069-1.png`、`-3.png`、`-5.png`、`run-056-TC-CONV-070-3.png`、`-4.png`）。`TC-CONV-071` 六步同预期：前四步 422，`fields.translatedText` 依次为「译文只能随文字消息和翻译目标语言一起提交」×2、「译文不能为空」「译文最多 2,000 字」；第 5 步 201；最后一条本方消息 `text` 为「Hello there」、`originalText` 为「你好」（`run-056-TC-CONV-071.txt`）。控制台无报错。轮次结束停掉 3373 的 Web 与 Worker，删除库与临时文件。

本轮执行中发现用例本身写错、当轮原位修正的地方（都是这一轮新写的用例，修正前没有登记过结果）：`TC-CONV-059` 前置改按状态取拉到的那条（同一会话里还有 `TC-CONV-058` 造的取不到的记录）；`TC-TKT-021`、`TC-TKT-024` 前置改为先推进到 PROCESSED 再到 RETRY_SHIP（模拟平台不允许从 READY_TO_SHIP 直接到 RETRY_SHIP，`TC-TKT-004` 第 1 步同样受影响，本轮没跑）；`TC-DASH-012` 第 4 步按钮名为「应用」；`TC-DASH-013` 总结改为「以……开头」（AI 替身取买家第一句时带着平台译文）；`TC-FEISHU-018` 卡片里说话人是加粗的「Shopee AI」「买家」，不是「Shopee AI：」；`TC-DASH-006`、`TC-DASH-010` 的 12 小时内回复是 4 段不是 5 段，`dashboard-metrics` 场景里 AI 独立解决的段只打了标记、没有 AI 发出的消息。`TC-CONV-068` 要在真实平台执行，登记待人工。截图与数据放 `docs/test-runs/run-054-*`；本机库与进程在轮次结束后回收。

RUN-057 证据：局部轮，被测版本本地 main `e6994cc`（含 c2d0919 合并的知识库第一批、0ad1ab6 的草稿对比；e6994cc 只把测试文件改成串行，不影响行为），工作区另有 `docs/` 与 `AGENTS.md` 的未提交改动，与被测代码无关。独立库 `shopilot_run057`（同一 PostgreSQL 实例），Web 起在 3377、Worker 同库，`APP_BASE_URL`、`SHOPEE_HOSTS`、`TIKTOK_*` 改成 3377，`DATA_DIR` 用临时目录，`AI_MODE`、`KNOWLEDGE_MODE`、`FEISHU_MODE` 为 `stub`，起跑前 `pnpm db:reset && pnpm db:seed`；`TC-DASH-018` 之后按它的后置重置基线（先停 Worker，重置、写种子后再起），再跑 `TC-KB-001`、`TC-KB-024`、`TC-AI-001`、`TC-PERM-001`、`TC-FEISHU-005`。浏览器步骤用 Playwright + Edge 无头（1440×900）；买家发消息用 §3 登记的模拟器接口 `create_buyer`、`buyer_message`，没有操作模拟器页面，推送日志的 HTTP 状态从 `GET /api/mock/sim/state` 的 `pushLogs[].httpStatus` 读取。上一个执行会话中途卡死，它留下的 run-057 证据全部删除后重跑。执行中的两处说明：`TC-KB-050` 第 1 步第一次执行时替身入库在上传与发起整理之间就已完成，拿到 HTTP 202，打乱了后面步骤的状态；在发起前先读资料状态（`queued`）复现两次都是 409 `not_ready`，随后按顺序重跑第 1–5 步全部符合，记录见 `run-057-TC-KB-050.txt`、`run-057-TC-KB-050-1b.txt`。`TC-KB-047` 第 4 步的「已发布」由列表筛选「已发布 1」与卡片标题「已发布 1」表达，行里不单独标状态（`run-057-TC-KB-047-4.png`）。每个用例的接口返回与关键查询存为 `docs/test-runs/run-057-<TC ID>*.txt/json`，界面截图为同名 `.png`。

RUN-058 证据：复测轮，被测版本同 RUN-057（本地 main `e6994cc`），四条用例按 RUN-057 明细原位修正写法后重跑（§1 变更记录 2026-10-21 一行），实现与设计未改，设计文档只把 `API-KB-017` 的「幂等」格改为重复删除返回 404。独立库 `shopilot_run058`（同一 PostgreSQL 实例），Web 起在 3378、Worker 同库，`APP_BASE_URL`、`SHOPEE_HOSTS`、`TIKTOK_*` 改成 3378，`DATA_DIR` 用临时目录，`AI_MODE`、`KNOWLEDGE_MODE`、`FEISHU_MODE` 为 `stub`，起跑前 `pnpm db:reset && pnpm db:seed`；`pnpm job` 默认读 `.env` 会连到别的库，本轮改为导出本轮环境后执行 `pnpm exec tsx scripts/job.ts <任务名>`。`TC-KB-045`：同步后未对应列表三组（Demo Shopee MY 4 个、Demo Shopee SG 3 个、Demo TikTok TH 3 个卖家 SKU），导入 ` 1729582718312480201 ,竹纤维浴巾三件套` 得 `created 1`，20 秒后 `listingCount` 为 1，未对应列表里 Demo TikTok TH 只剩 `…202`、`…203`（`run-058-TC-KB-045-1.json` 至 `-4.json`）。`TC-KB-049`：第 1 步 Q 排第一、`distance` 0.1659；第 3 步下架后 `qa` 为 `null`；第 4 步 409 `invalid_state`；第 5 步恢复后再次命中；第 6 步第一次 204、第二次 404 `/errors/not-found`，再查 404（`run-058-TC-KB-049.txt`；脚本第一次记状态码时读错行，按原步骤重跑一遍，文件里是第二遍的输出）。`TC-DASH-015`：N0 为 0、S0 为 0；第 3、4 步 `draft_review` 都是 0 行；第 6 步 `shadow|shadow|same|same|stub|1|<T>`；第 7 步 `consistency` 为 `{"num":1,"den":1,"rate":null}`；第 8 步面板「影子回复」选中，一致率处显示「数据不足」与「一致 / 已对比 = 1 / 1，满 10 份才计算」，修改分类 6 行按语义一致、仅语言润色、补充信息、事实更正、流程改变、弃用重写自上而下排列（`run-058-TC-DASH-015.txt`、`run-058-TC-DASH-015-8.png`）。`TC-KB-001`：页签依次为问答、待审核、资料、产品、测试问答，打开时选中「问答」，点「资料」后地址为 `?tab=docs`、标题「资料 0 / 500」与空态文案符合；上传弹窗、进度、分类与状态变为可用、「2 / 500」、两个「AI 可用」开关为开均符合；第 5 步抽屉标题为文件名，`tab=docs` 与 `doc` 都在地址里，原文件标签在加载后有内嵌 iframe 预览（截图时 PDF 尚在加载，单独复查 6 秒后 iframe 在位）；第 6 步 `docTab=parsed`、刷新后仍停在「解析内容」并显示「替身解析：保修政策.pdf」；第 7 步 xlsx 显示「这种格式不能在页面里预览…」与「下载原文件」；第 8 步接口 2 条 `ready`、`partsCount`/`chunksCount` 为 1、`counts` 为 `{"total":2,"limit":500}`（`run-058-TC-KB-001-1.png` 至 `-7.png`、`-8.json`）。控制台没有报错。

RUN-059 证据：局部轮，DESIGN v1.26 输入框附件（粘贴、选择的图片视频先进附件条，和文字一起按顺序发）。被测版本是 `wt/attach` 分支 `053c092`，工作区只改了 `docs/`。受影响用例按 `REQ-CONV-015` 取，另加走输入框发送的 `TC-CONV-021`、`TC-CONV-022`、`TC-CONV-026`、`TC-CONV-070`、`TC-AI-010`（发送逻辑改写过，文字、译文、草稿、失败气泡的路径都要过一遍）；本轮没有跑其余冒烟用例。独立库 `shopilot_wt_attach`（同一 PostgreSQL 实例），Web 起在 3379、Worker 同库，`APP_BASE_URL`、`SHOPEE_HOSTS`、`TIKTOK_*` 改成 3379，`AI_MODE=stub`，起跑前 `pnpm db:reset && pnpm db:seed`；每条用例按 §3 用 `create_buyer` 加 `buyer_message` 新建买家，推送 HTTP 200。买家视图读模拟器接口 `GET /api/mock/sim/state`；`AI_MODE=stub` 下本方文字的译文是「[译文] 」加原文，买家视图收到的文字都带这个前缀，按前缀后的内容判定。`TC-CONV-072`：粘贴后没有弹框，附件条依次红、绿、蓝，读屏名「第 1 个附件：图片」至「第 3 个附件：图片」，刚粘贴时三个都带转圈，传完消失；输入框外框 106 → 170 px；移除第 2 个后剩红、蓝；点发送时按钮变「发送中」，完成后附件条消失、文字区清空、外框回到 106 px；时间线最后三条依次是这句话（原文对照）、红图、蓝图，都已发送，买家视图同序；第 7 步用真实剪贴板（无头 Edge 写入文字「你好」与一张 PNG 后按 ⌘V），输入框为「你好」、附件条不出现；第 8 步提示「平台聊天只能发图片和 MP4 视频，PDF 等文件发不出去。」；第 9 步两张进附件条，消息数 4 → 4，移除后附件条消失（`run-059-TC-CONV-072.json`、`-2.png`、`-5.png`、`-9.png`）。`TC-CONV-073`：故障注入 Demo Shopee SG 一次平台错误后发绿、红两张，提示「发送失败 Shopee 返回错误（error_server）…」，时间线最后一条是绿图、发送失败，附件条只剩红图；再点发送红图已发送、附件条消失；一次性故障用掉后列表为空（`run-059-TC-CONV-073.json`、`-3.png`）。`TC-CONV-074`：拦截第 3 个发送请求返回 409 后，提示「没有发出 模拟：平台拒绝这张图」，时间线新增这句话与红图，附件条剩绿（标「没发出」）、蓝，文字区清空；取消拦截再点发送，时间线最后四条依次是这句话、红、绿、蓝（`run-059-TC-CONV-074.json`、`-2.png`）。`TC-CONV-065`：选 clip.mp4 后附件条出现视频缩略图；点发送后时间线第一次出现视频时它已是「发送中」、附件条已空；15 秒后 `sent`，时间线视频可播放（`currentTime` 0.60）；库里 `video|sent`；买家视图有一条 `rawType` 为 `video` 的卖家消息；粘贴 clip.mov 提示「只支持 MP4 视频，MOV 等格式请先导出为 MP4。」；C2 粘贴 clip.mp4 提示「TikTok 接口暂不支持发视频。」、附件条不出现；接口发视频 409，detail「TikTok 接口暂不支持发视频。」（`run-059-TC-CONV-065.json`、`-1.png`、`-2.png`）。`TC-CONV-021`：选 2 MB PNG 后附件条出现这张图，点发送后附件条消失，时间线图片已发送，买家视图收到（`run-059-TC-CONV-021.json`、`-1.png`）。`TC-CONV-022`：11 MB JPG 提示「图片 11.0 MB，超过 10 MB 上限。」、附件条不出现，上传接口 413 `/errors/too-large`；GIF 提示「只支持 JPG、PNG、WebP，不超过 10 MB。」，上传接口 415 `/errors/unsupported-type`；10,485,760 字节 PNG 上传 201、进附件条，点发送后已发送（`run-059-TC-CONV-022.json`）。`TC-CONV-026`：502 `/errors/platform`、`platformCode` 为 `error_server`，提示平台错误的中文说明，气泡有「重试」、发送失败，买家视图没有这条；点「重试」后已发送，买家视图「失败重试测试」1 条；对它调 retry 返回 409 `/errors/conflict`（`run-059-TC-CONV-026.json`、`-2.png`、`-3.txt`）。`TC-CONV-070`：L 为马来语，预览译文 T「[译文] 好的，马上为您处理」，请求体 `translateTo` 为 `ms`、`translatedText` 为 T，201；时间线正文 T、原文对照符合；「请稍等」立刻发送的请求体没有 `translatedText`，201（`run-059-TC-CONV-070.json`）。`TC-AI-010`：改后发送填入的就是草稿正文 X，加「（已核实）」后买家视图收到「[译文] X（已核实）」；审计日志「Nur Aisyah 改后发送了 AI 草稿（编辑距离 5）」；本月 `editedSent` 1 → 2（`run-059-TC-AI-010.json`、`-3.png`）。`TC-CONV-022`、`TC-CONV-026`、`TC-AI-010` 第一遍因执行脚本出错没跑完：脚本手动移除提示框节点后页面渲染出错、草稿状态值写错、等待条件写成异步函数；修正脚本后按原步骤在新会话上重跑，证据文件是第二遍的输出。控制台只有故障注入引起的 502（`run-059-console.json`）。
RUN-060 证据：被测为 `wt/navperf` 工作区的生产构建（`next build` + `next start`，端口 3380），独立库 `shopilot_wt_navperf`（种子基线），Edge headless，登录 owner@demo.test。第 1 步：停留 3 秒后 `/tickets`、`/orders`、`/dashboard`、`/reception`、`/shops`、`/team`、`/billing`、`/settings` 各有一次带 `Next-Router-Prefetch` 的预取，均 200。第 2 步：点「工单」后 67 ms 出现标题，点击触发的 `/tickets` 页面请求 0 个、脚本 0 个（只有页面自身的 `/api/v1/tickets` 与图标；新页面里链接的预取 14 个不计）。第 3、4 步用路由拦截代替网络面板：屏蔽预取请求、把切页的 RSC 请求延后 3 秒；订单与开票的骨架页头 2 条、加载行 6 条，骨架标题条与真实标题都是 x 264、y 80、高 32；接待设置骨架分组列 5 条、宽 200 px，与真实分组导航同宽，标题位置一致。第 5 步：工作台点另一个会话，2.5 秒内没有出现整页骨架。第 6 步：以 `reducedMotion: reduce` 打开时骨架灰条的 `animation-name` 为 `none`。执行中第 2 步的统计脚本一度把新页面里链接的预取算成页面请求、第 4 步一度量到页头灰条的宽度，都是脚本问题，修正后整轮重跑，用例第 2 步同时写明不计新页面里的预取。证据：`docs/test-runs/run-060-TC-PERM-008.json`、`run-060-TC-PERM-008-3-orders-{skeleton,ready}.png`、`run-060-TC-PERM-008-4-reception-{skeleton,ready}.png`、`run-060-TC-PERM-008-6-reduced-orders-skeleton.png`；前后性能对比 `docs/test-runs/run-060-nav-perf.txt`。
RUN-061 证据：被测为 `wt/convperf` 工作区的生产构建（`next build` + `next start`，端口 3381）与同库 Worker，独立库 `shopilot_wt_convperf`，起跑前 `pnpm db:reset && pnpm db:seed`，Edge headless，登录 owner@demo.test。受影响用例取改动所在的 `TC-CONV-075` 与工作台切会话相关的 `TC-PERM-008`（第 5 步）；本轮没有跑冒烟用例。`TC-CONV-075`：第 1 步静置 3 秒，会话页与会话详情请求 0 个（待认领 6 行）；第 2 步指针停在 C2 上 1 秒，发出 C2 的详情、买家侧栏与 `/wb/<C2>`（`RSC: 1`）请求，都是 200；第 3 步点击后 47 ms 出现「与 พลอย 的会话」，500 ms 内详情请求 0 个；第 4 步用请求拦截把 C3 详情延后 3 秒，点击后 37 ms 出现「正在打开与 priyanair 的会话」，列表高亮在 C3，会话头为「priyanair Shopee · SG Demo Shopee SG · 待认领 买家已等 22 分钟，超过接待时限」，时间线骨架 5 条、输入框骨架 4 条、右栏骨架 5 条，没有 พลอย 的会话；第 5 步占位与真实会话的买家名都在 (616, 84)，会话头底边都是 171，输入框顶边都是 746；第 6 步 390 px 宽时列表隐藏，占位带返回按钮与 10 条骨架，详情返回后换成真实会话；第 7 步 Cmd 点 C2 新标签打开 `/wb/<C2>`，原标签仍是 C1、没有出现占位；第 8 步减少动效时骨架 `animation-name` 为 `none`；第 9 步 390 px 宽、C2 页面请求延后 3 秒，点 C2 后点占位上的返回按钮，1 ms 内回到列表，4 秒后仍在 `/wb`、没有占位、没有打开 C2。`TC-PERM-008`：第 1 步 8 个页面各有一次带 `Next-Router-Prefetch` 的预取，均 200；第 2 步点「工单」后 63 ms 出现标题，`/tickets` 页面请求 0 个、脚本 0 个；第 3、4 步屏蔽预取请求后按 Chrome 慢速 3G 预设限速（往返 2,000 ms、上下行 50 KB/s），订单与开票骨架页头 2 条、加载行 6 条，骨架标题条与真实标题都是 x 264、y 80、高 32；接待设置骨架分组列 5 条、宽 200 px，与真实分组导航同宽；第 5 步点另一个会话，2.5 秒内没有出现整页骨架；第 6 步减少动效时骨架 `animation-name` 为 `none`。执行中两处是脚本或用例写法问题，修正后整轮重跑：`TC-CONV-075` 第 2 步原写「其中一个请求头带 `Next-Router-Prefetch`」，先打开过别的会话后 Next 复用已取到的路由结构，只发整页数据请求，用例改为「请求头带 `RSC: 1`」；`TC-PERM-008` 第 3 步先按 RUN-060 的办法把切页请求整体延后 3 秒，骨架要等延后的响应到了才出现，改按用例原文的慢速 3G 限速后骨架在真实页面之前出现。第 9 步是执行中发现窄屏点下会话后立即返回会卡在占位上、修好后补的，补完后在新构建上从重置种子起整轮重跑，本段数字都是这一遍的。控制台 90 条都是被屏蔽的预取请求报的 `net::ERR_FAILED`（`run-061-console.json`）。证据：`docs/test-runs/run-061-TC-CONV-075.json`、`run-061-TC-CONV-075-4-placeholder.png`、`-5-ready.png`、`-6-390-placeholder.png`，`run-061-TC-PERM-008.json`、`run-061-TC-PERM-008-3-orders-{skeleton,ready}.png`、`run-061-TC-PERM-008-4-reception-{skeleton,ready}.png`；前后性能对比 `docs/test-runs/run-061-conv-perf.txt`。

RUN-062 证据：局部轮，DESIGN v1.29 TikTok 会话发视频。被测为 `wt/ttvideo` 工作区（基于 `bb3f383`，改了上传接口、发送校验、TikTok 适配器、模拟平台与输入框规则），`next dev` 端口 3382 与同库 Worker，独立库 `shopilot_wt_ttvideo`，`APP_BASE_URL`、`SHOPEE_HOSTS`、`TIKTOK_*` 改成 3382，`AI_MODE=stub`，起跑前 `pnpm db:reset && pnpm db:seed`；Edge headless；每条用例用 `create_buyer` 加 `buyer_message` 新建买家，推送都是 HTTP 200。受影响用例按 `REQ-CONV-015` 取，另加上传接口改过的 `TC-CONV-022`；本轮没有跑冒烟用例。§3 测试文件按本版 §3 生成（clip.mp4 17,280 字节、clip.mov 17,227、clip.webm 29,174、big31.mp4 32,505,856、big101.mp4 105,906,176）；粘贴由 AI 对输入框派发 `paste` 事件，31 MB 与 101 MB 的粘贴在页面里造同样大小与类型的文件（输入框只看类型与大小，不上传）。`TC-CONV-076`：附件条「第 1 个附件：视频」，发送后附件条清空、库里 `sending`，之后 `sent`，灯箱播放 `currentTime` 0.51；买家视图 `buyer:text`、`seller:video`；粘贴 clip.mov 提示「只支持 MP4 视频，MOV 等格式请先导出为 MP4。」，粘贴 31 MB 提示「视频 31.0 MB，超过 30 MB 上限。」，附件条都不出现；接口上传 clip.mov 201、`video/quicktime`，发送 415 `/errors/unsupported-type`「Shopee 只能发 MP4 视频。」，消息数 2 → 2；big31.mp4 上传 201、发送 413 `/errors/too-large`「Shopee 视频不能超过 30 MB。」。`TC-CONV-077`：附件按钮读屏名与用例一致；输入「这是安装视频」加粘贴 clip.mp4 不弹提示；发送后附件条清空，这句话在视频气泡之前，视频气泡「发送中」（`run-062-TC-CONV-077-3.png`），随后 `sent`，灯箱播放 `/api/v1/files/<文件 ID>`、`currentTime` 0.51；库里最后两行 `text|sent|t|`、`video|sent|t|/api/v1/files/<文件 ID>`；买家视图 `TEXT:[译文] 这是安装视频`、`VIDEO`；选 clip.mov 与 clip.webm 按顺序进附件条，发出后依次 `video/quicktime|sent`、`video/webm|sent`；粘贴 101 MB 提示「视频 101.0 MB，超过 100 MB 上限。」；接口上传 big101.mp4 413 `/errors/too-large`「视频不能超过 100 MB，图片不能超过 10 MB。」；big31.mp4 上传 201、发送 201 `sending`，10 秒后 `sent`，模拟平台请求依次是 init、`chunk_num=1`、`chunk_num=2` 两次 PUT、202309 发送，都是 200（`run-062-TC-CONV-077-11-weblog.txt`）。`TC-CONV-077` 前两遍是执行脚本的问题，修正后在新会话上重跑第三遍，本段数字都是第三遍的：第一遍第 5 步脚本把布尔列拼成字符串得到 `true`（用例原文的 `q` 输出 `t`），第 11 步脚本没解析出 `chunk_num`；第二遍第 11 步按 `client_request_id` 查到前一遍的同名消息，用例第 11 步的查询改为限定会话 C（§1 不另记，用例本轮新增）。`TC-CONV-072`：附件条三张读屏名第 1–3 个、无确认框；输入框外框 106 → 170 → 发送后 106 px；时间线最后三条 `text|sent`、红图、蓝图（文件 ID 与粘贴时的上传顺序一致），买家视图同序；真实剪贴板（文字「你好」加 PNG，⌘V）输入框为「你好」、附件条不出现；粘贴 a.pdf 提示「平台聊天只能发图片和 MP4 视频，PDF 等文件发不出去。」；附件按钮选两张进附件条、消息数 4 → 4，逐个移除后清空。`TC-CONV-022`：11 MB JPG 提示「图片 11.0 MB，超过 10 MB 上限。」，上传接口 413 `/errors/too-large`「图片不能超过 10 MB。」；GIF 提示「只支持 JPG、PNG、WebP，不超过 10 MB。」，上传接口 415 `/errors/unsupported-type`「只支持 JPG、PNG、WebP 图片和 MP4、MOV、WebM 视频。」；10,485,760 字节 PNG 上传 201、进附件条，发送后 `sent`。控制台没有报错。证据：`docs/test-runs/run-062-results.json`（各步实际值）、`run-062-TC-CONV-076-{1,2}.png`、`run-062-TC-CONV-077-{2,3,4}.png`、`run-062-TC-CONV-077-11-weblog.txt`、`run-062-TC-CONV-072-5.png`。

RUN-063 证据：局部轮，DESIGN v1.30 视频按真实宽高比显示。被测为 `wt/vdims` 工作区（基于 `fcd1ea8`，改了输入框上传、上传接口、Shopee 视频结果合并与时间线视频缩略图），`next dev` 端口 3383 与同库 Worker，独立库 `shopilot_wt_vdims`，`APP_BASE_URL`、`SHOPEE_HOSTS`、`TIKTOK_*` 改成 3383，`AI_MODE=stub`，`DATA_DIR` 用临时目录，起跑前 `pnpm db:reset && pnpm db:seed`；Edge headless，登录 owner@demo.test；会话用 `create_buyer` 加 `buyer_message` 新建，C1 在 Demo TikTok MY、C2 在 Demo Shopee MY。§3 测试视频按本版生成（wide.mp4 1280×720、43,512 字节，tall.mp4 720×1280、35,934 字节）。只跑新增的 `TC-CONV-078`；视频发送链路除带上宽高外没有改动，`TC-CONV-076`、`TC-CONV-077`、`TC-CONV-072`、`TC-CONV-022` 与冒烟用例本轮没有跑，代码仓 `video.test.ts`、`video-tiktok.test.ts` 在同一工作区全量 vitest 中通过（53 个文件、396 条）。第 1 步上传表单为 `file`、`width` 1280、`height` 720（页面里记录 `XMLHttpRequest` 发出的表单，Playwright 读不到带文件的请求体），响应 201、`width` 1280、`height` 720；第 2 步缩略图 240 × 135，缩略图里视频画面框比例 1.789、视频本身 1.778，没有黑边；第 3 步灯箱播放 2 秒后 `currentTime` 1.99；第 4 步 tall.mp4 缩略图 144 × 256，灯箱 `currentTime` 2.00；第 5 步 `1280|720`、`720|1280`；第 6 步 Shopee 视频已发送，缩略图 240 × 135，消息里播放地址换成模拟平台地址，宽高为模拟平台返回的 640 × 360，灯箱 `currentTime` 2.00；第 7 步买家视频在左侧（x 616，对话栏 x 600、宽 464），144 × 256；第 8 步每 250 ms 量一次、共 7 秒，只出现两个尺寸：先 144 × 256，第 3.06 秒变为 240 × 135，之后不变；第 9 步 390 px 宽三条缩略图依次 240 × 135、144 × 256、144 × 256（比例 1.778、0.563、0.563），都在对话栏（x 12、宽 366）内，`scrollWidth` 390 等于窗口宽，Shopee 那条 240 × 135；第 10 步两次 `HTTP 422` `/errors/validation`，`detail` 与用例一致；第 11 步 `HTTP 201` 宽高 1280、720，不带宽高的 `HTTP 201` 宽高都是 null。控制台没有报错。用例第 7 步原写的插入语句没给 `id`（消息表的 ID 由应用生成，库里没有默认值），执行时报非空约束错误，改为 `gen_random_uuid()` 后整条重跑，本段数字都是重跑的（用例本轮新增，§1 不另记）。证据：`docs/test-runs/run-063-TC-CONV-078.json`（各步实际值）、`run-063-TC-CONV-078-1440-tiktok.png`、`run-063-TC-CONV-078-1440-shopee.png`、`run-063-TC-CONV-078-390-tiktok-top.png`、`run-063-TC-CONV-078-390-tiktok-bottom.png`。

RUN-064 证据：修复前那一轮，只跑源自缺陷的 `TC-CONV-079`。被测为主工作区 `c956fea`（只改了 `docs/`），`pnpm db:reset && pnpm db:seed` 后 `pnpm dev`（3360），`AI_MODE=stub`。测试视频按 §3 生成，`qt.mp4` 第 5–12 字节为 `ftypqt  `；附件按钮选文件由 Playwright `setInputFiles` 完成，浏览器按后缀给出 `video/mp4`，与用户 2026-10-21 在 shopilot.live 报的 TH.mp4 走同一条路径（那份文件是 QuickTime 容器、HEVC 编码，同日在生产只上传到 Shopee 试处理，按 .mov、.mp4 两种文件名都处理成功，没有发给买家）。

RUN-065 证据：复测轮，同一环境改了 `src/lib/attachments.ts`（Shopee 视频格式加 MOV）后执行。第 4 步截图时第三条气泡还显示「发送中」（界面轮询晚于库），库里已为 `sent`；随后重开会话三条都是「已发送」，灯箱里三条都在播放（`run-065-TC-CONV-079-4b.png`）。旁证：加载 `.env` 后全量单测 53 个文件 396 条通过。

RUN-066 证据：局部轮，DESIGN v1.32 经验卡三条链路（FLOW-KB-CARD、FLOW-AI-CARD、FLOW-KB-LEARN）首轮，加 `TC-AI-001`、`TC-KB-053`、`TC-PERM-001` 作回归。主工作区 `d7a3c17`（经验卡三路实现已合并、未推送），起跑前 `pnpm db:reset && pnpm db:seed`（迁移到 0017）、`pnpm dev`（3360），`AI_MODE=stub`、`KNOWLEDGE_MODE=stub`；`TC-KB-067` 前按前置要求停服务、重建基线再起。执行用 Node 脚本按步骤调接口、查库，界面步骤用 Playwright + Edge 无头；每步结果与观察值在 `docs/test-runs/run-066-results.json`。执行中按 test-doc 纪律处理过的情况：① 执行脚本自身的问题，修脚本后重新观察同一步、不算产品结果：`TC-KB-059` 第 4 步第一次读到第 2 步留下的提示，等提示消失后重看为「内容没有变化」；`TC-KB-064` 第一次没有展开影子回复（它是折叠的「AI 影子回复（未发送）」），删掉这位买家的会话后重跑；`TC-KB-066` 第 2 步把右上角提示标题也计成了标记、第 4 步按原文查本方消息查不到（库里存的是译文），按截图与接口重看都符合；`TC-KB-068` 抽屉打开时页签被遮住、脚本取不到，删掉会话后重跑；`TC-KB-071` 前置第一次没点弹窗里的「结束会话」，删掉会话后重跑；`TC-AI-001` 第一次打开的列表地址写错（应为 `view=ai`），换一位新买家重跑。② 执行前改的用例措辞（不改语义）：`TC-KB-058` 第 4 步「测试这张卡」是一节标题，不是按钮；`TC-KB-059`、`TC-KB-068` 的版本行按抽屉实际排版写（「第 n 版」与作者分开显示）；`TC-KB-070` 的 F 改说「退货」、`TC-KB-071` 改说「我要转人工」，避开或命中种子里的转人工关键词；`TC-KB-066` 第 5 步先等 60 秒再连续提交，避开第 2 步已用掉的次数。③ 会话学习那一路提过「模拟器里买家连发两条，第二条没进会话」：用接口对 Demo Shopee MY 与 Demo TikTok TH 新买家各试了并发两条与先后两条，四种情况两条都入库、入站事件都是 `done`，没有复现，未记遗留问题。旁证：加载 `.env` 后全量单测 58 个文件 430 条通过。

RUN-067 证据：复测轮，承接 RUN-066。修复：工作台时间线「已提交学习」后接这条消息最近一次提交的进度或结论（`learning-bar.tsx#useLearnedMessages`、`timeline.tsx#LearnedMark`）；学习任务抽屉一直显示「相似内容」，没有相似卡时写「没有找到相似的已发布经验卡。」（`learning-drawer.tsx`）；`TC-KB-065` 原位改 `clientRequestId`。起跑前停服务、重建基线再起（第一次启动时 Next 取 Google Fonts 超时、页面 500，重启后正常）。三条用例全部步骤符合，`TC-KB-066` 第 3 步为「已提交学习 · 待审核」，`TC-KB-067` 第 9 步为「已提交学习 · 新建了经验卡」，`TC-KB-065` 统计为调用 4、原样 1、改后 1、弃用 1、转人工 1，抽屉采纳率 67%、转人工率 25%（`docs/test-runs/run-067-results.json`）。窄屏 390 宽下工作台标记与学习任务抽屉都没有横向溢出（`run-067-TC-KB-066-390.png`、`run-067-TC-KB-067-390.png`）。旁证：全量单测 430 条通过。

## 7. 遗留问题

- `/orders` 右侧「售后待处理」不随店铺筛选变化，选了某家店仍列出其他店的待处理售后 — 接受理由：该面板是全部可见店铺的待办汇总，`PAGE-ORDERS` 没要求它跟随列表筛选；关联：`TC-SHOP-021`、RUN-003。
- 已断开的店从接入向导重新连接后、点「完成接入」之前，接待模式是 off / off，不沿用断开前的模式 — 接受理由：完成接入时由管理员重新选模式，未完成前 AI 不接待是安全默认；从 `/shops` 续期授权不受影响（DESIGN §28）；关联：`TC-SHOP-020`、RUN-002。
- 数据导出的下载链接过期后，浏览器直接显示 `/errors/expired` 的 JSON，没有提示页 — 接受理由：链接是接口地址，邮件与 `/settings/data` 都写明 24 小时有效，本期不做提示页；关联：`TC-SET-010`、RUN-002。
