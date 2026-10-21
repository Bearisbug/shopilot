import type { QueueName } from "@/server/jobs/boss";
import { usageRollover } from "@/server/billing/rollover";
import { purgeMerchants, retentionPurge, runExport } from "@/server/settings/data";
import { backfillShop, scanLogistics, syncRecentOrders } from "@/server/inbound/backfill";
import { pollReadOnlyShops } from "@/server/inbound/poll";
import { processInbound, sweepInbound } from "@/server/inbound/process";
import { refetchConversation } from "@/server/inbound/refetch";
import { fillBundle } from "@/server/conversations/bundle";
import { generateDraft } from "@/server/ai/draft";
import { translateDraft, translateMessage } from "@/server/ai/translate";
import { shopMetricsJob, tokenRefreshJob } from "@/server/shops/jobs";
import { handoverScan, ticketAutoClose, ticketScan } from "@/server/tickets/jobs";
import { expireDrafts, expireInvitations, idleClose, remindUnclaimed } from "@/server/conversations/jobs";
import { deliverQueuedVideo } from "@/server/conversations/send";
import { sweepIssues } from "@/server/issues/extract";
import { sweepDraftReviews } from "@/server/analysis/compare";
import { embedMissingCards } from "@/server/knowledge/cards";
import { deliverEmail } from "@/server/core/mailer";
import { deliverFeishuCard } from "@/server/feishu/deliver";
import { backfillOrderImages } from "@/server/orders/images";
import { fetchProduct, prefetchAllProducts } from "@/server/products/info";
import { ingestDocument } from "@/server/knowledge/ingest";
import { purgeJob } from "@/server/knowledge/purge";
import { embedMissing } from "@/server/knowledge/qa";
import { extractQa, failStaleExtracts } from "@/server/knowledge/qa-extract";
import { syncListings } from "@/server/products/dictionary";
import { analyzeLearning, pickLearning } from "@/server/knowledge/learning-analyze";

type Handler = (data: Record<string, unknown>) => Promise<void>;

/** 任务名 → 处理器；随各领域模块实现逐个登记 */
export const handlers: Partial<Record<QueueName, Handler>> = {
  "usage.rollover": () => usageRollover(),
  "data.export": runExport,
  "order.images": backfillOrderImages,
  "email.send": deliverEmail,
  "feishu.send": deliverFeishuCard,
  "product.fetch": fetchProduct,
  "product.prefetch": prefetchAllProducts,
  "data.retention_purge": retentionPurge,
  "merchant.purge": purgeMerchants,
  "inbound.process": processInbound,
  "inbound.sweep": () => sweepInbound(),
  "inbound.poll": () => pollReadOnlyShops(),
  "inbound.refetch": refetchConversation,
  "shopee.bundle": async (data) => {
    await fillBundle(data);
  },
  "shop.backfill": backfillShop,
  "order.sync": syncRecentOrders,
  "logistics.scan": () => scanLogistics(),
  "draft.generate": generateDraft,
  "message.translate": translateMessage,
  "message.video_send": deliverQueuedVideo,
  "draft.translate": translateDraft,
  "token.refresh": () => tokenRefreshJob(),
  "shop.metrics": () => shopMetricsJob(),
  "ticket.scan": ticketScan,
  "ticket.auto_close": ticketAutoClose,
  "handover.scan": handoverScan,
  "conversation.idle_close": () => idleClose(),
  "draft.expire": () => expireDrafts(),
  "unclaimed.remind": () => remindUnclaimed(),
  "issue.extract": async () => {
    const r = await sweepIssues();
    if (r.picked) console.log(JSON.stringify({ t: new Date().toISOString(), level: "info", msg: "issue sweep", ...r }));
  },
  "draft.compare": async () => {
    const r = await sweepDraftReviews();
    if (r.picked) console.log(JSON.stringify({ t: new Date().toISOString(), level: "info", msg: "draft compare sweep", ...r }));
  },
  "invitation.expire": () => expireInvitations(),
  "knowledge.ingest": (data) => ingestDocument(data),
  "knowledge.purge": purgeJob,
  "knowledge.qa_extract": extractQa,
  "knowledge.qa_embed": async () => {
    const stale = await failStaleExtracts();
    const r = await embedMissing();
    const cards = await embedMissingCards();
    if (r.picked || stale || cards.picked) console.log(JSON.stringify({ t: new Date().toISOString(), level: "info", msg: "qa embed sweep", ...r, staleExtracts: stale, cardsPicked: cards.picked, cardsEmbedded: cards.embedded }));
  },
  "product.listing_sync": syncListings,
  "learning.analyze": analyzeLearning,
  "learning.pick": async (data) => {
    const r = await pickLearning(data ?? {});
    console.log(JSON.stringify({ t: new Date().toISOString(), level: "info", msg: "learning pick", ...r }));
  },
};
