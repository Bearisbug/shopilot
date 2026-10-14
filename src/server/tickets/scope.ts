// 工单行级可见性：管理员全部店铺；组长负责店铺；员工只看指派给自己的（DESIGN §10）。
import { and, eq, inArray, type SQL } from "drizzle-orm";
import { schema } from "../db/client";
import type { MemberContext } from "../auth/context";

const t = schema.ticket;

export function visibleTickets(ctx: MemberContext): SQL {
  const conds = [eq(t.merchantId, ctx.merchant.id)];
  if (ctx.shopIds !== null) conds.push(inArray(t.shopId, ctx.shopIds.length ? ctx.shopIds : ["00000000-0000-0000-0000-000000000000"]));
  if (ctx.membership.role === "agent") conds.push(eq(t.assigneeId, ctx.membership.id));
  return and(...conds)!;
}

export const OPEN_STATUSES = ["open", "in_progress", "waiting"] as const;
