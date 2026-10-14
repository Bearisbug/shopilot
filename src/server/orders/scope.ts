// 订单、售后单、发票的行级可见性：管理员全部店铺；组长、员工只看负责店铺（DESIGN §10 行级表）。
import { and, eq, inArray, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { schema } from "../db/client";
import type { MemberContext } from "../auth/context";

const NONE = "00000000-0000-0000-0000-000000000000";

function scoped(ctx: MemberContext, merchantCol: PgColumn, shopCol: PgColumn): SQL {
  const conds = [eq(merchantCol, ctx.merchant.id)];
  if (ctx.shopIds !== null) conds.push(inArray(shopCol, ctx.shopIds.length ? ctx.shopIds : [NONE]));
  return and(...conds)!;
}

export const visibleOrders = (ctx: MemberContext) => scoped(ctx, schema.order.merchantId, schema.order.shopId);
export const visibleAfterSales = (ctx: MemberContext) => scoped(ctx, schema.afterSale.merchantId, schema.afterSale.shopId);
export const visibleInvoices = (ctx: MemberContext) => scoped(ctx, schema.invoice.merchantId, schema.invoice.shopId);
/** 售后待处理按店铺收窄（订单页口径），不按工单负责人 */
export const scopedTickets = (ctx: MemberContext) => scoped(ctx, schema.ticket.merchantId, schema.ticket.shopId);
export const visibleShops = (ctx: MemberContext) => scoped(ctx, schema.shop.merchantId, schema.shop.id);

export const canSeeShop = (ctx: MemberContext, shopId: string) => ctx.shopIds === null || ctx.shopIds.includes(shopId);
