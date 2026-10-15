# Shopilot 测试文档

## 1. 元信息 / 变更记录

| 字段 | 值 |
| --- | --- |
| 状态 | 草稿 |
| Owner | 实现会话 |
| 关联设计文档 | `docs/DESIGN.md`（v1.12，已批准） |
| 被测系统 | Shopilot（本仓库）：Next.js Web 与 API、Worker 进程、同进程挂载的模拟平台与开发页 |
| 最后更新 | 2026-10-15 |

变更记录（登用例增改，不登执行轮次）：

| 日期 | 改动 | 作者 |
| --- | --- | --- |
| 2026-10-15 | 按 DESIGN v1.11–v1.12 补知识库：新增功能域「知识库」`TC-KB-001` 至 `TC-KB-036`（冒烟 2、回归 26、边缘 7，人工 1），用例共 265 条；`TC-AI-003` 改为「没有可用资料时不检索」；`TC-PERM-001` 组长看到接待设置且只有知识库标签；`TC-TEAM-013` 权限表含知识库「资料与测试问答」一行；`TC-CONV-010` 对照项加草稿「依据」；§2 范围与不测项、§3 检索替身、AI 替身「资料不足」、知识库测试文件、补扫场景与 curl 函数 | 实现会话 |
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

- 覆盖：DESIGN v1.12 全部 REQ 的黑盒功能验收，层面是浏览器界面（Playwright + Edge 或人工）、HTTP 接口（curl）、模拟器买家视图、发件箱 `/dev/outbox`。§19 的每个 Gherkin 场景至少由一条用例可操作化，用例标题行的「对应」列出 REQ。界面文案以 `docs/ui-interactions.md` 为准；助手、飞书的按钮不在本期范围，知识库只测一期（资料上传与入库、分类、站点与开关、测试问答、出稿检索与依据），经验卡、更新审核、AI 核验、产品目录的按钮不在本期范围。
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
| 对话助手、飞书；知识库的经验卡、更新审核与版本回滚、AI 回复核验、产品目录、知识缺口看板 | 本期不做（DESIGN §2 非目标） |
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
  1. 没有 `.env` 时从 `.env.example` 复制生成，逐行按注释里的「获取」填值；密钥按 AGENTS.md「密钥纪律」处理，值不进文档、对话、日志。`DEEPSEEK_API_KEY` 取自 Bitwarden 条目 `DEEPSEEK_API_KEY`，vault 解锁由人执行，只有 `TC-AI-002` 需要它。设 `AI_MODE=stub`、`MOCK_PLATFORM=1`、`KNOWLEDGE_MODE=stub`。
  2. `docker compose up -d`（PostgreSQL 17，`127.0.0.1:5460`），`docker compose ps` 显示 postgres 为 healthy。
  3. `pnpm install`，然后 `pnpm db:reset && pnpm db:seed`。
  4. `pnpm dev`（同时起 Web `http://127.0.0.1:3360` 与 Worker），按上表就绪判定检查。端口 3360 被别的进程占用时，`/api/health` 返回的 `service` 不是 `shopilot`，先停掉占用进程。
- 基线：执行完上面第 3 步并按第 4 步启动、`AI_MODE=stub`、`KNOWLEDGE_MODE=stub`、AI 替身为默认「正常回复」、检索替身为默认 `normal` 的状态；种子不含知识库资料，两个商户各只有内置分类「未分类」。用例前置写「基线」时，若本轮前面的用例改过数据或配置，先重跑 `pnpm db:reset && pnpm db:seed`。
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
- AI 替身（`AI_MODE=stub`）：模拟器页「AI 替身」面板设定下一次出稿的回复，可选「正常回复」（默认，confidence 0.85）、「低置信 0.4」、「要求转人工」、「非 JSON 文本」、「超时」；设定只作用于下一次出稿，之后回到默认；面板显示所选回复的 JSON（含 `reason`）。面板同时显示最近一次出稿请求（接口 `GET /api/dev/ai-stub` 的 `lastRequest`），用例写「最近一次请求」即指它。翻译与开票字段抽取在 stub 下返回非空的替身文本。另有「资料不足」（`insufficient = true`、confidence 0.9、`used_sources` 为空）：面板没有这一项，用接口设 `curl -s -X PUT $B/api/dev/ai-stub -H 'Content-Type: application/json' -d '{"next":"insufficient"}'`，同样只作用于下一次；其他选项也可以这样设，加 `"sticky":true` 则一直生效，用完设回 `{"next":"normal"}`。出稿请求带资料片段时，「正常回复」在 `used_sources` 里引用第 1 段；检索前的改写请求一律返回买家原话，不受设定影响，也不记入「最近一次请求」。测试问答（`API-KB-012`）与出稿共用同一个替身。
- 检索替身（`KNOWLEDGE_MODE=stub`，DESIGN `API-MOCK-010`）：入库时文本类资料（md、txt、csv、html）按 1,500 字切块，其余格式生成一段「替身解析：<文件名>」，上传即报索引完成；检索读该商户已解析的分块，按关键词重合打分（中文按相邻两字），每段都带向量分。下一次表现用接口设：`curl -s -X PUT $B/api/dev/knowledge-stub -H 'Content-Type: application/json' -d '{"next":"<值>"}'`，值为 `normal`（默认）、`no_vector`（混合检索结果没有向量分）、`timeout`（检索超时）、`error`（检索返回 HTTP 500）、`ingest_error`（入库时条目索引报 `workers_ai_timeout_error（替身）`）；默认只作用于下一次检索或下一次条目上传，加 `"sticky":true` 一直生效，用完设回 `{"next":"normal"}`。`curl -s $B/api/dev/knowledge-stub` 返回当前设定与 `lastQuery`（最近 6 次检索请求，旧的在前，每条有 `query` 与 `retrievalType`：`hybrid` 混合、`vector` 纯向量），用例写「最近检索请求」即指它。`AI_MODE=deepseek` 时调真实 DeepSeek，改 `.env` 后重启 `pnpm dev`。
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
- 知识库 curl 函数（先执行「curl 会话」，再执行下面的定义；`kbup` 上传一份资料，追加的参数原样交给 curl，如 `-F categoryId=<ID> -F markets=MY`；`kbclear` 删掉 Demo Store 全部资料与自建分类；`q` 在本机库执行一条只读 SQL，库名默认 `shopilot`）：

```bash
kbup() { who=$1; f=$2; shift 2; curl -s -b "$SP_TMP/$who" -H "Origin: $B" -F "file=@$f" "$@" -w '\nHTTP %{http_code}\n' "$B/api/v1/knowledge/documents"; }
kbclear() { login owner@demo.test >/dev/null
  while ids=$(curl -s -b "$SP_TMP/owner@demo.test" "$B/api/v1/knowledge/documents?limit=100" | jq -r '.items[].id') && [ -n "$ids" ]; do
    for id in $ids; do curl -s -o /dev/null -b "$SP_TMP/owner@demo.test" -H "Origin: $B" -X DELETE "$B/api/v1/knowledge/documents/$id"; done; done
  for id in $(curl -s -b "$SP_TMP/owner@demo.test" "$B/api/v1/knowledge/categories" | jq -r '.items[] | select(.builtin | not) | .id'); do
    curl -s -o /dev/null -b "$SP_TMP/owner@demo.test" -H "Origin: $B" -X DELETE "$B/api/v1/knowledge/categories/$id"; done; }
q() { docker compose exec -T postgres psql -U shopilot -d "${SP_DB:-shopilot}" -Atc "$1"; }
```

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
| 4 | B：在该页输入密码开启，用验证器扫码后输入当前验证码 | 显示备用码并提示已开启；之后点侧栏「工作台」进入 `/wb` 并显示会话列表 |
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
| 3 | B：刷新页面 | 侧栏出现「看板」，工作台子项出现「同事处理中」；会话列表里没有 Demo TikTok TH 的会话 |
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
| 1 | 以 owner@demo.test 登录看侧栏与顶栏，再点「收起侧栏」 | 侧栏：工作台（子项待认领、AI 草稿、我处理中、已结束、同事处理中）、工单、订单与开票、看板、接待设置、店铺与连接、团队与权限、用量与套餐、商户设置；导航下方没有出稿用量卡，收起后底部只有「展开侧栏」按钮；没有「知识库」；顶栏没有「助手」 |
| 2 | 以 lead@demo.test 登录看侧栏 | 工作台（含同事处理中）、工单、订单与开票、看板、接待设置；没有店铺与连接、团队与权限、用量与套餐、商户设置 |
| 3 | 以 agent@demo.test 登录看侧栏 | 工作台（待认领、AI 草稿、我处理中、已结束，没有同事处理中）、工单、订单与开票；没有看板、接待设置 |
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
| 9 | 按 §3「模拟器发消息」向 Wizard Shopee MY 新买家发「接入后第一条」 | 10 秒内 signup1 的 `/wb` 待认领出现该会话 |

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
| 2 | 检查页面 | 没有飞书相关的入口与文案 |

后置：无。

#### `TC-SHOP-025` 接入后店铺数超过套餐上限时拒绝 — 对应 `REQ-SHOP-004` · 级别: 回归 · 执行者: 皆可

前置：基线；终端执行 `pnpm scenario shop-limit-full`；以 owner@demo.test 登录，在 `/shops` 记下店铺数 N。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 打开 `/shops/connect/shopee/auth`，点「打开授权页」 | 模拟授权页列出 Demo Shopee MY、Demo Shopee SG 与未接入的 Demo Shopee PH |
| 2 | 勾全部三家，点授权 | 回到 `/shops/connect/shopee/auth`，地址带 `result=error&reason=shop_limit`，页面提示店铺数超过套餐上限并给出升级套餐的入口 |
| 3 | 刷新 `/shops` | 店铺数仍为 N，没有 Demo Shopee PH |

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
| 1 | 打开 `/wb` | 分组为待认领、AI 草稿、我处理中、已结束、同事处理中，计数大于 0 的分组带数字、为 0 的不显示数字；侧栏工作台子项的数字与之相同 |
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
| 1 | Arif 打开「同事处理中」 | 列表有 C，处理人 Nur Aisyah |
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
| 1 | 点「发图片」选该 PNG | 时间线出现该图片，状态为已发送 |
| 2 | 看模拟器 B 的买家视图 | 收到这张图片 |

后置：无。

#### `TC-CONV-022` 上传图片的大小与类型校验 — 对应 `REQ-CONV-005` · 级别: 边缘 · 执行者: 皆可

前置：基线；准备 §3 的 11 MB JPG、GIF、恰好 10,485,760 字节的 PNG；Nur 处于一个自己处理中的 Demo Shopee MY 会话。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 「发图片」选 11 MB 的 JPG | 提示超过 10 MB 上限，没有发出；上传接口 413，`type` 为 `/errors/too-large` |
| 2 | 选 GIF | 提示只支持 JPG / PNG / WebP；上传接口 415，`type` 为 `/errors/unsupported-type` |
| 3 | 选 10,485,760 字节的 PNG | 上传接口 201，图片发出 |

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

### AI 出稿

#### `TC-AI-001` 主链路：买家消息生成 assist 草稿，员工认领并发送到买家 — 对应 `REQ-AI-001`、`REQ-AI-002`、`REQ-AI-003`、`REQ-CONV-001`、`REQ-CONV-004`、`REQ-CONV-005`、`REQ-MOCK-002` · 级别: 冒烟 · 执行者: 皆可

前置：基线；浏览器 A 以 agent@demo.test（Nur）登录停在 `/wb`；浏览器 B 打开模拟器；浏览器 C 以 owner@demo.test 打开 `/billing`，记下本期已用 U 与 assist 次数 A0。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | B：选 Demo Shopee MY、新建买家，发「我的包裹到哪了」 | 推送日志新增一条 Shopee code 10 推送，HTTP 200 |
| 2 | A：等待最多 20 秒 | 会话列表的「AI 草稿」分组计数加 1，列表出现该买家的会话，行上店铺为 Demo Shopee MY（侧栏计数按 30 秒轮询，可能稍后才变） |
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
| 1 | 打开 `/reception/knowledge` | 接待设置子导航选中「知识库」；左栏标题「资料 0 / 500」，空态写「还没有资料。把产品手册、保修与退换政策拖到这里」；右栏「测试问答」面板有问题框、店铺下拉与「提问」 |
| 2 | 点「上传资料」，在弹窗里选择 `$KB/保修政策.pdf` 与 `$KB/型号对照.xlsx` | 弹窗列出两个文件与大小（3.0 MB、1.0 MB），都写「等待上传」；弹窗写明支持的格式，以及「单个文件不超过 20 MB，PDF 以外的文件不超过 4 MB；PPT 请先导出为 PDF 再上传」；按钮为「上传 2 个文件」 |
| 3 | 分类选「售后政策」，适用站点保持「全部站点」，点「上传 2 个文件」 | 两个文件依次显示进度，最后都显示「已上传，排队解析」；弹窗底部写「已上传 2 个」，按钮变为「完成」 |
| 4 | 点「完成」，看资料列表，最多等 30 秒 | 列表两行，分类「售后政策」、站点「全部站点」；状态从「排队中」或「解析中」变为「可用」，「AI 可用」开关为开；标题旁资料数为「2 / 500」 |
| 5 | 点「保修政策.pdf」一行 | 地址带 `?doc=<ID>`；抽屉「资料详情」显示文件名、状态「可用」、「1 段分块」、分类、适用站点「全部站点」、上传人林晓；「原文件」标签内嵌 PDF 预览 |
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
| 1 | 站点筛选选「MY」 | 只列保修政策.md（适用全部站点的也列出）；地址带 `market=MY` |
| 2 | 站点筛选改为「TH」 | 两份都列出 |
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
| 5 | C：打开同一会话，点依据里的《保修政策.md》 | 新开一个标签，地址为 `/reception/knowledge?doc=<保修政策.md 的 ID>`，资料抽屉显示保修政策.md |
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

前置：基线；`login owner@demo.test`；`pnpm scenario knowledge-queued-11m` 记资料 ID D1；`pnpm scenario knowledge-processing-26m` 记资料 ID D2；`api owner@demo.test -X PATCH "$B/api/v1/knowledge/documents/<D1>" -d '{"aiEnabled":false}'` 返回 200（入库前就关掉 AI 可用）。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | `pnpm job knowledge.purge` | 输出 `"ok":true` |
| 2 | 最多等 30 秒，`api owner@demo.test "$B/api/v1/knowledge/documents/<D1>"` | `document.status` 为 `ready`、`aiEnabled` 仍为 false；浏览器以 owner 打开 `/reception/knowledge`，D1 一行状态为「已停用」 |
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

### 看板

#### `TC-DASH-001` 组长的看板只含负责店铺 — 对应 `REQ-DASH-001` · 级别: 回归 · 执行者: 皆可

前置：基线；`login lead@demo.test`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | Arif 打开 `/dashboard`，范围选「近 7 天」 | 会话段数、人工首响中位、草稿处置、按人统计、工单区都有数据或空态；平台指标分 Shopee、TikTok 两张表，各自写明口径，只出现 Demo Shopee MY、Demo TikTok MY |
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
| 4 | 点「导出报表」 | 下载 CSV，含会话段数与草稿处置的列 |

后置：无。

#### `TC-DASH-004` 看板对照原型与数据不足态 — 对应 `REQ-DASH-001` · 级别: 回归 · 执行者: 人工

前置：基线；导出 Quilt 原型；新注册一个商户。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | owner@demo.test 打开 `/dashboard` 与原型 `/dashboard` 对照 | 卡片、图表类型、文案一致；图表为 Chart.js 渲染；原型里「去补资料」「去核验」不出现 |
| 2 | 新商户打开 `/dashboard` | 比率类指标显示数据不足，而不是 0% 或 100% |

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
| 1 | owner 打开 `/settings/security` | 有管理员两步验证、全员两步验证、会话时长（8 小时 / 12 小时 / 24 小时 / 7 天）、IP 限制与白名单；没有本人设备列表（在 `/account/security`）；没有飞书登录开关 |
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
| 2 | 依次请求 `/mock/simulator`、`/api/mock/sim/state`、`/mock/shopee/sg/api/v2/public/get_shops_by_partner`、`/dev/outbox`、`/api/dev/outbox` | 都是 404 |
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

冒烟级共 12 条，每轮必跑，合起来证明主链路：

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

本期没有线上环境，冒烟用例都不标「线上可跑」，不设线上冒烟轮；上线前由 deploy-pipeline 补 §3 线上行后再按 TEMPLATE 头部判据逐条判定。

- **全量轮**（全部用例）：首次成稿后的第一轮、DESIGN §26 里程碑第 6 步的交付轮、跨功能域改动、地基变更（环境、鉴权、数据模型、模拟平台）。本期验收以对应 P0 REQ 的用例全部通过为准（§2）。
- **局部轮**（受影响用例 + 全部冒烟级）：单一功能改动。受影响用例的判定：先列出本次 DESIGN 改动触及的 `REQ-*`；改的是 §8 接口，取该接口「实现」列的 REQ；改的是 §11 状态机，取该节标题与迁移表里的接口所对应的 REQ；然后在仓库根执行 `grep -n '<REQ ID>' docs/TEST.md`，命中的 `####` 标题行即受影响用例。例：只改工单状态机 11.4 → `REQ-TKT-001`、`REQ-TKT-003`、`REQ-TKT-004` → `grep` 得到 `TC-TKT-*`、`TC-ORD-007`、`TC-RCP-*` 中引用这些 REQ 的用例。无 REQ 变更的改动（重构、依赖升级、纯 bug 修）按改动触及的功能域取 §4 对应 `###` 小节的全部用例；影响面拿不准时升级为全量轮。
- **复测轮**（上轮失败用例 + 全部冒烟级）：修复失败项之后。
- **人工收口轮**（仅上轮「待人工」用例）：AI 轮之后由人工补测收口，不要求冒烟级。当前执行者为人工的用例：`TC-SHOP-024`、`TC-CONV-009`、`TC-CONV-010`、`TC-TKT-020`、`TC-DASH-004`、`TC-ORD-020`、`TC-KB-036`。

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

RUN-001 备注：`TC-CONV-002`、`TC-CONV-003`、`TC-CONV-032` 在 convai 组因前置 `TC-SHOP-001` 未满足登「阻塞」，同轮由 shopset 组接入 Wizard 应用后补跑通过；`TC-AI-002`（真实 DeepSeek，`AI_MODE=deepseek`）与 `TC-MOCK-002`（`MOCK_PLATFORM=0`）要改 `.env` 并重启 dev server，由主会话在各组结束后单独执行，均通过（`run-001-TC-AI-002-2.json`）。证据文件都在 `docs/test-runs/`。

RUN-002 备注：`TC-AI-002`（`AI_MODE=deepseek`，模型 `deepseek-flash`）与 `TC-MOCK-002`（`MOCK_PLATFORM=0`）由主会话在四组结束后执行，均通过（`run-002-TC-AI-002-2.json`），`.env` 已改回 `AI_MODE=stub`、`MOCK_PLATFORM=1`。各组判通过但记了观察的条目（后续修复或用例措辞，不改本轮结果）：`TC-AUTH-005` 首跑时并行登录占满同 IP 限频，429 的尝试被记成「密码错误」并计入锁定（换账号与来源 IP 重跑通过）；`TC-PERM-001` lead、agent 的 `nav-summary` 带 `usage: null` 键；`TC-SHOP-021`、`TC-SHOP-020` 已断开的店不在 `/wb`、`/orders` 的店铺筛选里，保留的历史按店铺筛不到；§3「Shopee 签名调用」配方的变量名 `path` 在 zsh 里覆盖 `PATH`；场景 `plan-over-shop-limit` 店铺编号偶发撞号、失败时留下半截数据。convai 组另记：auto 模式低置信转人工后，AI 发的安抚句把等待计时清零，待认领超时提醒与「已等」都不出现。

RUN-003 备注：上轮 4 个失败项（`TC-TEAM-002`、`TC-TEAM-012` 第 5 步、`TC-TKT-007`、`TC-CONV-012`）都已通过。冒烟里的 `TC-AI-002`（真实 DeepSeek）留到 RUN-004 由主会话执行。执行者另记：工单时间线里成员处理后回读到的平台事件来源标「页面」（已改为「平台」，RUN-004 随 `TC-TKT-001` 复测）；用例里「认领并回复」「接受」与界面按钮名不一致（已统一用例措辞）；`/orders` 右侧「售后待处理」不随店铺筛选变化；店铺重新连接后未点「完成接入」时接待模式为 off / off。

RUN-004 备注：`TC-AI-002` 由主会话执行（`AI_MODE=deepseek`，草稿提到订单号与运单号，置信度 0.90，认领并发送后买家视图收到同文；`run-004-TC-AI-002-2.json`），之后 `.env` 改回 `AI_MODE=stub` 并重建基线。执行者记的措辞差异（判通过）：平台筛选项叫「TikTok」；接入后店铺「连接」列显示「正常」或「需处理 · …」；发票号只在提示里出现。前两条已在本次修正用例措辞。

RUN-005 备注：convai 组中途因用量额度中断约 30 分钟，恢复后先核对全局设置均为基线值再续跑。`TC-AI-002`（`AI_MODE=deepseek`）与 `TC-MOCK-002`（`MOCK_PLATFORM=0`）由主会话在四组结束后执行，`.env` 已改回 `AI_MODE=stub`、`MOCK_PLATFORM=1` 并重建基线。判通过但记了观察的条目：工单时间线的拒绝、争议原因显示为原因代码；`TC-ORD-013` 前置让 Nur 读组长名下的工单会 404（改由 owner 取售后单 ID）；工作台多处按钮名与用例写法不同（「转交给同事」「改派给其他同事」「发送订单卡」等，阶段来源「手动」）；删除买家数据后用量页「已用」比按模式、按店的合计多出被删的那次；`TC-SHOP-015` 把 2001001 的回调改到别处后没有改回，会让下一个接入该应用的商户先遇到回调占用。

RUN-006 备注：`TC-AI-002` 由主会话以 `AI_MODE=deepseek` 执行并通过（草稿写明订单号、商品、物流与运单号；`run-006-TC-AI-002-2.json`），之后改回 `AI_MODE=stub`。执行者记：`TC-BILL-001` 在基线上为 0 = 0；删除买家数据后「出稿来源」已注明被删的次数，「按店铺用量」卡片的合计仍比已用少、没有说明。

RUN-007 备注：`TC-SET-013` 已通过（下拉列表显示在选择框下方）。`TC-AI-002` 由主会话以 `AI_MODE=deepseek` 执行并通过（`run-007-TC-AI-002-2.json`），之后改回 `AI_MODE=stub`。执行者记：`TC-AI-001` 列表与分组标签在 9.1 秒出现新会话，侧栏「AI 草稿」计数按 30 秒轮询在 27.8 秒才变；`TC-SET-008` 之后 `/billing` 已用 3、按模式与按店铺合计 2，两张卡片都注明「另有 1 次出稿的草稿已随买家数据删除」（`run-007-TC-SET-008-billing.png`）。

RUN-008 备注：`TC-AUTH-014` 第 1 步在 Demo Store 与新注册商户上各做一次，跳到账号安全页后提示都显示约 4 秒（`run-008-TC-AUTH-014-1.png`、`run-008-TC-AUTH-014-1b.png`）。`TC-AI-002` 由主会话以 `AI_MODE=deepseek` 执行并通过（`run-008-TC-AI-002-2.json`），之后改回 `AI_MODE=stub` 并重建基线。`TC-AI-001` 第 2 步按列表的「AI 草稿」分组判定（8.5 秒出现）；侧栏计数按 `API-NAV-001` 30 秒轮询，28.4 秒才变，用例已写明以列表为准。

RUN-009 备注：`TC-PERM-001` 展开态导航下方没有用量卡、收起后底部只有「展开侧栏」按钮，三个角色的 `nav-summary` 都没有 `usage` 键（`run-009-TC-PERM-001-1.png`、`run-009-TC-PERM-001-1b.png`）。`TC-TKT-016` 按第二次执行登记：第一次在前置与第 1 步之间隔了约 1 分钟，Worker 按计划先跑了 `ticket.scan`，改用新场景 T-1007 后立即执行通过；`TC-TKT-016`、`TC-TKT-017` 的场景与第 1 步之间不能隔近 1 分钟。`TC-CONV-005` 第 2 步 9.1 秒，接近 10 秒上限。`TC-BILL-001` 排在出稿用例之后执行，已用 5 次，各口径合计一致。中途脚本触发登录限频（每分钟 30 次，429），等 60 秒后复用已登录会话继续，没有步骤因此改判。`TC-AI-002` 由主会话以 `AI_MODE=deepseek` 执行并通过：草稿写明订单号、商品、承运商与运单号，置信度 0.90，买家收到同样正文（`run-009-TC-AI-002-2.json`）；切换时重启的开发服务出现热更新循环（登录页 5 秒内重载 53 次），删除 `.next/dev` 后重启恢复，之后改回 `AI_MODE=stub` 并重建基线。

## 7. 遗留问题

- `/orders` 右侧「售后待处理」不随店铺筛选变化，选了某家店仍列出其他店的待处理售后 — 接受理由：该面板是全部可见店铺的待办汇总，`PAGE-ORDERS` 没要求它跟随列表筛选；关联：`TC-SHOP-021`、RUN-003。
- 已断开的店从接入向导重新连接后、点「完成接入」之前，接待模式是 off / off，不沿用断开前的模式 — 接受理由：完成接入时由管理员重新选模式，未完成前 AI 不接待是安全默认；从 `/shops` 续期授权不受影响（DESIGN §28）；关联：`TC-SHOP-020`、RUN-002。
- 数据导出的下载链接过期后，浏览器直接显示 `/errors/expired` 的 JSON，没有提示页 — 接受理由：链接是接口地址，邮件与 `/settings/data` 都写明 24 小时有效，本期不做提示页；关联：`TC-SET-010`、RUN-002。
