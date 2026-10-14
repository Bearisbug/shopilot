// 模拟平台种子常量。全部是假值，可以写进代码；Shopilot 的种子脚本（scripts/）读这里的应用与店铺凭证建自己的记录。
import type { MockPlatform } from "./db/schema";

/** Shopee access_token 4 小时、refresh_token 30 天；TikTok access_token 7 天。授权 365 天。 */
export const SHOPEE_ACCESS_TTL_SEC = 4 * 3600;
export const SHOPEE_REFRESH_TTL_SEC = 30 * 86400;
export const TIKTOK_ACCESS_TTL_SEC = 7 * 86400;
export const AUTH_TTL_SEC = 365 * 86400;
/** 授权码有效期：Shopee 10 分钟、TikTok 30 分钟 */
export const SHOPEE_CODE_TTL_SEC = 600;
export const TIKTOK_CODE_TTL_SEC = 1800;
/** 卖家处理时限：TikTok 售后 48 小时；Shopee 退货待处理 3 天、买家寄回 7 天、举证 3 天、发货 2 天 */
export const TIKTOK_SELLER_RESPOND_SEC = 48 * 3600;
export const SHOPEE_RETURN_DUE_SEC = 3 * 86400;
export const SHOPEE_RETURN_SHIP_DUE_SEC = 7 * 86400;
export const SHOPEE_EVIDENCE_DUE_SEC = 3 * 86400;
export const SHOPEE_DAYS_TO_SHIP = 2;

export type FixtureApp = {
  platform: MockPlatform;
  appKey: string;
  secret: string;
  pushKey?: string;
  /** Shopee 区域 cn / sg / br / sandbox；TikTok 为 global */
  region: string;
  name: string;
  /** Shopee 主账号 */
  mainAccountId?: string;
  /** Shopee 回调初始值（不经 seedMock 的 callbacks 参数） */
  callbackUrl?: string;
  /** TikTok 登记的 redirect_url（相对 APP_BASE_URL） */
  redirectPath?: string;
  /** 是否属于已接入的 Demo Store / Other Store（seedMock 按 callbacks 预配回调） */
  demo: boolean;
};

const TIKTOK_REDIRECT_PATH = "/api/v1/oauth/tiktok/callback";

export const DEMO_SHOPEE_APP: FixtureApp = { platform: "shopee", appKey: "1000101", secret: "mock-key-1000101", region: "sg", name: "Demo Store CS", mainAccountId: "900001", demo: true };
export const DEMO_TIKTOK_APP: FixtureApp = { platform: "tiktok", appKey: "mockttdemo01", secret: "mock-secret-demo01", region: "global", name: "Demo Store CS", redirectPath: TIKTOK_REDIRECT_PATH, demo: true };
export const OTHER_TIKTOK_APP: FixtureApp = { platform: "tiktok", appKey: "mockttother01", secret: "mock-secret-other01", region: "global", name: "Other Store CS", redirectPath: TIKTOK_REDIRECT_PATH, demo: true };
export const WIZARD_SHOPEE_APP: FixtureApp = { platform: "shopee", appKey: "2001001", secret: "mock-key-2001001", region: "sg", name: "Wizard Seller App", mainAccountId: "900100", demo: false };
export const WIZARD_SHOPEE_SANDBOX_APP: FixtureApp = { platform: "shopee", appKey: "2001002", secret: "mock-key-2001002", region: "sandbox", name: "Wizard Sandbox App", mainAccountId: "900200", demo: false };
export const WIZARD_SHOPEE_CN_APP: FixtureApp = { platform: "shopee", appKey: "2001003", secret: "mock-key-2001003", region: "cn", name: "Wizard CNSC App", mainAccountId: "900300", callbackUrl: "https://erp.example.com/shopee/push", demo: false };
export const WIZARD_TIKTOK_APP: FixtureApp = { platform: "tiktok", appKey: "mockttwiz01", secret: "mock-secret-wiz01", region: "global", name: "Wizard TikTok App", redirectPath: TIKTOK_REDIRECT_PATH, demo: false };

export const MOCK_APPS: FixtureApp[] = [DEMO_SHOPEE_APP, DEMO_TIKTOK_APP, OTHER_TIKTOK_APP, WIZARD_SHOPEE_APP, WIZARD_SHOPEE_SANDBOX_APP, WIZARD_SHOPEE_CN_APP, WIZARD_TIKTOK_APP];

/** Demo 应用预配回调时订阅的 Shopee 推送 code 与 TikTok webhook 类型 */
export const SHOPEE_DEMO_PUSH_CODES = [10, 3, 4, 29, 30, 1, 2, 12, 28];
export const TIKTOK_DEMO_WEBHOOK_TYPES = [1, 6, 7, 11, 12, 13, 14];

/** TikTok webhook 类型编号与 event_type 名称 */
export const TIKTOK_EVENT_TYPES: Record<number, string> = {
  1: "ORDER_STATUS_CHANGE",
  2: "RECIPIENT_ADDRESS_UPDATE",
  3: "PACKAGE_UPDATE",
  5: "PRODUCT_STATUS_CHANGE",
  6: "SELLER_DEAUTHORIZATION",
  7: "UPCOMING_AUTHORIZATION_EXPIRATION",
  11: "CANCELLATION_STATUS_CHANGE",
  12: "RETURN_STATUS_CHANGE",
  13: "NEW_CONVERSATION",
  14: "NEW_MESSAGE",
};

export type FixtureShop = {
  platform: MockPlatform;
  shopId: string;
  appKey: string;
  name: string;
  region: string;
  currency: string;
  cipher?: string;
  shopCode?: string;
  mainAccountId?: string;
  sellerOpenId?: string;
  sellerName?: string;
  /** 已授权（Demo / Other Store）时的确定 token */
  authorized: boolean;
  accessToken?: string;
  refreshToken?: string;
  chat: boolean;
  performance: Record<string, number>;
};

const shopeeDemo = (shopId: string, name: string, region: string, currency: string, performance: Record<string, number>): FixtureShop => ({
  platform: "shopee", shopId, appKey: DEMO_SHOPEE_APP.appKey, name, region, currency, mainAccountId: "900001",
  authorized: true, accessToken: `mock-at-${shopId}`, refreshToken: `mock-rt-${shopId}`, chat: true, performance,
});

const tiktokShop = (app: FixtureApp, shopId: string, name: string, region: string, currency: string, cipher: string, shopCode: string, sellerName: string, authorized: boolean, performance: Record<string, number>): FixtureShop => ({
  platform: "tiktok", shopId, appKey: app.appKey, name, region, currency, cipher, shopCode,
  sellerOpenId: `open-${shopId}`, sellerName, authorized,
  accessToken: authorized ? `mock-at-${shopId}` : undefined, refreshToken: authorized ? `mock-rt-${shopId}` : undefined,
  chat: true, performance,
});

const wizardShopee = (app: FixtureApp, shopId: string, name: string, region: string, currency: string, chat = true): FixtureShop => ({
  platform: "shopee", shopId, appKey: app.appKey, name, region, currency, mainAccountId: app.mainAccountId, authorized: false, chat,
  performance: { response_rate: 88, response_time: 0.4 },
});

export const MOCK_SHOPS: FixtureShop[] = [
  shopeeDemo("220001", "Demo Shopee MY", "MY", "MYR", { response_rate: 92, response_time: 0.3 }),
  shopeeDemo("220002", "Demo Shopee SG", "SG", "SGD", { response_rate: 64, response_time: 1.2 }),
  tiktokShop(DEMO_TIKTOK_APP, "7000001", "Demo TikTok MY", "MY", "MYR", "ROW_demo_my", "MYLCDEMO01", "Demo Store", true, { response_percentage: 93.4, response_time_mins: 3.4, satisfaction_percentage: 95.2 }),
  tiktokShop(DEMO_TIKTOK_APP, "7000002", "Demo TikTok TH", "TH", "THB", "ROW_demo_th", "THLCDEMO02", "Demo Store", true, { response_percentage: 81.0, response_time_mins: 7.9, satisfaction_percentage: 90.1 }),
  tiktokShop(OTHER_TIKTOK_APP, "7000003", "Other TikTok VN", "VN", "VND", "ROW_other_vn", "VNLCOTHER1", "Other Store", true, { response_percentage: 88.5, response_time_mins: 5.0, satisfaction_percentage: 92.0 }),
  wizardShopee(WIZARD_SHOPEE_APP, "230001", "Wizard Shopee MY", "MY", "MYR"),
  wizardShopee(WIZARD_SHOPEE_APP, "230002", "Wizard Shopee SG", "SG", "SGD"),
  wizardShopee(WIZARD_SHOPEE_APP, "230003", "Wizard Shopee PH", "PH", "PHP", false),
  wizardShopee(WIZARD_SHOPEE_CN_APP, "230010", "Wizard Shopee CN", "MY", "MYR"),
  tiktokShop(WIZARD_TIKTOK_APP, "7100001", "Wizard TikTok MY", "MY", "MYR", "ROW_wiz_my", "MYLCWIZ001", "Wizard Seller", false, { response_percentage: 90, response_time_mins: 4.1, satisfaction_percentage: 93 }),
  tiktokShop(WIZARD_TIKTOK_APP, "7100002", "Wizard TikTok TH", "TH", "THB", "ROW_wiz_th", "THLCWIZ002", "Wizard Seller", false, { response_percentage: 86, response_time_mins: 6.0, satisfaction_percentage: 91 }),
];

/** Shopilot 种子脚本用：已授权店铺与其确定 token（到期时间由 seedMock 按 now 计算，同 TTL 常量）。 */
export const DEMO_AUTHORIZED_SHOPS = MOCK_SHOPS.filter((s) => s.authorized);

export type FixtureProduct = { itemId: string; skuId: string; name: string; skuName: string; price: string; originalPrice: string };

/** 每店商品目录：模拟器下单、发商品卡从这里选。价格为店铺币种。 */
export const MOCK_PRODUCTS: Record<string, FixtureProduct[]> = {
  "shopee:220001": [
    { itemId: "24580011001", skuId: "214500110011", name: "Bamboo Fibre Bath Towel Set (3 pcs)", skuName: "Sage Green", price: "45.90", originalPrice: "59.00" },
    { itemId: "24580011002", skuId: "214500110021", name: "Stainless Steel Vacuum Tumbler 900ml", skuName: "Matte Black", price: "38.50", originalPrice: "49.90" },
    { itemId: "24580011003", skuId: "214500110031", name: "Silicone Kitchen Utensil Set (6 pcs)", skuName: "Grey", price: "29.90", originalPrice: "35.00" },
    { itemId: "24580011004", skuId: "214500110041", name: "Linen Cushion Cover 45x45cm", skuName: "Oatmeal", price: "19.90", originalPrice: "25.90" },
  ],
  "shopee:220002": [
    { itemId: "24580022001", skuId: "214500220011", name: "Bamboo Fibre Bath Towel Set (3 pcs)", skuName: "Ivory", price: "18.90", originalPrice: "24.00" },
    { itemId: "24580022002", skuId: "214500220021", name: "Stainless Steel Vacuum Tumbler 900ml", skuName: "Ocean Blue", price: "15.50", originalPrice: "19.90" },
    { itemId: "24580022003", skuId: "214500220031", name: "Ceramic Pour-Over Coffee Set", skuName: "White", price: "32.00", originalPrice: "39.00" },
  ],
  "tiktok:7000001": [
    { itemId: "1729582718312380101", skuId: "1729582718312480101", name: "Bamboo Fibre Bath Towel Set (3 pcs)", skuName: "Sage Green", price: "42.90", originalPrice: "59.00" },
    { itemId: "1729582718312380102", skuId: "1729582718312480102", name: "Stainless Steel Vacuum Tumbler 900ml", skuName: "Pink", price: "36.00", originalPrice: "49.90" },
    { itemId: "1729582718312380103", skuId: "1729582718312480103", name: "Aroma Reed Diffuser 100ml", skuName: "Lavender", price: "24.90", originalPrice: "32.00" },
  ],
  "tiktok:7000002": [
    { itemId: "1729582718312380201", skuId: "1729582718312480201", name: "ชุดผ้าขนหนูใยไผ่ 3 ผืน", skuName: "สีเขียวเสจ", price: "399.00", originalPrice: "590.00" },
    { itemId: "1729582718312380202", skuId: "1729582718312480202", name: "แก้วเก็บความเย็นสแตนเลส 900ml", skuName: "สีดำด้าน", price: "329.00", originalPrice: "450.00" },
    { itemId: "1729582718312380203", skuId: "1729582718312480203", name: "ก้านไม้หอมปรับอากาศ 100ml", skuName: "กลิ่นลาเวนเดอร์", price: "219.00", originalPrice: "290.00" },
  ],
  "tiktok:7000003": [
    { itemId: "1729582718312380301", skuId: "1729582718312480301", name: "Bộ khăn tắm sợi tre 3 chiếc", skuName: "Xanh lá", price: "289000", originalPrice: "350000" },
    { itemId: "1729582718312380302", skuId: "1729582718312480302", name: "Bình giữ nhiệt inox 900ml", skuName: "Đen nhám", price: "219000", originalPrice: "280000" },
    { itemId: "1729582718312380303", skuId: "1729582718312480303", name: "Bộ dụng cụ bếp silicone 6 món", skuName: "Xám", price: "189000", originalPrice: "240000" },
  ],
  "shopee:230001": [{ itemId: "24580031001", skuId: "214500310011", name: "Cotton Bedsheet Set Queen", skuName: "Cream", price: "79.00", originalPrice: "99.00" }],
  "shopee:230002": [{ itemId: "24580032001", skuId: "214500320011", name: "Cotton Bedsheet Set Queen", skuName: "Cream", price: "35.00", originalPrice: "42.00" }],
  "shopee:230003": [{ itemId: "24580033001", skuId: "214500330011", name: "Cotton Bedsheet Set Queen", skuName: "Cream", price: "1290.00", originalPrice: "1590.00" }],
  "shopee:230010": [{ itemId: "24580040001", skuId: "214500400011", name: "Desk Organizer Drawer", skuName: "White", price: "26.90", originalPrice: "32.00" }],
  "tiktok:7100001": [{ itemId: "1729582718312381001", skuId: "1729582718312481001", name: "Cotton Bedsheet Set Queen", skuName: "Cream", price: "75.00", originalPrice: "99.00" }],
  "tiktok:7100002": [{ itemId: "1729582718312381002", skuId: "1729582718312481002", name: "ชุดผ้าปูที่นอนคอตตอน Queen", skuName: "สีครีม", price: "690.00", originalPrice: "890.00" }],
};

/** 一条历史消息：from 为 buyer / seller；kind 缺省为文字。minutesAgo 相对 seed 时刻。 */
export type FixtureMessage = { from: "buyer" | "seller"; minutesAgo: number; text?: string; kind?: "text" | "order" | "product"; orderId?: string; productIndex?: number };

export type FixtureAfterSale =
  | { kind: "return"; id: string; status: string; subtype: string; reason: string; reasonText: string; minutesAgo: number }
  | { kind: "cancel"; id: string; status: string; subtype: string; reason: string; reasonText: string; minutesAgo: number };

export type FixtureOrder = {
  orderId: string;
  status: string;
  /** 下单时间（分钟前） */
  minutesAgo: number;
  items: Array<{ productIndex: number; qty: number }>;
  buyerMessage?: string;
  afterSale?: FixtureAfterSale;
  /** 进入 IN_CANCEL 前的状态 */
  prevStatus?: string;
  buyerCancelReason?: string;
};

export type FixtureBuyer = {
  platform: MockPlatform;
  shopId: string;
  conversationId: string;
  buyerId: string;
  /** TikTok im_user_id；Shopee 同 buyerId */
  buyerImId: string;
  /** Shopee 用户名 / TikTok 昵称 */
  name: string;
  /** 收件人（打码前） */
  recipient: { name: string; phone: string; fullAddress: string; city: string; zipcode: string };
  language: string;
  unread: number;
  messages: FixtureMessage[];
  orders: FixtureOrder[];
};

const D = 24 * 60;

export const MOCK_BUYERS: FixtureBuyer[] = [
  // ── Demo Shopee MY ──
  {
    platform: "shopee", shopId: "220001", conversationId: "1871200300114510001", buyerId: "1170319001", buyerImId: "1170319001", name: "nurul.aisyah92", language: "ms", unread: 1,
    recipient: { name: "Nurul Aisyah", phone: "60123456781", fullAddress: "No 12, Jalan Melati 3, Taman Bukit Indah", city: "Johor Bahru", zipcode: "81200" },
    orders: [{ orderId: "251006K7QX2M1A", status: "SHIPPED", minutesAgo: 4 * D, items: [{ productIndex: 0, qty: 1 }] }],
    messages: [
      { from: "buyer", minutesAgo: 2 * D + 30, kind: "order", orderId: "251006K7QX2M1A" },
      { from: "buyer", minutesAgo: 2 * D + 29, text: "Salam, bila parcel saya akan sampai ya? Dah 4 hari order." },
      { from: "seller", minutesAgo: 2 * D, text: "Waalaikumsalam Cik Nurul, parcel sudah diserahkan kepada SPX semalam. Anggaran sampai 2-3 hari bekerja ya." },
      { from: "buyer", minutesAgo: 25, text: "Tracking masih tunjuk di Shah Alam hub. Boleh tolong semak?" },
    ],
  },
  {
    platform: "shopee", shopId: "220001", conversationId: "1871200300114510002", buyerId: "1170319002", buyerImId: "1170319002", name: "tanweiming88", language: "en", unread: 2,
    recipient: { name: "Tan Wei Ming", phone: "60167788992", fullAddress: "B-15-3, Residensi Sentral, Jalan Tun Sambanthan", city: "Kuala Lumpur", zipcode: "50470" },
    orders: [{ orderId: "251010R3HN8P2B", status: "READY_TO_SHIP", minutesAgo: 180, items: [{ productIndex: 1, qty: 2 }], buyerMessage: "Please pack carefully, it's a gift." }],
    messages: [
      { from: "buyer", minutesAgo: 170, kind: "product", productIndex: 1 },
      { from: "buyer", minutesAgo: 169, text: "Hi, I ordered 2 tumblers in black. Can I change one to blue before you ship?" },
      { from: "buyer", minutesAgo: 12, text: "Hello? Need to know before it ships please." },
    ],
  },
  {
    platform: "shopee", shopId: "220001", conversationId: "1871200300114510003", buyerId: "1170319003", buyerImId: "1170319003", name: "sitirahmah_shop", language: "ms", unread: 0,
    recipient: { name: "Siti Rahmah", phone: "60198877665", fullAddress: "Lot 88, Kampung Baru Sungai Buloh", city: "Sungai Buloh", zipcode: "47000" },
    orders: [{
      orderId: "250928T5LP4W9C", status: "TO_RETURN", minutesAgo: 13 * D, items: [{ productIndex: 2, qty: 1 }],
      afterSale: { kind: "return", id: "2510080TA5PM801", status: "REQUESTED", subtype: "0", reason: "ITEM_DAMAGED", reasonText: "Spatula patah semasa sampai, kotak pun kemek.", minutesAgo: 3 * 60 },
    }],
    messages: [
      { from: "buyer", minutesAgo: 3 * 60 + 5, text: "Assalamualaikum, senduk silikon yang saya terima dah patah. Saya dah buat permohonan pulangan." },
      { from: "seller", minutesAgo: 2 * 60, text: "Maaf atas kesulitan ini. Boleh hantar gambar kerosakan supaya kami boleh proses dengan cepat?" },
      { from: "buyer", minutesAgo: 90, text: "Gambar dah upload dalam permohonan pulangan tu." },
    ],
  },
  {
    platform: "shopee", shopId: "220001", conversationId: "1871200300114510004", buyerId: "1170319004", buyerImId: "1170319004", name: "arjunk_my", language: "en", unread: 1,
    recipient: { name: "Arjun Kumar", phone: "60123344556", fullAddress: "21, Lorong Kenari 5, Bayan Lepas", city: "Penang", zipcode: "11900" },
    orders: [],
    messages: [
      { from: "buyer", minutesAgo: 40, kind: "product", productIndex: 0 },
      { from: "buyer", minutesAgo: 39, text: "Is this towel set quick-dry? And is the green colour still in stock?" },
    ],
  },
  // ── Demo Shopee SG ──
  {
    platform: "shopee", shopId: "220002", conversationId: "1871200300224520001", buyerId: "1180420001", buyerImId: "1180420001", name: "chloelim.sg", language: "en", unread: 1,
    recipient: { name: "Chloe Lim", phone: "6591234567", fullAddress: "Blk 456 Tampines Street 42 #08-123", city: "Singapore", zipcode: "520456" },
    orders: [{ orderId: "250921C2VB7N3D", status: "COMPLETED", minutesAgo: 20 * D, items: [{ productIndex: 2, qty: 1 }, { productIndex: 0, qty: 1 }] }],
    messages: [
      { from: "buyer", minutesAgo: 55, kind: "order", orderId: "250921C2VB7N3D" },
      { from: "buyer", minutesAgo: 54, text: "Hi, could you send me a tax invoice for this order? Company name is Lumen Studio Pte Ltd, UEN 201912345K." },
    ],
  },
  {
    platform: "shopee", shopId: "220002", conversationId: "1871200300224520002", buyerId: "1180420002", buyerImId: "1180420002", name: "marcus_ong", language: "en", unread: 0,
    recipient: { name: "Marcus Ong", phone: "6598765432", fullAddress: "10 Anson Road #22-01 International Plaza", city: "Singapore", zipcode: "079903" },
    orders: [{ orderId: "251011F8KD3S6E", status: "READY_TO_SHIP", minutesAgo: 95, items: [{ productIndex: 1, qty: 1 }] }],
    messages: [
      { from: "buyer", minutesAgo: 90, text: "When will this be shipped? Need it by Friday." },
      { from: "seller", minutesAgo: 80, text: "Hi Marcus, we ship within 1 working day. Delivery in SG usually takes 2-3 days, so Friday should be fine." },
      { from: "buyer", minutesAgo: 79, text: "Great, thanks!" },
    ],
  },
  {
    platform: "shopee", shopId: "220002", conversationId: "1871200300224520003", buyerId: "1180420003", buyerImId: "1180420003", name: "priyanair", language: "en", unread: 1,
    recipient: { name: "Priya Nair", phone: "6587654321", fullAddress: "Blk 21 Bendemeer Road #05-88", city: "Singapore", zipcode: "330021" },
    orders: [{ orderId: "251005P6GT2R8F", status: "TO_CONFIRM_RECEIVE", minutesAgo: 6 * D, items: [{ productIndex: 0, qty: 2 }] }],
    messages: [
      { from: "buyer", minutesAgo: 22, text: "App says delivered but I didn't receive anything. Can you check with the courier?" },
    ],
  },
  {
    platform: "shopee", shopId: "220002", conversationId: "1871200300224520004", buyerId: "1180420004", buyerImId: "1180420004", name: "dgoh.sg", language: "en", unread: 1,
    recipient: { name: "Daniel Goh", phone: "6582223344", fullAddress: "88 Upper Bukit Timah Road #03-02", city: "Singapore", zipcode: "588216" },
    orders: [{ orderId: "251011H4MW9Q1G", status: "IN_CANCEL", prevStatus: "READY_TO_SHIP", buyerCancelReason: "Need to Change Delivery Address", minutesAgo: 140, items: [{ productIndex: 2, qty: 1 }] }],
    messages: [
      { from: "buyer", minutesAgo: 35, text: "I requested to cancel because the address is wrong. Will re-order with the right one." },
    ],
  },
  // ── Demo TikTok MY ──
  {
    platform: "tiktok", shopId: "7000001", conversationId: "7494560109732330101", buyerId: "7021436810468230101", buyerImId: "7494560109732331101", name: "Farah Hanim", language: "ms", unread: 1,
    recipient: { name: "Farah Hanim", phone: "60112233445", fullAddress: "No 7, Jalan SS15/4, Subang Jaya", city: "Subang Jaya", zipcode: "47500" },
    orders: [{ orderId: "576486316948490101", status: "AWAITING_SHIPMENT", minutesAgo: 300, items: [{ productIndex: 0, qty: 1 }] }],
    messages: [
      { from: "buyer", minutesAgo: 30, kind: "order", orderId: "576486316948490101" },
      { from: "buyer", minutesAgo: 29, text: "Hai, boleh pos hari ni? Nak guna hujung minggu ni." },
    ],
  },
  {
    platform: "tiktok", shopId: "7000001", conversationId: "7494560109732330102", buyerId: "7021436810468230102", buyerImId: "7494560109732331102", name: "Jason Lee", language: "en", unread: 1,
    recipient: { name: "Jason Lee", phone: "60129876543", fullAddress: "23A, Jalan Bangsar Utama 1", city: "Kuala Lumpur", zipcode: "59000" },
    orders: [{
      orderId: "576486316948490102", status: "DELIVERED", minutesAgo: 8 * D, items: [{ productIndex: 1, qty: 1 }],
      afterSale: { kind: "return", id: "4035318504086610102", status: "RETURN_OR_REFUND_REQUEST_PENDING", subtype: "RETURN_AND_REFUND", reason: "ecom_order_delivered_refund_and_return_reason_wrong_product", reasonText: "Wrong product was sent", minutesAgo: 5 * 60 },
    }],
    messages: [
      { from: "buyer", minutesAgo: 5 * 60 + 3, text: "I ordered pink but received a grey tumbler. Already submitted a return." },
      { from: "seller", minutesAgo: 4 * 60, text: "Sorry Jason! We'll check the return request and get back to you today." },
      { from: "buyer", minutesAgo: 15, text: "Any update on the return?" },
    ],
  },
  {
    platform: "tiktok", shopId: "7000001", conversationId: "7494560109732330103", buyerId: "7021436810468230103", buyerImId: "7494560109732331103", name: "Mei Ling", language: "en", unread: 0,
    recipient: { name: "Lim Mei Ling", phone: "60165544332", fullAddress: "12, Lorong Mahsuri 2, Bayan Baru", city: "Penang", zipcode: "11950" },
    orders: [{ orderId: "576486316948490103", status: "IN_TRANSIT", minutesAgo: 3 * D, items: [{ productIndex: 2, qty: 2 }] }],
    messages: [
      { from: "buyer", minutesAgo: D, text: "Hi, is the lavender scent strong? Bought 2 as gifts." },
      { from: "seller", minutesAgo: D - 20, text: "Hi Mei Ling, it's a gentle scent that lasts about 6-8 weeks. Your parcel is on the way!" },
    ],
  },
  {
    platform: "tiktok", shopId: "7000001", conversationId: "7494560109732330104", buyerId: "7021436810468230104", buyerImId: "7494560109732331104", name: "Hafiz Rahman", language: "ms", unread: 1,
    recipient: { name: "Hafiz Rahman", phone: "60137766554", fullAddress: "No 3, Jalan Kenanga, Taman Seri Gombak", city: "Batu Caves", zipcode: "68100" },
    orders: [{ orderId: "576486316948490104", status: "COMPLETED", minutesAgo: 25 * D, items: [{ productIndex: 0, qty: 1 }] }],
    messages: [
      { from: "buyer", minutesAgo: 8, kind: "product", productIndex: 0 },
      { from: "buyer", minutesAgo: 7, text: "Tuala ni ada warna lain tak? Nak beli lagi satu set." },
    ],
  },
  // ── Demo TikTok TH ──
  {
    platform: "tiktok", shopId: "7000002", conversationId: "7494560109732330201", buyerId: "7021436810468230201", buyerImId: "7494560109732331201", name: "สมชาย ใจดี", language: "th", unread: 1,
    recipient: { name: "สมชาย ใจดี", phone: "66812345678", fullAddress: "99/12 ซอยสุขุมวิท 50 แขวงพระโขนง เขตคลองเตย", city: "กรุงเทพมหานคร", zipcode: "10260" },
    orders: [{
      orderId: "576486316948490201", status: "AWAITING_SHIPMENT", minutesAgo: 6 * 60, items: [{ productIndex: 1, qty: 1 }],
      afterSale: { kind: "cancel", id: "4035318504086620201", status: "CANCELLATION_REQUEST_PENDING", subtype: "BUYER_CANCEL", reason: "ecom_order_to_ship_canceled_reason_created_by_mistakes", reasonText: "Order created by mistake", minutesAgo: 50 },
    }],
    messages: [
      { from: "buyer", minutesAgo: 52, text: "สวัสดีครับ ผมกดสั่งผิดสี ขอยกเลิกออเดอร์นะครับ" },
      { from: "buyer", minutesAgo: 51, text: "ส่งคำขอยกเลิกไปแล้วครับ" },
    ],
  },
  {
    platform: "tiktok", shopId: "7000002", conversationId: "7494560109732330202", buyerId: "7021436810468230202", buyerImId: "7494560109732331202", name: "Napatsorn K.", language: "th", unread: 0,
    recipient: { name: "นภัสสร แก้วมณี", phone: "66898765432", fullAddress: "45 หมู่ 3 ถนนนิมมานเหมินท์ ตำบลสุเทพ", city: "เชียงใหม่", zipcode: "50200" },
    orders: [{
      orderId: "576486316948490202", status: "DELIVERED", minutesAgo: 6 * D, items: [{ productIndex: 2, qty: 1 }],
      afterSale: { kind: "return", id: "4035318504086610202", status: "RETURN_OR_REFUND_REQUEST_PENDING", subtype: "REFUND", reason: "ecom_order_delivered_refund_reason_missing_product", reasonText: "Missing product", minutesAgo: 9 * 60 },
    }],
    messages: [
      { from: "buyer", minutesAgo: 9 * 60 + 2, text: "ได้รับกล่องแล้วแต่ไม่มีขวดน้ำหอมข้างในค่ะ ขอคืนเงินนะคะ" },
      { from: "seller", minutesAgo: 8 * 60, text: "ขออภัยค่ะ ทางร้านกำลังตรวจสอบกับคลังสินค้า จะแจ้งผลภายในวันนี้ค่ะ" },
    ],
  },
  {
    platform: "tiktok", shopId: "7000002", conversationId: "7494560109732330203", buyerId: "7021436810468230203", buyerImId: "7494560109732331203", name: "พลอย", language: "th", unread: 2,
    recipient: { name: "พลอยไพลิน ศรีสุข", phone: "66861122334", fullAddress: "8/1 ถนนมิตรภาพ ตำบลในเมือง", city: "ขอนแก่น", zipcode: "40000" },
    orders: [],
    messages: [
      { from: "buyer", minutesAgo: 18, kind: "product", productIndex: 0 },
      { from: "buyer", minutesAgo: 17, text: "ผ้าขนหนูชุดนี้ซักเครื่องได้ไหมคะ" },
      { from: "buyer", minutesAgo: 16, text: "มีโค้ดส่วนลดไหมคะ" },
    ],
  },
  {
    platform: "tiktok", shopId: "7000002", conversationId: "7494560109732330204", buyerId: "7021436810468230204", buyerImId: "7494560109732331204", name: "Kittipong", language: "th", unread: 0,
    recipient: { name: "กิตติพงษ์ ทองดี", phone: "66854433221", fullAddress: "120 ถนนเพชรเกษม ตำบลหาดใหญ่", city: "สงขลา", zipcode: "90110" },
    orders: [{ orderId: "576486316948490204", status: "COMPLETED", minutesAgo: 30 * D, items: [{ productIndex: 0, qty: 1 }] }],
    messages: [
      { from: "buyer", minutesAgo: 3 * D, text: "ได้รับของแล้วครับ คุณภาพดีมาก ขอบคุณครับ" },
      { from: "seller", minutesAgo: 3 * D - 30, text: "ขอบคุณมากค่ะ ฝากรีวิวให้ร้านด้วยนะคะ" },
    ],
  },
  // ── Other TikTok VN ──
  {
    platform: "tiktok", shopId: "7000003", conversationId: "7494560109732330301", buyerId: "7021436810468230301", buyerImId: "7494560109732331301", name: "Nguyễn Thị Lan", language: "vi", unread: 1,
    recipient: { name: "Nguyễn Thị Lan", phone: "84912345678", fullAddress: "25 Nguyễn Trãi, Phường Bến Thành, Quận 1", city: "TP. Hồ Chí Minh", zipcode: "700000" },
    orders: [{ orderId: "576486316948490301", status: "AWAITING_SHIPMENT", minutesAgo: 200, items: [{ productIndex: 1, qty: 1 }] }],
    messages: [
      { from: "buyer", minutesAgo: 20, text: "Shop ơi, đơn của mình khi nào giao vậy ạ?" },
    ],
  },
  {
    platform: "tiktok", shopId: "7000003", conversationId: "7494560109732330302", buyerId: "7021436810468230302", buyerImId: "7494560109732331302", name: "Trần Minh Đức", language: "vi", unread: 0,
    recipient: { name: "Trần Minh Đức", phone: "84987654321", fullAddress: "102 Trần Phú, Phường Hải Châu 1, Quận Hải Châu", city: "Đà Nẵng", zipcode: "550000" },
    orders: [{ orderId: "576486316948490302", status: "IN_TRANSIT", minutesAgo: 2 * D, items: [{ productIndex: 0, qty: 1 }] }],
    messages: [
      { from: "buyer", minutesAgo: D, text: "Cho mình hỏi mã vận đơn với ạ." },
      { from: "seller", minutesAgo: D - 15, text: "Dạ đơn của anh đang được giao, anh xem mã vận đơn trong mục đơn hàng giúp shop nhé." },
    ],
  },
  {
    platform: "tiktok", shopId: "7000003", conversationId: "7494560109732330303", buyerId: "7021436810468230303", buyerImId: "7494560109732331303", name: "Phạm Thu Hà", language: "vi", unread: 1,
    recipient: { name: "Phạm Thu Hà", phone: "84933221100", fullAddress: "18 Lý Thường Kiệt, Phường Hàng Bài, Quận Hoàn Kiếm", city: "Hà Nội", zipcode: "100000" },
    orders: [],
    messages: [
      { from: "buyer", minutesAgo: 10, text: "Bộ dụng cụ bếp này có chịu nhiệt được không shop?" },
    ],
  },
  // ── 接入向导用的未授权店：各 1 个买家 ──
  {
    platform: "shopee", shopId: "230001", conversationId: "1871200300314530001", buyerId: "1190530001", buyerImId: "1190530001", name: "aina.zul", language: "ms", unread: 1,
    recipient: { name: "Aina Zulkifli", phone: "60172233441", fullAddress: "15, Jalan Cempaka 2, Taman Cempaka", city: "Ampang", zipcode: "68000" },
    orders: [{ orderId: "251009W1AZ5K2H", status: "READY_TO_SHIP", minutesAgo: D, items: [{ productIndex: 0, qty: 1 }] }],
    messages: [{ from: "buyer", minutesAgo: 60, text: "Cadar ni saiz queen kan? Bila boleh pos?" }],
  },
  {
    platform: "shopee", shopId: "230002", conversationId: "1871200300324530002", buyerId: "1190530002", buyerImId: "1190530002", name: "kelvin.tay", language: "en", unread: 0,
    recipient: { name: "Kelvin Tay", phone: "6591112233", fullAddress: "Blk 301 Ang Mo Kio Ave 3 #07-11", city: "Singapore", zipcode: "560301" },
    orders: [{ orderId: "251008Y2BX6L3J", status: "COMPLETED", minutesAgo: 9 * D, items: [{ productIndex: 0, qty: 1 }] }],
    messages: [{ from: "buyer", minutesAgo: 2 * D, text: "Received, thanks!" }],
  },
  {
    platform: "shopee", shopId: "230003", conversationId: "1871200300334530003", buyerId: "1190530003", buyerImId: "1190530003", name: "joanna_reyes", language: "en", unread: 1,
    recipient: { name: "Joanna Reyes", phone: "639171234567", fullAddress: "Unit 12B, The Grove, C5 Road, Ugong", city: "Pasig City", zipcode: "1604" },
    orders: [{ orderId: "251010Z3CY7M4K", status: "SHIPPED", minutesAgo: 3 * D, items: [{ productIndex: 0, qty: 1 }] }],
    messages: [{ from: "buyer", minutesAgo: 45, text: "Hi po, when will my order arrive?" }],
  },
  {
    platform: "shopee", shopId: "230010", conversationId: "1871200300404540010", buyerId: "1190540010", buyerImId: "1190540010", name: "hazwan.my", language: "ms", unread: 0,
    recipient: { name: "Hazwan Ismail", phone: "60145566778", fullAddress: "22, Jalan Indah 4, Taman Universiti", city: "Skudai", zipcode: "81300" },
    orders: [{ orderId: "251007V4DZ8N5L", status: "SHIPPED", minutesAgo: 4 * D, items: [{ productIndex: 0, qty: 1 }] }],
    messages: [{ from: "buyer", minutesAgo: 3 * D, text: "Laci ni kena pasang sendiri ke?" }],
  },
  {
    platform: "tiktok", shopId: "7100001", conversationId: "7494560109732331001", buyerId: "7021436810468231001", buyerImId: "7494560109732332001", name: "Izzati", language: "ms", unread: 1,
    recipient: { name: "Nur Izzati", phone: "60198812233", fullAddress: "5, Jalan Pinggiran 1/2, Putra Heights", city: "Subang Jaya", zipcode: "47650" },
    orders: [{ orderId: "576486316948491001", status: "AWAITING_SHIPMENT", minutesAgo: D, items: [{ productIndex: 0, qty: 1 }] }],
    messages: [{ from: "buyer", minutesAgo: 70, text: "Cadar ni 100% cotton ke?" }],
  },
  {
    platform: "tiktok", shopId: "7100002", conversationId: "7494560109732331002", buyerId: "7021436810468231002", buyerImId: "7494560109732332002", name: "Anong", language: "th", unread: 0,
    recipient: { name: "อนงค์ วงศ์ไทย", phone: "66871239876", fullAddress: "77 ถนนราชดำเนิน ตำบลในเมือง", city: "นครศรีธรรมราช", zipcode: "80000" },
    orders: [{ orderId: "576486316948491002", status: "IN_TRANSIT", minutesAgo: 2 * D, items: [{ productIndex: 0, qty: 1 }] }],
    messages: [{ from: "buyer", minutesAgo: D, text: "ขอบคุณค่ะ รอของอยู่นะคะ" }],
  },
];

export type FixtureCoupon = {
  shopId: string;
  couponId: string;
  title: string;
  status: "NOT_START" | "ONGOING" | "EXPIRED" | "DEACTIVATED";
  displayType: "REGULAR" | "LIVE" | "CREATOR_EXCLUSIVE" | "CHAT" | "PROMO_CODE";
  discount: { type: "AMOUNT_OFF"; amount: string } | { type: "PERCENT_OFF"; percentage: string; maxDiscount: string };
  minSpend?: string;
  /** 领取开始（天，负数为过去）与时长（天） */
  startDays: number;
  durationDays: number;
};

/** TikTok 优惠券：每个 Demo 店至少一张可在聊天发送的券（CHAT / REGULAR、ONGOING、SELLER_CENTER、ALL）。 */
export const MOCK_COUPONS: FixtureCoupon[] = [
  { shopId: "7000001", couponId: "7342461823095960101", title: "RM5 off min. spend RM50", status: "ONGOING", displayType: "CHAT", discount: { type: "AMOUNT_OFF", amount: "5" }, minSpend: "50", startDays: -3, durationDays: 30 },
  { shopId: "7000001", couponId: "7342461823095960102", title: "10% off Tumblers", status: "ONGOING", displayType: "REGULAR", discount: { type: "PERCENT_OFF", percentage: "10", maxDiscount: "15" }, minSpend: "30", startDays: -10, durationDays: 20 },
  { shopId: "7000001", couponId: "7342461823095960103", title: "11.11 RM15 off", status: "NOT_START", displayType: "REGULAR", discount: { type: "AMOUNT_OFF", amount: "15" }, minSpend: "100", startDays: 20, durationDays: 3 },
  { shopId: "7000002", couponId: "7342461823095960201", title: "ลด ฿50 เมื่อซื้อครบ ฿500", status: "ONGOING", displayType: "CHAT", discount: { type: "AMOUNT_OFF", amount: "50" }, minSpend: "500", startDays: -2, durationDays: 14 },
  { shopId: "7000002", couponId: "7342461823095960202", title: "Live ลด 15%", status: "ONGOING", displayType: "LIVE", discount: { type: "PERCENT_OFF", percentage: "15", maxDiscount: "100" }, startDays: -1, durationDays: 7 },
  { shopId: "7000003", couponId: "7342461823095960301", title: "Giảm 20.000₫ cho đơn từ 200.000₫", status: "ONGOING", displayType: "CHAT", discount: { type: "AMOUNT_OFF", amount: "20000" }, minSpend: "200000", startDays: -5, durationDays: 30 },
];
