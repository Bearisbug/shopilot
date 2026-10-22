/**
 * 官网文案（REQ-SITE-001）。中文是来源，英文按同一结构翻译，类型保证两边字段一致。
 * 插图是概念动效：线框卡片、灰色文字条和图标，不画真实界面、不读任何商户数据；不写客户名称与生产数字（用户 10-22 定）。
 */

export type Locale = "zh" | "en";

export const SITE_URL = "https://shopilot.live";
export const LOCALE_PATH: Record<Locale, string> = { zh: "/", en: "/en" };

const zh = {
  htmlLang: "zh-CN",
  meta: {
    title: "Shopilot — Shopee 与 TikTok Shop 多店铺客服工作台",
    description: "把 Shopee 与 TikTok Shop 多店铺、多站点的买家会话汇到一个工作台：AI 按店铺设置起草回复，客服把关后发出，订单、售后、开票和工单在会话里处理。",
    ogLocale: "zh_CN",
  },
  nav: {
    label: "页面导航",
    features: "功能",
    modes: "接待档位",
    orders: "订单售后",
    knowledge: "知识库",
    security: "团队与安全",
    login: "登录",
    languages: "切换语言",
  },
  hero: {
    kicker: "Shopee · TikTok Shop 多店铺客服工作台",
    title: ["所有店铺的买家消息，", "一个工作台全部接住"],
    titleMark: "一个工作台",
    lead: "Shopilot 把 Shopee 与 TikTok Shop 多店铺、多站点的买家会话汇到一处。AI 按店铺设置先写草稿，客服确认后发出；查订单、处理退款、开票、建工单都不用离开会话。",
    login: "登录工作台",
    tour: "看看能做什么",
  },
  story: {
    label: "一条买家消息的处理过程",
    steps: ["每家店的新消息，汇进同一个列表", "买家写马来语，你读到的是中文", "AI 先写好草稿，标出依据", "你确认一眼，点发送"],
  },
  statement:
    "两个平台、六个站点、每一家店的买家消息，都汇到一个工作台。AI 按每家店的档位写草稿或直接回复，客服只做判断。查订单、退款、开票、建工单，都在会话里完成。",
  platforms: {
    title: "接入的平台与站点",
    names: ["Shopee", "TikTok Shop"],
    markets: [
      ["MY", "马来西亚"],
      ["TH", "泰国"],
      ["VN", "越南"],
      ["PH", "菲律宾"],
      ["SG", "新加坡"],
      ["ID", "印度尼西亚"],
    ],
    note: "商户用自己在 Shopee、TikTok Shop 开发者平台创建的应用接入，消息、订单和售后都经平台开放接口收发。",
  },
  features: {
    title: "客服一天要做的事，都在这一页",
    lead: "不用在几个卖家后台之间来回切换。会话、订单、翻译和提醒，都围着同一位买家展开。",
    inbox: {
      title: "所有店铺排在一个列表里",
      body: "Shopee 与 TikTok Shop 各店铺、各站点的会话汇在一处，可按平台和店铺筛选。待认领的会话按买家等待时间排在最前，认领、转交、结束都在这里完成。",
    },
    draft: {
      title: "AI 先起草，人来把关",
      body: "AI 用买家的语言写好草稿，并写明依据的是哪条问答或哪份资料。客服原样发送、改后发送或忽略；买家要求真人、命中关键词或 AI 没把握时，会话转给人工。",
      handoffLabel: "这些情况转给人工",
      handoffChips: ["买家要求真人", "命中转人工关键词", "AI 没把握"],
    },
    translate: {
      title: "小语种自动翻译",
      body: "马来语、泰语、越南语等买家消息附中文译文。客服用中文写，发送前译成买家的语言。",
    },
    feishu: {
      title: "在飞书里认领",
      body: "会话等人认领时，推一张卡片到飞书群，附 AI 一句话总结，点「认领」直接进入会话。",
    },
    media: {
      title: "图片、视频和商品卡都能发",
      body: "发图片与视频、商品卡、订单卡与物流卡，TikTok 店铺还能发优惠券；常用回复按语言存成快捷回复。",
    },
  },
  modes: {
    title: "AI 接待按店铺逐档放开",
    lead: "每家店铺分别设置工作时间内和工作时间外用哪一档。先让 AI 在后台写，确认写得对，再交给它更多。",
    aiLabel: "AI",
    agentLabel: "客服",
    accept: "采纳",
    tiers: [
      { key: "off", name: "关闭", ai: "AI 不参与", agent: "客服全部手动回复", sampleLabel: "客服 · 已发送" },
      { key: "shadow", name: "影子", ai: "AI 在后台写回复，不发给买家", agent: "管理员和组长对比 AI 与客服的回复", sampleLabel: "AI 影子回复 · 未发送" },
      { key: "assist", name: "辅助", ai: "AI 写好草稿", agent: "客服采纳或修改后发出", sampleLabel: "AI 草稿 · 待采纳" },
      { key: "auto", name: "自动", ai: "AI 直接回复买家", agent: "遇到转人工条件时交回客服", sampleLabel: "AI · 已发送" },
    ],
    note: "自动档目前只对 TikTok Shop 店铺开放。Shopee 平台规则不允许聊天机器人自动回复，Shopee 店铺最高用到辅助档。",
  },
  orders: {
    title: "订单、售后和工单，不用切回卖家后台",
    lead: "会话右侧就是这位买家的订单。要做的处理在会话里点完，平台给的截止时间一直显示在旁边。",
    items: {
      order: { title: "订单与物流", body: "看到买家在这家店的订单、商品和物流进度，订单卡、物流卡一键发进聊天。" },
      refund: { title: "取消与退货退款", body: "同意或拒绝取消申请、退货退款申请，页面上显示平台给的处理截止时间。" },
      invoice: { title: "开票", body: "从订单生成 Invoice 或 Receipt，直接发到聊天里。" },
      ticket: { title: "工单", body: "平台售后自动建成工单，也可以手动建；到期前提醒，能转发到飞书群。" },
    },
  },
  knowledge: {
    title: "老客服的处理方法，写下来给 AI 用",
    lead: "知识库不只是一堆文件。问答、产品清单和经验卡告诉 AI 该怎么回，也告诉它什么时候该停下来交给人。",
    items: {
      qa: { title: "问答", body: "管理员和组长手写问答，保存即生效；上传的资料可以交给 AI 整理成问答候选，审核后发布。" },
      products: { title: "产品清单", body: "物料编码对应到各平台的卖家 SKU，AI 能认出买家问的是哪件商品。" },
      cards: { title: "经验卡", body: "写下一类问题的处理步骤和分支：哪一步查订单、什么情况转人工、什么情况建工单。AI 出稿时按卡一步步走。" },
      learn: { title: "会话学习", body: "客服把处理得好的会话提交学习，AI 据此起草新的经验卡，测试并审核通过后启用。" },
    },
    card: {
      label: "经验卡",
      title: "买家催发货",
      scope: "售中 · 全部店铺",
      steps: [
        { text: "查订单状态", branch: "" },
        { text: "已发货", branch: "发物流卡，告知预计送达" },
        { text: "超过 3 天未发货", branch: "建工单「催发货」" },
        { text: "买家情绪激动", branch: "转人工" },
      ],
    },
  },
  security: {
    title: "谁能看什么、做过什么，都有记录",
    lead: "权限跟着角色和负责店铺走，每个操作都留痕。",
    items: {
      roles: { title: "三种角色", body: "管理员、组长、员工，权限在服务端检查，界面只显示各自能用的功能。" },
      shops: { title: "按店铺分配", body: "组长和员工只看到自己负责的店铺和会话。" },
      twoFactor: { title: "两步验证", body: "成员可以开启两步验证，商户可以要求全员开启；登录记录可查、可导出。" },
      audit: { title: "审计日志", body: "认领、转交、发送、改设置，谁在什么时间做的都能查到。" },
      dashboard: { title: "看板", body: "人工首响时间、12 小时回复率、转人工原因，以及 AI 草稿与人工回复的一致率。" },
      retention: { title: "数据保存与删除", body: "可按买家删除数据，会话按商户设置的保存期限自动清理，数据可以导出。" },
    },
  },
  closing: {
    title: "所有店铺的买家，在一个地方照顾好",
    lead: "Shopilot 接入 Shopee 与 TikTok Shop，覆盖马来西亚、泰国、越南、菲律宾、新加坡、印度尼西亚站点。",
    login: "已有账号？登录工作台",
  },
  concept: {
    hero: "示意动画：各店铺的买家消息汇进一个会话列表，AI 写好带依据的草稿、附上译文，客服确认后发出",
    inbox: "示意动画：会话按买家等待时间重新排序，等得最久的排到最前并被认领",
    draft: "示意动画：问答、资料和经验卡汇入 AI，AI 写出标明依据的草稿",
    translate: "示意动画：买家消息附上译文，客服的回复发送前译成买家的语言",
    feishu: "示意动画：飞书群收到待认领卡片，点认领后会话出现在工作台",
    media: "示意动画：图片、视频、商品卡和优惠券依次发进聊天",
    orders: "示意动画：订单从下单、发货到申请退货、同意退款，再自动建成工单，截止时间在旁边倒数",
    knowledge: "示意动画：经验卡先查订单状态，再按三种情况分别发物流卡、建工单或转人工",
    orderSteps: ["下单", "发货", "申请退货", "同意退款", "建成工单"],
    deadline: "处理截止",
    pause: "暂停动画",
    play: "播放动画",
  },
  footer: {
    tagline: "Shopee 与 TikTok Shop 多店铺客服工作台",
    copyright: "© 2026 Shopilot",
  },
};

export type SiteCopy = typeof zh;

const en: SiteCopy = {
  htmlLang: "en",
  meta: {
    title: "Shopilot — Customer service workbench for Shopee & TikTok Shop sellers",
    description: "Bring buyer chats from all your Shopee and TikTok Shop stores and markets into one workbench: AI drafts under each shop's settings, agents review and send, and orders, returns, invoices and tickets are handled inside the chat.",
    ogLocale: "en_US",
  },
  nav: {
    label: "Page navigation",
    features: "Features",
    modes: "AI modes",
    orders: "Orders",
    knowledge: "Knowledge",
    security: "Security",
    login: "Sign in",
    languages: "Change language",
  },
  hero: {
    kicker: "Customer service workbench for Shopee & TikTok Shop sellers",
    title: ["Every buyer, every shop.", "One workbench."],
    titleMark: "One workbench.",
    lead: "Shopilot brings buyer chats from all your Shopee and TikTok Shop stores and markets into one inbox. AI drafts replies under each shop's settings, agents review and send, and orders, refunds, invoices and tickets are handled without leaving the chat.",
    login: "Sign in to the workbench",
    tour: "See what it does",
  },
  story: {
    label: "How one buyer message gets handled",
    steps: ["Every shop's new messages, in one list", "They write in Malay. You read the translation.", "AI drafts the reply and shows its source", "You take a look and hit send"],
  },
  statement:
    "Two platforms. Six markets. Every buyer from every shop, in one workbench. AI drafts or replies under each shop's mode, and your agents make the calls. Orders, refunds, invoices and tickets all get handled right in the chat.",
  platforms: {
    title: "Platforms and markets",
    names: ["Shopee", "TikTok Shop"],
    markets: [
      ["MY", "Malaysia"],
      ["TH", "Thailand"],
      ["VN", "Vietnam"],
      ["PH", "Philippines"],
      ["SG", "Singapore"],
      ["ID", "Indonesia"],
    ],
    note: "Merchants connect with their own apps created on the Shopee and TikTok Shop developer platforms; messages, orders and after-sales go through the platforms' open APIs.",
  },
  features: {
    title: "Everything your agents do, on one screen",
    lead: "No more hopping between seller centers. Chats, orders, translations and alerts all revolve around the same buyer.",
    inbox: {
      title: "Every shop in one list",
      body: "Chats from all your Shopee and TikTok Shop stores and markets land in one inbox, filterable by platform and shop. Unclaimed chats are sorted by how long the buyer has waited; claim, transfer and close from right here.",
    },
    draft: {
      title: "AI drafts, people decide",
      body: "AI writes in the buyer's language and shows which Q&A or document it relied on. Agents send it as is, edit it first, or dismiss it. When a buyer asks for a person, a keyword matches, or the AI isn't sure, the chat goes to an agent.",
      handoffLabel: "Handed to an agent when",
      handoffChips: ["The buyer asks for a person", "A handoff keyword matches", "The AI isn't sure"],
    },
    translate: {
      title: "Built-in translation",
      body: "Messages in Malay, Thai, Vietnamese and more come with a translation. Agents write in their own language, and replies are translated before sending.",
    },
    feishu: {
      title: "Claim from Feishu",
      body: "When a chat is waiting, a card with a one-line AI summary goes to your Feishu group. Tap Claim to jump straight into the chat.",
    },
    media: {
      title: "Send media and product cards",
      body: "Send images and videos, product, order and shipping cards, plus vouchers on TikTok Shop. Save common replies in each language.",
    },
  },
  modes: {
    title: "Hand over to AI one step at a time, shop by shop",
    lead: "Each shop picks a mode for inside and outside working hours. Let AI write in the background first, check that it gets things right, then give it more.",
    aiLabel: "AI",
    agentLabel: "Agent",
    accept: "Accept",
    tiers: [
      { key: "off", name: "Off", ai: "AI stays out", agent: "Agents reply to everything", sampleLabel: "Agent · Sent" },
      { key: "shadow", name: "Shadow", ai: "AI writes replies but never sends them", agent: "Admins and leads compare AI and agent replies", sampleLabel: "AI shadow reply · Not sent" },
      { key: "assist", name: "Assist", ai: "AI prepares a draft", agent: "Agents accept or edit it, then send", sampleLabel: "AI draft · Waiting" },
      { key: "auto", name: "Auto", ai: "AI replies to the buyer", agent: "An agent takes over when a handoff rule fires", sampleLabel: "AI · Sent" },
    ],
    note: "Auto is currently available for TikTok Shop shops only. Shopee's platform rules don't allow chatbot replies, so Shopee shops go up to Assist.",
  },
  orders: {
    title: "Orders, returns and tickets, right beside the chat",
    lead: "The buyer's orders sit right next to the chat. Take action in place, with the platform's deadlines always in view.",
    items: {
      order: { title: "Orders & shipping", body: "See the buyer's orders, items and shipping progress in this shop, and drop order or shipping cards into the chat." },
      refund: { title: "Cancellations & returns", body: "Approve or reject cancellation and return or refund requests, with the platform's deadline on screen." },
      invoice: { title: "Invoices", body: "Generate an invoice or receipt from the order and send it in the chat." },
      ticket: { title: "Tickets", body: "Platform after-sales cases become tickets automatically, or create one by hand. Reminders before they're due, and forwarding to Feishu groups." },
    },
  },
  knowledge: {
    title: "Write down how your best agents work, and let AI follow it",
    lead: "More than a pile of files: Q&As, a product list and playbook cards tell AI how to answer, and when to stop and hand over.",
    items: {
      qa: { title: "Q&A", body: "Admins and leads write Q&As that go live on save. Uploaded documents can be turned into Q&A candidates by AI and published after review." },
      products: { title: "Product list", body: "Map your item codes to each platform's seller SKU, so AI knows which product the buyer is asking about." },
      cards: { title: "Playbook cards", body: "Write the steps and branches for a type of question: when to check the order, when to hand off, when to open a ticket. AI follows the card step by step." },
      learn: { title: "Learning from chats", body: "Agents submit chats they handled well; AI drafts new playbook cards from them, which go live after testing and review." },
    },
    card: {
      label: "Playbook card",
      title: "Buyer chasing shipment",
      scope: "In order · All shops",
      steps: [
        { text: "Check the order status", branch: "" },
        { text: "Already shipped", branch: "Send the shipping card and expected delivery" },
        { text: "Not shipped after 3 days", branch: "Open a “Chase shipment” ticket" },
        { text: "Buyer is upset", branch: "Hand off to an agent" },
      ],
    },
  },
  security: {
    title: "Who sees what, and who did what, all on record",
    lead: "Permissions follow roles and assigned shops, and every action leaves a trail.",
    items: {
      roles: { title: "Three roles", body: "Admin, lead and agent. Permissions are checked on the server, and each person only sees what they can use." },
      shops: { title: "Shop assignment", body: "Leads and agents only see the shops and chats assigned to them." },
      twoFactor: { title: "Two-step verification", body: "Members can turn on two-step verification and the merchant can require it. Sign-in history can be reviewed and exported." },
      audit: { title: "Audit log", body: "Claims, transfers, sends and settings changes: see who did what, and when." },
      dashboard: { title: "Dashboard", body: "Agent first-response time, 12-hour response rate, handoff reasons, and how closely AI drafts match agent replies." },
      retention: { title: "Retention & deletion", body: "Delete a buyer's data on request; chats are cleared automatically after your retention period, and data can be exported." },
    },
  },
  closing: {
    title: "Take care of every shop's buyers, from one place",
    lead: "Shopilot works with Shopee and TikTok Shop in Malaysia, Thailand, Vietnam, the Philippines, Singapore and Indonesia.",
    login: "Already have an account? Sign in",
  },
  concept: {
    hero: "Animation: buyer messages from every shop flow into one chat list, AI writes a draft with its sources and a translation, and an agent confirms and sends it",
    inbox: "Animation: chats re-sort by how long the buyer has waited, and the longest wait moves to the top and gets claimed",
    draft: "Animation: Q&As, documents and playbook cards feed the AI, which writes a draft that cites its source",
    translate: "Animation: the buyer's message gets a translation, and the agent's reply is translated into the buyer's language before sending",
    feishu: "Animation: a Feishu group receives a card for a waiting chat, and tapping Claim opens the chat in the workbench",
    media: "Animation: an image, a video, a product card and a voucher are sent into the chat one after another",
    orders: "Animation: an order goes from placed and shipped to a return request and an approved refund, then becomes a ticket, with the deadline counting down alongside",
    knowledge: "Animation: a playbook card checks the order status first, then sends a shipping card, opens a ticket or hands off, depending on the case",
    orderSteps: ["Order placed", "Shipped", "Return requested", "Refund approved", "Ticket created"],
    deadline: "Deadline",
    pause: "Pause animations",
    play: "Play animations",
  },
  footer: {
    tagline: "Customer service workbench for Shopee & TikTok Shop sellers",
    copyright: "© 2026 Shopilot",
  },
};

export const SITE_COPY: Record<Locale, SiteCopy> = { zh, en };
