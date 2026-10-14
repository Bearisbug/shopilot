# RUN-002 · shopset 组结果

- 轮次：RUN-002（全量轮的一部分），环境：本地（http://127.0.0.1:3360，`AI_MODE=stub`），执行者：AI（shopset 组），日期：2026-10-12（UTC+8 08:24–10:10）。按 docs/TEST.md 当前文本（DESIGN v1.5）执行。
- 范围：§4「店铺接入与授权」`TC-SHOP-001`–`025`、「商户设置」`TC-SET-001`–`016`、「用量与套餐」`TC-BILL-001`–`012`、「模拟平台与发件箱」`TC-MOCK-001`、`003`、`004`、`005`（`TC-MOCK-002` 由主会话单独跑），另加 `TC-CONV-002`、`TC-CONV-003`、`TC-CONV-032`，共 60 条。
- 结果：通过 59 · 失败 0 · 待人工 1（`TC-SHOP-024`）· 阻塞 0。
- 手段：界面步骤用 Playwright + 本机 Edge（headless，接口登录后按账号缓存会话，避开 429）；接口用 §3「curl 会话」（在 bash 下执行，见环境问题①）；模拟器动作走 `POST /api/mock/sim/{action}`，读数走 `GET /api/mock/sim/state` 与模拟库表；推送原始载荷从 `mock_push_log.raw_body` 读；两步验证码用 node 按 RFC 6238 现算。用例前置（建工单、改工作时间、买家发消息）部分用接口完成，用例步骤本身在界面上做。

## 基线重建

本组是本轮最后一组，按主会话授权在项目根执行 `pnpm db:reset && pnpm db:seed`（未重启 dev server，重建后等 10 秒、重新登录），共 7 次：

| # | 时间（UTC+8） | 原因 |
| --- | --- | --- |
| 1 | 08:24 | 起跑前恢复基线（其他组已跑完） |
| 2 | 09:45 | `TC-SHOP-021` 后置 |
| 3 | 09:54 | `TC-BILL-003` 前置场景 `plan-over-shop-limit` 首跑撞键失败、排查时又被重跑两次（累计 14 家店，见环境问题②），重建后重做；同时让 Wizard Shopee MY 回到未接入（`TC-CONV-032` 的商户已接入它，`TC-SHOP-023` 需要未接入） |
| 4 | 09:58 | `TC-BILL-003` 后置 |
| 5 | 10:00 | `TC-SHOP-025` 后置 |
| 6 | 10:04 | `TC-SET-014` 后置 |
| 7 | 10:09 | `TC-SET-015` 后置，同时作为收尾恢复基线；之后 `/api/health` 正常、故障注入为空、AI 替身 `normal` / `sticky=false` |

- 本组注册的商户（所有者邮箱 `run2-shopset-<序号>@demo.test`，密码 `Signup-Test-01`）：Signup Store（1）、Draft Store（2）、Shopset Store 3–9、11、12、23、32、70，都已被之后的基线重建清掉。
- 改过又改回的全局设置：账单邮箱（`TC-SET-001`，经 `PUT /merchant` 改回 owner@demo.test）、时区（`TC-SET-002`）、商户名（`TC-SET-003`）、「工单已超时 · 邮件」（`TC-SET-004`）、会话保存期限（`TC-SET-007`）都在用例结束后立即在界面改回并回读确认；Nur 的提示音偏好（`TC-SET-005`）经 `PUT /me/preferences` 改回开。Demo Store 工作时间（周一 09:00–18:00 → 00:00–23:59，`TC-MOCK-003`、`TC-SHOP-017`、`TC-SHOP-020` 前置）、付款方式、自动续费、下周期年付、开票资料、超量策略、用量提醒与用量场景由之后的基线重建恢复。AI 替身未改动；故障注入只在 `TC-CONV-032` 设过，后置已清除。
- 证据在 `docs/test-runs/`；本组没有失败与阻塞，只为 `TC-SHOP-021` 的备注留了一张截图。

## 店铺接入与授权

| 用例 | 结果 | 现象 / 证据 | 备注 |
| --- | --- | --- | --- |
| TC-SHOP-001 | 通过 | 1 guide 5 项清单；2 凭证页有 Partner ID、Partner Key 与「验证并保存」；3 「已识别为全球控制台（open.shopee.com）」「推送回调已改为 Shopilot，订阅 9 类推送」，可进入授权步骤；4 模拟授权页主账号 900100 列 Wizard Shopee MY、SG、PH；5 勾三家授权回 `/shops/connect/shopee/probe`；6 MY、SG「能收发 · 能查」，PH「不能收发」并写明 error_permission 原因，带「准备清单第 4 项」链接（`/shops/connect/shopee/guide#item-4`），三家「买家姓名地址 被平台隐藏」；7 toast「接入完成：3 家店开始接收买家消息，历史记录在后台拉取」；8 `/shops` 三家 shadow / shadow，接口 status 都是 connected，抽屉「历史回补 已完成 · 会话 1 · 订单 1」；9 新买家 shopset-S001 推送 200，4.2 秒出现在 run2-shopset-1 的待认领 | 商户 Signup Store，所有者 run2-shopset-1。`/shops`「连接」列 MY、SG 显示「正常」，PH 显示「需处理 · 聊天不可用」（接口 status connected）。第 4 步 MY 显示「已授权」：前面 `TC-SHOP-009` 在模拟授权页「以子账号授权」后，模拟平台把这家店记成了已授权（Shopilot 拒收了那次回调） |
| TC-SHOP-002 | 通过 | 勾第 1、2 项后「保存草稿」，toast「草稿已保存，下次从这里继续」；新会话重新登录打开 guide，勾选为 是、是、否、否、否；`GET /api/v1/connect/drafts/shopee` 200，`step` guide，checklist 1、2 true，3–5 false | 商户 Draft Store（run2-shopset-2） |
| TC-SHOP-003 | 通过 | 页面「已识别为全球控制台」「推送回调已改为 Shopilot」，toast「校验通过，推送回调已设置」；`PUT /platform-apps/shopee` 200：verified、region sg、callbackState set、sandboxOnly false；签名读配置：回调 `http://127.0.0.1:3360/api/webhooks/shopee/01a12d82-…9c3c`（与该商户应用 ID 一致），开启列表 1、2、3、4、10、12、28、29、30 | 商户 Shopset Store 3。页面以「全球控制台」表述 sg 区域 |
| TC-SHOP-004 | 通过 | 填 wrong-key：页面逐区域列「中国大陆：没有这个 Partner ID／全球：Partner ID 对，Key 不对／巴西…／沙箱…」，接口 422 `/errors/platform-credentials`，`extra.attempts` 为 cn、sg、br、sandbox 四项；curl auth-url 409 `/errors/not-allowed`（code app_unverified）；2001001 推送配置与前置读数完全相同 | 商户 Shopset Store 4 |
| TC-SHOP-005 | 通过 | 填 2001002：页面「这是沙箱凭证，请换成 Live」，接口 200 `sandboxOnly` true（unverified、region sandbox）；授权店铺页「这是沙箱凭证，不能授权真实店铺…」，「打开授权页」aria-disabled，强点无请求；curl auth-url 409 `/errors/not-allowed` | 商户 Shopset Store 5 |
| TC-SHOP-006 | 通过 | 1 不勾确认：接口 409 `/errors/callback-occupied`，页面展开「这个应用的推送现在发往另一个系统 · 当前回调：https://erp.example.com/shopee/push」与「改发到 Shopilot」勾选项；2 签名读配置回调仍为该地址；3 勾选后 200 verified、region cn、callbackState set，页面「已识别为中国大陆控制台」「推送回调已改为 Shopilot」；4 回调变为 `http://127.0.0.1:3360/api/webhooks/shopee/01a12d84-…e0dd`（该应用 ID） | 商户 Shopset Store 6 |
| TC-SHOP-007 | 通过 | 「已有应用，直接填」进 `/shops/connect/tiktok`，有 App Key、App Secret 与「保存并去授权」；MY 授权页列 Wizard TikTok MY；授权后到检查页（表格行 Wizard TikTok MY）；「连接新站点」选 TH 授权后检查页表格列 Wizard TikTok MY、Wizard TikTok TH 两行；选「AI 只起草、不发送」完成接入，toast「接入完成：2 家店…」，`/shops` 两家「正常」、shadow / shadow；模拟器两家坐席接单 true | 商户 Shopset Store 7。首跑第 4 步只记到检查页头部「2 家店」，未抓到表格行，另以 Shopset Store 70（run2-shopset-70）重走第 1–4 步确认表格两行都在 |
| TC-SHOP-008 | 通过 | 填 wrong-secret、站点 MY，在模拟授权页点「授权」后回到 `/shops/connect/tiktok/auth?result=error&reason=secret_or_redirect_mismatch`，提示「授权没有成功：Secret 错误或 Redirect URL 不一致」；`/shops` 0 家店 | 商户 Shopset Store 8 |
| TC-SHOP-009 | 通过 | 模拟授权页「以子账号授权」后回到 `/shops/connect/shopee/auth?result=error&reason=sub_account`，提示「授权没有成功：你用的是店铺子账号或单店授权…」；`/shops` 0 家店 | 商户 Shopset Store 9。「模拟子账号授权」是分组标题，按钮叫「以子账号授权」 |
| TC-SHOP-010 | 通过 | 前置记 Demo Shopee MY、SG 授权到期 2027-10-12；`auth-link-6min` 输出 L；打开 L 模拟授权页列 Demo Shopee MY、SG，点授权后回到 `/shops/connect/shopee/auth?result=error&reason=state_invalid`，提示「授权没有成功：授权链接已过期，请重新打开」；`/shops` 仍 4 家，接口 authExpiresAt 与前置逐字相同 | 之后手动跑 `token.refresh`，Demo Shopee MY 仍为 connected |
| TC-SHOP-011 | 通过 | 「模拟拒绝」回到 `…/auth?result=error&reason=denied`，提示「授权没有成功：你在平台授权页拒绝了授权」；打开伪造 state 的回调跳到 `…/auth?result=error&reason=state_invalid`，提示「授权没有成功：授权链接已过期，请重新打开」；`/shops` 0 家店 | 商户 Shopset Store 11 |
| TC-SHOP-012 | 通过 | 检查页「还没有授权店铺」，无店铺行，「完成接入」aria-disabled；curl complete 409 `/errors/not-allowed`（code no_authorized_shop） | 商户 Shopset Store 12 |
| TC-SHOP-013 | 通过 | 前置 `pnpm job shop.metrics` 退出 0。1 四行有平台·站点、授权至、接待模式（工作时间内 / 外）、最近入站与回复率：Shopee 行「92% 目标 ≥ 70% · 当期值」「64% 目标 ≥ 70% · 当期值」，TikTok 行「93.40% 12 个会话」「81% 12 个会话」；表头说明「回复率按平台口径分开写：Shopee 取账户健康当期值；TikTok 为所选周期内 24 小时首次响应的会话占比」；顶部是「最低平台回复率」，没有跨平台合计；2 Demo TikTok MY 抽屉能力表有收发聊天、查订单、收件人被打码、商品权限、卡片、优惠券、结束会话同步到平台，连接事件 1 条；3 平台筛 TikTok Shop 只剩 MY、TH；4 「近 30 天」请求 `period=30d` 200，Shopee 行仍注「当期值」 | TikTok 行行内只写会话数，口径句在表头说明里（Shopee 行行内写「当期值」）；按 DESIGN §19「Shopee 与 TikTok 分开写口径」判通过，若要求每行自带口径句则需裁决 |
| TC-SHOP-014 | 通过 | `shop-no-inbound-8d` 后 Demo TikTok TH 行「需处理 · 7 天零入站」，顶部「需处理 2 家店 … Demo TikTok TH 7 天没有收到买家消息」；状态筛选「需处理」列出 Demo Shopee SG 与 Demo TikTok TH | |
| TC-SHOP-015 | 通过 | 1 「检查连接」三家逐项显示店铺信息、会话列表、订单列表、推送配置，MY、SG 全部通过，PH 会话列表不通过（error_permission…no permission to use chat API）并带「去处理」；2 §3「Shopee 改回调」到 `$B/mock/erp/shopee/push`，返回 `error` 空、`result` success；3 再检查，三家「推送配置」都不通过：「推送回调指向 http://127.0.0.1:3360/mock/erp/shopee/push，Shopilot 收不到这个应用的推送。到「应用凭证」重新保存并勾选「改发到 Shopilot」。」并带「去处理」 | 用 Signup Store |
| TC-SHOP-016 | 通过 | 1 「更新应用密钥」填 wrong-key，弹层内「新的 Partner Key 没有通过校验（Key 不对），旧 Key 保留，店铺照常收发。」，`POST /platform-apps/shopee/rotate` 422 `/errors/platform-credentials`；2 新买家 shopset-S016 认领后回复「旧密钥仍可用」，模拟器买家会话收到；3 填 mock-key-2001001，toast「Shopee 应用密钥已替换，旧密钥作废」，200；4 审计「店铺与连接」有「更新 Shopee 应用 2001001 的 Partner Key（新密钥校验通过后替换）」，页面与导出 CSV 都不含两个 Key | 商户只有一个 Shopee 应用，弹层没有应用选择项。成功替换做了两次（第一次 toast 不到 3 秒就消失没抓到），审计因此有两条相同记录 |
| TC-SHOP-017 | 通过 | 前置周一 00:00–23:59，Demo TikTok MY 新买家 shopset-S017（C），owner 认领并回复。1 「取消授权」推送 webhook type 6、HTTP 200；2 `/shops` 该店「授权失效」，通知弹层「Demo TikTok MY 授权失效 · 卖家在 TikTok 取消了授权…」；3 C 头部「店铺授权已失效，暂时不能发送」，输入区换成「店铺授权已失效，管理员续期授权后才能发送。」，接口发送 409 `/errors/not-allowed`、code `shop_auth_expired`，模拟器买家视图没有这条；4 「续期授权」弹层 MY 行「续期」→ 模拟授权页授权 → 回到 `/shops`，toast「授权已续期，店铺恢复收发」，该店「正常」；5 C 发「续期后发送」，买家视图收到 | 授权失效时输入框不显示，界面上无法输入发送，第 3 步的 409 用接口发送验证 |
| TC-SHOP-018 | 通过 | 「店铺授权即将到期」站内、邮件本来都开；`auth-expiring-20d` 后 `token.refresh` 退出 0；林晓、陈卓的通知弹层各有「Demo TikTok MY 授权将在 20 天后到期」，发件箱有发往 owner@demo.test、admin2@demo.test 的 `auth_expiring` 各一封；再跑一次（退出 0）两人通知与发件箱都没有新增 | |
| TC-SHOP-019 | 通过 | 模拟器对 Demo Shopee SG「授权到期」后 authExpired true；`token.refresh` 后 `/shops` 该店「授权失效」；通知弹层「Demo Shopee SG 授权失效 · 刷新授权失败（shop_access_expired）…」 | |
| TC-SHOP-020 | 通过 | 前置周一 00:00–23:59，C = shopset-S020C（AI 草稿中），H = Mei Ling。1 抽屉「断开」，弹层不勾删除历史点「断开」，toast「已断开「Demo TikTok MY」，4 个进行中的会话已结束」，行「已断开」；2 模拟器坐席接单 false；3 已结束里有 C，H 能打开查看时间线；4 新买家 shopset-S020D 发「断开后的消息」，推送 type 13、14 均 200，五个分组与搜索都没有；5 `/shops/connect/tiktok/auth` 对 MY「重新连接」并授权，该店回到 connected，店铺 ID 不变，H 仍在，坐席接单恢复 true | 旁见：①重新连接后回到检查页、未点「完成接入」，接待模式由 assist / auto 变为 off / off，没有沿用断开前的模式；②断开（保留历史）后 `/wb` 店铺筛选下拉不再列出 Demo TikTok MY，历史会话按店铺筛不到 |
| TC-SHOP-021 | 通过 | 1 Demo Shopee SG 抽屉「断开」，弹层「打开撤销授权页」在新标签打开模拟平台「取消「Demo Store CS」的店铺授权」页；2 勾「同时删除这家店的历史会话与订单镜像」点「断开」，toast「已断开「Demo Shopee SG」，4 个进行中的会话已结束，删除 5 个会话、4 张订单」，行「已断开」；3 断开前接口按 shopId 查 SG 有会话 5、订单 4，断开后 `/wb` 已结束与 `/orders` 都没有 SG 记录，接口按 shopId 查五个分组与订单都是 0；4 TH 的 cancel-auth-url 409 `/errors/not-allowed`（code tiktok_no_cancel） | 第 3 步 `/wb`、`/orders` 的店铺筛选下拉断开后不再列出 Demo Shopee SG（只列 3 家已连接店），按字面「按店铺筛 SG」做不了，改看不筛选的列表与接口过滤；截图 `docs/test-runs/run-002-TC-SHOP-021-3.png`。与 `TC-SHOP-020` 旁见②同源，建议裁决已断开店铺是否应留在筛选项里。后置已重建基线 |
| TC-SHOP-022 | 通过 | 弹层有平台、卡在哪一步、时段、联系方式与「提交」；选 Shopee、「Shopee · 第 4 项 确认聊天权限」、「明天 10:00–12:00」、邮箱 owner@demo.test 提交：弹层关闭，toast「已提交协助预约，支持人员会按你选的时段联系你」，`POST /assist-requests` 201；审计首条「林晓 … 店铺与连接 预约远程协助：Shopee · 第 4 项 确认聊天权限，时段 明天 10:00–12:00，联系方式 邮箱」 | |
| TC-SHOP-023 | 通过 | 模拟器 Wizard Shopee MY 历史会话 N = 1（aina.zul）、订单 M = 1。1 新商户看板「近 90 天」会话段 0；2 只勾 Wizard Shopee MY、「暂不启用」接入完成（off / off）；3 抽屉「历史回补 已完成 · 会话 1 · 订单 1」；4 `/wb` 已结束按店铺筛 Wizard Shopee MY：1 个会话，处理人空（claimedBy null）、无草稿，阶段来源「自动：历史回补」；5 `/orders` 无店铺筛选，1 张订单，店铺 Wizard Shopee MY；6 看板「近 90 天」仍 0 段 | 商户 Shopset Store 23 |
| TC-SHOP-024 | 待人工 | — | 执行者 = 人工 |
| TC-SHOP-025 | 通过 | `shop-limit-full` 后 N = 5；打开授权页列 Demo Shopee MY、SG、场景补的 Demo Shopee Extra 1（均已授权）与未接入的 Demo Shopee PH；全部勾选授权后回到 `/shops/connect/shopee/auth?result=error&reason=shop_limit`，提示「授权没有成功：店铺数超过套餐上限，这次授权没有接入」，带「升级套餐」链接（`/billing/plans`）；`/shops` 仍 5 家，没有 PH | 授权页多一家场景补齐的 Extra 1，一并勾选。后置已重建基线 |

## 用量与套餐

| 用例 | 结果 | 现象 / 证据 | 备注 |
| --- | --- | --- | --- |
| TC-BILL-001 | 通过 | 先向 Demo Shopee MY（assist）、SG（shadow）、TikTok MY（工作时间外 auto）各发一条让用量非 0。1 已用 3、额度 2,000、加购 0、剩余 1,997；2 「本计费周期」按模式自动 1、辅助 1、影子 1，合计 3；3 按店表三店各 1，合计 3；4 AI 独立解决「还没有结束的会话段」、账单「近 3 个月没有账单」空态，无报错 | 基线已用 0，三项之和在全 0 时没有区分度，所以先造了 3 次出稿。堆叠图是 canvas，数值取同页「出稿来源」与接口 `daily=period`。旁见：「近 7 天」接口的 10-12 日含种子草稿 assist 2、shadow 2，而已用为 0（种子草稿早于本周期起点） |
| TC-BILL-002 | 通过 | admin2 在 `/billing/plans` 点「改为年付」，toast「只有账号所有者 林晓 能操作」，未发请求；curl 403 `/errors/owner-only` | 「改为年付」要先切到「年付 · 省 2 个月」页签才出现在当前套餐卡上 |
| TC-BILL-003 | 通过 | `plan-over-shop-limit` 后（成长版、8 家店）「降级到基础版」disabled，卡上「当前接入 8 家店，超过基础版上限 5 家，需先断开 3 家店才能降级。」；curl 降级 409 `/errors/not-allowed`（code shop_limit） | 场景首跑失败的经过见环境问题②；重建基线后一次跑通再执行。后置已重建基线 |
| TC-BILL-004 | 通过 | 点「改为年付」，确认弹层「从 2026-11-12 起改为年付，每年 USD 490.00。本期不变。」，确认后 toast「已安排在下个计费周期生效：11-12 起改为年付」；`/billing` 头部「基础版 · 月付」，套餐卡「下个周期（11-12 起）改为 年付」 | |
| TC-BILL-005 | 通过 | 「联系销售」填联系人林晓、联系方式 owner@demo.test 提交，toast「已记录，销售会按你留下的联系方式联系你」，`POST /billing/sales-leads` 201 | 两个字段已按当前用户预填 |
| TC-BILL-006 | 通过 | 前置 T0 = 0、R0 = 1,994、付款方式 Visa 4242（`TC-BILL-011` 添加）；「加购」选「1,000 次 · USD 20.00」点「支付 USD 20.00」：弹层关闭，toast「已加购 1,000 次，本期剩余 2,994 次」；刷新后加购额度 1,000、剩余 2,994；账单记录新增「出稿加购包 1,000 次 · USD 20.00 · 已支付」 | |
| TC-BILL-007 | 通过 | 「付款」→「更换」填 4000 0000 0000 0002，显示「Visa •••• 0002」；加购 1,000 次点支付：弹层内「Visa 尾号 0002 扣款没有成功，额度没有变化。请换一张卡后重试。」，接口 402 `/errors/payment-failed`；刷新后剩余仍 3,994（R0） | |
| TC-BILL-008 | 通过 | `usage-exhausted` 后 100 / 100；「修改超量策略」选继续、预算 50 保存，弹层关闭，页面「用尽后继续出稿，USD 0.04 / 次，预算 USD 50.00」；Demo Shopee MY 新买家发消息，5.7 秒内出现在 AI 草稿；刷新后「已用 101 次」「超量 1 次 · USD 0.04」 | |
| TC-BILL-009 | 通过 | curl `PUT /billing/overage {"policy":"continue"}` 422 `/errors/validation`（`extra.fields.budget`）；弹层选继续、预算留空点「保存」：没有请求，预算框 aria-invalid 并提示「选择继续出稿时要填超量预算」 | 「保存」本身可点，点后预算框标红 |
| TC-BILL-010 | 通过 | `usage-near-quota`（100 / 79）后在用量提醒弹层：阈值 80%，接收人加陈卓，打开「邮件提醒」（站内保持开），保存后弹层关闭、toast「用量提醒已保存」；Demo Shopee MY 新买家出稿后「已用 80 次」；林晓、陈卓各新增「出稿用量已到 80%」，发件箱有发往 owner@demo.test、admin2@demo.test 的 `usage_alert` 各一封；curl thresholds [49] 422 `/errors/validation`（「阈值最低 50%」） | 入口按钮叫「调整」（在「用量提醒发给」旁），不是「设置用量提醒」 |
| TC-BILL-011 | 通过 | 「付款」→「添加卡」填 4242 4242 4242 4242、12/30 保存，显示「Visa •••• 4242」；关「自动续费」后弹层「本期结束后不再扣款，订阅转为只读」，页面套餐卡「本期结束后不再扣款」；`GET /billing` 的 `paymentMethod` 只有 brand、last4、expiry（另有 mockFail），没有完整卡号；owner 提交卡号 1234 返回 422；admin2 改 autoRenew 403 `/errors/owner-only` | 基线没有付款方式，第 1 步按钮是「添加卡」而非「更换」 |
| TC-BILL-012 | 通过 | 「发票」填 Demo Store Sdn Bhd、2 Jalan Demo、billing@demo.test 保存，弹层关闭；重开显示三项；`invoiceInfo` 一致；加购 1,000 次后新账单「2026-10-12 · Demo Store Sdn Bhd」；抬头改为 Demo Store Two Sdn Bhd 保存并刷新，该账单抬头仍为 Demo Store Sdn Bhd | 公司名字段叫「发票抬头」 |

## 商户设置

| 用例 | 结果 | 现象 / 证据 | 备注 |
| --- | --- | --- | --- |
| TC-SET-001 | 通过 | 账单邮箱填 `billing@` 后保存按钮变为「账单邮箱改正后才能保存」且 disabled；curl 422 `/errors/validation`（billingEmail「邮箱格式不对」）；改为 billing@demo.test 点「保存修改」，toast「已保存」，刷新后为 billing@demo.test | 原值 owner@demo.test，用后改回 |
| TC-SET-002 | 通过 | 选 Asia/Bangkok（UTC+7）保存，toast「已保存。看板与接待时间已按新时区计算。」，字段说明「看板与接待时间按这个时区切日，保存后立即生效」；`GET /merchant` timezone Asia/Bangkok；审计（商户设置）「林晓 … 默认时区改为 Asia/Bangkok」 | 原值 Asia/Kuala_Lumpur，用后在界面改回 |
| TC-SET-003 | 通过 | 商户名改为 80 个字保存，toast「已保存」，刷新后为这 80 个字；curl 81 个字 422（「商户名最多 80 个字」）；timezone Europe/London 422；改为「临时改动」后「未保存的修改 1 项」，点「放弃修改」输入框恢复为已保存的 80 字、显示「0 项 · 表单与已保存的内容一致」 | 第 2、3 步 curl 在第 4 步之后执行（接口校验与表单状态无关）。商户名原值 Demo Store，已在界面改回并刷新确认 |
| TC-SET-004 | 通过 | 前置两项都开。`ticket-overdue`（T-1006）+ `ticket.scan`：Nur 新增「工单 T-1006 内部确认 已超时」，发件箱新增发往 agent@demo.test 的 `ticket_alert`；关「工单已超时 · 邮件」保存，toast「通知规则已保存，之后发生的事件按新规则投递」；再跑一次（T-1007）：Nur 共 2 条，发件箱仍只有 T-1006 那封 | 「工单已超时 · 邮件」用后在界面改回开 |
| TC-SET-005 | 通过 | 前置 agent2 `preferences.sound` = true（S2）。A（agent）在 `/account/security` 关「提示音」，开关变关、toast「已保存」；刷新仍关，`GET /me` 的 `sound` false；B（agent2）页面「提示音」为开，接口仍 true | Nur 的提示音之后经接口改回开 |
| TC-SET-006 | 通过 | owner 的 `/settings/security` 有「管理员必须开启两步验证」「全员必须开启两步验证」、登录有效期（8 小时 / 12 小时 / 24 小时 / 7 天）、IP 限制与白名单；没有本人设备列表（只有「我的两步验证与设备」入口），没有飞书；lead 打开显示「这个页面只对管理员开放」 | |
| TC-SET-007 | 通过 | 保存期限选「180 天」保存，toast「保存期限已更新，下次每日清理按新期限执行」；`segment-200d` 得会话 C，`/wb/<C>` 时间线显示 3 月 26 日「Old question from 200 days ago」「Old answer」；`data.retention_purge` 后刷新显示「找不到或已删除。…」；审计仍有「林晓 … 数据保存期限改为 180 天」 | 保存期限原值 1 年，用后在界面改回 |
| TC-SET-008 | 通过 | 前置：Demo Shopee MY 新买家 shopset-Del008（买家 ID 3960275206）下单并发「删除测试」，Nur 认领回复后只发聊天开出 INV-2026-000002。1 「查找并删除」弹出「删除这位买家的数据？…删除后不能恢复…」；2 确认后「已删除 Shopee 买家 3960275206：会话 1、消息 3、草稿 1、发票 1；1 张订单已去掉买家信息。」；3 搜「删除测试」与「shopset-Del008」都无结果，`/orders/invoices` 没有该发票；4 审计「林晓 … 删除一位 Shopee 买家的数据：会话 1、消息 3、草稿 1、发票 1，1 张订单去掉买家信息」；5 同一 ID 再删计数全 0，接口 200；6 `no-such-buyer`「没有找到 … 删除计数全为 0。」，接口 200 | 开票弹层要求地址必填，前置填了公司名与地址 |
| TC-SET-009 | 通过 | 点「导出」列表新增「排队中」，接口 202；立即再点，toast「已有一个导出在进行中…」，接口 409；约 5 秒后「已完成」，「10-13 09:11（24 小时内）」与「下载 ZIP」；发件箱有发往 owner@demo.test 的 `export_ready`，含下载链接；带 owner 会话打开得 ZIP，内含 conversations、messages、orders、tickets、invoices 五个 CSV | |
| TC-SET-010 | 通过 | `export-expired` 输出 L；`data.retention_purge` 后 `/settings/data` 该条「已过期」、下载列「—」；浏览器打开 L 返回 410，不下载文件，页面显示「链接已失效」「导出包已过期（24 小时有效）…」 | 第 3 步页面是 problem+json 原文，不是渲染后的提示页 |
| TC-SET-011 | 通过 | 前置 owner 建 T-1008（内部确认，Demo Shopee MY，负责人 Nur），Arif 加备注并改派 Mei Lin。审计选「工单」「Arif Rahman」「近 30 天」只列 2 条：「T-1008 改派给 Mei Lin」「T-1008 加备注」；导出 CSV 数据行同样 2 条 | 前置的建单、备注、改派走接口 |
| TC-SET-012 | 通过 | 前置 `TC-SHOP-016` 已做；Signup Store「付款」→「添加卡」填 4242 4242 4242 4242；邀请 audit.token@demo.test，记令牌 T。审计「近 7 天」全部导出 CSV，`mock-key-2001001`、`4242424242424242`、`4242 4242 4242 4242`、T 都找不到（付款记录写「付款方式改为 Visa 尾号 4242」） | 用 Signup Store（run2-shopset-1） |
| TC-SET-013 | 通过 | 转让对象选「陈卓（未开两步验证）」点「转让」→ 确认弹层「发送确认邮件」→ toast「陈卓 还没有开启两步验证。请对方先在账号安全页开启，再发起转让。」，接口 409 `/errors/not-allowed`（code two_factor_disabled）；发件箱没有 `ownership_transfer` | |
| TC-SET-014 | 通过 | 前置陈卓在 `/account/security` 开启两步验证（显示备用码）。1 转让给陈卓，toast「已向 陈卓 发出确认邮件，对方 7 天内确认后生效」，发件箱 `ownership_transfer` 链接 L1；2 再转让一次，新增 L2；3 owner 打开 L2「登录账号不是受让人」；4 陈卓在 `/login` 输密码后要求验证码，填码进 `/wb`，打开 L1「链接已失效 … 所有者之后又发起了新的转让」；5 打开 L2「确认接受」，跳到 `/settings`，「只有账号所有者（陈卓）能做」；6 林晓在 `/team` 角色管理员、无所有者标记（陈卓行带「账号所有者」），`/billing/plans`「改为年付」toast「只有账号所有者 陈卓 能操作」 | 后置已重建基线 |
| TC-SET-015 | 通过 | 1 输入「Demo Stor」点「确认删除」，提示「输入的名称与商户名「Demo Store」不一致，没有删除。」，接口 422；2 输入「Demo Store」确认，商户设置页顶部横幅「商户待删除，2026-11-11 10:05 清除全部业务数据」与「撤销删除」；3 两家 TikTok 店坐席接单 false，发件箱有发往 owner@demo.test、admin2@demo.test 的 `merchant_deletion`；4 agent2 在 `/login` 登录被拒「你的账号已被管理员停用，请联系管理员。」（接口 403 code member_disabled），登录记录有该次失败，原因 `disabled`；5 「撤销删除」后横幅消失；6 `/shops` 4 家「已断开」，`/team` 除林晓外 4 人「已停用」 | 待删除期间登录记录接口返回 403 `merchant_pending_deletion`，第 4 步的登录记录在撤销后查看。后置已重建基线 |
| TC-SET-016 | 通过 | admin2 的 `/settings`「选择管理员」「转让」「删除商户」都 disabled，悬停提示「只有账号所有者 林晓 能操作」；curl 转让给本人 membership 与删除商户都 403 `/errors/owner-only` | |

## 模拟平台与发件箱

| 用例 | 结果 | 现象 / 证据 | 备注 |
| --- | --- | --- | --- |
| TC-MOCK-001 | 通过 | 1 返回 `{"request_id","error":"error_sign","message":"Wrong sign."}`，没有 `response`；2 `get_shops_by_partner` 顶层 `request_id`、`error`（空）、`message`、`authed_shop_list`（空）、`more`；3 TikTok 返回顶层 `code` 106001、`message`、`request_id`、`data` | 起跑后第一条执行，2001001 的店都未授权 |
| TC-MOCK-003 | 通过 | 前置 §3「固定为工作时间内」。Demo TikTok MY 新买家 shopset-M003b 发「hello from sim」，推送日志 type 14、HTTP 200（另有 type 13）；owner `/wb`「AI 草稿」5.7 秒内出现该会话，时间线有原文；「认领」后发「hello from seller」，模拟器买家视图出现；下单并推进到 DELIVERED，右栏与 `/orders` 都显示「已送达」（DELIVERED） | 工作时间内 Demo TikTok MY 为 assist，会话进「AI 草稿」不进「待认领」；首个买家 shopset-M003 只盯了待认领页签，改用新买家盯 AI 草稿重测。执行脚本认领后误点了草稿卡上的发送，买家视图在「hello from seller」前多了一条 AI 草稿原文，与本用例预期无关 |
| TC-MOCK-004 | 通过 | 邀请 outbox.test@demo.test 为员工，弹层显示邀请链接；`/dev/outbox` 顶部是该邮件：收件人、2026/10/12 09:02:40、主题「林晓 邀请你加入「Demo Store」的 Shopilot」、模板 invitation；点开后点正文链接，打开 `/invite/<令牌>`，页面「加入「Demo Store」」 | |
| TC-MOCK-005 | 通过 | 打开 `$B/mock/shopee/sg/api/v2/shop/auth_partner?partner_id=9999999&timestamp=<当前>&sign=x&redirect=$B/`，页面「授权链接无效 · invalid_partner_id · Invalid partner_id, please have a check.」，没有授权按钮 | |

## 会话与工作台（依赖 `TC-SHOP-001` 的接入结果）

| 用例 | 结果 | 现象 / 证据 | 备注 |
| --- | --- | --- | --- |
| TC-CONV-002 | 通过 | 向 Wizard Shopee MY 新买家 shopset-C002 发「重放测试」，待认领出现，时间线 1 条；从 `mock_push_log` 取 URL 与原始载荷按 §3 签名连发两次，均输出 200；刷新后时间线仍 1 条（message 表该文本 1 行） | 用 Signup Store |
| TC-CONV-003 | 通过 | 载荷 `shop_id`（顶层与 content 内）改 999999、新 message_id、文本「未知店铺」，签名发出输出 200（inbound_event 记 ignored）；`/wb` 五个分组都没有，顶栏搜索「未知店铺」结果全 0 | 用 Signup Store |
| TC-CONV-032 | 通过 | 前置故障注入 Wizard Shopee MY「订单读取」持续 error，新商户只勾 MY、「暂不启用」接入。1 抽屉「历史回补 失败：Something wrong. Please try later.」，订单 0；2 B1「I want a refund」→「售后」「关键词：订单尚未同步，关键词：refund」；3 B2「where is my shipping」→「售中」「关键词：…shipping」；4 B3「hello」→「未确认」「关键词：订单尚未同步」 | 商户 Shopset Store 32。后置已清除故障（`GET /api/mock/sim/faults` 为空） |

## 环境问题

1. §3「Shopee 签名调用」「Shopee 改回调」配方用变量名 `path`，在 zsh 里会覆盖 `PATH`（zsh 把 `path` 数组与 `PATH` 绑定），之后 `openssl`、`curl` 都找不到。本组改在 bash 下执行配方；建议 §3 注明用 bash，或换个变量名。
2. 场景 `plan-over-shop-limit` 首跑在插入第 3 家店时撞了随机 shop_id（`mock_shop` 已有同号 220233），退出码 1 且已插入的 2 家留在库里；重跑不清理前一次的店，会继续累加（本组排查时又跑了两次，累计 14 家）。重建基线后一次跑通。
3. 短时间内反复用接口登录会触发 429，改为按账号缓存会话后不再出现。
