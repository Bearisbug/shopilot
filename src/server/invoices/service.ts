// 发票（DESIGN §8.6 API-INV-001…005、§11.8、§11.9、§12.5）：抽取字段、开具（PDF + PNG）、经聊天与邮件两路发送、记录、下载、重发、退信建工单。
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { TZDate } from "@date-fns/tz";
import { format, startOfMonth } from "date-fns";
import { and, count, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { CreateInvoiceBody, CreateInvoiceResult, ExtractResult, InvoiceListItem, InvoicesResponse } from "@/contracts/orders";
import { AiError, chat, parseJson } from "@/server/ai/client";
import type { MemberContext } from "@/server/auth/context";
import { audit, systemActor } from "@/server/core/audit";
import { sendEmail } from "@/server/core/outbox";
import { nextSequence } from "@/server/core/sequence";
import { supersedeDrafts } from "@/server/conversations/ingest";
import { visibleConversations } from "@/server/conversations/scope";
import { sendOutbound } from "@/server/conversations/send";
import { db, schema } from "@/server/db/client";
import type { InvoiceFields } from "@/server/db/schema";
import { dataPath, writeDataFile } from "@/server/files/storage";
import { json } from "@/server/http/route";
import { Problem } from "@/server/http/problem";
import { loadOrder, invoiceSummary, shopRef } from "@/server/orders/service";
import { visibleInvoices } from "@/server/orders/scope";
import { createTicket } from "@/server/tickets/engine";
import { renderInvoice } from "./render";

const inv = schema.invoice;
const PREFIX = { invoice: "INV", receipt: "RCT" } as const;
const KIND_EN = { invoice: "Invoice", receipt: "Receipt" } as const;

async function visibleConversation(ctx: MemberContext, id: string) {
  const [c] = await db()
    .select()
    .from(schema.conversation)
    .where(and(eq(schema.conversation.id, id), visibleConversations(ctx)))
    .limit(1);
  if (!c) throw new Problem("not-found", { detail: "找不到这个会话，或它不在你的可见范围内。" });
  return c;
}

// ── API-INV-001 从对话提取开票字段 ──

const EXTRACT_SYSTEM = [
  "你从电商买家与客服的聊天记录里抽取开票信息。",
  "只输出一个 JSON 对象：{\"buyerName\": string, \"address\": string, \"email\": string, \"taxId\": string, \"confidence\": number}。",
  "buyerName 是发票抬头（公司名或个人全名）；address 是开票地址；email 是接收发票的邮箱；taxId 是税号（TIN、SST、VAT、NPWP 等）。",
  "聊天里没有出现的字段给空字符串，不要猜测、不要编造；confidence 是 0 到 1 之间你对整体抽取结果的把握。",
].join("\n");

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function extractFields(ctx: MemberContext, body: { conversationId: string; orderId?: string }): Promise<ExtractResult> {
  const conv = await visibleConversation(ctx, body.conversationId);
  if (body.orderId) await loadOrder(ctx, body.orderId);
  const rows = await db()
    .select({ direction: schema.message.direction, senderRole: schema.message.senderRole, text: schema.message.text, translation: schema.message.translation })
    .from(schema.message)
    .where(and(eq(schema.message.conversationId, conv.id), sql`${schema.message.text} is not null`, sql`${schema.message.senderRole} <> 'system'`))
    .orderBy(desc(schema.message.sentAt))
    .limit(40);
  const transcript = rows
    .reverse()
    .map((m) => `${m.direction === "in" ? "买家" : "客服"}：${m.text}${m.translation ? `（译文：${m.translation}）` : ""}`)
    .join("\n");
  if (!transcript.trim()) throw new Problem("not-allowed", { detail: "这个会话还没有文字消息，没有可提取的内容。", code: "empty_conversation" });
  let parsed: Record<string, unknown>;
  try {
    const res = await chat("extract", [{ role: "system", content: EXTRACT_SYSTEM }, { role: "user", content: `买家：${conv.buyerName}\n聊天记录：\n${transcript}` }], { json: true, maxTokens: 400 });
    parsed = parseJson(res.content);
  } catch (e) {
    if (e instanceof AiError) throw new Problem("ai-unavailable", { detail: e.kind === "timeout" ? "AI 15 秒内没有返回，可以手动填写或稍后重试。" : "AI 暂时没能提取开票信息，可以手动填写或稍后重试。", code: e.kind });
    throw e;
  }
  const email = clean(parsed.email, 200);
  const fields: ExtractResult["fields"] = {};
  const buyerName = clean(parsed.buyerName, 200);
  const address = clean(parsed.address, 500);
  const taxId = clean(parsed.taxId, 60);
  if (buyerName) fields.buyerName = buyerName;
  if (address) fields.address = address;
  if (email && z.string().email().safeParse(email).success) fields.email = email.toLowerCase();
  if (taxId) fields.taxId = taxId;
  const found = Object.keys(fields).length;
  if (found === 0) throw new Problem("ai-unavailable", { detail: "聊天里没有找到抬头、地址、邮箱或税号，请手动填写。", code: "nothing_found" });
  const c = Number(parsed.confidence);
  return { fields, confidence: Number.isFinite(c) && c >= 0 && c <= 1 ? c : Math.round((found / 4) * 100) / 100 };
}

// ── API-INV-002 开具 ──

const cents = (v: string) => Math.round(Number(v) * 100);
const money = (c: number) => (c / 100).toFixed(2);

export async function createInvoice(ctx: MemberContext, body: CreateInvoiceBody): Promise<Response> {
  const { order, shop } = await loadOrder(ctx, body.orderId);
  const conv = body.conversationId ? await visibleConversation(ctx, body.conversationId) : null;
  if (conv && conv.shopId !== order.shopId) throw new Problem("validation", { detail: "会话与订单不属于同一家店。", extra: { fields: { conversationId: "会话与订单不属于同一家店" } } });
  // 与 API-CONV-003 右栏取买家订单同一匹配条件：同店且同一买家
  if (conv && order.buyerExternalId !== conv.buyerExternalId) throw new Problem("conflict", { detail: "这张订单不属于当前会话的买家。" });
  if (body.sendToChat) {
    if (!conv) throw new Problem("not-allowed", { detail: "没有关联会话，不能发到聊天。取消「转成图片发进会话」，或从会话里开票。", code: "no_conversation" });
    if (conv.handlingState !== "human" || conv.claimedBy !== ctx.membership.id) {
      throw new Problem("not-allowed", { detail: "只有这个会话的处理人能把发票发进会话，请先认领会话。", code: "not_handler" });
    }
  }
  const email = body.fields.email ? body.fields.email : null;
  const emailWanted = body.sendEmail && !!email;

  const subtotal = body.fields.items.reduce((acc, it) => acc + cents(it.unitPrice) * it.qty, 0);
  const fields: InvoiceFields = {
    buyerName: body.fields.buyerName,
    address: body.fields.address,
    ...(email ? { email } : {}),
    ...(body.fields.taxId ? { taxId: body.fields.taxId } : {}),
    items: body.fields.items.map((i) => ({ name: i.name, qty: i.qty, unitPrice: money(cents(i.unitPrice)) })),
    currency: body.fields.currency,
    subtotal: money(subtotal),
    tax: "0.00",
    total: money(subtotal),
    ...(body.fields.notes ? { notes: body.fields.notes } : {}),
  };
  const tz = ctx.merchant.timezone;
  const now = new TZDate(new Date(), tz);
  const year = format(now, "yyyy");

  // 号码、渲染、落盘、记录同一事务：渲染失败时整体回滚，号码不跳号、不留记录（§17）
  const row = await db().transaction(async (tx) => {
    const n = await nextSequence(tx, ctx.merchant.id, `${body.kind}:${year}`, 1);
    const number = `${PREFIX[body.kind]}-${year}-${String(n).padStart(6, "0")}`;
    const out = await renderInvoice({
      kind: body.kind,
      number,
      issuedOn: format(now, "yyyy-MM-dd"),
      merchantName: ctx.merchant.name,
      shopName: shop.name,
      shopLabel: `${shop.platform === "shopee" ? "Shopee" : "TikTok Shop"} · ${shop.market}`,
      externalOrderId: order.externalOrderId,
      fields,
    });
    const base = `invoices/${ctx.merchant.id}/${number}`;
    await writeDataFile(`${base}.pdf`, out.pdf);
    await writeDataFile(`${base}.png`, out.png);
    const [pdfFile] = await tx
      .insert(schema.file)
      .values({ merchantId: ctx.merchant.id, kind: "invoice_pdf", path: `${base}.pdf`, mime: "application/pdf", size: out.pdf.length, createdBy: ctx.membership.id })
      .returning();
    const [pngFile] = await tx
      .insert(schema.file)
      .values({ merchantId: ctx.merchant.id, kind: "invoice_png", path: `${base}.png`, mime: "image/png", size: out.png.length, width: out.width, height: out.height, createdBy: ctx.membership.id })
      .returning();
    const [created] = await tx
      .insert(inv)
      .values({
        merchantId: ctx.merchant.id,
        shopId: shop.id,
        kind: body.kind,
        number,
        orderId: order.id,
        conversationId: conv?.id ?? null,
        fields,
        pdfFileId: pdfFile.id,
        imageFileId: pngFile.id,
        chatStatus: body.sendToChat ? "pending" : "skipped",
        emailStatus: emailWanted ? "pending" : "skipped",
        emailTo: email,
        createdBy: ctx.membership.id,
      })
      .returning();
    return { created, png: pngFile };
  });
  let invoice = row.created;

  if (invoice.chatStatus === "pending" && conv) {
    const res = await sendOutbound({
      conversation: conv,
      senderRole: "agent",
      sentBy: ctx.membership.id,
      clientRequestId: `invoice:${invoice.id}`,
      type: "image",
      payload: { fileId: row.png.id, width: row.png.width, height: row.png.height, invoiceId: invoice.id, invoiceNumber: invoice.number },
    });
    [invoice] = await db()
      .update(inv)
      .set(res.error ? { chatStatus: "failed", chatError: res.error.detail.slice(0, 500), chatMessageId: res.message.id } : { chatStatus: "sent", chatError: null, chatMessageId: res.message.id })
      .where(eq(inv.id, invoice.id))
      .returning();
    // 不引用草稿的回复：未处置草稿作废（11.2 supersede，同手动发消息）
    if (!res.error) await supersedeDrafts(db(), conv.id);
  }
  if (invoice.emailStatus === "pending") invoice = await writeInvoiceEmail(ctx, invoice, order.externalOrderId);

  await audit(ctx.actor, {
    module: "orders",
    action: "invoice_issued",
    summary: `开具 ${invoice.number}（订单 ${order.externalOrderId}）`,
    targetType: "invoice",
    targetId: invoice.id,
    data: { kind: invoice.kind, chat_status: invoice.chatStatus, email_status: invoice.emailStatus },
  });
  const result: CreateInvoiceResult = { invoice: invoiceSummary(invoice) };
  return json(result, 201);
}

/** 写发件箱（PDF 附件）：成功 sent，失败 failed 并记原因（§11.9 outbox_written / outbox_failed / resend） */
async function writeInvoiceEmail(ctx: MemberContext, invoice: typeof inv.$inferSelect, externalOrderId: string | null, to = invoice.emailTo) {
  const f = invoice.fields;
  try {
    if (!to) throw new Error("没有接收邮箱");
    await sendEmail({
      to,
      template: "invoice",
      subject: `${KIND_EN[invoice.kind]} ${invoice.number} from ${ctx.merchant.name}`,
      body: [
        `Hello ${f.buyerName},`,
        "",
        `Please find attached ${KIND_EN[invoice.kind].toLowerCase()} ${invoice.number}${externalOrderId ? ` for order ${externalOrderId}` : ""}, total ${f.currency} ${f.total}.`,
        "",
        ctx.merchant.name,
      ].join("\n"),
      attachments: invoice.pdfFileId ? [{ fileId: invoice.pdfFileId, name: `${invoice.number}.pdf` }] : [],
      merchantId: ctx.merchant.id,
      refType: "invoice",
      refId: invoice.id,
    });
    const [u] = await db().update(inv).set({ emailStatus: "sent", emailError: null, emailTo: to }).where(eq(inv.id, invoice.id)).returning();
    return u;
  } catch (e) {
    const [u] = await db()
      .update(inv)
      .set({ emailStatus: "failed", emailError: (e instanceof Error ? e.message : String(e)).slice(0, 500) })
      .where(eq(inv.id, invoice.id))
      .returning();
    return u;
  }
}

// ── API-INV-003 列表 ──

function encodeCursor(ts: string, id: string) {
  return Buffer.from(`${ts}|${id}`).toString("base64url");
}
function decodeCursor(cursor: string): { ts: string; id: string } {
  const [ts, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
  if (!ts || !id || Number.isNaN(new Date(ts).getTime()) || !/^[0-9a-f-]{36}$/i.test(id)) throw new Problem("validation", { detail: "分页参数无效，请刷新后重试。" });
  return { ts, id };
}
const cursorTs = sql<string>`to_char(${inv.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

export async function listInvoices(ctx: MemberContext, q: { kind?: "invoice" | "receipt"; cursor?: string; limit: number }): Promise<InvoicesResponse> {
  const where: SQL[] = [visibleInvoices(ctx)];
  if (q.kind) where.push(eq(inv.kind, q.kind));
  if (q.cursor) {
    const c = decodeCursor(q.cursor);
    where.push(sql`(${inv.createdAt}, ${inv.id}) < (${c.ts}::timestamptz, ${c.id}::uuid)`);
  }
  const rows = await db()
    .select({ i: inv, s: schema.shop, ext: schema.order.externalOrderId, ts: cursorTs })
    .from(inv)
    .innerJoin(schema.shop, eq(schema.shop.id, inv.shopId))
    .leftJoin(schema.order, eq(schema.order.id, inv.orderId))
    .where(and(...where))
    .orderBy(desc(inv.createdAt), desc(inv.id))
    .limit(q.limit + 1);
  const page = rows.slice(0, q.limit);
  // 退信建的「开票」工单记在审计 invoice_email_bounced 的 data.ticket_id（同一订单的多张发票各自对应）
  const bounces = page.length
    ? await db()
        .select({ invoiceId: schema.auditLog.targetId, data: schema.auditLog.data })
        .from(schema.auditLog)
        .where(and(eq(schema.auditLog.merchantId, ctx.merchant.id), eq(schema.auditLog.action, "invoice_email_bounced"), inArray(schema.auditLog.targetId, page.map((r) => r.i.id))))
        .orderBy(desc(schema.auditLog.createdAt))
    : [];
  const ticketIds = [...new Set(bounces.map((b) => String(b.data?.ticket_id ?? "")).filter((x) => /^[0-9a-f-]{36}$/i.test(x)))];
  const tickets = ticketIds.length ? await db().select({ id: schema.ticket.id, number: schema.ticket.number }).from(schema.ticket).where(inArray(schema.ticket.id, ticketIds)) : [];
  const items: InvoiceListItem[] = page.map(({ i, s, ext }) => {
    const b = bounces.find((x) => x.invoiceId === i.id && x.data?.ticket_id);
    const tk = b ? tickets.find((x) => x.id === b.data?.ticket_id) : undefined;
    return { ...invoiceSummary(i), orderId: i.orderId, externalOrderId: ext, conversationId: i.conversationId, shop: shopRef(s), ticket: tk ? { id: tk.id, number: tk.number } : null };
  });
  const monthStart = startOfMonth(new TZDate(new Date(), ctx.merchant.timezone));
  const [stats] = await db()
    .select({ total: count(), thisMonth: sql<number>`count(*) filter (where ${inv.createdAt} >= ${monthStart.toISOString()}::timestamptz)::int` })
    .from(inv)
    .where(visibleInvoices(ctx));
  const last = page[page.length - 1];
  return { items, nextCursor: rows.length > q.limit && last ? encodeCursor(last.ts, last.i.id) : null, stats: { thisMonth: stats.thisMonth, total: stats.total } };
}

async function loadInvoice(ctx: MemberContext, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Problem("not-found");
  const [r] = await db()
    .select({ i: inv, ext: schema.order.externalOrderId })
    .from(inv)
    .leftJoin(schema.order, eq(schema.order.id, inv.orderId))
    .where(and(eq(inv.id, id), visibleInvoices(ctx)))
    .limit(1);
  if (!r) throw new Problem("not-found", { detail: "找不到这张发票，或它不在你负责的店铺里。" });
  return r;
}

// ── API-INV-004 下载 PDF ──

export async function invoicePdf(ctx: MemberContext, id: string): Promise<Response> {
  const { i } = await loadInvoice(ctx, id);
  const [file] = i.pdfFileId ? await db().select().from(schema.file).where(eq(schema.file.id, i.pdfFileId)).limit(1) : [];
  const full = file ? dataPath(file.path) : null;
  const info = full ? await stat(full).catch(() => null) : null;
  if (!full || !info) throw new Problem("not-found", { detail: "发票 PDF 已不存在。" });
  return new Response(Readable.toWeb(createReadStream(full)) as ReadableStream<Uint8Array>, {
    headers: {
      "content-type": "application/pdf",
      "content-length": String(info.size),
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${i.number}.pdf`)}`,
      "cache-control": "private, max-age=300",
      "x-content-type-options": "nosniff",
    },
  });
}

// ── API-INV-005 重发邮件 ──

export async function resendInvoiceEmail(ctx: MemberContext, id: string, body: { email?: string }) {
  const { i, ext } = await loadInvoice(ctx, id);
  const to = body.email || i.emailTo;
  if (!to) throw new Problem("not-allowed", { detail: "这张发票没有接收邮箱，填写邮箱后再重发。", code: "no_email" });
  const updated = await writeInvoiceEmail(ctx, i, ext, to);
  await audit(ctx.actor, {
    module: "orders",
    action: "invoice_email_resent",
    summary: `重发 ${i.number} 的邮件到 ${to}`,
    targetType: "invoice",
    targetId: i.id,
    data: { from_status: i.emailStatus, email_status: updated.emailStatus },
  });
  return invoiceSummary(updated);
}

// ── §11.9 bounce：发件箱把一封发票邮件标为退信 ──

/**
 * 发件箱退信（开发页「标记退信」调用）：发件箱条目记为 bounced；它是该发票最近一封邮件且发票邮件状态为 sent 时，
 * 发票转 bounced，并自动建「开票」工单（origin = rule，去重键 invoice:<平台订单号>）。不是发票邮件时返回 null。
 */
export async function markInvoiceEmailBounced(outboxId: string): Promise<{ invoiceId: string; emailStatus: string; ticketId: string | null } | null> {
  const [mail] = await db().select().from(schema.emailOutbox).where(eq(schema.emailOutbox.id, outboxId)).limit(1);
  if (!mail || mail.refType !== "invoice" || !mail.refId) return null;
  return db().transaction(async (tx) => {
    if (mail.status !== "bounced") await tx.update(schema.emailOutbox).set({ status: "bounced" }).where(eq(schema.emailOutbox.id, mail.id));
    const [i] = await tx.select().from(inv).where(eq(inv.id, mail.refId!)).for("update").limit(1);
    if (!i) return null;
    const [latest] = await tx
      .select({ id: schema.emailOutbox.id })
      .from(schema.emailOutbox)
      .where(and(eq(schema.emailOutbox.refType, "invoice"), eq(schema.emailOutbox.refId, i.id)))
      .orderBy(desc(schema.emailOutbox.createdAt))
      .limit(1);
    // 重发之后旧邮件的退信不改变当前状态
    if (latest?.id !== mail.id || i.emailStatus !== "sent") return { invoiceId: i.id, emailStatus: i.emailStatus, ticketId: null };
    await tx.update(inv).set({ emailStatus: "bounced", emailError: `发往 ${mail.toEmail} 的邮件被退回` }).where(eq(inv.id, i.id));
    const [order] = i.orderId ? await tx.select().from(schema.order).where(eq(schema.order.id, i.orderId)).limit(1) : [];
    const [shop] = await tx.select().from(schema.shop).where(eq(schema.shop.id, i.shopId)).limit(1);
    const [conv] = i.conversationId ? await tx.select().from(schema.conversation).where(eq(schema.conversation.id, i.conversationId)).limit(1) : [];
    const actor = systemActor(i.merchantId);
    const { ticket } = await createTicket(
      tx,
      {
        merchantId: i.merchantId,
        type: "invoice",
        origin: "rule",
        dedupeKey: `invoice:${order?.externalOrderId ?? i.number}`,
        shopId: i.shopId,
        platform: shop.platform,
        orderId: order?.id ?? null,
        conversationId: conv?.id ?? null,
        buyerName: conv?.buyerName ?? i.fields.buyerName,
        phase: "邮件退信",
        description: `发票 ${i.number} 发往 ${mail.toEmail} 的邮件被退回，请和买家确认邮箱后在「发票记录」重发。`,
        claimerId: conv?.claimedBy ?? null,
        createdBy: i.createdBy,
      },
      actor,
    );
    await audit(actor, { module: "orders", action: "invoice_email_bounced", summary: `${i.number} 的邮件被退回`, targetType: "invoice", targetId: i.id, data: { ticket_id: ticket?.id ?? null } }, tx);
    return { invoiceId: i.id, emailStatus: "bounced", ticketId: ticket?.id ?? null };
  });
}

