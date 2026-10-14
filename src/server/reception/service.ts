// 接待设置（REQ-RCP-001 至 REQ-RCP-004）与快捷回复（REQ-CONV-009）。保存后从下一条入站消息起生效：出稿与转人工每次现读这里的配置。
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import {
  DUE_OPTIONS,
  MANUAL_ONLY_TYPES,
  PROMPT_STAGE_KEYS,
  PROMPT_VERSIONS_KEPT,
  REMIND_KIND,
  REMIND_OPTIONS,
  SHOPEE_AUTO_BLOCKED,
  TICKET_TYPE_LABEL,
  TICKET_TYPES,
  dueKey,
  dueLabel,
  remindLabel,
  type HoursBody,
  type ModesBody,
  type ModesResult,
  type PromptStageKey,
  type PromptStageState,
  type PromptsBody,
  type QuickReply,
  type QuickReplyBody,
  type QuickReplyList,
  type QuickReplyStage,
  type ReceptionMode,
  type ReceptionSettings,
  type Remind,
  type TicketTypeKey,
  type TicketTypeRow,
  type TicketTypesBody,
  type TicketTypesResponse,
} from "@/contracts/reception";
import { DEFAULT_PROMPTS, GUARDRAILS, STAGE_LABEL, UNKNOWN_STAGE_PROMPT } from "../ai/prompts";
import type { MemberContext } from "../auth/context";
import { audit } from "../core/audit";
import { db, schema } from "../db/client";
import { notAllowed, notFound, validation } from "../http/problem";
import { DEFAULT_HANDOFF_KEYWORDS, DEFAULT_SCHEDULE, DEFAULT_TICKET_TYPES } from "../merchants/defaults";
import { setTikTokAcceptChat } from "../shops/agent-settings";

/** 只读接入的店不能从 Shopilot 发送，只能 off 或 shadow */
const READ_ONLY_MODE_REASON = "是只读接入，消息从平台拉取、不能从 Shopilot 发送，只能设为 off 或 shadow";

const sr = schema.shopReception;
const rs = schema.receptionSettings;
const pt = schema.promptTemplate;
const qr = schema.quickReply;
const ttc = schema.ticketTypeConfig;

const TICKET_NUMBER_PREFIX = "T-";

/** 每类工单的触发来源与时限来源说明（DESIGN §11.4 平台售后映射、§9.5 默认值） */
const TICKET_TYPE_INFO: Record<TicketTypeKey, { trigger: string; dueSourceLabel: string; platformDriven: boolean }> = {
  return_refund: {
    trigger: "自动：Shopee 推送 code 29（未订阅时每小时轮询退货列表）、TikTok webhook 12",
    dueSourceLabel: "平台：Shopee due_date / return_seller_due_date / seller_evidence_deadline，TikTok deadline",
    platformDriven: true,
  },
  cancel_request: {
    trigger: "自动：Shopee 推送 code 3 订单进入 IN_CANCEL、TikTok webhook 11",
    dueSourceLabel: "TikTok 取平台 deadline；Shopee 没有截止字段，用商户时限且不晚于最晚发货",
    platformDriven: true,
  },
  logistics: {
    trigger: "自动：Shopee 推送 code 30 揽收失败 / 派送失败 / 丢件或订单 RETRY_SHIP；TikTok 每小时扫描超时未送达或 72 小时无新轨迹",
    dueSourceLabel: "平台截止字段（TikTok shipping / collection / delivery_due_time，Shopee ship_by_date），都没有时用商户时限",
    platformDriven: false,
  },
  invoice: { trigger: "手动建；发票邮件退信时自动建单", dueSourceLabel: "商户", platformDriven: false },
  stock: { trigger: "手动建", dueSourceLabel: "关联订单的最晚发货时间，没有订单时用商户时限", platformDriven: false },
  handover: { trigger: "工作时间结束时自动扫描「我处理中」、最后一条是买家消息且超过接待时限的会话；也可手动建", dueSourceLabel: "商户（下个工作时段开始后计时）", platformDriven: false },
  internal: { trigger: "手动建：售前技术、价格审批", dueSourceLabel: "商户", platformDriven: false },
};

async function deniedByRule(ctx: MemberContext, apiId: string, reason: string, detail: string): Promise<never> {
  await audit(ctx.actor, { module: "auth", action: "permission_denied", summary: `被业务规则拒绝：${detail}`, data: { api_id: apiId, role: ctx.membership.role, reason } });
  throw notAllowed(detail, reason);
}

// ---------- API-RCP-001 ----------

async function receptionShops(merchantId: string) {
  return db()
    .select({ id: schema.shop.id, name: schema.shop.name, platform: schema.shop.platform, market: schema.shop.market, modeInHours: sr.modeInHours, modeOffHours: sr.modeOffHours, readOnly: schema.platformApp.readOnly })
    .from(schema.shop)
    .leftJoin(sr, eq(sr.shopId, schema.shop.id))
    .innerJoin(schema.platformApp, eq(schema.platformApp.id, schema.shop.platformAppId))
    .where(and(eq(schema.shop.merchantId, merchantId), ne(schema.shop.status, "disconnected")))
    .orderBy(schema.shop.platform, schema.shop.name);
}

function stageState(row: { text: string; versions: Array<{ savedAt: string; text: string }> } | undefined, stage: PromptStageKey): PromptStageState {
  const custom = row && row.text !== "";
  return { text: custom ? row.text : DEFAULT_PROMPTS[stage], isDefault: !custom, versions: row?.versions ?? [] };
}

export async function getReception(ctx: MemberContext): Promise<ReceptionSettings> {
  const merchantId = ctx.merchant.id;
  const [shops, [settings], templates] = await Promise.all([
    receptionShops(merchantId),
    db().select().from(rs).where(eq(rs.merchantId, merchantId)),
    db().select().from(pt).where(eq(pt.merchantId, merchantId)),
  ]);
  const byStage = new Map(templates.map((t) => [t.stage, t]));
  return {
    shops: shops.map((s) => ({
      shopId: s.id,
      name: s.name,
      platform: s.platform,
      market: s.market,
      modeInHours: s.modeInHours ?? "off",
      modeOffHours: s.modeOffHours ?? "off",
      autoAllowed: s.platform === "tiktok" && !s.readOnly,
      ...(s.platform === "shopee" ? { autoBlockedReason: SHOPEE_AUTO_BLOCKED } : {}),
      ...(s.readOnly ? { readOnly: true, autoBlockedReason: READ_ONLY_MODE_REASON } : {}),
    })),
    hours: { timezone: ctx.merchant.timezone, schedule: settings?.schedule ?? DEFAULT_SCHEDULE, holidays: settings?.holidays ?? [] },
    handoff: {
      keywords: settings?.handoffKeywords ?? DEFAULT_HANDOFF_KEYWORDS,
      confidenceThreshold: settings?.confidenceThreshold ?? 0.6,
      unclaimedRemindMinutes: settings ? settings.unclaimedRemindMinutes : 10,
      responseSlaMinutes: settings?.responseSlaMinutes ?? 15,
    },
    prompts: {
      brandVoice: settings?.brandVoice ?? "",
      stages: { presale: stageState(byStage.get("presale"), "presale"), insale: stageState(byStage.get("insale"), "insale"), aftersale: stageState(byStage.get("aftersale"), "aftersale") },
      unknownStageText: UNKNOWN_STAGE_PROMPT,
      guardrails: GUARDRAILS,
    },
  };
}

// ---------- API-RCP-002 ----------

const isOn = (inHours: ReceptionMode, offHours: ReceptionMode) => inHours !== "off" || offHours !== "off";

export async function saveModes(ctx: MemberContext, body: ModesBody): Promise<ModesResult> {
  if (body.shops.length === 0) return { changed: 0, warnings: [] };
  const ids = body.shops.map((s) => s.shopId);
  const current = await db()
    .select({ id: schema.shop.id, name: schema.shop.name, platform: schema.shop.platform, modeInHours: sr.modeInHours, modeOffHours: sr.modeOffHours, readOnly: schema.platformApp.readOnly })
    .from(schema.shop)
    .leftJoin(sr, eq(sr.shopId, schema.shop.id))
    .innerJoin(schema.platformApp, eq(schema.platformApp.id, schema.shop.platformAppId))
    .where(and(eq(schema.shop.merchantId, ctx.merchant.id), inArray(schema.shop.id, ids), ne(schema.shop.status, "disconnected")));
  const byId = new Map(current.map((s) => [s.id, s]));
  if (byId.size !== ids.length) throw notFound("有店铺不存在或已断开，刷新页面后重试。");
  for (const s of body.shops) {
    const shop = byId.get(s.shopId)!;
    if (shop.readOnly && [s.modeInHours, s.modeOffHours].some((m) => m === "assist" || m === "auto")) {
      await deniedByRule(ctx, "API-RCP-002", "read_only", `「${shop.name}」${READ_ONLY_MODE_REASON}。`);
    }
    if (shop.platform === "shopee" && (s.modeInHours === "auto" || s.modeOffHours === "auto")) {
      await deniedByRule(ctx, "API-RCP-002", "shopee_auto", `「${shop.name}」不能设为 auto：${SHOPEE_AUTO_BLOCKED}。`);
    }
  }

  const changes = body.shops
    .map((s) => {
      const shop = byId.get(s.shopId)!;
      const before = { in: (shop.modeInHours ?? "off") as ReceptionMode, off: (shop.modeOffHours ?? "off") as ReceptionMode };
      return { shop, before, after: { in: s.modeInHours, off: s.modeOffHours } };
    })
    .filter((c) => c.before.in !== c.after.in || c.before.off !== c.after.off);
  if (changes.length === 0) return { changed: 0, warnings: [] };

  const now = new Date();
  await db().transaction(async (tx) => {
    for (const c of changes) {
      await tx
        .insert(sr)
        .values({ shopId: c.shop.id, merchantId: ctx.merchant.id, modeInHours: c.after.in, modeOffHours: c.after.off, updatedAt: now })
        .onConflictDoUpdate({ target: sr.shopId, set: { modeInHours: c.after.in, modeOffHours: c.after.off, updatedAt: now } });
      await audit(
        ctx.actor,
        {
          module: "reception",
          action: "reception_mode_changed",
          summary: `把「${c.shop.name}」的接待模式改为工作时间内 ${c.after.in}、工作时间外 ${c.after.off}`,
          targetType: "shop",
          targetId: c.shop.id,
          data: { before: c.before, after: c.after },
        },
        tx,
      );
    }
  });

  // TikTok 坐席接单随「是否接待」同步：全 off ↔ 任一段非 off
  const warnings: string[] = [];
  for (const c of changes) {
    if (c.shop.platform !== "tiktok") continue;
    const was = isOn(c.before.in, c.before.off);
    const will = isOn(c.after.in, c.after.off);
    if (was === will) continue;
    const r = await setTikTokAcceptChat(c.shop.id, will).catch((e: unknown) => ({ ok: false, error: e instanceof Error ? e.message : String(e) }));
    if (!r.ok) warnings.push(`「${c.shop.name}」的接待模式已保存，但 TikTok 坐席接单没有同步${will ? "开启" : "关闭"}：${r.error ?? "平台没有返回原因"}`);
  }
  return { changed: changes.length, warnings };
}

// ---------- API-RCP-003 ----------

function uniqueKeywords(list: string[]): string[] {
  const seen = new Set<string>();
  return list.filter((k) => {
    const key = k.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function saveHours(ctx: MemberContext, body: HoursBody) {
  const merchantId = ctx.merchant.id;
  const [before] = await db().select().from(rs).where(eq(rs.merchantId, merchantId));
  const next = {
    schedule: body.schedule,
    holidays: [...new Set(body.holidays)].sort(),
    handoffKeywords: uniqueKeywords(body.keywords),
    confidenceThreshold: Math.round(body.confidenceThreshold * 100) / 100,
    unclaimedRemindMinutes: body.unclaimedRemindMinutes,
    responseSlaMinutes: body.responseSlaMinutes,
  };
  const changed: string[] = [];
  if (body.timezone !== ctx.merchant.timezone) changed.push("timezone");
  for (const k of Object.keys(next) as Array<keyof typeof next>) {
    if (JSON.stringify(before?.[k] ?? null) !== JSON.stringify(next[k])) changed.push(k);
  }
  if (changed.length === 0) return { ok: true };

  const now = new Date();
  await db().transaction(async (tx) => {
    if (body.timezone !== ctx.merchant.timezone) {
      await tx.update(schema.merchant).set({ timezone: body.timezone, updatedAt: now }).where(eq(schema.merchant.id, merchantId));
    }
    await tx
      .insert(rs)
      .values({ merchantId, ...next, updatedAt: now })
      .onConflictDoUpdate({ target: rs.merchantId, set: { ...next, updatedAt: now } });
    await audit(
      ctx.actor,
      {
        module: "reception",
        action: "reception_hours_updated",
        summary: "修改工作时间与转人工设置",
        targetType: "merchant",
        targetId: merchantId,
        data: {
          changed,
          ...(changed.includes("timezone") ? { timezone: { before: ctx.merchant.timezone, after: body.timezone } } : {}),
          keywordCount: next.handoffKeywords.length,
          confidenceThreshold: next.confidenceThreshold,
          unclaimedRemindMinutes: next.unclaimedRemindMinutes,
          responseSlaMinutes: next.responseSlaMinutes,
        },
      },
      tx,
    );
  });
  return { ok: true };
}

// ---------- API-RCP-004、API-RCP-005 ----------

export async function savePrompts(ctx: MemberContext, body: PromptsBody) {
  const merchantId = ctx.merchant.id;
  const now = new Date();
  const savedAt = now.toISOString();
  const changedStages: PromptStageKey[] = [];
  let brandVoiceChanged = false;

  await db().transaction(async (tx) => {
    if (body.brandVoice !== undefined) {
      const [cur] = await tx.select({ brandVoice: rs.brandVoice }).from(rs).where(eq(rs.merchantId, merchantId));
      const value = body.brandVoice === "" ? null : body.brandVoice;
      if ((cur?.brandVoice ?? null) !== value) {
        brandVoiceChanged = true;
        await tx
          .insert(rs)
          .values({ merchantId, schedule: DEFAULT_SCHEDULE, handoffKeywords: DEFAULT_HANDOFF_KEYWORDS, brandVoice: value, updatedAt: now })
          .onConflictDoUpdate({ target: rs.merchantId, set: { brandVoice: value, updatedAt: now } });
      }
    }
    for (const stage of PROMPT_STAGE_KEYS) {
      const text = body.stages?.[stage];
      if (text === undefined) continue;
      const [cur] = await tx.select().from(pt).where(and(eq(pt.merchantId, merchantId), eq(pt.stage, stage)));
      if (cur && cur.text === text) continue;
      // 版本 = 最近保存过的正文，新的在前，同文去重，最多 10 个；恢复默认不动版本
      const versions = [{ savedAt, text }, ...(cur?.versions ?? []).filter((v) => v.text !== text)].slice(0, PROMPT_VERSIONS_KEPT);
      await tx
        .insert(pt)
        .values({ merchantId, stage, text, versions, updatedAt: now })
        .onConflictDoUpdate({ target: [pt.merchantId, pt.stage], set: { text, versions, updatedAt: now } });
      changedStages.push(stage);
    }
    if (changedStages.length === 0 && !brandVoiceChanged) return;
    const parts = [...(brandVoiceChanged ? ["品牌语气"] : []), ...changedStages.map((s) => `${STAGE_LABEL[s]}提示词`)];
    await audit(
      ctx.actor,
      { module: "reception", action: "reception_prompts_updated", summary: `修改${parts.join("、")}`, targetType: "merchant", targetId: merchantId, data: { stages: changedStages, brandVoice: brandVoiceChanged } },
      tx,
    );
  });
  return { ok: true, changedStages, brandVoiceChanged };
}

export async function resetPrompt(ctx: MemberContext, stage: PromptStageKey): Promise<PromptStageState> {
  const merchantId = ctx.merchant.id;
  const [cur] = await db().select().from(pt).where(and(eq(pt.merchantId, merchantId), eq(pt.stage, stage)));
  if (!cur || cur.text === "") return stageState(cur, stage);
  const now = new Date();
  await db().transaction(async (tx) => {
    await tx.update(pt).set({ text: "", updatedAt: now }).where(and(eq(pt.merchantId, merchantId), eq(pt.stage, stage)));
    await audit(ctx.actor, { module: "reception", action: "reception_prompt_reset", summary: `${STAGE_LABEL[stage]}提示词恢复为内置默认`, targetType: "merchant", targetId: merchantId, data: { stage } }, tx);
  });
  return stageState({ text: "", versions: cur.versions }, stage);
}

// ---------- API-RCP-006、API-RCP-007 ----------

export async function getTicketTypes(ctx: MemberContext): Promise<TicketTypesResponse> {
  const rows = await db().select().from(ttc).where(eq(ttc.merchantId, ctx.merchant.id));
  const byType = new Map(rows.map((r) => [r.type, r]));
  const types: TicketTypeRow[] = TICKET_TYPES.map((type) => {
    const row = byType.get(type) ?? DEFAULT_TICKET_TYPES.find((d) => d.type === type)!;
    return {
      type,
      ...TICKET_TYPE_INFO[type],
      autoCreate: row.autoCreate,
      merchantDue: DUE_OPTIONS[type] === null ? null : row.merchantDue,
      defaultAssignee: row.defaultAssignee,
      remind: row.remind,
    };
  });
  return { types, autoCloseDays: ctx.merchant.ticketAutoCloseDays ?? null, numberPrefix: TICKET_NUMBER_PREFIX };
}

export async function saveTicketTypes(ctx: MemberContext, body: TicketTypesBody) {
  const fields: Record<string, string> = {};
  for (const [i, t] of body.types.entries()) {
    const label = TICKET_TYPE_LABEL[t.type];
    if (t.merchantDue !== undefined) {
      const options = DUE_OPTIONS[t.type];
      if (options === null) {
        await deniedByRule(ctx, "API-RCP-007", "platform_due", `${label}的时限以平台为准，只能改提醒阈值。`);
      } else if (!options.some((o) => dueKey(o) === dueKey(t.merchantDue!))) {
        fields[`types.${i}.merchantDue`] = `${label}的时限只能选 ${options.map(dueLabel).join(" / ")}`;
      }
    }
    if (t.remind !== undefined) {
      const kind = REMIND_KIND[t.type];
      const value = (t.remind as Remind)[kind];
      if (value === undefined || !(REMIND_OPTIONS[kind] as readonly number[]).includes(value)) {
        fields[`types.${i}.remind`] = `${label}的提醒只能选 ${REMIND_OPTIONS[kind].map((v) => remindLabel({ [kind]: v })).join(" / ")}`;
      }
    }
    if (t.autoCreate === true && MANUAL_ONLY_TYPES.includes(t.type)) fields[`types.${i}.autoCreate`] = `${label}只能手动建，不能开自动建单`;
  }
  if (Object.keys(fields).length) throw validation("提交的内容有误，请检查标红的字段。", fields);

  const merchantId = ctx.merchant.id;
  const rows = await db().select().from(ttc).where(eq(ttc.merchantId, merchantId));
  const byType = new Map(rows.map((r) => [r.type, r]));
  const changes: Array<{ type: TicketTypeKey; before: Record<string, unknown>; after: Record<string, unknown> }> = [];
  const nextRows = body.types.map((t) => {
    const cur = byType.get(t.type) ?? { merchantId, ...DEFAULT_TICKET_TYPES.find((d) => d.type === t.type)! };
    const next = {
      autoCreate: t.autoCreate ?? cur.autoCreate,
      merchantDue: t.merchantDue ?? cur.merchantDue,
      defaultAssignee: t.defaultAssignee ?? cur.defaultAssignee,
      remind: t.remind ?? cur.remind,
    };
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    for (const k of Object.keys(next) as Array<keyof typeof next>) {
      if (JSON.stringify(cur[k]) !== JSON.stringify(next[k])) {
        before[k] = cur[k];
        after[k] = next[k];
      }
    }
    if (Object.keys(after).length) changes.push({ type: t.type, before, after });
    return { type: t.type, ...next };
  });
  const autoCloseChanged = (ctx.merchant.ticketAutoCloseDays ?? null) !== body.autoCloseDays;
  if (changes.length === 0 && !autoCloseChanged) return { ok: true };

  await db().transaction(async (tx) => {
    for (const r of nextRows) {
      if (!changes.some((c) => c.type === r.type)) continue;
      await tx
        .insert(ttc)
        .values({ merchantId, ...r })
        .onConflictDoUpdate({ target: [ttc.merchantId, ttc.type], set: { autoCreate: r.autoCreate, merchantDue: r.merchantDue, defaultAssignee: r.defaultAssignee, remind: r.remind } });
    }
    if (autoCloseChanged) await tx.update(schema.merchant).set({ ticketAutoCloseDays: body.autoCloseDays, updatedAt: new Date() }).where(eq(schema.merchant.id, merchantId));
    const parts = [...changes.map((c) => TICKET_TYPE_LABEL[c.type]), ...(autoCloseChanged ? ["自动关闭天数"] : [])];
    await audit(
      ctx.actor,
      {
        module: "reception",
        action: "ticket_types_updated",
        summary: `修改工单类型与时限：${parts.join("、")}（只影响之后新建的工单）`,
        targetType: "merchant",
        targetId: merchantId,
        data: { changes, ...(autoCloseChanged ? { autoCloseDays: { before: ctx.merchant.ticketAutoCloseDays ?? null, after: body.autoCloseDays } } : {}) },
      },
      tx,
    );
  });
  return { ok: true };
}

// ---------- 快捷回复：API-CONV-014、API-RCP-008 至 API-RCP-010 ----------

const toQuickReply = (r: typeof qr.$inferSelect): QuickReply => ({ id: r.id, title: r.title, stage: r.stage, text: r.text });

/** 按阶段筛选时连同「通用」一起返回；不带 stage 返回全部 */
export async function listQuickReplies(ctx: MemberContext, stage?: QuickReplyStage): Promise<QuickReplyList> {
  const where = [eq(qr.merchantId, ctx.merchant.id)];
  if (stage) where.push(inArray(qr.stage, stage === "any" ? ["any"] : [stage, "any"]));
  const rows = await db().select().from(qr).where(and(...where)).orderBy(asc(qr.createdAt));
  return { items: rows.map(toQuickReply) };
}

async function quickReplyOf(ctx: MemberContext, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound();
  const [row] = await db().select().from(qr).where(and(eq(qr.id, id), eq(qr.merchantId, ctx.merchant.id)));
  if (!row) throw notFound("这条快捷回复不存在或已删除。");
  return row;
}

export async function createQuickReply(ctx: MemberContext, body: QuickReplyBody): Promise<QuickReply> {
  return db().transaction(async (tx) => {
    const [row] = await tx.insert(qr).values({ merchantId: ctx.merchant.id, ...body }).returning();
    await audit(ctx.actor, { module: "reception", action: "quick_reply_created", summary: `新增快捷回复「${body.title}」`, targetType: "quick_reply", targetId: row.id, data: { stage: body.stage } }, tx);
    return toQuickReply(row);
  });
}

export async function updateQuickReply(ctx: MemberContext, id: string, body: Partial<QuickReplyBody>): Promise<QuickReply> {
  const cur = await quickReplyOf(ctx, id);
  return db().transaction(async (tx) => {
    const [row] = await tx.update(qr).set({ ...body, updatedAt: new Date() }).where(eq(qr.id, cur.id)).returning();
    await audit(
      ctx.actor,
      { module: "reception", action: "quick_reply_updated", summary: `修改快捷回复「${row.title}」`, targetType: "quick_reply", targetId: row.id, data: { fields: Object.keys(body) } },
      tx,
    );
    return toQuickReply(row);
  });
}

export async function deleteQuickReply(ctx: MemberContext, id: string) {
  const cur = await quickReplyOf(ctx, id);
  await db().transaction(async (tx) => {
    await tx.delete(qr).where(eq(qr.id, cur.id));
    await audit(ctx.actor, { module: "reception", action: "quick_reply_deleted", summary: `删除快捷回复「${cur.title}」`, targetType: "quick_reply", targetId: cur.id }, tx);
  });
}
