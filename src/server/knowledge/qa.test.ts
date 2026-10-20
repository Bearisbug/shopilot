// 问答与产品清单：替身向量、合并、导入解析、候选解析与分批、卖家 SKU 归一、权限（不需要数据库）；
// 产品清单导入与对应、手写问答与列表、问答检索过滤与阈值、整理成问答与疑似重复、审核与下架、出稿与测试问答带问答（需要数据库）。
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { can, permissionsFor, type Role } from "@/lib/permissions";
import { normalizeShopeeOrder } from "@/server/platforms/shopee";
import { normalizeTiktokOrder } from "@/server/platforms/tiktok";
import { parseProductImport } from "@/server/products/dictionary";
import { stubVector } from "./embed";
import { batchChunks, parseCandidates } from "./qa-extract";
import { mergeQa, type QaHitRow } from "./qa-retrieve";
import { citationsFrom, knowledgePayload, type RetrievalOutcome } from "./retrieve";

const { enqueue } = vi.hoisted(() => ({ enqueue: vi.fn<(...args: unknown[]) => Promise<null>>(async () => null) }));
vi.mock("@/server/jobs/boss", () => ({ enqueue }));

const cosine = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);

describe("替身向量", () => {
  it("相同文本向量相同、已归一化；字面相近的比无关的更近", () => {
    const a = stubVector("Tail 2 有没有内置麦克风");
    expect(stubVector("Tail 2 有没有内置麦克风")).toEqual(a);
    expect(Math.hypot(...a)).toBeCloseTo(1, 6);
    expect(cosine(a, stubVector("Tail 2 有内置麦克风吗"))).toBeGreaterThan(cosine(a, stubVector("退款多久到账")));
    expect(Math.hypot(...stubVector("！？"))).toBeCloseTo(1, 6);
  });
});

const hit = (id: string, route: QaHitRow["route"] = "rewritten"): QaHitRow => ({ route, qaId: id, questions: [`问${id}`], answer: `答${id}`, distance: 0.2 });

describe("问答合并与载荷（§12.8）", () => {
  it("两路交替取、改写路在前、按问答去重、最多 6 条并编号 1–6", () => {
    const merged = mergeQa(["a", "s", "b", "c"].map((x) => hit(x)), ["d", "s", "e", "f", "g"].map((x) => hit(x, "original")));
    expect(merged.map((m) => m.hit.qaId)).toEqual(["a", "d", "s", "b", "e", "c"]);
    expect(merged.map((m) => m.n)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  const chunk = { chunkId: "k1", documentId: "doc1", name: "保修.pdf", fileId: "f", chunkNo: 1, text: "保修 12 个月", score: 0.5, vectorScore: 0.5, keywordScore: null, rerankingScore: null };
  const qa = { latencyMs: 5, error: null, stage: null, productIds: [], hits: [], merged: [{ n: 1, hit: hit("q1") }] };
  const outcome = { merged: [{ n: 2, chunk }], degraded: false, qa } as unknown as RetrievalOutcome;

  it("问答排在资料前面，标题「问答：第一个问法」，正文「问：…答：…」；资料降级时只带问答", () => {
    expect(knowledgePayload(outcome)).toEqual([
      { n: 1, title: "问答：问q1", text: "问：问q1\n答：答q1" },
      { n: 2, title: "保修.pdf", text: "保修 12 个月" },
    ]);
    expect(knowledgePayload({ ...outcome, degraded: true, merged: [] })).toEqual([{ n: 1, title: "问答：问q1", text: "问：问q1\n答：答q1" }]);
    expect(knowledgePayload({ ...outcome, merged: [], qa: { ...qa, merged: [] } })).toBeUndefined();
  });

  it("依据按编号分到问答或资料，各自去重", () => {
    expect(citationsFrom(outcome, [2, 1, 1, 9])).toEqual([
      { n: 2, kind: "document", documentId: "doc1", name: "保修.pdf" },
      { n: 1, kind: "qa", qaId: "q1", name: "问q1" },
    ]);
  });
});

describe("产品清单导入解析", () => {
  it("跳过表头与空行；逗号或制表符分隔；引号里的逗号保留；别名按分号切开", () => {
    const r = parseProductImport('物料编码,产品名称,别名\n\nTL2-B,"OBSBOT Tail 2, 黑色",Tail2;尾巴二代\nMT3\tOBSBOT Meet 3\n');
    expect(r.errors).toEqual([]);
    expect(r.skipped).toBe(3);
    expect(r.rows).toEqual([
      { line: 3, code: "TL2-B", name: "OBSBOT Tail 2, 黑色", aliases: ["Tail2", "尾巴二代"] },
      { line: 4, code: "MT3", name: "OBSBOT Meet 3", aliases: null },
    ]);
  });

  it("缺名称、编码重复（不分大小写）逐行报错，其余行照常", () => {
    const r = parseProductImport("A1,产品一\nB2\na1,产品一改名\nC3,产品三");
    expect(r.rows.map((x) => x.code)).toEqual(["A1", "C3"]);
    expect(r.errors).toEqual([
      { line: 2, message: "缺少官方产品名称" },
      { line: 3, message: "物料编码和第 1 行重复" },
    ]);
  });
});

describe("整理成问答：分批与候选解析", () => {
  it("分块按顺序拼成不超过上限的批次，超长分块单独成批并截断", () => {
    expect(batchChunks(["甲".repeat(40), "乙".repeat(40), "丙".repeat(30)], 100)).toEqual(["甲".repeat(40) + "\n\n" + "乙".repeat(40), "丙".repeat(30)]);
    expect(batchChunks(["丁".repeat(250)], 100)).toEqual(["丁".repeat(100)]);
  });

  it("问法去重、阶段与产品编码只认合法值，缺问法或回复的丢掉", () => {
    const codes = new Map([["TL2-B", "p1"]]);
    const got = parseCandidates(
      {
        items: [
          { questions: ["有麦克风吗", "有麦克风吗", ""], answer: "没有内置麦克风", stage: "presale", product_codes: ["tl2-b", "NOPE"], excerpt: "不含麦克风" },
          { questions: ["退货"], answer: "7 天内可退", stage: "whatever", product_codes: [] },
          { questions: [], answer: "孤零零的回复" },
          { questions: ["只有问"], answer: "" },
        ],
      },
      codes,
    );
    expect(got).toEqual([
      { questions: ["有麦克风吗"], answer: "没有内置麦克风", stage: "presale", productIds: ["p1"], excerpt: "不含麦克风" },
      { questions: ["退货"], answer: "7 天内可退", stage: "any", productIds: [], excerpt: "" },
    ]);
  });
});

describe("订单商品补存卖家 SKU", () => {
  it("Shopee 取 model_sku，空则 item_sku；规格名 sku 不变", () => {
    const o = normalizeShopeeOrder({ order_sn: "1", order_status: "COMPLETED", item_list: [
      { item_id: 1, item_name: "Tail 2", model_name: "Black", model_sku: "TL2-B", item_sku: "TL2", model_id: 9, model_quantity_purchased: 1, model_discounted_price: 10 },
      { item_id: 2, item_name: "Meet 3", model_name: "", model_sku: "", item_sku: "MT3", model_id: 0, model_quantity_purchased: 1, model_discounted_price: 10 },
    ] });
    expect(o.items.map((i) => [i.sku, i.sellerSku])).toEqual([
      ["Black", "TL2-B"],
      [undefined, "MT3"],
    ]);
  });

  it("TikTok 取 seller_sku", () => {
    const o = normalizeTiktokOrder({ id: "1", status: "COMPLETED", payment: {}, line_items: [{ sku_id: "s1", product_id: "p1", product_name: "Tail 2", sku_name: "Black", seller_sku: " TL2-B ", sale_price: "10" }] });
    expect(o.items[0]).toMatchObject({ sku: "Black", sellerSku: "TL2-B" });
  });
});

describe("权限", () => {
  it("产品清单只给管理员写；问答随 knowledge.manage（管理员、组长）", () => {
    expect((["admin", "lead", "agent"] as Role[]).map((r) => can(r, false, "products.manage"))).toEqual([true, false, false]);
    expect((["admin", "lead", "agent"] as Role[]).map((r) => can(r, false, "knowledge.manage"))).toEqual([true, true, false]);
  });

  it("问答接口要求 knowledge.manage，产品清单写接口要求 products.manage", async () => {
    const root = path.resolve(import.meta.dirname, "../../app/api/v1");
    const guards: Array<[string, string]> = [
      ["knowledge/qa/route.ts", "knowledge.manage"],
      ["knowledge/qa/[id]/route.ts", "knowledge.manage"],
      ["knowledge/qa/[id]/approve/route.ts", "knowledge.manage"],
      ["knowledge/qa/[id]/reject/route.ts", "knowledge.manage"],
      ["knowledge/qa/[id]/archive/route.ts", "knowledge.manage"],
      ["knowledge/qa/[id]/restore/route.ts", "knowledge.manage"],
      ["knowledge/documents/[id]/qa-extract/route.ts", "knowledge.manage"],
      ["products/route.ts", "knowledge.manage"],
      ["products/unmapped/route.ts", "knowledge.manage"],
      ["products/import/route.ts", "products.manage"],
      ["products/[id]/route.ts", "products.manage"],
      ["products/listings/sync/route.ts", "products.manage"],
    ];
    for (const [f, perm] of guards) {
      const src = await readFile(path.join(root, f), "utf8");
      const handlers = src.match(/export const (GET|POST|PATCH|DELETE) = route\(/g) ?? [];
      expect(handlers.length, f).toBeGreaterThan(0);
      expect((src.match(new RegExp(`perm: "${perm.replace(".", "\\.")}"`, "g")) ?? []).length, f).toBe(handlers.length);
    }
  });
});

describe.skipIf(!process.env.DATABASE_URL)("问答与产品清单（需要数据库）", async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "shopilot-qa-test-"));
  process.env.DATA_DIR = dataDir;
  process.env.KNOWLEDGE_MODE = "stub";
  process.env.AI_MODE = "stub";
  const { db, pool, schema } = await import("@/server/db/client");
  const { encrypt } = await import("@/server/core/crypto");
  const { provisionMerchant } = await import("@/server/merchants/provision");
  const { Problem } = await import("@/server/http/problem");
  const docs = await import("./documents");
  const { ingestDocument } = await import("./ingest");
  const { stubSearchService } = await import("./stub");
  const qaSvc = await import("./qa");
  const { startQaExtract, extractQa, failStaleExtracts } = await import("./qa-extract");
  const { retrieveForDraft } = await import("./retrieve");
  const { askKnowledge } = await import("./ask");
  const dict = await import("@/server/products/dictionary");
  const { generateDraft } = await import("@/server/ai/draft");
  const { getConversation } = await import("@/server/conversations/queries");
  type MemberContext = import("@/server/auth/context").MemberContext;
  type Merchant = typeof schema.merchant.$inferSelect;

  const svc = stubSearchService();
  const userIds: string[] = [];
  const merchantIds: string[] = [];
  let savedAiStub: typeof schema.devAiStub.$inferSelect | undefined;

  function ctxFor(merchant: Merchant, membershipId: string, userId: string, role: Role): MemberContext {
    const isOwner = role === "admin" && merchant.ownerUserId === userId;
    return {
      requestId: "req_test",
      ip: "127.0.0.1",
      userAgent: null,
      user: { id: userId, name: `测试${role}`, email: `${userId}@test.invalid`, twoFactorEnabled: false },
      session: { id: "s", createdAt: new Date() },
      merchant,
      membership: { id: membershipId, role, status: "active" },
      isOwner,
      shopIds: role === "admin" ? null : [],
      twoFactorRequired: false,
      actor: { kind: "member", merchantId: merchant.id, membershipId, userId, name: `测试${role}`, requestId: "req_test" },
      can: (p) => can(role, isOwner, p),
      permissions: permissionsFor(role, isOwner),
    };
  }

  async function newMerchant(name: string) {
    const userId = `test-${randomUUID()}`;
    await db().insert(schema.user).values({ id: userId, name, email: `${userId}@test.invalid` });
    userIds.push(userId);
    const res = await db().transaction((tx) => provisionMerchant(tx, { name, timezone: "Asia/Kuala_Lumpur", ownerUserId: userId }));
    merchantIds.push(res.merchant.id);
    return ctxFor(res.merchant, res.membership.id, userId, "admin");
  }

  async function problemOf(p: Promise<unknown>): Promise<InstanceType<typeof Problem>> {
    try {
      await p;
    } catch (e) {
      if (e instanceof Problem) return e;
      throw e;
    }
    throw new Error("没有抛出 Problem");
  }

  let ctx: MemberContext;
  let shop: typeof schema.shop.$inferSelect;
  const products: Record<string, string> = {};

  beforeAll(async () => {
    [savedAiStub] = await db().select().from(schema.devAiStub).where(eq(schema.devAiStub.id, 1));
    await db().insert(schema.devAiStub).values({ id: 1, next: "normal", sticky: false }).onConflictDoUpdate({ target: schema.devAiStub.id, set: { next: "normal", sticky: false } });
    ctx = await newMerchant("问答测试");
    const [app] = await db()
      .insert(schema.platformApp)
      .values({ merchantId: ctx.merchant.id, platform: "tiktok", appKey: `app-${randomUUID()}`, secretEnc: encrypt("secret"), region: "sg", status: "verified" })
      .returning();
    const caps = { chat: true, orders: true, piiMasked: false, productScope: true, cards: [], coupons: false, endSession: false, maxTextLength: 500 };
    [shop] = await db()
      .insert(schema.shop)
      .values({ merchantId: ctx.merchant.id, platformAppId: app.id, platform: "tiktok", externalShopId: `s-${randomUUID()}`, shopCipher: "c", name: "TikTok MY", market: "MY", accessTokenEnc: encrypt("t"), refreshTokenEnc: encrypt("r"), accessExpiresAt: new Date(Date.now() + 86_400_000), capabilities: caps })
      .returning();
  });

  afterAll(async () => {
    const restoreAi = savedAiStub ? { next: savedAiStub.next, sticky: savedAiStub.sticky, lastRequest: savedAiStub.lastRequest } : { next: "normal" as const, sticky: false, lastRequest: null };
    await db().insert(schema.devAiStub).values({ id: 1, ...restoreAi }).onConflictDoUpdate({ target: schema.devAiStub.id, set: restoreAi });
    if (merchantIds.length) await db().delete(schema.merchant).where(inArray(schema.merchant.id, merchantIds));
    if (userIds.length) await db().delete(schema.user).where(inArray(schema.user.id, userIds));
    await pool().end();
    await rm(dataDir, { recursive: true, force: true });
  });

  it("产品清单导入：新增、改名、没变的跳过、逐行报错；平台商品按卖家 SKU 对应，产品变更后重算", async () => {
    const r1 = await dict.importProducts(ctx, "物料编码,名称,别名\nTL2-B,OBSBOT Tail 2,Tail2;尾巴二代\nMT3,OBSBOT Meet 3\nBAD");
    expect(r1).toEqual({ created: 2, updated: 0, skipped: 1, errors: [{ line: 4, message: "缺少官方产品名称" }] });
    const r2 = await dict.importProducts(ctx, "TL2-B,OBSBOT Tail 2 黑色\nMT3,OBSBOT Meet 3");
    expect(r2).toMatchObject({ created: 0, updated: 1, skipped: 1 });
    const list = await dict.listProducts(ctx, {});
    for (const p of list.items) products[p.code] = p.id;
    expect(list.items.find((p) => p.code === "TL2-B")).toMatchObject({ name: "OBSBOT Tail 2 黑色", aliases: ["Tail2", "尾巴二代"] });

    await dict.writeListings(shop, [{ productId: "pl-1", skus: ["tl2-b ", "TL2-W"] }, { productId: "pl-2", skus: ["MT3"] }], false);
    const unmapped = await dict.unmappedListings(ctx);
    expect(unmapped.shops[0].items.map((i) => i.sku)).toEqual(["TL2-W"]);
    expect((await dict.listProducts(ctx, {})).items.find((p) => p.code === "TL2-B")?.listingCount).toBe(1);
    await dict.importProducts(ctx, "TL2-W,OBSBOT Tail 2 白色");
    expect((await dict.unmappedListings(ctx)).total).toBe(0);
    products["TL2-W"] = (await dict.listProducts(ctx, { q: "白色" })).items[0].id;
    // 目录没截断时，这一轮没出现的旧行删掉
    await dict.writeListings(shop, [{ productId: "pl-1", skus: ["TL2-B"] }, { productId: "pl-2", skus: ["MT3"] }], false);
    const rows = await db().select().from(schema.productListing).where(eq(schema.productListing.shopId, shop.id));
    expect(rows.map((r) => r.sku).sort()).toEqual(["MT3", "TL2-B"]);
  });

  it("手写问答保存即发布并向量化；列表按状态、阶段、产品、站点、关键字筛选；改问法重算向量、版本不对 409", async () => {
    const a = await qaSvc.createQa(ctx, { questions: ["Tail 2 有没有内置麦克风", "Tail 2 能收音吗"], answer: "Tail 2 没有内置麦克风，需要外接。", productIds: [products["TL2-B"]], stage: "presale", markets: ["ALL"], tags: [] });
    expect(a.qa).toMatchObject({ status: "published", source: "manual", embedded: true, version: 1, products: [{ code: "TL2-B" }], createdByName: "问答测试" });
    await qaSvc.createQa(ctx, { questions: ["退货要几天"], answer: "签收 7 天内可申请退货。", productIds: [], stage: "aftersale", markets: ["MY"], tags: ["退换"] });
    await qaSvc.createQa(ctx, { questions: ["泰国站发什么快递"], answer: "泰国站用 Flash Express。", productIds: [], stage: "insale", markets: ["TH"], tags: [] });

    const all = await qaSvc.listQa(ctx, { limit: 30 });
    expect(all.counts.published).toBe(3);
    expect((await qaSvc.listQa(ctx, { stage: "presale", limit: 30 })).items).toHaveLength(1);
    expect((await qaSvc.listQa(ctx, { productId: "none", limit: 30 })).items).toHaveLength(2);
    expect((await qaSvc.listQa(ctx, { productId: products["TL2-B"], limit: 30 })).items).toHaveLength(1);
    expect((await qaSvc.listQa(ctx, { market: "MY", limit: 30 })).items.map((x) => x.questions[0]).sort()).toEqual(["Tail 2 有没有内置麦克风", "退货要几天"].sort());
    expect((await qaSvc.listQa(ctx, { q: "Flash", limit: 30 })).items).toHaveLength(1);
    const p1 = await qaSvc.listQa(ctx, { limit: 2 });
    expect(p1.items).toHaveLength(2);
    const p2 = await qaSvc.listQa(ctx, { limit: 2, cursor: p1.nextCursor! });
    expect(p2.items).toHaveLength(1);
    expect(p2.nextCursor).toBeNull();

    const [before] = await db().select({ e: schema.knowledgeQa.embedding }).from(schema.knowledgeQa).where(eq(schema.knowledgeQa.id, a.qa.id));
    const edited = await qaSvc.updateQa(ctx, a.qa.id, { version: 1, questions: ["Tail 2 有麦克风吗"] });
    expect(edited.qa.version).toBe(2);
    const [after] = await db().select({ e: schema.knowledgeQa.embedding }).from(schema.knowledgeQa).where(eq(schema.knowledgeQa.id, a.qa.id));
    expect(after.e).not.toEqual(before.e);
    expect((await problemOf(qaSvc.updateQa(ctx, a.qa.id, { version: 1, answer: "x" }))).status).toBe(409);
    expect((await problemOf(qaSvc.createQa(ctx, { questions: ["x"], answer: "y", productIds: [randomUUID()], stage: "any", markets: ["ALL"], tags: [] }))).status).toBe(422);
  });

  it("问答检索：只取已发布、站点与阶段对得上、产品重叠或通用的问答，距离超过阈值的不算；没有资料也会检索", async () => {
    const r = await retrieveForDraft({ merchantId: ctx.merchant.id, market: "MY", original: "Tail 2 有麦克风吗", conversation: [], orderFacts: [], stage: "presale", productIds: [products["TL2-B"]] });
    expect(r?.routes).toEqual([]);
    expect(r?.qa?.merged.map((m) => m.hit.questions[0])).toEqual(["Tail 2 有麦克风吗"]);
    expect(r?.qa?.merged[0].n).toBe(1);
    // 产品对不上（Meet 3）时不出现；阶段是售后时不出现；站点 TH 只看适用 TH 或全部站点的
    const other = await retrieveForDraft({ merchantId: ctx.merchant.id, market: "MY", original: "Tail 2 有麦克风吗", conversation: [], orderFacts: [], stage: "presale", productIds: [products.MT3] });
    expect(other?.qa?.merged).toEqual([]);
    const after = await retrieveForDraft({ merchantId: ctx.merchant.id, market: "MY", original: "Tail 2 有麦克风吗", conversation: [], orderFacts: [], stage: "aftersale", productIds: [] });
    expect(after?.qa?.merged.map((m) => m.hit.questions[0])).not.toContain("Tail 2 有麦克风吗");
    const th = await retrieveForDraft({ merchantId: ctx.merchant.id, market: "TH", original: "退货要几天", conversation: [], orderFacts: [], stage: null, productIds: [] });
    expect(th?.qa?.merged.map((m) => m.hit.questions[0])).not.toContain("退货要几天");
    const far = await retrieveForDraft({ merchantId: ctx.merchant.id, market: "MY", original: "zzzz qqqq", conversation: [], orderFacts: [], stage: null, productIds: [] });
    expect(far?.qa).toMatchObject({ merged: [], error: null });
  });

  it("整理成问答：资料解析完成才可发起；生成待审核候选，带原文片段与产品；和已有问答太像的标疑似重复，本轮重复的只留一条；重新整理替换未审核的候选", async () => {
    const body = "OBSBOT Meet 3 支持 4K 30 帧输出画面。\nOBSBOT Meet 3 支持 4K 30 帧输出画面。\n退货要几天这个问题，请看退货政策说明文档。";
    const fd = new FormData();
    fd.append("file", new File([new TextEncoder().encode(body)], "Meet3 规格.txt"));
    const doc = await docs.uploadDocument(ctx, new Request("http://test.invalid/api/v1/knowledge/documents", { method: "POST", body: fd }));
    expect((await problemOf(startQaExtract(ctx, doc.id))).status).toBe(409);
    await ingestDocument({ documentId: doc.id }, svc);
    // 已发布一条和第三句候选问法完全一样的问答，用来验证疑似重复
    const dupTarget = await qaSvc.createQa(ctx, { questions: ["关于「退货要几天这个问题，请看退货政策说明文档」？"], answer: "见退货政策。", productIds: [], stage: "any", markets: ["ALL"], tags: [] });

    enqueue.mockClear();
    const started = await startQaExtract(ctx, doc.id);
    expect(started.document.qaExtract.status).toBe("running");
    expect(enqueue).toHaveBeenCalledWith("knowledge.qa_extract", { documentId: doc.id }, { singletonKey: doc.id });
    expect((await problemOf(startQaExtract(ctx, doc.id))).status).toBe(409);
    await extractQa({ documentId: doc.id });

    const pending = await qaSvc.listQa(ctx, { status: "pending", documentId: doc.id, limit: 30 });
    expect(pending.items).toHaveLength(2);
    const meet = pending.items.find((x) => x.answer.includes("4K"))!;
    expect(meet).toMatchObject({ source: "import", sourceDocument: { id: doc.id, name: "Meet3 规格.txt" }, products: [{ code: "MT3" }], stage: "any", duplicateOf: null, embedded: true });
    expect(meet.sourceExcerpt).toContain("4K");
    expect(pending.items.find((x) => x.answer.includes("退货"))?.duplicateOf).toEqual({ id: dupTarget.qa.id, question: dupTarget.qa.questions[0], status: "published" });
    const [row] = await db().select().from(schema.knowledgeDocument).where(eq(schema.knowledgeDocument.id, doc.id));
    expect(row).toMatchObject({ qaExtractStatus: "done", qaExtractCount: 2 });

    await startQaExtract(ctx, doc.id);
    await extractQa({ documentId: doc.id });
    expect((await qaSvc.listQa(ctx, { status: "pending", documentId: doc.id, limit: 30 })).items).toHaveLength(2);
  });

  it("审核：通过（可带修改）即发布、驳回记原因；已发布可下架与恢复；状态不对 409；资料上显示已发布问答数", async () => {
    const pending = (await qaSvc.listQa(ctx, { status: "pending", limit: 30 })).items;
    const [a, b] = pending;
    const ok = await qaSvc.approveQa(ctx, a.id, { version: a.version, answer: "改过的回复", stage: "presale" });
    expect(ok.qa).toMatchObject({ status: "published", answer: "改过的回复", stage: "presale", reviewedByName: "问答测试", duplicateOf: null });
    expect(ok.qa.publishedAt).not.toBeNull();
    const no = await qaSvc.rejectQa(ctx, b.id, { version: b.version, reason: "资料过期" });
    expect(no.qa).toMatchObject({ status: "rejected", rejectReason: "资料过期" });
    expect((await problemOf(qaSvc.approveQa(ctx, b.id, { version: no.qa.version }))).status).toBe(409);

    const archived = await qaSvc.archiveQa(ctx, a.id, ok.qa.version);
    expect(archived.qa.status).toBe("archived");
    const restored = await qaSvc.restoreQa(ctx, a.id, archived.qa.version);
    expect(restored.qa.status).toBe("published");
    const doc = (await docs.listDocuments(ctx, { limit: 30 })).items.find((d) => d.id === a.sourceDocument?.id);
    expect(doc?.publishedQaCount).toBe(1);
  });

  it("删除产品：还有问答关联时 409，去掉关联后可删；删除问答清掉别的候选上的疑似重复标记", async () => {
    const e = await problemOf(dict.deleteProduct(ctx, products["TL2-B"]));
    expect(e.status).toBe(409);
    await dict.deleteProduct(ctx, products["TL2-W"]);
    expect((await dict.listProducts(ctx, {})).items.map((p) => p.code)).not.toContain("TL2-W");

    const target = await qaSvc.createQa(ctx, { questions: ["要删除的问答"], answer: "a", productIds: [], stage: "any", markets: ["ALL"], tags: [] });
    const [cand] = await db()
      .insert(schema.knowledgeQa)
      .values({ merchantId: ctx.merchant.id, questions: ["要删除的问答？"], answer: "b", stage: "any", status: "pending", source: "import", duplicateOf: target.qa.id })
      .returning();
    await qaSvc.deleteQa(ctx, target.qa.id);
    expect((await qaSvc.getQa(ctx, cand.id)).qa.duplicateOf).toBeNull();
    expect((await problemOf(qaSvc.getQa(ctx, target.qa.id))).status).toBe(404);
  });

  it("识别产品：商品卡 → 订单商品（卖家 SKU 或平台商品）→ 买家文字里的编码、名称、别名", async () => {
    const base = { merchantId: ctx.merchant.id, shopId: shop.id, buyerExternalId: "buyer-x" };
    expect(await dict.identifyProducts({ ...base, productCardIds: ["pl-2"], buyerTexts: ["Tail2 怎么样"] })).toEqual([products.MT3]);
    await db().insert(schema.order).values({ merchantId: ctx.merchant.id, shopId: shop.id, platform: "tiktok", externalOrderId: `o-${randomUUID()}`, buyerExternalId: "buyer-x", platformStatus: "COMPLETED", statusGroup: "completed", totalAmount: "10", currency: "MYR", items: [{ name: "Tail", sellerSku: "tl2-b", qty: 1, unitPrice: "10" }], platformCreatedAt: new Date() });
    expect(await dict.identifyProducts({ ...base, productCardIds: [], buyerTexts: [] })).toEqual([products["TL2-B"]]);
    expect(await dict.identifyProducts({ ...base, buyerExternalId: "nobody", productCardIds: [], buyerTexts: ["我想问下尾巴二代"] })).toEqual([products["TL2-B"]]);
    expect(await dict.identifyProducts({ ...base, buyerExternalId: "nobody", productCardIds: [], buyerTexts: ["你好"] })).toEqual([]);
  });

  it("出稿带问答：载荷里问答在前，草稿依据记问答；下架后依据显示但不可点开；测试问答返回问答命中与引用", async () => {
    const [conv] = await db()
      .insert(schema.conversation)
      .values({ merchantId: ctx.merchant.id, shopId: shop.id, platform: "tiktok", externalConversationId: `c-${randomUUID()}`, buyerExternalId: "buyer-x", buyerName: "买家", handlingState: "bot" })
      .returning();
    const at = new Date(Date.now() - 10_000);
    await db().insert(schema.message).values({ merchantId: ctx.merchant.id, conversationId: conv.id, direction: "in", senderRole: "buyer", type: "text", text: "Tail 2 有麦克风吗", sentAt: at, createdAt: at });
    await db().update(schema.conversation).set({ lastBuyerAt: new Date() }).where(eq(schema.conversation.id, conv.id));
    await generateDraft({ conversationId: conv.id, mode: "assist" });
    const [draft] = await db().select().from(schema.draft).where(eq(schema.draft.conversationId, conv.id));
    expect(draft.status).toBe("generated");
    const [ai] = await db().select().from(schema.devAiStub).where(eq(schema.devAiStub.id, 1));
    const payload = JSON.parse(ai.lastRequest?.messages.find((m) => m.role === "user")?.content ?? "{}");
    expect(payload.knowledge[0]).toMatchObject({ n: 1, title: "问答：Tail 2 有麦克风吗" });
    expect(draft.citations).toEqual([{ n: 1, kind: "qa", qaId: expect.any(String), name: "Tail 2 有麦克风吗" }]);
    expect(draft.retrieval?.qa?.merged[0]).toMatchObject({ n: 1 });
    expect(draft.retrieval?.qa?.productIds).toEqual([products["TL2-B"]]);

    let detail = await getConversation(ctx, conv.id);
    expect(detail.draft?.citations).toEqual([{ kind: "qa", documentId: null, qaId: draft.citations![0].qaId, name: "Tail 2 有麦克风吗", available: true }]);
    const [qa] = await db().select().from(schema.knowledgeQa).where(eq(schema.knowledgeQa.id, draft.citations![0].qaId!));
    await qaSvc.archiveQa(ctx, qa.id, qa.version);
    detail = await getConversation(ctx, conv.id);
    expect(detail.draft?.citations[0].available).toBe(false);
    const [cur] = await db().select().from(schema.knowledgeQa).where(eq(schema.knowledgeQa.id, qa.id));
    await qaSvc.restoreQa(ctx, qa.id, cur.version);

    const test = await askKnowledge(ctx, { question: "Tail 2 有麦克风吗", productId: products["TL2-B"], stage: "presale" });
    expect(test.qa?.merged[0]).toMatchObject({ n: 1, qaId: qa.id });
    expect(test.qa?.hits[0]).toMatchObject({ qaId: qa.id, question: "Tail 2 有麦克风吗", distance: expect.any(Number) });
    expect(test.qaSources).toEqual([{ n: 1, qaId: qa.id, question: "Tail 2 有麦克风吗", answer: expect.any(String) }]);
  });

  it("knowledge.qa_embed 补空向量；卡住超过 30 分钟的「整理中」标失败", async () => {
    const [x] = await db()
      .insert(schema.knowledgeQa)
      .values({ merchantId: ctx.merchant.id, questions: ["没有向量的问答"], answer: "a", stage: "any", status: "published", source: "manual" })
      .returning();
    const r = await qaSvc.embedMissing();
    expect(r.embedded).toBeGreaterThanOrEqual(1);
    const [after] = await db().select({ e: schema.knowledgeQa.embedding }).from(schema.knowledgeQa).where(eq(schema.knowledgeQa.id, x.id));
    expect(after.e).not.toBeNull();

    const [d] = await db().select().from(schema.knowledgeDocument).where(eq(schema.knowledgeDocument.merchantId, ctx.merchant.id)).limit(1);
    await db().update(schema.knowledgeDocument).set({ qaExtractStatus: "running", updatedAt: new Date(Date.now() - 31 * 60_000) }).where(eq(schema.knowledgeDocument.id, d.id));
    expect(await failStaleExtracts()).toBeGreaterThanOrEqual(1);
    const [row] = await db().select().from(schema.knowledgeDocument).where(and(eq(schema.knowledgeDocument.id, d.id)));
    expect(row).toMatchObject({ qaExtractStatus: "failed", qaExtractError: "整理任务中断，请重新整理。" });
  });
});
