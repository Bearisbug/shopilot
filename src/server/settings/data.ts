// 数据与隐私（REQ-SET-004、11.10 purge、11.12）：删除买家数据、全量导出，以及后台任务 data.export、data.retention_purge、merchant.purge。
import { addHours, format, subDays, subMinutes } from "date-fns";
import { TZDate } from "@date-fns/tz";
import { and, desc, eq, inArray, isNotNull, lt, ne, or, sql } from "drizzle-orm";
import { strToU8, zipSync } from "fflate";
import type { ErasureResult, ExportItem } from "@/contracts/settings";
import type { MemberContext } from "../auth/context";
import { audit, systemActor } from "../core/audit";
import { sendEmail } from "../core/outbox";
import { db, pool, schema, type Executor } from "../db/client";
import { env } from "../env";
import { removeDataFile, writeDataFile } from "../files/storage";
import { Problem } from "../http/problem";
import { enqueue } from "../jobs/boss";

const EXPORT_TTL_HOURS = 24;
const EXPORT_TIMEOUT_MIN = 10;
const PURGE_BATCH = 5_000;
const PLATFORM_LABEL = { shopee: "Shopee", tiktok: "TikTok" } as const;

export function inTzText(d: Date, tz: string, pattern: string): string {
  return format(new TZDate(d, tz), pattern);
}

function log(line: Record<string, unknown>) {
  console.log(JSON.stringify({ t: new Date().toISOString(), level: "info", ...line }));
}

/** 删除 file 行与磁盘文件 */
async function deleteFiles(ids: string[], tx: Executor = db()) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return 0;
  const rows = await tx.delete(schema.file).where(inArray(schema.file.id, unique)).returning({ path: schema.file.path });
  for (const r of rows) await removeDataFile(r.path);
  return rows.length;
}

function fileIdsOfMessages(rows: Array<{ payload: { fileId?: string } | null }>): string[] {
  return rows.map((r) => r.payload?.fileId).filter((v): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v));
}

// ---------- 删除买家数据 API-SET-009 ----------

export async function eraseBuyer(ctx: MemberContext, body: { platform: "shopee" | "tiktok"; buyerExternalId: string }): Promise<ErasureResult> {
  const merchantId = ctx.merchant.id;
  const result = await db().transaction(async (tx) => {
    const convs = await tx
      .select({ id: schema.conversation.id })
      .from(schema.conversation)
      .where(and(eq(schema.conversation.merchantId, merchantId), eq(schema.conversation.platform, body.platform), eq(schema.conversation.buyerExternalId, body.buyerExternalId)));
    const convIds = convs.map((c) => c.id);
    const orders = await tx
      .select({ id: schema.order.id })
      .from(schema.order)
      .where(and(eq(schema.order.merchantId, merchantId), eq(schema.order.platform, body.platform), eq(schema.order.buyerExternalId, body.buyerExternalId)));
    const orderIds = orders.map((o) => o.id);

    let messages = 0;
    let drafts = 0;
    const fileIds: string[] = [];
    if (convIds.length) {
      const msgRows = await tx.select({ payload: schema.message.payload }).from(schema.message).where(inArray(schema.message.conversationId, convIds));
      messages = msgRows.length;
      fileIds.push(...fileIdsOfMessages(msgRows));
      const [d] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.draft).where(inArray(schema.draft.conversationId, convIds));
      drafts = d.n;
    }
    const invoiceWhere = [convIds.length ? inArray(schema.invoice.conversationId, convIds) : undefined, orderIds.length ? inArray(schema.invoice.orderId, orderIds) : undefined].filter(Boolean);
    let invoices = 0;
    if (invoiceWhere.length) {
      const inv = await tx
        .delete(schema.invoice)
        .where(and(eq(schema.invoice.merchantId, merchantId), or(...invoiceWhere)))
        .returning({ pdf: schema.invoice.pdfFileId, png: schema.invoice.imageFileId });
      invoices = inv.length;
      for (const i of inv) fileIds.push(...[i.pdf, i.png].filter((v): v is string => Boolean(v)));
    }
    // 订单与售后是交易记录，镜像保留但去掉买家身份（名字、收件信息、买家 ID）；工单上的买家名同样清掉
    if (orderIds.length) {
      await tx.update(schema.order).set({ buyerName: null, buyerExternalId: null, recipient: null }).where(inArray(schema.order.id, orderIds));
      await tx.update(schema.ticket).set({ buyerName: null }).where(and(eq(schema.ticket.merchantId, merchantId), inArray(schema.ticket.orderId, orderIds)));
    }
    await tx
      .update(schema.afterSale)
      .set({ buyerExternalId: null })
      .where(and(eq(schema.afterSale.merchantId, merchantId), eq(schema.afterSale.platform, body.platform), eq(schema.afterSale.buyerExternalId, body.buyerExternalId)));
    if (convIds.length) await tx.update(schema.ticket).set({ buyerName: null }).where(and(eq(schema.ticket.merchantId, merchantId), inArray(schema.ticket.conversationId, convIds)));
    // 会话删除级联消息、草稿、段
    if (convIds.length) await tx.delete(schema.conversation).where(inArray(schema.conversation.id, convIds));
    await deleteFiles(fileIds, tx);

    const counts = { conversations: convIds.length, messages, drafts, invoices, orders: orderIds.length };
    await audit(
      ctx.actor,
      {
        module: "settings",
        action: "buyer_data_erased",
        summary: `删除一位 ${PLATFORM_LABEL[body.platform]} 买家的数据：会话 ${counts.conversations}、消息 ${counts.messages}、草稿 ${counts.drafts}、发票 ${counts.invoices}，${counts.orders} 张订单去掉买家信息`,
        data: { platform: body.platform, ...counts },
      },
      tx,
    );
    return counts;
  });
  return result;
}

// ---------- 导出 API-SET-010 / 011 ----------

function exportView(row: typeof schema.exportJob.$inferSelect): ExportItem {
  const live = row.status === "done" && row.fileId && row.expiresAt && row.expiresAt > new Date();
  return {
    id: row.id,
    status: row.status === "done" && !live ? "expired" : row.status,
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    downloadUrl: live ? `/api/v1/files/${row.fileId}` : null,
    error: row.error,
  };
}

/** 超过 10 分钟仍在排队或进行中的导出按 11.12 fail 处理 */
async function failStaleExports(merchantId: string) {
  await db()
    .update(schema.exportJob)
    .set({ status: "failed", error: `超过 ${EXPORT_TIMEOUT_MIN} 分钟没有完成`, finishedAt: new Date() })
    .where(and(eq(schema.exportJob.merchantId, merchantId), inArray(schema.exportJob.status, ["queued", "running"]), lt(schema.exportJob.createdAt, subMinutes(new Date(), EXPORT_TIMEOUT_MIN))));
}

export async function listExports(merchantId: string): Promise<ExportItem[]> {
  await failStaleExports(merchantId);
  const rows = await db().select().from(schema.exportJob).where(eq(schema.exportJob.merchantId, merchantId)).orderBy(desc(schema.exportJob.createdAt)).limit(20);
  return rows.map(exportView);
}

export async function requestExport(ctx: MemberContext): Promise<{ exportJobId: string }> {
  await failStaleExports(ctx.merchant.id);
  const job = await db().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`export:${ctx.merchant.id}`}))`);
    const [busy] = await tx
      .select({ id: schema.exportJob.id })
      .from(schema.exportJob)
      .where(and(eq(schema.exportJob.merchantId, ctx.merchant.id), inArray(schema.exportJob.status, ["queued", "running"])));
    if (busy) throw new Problem("conflict", { title: "已有进行中的导出", detail: "已有一个导出在进行中，完成后再发起新的导出。", code: "export_in_progress", extra: { exportJobId: busy.id } });
    const [row] = await tx.insert(schema.exportJob).values({ merchantId: ctx.merchant.id, requestedBy: ctx.membership.id }).returning();
    await audit(ctx.actor, { module: "settings", action: "data_export_requested", summary: "发起全量数据导出", targetType: "export_job", targetId: row.id }, tx);
    return row;
  });
  await enqueue("data.export", { exportJobId: job.id, requestId: ctx.requestId }, { singletonKey: ctx.merchant.id });
  return { exportJobId: job.id };
}

type Cell = string | number | null | undefined;
function csvText(rows: Cell[][]): string {
  const esc = (v: Cell) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + rows.map((r) => r.map(esc).join(",")).join("\n");
}

async function buildExportZip(merchantId: string, tz: string): Promise<Uint8Array> {
  const t = (d: Date | null | undefined) => (d ? inTzText(d, tz, "yyyy-MM-dd HH:mm:ss") : "");
  const shopName = schema.shop.name;
  const convs = await db()
    .select({ c: schema.conversation, shop: shopName })
    .from(schema.conversation)
    .innerJoin(schema.shop, eq(schema.shop.id, schema.conversation.shopId))
    .where(eq(schema.conversation.merchantId, merchantId))
    .orderBy(schema.conversation.createdAt);
  const msgs = await db().select().from(schema.message).where(eq(schema.message.merchantId, merchantId)).orderBy(schema.message.conversationId, schema.message.sentAt);
  const orders = await db()
    .select({ o: schema.order, shop: shopName })
    .from(schema.order)
    .innerJoin(schema.shop, eq(schema.shop.id, schema.order.shopId))
    .where(eq(schema.order.merchantId, merchantId))
    .orderBy(schema.order.platformCreatedAt);
  const tickets = await db()
    .select({ k: schema.ticket, shop: shopName, assignee: schema.user.name })
    .from(schema.ticket)
    .innerJoin(schema.shop, eq(schema.shop.id, schema.ticket.shopId))
    .leftJoin(schema.membership, eq(schema.membership.id, schema.ticket.assigneeId))
    .leftJoin(schema.user, eq(schema.user.id, schema.membership.userId))
    .where(eq(schema.ticket.merchantId, merchantId))
    .orderBy(schema.ticket.createdAt);
  const invoices = await db()
    .select({ i: schema.invoice, shop: shopName, orderNo: schema.order.externalOrderId })
    .from(schema.invoice)
    .innerJoin(schema.shop, eq(schema.shop.id, schema.invoice.shopId))
    .leftJoin(schema.order, eq(schema.order.id, schema.invoice.orderId))
    .where(eq(schema.invoice.merchantId, merchantId))
    .orderBy(schema.invoice.createdAt);

  const files: Record<string, Uint8Array> = {
    "conversations.csv": strToU8(
      csvText([
        ["会话 ID", "店铺", "平台", "买家 ID", "买家名", "接待状态", "开始时间", "最后消息时间"],
        ...convs.map(({ c, shop }) => [c.id, shop, c.platform, c.buyerExternalId, c.buyerName, c.handlingState, t(c.createdAt), t(c.lastMessageAt)]),
      ]),
    ),
    "messages.csv": strToU8(
      csvText([
        ["消息 ID", "会话 ID", "会话段 ID", "方向", "发送方", "类型", "正文", "原文", "译文", "发送状态", "时间"],
        ...msgs.map((m) => [m.id, m.conversationId, m.segmentId, m.direction, m.senderRole, m.type, m.text, m.originalText, m.translation, m.sendStatus, t(m.sentAt)]),
      ]),
    ),
    "orders.csv": strToU8(
      csvText([
        ["订单号", "店铺", "平台", "买家 ID", "买家名", "平台状态", "金额", "币种", "下单时间", "最晚发货"],
        ...orders.map(({ o, shop }) => [o.externalOrderId, shop, o.platform, o.buyerExternalId, o.buyerName, o.platformStatus, o.totalAmount, o.currency, t(o.platformCreatedAt), t(o.shipByAt)]),
      ]),
    ),
    "tickets.csv": strToU8(
      csvText([
        ["工单号", "类型", "来源", "状态", "店铺", "平台", "买家名", "负责人", "截止时间", "建单时间", "解决时间"],
        ...tickets.map(({ k, shop, assignee }) => [k.number, k.type, k.origin, k.status, shop, k.platform, k.buyerName, assignee, t(k.dueAt), t(k.createdAt), t(k.resolvedAt)]),
      ]),
    ),
    "invoices.csv": strToU8(
      csvText([
        ["编号", "类型", "店铺", "订单号", "抬头", "合计", "币种", "聊天发送", "邮件发送", "开具时间"],
        ...invoices.map(({ i, shop, orderNo }) => [i.number, i.kind, shop, orderNo, i.fields.buyerName, i.fields.total, i.fields.currency, i.chatStatus, i.emailStatus, t(i.createdAt)]),
      ]),
    ),
  };
  return zipSync(files, { level: 6 });
}

/** 后台任务 data.export（11.12 start → finish / fail） */
export async function runExport(data: Record<string, unknown>): Promise<void> {
  const exportJobId = String(data.exportJobId ?? "");
  const [job] = await db()
    .update(schema.exportJob)
    .set({ status: "running" })
    .where(and(eq(schema.exportJob.id, exportJobId), eq(schema.exportJob.status, "queued")))
    .returning();
  if (!job) return;
  const requestId = typeof data.requestId === "string" ? data.requestId : undefined;
  try {
    const [merchant] = await db().select().from(schema.merchant).where(eq(schema.merchant.id, job.merchantId));
    const zip = await buildExportZip(job.merchantId, merchant.timezone);
    const relative = `exports/${job.merchantId}/${job.id}.zip`;
    await writeDataFile(relative, zip);
    const expiresAt = addHours(new Date(), EXPORT_TTL_HOURS);
    const [requester] = job.requestedBy
      ? await db()
          .select({ email: schema.user.email, name: schema.user.name })
          .from(schema.membership)
          .innerJoin(schema.user, eq(schema.user.id, schema.membership.userId))
          .where(eq(schema.membership.id, job.requestedBy))
      : [];
    await db().transaction(async (tx) => {
      const [file] = await tx
        .insert(schema.file)
        .values({ merchantId: job.merchantId, kind: "export_zip", path: relative, mime: "application/zip", size: zip.byteLength, createdBy: job.requestedBy })
        .returning({ id: schema.file.id });
      await tx.update(schema.exportJob).set({ status: "done", fileId: file.id, expiresAt, finishedAt: new Date() }).where(eq(schema.exportJob.id, job.id));
      if (requester) {
        await sendEmail(
          {
            to: requester.email,
            merchantId: job.merchantId,
            template: "export_ready",
            subject: `「${merchant.name}」的数据导出已完成`,
            body: `${requester.name}，你好：\n\n会话、消息、订单、工单、发票已打包成 ZIP（${Math.ceil(zip.byteLength / 1024)} KB）。下载链接 ${EXPORT_TTL_HOURS} 小时内有效，需要先登录 Shopilot。`,
            links: [{ label: "下载导出包", url: `${env().APP_BASE_URL}/api/v1/files/${file.id}` }],
            refType: "export_job",
            refId: job.id,
          },
          tx,
        );
      }
      await audit(systemActor(job.merchantId, requestId), { module: "settings", action: "data_export_finished", summary: `全量数据导出完成，${Math.ceil(zip.byteLength / 1024)} KB`, targetType: "export_job", targetId: job.id }, tx);
    });
  } catch (err) {
    await db().update(schema.exportJob).set({ status: "failed", error: "打包出错，请重新导出。", finishedAt: new Date() }).where(eq(schema.exportJob.id, job.id));
    throw err;
  }
}

// ---------- 后台任务 data.retention_purge ----------

/** 删除过期导出文件（11.12 expire），返回处理条数 */
async function expireExports(merchantId?: string): Promise<number> {
  const where = [eq(schema.exportJob.status, "done"), lt(schema.exportJob.expiresAt, new Date())];
  if (merchantId) where.push(eq(schema.exportJob.merchantId, merchantId));
  const rows = await db().select().from(schema.exportJob).where(and(...where));
  for (const row of rows) {
    await db().transaction(async (tx) => {
      if (row.fileId) await deleteFiles([row.fileId], tx);
      await tx.update(schema.exportJob).set({ status: "expired" }).where(eq(schema.exportJob.id, row.id));
    });
  }
  return rows.length;
}

async function purgeMerchantData(merchant: typeof schema.merchant.$inferSelect) {
  const cutoff = subDays(new Date(), merchant.retentionDays);
  const counts = { segments: 0, messages: 0, drafts: 0, conversations: 0, orders: 0, files: 0 };
  for (;;) {
    const segs = await db()
      .select({ id: schema.segment.id, conversationId: schema.segment.conversationId })
      .from(schema.segment)
      .where(and(eq(schema.segment.merchantId, merchant.id), isNotNull(schema.segment.endedAt), lt(schema.segment.endedAt, cutoff)))
      .limit(PURGE_BATCH);
    if (segs.length === 0) break;
    await db().transaction(async (tx) => {
      const segIds = segs.map((s) => s.id);
      const msgs = await tx.delete(schema.message).where(inArray(schema.message.segmentId, segIds)).returning({ payload: schema.message.payload });
      const drafts = await tx.delete(schema.draft).where(inArray(schema.draft.segmentId, segIds)).returning({ id: schema.draft.id });
      await tx.delete(schema.segment).where(inArray(schema.segment.id, segIds));
      const convIds = [...new Set(segs.map((s) => s.conversationId))];
      const empty = await tx
        .delete(schema.conversation)
        .where(and(inArray(schema.conversation.id, convIds), sql`not exists (select 1 from ${schema.segment} where ${schema.segment.conversationId} = ${schema.conversation.id})`))
        .returning({ id: schema.conversation.id });
      counts.files += await deleteFiles(fileIdsOfMessages(msgs), tx);
      counts.segments += segIds.length;
      counts.messages += msgs.length;
      counts.drafts += drafts.length;
      counts.conversations += empty.length;
    });
  }
  for (;;) {
    const orders = await db()
      .select({ id: schema.order.id })
      .from(schema.order)
      .where(and(eq(schema.order.merchantId, merchant.id), lt(sql`coalesce(${schema.order.platformUpdatedAt}, ${schema.order.platformCreatedAt})`, cutoff)))
      .limit(PURGE_BATCH);
    if (orders.length === 0) break;
    await db().delete(schema.order).where(inArray(schema.order.id, orders.map((o) => o.id)));
    counts.orders += orders.length;
  }
  await db().update(schema.merchant).set({ lastPurgeAt: new Date() }).where(eq(schema.merchant.id, merchant.id));
  if (counts.segments + counts.orders > 0) {
    await audit(systemActor(merchant.id), {
      module: "settings",
      action: "retention_purged",
      summary: `按保存期限清理：会话段 ${counts.segments}、消息 ${counts.messages}、草稿 ${counts.drafts}、订单镜像 ${counts.orders}`,
      data: { retention_days: merchant.retentionDays, ...counts },
    });
  }
  return counts;
}

/**
 * 后台任务 data.retention_purge：每小时跑，只处理当地时间 03 点的商户；同时清理全部过期导出。
 * `pnpm job` 手动触发时传 `{ force: true }` 跳过时间窗，`merchantId` 只处理该商户。
 */
export async function retentionPurge(data: Record<string, unknown> = {}): Promise<void> {
  const force = data.force === true;
  const only = typeof data.merchantId === "string" ? data.merchantId : undefined;
  const expired = await expireExports(only);
  const where = [eq(schema.merchant.status, "active")];
  if (only) where.push(eq(schema.merchant.id, only));
  const merchants = await db().select().from(schema.merchant).where(and(...where));
  const now = new Date();
  let processed = 0;
  for (const m of merchants) {
    if (!force && new TZDate(now, m.timezone).getHours() !== 3) continue;
    const counts = await purgeMerchantData(m);
    processed += 1;
    log({ job: "data.retention_purge", merchantId: m.id, ...counts });
  }
  log({ job: "data.retention_purge", merchants: processed, exportsExpired: expired });
}

// ---------- 后台任务 merchant.purge ----------

/** 有 merchant_id 列的业务表（public schema），按名字取，避免新增表时漏删 */
async function merchantTables(): Promise<string[]> {
  const res = await pool().query<{ table_name: string }>(
    `select c.table_name from information_schema.columns c join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
     where c.table_schema = 'public' and c.column_name = 'merchant_id' and t.table_type = 'BASE TABLE' and c.table_name not in ('merchant', 'audit_log')`,
  );
  // 先删接入应用（级联店铺及其会话、订单、工单），再删其余
  return res.rows.map((r) => r.table_name).sort((x, y) => (x === "platform_app" ? -1 : y === "platform_app" ? 1 : x.localeCompare(y)));
}

/**
 * 后台任务 merchant.purge（11.10 purge）：pending_deletion 且 purge_at 已到的商户，删除全部业务数据与文件，保留商户行与审计日志。
 * `merchantId` 只处理该商户；purge_at 未到的商户任何参数下都不处理（不可恢复的删除）。
 */
export async function purgeMerchants(data: Record<string, unknown> = {}): Promise<void> {
  const only = typeof data.merchantId === "string" ? data.merchantId : undefined;
  const where = [eq(schema.merchant.status, "pending_deletion"), lt(schema.merchant.purgeAt, new Date())];
  if (only) where.push(eq(schema.merchant.id, only));
  const due = await db().select().from(schema.merchant).where(and(...where));
  for (const m of due) {
    const files = await db().select({ id: schema.file.id }).from(schema.file).where(eq(schema.file.merchantId, m.id));
    await deleteFiles(files.map((f) => f.id));
    // 知识库检索实例由 knowledge.purge 删除（带重试）；实例名随载荷带走，下面删表后库里就查不到了
    const [kb] = await db().select({ name: schema.knowledgeIndex.instanceName }).from(schema.knowledgeIndex).where(eq(schema.knowledgeIndex.merchantId, m.id));
    if (kb) await enqueue("knowledge.purge", { instance: kb.name }, { singletonKey: `instance:${kb.name}` });
    const tables = await merchantTables();
    const deleted: Record<string, number> = {};
    // 外键顺序由级联兜底；个别表因引用暂删不掉时下一轮重试
    let pending = tables;
    for (let round = 0; round < 3 && pending.length; round++) {
      const failed: string[] = [];
      for (const table of pending) {
        try {
          const res = await pool().query(`delete from "${table}" where merchant_id = $1`, [m.id]);
          deleted[table] = (deleted[table] ?? 0) + (res.rowCount ?? 0);
        } catch {
          failed.push(table);
        }
      }
      pending = failed;
    }
    if (pending.length) {
      log({ job: "merchant.purge", merchantId: m.id, msg: "部分表未删完，下轮续删", pending });
      continue;
    }
    await db().update(schema.merchant).set({ status: "deleted", updatedAt: new Date() }).where(and(eq(schema.merchant.id, m.id), ne(schema.merchant.status, "deleted")));
    await audit(systemActor(m.id), { module: "settings", action: "merchant_purged", summary: "商户数据已清除（保留商户记录与审计日志）", targetType: "merchant", targetId: m.id, data: { deleted } });
    log({ job: "merchant.purge", merchantId: m.id, deleted });
  }
}
