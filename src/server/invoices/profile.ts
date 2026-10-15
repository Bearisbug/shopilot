// 开票资料（卖方信息，API-SET-017 至 API-SET-021）：商户默认与按店覆盖的读写、Logo 上传与删除，开票时取合并后的资料。
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { LOGO_MAX_BYTES, type InvoiceLogo, type InvoicePreviewResponse, type InvoiceProfilesResponse, type InvoiceProfileView } from "@/contracts/settings";
import { computeTotals, EMPTY_PROFILE, mergeProfile, missingProfile, PROFILE_TEXT_KEYS, type ProfileFields, type Totals } from "@/lib/invoice";
import type { MemberContext } from "@/server/auth/context";
import { audit } from "@/server/core/audit";
import { db, schema, type Executor } from "@/server/db/client";
import type { OrderRow } from "@/server/orders/mirror";
import { loadOrder } from "@/server/orders/service";
import { imageInfo } from "@/server/files/image";
import { dataPath, removeDataFile, writeDataFile } from "@/server/files/storage";
import { Problem } from "@/server/http/problem";
import { checkLogo, type InvoiceLogoImage } from "./render";

const p = schema.invoiceProfile;
type ProfileRow = typeof p.$inferSelect;
type FileRow = typeof schema.file.$inferSelect;

function toFields(r: ProfileRow | undefined): ProfileFields {
  const out = { ...EMPTY_PROFILE };
  if (!r) return out;
  for (const k of PROFILE_TEXT_KEYS) out[k] = k === "taxRate" ? (r.taxRate === null ? "" : String(Number(r.taxRate))) : (r[k] ?? "");
  out.pricesIncludeTax = r.pricesIncludeTax;
  return out;
}

function toColumns(f: ProfileFields) {
  const col = (v: string) => v.trim() || null;
  return {
    legalName: col(f.legalName),
    registrationNo: col(f.registrationNo),
    taxIdLabel: col(f.taxIdLabel),
    taxId: col(f.taxId),
    address: col(f.address),
    phone: col(f.phone),
    email: col(f.email.toLowerCase()),
    website: col(f.website),
    notes: col(f.notes),
    taxName: col(f.taxName),
    taxRate: col(f.taxRate),
    pricesIncludeTax: f.pricesIncludeTax,
  };
}

const isEmpty = (f: ProfileFields) => PROFILE_TEXT_KEYS.every((k) => !f[k].trim()) && f.pricesIncludeTax === null;
const logoView = (f: FileRow | undefined): InvoiceLogo | null => (f ? { id: f.id, url: `/api/v1/files/${f.id}`, width: f.width, height: f.height } : null);
const target = (merchantId: string, shopId: string | null) => and(eq(p.merchantId, merchantId), shopId ? eq(p.shopId, shopId) : isNull(p.shopId));

async function shopOf(ctx: MemberContext, shopId: string) {
  const [shop] = /^[0-9a-f-]{36}$/i.test(shopId)
    ? await db().select().from(schema.shop).where(and(eq(schema.shop.id, shopId), eq(schema.shop.merchantId, ctx.merchant.id))).limit(1)
    : [];
  if (!shop) throw new Problem("not-found", { detail: "找不到这家店。" });
  return shop;
}

// ── API-SET-017 读取 ──

export async function getInvoiceProfiles(ctx: MemberContext): Promise<InvoiceProfilesResponse> {
  const list = await db().select().from(p).where(eq(p.merchantId, ctx.merchant.id));
  const logoIds = list.map((r) => r.logoFileId).filter((x): x is string => !!x);
  const files = logoIds.length ? await db().select().from(schema.file).where(inArray(schema.file.id, logoIds)) : [];
  const view = (r: ProfileRow | undefined): InvoiceProfileView => ({
    shopId: r?.shopId ?? null,
    fields: toFields(r),
    logo: logoView(files.find((f) => f.id === r?.logoFileId)),
    updatedAt: (r?.updatedAt ?? r?.createdAt)?.toISOString() ?? null,
  });
  return { merchant: view(list.find((r) => r.shopId === null)), shops: list.filter((r) => r.shopId !== null).map(view) };
}

// ── API-SET-018 / 019 保存商户默认、按店覆盖；API-SET-020 清除按店覆盖 ──

export async function saveInvoiceProfile(ctx: MemberContext, shopId: string | null, body: ProfileFields): Promise<InvoiceProfilesResponse> {
  const shop = shopId ? await shopOf(ctx, shopId) : null;
  await db().transaction(async (tx) => {
    const [cur] = await tx.select().from(p).where(target(ctx.merchant.id, shopId)).for("update").limit(1);
    // 按店覆盖全部清空、也没有 Logo 时不留空行
    if (shop && isEmpty(body) && !cur?.logoFileId) {
      if (cur) await tx.delete(p).where(eq(p.id, cur.id));
    } else if (cur) {
      await tx.update(p).set({ ...toColumns(body), updatedBy: ctx.membership.id, updatedAt: new Date() }).where(eq(p.id, cur.id));
    } else {
      await tx.insert(p).values({ merchantId: ctx.merchant.id, shopId, ...toColumns(body), updatedBy: ctx.membership.id, updatedAt: new Date() });
    }
    await audit(
      ctx.actor,
      {
        module: "settings",
        action: "invoice_profile_updated",
        summary: shop ? `修改 ${shop.name} 的开票资料` : "修改开票资料（商户默认）",
        targetType: shop ? "shop" : "merchant",
        targetId: shop?.id ?? ctx.merchant.id,
      },
      tx,
    );
  });
  return getInvoiceProfiles(ctx);
}

async function dropLogoFile(fileId: string | null, ex: Executor) {
  if (!fileId) return;
  const [f] = await ex.delete(schema.file).where(eq(schema.file.id, fileId)).returning();
  if (f) await removeDataFile(f.path);
}

export async function clearShopOverride(ctx: MemberContext, shopId: string): Promise<InvoiceProfilesResponse> {
  const shop = await shopOf(ctx, shopId);
  await db().transaction(async (tx) => {
    const [cur] = await tx.delete(p).where(target(ctx.merchant.id, shop.id)).returning();
    if (!cur) return;
    await dropLogoFile(cur.logoFileId, tx);
    await audit(ctx.actor, { module: "settings", action: "invoice_profile_cleared", summary: `清除 ${shop.name} 的开票资料覆盖，改用商户默认`, targetType: "shop", targetId: shop.id }, tx);
  });
  return getInvoiceProfiles(ctx);
}

// ── API-SET-021 Logo 上传与删除（PNG / JPG，≤ 1 MB；shopId 为空是商户默认） ──

export async function uploadLogo(ctx: MemberContext, req: Request): Promise<InvoiceProfilesResponse> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new Problem("validation", { detail: "请用 multipart/form-data 上传，字段名 file。" });
  }
  const file = form.get("file");
  const rawShop = form.get("shopId");
  const shop = typeof rawShop === "string" && rawShop ? await shopOf(ctx, rawShop) : null;
  if (!file || typeof file === "string") throw new Problem("validation", { detail: "没有收到文件。", extra: { fields: { file: "请选择图片" } } });
  if (file.size > LOGO_MAX_BYTES) throw new Problem("too-large", { detail: `Logo 不能超过 1 MB，这张是 ${(file.size / 1024 / 1024).toFixed(1)} MB。` });
  const buf = Buffer.from(await file.arrayBuffer());
  const info = imageInfo(buf);
  if (!info || info.ext === "webp") throw new Problem("unsupported-type", { detail: "Logo 只支持 PNG 或 JPG。" });
  if (!(await checkLogo({ data: buf, format: info.ext }))) throw new Problem("unsupported-type", { detail: "这张图片无法嵌入发票，请用图片工具另存为普通 PNG 或 JPG 后再上传。" });
  const id = randomUUID();
  const path = `branding/${ctx.merchant.id}/${id}.${info.ext}`;
  await writeDataFile(path, buf);
  await db().transaction(async (tx) => {
    await tx
      .insert(schema.file)
      .values({ id, merchantId: ctx.merchant.id, kind: "invoice_logo", path, mime: info.mime, size: buf.length, width: info.width || null, height: info.height || null, createdBy: ctx.membership.id });
    const [cur] = await tx.select().from(p).where(target(ctx.merchant.id, shop?.id ?? null)).for("update").limit(1);
    if (cur) {
      await tx.update(p).set({ logoFileId: id, updatedBy: ctx.membership.id, updatedAt: new Date() }).where(eq(p.id, cur.id));
      await dropLogoFile(cur.logoFileId, tx);
    } else {
      await tx.insert(p).values({ merchantId: ctx.merchant.id, shopId: shop?.id ?? null, logoFileId: id, updatedBy: ctx.membership.id, updatedAt: new Date() });
    }
    await audit(ctx.actor, { module: "settings", action: "invoice_logo_updated", summary: shop ? `更换 ${shop.name} 的发票 Logo` : "更换发票 Logo（商户默认）", targetType: shop ? "shop" : "merchant", targetId: shop?.id ?? ctx.merchant.id }, tx);
  });
  return getInvoiceProfiles(ctx);
}

export async function removeLogo(ctx: MemberContext, shopId: string | null): Promise<InvoiceProfilesResponse> {
  const shop = shopId ? await shopOf(ctx, shopId) : null;
  await db().transaction(async (tx) => {
    const [cur] = await tx.select().from(p).where(target(ctx.merchant.id, shop?.id ?? null)).for("update").limit(1);
    if (!cur?.logoFileId) return;
    if (shop && isEmpty(toFields(cur))) await tx.delete(p).where(eq(p.id, cur.id));
    else await tx.update(p).set({ logoFileId: null, updatedBy: ctx.membership.id, updatedAt: new Date() }).where(eq(p.id, cur.id));
    await dropLogoFile(cur.logoFileId, tx);
    await audit(ctx.actor, { module: "settings", action: "invoice_logo_removed", summary: shop ? `删除 ${shop.name} 的发票 Logo` : "删除发票 Logo（商户默认）", targetType: shop ? "shop" : "merchant", targetId: shop?.id ?? ctx.merchant.id }, tx);
  });
  return getInvoiceProfiles(ctx);
}

// ── 开票时取用 ──

/** 店铺生效的开票资料：按店覆盖填了的字段优先，其余用商户默认；logo 是文件 ID */
export async function effectiveProfile(merchantId: string, shopId: string, ex: Executor = db()) {
  const list = await ex.select().from(p).where(and(eq(p.merchantId, merchantId), or(isNull(p.shopId), eq(p.shopId, shopId))));
  const pick = (r: ProfileRow | undefined) => (r ? { ...toFields(r), logo: r.logoFileId } : null);
  return mergeProfile(pick(list.find((r) => r.shopId === null)), pick(list.find((r) => r.shopId === shopId)));
}

/** 读出 Logo 文件交给渲染；文件已不在时不放 Logo */
export async function loadLogo(fileId: string | null, ex: Executor = db()): Promise<InvoiceLogoImage | null> {
  if (!fileId) return null;
  const [f] = await ex.select().from(schema.file).where(eq(schema.file.id, fileId)).limit(1);
  if (!f) return null;
  const data = await readFile(dataPath(f.path)).catch(() => null);
  return data ? { data, format: f.mime === "image/png" ? "png" : "jpg", width: f.width, height: f.height } : null;
}

/** 平台给了付款时间、或订单已过待付款，算作已付 */
export function orderTotals(order: OrderRow, items: Array<{ unitPrice: string; qty: number }>, profile: ProfileFields): Totals {
  return computeTotals({
    items,
    orderTotal: order.totalAmount,
    shipping: order.payment?.shippingFee ?? null,
    paid: Boolean(order.payment?.paidAt) || order.statusGroup !== "unpaid",
    taxRate: profile.taxRate,
    taxInclusive: profile.pricesIncludeTax ?? true,
    currency: order.currency,
  });
}

/** 开票弹层：资料缺哪些项、按资料算出的金额 */
export async function invoicePreview(ctx: MemberContext, orderId: string): Promise<InvoicePreviewResponse> {
  const { order, shop } = await loadOrder(ctx, orderId);
  const prof = await effectiveProfile(ctx.merchant.id, shop.id);
  return {
    missing: missingProfile(prof),
    canEdit: ctx.can("settings.manage"),
    currency: order.currency,
    taxName: prof.taxName,
    taxInclusive: prof.pricesIncludeTax ?? true,
    totals: orderTotals(order, order.items, prof),
  };
}
