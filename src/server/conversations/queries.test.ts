// 需要数据库：DATABASE_URL 未设置时跳过（node --env-file=.env node_modules/vitest/vitest.mjs run 本文件）。
// 每个用例在事务里造数据、最后回滚，不在库里留痕。
import { afterAll, describe, expect, it } from "vitest";
import { db, pool, schema, type Tx } from "@/server/db/client";
import { messagePage, segmentHistory } from "./queries";

class Rollback extends Error {}

async function inRollback(fn: (tx: Tx) => Promise<void>) {
  try {
    await db().transaction(async (tx) => {
      await fn(tx);
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
}

async function newConversation(tx: Tx) {
  const [shop] = await tx.select().from(schema.shop).limit(1);
  const [conv] = await tx
    .insert(schema.conversation)
    .values({ merchantId: shop.merchantId, shopId: shop.id, platform: shop.platform, externalConversationId: `test-${crypto.randomUUID()}`, buyerExternalId: "test-buyer", buyerName: "test", handlingState: "bot" })
    .returning();
  return conv;
}

describe.skipIf(!process.env.DATABASE_URL)("会话详情查询（API-CONV-002）", () => {
  afterAll(() => pool().end());

  it("before 游标翻页：同一秒的多条消息跨页不丢、不重复", async () => {
    await inRollback(async (tx) => {
      const conv = await newConversation(tx);
      const base = Date.UTC(2026, 0, 1, 0, 0, 0);
      // 62 条，每秒 20 条：分页边界落在一秒中间
      const rows = Array.from({ length: 62 }, (_, i) => ({
        merchantId: conv.merchantId,
        conversationId: conv.id,
        direction: "in" as const,
        senderRole: "buyer" as const,
        type: "text" as const,
        text: `m${i}`,
        sentAt: new Date(base + Math.floor(i / 20) * 1000),
      }));
      await tx.insert(schema.message).values(rows);

      const first = await messagePage(conv.id, undefined, tx);
      expect(first.length).toBe(51);
      const page1 = first.slice(0, 50);
      const oldest = page1[page1.length - 1];
      const second = await messagePage(conv.id, oldest.id, tx);
      expect(second.length).toBe(12);

      const texts = [...page1, ...second].map((m) => m.text);
      expect(new Set(texts).size).toBe(62);
      // 倒序：同一秒内按写入顺序
      expect(texts).toEqual(Array.from({ length: 62 }, (_, i) => `m${61 - i}`));
    });
  });

  it("历史会话段：每段的消息数（不含系统事件）", async () => {
    await inRollback(async (tx) => {
      const conv = await newConversation(tx);
      const [s1] = await tx.insert(schema.segment).values({ merchantId: conv.merchantId, conversationId: conv.id, stage: "unknown", startedAt: new Date(Date.UTC(2026, 0, 1)) }).returning();
      const [s2] = await tx.insert(schema.segment).values({ merchantId: conv.merchantId, conversationId: conv.id, stage: "unknown", startedAt: new Date(Date.UTC(2026, 0, 2)) }).returning();
      const msg = (segmentId: string, i: number, senderRole: "buyer" | "system" = "buyer") => ({
        merchantId: conv.merchantId,
        conversationId: conv.id,
        segmentId,
        direction: "in" as const,
        senderRole,
        type: "text" as const,
        text: `x${i}`,
        sentAt: new Date(Date.UTC(2026, 0, 1) + i * 1000),
      });
      await tx.insert(schema.message).values([...Array.from({ length: 8 }, (_, i) => msg(s1.id, i)), msg(s1.id, 99, "system"), ...Array.from({ length: 2 }, (_, i) => msg(s2.id, 100 + i))]);
      const [s3] = await tx.insert(schema.segment).values({ merchantId: conv.merchantId, conversationId: conv.id, stage: "unknown", startedAt: new Date(Date.UTC(2026, 0, 3)) }).returning();

      const history = await segmentHistory(conv.id, tx);
      expect(history.map((h) => [h.seg.id, h.messages])).toEqual([
        [s3.id, 0],
        [s2.id, 2],
        [s1.id, 8],
      ]);
    });
  });
});
