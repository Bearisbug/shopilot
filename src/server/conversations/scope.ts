// 会话行级可见性（DESIGN §10 行级表）。所有会话查询都经这里拼条件（ADR-003）。
import { and, eq, inArray, ne, or, sql, type SQL } from "drizzle-orm";
import { schema } from "../db/client";
import type { MemberContext } from "../auth/context";

const c = schema.conversation;
const NONE = "00000000-0000-0000-0000-000000000000";

export type ConvView = "queue" | "ai" | "mine" | "team" | "done";

function shopCond(ctx: MemberContext): SQL | undefined {
  if (ctx.shopIds === null) return undefined;
  return inArray(c.shopId, ctx.shopIds.length ? ctx.shopIds : [NONE]);
}

/** 本商户、负责店铺内的会话（不带员工的行级条件） */
export function shopScopedConversations(ctx: MemberContext): SQL {
  const base = [eq(c.merchantId, ctx.merchant.id)];
  const shops = shopCond(ctx);
  if (shops) base.push(shops);
  return and(...base)!;
}

/** 成员可见的全部会话 */
export function visibleConversations(ctx: MemberContext): SQL {
  const base = [shopScopedConversations(ctx)];
  if (ctx.membership.role === "agent") {
    base.push(
      or(
        inArray(c.handlingState, ["bot", "awaiting_human"]),
        eq(c.claimedBy, ctx.membership.id),
        and(eq(c.handlingState, "closed"), sql`exists (select 1 from segment s where s.conversation_id = ${c.id} and s.first_claimed_by = ${ctx.membership.id})`)!,
      )!,
    );
  }
  return and(...base)!;
}

export function viewCondition(ctx: MemberContext, view: ConvView): SQL {
  switch (view) {
    case "queue":
      return and(eq(c.handlingState, "awaiting_human"), eq(c.buyerKind, "buyer"))!;
    case "ai":
      return eq(c.handlingState, "bot");
    case "mine":
      return and(eq(c.handlingState, "human"), eq(c.claimedBy, ctx.membership.id))!;
    case "team":
      return and(eq(c.handlingState, "human"), ne(c.claimedBy, ctx.membership.id))!;
    case "done":
      return eq(c.handlingState, "closed");
  }
}
