"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, EyeIcon, ImageIcon, Maximize2Icon, Trash2Icon, UploadIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Controller, useForm, useWatch, type FieldErrors, type UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import type { Me } from "@/contracts/auth";
import { invoiceProfileBody, LOGO_MAX_BYTES, type InvoiceLogo, type InvoiceProfilesResponse, type InvoiceProfileView } from "@/contracts/settings";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { ErrorState, LoadingRows, Panel, PanelHeader } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ApiError, api, errorText } from "@/lib/api";
import { inTz, PLATFORM_LABEL } from "@/lib/format";
import { EMPTY_PROFILE, MARKET_TAX, mergeProfile, missingProfile, type ProfileFields } from "@/lib/invoice";
import { cn } from "@/lib/utils";
import { SettingsFrame, useQueryParam } from "../settings-frame";
import { InvoicePreview } from "./invoice-preview";

type Shop = Me["active"]["shops"][number];
type Kind = "invoice" | "receipt";
const KEY = ["invoice-profile"];

export function InvoiceProfileClient({ me }: { me: Me }) {
  const q = useQuery({ queryKey: KEY, queryFn: () => api.get<InvoiceProfilesResponse>("/api/v1/invoice-profile") });
  if (q.isError || !q.data) {
    return (
      <SettingsFrame me={me}>
        <Panel>{q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : <LoadingRows rows={8} />}</Panel>
      </SettingsFrame>
    );
  }
  return <Editor me={me} data={q.data} />;
}

/** 提交被拦时把焦点放到第一个出错的字段（错误顺序同表单顺序） */
const focusFirstError = (idPrefix: string) => (errors: FieldErrors<ProfileFields>) => {
  const first = Object.keys(errors)[0];
  if (first) document.getElementById(`${idPrefix}-${first}`)?.focus();
};

function useSaveProfile(form: UseFormReturn<ProfileFields>, url: string, done: (r: InvoiceProfilesResponse) => ProfileFields) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: ProfileFields) => api.put<InvoiceProfilesResponse>(url, v),
    onSuccess: (r) => {
      qc.setQueryData(KEY, r);
      form.reset(done(r));
      toast.success("开票资料已保存，之后开的发票按新资料生成");
      qc.invalidateQueries({ queryKey: ["audit-logs"] });
    },
    onError: (e) => {
      const fields = e instanceof ApiError ? (e.problem.extra?.fields as Record<string, string> | undefined) : undefined;
      if (fields) for (const [k, msg] of Object.entries(fields)) if (k in EMPTY_PROFILE) form.setError(k as keyof ProfileFields, { message: msg });
      toast.error(errorText(e));
    },
  });
}

function Editor({ me, data }: { me: Me; data: InvoiceProfilesResponse }) {
  const shops = me.active.shops;
  const [shopParam, setShopParam] = useQueryParam("shop", "");
  const shop = shops.find((s) => s.id === shopParam) ?? null;
  const override = data.shops.find((s) => s.shopId === shop?.id) ?? null;
  const [kind, setKind] = useState<Kind>("invoice");
  const form = useForm<ProfileFields>({ resolver: zodResolver(invoiceProfileBody), mode: "onTouched", values: data.merchant.fields, resetOptions: { keepDirtyValues: true } });
  const live = useWatch({ control: form.control }) as ProfileFields;
  const [shopLive, setShopLive] = useState<ProfileFields | null>(null);
  const save = useSaveProfile(form, "/api/v1/invoice-profile", (r) => r.merchant.fields);

  const seller = mergeProfile({ ...live, logo: data.merchant.logo }, shop && shopLive ? { ...shopLive, logo: override?.logo ?? null } : null);
  const target = shop ?? shops[0] ?? null;
  const preview = { seller, logoUrl: seller.logo?.url ?? null, market: target?.market ?? "MY", platform: target?.platform ?? "shopee", kind, setKind, label: shop ? shop.name : "商户默认" } as const;
  const missing = missingProfile(data.merchant.fields);
  const facts = `${missing.length ? `商户默认还缺${missing.join("、")}` : "商户默认已填好"} · ${data.shops.length} 家店单独设置`;

  return (
    <SettingsFrame me={me} facts={facts}>
      <div className="@container">
        <div className="grid grid-cols-1 items-start gap-4 @4xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] @6xl:grid-cols-[minmax(0,1fr)_minmax(0,32rem)]">
          <div className="flex min-w-0 flex-col gap-4">
            <Panel>
              <PanelHeader title="商户默认" description="所有店铺开票都用这份；主体、地址或税率不同的店在下方单独设置">
                <PreviewDialog {...preview} />
              </PanelHeader>
              <LogoField shopId={null} logo={data.merchant.logo} />
              <Separator className="my-5" />
              <form id="inv-default" noValidate onSubmit={form.handleSubmit((v) => save.mutate(v), focusFirstError("def"))}>
                <ProfileForm form={form} idPrefix="def" market={null} />
              </form>
              <SaveBar formId="inv-default" dirty={form.formState.isDirty} pending={save.isPending} savedAt={data.merchant.updatedAt} tz={me.active.timezone} />
            </Panel>

            <Panel>
              <PanelHeader title="按店覆盖" description="只填和商户默认不同的项，空着的项开票时沿用商户默认">
                {shop && <PreviewDialog {...preview} />}
              </PanelHeader>
              <Field className="max-w-md">
                <FieldLabel htmlFor="inv-shop-pick">店铺</FieldLabel>
                <Select value={shop?.id ?? ""} onValueChange={setShopParam}>
                  <SelectTrigger id="inv-shop-pick" className="w-full">
                    <SelectValue placeholder="选择要单独设置的店铺" />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {shops.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} · {PLATFORM_LABEL[s.platform]} {s.market}
                        {data.shops.some((o) => o.shopId === s.id) ? " · 已单独设置" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {shops.length === 0 && <FieldDescription>还没有接入店铺。</FieldDescription>}
              </Field>
              {shop ? (
                <ShopOverride key={shop.id} me={me} shop={shop} override={override} base={data.merchant} onLive={setShopLive} />
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">
                  {data.shops.length ? `已单独设置：${data.shops.map((o) => shops.find((s) => s.id === o.shopId)?.name ?? "已断开的店").join("、")}。选择店铺查看或修改。` : "所有店铺都用商户默认。"}
                </p>
              )}
            </Panel>
          </div>

          <aside aria-label="发票预览" className="hidden min-w-0 @4xl:sticky @4xl:top-0 @4xl:block">
            <Panel>
              <PreviewBody {...preview} zoom={<PreviewDialog {...preview} wide />} />
            </Panel>
          </aside>
        </div>
      </div>
    </SettingsFrame>
  );
}

type PreviewProps = { seller: ProfileFields & { logo: InvoiceLogo | null }; logoUrl: string | null; market: string; platform: "shopee" | "tiktok"; kind: Kind; setKind: (k: Kind) => void; label: string };

function PreviewBody({ seller, logoUrl, market, platform, kind, setKind, label, zoom }: PreviewProps & { zoom?: React.ReactNode }) {
  return (
    <>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">发票预览</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">买家收到的样子，按「{label}」的资料实时显示；订单是示例</p>
        </div>
        <div className="flex items-center gap-1">
          <ToggleGroup type="single" variant="outline" size="sm" spacing={0} className="overflow-hidden rounded-md" value={kind} onValueChange={(v) => v && setKind(v as Kind)} aria-label="预览类型">
            <ToggleGroupItem value="invoice" className="px-3">
              Invoice
            </ToggleGroupItem>
            <ToggleGroupItem value="receipt" className="px-3">
              Receipt
            </ToggleGroupItem>
          </ToggleGroup>
          {zoom}
        </div>
      </div>
      <InvoicePreview seller={seller} logoUrl={logoUrl} market={market} platform={platform} kind={kind} />
    </>
  );
}

/** 窄屏没有右栏时由表单旁的按钮打开预览；宽屏右栏的放大按钮也用它。关闭后焦点回到按钮 */
function PreviewDialog({ wide, ...p }: PreviewProps & { wide?: boolean }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        {wide ? (
          <Button variant="ghost" size="icon-sm" aria-label="放大预览">
            <Maximize2Icon />
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="@4xl:hidden">
            <EyeIcon />
            预览发票
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto overscroll-contain sm:max-w-3xl">
        <DialogHeader className="sr-only">
          <DialogTitle>发票预览</DialogTitle>
          <DialogDescription>按「{p.label}」的资料显示示例订单</DialogDescription>
        </DialogHeader>
        <PreviewBody {...p} />
      </DialogContent>
    </Dialog>
  );
}

function SaveBar({ formId, dirty, pending, savedAt, tz, children }: { formId: string; dirty: boolean; pending: boolean; savedAt: string | null; tz: string; children?: React.ReactNode }) {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
      <p className="mr-auto text-xs text-muted-foreground tabular-nums" aria-live="polite">
        {dirty ? "有未保存的修改" : savedAt ? `已保存 ${inTz(savedAt, tz, "yyyy-MM-dd HH:mm")}` : "还没有保存过"}
      </p>
      {children}
      <Button type="submit" form={formId} disabled={!dirty || pending}>
        {pending ? <Spinner /> : <CheckIcon />}
        保存
      </Button>
    </div>
  );
}

function ShopOverride({ me, shop, override, base, onLive }: { me: Me; shop: Shop; override: InvoiceProfileView | null; base: InvoiceProfileView; onLive: (v: ProfileFields | null) => void }) {
  const qc = useQueryClient();
  const form = useForm<ProfileFields>({ resolver: zodResolver(invoiceProfileBody), mode: "onTouched", values: override?.fields ?? EMPTY_PROFILE, resetOptions: { keepDirtyValues: true } });
  const save = useSaveProfile(form, `/api/v1/invoice-profile/shops/${shop.id}`, (r) => r.shops.find((s) => s.shopId === shop.id)?.fields ?? EMPTY_PROFILE);
  const [confirmClear, setConfirmClear] = useState(false);
  const clear = useMutation({
    mutationFn: () => api.delete<InvoiceProfilesResponse>(`/api/v1/invoice-profile/shops/${shop.id}`),
    onSuccess: (r) => {
      qc.setQueryData(KEY, r);
      form.reset(EMPTY_PROFILE);
      setConfirmClear(false);
      toast.success(`${shop.name} 改用商户默认的开票资料`);
      qc.invalidateQueries({ queryKey: ["audit-logs"] });
    },
    onError: (e) => toast.error(errorText(e)),
  });

  // 把正在填的值交给右栏预览；离开这家店时清掉
  const live = useWatch({ control: form.control }) as Partial<ProfileFields>;
  useEffect(() => onLive({ ...EMPTY_PROFILE, ...live }), [live, onLive]);
  useEffect(() => () => onLive(null), [onLive]);

  return (
    <>
      <Separator className="my-5" />
      <LogoField shopId={shop.id} logo={override?.logo ?? null} inherited={base.logo} />
      <Separator className="my-5" />
      <form id="inv-shop" noValidate onSubmit={form.handleSubmit((v) => save.mutate(v), focusFirstError("shop"))}>
        <ProfileForm form={form} idPrefix="shop" market={shop.market} inherit={base.fields} />
      </form>
      <SaveBar formId="inv-shop" dirty={form.formState.isDirty} pending={save.isPending} savedAt={override?.updatedAt ?? null} tz={me.active.timezone}>
        {override && (
          <Button type="button" variant="ghost" onClick={() => setConfirmClear(true)}>
            <Trash2Icon />
            清除这家店的设置
          </Button>
        )}
      </SaveBar>
      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title={`清除 ${shop.name} 的单独设置？`}
        desc="这家店的覆盖项和单独上传的 Logo 会删除，之后开票全部用商户默认。已开出的发票不受影响。"
        confirmText="清除"
        destructive
        pending={clear.isPending}
        onConfirm={() => clear.mutate()}
      />
    </>
  );
}

function LogoField({ shopId, logo, inherited }: { shopId: string | null; logo: InvoiceLogo | null; inherited?: InvoiceLogo | null }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const upload = useMutation({
    mutationFn: (f: File) => {
      const fd = new FormData();
      fd.append("file", f);
      if (shopId) fd.append("shopId", shopId);
      return api.upload<InvoiceProfilesResponse>("/api/v1/invoice-profile/logo", fd);
    },
    onSuccess: (r) => {
      qc.setQueryData(KEY, r);
      setError(null);
      toast.success("Logo 已更新，之后开的发票都会带上");
    },
    onError: (e) => setError(errorText(e)),
  });
  const remove = useMutation({
    mutationFn: () => api.delete<InvoiceProfilesResponse>(`/api/v1/invoice-profile/logo${shopId ? `?shopId=${shopId}` : ""}`),
    onSuccess: (r) => {
      qc.setQueryData(KEY, r);
      setError(null);
      toast.success(shopId && inherited ? "已删除，这家店改用商户默认 Logo" : "已删除 Logo");
    },
    onError: (e) => setError(errorText(e)),
  });
  const pick = (f: File) => {
    if (f.type !== "image/png" && f.type !== "image/jpeg") return setError("只支持 PNG 或 JPG 图片");
    if (f.size > LOGO_MAX_BYTES) return setError(`Logo 不能超过 1 MB，这张是 ${(f.size / 1024 / 1024).toFixed(1)} MB`);
    setError(null);
    upload.mutate(f);
  };
  const shown = logo ?? inherited ?? null;
  const busy = upload.isPending || remove.isPending;

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex h-16 w-44 shrink-0 items-center justify-center rounded-md border border-border bg-white p-2">
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element -- 商户上传的文件，走鉴权下载接口，不经图片优化
          <img src={shown.url} alt={logo ? "当前发票 Logo" : "沿用的商户默认 Logo"} className={cn("max-h-full max-w-full object-contain", !logo && "opacity-50")} />
        ) : (
          <ImageIcon className="size-5 text-muted-foreground" aria-hidden />
        )}
      </div>
      <div className="min-w-0 flex-1 basis-56">
        <p className="text-sm font-medium">发票 Logo{logo ? "" : shown ? "（沿用商户默认）" : "（未上传）"}</p>
        <p id={`${id}-desc`} className="text-xs text-muted-foreground">
          PNG 或 JPG，不超过 1 MB；印在发票右上角，最大 160 × 48 等比缩放。上传后立即生效。
        </p>
        {error && (
          <p role="alert" className="mt-1 text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => fileRef.current?.click()} aria-describedby={`${id}-desc`}>
          {upload.isPending ? <Spinner /> : <UploadIcon />}
          {logo ? "更换" : "上传 Logo"}
        </Button>
        {logo && (
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => remove.mutate()}>
            {remove.isPending ? <Spinner /> : <Trash2Icon />}
            删除
          </Button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        aria-label="选择 Logo 图片"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) pick(f);
        }}
      />
    </div>
  );
}

const TAX_HINTS = Object.entries(MARKET_TAX)
  .map(([m, h]) => `${m} ${h.taxIdLabel}`)
  .join(" · ");

function ProfileForm({ form, idPrefix, market, inherit }: { form: UseFormReturn<ProfileFields>; idPrefix: string; market: string | null; inherit?: ProfileFields }) {
  const hint = market ? MARKET_TAX[market] : undefined;
  /** 按店覆盖：占位显示沿用的值 */
  const ph = (k: keyof ProfileFields, own: string) => (inherit ? (inherit[k] ? `沿用：${String(inherit[k]).split("\n")[0]}` : "沿用默认（未填）") : own);
  const text = (name: Exclude<keyof ProfileFields, "pricesIncludeTax">, label: string, opts: { placeholder?: string; description?: string; wide?: boolean; rows?: number; type?: string; inputMode?: "tel" | "email" | "decimal" | "url"; autoComplete?: string } = {}) => (
    <Controller
      name={name}
      control={form.control}
      render={({ field, fieldState }) => {
        const fid = `${idPrefix}-${name}`;
        const describedBy = fieldState.error ? `${fid}-error` : opts.description ? `${fid}-desc` : undefined;
        const props = { ...field, id: fid, placeholder: ph(name, opts.placeholder ?? ""), "aria-invalid": fieldState.invalid, "aria-describedby": describedBy };
        return (
          <Field data-invalid={fieldState.invalid} className={cn(opts.wide && "md:col-span-2")}>
            <FieldLabel htmlFor={fid}>{label}</FieldLabel>
            {opts.rows ? <Textarea {...props} rows={opts.rows} /> : <Input {...props} type={opts.type ?? "text"} inputMode={opts.inputMode} autoComplete={opts.autoComplete ?? "off"} />}
            {fieldState.error ? <FieldError id={`${fid}-error`}>{fieldState.error.message}</FieldError> : opts.description && <FieldDescription id={`${fid}-desc`}>{opts.description}</FieldDescription>}
          </Field>
        );
      }}
    />
  );

  return (
    <FieldGroup className="grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-2">
      {text("legalName", "法定主体名称", { placeholder: "如 Acme Trading Sdn. Bhd.", description: "发票卖方栏第一行，用营业执照上的全称", wide: true, autoComplete: "organization" })}
      {text("registrationNo", "公司注册号（选填）", { placeholder: "如 202001012345", description: "印在主体名称下方，前面带 Reg. No." })}
      {text("phone", "电话（选填）", { placeholder: "如 +60 3-1234 5678", type: "tel", inputMode: "tel" })}
      {text("taxIdLabel", "税务登记叫法（选填）", {
        placeholder: hint?.taxIdLabel ?? "如 SST Reg. No",
        description: hint ? `留空时用 ${hint.taxIdLabel}；${market} 常见写法：${hint.hint}` : `留空按站点取：${TAX_HINTS}`,
      })}
      {text("taxId", "税务登记号（选填）", { placeholder: "如 W10-1808-32000123", description: "填了才在发票编号下方印这一行" })}
      {text("address", "地址", { placeholder: "可以换行，发票上按行印", rows: 3, wide: true })}
      {text("email", "邮箱（选填）", { placeholder: "如 billing@example.com", type: "email", inputMode: "email" })}
      {text("website", "网站（选填）", { placeholder: "如 acme.my", inputMode: "url" })}
      {text("notes", "备注（选填）", { placeholder: "如退换货政策、感谢语", description: "印在金额下方，最多 1000 字", rows: 3, wide: true })}
      <FieldSet className="md:col-span-2">
        <FieldLegend variant="label">税</FieldLegend>
        <FieldDescription>税率留空或填 0 时不加税，发票不显示税行和 Tax 列。</FieldDescription>
        <div className="grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-2">
          {text("taxName", "税名（选填）", { placeholder: hint?.taxName ?? "如 SST、VAT、GST" })}
          {text("taxRate", "税率 %（选填）", { placeholder: "如 8", inputMode: "decimal", description: inherit ? "填 0 表示这家店不加税" : undefined })}
          <Controller
            name="pricesIncludeTax"
            control={form.control}
            render={({ field }) => (
              <Field className="md:col-span-2">
                <FieldLabel htmlFor={`${idPrefix}-pricesIncludeTax`}>商品价格</FieldLabel>
                <Select value={field.value === null ? (inherit ? "inherit" : "true") : String(field.value)} onValueChange={(v) => field.onChange(v === "inherit" ? null : v === "true")}>
                  <SelectTrigger id={`${idPrefix}-pricesIncludeTax`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {inherit && <SelectItem value="inherit">沿用商户默认（{inherit.pricesIncludeTax === false ? "不含税" : "已含税"}）</SelectItem>}
                    <SelectItem value="true">已含税：从合计倒算税额，合计不变</SelectItem>
                    <SelectItem value="false">不含税：在折后金额上加税</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            )}
          />
        </div>
      </FieldSet>
    </FieldGroup>
  );
}
