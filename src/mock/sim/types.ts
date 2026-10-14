// 模拟器读数与动作的类型（客户端与服务端共用，不含任何服务端依赖）。

export type SimPlatform = "shopee" | "tiktok";

export type SimShop = {
  platform: SimPlatform;
  shopId: string;
  name: string;
  region: string;
  currency: string;
  appKey: string;
  appName: string;
  authStatus: "authorized" | "unauthorized" | "deauthorized";
  authExpiresAt: string | null;
  /** 已授权但授权到期时间已过 */
  authExpired: boolean;
  accessExpiresAt: string | null;
  chat: boolean;
  /** TikTok 坐席接单（agents/settings can_accept_chat）；Shopee 恒为 null */
  canAcceptChat: boolean | null;
  /** Shopee：应用回调地址与已订阅 code；TikTok：本店已登记的 webhook 事件 */
  callbackUrl: string | null;
  subscribed: string[];
};

export type SimThread = {
  conversationId: string;
  platform: SimPlatform;
  shopId: string;
  buyerId: string;
  buyerName: string;
  language: string;
  unread: number;
  started: boolean;
  lastMessageAt: string;
  preview: string;
  /** TikTok 当前会话段；被 End Session 结束时 sessionOpen = false */
  sessionId: string | null;
  sessionOpen: boolean;
};

export type SimMessageKind = "text" | "image" | "order" | "product" | "coupon" | "return" | "logistics" | "other";

export type SimMessage = {
  id: string;
  sender: "buyer" | "seller" | "system" | "robot";
  kind: SimMessageKind;
  rawType: string;
  text: string | null;
  imageUrl: string | null;
  orderId: string | null;
  productName: string | null;
  couponTitle: string | null;
  createdAt: string;
};

export type SimAfterSale = {
  id: string;
  orderId: string;
  kind: "return" | "cancel";
  status: string;
  subtype: string;
  reasonText: string;
  arbitrationStatus: string | null;
  dueAt: string | null;
  dueField: string | null;
  returnTrackingNumber: string | null;
  createdAt: string;
  /** 模拟器上此刻可做的动作 */
  actions: Array<"buyer_ship_return" | "approve_return" | "buyer_wins" | "seller_wins">;
};

export type SimOrder = {
  orderId: string;
  status: string;
  currency: string;
  total: string;
  items: Array<{ name: string; skuName: string; qty: number; price: string }>;
  trackingNumber: string | null;
  carrier: string | null;
  shipByAt: string | null;
  createdAt: string;
  afterSales: SimAfterSale[];
  /** 状态链上的下一步 */
  next: string | null;
  /** 模拟器上此刻可做的动作 */
  actions: Array<"advance" | "retry_ship" | "logistics_exception" | "request_cancel" | "request_return" | "request_refund">;
};

export type SimProduct = { itemId: string; name: string; skuName: string; price: string };

export type SimPushLog = {
  id: string;
  platform: SimPlatform;
  shopId: string | null;
  event: number;
  targetUrl: string;
  httpStatus: number | null;
  error: string | null;
  summary: string;
  durationMs: number | null;
  resendOf: string | null;
  createdAt: string;
};

export type SimFault = {
  platform: SimPlatform;
  shopId: string;
  category: "send_message" | "order_read" | "after_sale_write";
  kind: "error" | "timeout";
  mode: "once" | "sticky";
  hits: number;
};

export type SimState = {
  shops: SimShop[];
  threads: SimThread[];
  messages: SimMessage[];
  orders: SimOrder[];
  products: SimProduct[];
  pushLogs: SimPushLog[];
  faults: SimFault[];
  serverTime: string;
};

export type SimActionResult = { ok: true; message: string; pushes: Array<{ id: string; httpStatus: number | null; error: string | null }> } | { ok: false; error: string };
