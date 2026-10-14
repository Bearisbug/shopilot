// 会话段开段时的阶段判定（DESIGN §11.13），只读订单与售后镜像，不调平台。
import { and, eq, gte, inArray } from "drizzle-orm";
import { schema, type Executor } from "@/server/db/client";
import type { Stage } from "@/server/db/schema";
import { ACTIVE_ORDER, DONE_ORDER, SHOPEE_RETURN_OPEN, TIKTOK_RETURN_FINAL } from "@/server/orders/status";

const AFTERSALE_WORDS = ["退款", "退货", "坏了", "破损", "换货", "refund", "return", "broken", "damaged", "rosak", "pulangan", "คืนเงิน", "hoàn tiền"];
const LOGISTICS_WORDS = ["发货", "物流", "到哪了", "快递", "运单", "shipping", "tracking", "delivery", "parcel", "penghantaran", "จัดส่ง", "giao hàng"];

export type StageResult = { stage: Stage; source: "auto" | "keyword"; basis: string };

const fmtDate = (d: Date) => `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export async function judgeStage(
  ex: Executor,
  input: { shopId: string; platform: "shopee" | "tiktok"; buyerExternalId: string; referencedOrderId?: string | null; buyerText?: string | null; backfillDone: boolean },
): Promise<StageResult> {
  const since180 = new Date(Date.now() - 180 * 86400_000);
  const conds = [eq(schema.order.shopId, input.shopId)];
  if (input.referencedOrderId) conds.push(eq(schema.order.externalOrderId, input.referencedOrderId));
  else conds.push(eq(schema.order.buyerExternalId, input.buyerExternalId), gte(schema.order.platformCreatedAt, since180));
  const orders = await ex.select().from(schema.order).where(and(...conds));

  // 规则 6：镜像还没首次同步且镜像里没有该买家订单 → 关键词
  if (orders.length === 0 && !input.backfillDone) {
    const text = (input.buyerText ?? "").toLowerCase();
    const after = AFTERSALE_WORDS.find((w) => text.includes(w));
    if (after) return { stage: "aftersale", source: "keyword", basis: `订单尚未同步，关键词：${after}` };
    const ship = LOGISTICS_WORDS.find((w) => text.includes(w));
    if (ship) return { stage: "insale", source: "keyword", basis: `订单尚未同步，关键词：${ship}` };
    return { stage: "unknown", source: "keyword", basis: "订单尚未同步" };
  }
  if (orders.length === 0) return { stage: "presale", source: "auto", basis: "本店无订单" };

  const ids = orders.map((o) => o.externalOrderId);
  const sales = await ex
    .select()
    .from(schema.afterSale)
    .where(and(eq(schema.afterSale.shopId, input.shopId), inArray(schema.afterSale.externalOrderId, ids)));

  // 规则 2：未终结售后
  const openReturn = sales.find((s) => s.kind === "return" && (input.platform === "tiktok" ? !TIKTOK_RETURN_FINAL.has(s.platformStatus) : SHOPEE_RETURN_OPEN.has(s.platformStatus)));
  if (openReturn) return { stage: "aftersale", source: "auto", basis: `退货 ${openReturn.externalId} ${openReturn.platformStatus}` };
  const toReturn = input.platform === "shopee" ? orders.find((o) => o.platformStatus === "TO_RETURN") : undefined;
  if (toReturn) return { stage: "aftersale", source: "auto", basis: `订单 ${toReturn.externalOrderId} TO_RETURN` };

  // 规则 3：未完结订单或取消处理中
  const active = orders.find((o) => ACTIVE_ORDER[input.platform].has(o.platformStatus));
  if (active) return { stage: "insale", source: "auto", basis: `订单 ${active.externalOrderId} ${active.platformStatus}` };
  const pendingCancel = sales.find((s) => s.kind === "cancel" && s.platformStatus === "CANCELLATION_REQUEST_PENDING");
  if (pendingCancel) return { stage: "insale", source: "auto", basis: `取消 ${pendingCancel.externalId} CANCELLATION_REQUEST_PENDING` };

  // 规则 4：60 天内完成
  const since60 = Date.now() - 60 * 86400_000;
  const done = orders
    .filter((o) => DONE_ORDER[input.platform].has(o.platformStatus) && (o.platformUpdatedAt ?? o.platformCreatedAt).getTime() >= since60)
    .sort((a, b) => (b.platformUpdatedAt ?? b.platformCreatedAt).getTime() - (a.platformUpdatedAt ?? a.platformCreatedAt).getTime())[0];
  if (done) return { stage: "aftersale", source: "auto", basis: `订单 ${done.externalOrderId} ${done.platformStatus} ${fmtDate(done.platformUpdatedAt ?? done.platformCreatedAt)}` };

  // 规则 5
  return { stage: "presale", source: "auto", basis: "近 60 天无进行中订单" };
}
