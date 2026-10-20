// 手动转发到飞书（工单详情页）：能不能转、可选哪些群、按选的群落一行投递记录。卡片在请求里构好存进记录，
// feishu.send 只负责发出与重试（见 deliver.ts deliverStoredCard）。
import { and, eq } from "drizzle-orm";
import type { TicketForwardTargets } from "@/contracts/tickets";
import { db, schema, type Executor } from "@/server/db/client";
import { Problem, validation } from "@/server/http/problem";
import { feishuApi, FeishuError, type FeishuCard } from "./client";
import { appOf, resolveTarget, type IntegrationRow } from "./deliver";

const fi = schema.feishuIntegration;
const t = schema.feishuTarget;
const SETTINGS = "请管理员在「商户设置 → 通知」";

async function integrationOf(merchantId: string): Promise<IntegrationRow | undefined> {
  const [row] = await db().select().from(fi).where(eq(fi.merchantId, merchantId)).limit(1);
  return row;
}

async function webhookTargets(merchantId: string) {
  return db()
    .select({ target: t, shopName: schema.shop.name })
    .from(t)
    .leftJoin(schema.shop, eq(schema.shop.id, t.shopId))
    .where(and(eq(t.merchantId, merchantId), eq(t.kind, "webhook")))
    .orderBy(t.createdAt);
}

async function unavailableReason(merchantId: string, integration: IntegrationRow | undefined): Promise<string | null> {
  if (!integration) return `还没有连接飞书，${SETTINGS}连接后再转发`;
  if (integration.method === "app" && integration.status === "invalid") return `飞书应用凭证已失效，${SETTINGS}重新连接`;
  if (integration.method === "webhook" && !(await webhookTargets(merchantId)).length) return `还没有设置飞书群，${SETTINGS}添加群机器人`;
  return null;
}

/** 按钮可用性：没连飞书、应用凭证失效、自定义机器人一个群都没设时不可用 */
export async function forwardAvailability(merchantId: string): Promise<{ available: boolean; reason: string | null }> {
  const reason = await unavailableReason(merchantId, await integrationOf(merchantId));
  return { available: !reason, reason };
}

/** 可用时返回接法，不可用时抛 409 并带原因 */
async function usableIntegration(merchantId: string): Promise<IntegrationRow> {
  const integration = await integrationOf(merchantId);
  const reason = await unavailableReason(merchantId, integration);
  if (reason || !integration) throw new Problem("not-allowed", { detail: reason ?? "现在不能转发到飞书。", code: "feishu_unavailable" });
  return integration;
}

/** 飞书出错转成接口错误：凭证不对时顺带把接法标为失效，与通知设置页一致 */
async function feishuProblem(e: unknown, merchantId: string): Promise<Problem> {
  if (!(e instanceof FeishuError)) throw e;
  if (e.kind === "credentials") {
    await db().update(fi).set({ status: "invalid", updatedAt: new Date() }).where(eq(fi.merchantId, merchantId));
    return new Problem("platform-credentials", { title: "飞书没有通过应用凭证", detail: `取不到机器人所在的群：${e.message}`, extra: { feishuCode: e.code } });
  }
  return new Problem(e.kind === "timeout" ? "platform-timeout" : "platform", { title: "飞书返回错误", detail: `取不到机器人所在的群：${e.message}`, extra: { feishuCode: e.code, feishuKind: e.kind } });
}

/** 转发弹窗的群列表：应用接法列机器人所在的群，自定义机器人列设过的群；预选这家店的群，否则默认群 */
export async function forwardTargets(merchantId: string, shopId: string): Promise<TicketForwardTargets> {
  const integration = await usableIntegration(merchantId);
  const preferred = await resolveTarget(merchantId, shopId, integration.method);
  if (integration.method === "app") {
    let chats;
    try {
      chats = await feishuApi().listChats(appOf(integration)!);
    } catch (e) {
      throw await feishuProblem(e, merchantId);
    }
    const saved = await db().select({ chatId: t.chatId, shopName: schema.shop.name }).from(t).leftJoin(schema.shop, eq(schema.shop.id, t.shopId)).where(and(eq(t.merchantId, merchantId), eq(t.kind, "app_chat")));
    const scopeOf = (chatId: string) => {
      const names = saved.filter((s) => s.chatId === chatId).map((s) => (s.shopName ? `${s.shopName} 的群` : "默认群"));
      return names.length ? names.join("、") : null;
    };
    const targets = chats.map((c) => ({ key: c.chatId, name: c.name, scope: scopeOf(c.chatId) }));
    const defaultKey = preferred?.chatId && targets.some((x) => x.key === preferred.chatId) ? preferred.chatId : null;
    return { method: "app", targets, defaultKey };
  }
  const rows = await webhookTargets(merchantId);
  return {
    method: "webhook",
    targets: rows.map((r) => ({ key: r.target.id, name: r.target.name, scope: r.shopName ? `${r.shopName} 的群` : "默认群" })),
    defaultKey: preferred?.id ?? null,
  };
}

export type ForwardDestination = { chatId: string | null; targetId: string | null; name: string };

/** 校验选的群：应用接法要求机器人在群里（重新取一次群列表），自定义机器人要求是本商户设过的群 */
export async function resolveForwardDestination(merchantId: string, pick: { chatId?: string; targetId?: string }): Promise<ForwardDestination> {
  const integration = await usableIntegration(merchantId);
  if (integration.method === "app") {
    if (!pick.chatId) throw validation("请选择群。", { chatId: "请选择群" });
    let chats;
    try {
      chats = await feishuApi().listChats(appOf(integration)!);
    } catch (e) {
      throw await feishuProblem(e, merchantId);
    }
    const chat = chats.find((c) => c.chatId === pick.chatId);
    if (!chat) throw validation("机器人不在这个群里，刷新群列表后重选。", { chatId: "机器人不在这个群里" });
    const [saved] = await db().select({ id: t.id }).from(t).where(and(eq(t.merchantId, merchantId), eq(t.kind, "app_chat"), eq(t.chatId, chat.chatId))).limit(1);
    return { chatId: chat.chatId, targetId: saved?.id ?? null, name: chat.name };
  }
  if (!pick.targetId) throw validation("请选择群。", { chatId: "请选择群" });
  const [target] = await db().select().from(t).where(and(eq(t.id, pick.targetId), eq(t.merchantId, merchantId), eq(t.kind, "webhook"))).limit(1);
  if (!target) throw validation("这个群设置已不存在，刷新后重选。", { chatId: "这个群设置已不存在" });
  return { chatId: null, targetId: target.id, name: target.name };
}

/** 落一行工单转发的投递记录（卡片已构好），由调用方在事务提交后入队 feishu.send */
export async function insertTicketDelivery(
  ex: Executor,
  input: { merchantId: string; ticketId: string; actorId: string | null; destination: ForwardDestination; card: FeishuCard },
): Promise<string> {
  const [row] = await ex
    .insert(schema.feishuDelivery)
    .values({
      merchantId: input.merchantId,
      kind: "ticket",
      ticketId: input.ticketId,
      actorId: input.actorId,
      chatId: input.destination.chatId,
      targetId: input.destination.targetId,
      targetName: input.destination.name,
      card: input.card,
    })
    .returning({ id: schema.feishuDelivery.id });
  return row.id;
}
