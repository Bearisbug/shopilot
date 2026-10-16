// 需要数据库：DATABASE_URL 未设置时跳过（node --env-file=.env node_modules/vitest/vitest.mjs run 本文件）。
// 每个用例在事务里造数据、最后回滚，不在库里留痕。
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import type { MemberContext } from "@/server/auth/context";
import { db, pool, schema, type Tx } from "@/server/db/client";
import { viewCondition, visibleConversations, type ConvView } from "./scope";

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

const c = schema.conversation;

describe.skipIf(!process.env.DATABASE_URL)("会话分组（API-CONV-001、API-NAV-001）", () => {
  afterAll(() => pool().end());

  it("平台后台处理、没有处理人的会话归「他人处理中」，不进待认领；员工只看到这一种他人会话", async () => {
    await inRollback(async (tx) => {
      const [shop] = await tx.select().from(schema.shop).limit(1);
      const [me, colleague] = await tx.select().from(schema.membership).where(eq(schema.membership.merchantId, shop.merchantId)).limit(2);
      const conv = async (handlingState: "awaiting_human" | "human", claimedBy: string | null) => {
        const [row] = await tx
          .insert(c)
          .values({ merchantId: shop.merchantId, shopId: shop.id, platform: shop.platform, externalConversationId: `test-${crypto.randomUUID()}`, buyerExternalId: "test-buyer", buyerName: "test", handlingState, claimedBy })
          .returning();
        return row.id;
      };
      const backend = await conv("human", null);
      const theirs = await conv("human", colleague.id);
      const mine = await conv("human", me.id);
      const queued = await conv("awaiting_human", null);
      const ids = [backend, theirs, mine, queued];

      const ctxAs = (role: "agent" | "lead") => ({ merchant: { id: shop.merchantId }, membership: { id: me.id, role, status: "active" }, shopIds: [shop.id] }) as unknown as MemberContext;
      const inView = async (ctx: MemberContext, view: ConvView) =>
        (await tx.select({ id: c.id }).from(c).where(and(visibleConversations(ctx), viewCondition(ctx, view), inArray(c.id, ids)))).map((r) => r.id).sort();

      const agent = ctxAs("agent");
      expect(await inView(agent, "team")).toEqual([backend]);
      expect(await inView(agent, "queue")).toEqual([queued]);
      expect(await inView(agent, "mine")).toEqual([mine]);

      const lead = ctxAs("lead");
      expect(await inView(lead, "team")).toEqual([backend, theirs].sort());
      expect(await inView(lead, "queue")).toEqual([queued]);
    });
  });
});
