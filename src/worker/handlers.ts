import type { QueueName } from "@/server/jobs/boss";
import { usageRollover } from "@/server/billing/rollover";
import { purgeMerchants, retentionPurge, runExport } from "@/server/settings/data";
import { backfillShop, scanLogistics, syncRecentOrders } from "@/server/inbound/backfill";
import { pollReadOnlyShops } from "@/server/inbound/poll";
import { processInbound, sweepInbound } from "@/server/inbound/process";
import { generateDraft } from "@/server/ai/draft";
import { translateMessage } from "@/server/ai/translate";
import { shopMetricsJob, tokenRefreshJob } from "@/server/shops/jobs";
import { handoverScan, ticketAutoClose, ticketScan } from "@/server/tickets/jobs";
import { expireDrafts, expireInvitations, idleClose, remindUnclaimed } from "@/server/conversations/jobs";
import { deliverEmail } from "@/server/core/mailer";
import { backfillOrderImages } from "@/server/orders/images";
import { fetchProduct, prefetchAllProducts } from "@/server/products/info";
import { ingestDocument } from "@/server/knowledge/ingest";
import { purgeJob } from "@/server/knowledge/purge";

type Handler = (data: Record<string, unknown>) => Promise<void>;

/** 任务名 → 处理器；随各领域模块实现逐个登记 */
export const handlers: Partial<Record<QueueName, Handler>> = {
  "usage.rollover": () => usageRollover(),
  "data.export": runExport,
  "order.images": backfillOrderImages,
  "email.send": deliverEmail,
  "product.fetch": fetchProduct,
  "product.prefetch": prefetchAllProducts,
  "data.retention_purge": retentionPurge,
  "merchant.purge": purgeMerchants,
  "inbound.process": processInbound,
  "inbound.sweep": () => sweepInbound(),
  "inbound.poll": () => pollReadOnlyShops(),
  "shop.backfill": backfillShop,
  "order.sync": syncRecentOrders,
  "logistics.scan": () => scanLogistics(),
  "draft.generate": generateDraft,
  "message.translate": translateMessage,
  "token.refresh": () => tokenRefreshJob(),
  "shop.metrics": () => shopMetricsJob(),
  "ticket.scan": ticketScan,
  "ticket.auto_close": ticketAutoClose,
  "handover.scan": handoverScan,
  "conversation.idle_close": () => idleClose(),
  "draft.expire": () => expireDrafts(),
  "unclaimed.remind": () => remindUnclaimed(),
  "invitation.expire": () => expireInvitations(),
  "knowledge.ingest": (data) => ingestDocument(data),
  "knowledge.purge": purgeJob,
};
