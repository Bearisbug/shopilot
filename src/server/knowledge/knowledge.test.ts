// 需要数据库：DATABASE_URL 未设置时跳过（set -a && . ./.env && set +a && pnpm exec vitest run src/server/knowledge）。
// 知识库后端：上传与格式拒收、入库（替身检索）与重传、拆分、删除与 purge、分类、改分类站点开关、出稿检索过滤、
// 出稿依据与资料不足转人工、测试问答、原文件鉴权。造的商户与文件在 afterAll 删除，替身设定恢复原值。
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import { PDFDocument, PDFName } from "pdf-lib";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { can, permissionsFor, type Role } from "@/lib/permissions";

const { enqueue } = vi.hoisted(() => ({ enqueue: vi.fn<(...args: unknown[]) => Promise<null>>(async () => null) }));
vi.mock("@/server/jobs/boss", () => ({ enqueue }));

describe("knowledge.manage 权限（§10）", () => {
  it("管理员、组长可用，员工不可用", () => {
    expect(can("admin", false, "knowledge.manage")).toBe(true);
    expect(can("lead", false, "knowledge.manage")).toBe(true);
    expect(can("agent", false, "knowledge.manage")).toBe(false);
  });

  it("知识库接口每个处理器都要求 knowledge.manage", async () => {
    const root = path.resolve(import.meta.dirname, "../../app/api/v1/knowledge");
    const files = ["documents/route.ts", "documents/[id]/route.ts", "documents/[id]/chunks/route.ts", "documents/[id]/reparse/route.ts", "categories/route.ts", "categories/[id]/route.ts", "test/route.ts"];
    for (const f of files) {
      const src = await readFile(path.join(root, f), "utf8");
      const handlers = src.match(/export const (GET|POST|PATCH|DELETE) = route\(/g) ?? [];
      const guarded = src.match(/perm: "knowledge\.manage"/g) ?? [];
      expect(handlers.length, f).toBeGreaterThan(0);
      expect(guarded.length, f).toBe(handlers.length);
    }
  });
});

describe.skipIf(!process.env.DATABASE_URL)("知识库（需要数据库）", async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "shopilot-kb-test-"));
  process.env.DATA_DIR = dataDir;
  process.env.KNOWLEDGE_MODE = "stub";
  process.env.AI_MODE = "stub";
  const { db, pool, schema } = await import("@/server/db/client");
  const { encrypt } = await import("@/server/core/crypto");
  const { provisionMerchant } = await import("@/server/merchants/provision");
  const { Problem } = await import("@/server/http/problem");
  const docs = await import("./documents");
  const cats = await import("./categories");
  const { ingestDocument } = await import("./ingest");
  const { purgeDocument } = await import("./purge");
  const { retrieveForDraft } = await import("./retrieve");
  const { stubSearchService, STUB_INGEST_ERROR } = await import("./stub");
  const { instanceName } = await import("./types");
  const { askKnowledge } = await import("./ask");
  const { generateDraft } = await import("@/server/ai/draft");
  const { getConversation } = await import("@/server/conversations/queries");
  const { downloadFile } = await import("@/server/files/service");
  type MemberContext = import("@/server/auth/context").MemberContext;
  type Merchant = typeof schema.merchant.$inferSelect;

  const svc = stubSearchService();
  const userIds: string[] = [];
  const merchantIds: string[] = [];
  let savedAiStub: typeof schema.devAiStub.$inferSelect | undefined;
  let savedKbStub: typeof schema.devKnowledgeStub.$inferSelect | undefined;

  async function newMerchant(name: string) {
    const userId = `test-${randomUUID()}`;
    await db().insert(schema.user).values({ id: userId, name, email: `${userId}@test.invalid` });
    userIds.push(userId);
    const res = await db().transaction((tx) => provisionMerchant(tx, { name, timezone: "Asia/Kuala_Lumpur", ownerUserId: userId }));
    merchantIds.push(res.merchant.id);
    return { merchant: res.merchant, membershipId: res.membership.id, userId };
  }

  async function addMember(merchant: Merchant, role: Role, shopIds: string[] = []) {
    const userId = `test-${randomUUID()}`;
    await db().insert(schema.user).values({ id: userId, name: role, email: `${userId}@test.invalid` });
    userIds.push(userId);
    const [m] = await db().insert(schema.membership).values({ merchantId: merchant.id, userId, role }).returning();
    if (shopIds.length) await db().insert(schema.membershipShop).values(shopIds.map((shopId) => ({ membershipId: m.id, shopId })));
    return ctxFor(merchant, m.id, userId, role, role === "admin" ? null : shopIds);
  }

  function ctxFor(merchant: Merchant, membershipId: string, userId: string, role: Role, shopIds: string[] | null): MemberContext {
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
      shopIds,
      twoFactorRequired: false,
      actor: { kind: "member", merchantId: merchant.id, membershipId, userId, name: `测试${role}`, requestId: "req_test" },
      can: (p) => can(role, isOwner, p),
      permissions: permissionsFor(role, isOwner),
    };
  }

  function uploadReq(name: string, bytes: Uint8Array, fields: { categoryId?: string; markets?: string[] } = {}) {
    const fd = new FormData();
    fd.append("file", new File([new Uint8Array(bytes)], name));
    if (fields.categoryId) fd.append("categoryId", fields.categoryId);
    for (const m of fields.markets ?? []) fd.append("markets[]", m);
    return new Request("http://test.invalid/api/v1/knowledge/documents", { method: "POST", body: fd });
  }

  const text = (s: string) => new TextEncoder().encode(s);
  const docRow = async (id: string) => (await db().select().from(schema.knowledgeDocument).where(eq(schema.knowledgeDocument.id, id)))[0];
  async function setKbStub(next: "normal" | "no_vector" | "timeout" | "error" | "ingest_error", sticky = false) {
    await db().insert(schema.devKnowledgeStub).values({ id: 1, next, sticky }).onConflictDoUpdate({ target: schema.devKnowledgeStub.id, set: { next, sticky } });
  }
  async function setAiStub(next: "normal" | "insufficient", sticky = false) {
    await db().insert(schema.devAiStub).values({ id: 1, next, sticky }).onConflictDoUpdate({ target: schema.devAiStub.id, set: { next, sticky } });
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
  async function uploadReady(ctx: MemberContext, name: string, bytes: Uint8Array, fields: { categoryId?: string; markets?: string[] } = {}) {
    const doc = await docs.uploadDocument(ctx, uploadReq(name, bytes, fields));
    await ingestDocument({ documentId: doc.id }, svc);
    return doc;
  }
  async function pdfWithPages(sizes: number[]): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    for (const size of sizes) {
      const page = doc.addPage([200, 200]);
      page.node.set(PDFName.of("Junk"), doc.context.register(doc.context.stream(randomBytes(size))));
    }
    return doc.save({ useObjectStreams: true });
  }

  let admin: MemberContext;

  beforeAll(async () => {
    [savedAiStub] = await db().select().from(schema.devAiStub).where(eq(schema.devAiStub.id, 1));
    [savedKbStub] = await db().select().from(schema.devKnowledgeStub).where(eq(schema.devKnowledgeStub.id, 1));
    const m = await newMerchant("知识库测试");
    admin = ctxFor(m.merchant, m.membershipId, m.userId, "admin", null);
    await setKbStub("normal");
    await setAiStub("normal");
  });

  beforeEach(() => enqueue.mockClear());

  afterAll(async () => {
    const restoreAi = savedAiStub ? { next: savedAiStub.next, sticky: savedAiStub.sticky, lastRequest: savedAiStub.lastRequest } : { next: "normal" as const, sticky: false, lastRequest: null };
    await db().insert(schema.devAiStub).values({ id: 1, ...restoreAi }).onConflictDoUpdate({ target: schema.devAiStub.id, set: restoreAi });
    const restoreKb = savedKbStub ? { next: savedKbStub.next, sticky: savedKbStub.sticky, lastQuery: savedKbStub.lastQuery } : { next: "normal" as const, sticky: false, lastQuery: null };
    await db().insert(schema.devKnowledgeStub).values({ id: 1, ...restoreKb }).onConflictDoUpdate({ target: schema.devKnowledgeStub.id, set: restoreKb });
    if (merchantIds.length) await db().delete(schema.merchant).where(inArray(schema.merchant.id, merchantIds));
    if (userIds.length) await db().delete(schema.user).where(inArray(schema.user.id, userIds));
    await pool().end();
    await rm(dataDir, { recursive: true, force: true });
  });

  it("上传后排队，入库读回分块变为可用；列表按状态、站点、文件名筛选", async () => {
    const body = "保修政策：所有相机保修 12 个月。" + "说明".repeat(1600);
    const doc = await docs.uploadDocument(admin, uploadReq("保修政策.md", text(body)));
    expect(doc).toMatchObject({ status: "queued", markets: ["ALL"], aiEnabled: true, uploadedByName: "知识库测试" });
    expect(enqueue).toHaveBeenCalledWith("knowledge.ingest", expect.objectContaining({ documentId: doc.id }), { singletonKey: doc.id });

    await ingestDocument({ documentId: doc.id }, svc);
    const detail = await docs.getDocument(admin, doc.id);
    expect(detail.document).toMatchObject({ status: "ready", partsCount: 1, chunksCount: 3 });
    expect(detail.parts).toEqual([{ partNo: 1, pageFrom: null, pageTo: null, status: "indexed", retries: 0, error: null }]);
    expect(detail.fileUrl).toMatch(/^\/api\/v1\/files\/[0-9a-f-]{36}$/);
    const [idx] = await db().select().from(schema.knowledgeIndex).where(eq(schema.knowledgeIndex.merchantId, admin.merchant.id));
    expect(idx.instanceName).toBe(instanceName(admin.merchant.id));
    expect(idx.instanceName).toMatch(/^sp-[0-9a-f]{12}$/);

    const chunks = await docs.listDocumentChunks(admin, doc.id);
    expect(chunks.items.map((c) => [c.no, c.partNo])).toEqual([[1, 1], [2, 1], [3, 1]]);
    expect(chunks.items[0].text.startsWith("保修政策：所有相机保修 12 个月。")).toBe(true);

    const list = (q: Record<string, unknown>) => docs.listDocuments(admin, { limit: 30, ...q });
    expect((await list({ status: "ready" })).items.map((i) => i.id)).toContain(doc.id);
    expect((await list({ status: "failed" })).items.map((i) => i.id)).not.toContain(doc.id);
    expect((await list({ market: "MY" })).items.map((i) => i.id)).toContain(doc.id);
    expect((await list({ q: "保修" })).items.map((i) => i.id)).toContain(doc.id);
    expect((await list({ q: "不存在的名字" })).items).toEqual([]);
    expect((await list({})).counts.limit).toBe(500);
    const audits = await db().select({ action: schema.auditLog.action }).from(schema.auditLog).where(eq(schema.auditLog.targetId, doc.id));
    expect(audits.map((a) => a.action).sort()).toEqual(["knowledge_ready", "knowledge_uploaded"]);
  });

  it("内容相同的文件 409 并给出已有资料名；PPT 415 不建资料", async () => {
    const bytes = text("型号对照：Tiny 3 支持 4K。");
    const first = await docs.uploadDocument(admin, uploadReq("型号对照.txt", bytes));
    const dup = await problemOf(docs.uploadDocument(admin, uploadReq("另一个名字.txt", bytes)));
    expect(dup).toMatchObject({ status: 409, type: "duplicate", extra: { existingId: first.id, existingName: "型号对照.txt" } });
    const before = (await docs.listDocuments(admin, { limit: 30 })).counts.total;
    const ppt = await problemOf(docs.uploadDocument(admin, uploadReq("产品介绍.pptx", new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]))));
    expect(ppt).toMatchObject({ status: 415, code: "ppt_export_pdf" });
    expect((await docs.listDocuments(admin, { limit: 30 })).counts.total).toBe(before);
  });

  it("索引报错一次：删除后同名重传，资料最终可用", async () => {
    await setKbStub("ingest_error");
    const doc = await uploadReady(admin, "运费说明.md", text("运费：满 50 包邮。"));
    expect((await docs.getDocument(admin, doc.id)).parts[0]).toMatchObject({ status: "indexed", retries: 1 });
    expect((await docRow(doc.id)).status).toBe("ready");
  });

  it("一直报错：重传 2 次后失败，原因含检索服务的错误，检索服务里不留条目；可重新解析", async () => {
    await setKbStub("ingest_error", true);
    const doc = await uploadReady(admin, "退货政策.md", text("退货：7 天无理由。"));
    const row = await docRow(doc.id);
    expect(row.status).toBe("failed");
    expect(row.failureReason).toContain("已重传 2 次");
    expect(row.failureReason).toContain(STUB_INGEST_ERROR);
    const [part] = await db().select().from(schema.knowledgePart).where(eq(schema.knowledgePart.documentId, doc.id));
    expect(part).toMatchObject({ status: "failed", retries: 2 });
    expect(await svc.findItem(instanceName(admin.merchant.id), part.itemKey)).toBeNull();

    await setKbStub("normal");
    const again = await docs.reparseDocument(admin, doc.id);
    expect(again).toMatchObject({ status: "queued", failureReason: null });
    expect(enqueue).toHaveBeenCalledWith("knowledge.ingest", expect.objectContaining({ documentId: doc.id }), { singletonKey: doc.id });
    const conflict = await problemOf(docs.reparseDocument(admin, doc.id));
    expect(conflict).toMatchObject({ status: 409, type: "conflict", code: "processing" });
    await ingestDocument({ documentId: doc.id }, svc);
    expect((await docRow(doc.id)).status).toBe("ready");
  });

  it("超过 10 MB 的 PDF 按页拆成多个条目；单页超过 10 MB 判失败并写页码", async () => {
    const MiB = 1024 * 1024;
    const big = await uploadReady(admin, "扫描件.pdf", await pdfWithPages([4 * MiB, 4 * MiB, 4 * MiB]));
    const detail = await docs.getDocument(admin, big.id);
    expect(detail.document.status).toBe("ready");
    expect(detail.parts.map((p) => [p.partNo, p.pageFrom, p.pageTo, p.status])).toEqual([
      [1, 1, 2, "indexed"],
      [2, 3, 3, "indexed"],
    ]);
    expect((await docs.listDocumentChunks(admin, big.id)).items.map((c) => c.partNo)).toEqual([1, 2]);

    const huge = await uploadReady(admin, "超大单页.pdf", await pdfWithPages([1 * MiB, 11 * MiB]));
    const row = await docRow(huge.id);
    expect(row).toMatchObject({ status: "failed", failureReason: "第 2 页超过 10 MB，请压缩后重传" });
  });

  it("删除：立即从接口消失，purge 先删检索条目再删原文件与记录；重复删除不报错", async () => {
    const doc = await uploadReady(admin, "旧版保修政策.md", text("旧版：保修 6 个月。"));
    const [part] = await db().select().from(schema.knowledgePart).where(eq(schema.knowledgePart.documentId, doc.id));
    const [file] = await db().select().from(schema.file).where(eq(schema.file.id, (await docRow(doc.id)).fileId));
    expect(existsSync(path.join(dataDir, file.path))).toBe(true);

    await docs.deleteDocument(admin, doc.id);
    await docs.deleteDocument(admin, doc.id);
    expect(enqueue.mock.calls.filter((c) => c[0] === "knowledge.purge")).toHaveLength(1);
    expect((await docs.listDocuments(admin, { limit: 100 })).items.map((i) => i.id)).not.toContain(doc.id);
    expect(await problemOf(docs.getDocument(admin, doc.id))).toMatchObject({ status: 404 });

    await purgeDocument(doc.id, svc);
    expect(await docRow(doc.id)).toBeUndefined();
    expect(await svc.findItem(instanceName(admin.merchant.id), part.itemKey)).toBeNull();
    expect((await db().select().from(schema.file).where(eq(schema.file.id, file.id))).length).toBe(0);
    expect(existsSync(path.join(dataDir, file.path))).toBe(false);
  });

  it("入库途中资料被删除：入库停下并删掉刚上传的条目（INV-KB-003）", async () => {
    const doc = await docs.uploadDocument(admin, uploadReq("中途删除.md", text("中途删除的资料")));
    const racing = {
      ...svc,
      async uploadItem(instance: string, item: Parameters<typeof svc.uploadItem>[1]) {
        const out = await svc.uploadItem(instance, item);
        await docs.deleteDocument(admin, doc.id);
        return out;
      },
    };
    await ingestDocument({ documentId: doc.id }, racing);
    expect((await docRow(doc.id)).status).toBe("deleting");
    expect(await svc.findItem(instanceName(admin.merchant.id), `${doc.id}/1.md`)).toBeNull();
    await purgeDocument(doc.id, svc);
    expect(await docRow(doc.id)).toBeUndefined();
  });

  it("分类：增改删、同名 409、内置「未分类」不能改名删除、删除时资料归入未分类、最多 50 个", async () => {
    const first = await cats.listCategories(admin);
    expect(first.items[0]).toMatchObject({ name: "未分类", builtin: true });
    const builtin = first.items[0].id;
    const c = await cats.createCategory(admin, "售后政策");
    expect(await problemOf(cats.createCategory(admin, "售后政策"))).toMatchObject({ status: 409, type: "duplicate" });
    expect((await cats.renameCategory(admin, c.id, "保修与退换")).name).toBe("保修与退换");
    expect(await problemOf(cats.renameCategory(admin, builtin, "别的"))).toMatchObject({ status: 409, type: "not-allowed", code: "builtin" });
    expect(await problemOf(cats.deleteCategory(admin, builtin))).toMatchObject({ status: 409, type: "not-allowed", code: "builtin" });

    const moved = [];
    for (const i of [1, 2, 3]) moved.push(await docs.uploadDocument(admin, uploadReq(`分类资料${i}.txt`, text(`分类资料 ${i}`), { categoryId: c.id })));
    expect((await cats.listCategories(admin)).items.find((x) => x.id === c.id)?.documentCount).toBe(3);
    expect(await cats.deleteCategory(admin, c.id)).toEqual({ movedDocuments: 3 });
    for (const m of moved) expect((await docRow(m.id)).categoryId).toBe(builtin);
    expect(await problemOf(cats.deleteCategory(admin, c.id))).toMatchObject({ status: 404 });
    expect(await problemOf(docs.uploadDocument(admin, uploadReq("x.txt", text("x"), { categoryId: c.id })))).toMatchObject({ status: 422 });

    const existing = (await cats.listCategories(admin)).items.length;
    for (let i = existing; i < 50; i++) await cats.createCategory(admin, `分类${i}`);
    expect(await problemOf(cats.createCategory(admin, "第五十一个"))).toMatchObject({ status: 409, type: "not-allowed", code: "category_quota" });
  });

  it("改分类、站点、AI 可用立即生效，不重新解析；分类不存在 422", async () => {
    const doc = await uploadReady(admin, "站点资料.txt", text("站点资料"));
    const updated = await docs.updateDocument(admin, doc.id, { markets: ["MY"], aiEnabled: false });
    expect(updated).toMatchObject({ markets: ["MY"], aiEnabled: false, status: "ready", chunksCount: 1 });
    expect(await problemOf(docs.updateDocument(admin, doc.id, { categoryId: randomUUID() }))).toMatchObject({ status: 422 });
  });

  it("别的商户的资料与分类一律 404，删除也不生效（ADR-003）", async () => {
    const doc = await uploadReady(admin, "跨商户.txt", text("跨商户资料"));
    const other = await newMerchant("别的商户");
    const otherCtx = ctxFor(other.merchant, other.membershipId, other.userId, "admin", null);
    expect(await problemOf(docs.getDocument(otherCtx, doc.id))).toMatchObject({ status: 404 });
    expect(await problemOf(docs.listDocumentChunks(otherCtx, doc.id))).toMatchObject({ status: 404 });
    expect(await problemOf(docs.updateDocument(otherCtx, doc.id, { aiEnabled: false }))).toMatchObject({ status: 404 });
    expect(await problemOf(docs.reparseDocument(otherCtx, doc.id))).toMatchObject({ status: 404 });
    await docs.deleteDocument(otherCtx, doc.id);
    expect((await docRow(doc.id)).status).toBe("ready");
    const builtin = (await cats.listCategories(admin)).items[0].id;
    expect(await problemOf(cats.renameCategory(otherCtx, builtin, "改不了"))).toMatchObject({ status: 404 });
    expect((await docs.listDocuments(otherCtx, { limit: 30 })).items).toEqual([]);
    expect(await problemOf(docs.uploadDocument(otherCtx, uploadReq("y.txt", text("y"), { categoryId: builtin })))).toMatchObject({ status: 422 });
  });

  it("资料满 500 份：两份同时上传只放行一份，越限的 409", async () => {
    const m = await newMerchant("资料上限");
    const ctx = ctxFor(m.merchant, m.membershipId, m.userId, "admin", null);
    const categoryId = await cats.builtinCategoryId(m.merchant.id);
    await db()
      .insert(schema.knowledgeDocument)
      .values(Array.from({ length: 499 }, (_, i) => ({ merchantId: m.merchant.id, categoryId, fileId: randomUUID(), name: `占位${i}.txt`, mime: "text/plain", size: 1, sha256: `sha-${i}`, status: "failed" as const, failureReason: "占位" })));
    const results = await Promise.allSettled([docs.uploadDocument(ctx, uploadReq("a.txt", text("aaa"))), docs.uploadDocument(ctx, uploadReq("b.txt", text("bbb")))]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ status: 409, type: "not-allowed", code: "document_quota" });
  });

  describe("出稿检索、依据与测试问答", () => {
    let shop: typeof schema.shop.$inferSelect;
    let shopTh: typeof schema.shop.$inferSelect;
    let ctx: MemberContext;
    let warrantyId = "";
    let myOnlyId = "";
    let disabledId = "";

    beforeAll(async () => {
      const m = await newMerchant("检索测试");
      ctx = ctxFor(m.merchant, m.membershipId, m.userId, "admin", null);
      const [app] = await db()
        .insert(schema.platformApp)
        .values({ merchantId: m.merchant.id, platform: "tiktok", appKey: `app-${randomUUID()}`, secretEnc: encrypt("secret"), region: "sg", status: "verified" })
        .returning();
      const caps = { chat: true, orders: true, piiMasked: false, productScope: false, cards: [], coupons: false, endSession: false, maxTextLength: 500 };
      [shop] = await db()
        .insert(schema.shop)
        .values({ merchantId: m.merchant.id, platformAppId: app.id, platform: "tiktok", externalShopId: "s-my", shopCipher: "c", name: "TikTok MY", market: "MY", accessTokenEnc: encrypt("t"), refreshTokenEnc: encrypt("r"), accessExpiresAt: new Date(Date.now() + 86_400_000), capabilities: caps })
        .returning();
      [shopTh] = await db()
        .insert(schema.shop)
        .values({ merchantId: m.merchant.id, platformAppId: app.id, platform: "tiktok", externalShopId: "s-th", shopCipher: "c2", name: "TikTok TH", market: "TH", accessTokenEnc: encrypt("t"), refreshTokenEnc: encrypt("r"), accessExpiresAt: new Date(Date.now() + 86_400_000), capabilities: caps })
        .returning();
      await setKbStub("normal");
      warrantyId = (await uploadReady(ctx, "保修政策.txt", text("保修多久：所有相机保修 12 个月。"))).id;
      myOnlyId = (await uploadReady(ctx, "马来站保修.txt", text("马来西亚站保修多久：保修 18 个月。"), { markets: ["MY"] })).id;
      disabledId = (await uploadReady(ctx, "停用资料.txt", text("停用资料：保修多久 3 个月。"))).id;
      await docs.updateDocument(ctx, disabledId, { aiEnabled: false });
    });

    it("只引用解析完成、AI 可用开着、站点相符的资料（RULE-KB-001）", async () => {
      const docsOf = (r: Awaited<ReturnType<typeof retrieveForDraft>>) => [...new Set(r?.merged.map((x) => x.chunk.documentId))].sort();
      const th = await retrieveForDraft({ merchantId: ctx.merchant.id, market: "TH", original: "保修多久", conversation: [], orderFacts: [] });
      expect(docsOf(th)).toEqual([warrantyId]);
      const my = await retrieveForDraft({ merchantId: ctx.merchant.id, market: "MY", original: "保修多久", conversation: [], orderFacts: [] });
      expect(docsOf(my)).toEqual([warrantyId, myOnlyId].sort());
      expect(my?.routes.map((r) => [r.kind, r.mode])).toEqual([
        ["rewritten", "hybrid"],
        ["original", "hybrid"],
      ]);
      expect(my?.degraded).toBe(false);
      const [stub] = await db().select().from(schema.devKnowledgeStub).where(eq(schema.devKnowledgeStub.id, 1));
      expect(stub.lastQuery?.slice(-2).map((q) => q.query)).toEqual(["保修多久", "保修多久"]);
      // 站点为 TW 等其他值的店只匹配「全部站点」；没有可用资料时不改写、不检索
      expect(docsOf(await retrieveForDraft({ merchantId: ctx.merchant.id, market: "TW", original: "保修多久", conversation: [], orderFacts: [] }))).toEqual([warrantyId]);
      const other = await newMerchant("没有资料");
      expect(await retrieveForDraft({ merchantId: other.merchant.id, market: "MY", original: "保修多久", conversation: [], orderFacts: [] })).toBeNull();
    });

    it("混合检索没有向量分时改用纯向量重试；两路都超时则降级、不带资料", async () => {
      await setKbStub("no_vector", true);
      const retried = await retrieveForDraft({ merchantId: ctx.merchant.id, market: "MY", original: "保修多久", conversation: [], orderFacts: [] });
      expect(retried?.vectorRetry).toBe(true);
      expect(retried?.routes.map((r) => [r.kind, r.mode, r.error])).toEqual([
        ["rewritten", "hybrid", "no_vector"],
        ["rewritten", "vector_only", null],
        ["original", "hybrid", "no_vector"],
        ["original", "vector_only", null],
      ]);
      expect(retried?.merged.length).toBeGreaterThan(0);

      await setKbStub("timeout", true);
      const failed = await retrieveForDraft({ merchantId: ctx.merchant.id, market: "MY", original: "保修多久", conversation: [], orderFacts: [] });
      expect(failed).toMatchObject({ degraded: true, merged: [] });
      expect(failed?.degradedReason).toContain("timeout");
      await setKbStub("normal");
    });

    async function buyerSays(conversationId: string, textMsg: string) {
      await db().insert(schema.message).values({ merchantId: ctx.merchant.id, conversationId, direction: "in", senderRole: "buyer", type: "text", text: textMsg, sentAt: new Date() });
      await db().update(schema.conversation).set({ lastBuyerAt: new Date() }).where(eq(schema.conversation.id, conversationId));
    }

    it("出稿带资料片段，草稿存检索快照与依据；资料删除后依据仍显示文件名但不可点开", async () => {
      const [conv] = await db()
        .insert(schema.conversation)
        .values({ merchantId: ctx.merchant.id, shopId: shop.id, platform: "tiktok", externalConversationId: `c-${randomUUID()}`, buyerExternalId: "b1", buyerName: "买家", handlingState: "bot" })
        .returning();
      await buyerSays(conv.id, "保修多久");
      await setAiStub("normal");
      await generateDraft({ conversationId: conv.id, mode: "assist" });
      const [draft] = await db().select().from(schema.draft).where(eq(schema.draft.conversationId, conv.id));
      expect(draft).toMatchObject({ status: "generated", insufficient: false });
      expect(draft.citations).toHaveLength(1);
      expect(draft.retrieval?.merged.length).toBeGreaterThan(0);
      expect(draft.retrieval?.routes.map((r) => r.kind)).toEqual(["rewritten", "original"]);
      const [ai] = await db().select().from(schema.devAiStub).where(eq(schema.devAiStub.id, 1));
      const payload = JSON.parse(ai.lastRequest?.messages.find((m) => m.role === "user")?.content ?? "{}");
      expect(payload.knowledge[0]).toMatchObject({ n: 1, title: expect.any(String), text: expect.any(String) });
      expect(draft.text).not.toMatch(/\[\d\]/);

      const cited = draft.citations![0];
      let detail = await getConversation(ctx, conv.id);
      expect(detail.draft?.citations).toEqual([{ documentId: cited.documentId, name: cited.name, available: true }]);
      await db().update(schema.knowledgeDocument).set({ status: "deleting" }).where(eq(schema.knowledgeDocument.id, cited.documentId));
      detail = await getConversation(ctx, conv.id);
      expect(detail.draft?.citations[0].available).toBe(false);
      await db().update(schema.knowledgeDocument).set({ status: "ready" }).where(eq(schema.knowledgeDocument.id, cited.documentId));
    });

    it("模型判定资料不足时不论阈值一律转人工，原因记 low_confidence，审计带资料不足标记（RULE-KB-003）", async () => {
      const [conv] = await db()
        .insert(schema.conversation)
        .values({ merchantId: ctx.merchant.id, shopId: shop.id, platform: "tiktok", externalConversationId: `c-${randomUUID()}`, buyerExternalId: "b2", buyerName: "买家二", handlingState: "bot" })
        .returning();
      await db().update(schema.receptionSettings).set({ confidenceThreshold: 0.5 }).where(eq(schema.receptionSettings.merchantId, ctx.merchant.id));
      await buyerSays(conv.id, "这个能连接 iPad 吗");
      const [usageBefore] = await db().select().from(schema.usagePeriod).where(eq(schema.usagePeriod.merchantId, ctx.merchant.id));
      await setAiStub("insufficient");
      await generateDraft({ conversationId: conv.id, mode: "assist" });
      expect(await db().select().from(schema.draft).where(eq(schema.draft.conversationId, conv.id))).toEqual([]);
      const [after] = await db().select().from(schema.conversation).where(eq(schema.conversation.id, conv.id));
      expect(after).toMatchObject({ handlingState: "awaiting_human", handoffReason: "low_confidence" });
      const [evt] = await db()
        .select()
        .from(schema.auditLog)
        .where(and(eq(schema.auditLog.targetId, conv.id), eq(schema.auditLog.action, "handoff")));
      expect(evt.data).toMatchObject({ reason: "low_confidence", insufficient: true, retrieval_degraded: false });
      const [usageAfter] = await db().select().from(schema.usagePeriod).where(eq(schema.usagePeriod.merchantId, ctx.merchant.id));
      expect(usageAfter.draftsUsed).toBe(usageBefore.draftsUsed);
    });

    it("测试问答：同链路回答、给出引用与检索明细，不计出稿用量；资料不足时显示会转人工", async () => {
      await setAiStub("normal");
      const [usageBefore] = await db().select().from(schema.usagePeriod).where(eq(schema.usagePeriod.merchantId, ctx.merchant.id));
      const res = await askKnowledge(ctx, { question: "保修多久", shopId: shop.id });
      expect(res).toMatchObject({ insufficient: false, wouldHandoff: false, handoffReason: null });
      expect(res.sources[0]).toMatchObject({ n: 1, fileUrl: expect.stringMatching(/^\/api\/v1\/files\//) });
      expect(res.retrieval?.rewrittenQuery).toBe("保修多久");
      expect(res.retrieval?.routes[0].chunks[0]).toMatchObject({ scoreDetails: { vectorScore: expect.any(Number) } });
      expect(res.retrieval?.merged[0].n).toBe(1);
      const [usageAfter] = await db().select().from(schema.usagePeriod).where(eq(schema.usagePeriod.merchantId, ctx.merchant.id));
      expect(usageAfter.draftsUsed).toBe(usageBefore.draftsUsed);
      expect(await db().select().from(schema.draft).where(eq(schema.draft.merchantId, ctx.merchant.id))).toHaveLength(1);

      const th = await askKnowledge(ctx, { question: "保修多久", shopId: shopTh.id });
      expect(th.retrieval?.merged.map((m) => m.documentId)).not.toContain(myOnlyId);

      await setAiStub("insufficient");
      const insufficient = await askKnowledge(ctx, { question: "能连接 iPad 吗" });
      expect(insufficient).toMatchObject({ insufficient: true, wouldHandoff: true, handoffReason: "low_confidence" });

      const lead = await addMember(ctx.merchant, "lead", [shopTh.id]);
      expect(await problemOf(askKnowledge(lead, { question: "保修多久", shopId: shop.id }))).toMatchObject({ status: 404 });
    });

    it("原文件预览只给有 knowledge.manage 的成员；员工 403", async () => {
      const row = await docRow(warrantyId);
      const agent = await addMember(ctx.merchant, "agent", [shop.id]);
      expect(await problemOf(downloadFile(agent, row.fileId))).toMatchObject({ status: 403 });
      const lead = await addMember(ctx.merchant, "lead", [shop.id]);
      const res = await downloadFile(lead, row.fileId);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-disposition")).toContain(encodeURIComponent("保修政策.txt"));
      await res.body?.cancel();
    });
  });
});

describe("测试问答限流（§15）", () => {
  it("每商户每分钟 20 次，第 21 次 429，过了一分钟恢复", async () => {
    const { takeTestQuota } = await import("./ask");
    const id = randomUUID();
    const t0 = 1_000_000;
    for (let i = 0; i < 20; i++) takeTestQuota(id, t0 + i);
    expect(() => takeTestQuota(id, t0 + 30_000)).toThrow(/每分钟最多 20 次/);
    expect(() => takeTestQuota(id, t0 + 60_000)).not.toThrow();
  });
});
