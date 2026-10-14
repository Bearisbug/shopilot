import { and, eq, inArray, ne, sql } from "drizzle-orm";
import type { Me } from "@/contracts/auth";
import { db, schema } from "../db/client";
import type { MemberContext } from "../auth/context";

/** 成员可见的店铺（不含已断开的） */
export async function visibleShops(ctx: MemberContext, disconnected = false) {
  const where = [eq(schema.shop.merchantId, ctx.merchant.id), disconnected ? eq(schema.shop.status, "disconnected") : ne(schema.shop.status, "disconnected")];
  if (ctx.shopIds !== null) {
    if (ctx.shopIds.length === 0) return [];
    where.push(inArray(schema.shop.id, ctx.shopIds));
  }
  return db()
    .select({ id: schema.shop.id, name: schema.shop.name, platform: schema.shop.platform, market: schema.shop.market, status: schema.shop.status })
    .from(schema.shop)
    .where(and(...where))
    .orderBy(schema.shop.platform, schema.shop.name);
}

export async function buildMe(ctx: MemberContext): Promise<Me> {
  const memberships = await db()
    .select({
      merchantId: schema.membership.merchantId,
      merchantName: schema.merchant.name,
      role: schema.membership.role,
      status: schema.membership.status,
      membershipId: schema.membership.id,
      merchantStatus: schema.merchant.status,
    })
    .from(schema.membership)
    .innerJoin(schema.merchant, eq(schema.merchant.id, schema.membership.merchantId))
    .where(and(eq(schema.membership.userId, ctx.user.id), ne(schema.merchant.status, "deleted")));
  const counts = await db()
    .select({ membershipId: schema.membershipShop.membershipId, n: sql<number>`count(*)::int` })
    .from(schema.membershipShop)
    .where(inArray(schema.membershipShop.membershipId, memberships.map((m) => m.membershipId).concat(["00000000-0000-0000-0000-000000000000"])))
    .groupBy(schema.membershipShop.membershipId);
  const shopTotals = await db()
    .select({ merchantId: schema.shop.merchantId, n: sql<number>`count(*)::int` })
    .from(schema.shop)
    .where(and(inArray(schema.shop.merchantId, memberships.map((m) => m.merchantId).concat(["00000000-0000-0000-0000-000000000000"])), ne(schema.shop.status, "disconnected")))
    .groupBy(schema.shop.merchantId);
  const [prefs] = await db().select({ p: schema.membership.preferences }).from(schema.membership).where(eq(schema.membership.id, ctx.membership.id));
  const shops = await visibleShops(ctx);
  const disconnectedShops = await visibleShops(ctx, true);
  return {
    user: ctx.user,
    memberships: memberships.map((m) => ({
      merchantId: m.merchantId,
      merchantName: m.merchantName,
      role: m.role,
      status: m.status,
      shopCount: m.role === "admin" ? (shopTotals.find((s) => s.merchantId === m.merchantId)?.n ?? 0) : (counts.find((c) => c.membershipId === m.membershipId)?.n ?? 0),
    })),
    active: {
      merchantId: ctx.merchant.id,
      merchantName: ctx.merchant.name,
      timezone: ctx.merchant.timezone,
      membershipId: ctx.membership.id,
      role: ctx.membership.role,
      isOwner: ctx.isOwner,
      shopIds: ctx.shopIds,
      shops,
      disconnectedShops: disconnectedShops.map(({ id, name, platform, market }) => ({ id, name, platform, market })),
      permissions: ctx.permissions,
      merchantStatus: ctx.merchant.status,
    },
    preferences: prefs?.p ?? { desktopNotify: false, sound: true },
    twoFactorRequired: ctx.twoFactorRequired,
  };
}
