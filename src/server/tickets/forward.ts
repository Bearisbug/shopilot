// 工单转发到飞书（API-TKT-009、010）：能看这张工单的成员都能转发；卡片当场构好随投递记录落库，时间线记一条，提交后入队 feishu.send。
import { eq } from "drizzle-orm";
import { statusText, type TicketForwardBody, type TicketForwardResult, type TicketForwardTargets } from "@/contracts/tickets";
import { inTz } from "@/lib/format";
import { sellerOrderUrl } from "@/lib/seller-center";
import { anomalyText, platformStatusText } from "@/lib/ticket-text";
import type { MemberContext } from "@/server/auth/context";
import { audit } from "@/server/core/audit";
import { db, schema } from "@/server/db/client";
import { env } from "@/server/env";
import { ticketCard } from "@/server/feishu/card";
import { forwardTargets, insertTicketDelivery, resolveForwardDestination } from "@/server/feishu/forward";
import { enqueue } from "@/server/jobs/boss";
import { shopAppRegion } from "@/server/platforms/clients";
import { itemById, loadVisible } from "./service";

export async function ticketForwardTargets(ctx: MemberContext, id: string): Promise<TicketForwardTargets> {
  const row = await loadVisible(ctx, id);
  return forwardTargets(ctx.merchant.id, row.shopId);
}

export async function forwardTicket(ctx: MemberContext, id: string, body: TicketForwardBody): Promise<TicketForwardResult> {
  const row = await loadVisible(ctx, id);
  const destination = await resolveForwardDestination(ctx.merchant.id, body);
  const item = await itemById(row.id);
  const [shop] = await db().select().from(schema.shop).where(eq(schema.shop.id, row.shopId)).limit(1);
  const [order] = row.orderId ? await db().select().from(schema.order).where(eq(schema.order.id, row.orderId)).limit(1) : [];
  const forwardedBy = ctx.actor.kind === "member" ? ctx.actor.name : "成员";
  const note = body.note?.trim() || null;
  const card = ticketCard({
    number: row.number,
    anomaly: anomalyText(row),
    statusText: statusText(row),
    platformStatus: platformStatusText(row.platform, row.platformStatus),
    shopName: shop?.name ?? "",
    platform: row.platform,
    market: shop?.market ?? "",
    buyerName: row.buyerName,
    externalOrderId: order?.externalOrderId ?? null,
    items: (order?.items ?? []).map((i) => ({ name: i.name, sku: i.sku ?? null, qty: i.qty })),
    dueText: row.dueAt ? inTz(row.dueAt, ctx.merchant.timezone, "yyyy-MM-dd HH:mm") : null,
    remainingSec: item.remainingSec,
    assigneeName: item.assignee?.name ?? null,
    note,
    forwardedBy,
    ticketUrl: `${env().APP_BASE_URL}/tickets/${row.id}?m=${row.merchantId}`,
    sellerUrl: shop && order ? sellerOrderUrl({ platform: shop.platform, market: shop.market, externalShopId: shop.externalShopId, appRegion: await shopAppRegion(shop) }, order.externalOrderId) : null,
  });

  const { deliveryId, event } = await db().transaction(async (tx) => {
    const deliveryId = await insertTicketDelivery(tx, { merchantId: row.merchantId, ticketId: row.id, actorId: ctx.membership.id, destination, card });
    const [event] = await tx
      .insert(schema.ticketEvent)
      .values({ merchantId: row.merchantId, ticketId: row.id, type: "feishu", actorId: ctx.membership.id, source: "page", data: { deliveryId, targetName: destination.name, ...(note ? { note } : {}) } })
      .returning();
    await audit(
      ctx.actor,
      { module: "tickets", action: "ticket_forwarded_feishu", summary: `${row.number} 转发到飞书「${destination.name}」`, targetType: "ticket", targetId: row.id, data: { deliveryId, targetName: destination.name } },
      tx,
    );
    return { deliveryId, event };
  });
  await enqueue("feishu.send", { id: deliveryId });
  return {
    deliveryId,
    targetName: destination.name,
    event: {
      id: event.id,
      type: "feishu",
      source: "page",
      actorName: forwardedBy,
      at: event.createdAt.toISOString(),
      title: `${forwardedBy} 转发到飞书 · ${destination.name}`,
      detail: [note ? `备注：${note}` : null, "发送中"].filter(Boolean).join(" · "),
    },
  };
}
