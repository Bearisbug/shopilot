# Shopilot 设计系统（v3 · 叠信 → 产品 UI）

Shopilot 是面向东南亚跨境电商卖家的多店铺 AI 客服 Agent SaaS（Shopee + TikTok Shop）。桌面 Web 应用 1280×800，界面中文。品牌主张未定，宣传物料暂用候选句「三十家店的消息，一个地方回。」。

## 标志与资产

标志「叠信」：一个可可色对话框在前，后面叠着两层芒果色。多家店、多个平台的对话收拢到一个地方，最前面那一条是现在要回的。

| 资产 | 用途 |
| --- | --- |
| lockup / lockup-reverse | 符号 + 字标横版组合。侧栏顶部高 24px；深色底用 -reverse |
| symbol / symbol-reverse | 单独符号。收起的侧栏、头像位、加载占位，最小 16px |
| wordmark / wordmark-reverse | 纯字标，空间只够放文字时用 |
| app-icon | 芒果瓦片 + 可可符号，用于 favicon、登录页、应用图标 |

标志外侧留白至少为符号高度的 1/4。不改色、不旋转、不拉伸、不加阴影或描边。标志不放在芒果色底上（两层芒果叠层会消失）；需要芒果色块承托时用 app-icon。

## 颜色

芒果色只做填充，上面压可可字；它在白底上只有 1.93:1，不能当文字、链接、图标或细线。链接与选中文字用焦糖色 on-primary-container。

| token | 浅色 | 深色 | 用途 |
| --- | --- | --- | --- |
| primary | #FFA748 芒果 | #FFA748 | 主按钮填充（每屏至多一个）、进度条填充（旁边必须写数值） |
| on-primary | #2F1F16 可可 | #2F1F16 | 芒果上的文字与图标（8.18:1） |
| primary-container | #FFECD8 | #4A3119 | 当前导航底、选中行底、我方消息气泡 |
| on-primary-container | #8A4F00 焦糖 | #FFC98F | 链接、当前导航文字、选中筛选与 Tab 文字、选中指示条、图表主序列（浅色白底 6.56:1，选中底 5.70:1） |
| secondary | #2F1F16 可可 | #F5EBE2 | 「AI」小标底、深色强调块 |
| on-secondary | #FFF8F1 | #2F1F16 | secondary 上的文字 |
| secondary-container | #F5EBE2 | #3A2D25 | 中性 Chip、标签底 |
| tertiary | #FFC98F 浅芒果 | #FFC98F | 标志叠层与插画；不做文字 |
| tertiary-container | #FFF3E6 | #3F2F22 | AI 草稿区、交接摘要等暖色提示块 |
| background | #FFF8F1 奶油 | #1A1310 | 页面底 |
| surface | #FFFFFF | #231A15 | 卡片、表格、面板 |
| surface-variant | #F7EEE6 | #30251E | 内嵌区、表头、买家气泡、骨架 |
| on-surface / on-background | #2F1F16 可可 | #F5EBE2 | 正文、表格（白底 15.81:1） |
| on-surface-variant | #6B5B51 | #C9B7AA | 次级文字（白底 6.48:1） |
| outline | #9A887B | #7D6A5D | 输入框、复选框等控件边框（白底 3.40:1） |
| outline-variant | #F0E2D4 | #3C2F27 | 发丝线、行分隔 |
| error | #B42318 | #FF8B7E | 错误、失败、凭据过期 |
| success | #17704A | #5FD39C | 成功、已连接、已解决 |
| warning | #7A5E00 深芥黄 | #E3C55A | 将超时、接近上限；一律带三角图标（与芒果 ΔE00 33.3、与焦糖 11.3） |

状态色只表示真实状态，以圆点、文字或条形填充出现，并配一个词；品牌色不表示状态。深色模式里表面越高越亮，芒果主按钮不变色。

## 字体

拉丁字母、数字与越南文用 Nunito（Google Fonts，含完整越南文变音）。正式产品的中文用 Resource Han Rounded CN（全站圆体，OFL），泰文用 IBM Plex Sans Thai Looped。Quilt 的字体源只能是 Google Fonts 或 https 样式表，Resource Han Rounded 目前没有 https 托管，所以 Quilt 原型里的中文由系统字体（苹方 / 微软雅黑）显示，泰文由系统泰文字体显示。

桌面正文 text-sm（14px），说明 12–13px，页面标题 text-2xl font-semibold，至多 5 个字号。数字与金额 tabular-nums。泰文、越南文消息行高不低于 1.6，避免声调符号被裁切。

## 布局

应用壳 = 左侧 240px 共享侧栏（Sidebar 组件，data-component）+ 内容区 32px 内边距，内容区自身滚动，滚动根 scrollbar-gutter: stable。收件箱三栏：会话列表 320px / 聊天流自适应 / 买家与订单侧栏 320px。设置类页面用左侧分组导航 + 右侧表单，表单最大宽 720px。数据密集页用表格与发丝线列表，不用卡片墙。4px 网格；容器圆角 rounded-lg，控件 rounded-md，头像与状态点 rounded-full。

## 组件

- 状态徽标：接待状态 bot / 待认领 / 人工 / 已结束，文字 + 小圆点，颜色只作辅助。
- 模式开关：off / shadow / assist / auto 分段控件，工作时间内外各一组。
- 平台徽标：带边框的文字徽标「Shopee」「TikTok」+ 站点代码（MY/TH/VN/PH/SG/ID），不引入平台 logo 图片，不用平台品牌色。
- 消息气泡：买家靠左 surface-variant；我方靠右 primary-container；AI 生成的带「AI」小标（bg-secondary text-on-secondary）；AI 草稿区 tertiary-container 底，主按钮「发送」是芒果；系统消息居中一行 on-surface-variant；附件卡片化；译文小字在原文下。
- 会话列表选中行：primary-container 底 + 左侧 border-l-4 焦糖指示条（on-primary-container）。芒果指示条对选中底不到 3:1，看不出选中。
- 表格：表头 text-sm on-surface-variant，行高 48px，发丝线分隔。
- 空态：一个 w-8 h-8 图标、一句说明、一个下一步按钮；加载态：surface-variant 骨架；错误态：写明发生了什么、影响哪一项、下一步动作。

## 禁止

渐变、发光、玻璃、大阴影、卡片套卡片、过度居中、lorem ipsum、夸张假数据、平台 logo 图片、把品牌色当状态色、芒果色做文字或细线、把标志放在芒果色底上、用文字或字母方块代替标志资产。

## 约定
- 界面语言中文；平台名、站点代码、状态枚举、字段名保持英文（Shopee、TikTok Shop、MY/TH/VN/PH/SG/ID、bot/awaiting_human/human/closed）。
- 芒果 primary 只做填充：每屏至多一个主按钮（bg-primary text-on-primary）、进度条填充（旁边写数值）。不用 text-primary、border-primary、ring-primary 做文字、链接、图标或细线（白底只有 1.93:1）。
- 按钮覆盖配方：主按钮与次按钮都用 h-9 px-4 rounded-md font-medium，不用胶囊；次按钮 bg-surface border border-outline text-on-surface，不用配方里的 text-primary；文字链接用 text-on-primary-container。
- 链接、当前导航项文字、选中筛选与 Tab 文字、选中指示条、图表主序列用 on-primary-container（焦糖 #8A4F00）；当前导航与选中行的底用 primary-container。
- 正文与表格一律 on-surface（可可）；次级文字 on-surface-variant；页面底 background（奶油），卡片、表格、面板 surface（白）。
- AI 生成内容带「AI」小标（bg-secondary text-on-secondary）；AI 草稿区用 tertiary-container 底。
- 品牌色不是状态色：错误、成功、警告只用 error / success / warning，并配文字或图标；warning 一律带三角图标。
- 无渐变、无发光、无玻璃、无投影；卡片只在需要分组时使用，数据密集内容用表格或带发丝线（outline-variant）的列表。
- 侧栏顶部放资产 lockup（高 24px），深色底用 lockup-reverse；收起侧栏用 symbol；不用文字排 Shopilot，不用字母方块代替标志。标志不放在芒果色底上，需要芒果色块承托时用 app-icon。
- 每屏至少呈现一种非理想态：空态给说明与下一步、加载态用 surface-variant 骨架、错误态写明发生了什么与下一步。
- 侧栏与导航容器可滚但不露滚动条；内容滚动区 scrollbar-gutter: stable；滚动条颜色走 token。
- 数字 tabular-nums；金额带币种（MYR/THB/VND/PHP/SGD/IDR）；时间用相对时间或带站点时区。
- 买家气泡靠左 surface-variant，我方靠右 primary-container，系统消息居中一行 on-surface-variant；附件卡片化，译文小字在原文下。
- 会话列表选中行用 bg-primary-container 加 border-l-4 border-on-primary-container 指示条。
- 转人工、达人只读会话、发送受限、凭据过期等状态用文字徽标 + 一句原因，不只用颜色。
- 表单控件必须有可见 label；输入框、选择框边框用 border-outline（覆盖配方里的 outline-variant）；每屏主按钮不超过一个；破坏性操作用次级样式并需确认。
- 平台用带边框的文字徽标（Shopee / TikTok + 站点代码），不引入平台 logo 图片，不用平台品牌色。
- 泰文、越南文消息行高不低于 1.6，避免声调符号被裁切；正文不截断，单行控件可截断。
- focus-visible 用 2px outline（on-primary-container 色）偏移 2px；禁用态用 aria-disabled 并就地说明原因。
- 演示数据要像真实东南亚店铺：买家用马来/泰/越/英文提问，订单号、金额与币种真实形态，不用夸张假数字。
