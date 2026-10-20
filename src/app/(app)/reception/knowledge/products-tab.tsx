"use client";

// 「产品」页签（PAGE-RECEPTION-KB，API-KB-020 至 API-KB-025）：官方产品名称与物料编码；平台商品按卖家 SKU 对应到产品。
// 管理员（products.manage）可导入、改、删、同步；组长只读
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRightIcon, FileUpIcon, PackageIcon, PencilIcon, RefreshCwIcon, SearchIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  PRODUCT_IMPORT_ROWS_MAX,
  PRODUCT_IMPORT_TEXT_MAX,
  productPatch,
  zProductAliases,
  type ListingSyncResult,
  type Product,
  type ProductImportResult,
  type ProductResult,
  type UnmappedListings,
} from "@/contracts/products";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Notice } from "@/components/orders/order-ui";
import { EmptyState, ErrorState, LoadingRows, Panel } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useCan } from "@/hooks/use-me";
import { ApiError, api, errorText } from "@/lib/api";
import { PLATFORM_LABEL } from "@/lib/format";
import { parseTags } from "@/lib/qa-form";
import { useDialogParam } from "@/components/shell/global-dialogs";
import { useUrlParams } from "./knowledge-ui";
import { productsKey, unmappedKey, useProducts } from "./qa-ui";

const IMPORT_EXAMPLE = "物料编码,官方产品名称,别名（用分号分隔，可不填）\nTL2-B,OBSBOT Tail 2,Tail2;泰尔2\nMT3-W,OBSBOT Meet 3";

export function ProductsTab() {
  const can = useCan();
  const admin = can("products.manage");
  const qc = useQueryClient();
  const products = useProducts();
  const { params, update } = useUrlParams();
  const q = (params.get("pq") ?? "").slice(0, 100);
  const importDialog = useDialogParam("product-import");
  const [editing, setEditing] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/products/${id}`),
    onSuccess: () => {
      toast.success(`已删除产品「${deleting?.name}」`);
      setDeleting(null);
      qc.invalidateQueries({ queryKey: productsKey });
      qc.invalidateQueries({ queryKey: unmappedKey });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.problem.code === "product_in_use") {
        toast.error(e.problem.detail ?? "还有问答关联这个产品，先在问答里去掉它再删除。");
        return setDeleting(null);
      }
      toast.error(errorText(e));
    },
  });
  const sync = useMutation({
    mutationFn: () => api.post<ListingSyncResult>("/api/v1/products/listings/sync", {}),
    onSuccess: (r) => {
      toast.success(r.queuedShops > 0 ? `已排队重新拉取 ${r.queuedShops} 家店的商品，几分钟后刷新看对应结果` : "没有可同步的店铺", {
        description: r.queuedShops > 0 ? undefined : "只同步已连接、且授予了商品读取权限的店铺。",
      });
      setTimeout(() => qc.invalidateQueries({ queryKey: unmappedKey }), 30_000);
    },
    onError: (e) => toast.error(errorText(e)),
  });

  const items = products.data?.items ?? [];
  const needle = q.toLowerCase();
  const shown = needle ? items.filter((p) => [p.code, p.name, ...p.aliases].some((s) => s.toLowerCase().includes(needle))) : items;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Panel className="@container flex min-w-0 flex-col gap-4" aria-labelledby="kb-products-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="kb-products-title" className="flex items-baseline gap-2 text-lg font-semibold">
              产品清单
              {products.data && (
                <span className="text-sm font-normal text-muted-foreground tabular-nums">
                  {products.data.total} / {products.data.limit}
                </span>
              )}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">官方产品名称与物料编码一一对应；平台商品的卖家 SKU 等于物料编码时自动对应到产品，AI 据此识别买家问的是哪个产品</p>
          </div>
          {admin && (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" aria-disabled={sync.isPending || undefined} onClick={() => !sync.isPending && sync.mutate()}>
                {sync.isPending ? <Spinner /> : <RefreshCwIcon />}
                同步平台商品
              </Button>
              <Button onClick={importDialog.openIt}>
                <FileUpIcon />
                导入产品
              </Button>
            </div>
          )}
        </div>
        {!admin && <Notice tone="info">产品清单由管理员导入和维护，组长可以查看。</Notice>}
        {items.length > 0 && (
          <InputGroup className="h-8 w-full @lg:w-64">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput defaultValue={q} onChange={(e) => update({ pq: e.target.value.trim() || null })} placeholder="搜编码、名称或别名" aria-label="搜索产品" />
          </InputGroup>
        )}
        {products.isError ? (
          <ErrorState error={products.error} onRetry={() => products.refetch()} />
        ) : !products.data ? (
          <LoadingRows rows={5} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={PackageIcon}
            title="还没有产品清单"
            description={admin ? "从 ERP 或表格里复制「物料编码、官方产品名称」两列粘贴导入，平台商品会按卖家 SKU 自动对应。" : "请管理员在这里导入产品清单。"}
            action={
              admin ? (
                <Button variant="outline" onClick={importDialog.openIt}>
                  <FileUpIcon />
                  导入产品
                </Button>
              ) : undefined
            }
          />
        ) : shown.length === 0 ? (
          <EmptyState
            icon={SearchIcon}
            title="没有匹配的产品"
            description="换个编码、名称或别名再搜。"
            action={
              <Button variant="outline" onClick={() => update({ pq: null })}>
                清除搜索
              </Button>
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-36">物料编码</TableHead>
                <TableHead>官方产品名称</TableHead>
                <TableHead className="hidden @3xl:table-cell">别名</TableHead>
                <TableHead className="w-24 text-right">平台商品</TableHead>
                {admin && (
                  <TableHead className="w-20">
                    <span className="sr-only">操作</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((p) => (
                <TableRow key={p.id} className="align-top">
                  <TableCell className="py-3 font-mono text-xs [overflow-wrap:anywhere] whitespace-normal">{p.code}</TableCell>
                  <TableCell className="py-3 whitespace-normal">
                    <span className="font-medium [overflow-wrap:anywhere]">{p.name}</span>
                    {p.aliases.length > 0 && <p className="mt-0.5 text-xs text-muted-foreground [overflow-wrap:anywhere] @3xl:hidden">别名：{p.aliases.join("、")}</p>}
                  </TableCell>
                  <TableCell className="hidden py-3 whitespace-normal text-muted-foreground [overflow-wrap:anywhere] @3xl:table-cell">{p.aliases.join("、") || "—"}</TableCell>
                  <TableCell className="py-3 text-right tabular-nums">{p.listingCount}</TableCell>
                  {admin && (
                    <TableCell className="py-2">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon-sm" aria-label={`修改「${p.name}」`} onClick={() => setEditing(p)}>
                          <PencilIcon />
                        </Button>
                        <Button variant="ghost" size="icon-sm" aria-label={`删除「${p.name}」`} onClick={() => setDeleting(p)}>
                          <Trash2Icon />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
      <UnmappedPanel />
      {admin && <ImportDialog open={importDialog.open} onClose={importDialog.close} />}
      {admin && <EditDialog product={editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`删除产品「${deleting?.name ?? ""}」？`}
        desc="平台商品不再对应到它，AI 识别不出这个产品；还有问答关联它时不能删除。"
        confirmText="删除"
        destructive
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </div>
  );
}

/** 卖家 SKU 没对应到产品的平台商品：按店分组，提示管理员补物料编码或产品清单 */
function UnmappedPanel() {
  const q = useQuery({ queryKey: unmappedKey, queryFn: () => api.get<UnmappedListings>("/api/v1/products/unmapped") });
  return (
    <Panel className="flex min-w-0 flex-col gap-3" aria-labelledby="kb-unmapped-title">
      <div>
        <h2 id="kb-unmapped-title" className="flex items-baseline gap-2 text-lg font-semibold">
          未对应的平台商品
          {q.data && <span className="text-sm font-normal text-muted-foreground tabular-nums">{q.data.total}</span>}
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">这些平台商品的卖家 SKU 不在产品清单里：要么平台上没填物料编码，要么清单里还没有这个编码。只列拉过商品目录的店</p>
      </div>
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data ? (
        <LoadingRows rows={3} />
      ) : q.data.shops.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">没有未对应的平台商品。新上架的商品在下次同步后出现在这里。</p>
      ) : (
        <ul className="flex flex-col">
          {q.data.shops.map((g) => (
            <li key={g.shop.id} className="border-b border-border last:border-0">
              <details className="group">
                <summary className="state-layer focus-ring flex cursor-pointer list-none items-center gap-2 rounded-sm px-1 py-2.5 text-sm [&::-webkit-details-marker]:hidden">
                  <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform duration-(--semantic-motion-duration-fast) group-open:rotate-90" aria-hidden />
                  <span className="min-w-0 flex-1 font-medium [overflow-wrap:anywhere]">
                    {g.shop.name} <span className="font-normal text-muted-foreground">· {PLATFORM_LABEL[g.shop.platform]} {g.shop.market}</span>
                  </span>
                  <span className="shrink-0 text-muted-foreground tabular-nums">{g.items.length} 个</span>
                </summary>
                <Table className="mb-2">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-48">卖家 SKU</TableHead>
                      <TableHead>商品</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {g.items.map((it) => (
                      <TableRow key={`${it.externalProductId}:${it.sku}`}>
                        <TableCell className="font-mono text-xs [overflow-wrap:anywhere] whitespace-normal">{it.sku || "（没有填）"}</TableCell>
                        <TableCell className="whitespace-normal">
                          <span className="[overflow-wrap:anywhere]">{it.name ?? "（商品名未知）"}</span>
                          <span className="ml-2 text-xs text-muted-foreground tabular-nums">ID {it.externalProductId}</span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </details>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** 导入：粘贴 CSV / TSV，提交后在弹窗里给出新增、更新、跳过与逐行错误；关掉才算完成 */
function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [result, setResult] = useState<ProductImportResult | null>(null);
  const rows = text.split("\n").filter((l) => l.trim()).length;
  const tooLong = text.length > PRODUCT_IMPORT_TEXT_MAX || rows > PRODUCT_IMPORT_ROWS_MAX + 1;
  const run = useMutation({
    mutationFn: () => api.post<ProductImportResult>("/api/v1/products/import", { text }),
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: productsKey });
      qc.invalidateQueries({ queryKey: unmappedKey });
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const close = () => {
    setText("");
    setResult(null);
    onClose();
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>导入产品</DialogTitle>
          <DialogDescription>从 ERP 或表格复制粘贴：每行「物料编码,官方产品名称[,别名;别名]」，逗号或制表符分隔都可以，首行表头会跳过。按物料编码新增或更新，别名列为空时不改原有别名。</DialogDescription>
        </DialogHeader>
        {result ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm">
              新增 <span className="font-semibold tabular-nums">{result.created}</span> 个，更新 <span className="font-semibold tabular-nums">{result.updated}</span> 个，跳过{" "}
              <span className="font-semibold tabular-nums">{result.skipped}</span> 行
              {result.errors.length > 0 && (
                <>
                  ，<span className="font-semibold text-destructive tabular-nums">{result.errors.length}</span> 行有问题没有导入
                </>
              )}
              。
            </p>
            {result.errors.length > 0 && (
              <ol className="scroll-y max-h-60 overscroll-contain rounded-md border border-border text-sm">
                {result.errors.map((e) => (
                  <li key={e.line} className="flex gap-3 border-b border-border px-3 py-1.5 last:border-0">
                    <span className="w-14 shrink-0 text-muted-foreground tabular-nums">第 {e.line} 行</span>
                    <span className="min-w-0 text-destructive [overflow-wrap:anywhere]">{e.message}</span>
                  </li>
                ))}
              </ol>
            )}
            {result.created + result.updated > 0 && <p className="text-xs text-muted-foreground">已排队按卖家 SKU 重新对应平台商品，几分钟后「平台商品」列会更新。</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setResult(null)}>
                继续导入
              </Button>
              <Button type="button" onClick={close}>
                完成
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form
            noValidate
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!text.trim() || tooLong || run.isPending) return;
              run.mutate();
            }}
          >
            <Field data-invalid={tooLong || undefined}>
              <div className="flex items-end justify-between gap-3">
                <FieldLabel htmlFor="product-import-text">粘贴内容</FieldLabel>
                <span className={tooLong ? "text-xs text-destructive tabular-nums" : "text-xs text-muted-foreground tabular-nums"}>{rows} 行</span>
              </div>
              <Textarea
                id="product-import-text"
                rows={10}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={IMPORT_EXAMPLE}
                spellCheck={false}
                className="scroll-y max-h-96 font-mono text-xs"
                aria-invalid={tooLong || undefined}
                aria-describedby={tooLong ? "product-import-error" : "product-import-hint"}
              />
              {tooLong ? (
                <FieldError id="product-import-error">
                  一次最多导入 {PRODUCT_IMPORT_ROWS_MAX.toLocaleString("en-US")} 行、{PRODUCT_IMPORT_TEXT_MAX.toLocaleString("en-US")} 个字符，请分批导入。
                </FieldError>
              ) : (
                <FieldDescription id="product-import-hint">一次最多 {PRODUCT_IMPORT_ROWS_MAX.toLocaleString("en-US")} 行；物料编码要和平台商品「卖家 SKU」里填的一致，才能自动对应。</FieldDescription>
              )}
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>
                取消
              </Button>
              <Button type="submit" aria-disabled={!text.trim() || tooLong || run.isPending || undefined}>
                {run.isPending && <Spinner />}
                导入
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** 修改名称与别名；物料编码不能改（要改就删掉重新导入） */
function EditDialog({ product, onClose }: { product: Product | null; onClose: () => void }) {
  return (
    <Dialog open={Boolean(product)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>修改产品</DialogTitle>
          <DialogDescription>物料编码 {product?.code} 不能修改；要换编码请删除后重新导入。</DialogDescription>
        </DialogHeader>
        {product && <EditForm key={product.id} product={product} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function EditForm({ product, onClose }: { product: Product; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(product.name);
  const [aliases, setAliases] = useState(product.aliases.join("，"));
  const [errors, setErrors] = useState<{ name?: string; aliases?: string }>({});
  const save = useMutation({
    mutationFn: (body: { name: string; aliases: string[] }) => api.patch<ProductResult>(`/api/v1/products/${product.id}`, body),
    onSuccess: (r) => {
      toast.success(`已保存「${r.product.name}」`);
      qc.invalidateQueries({ queryKey: productsKey });
      onClose();
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const submit = () => {
    if (save.isPending) return;
    const body = { name: name.trim(), aliases: parseTags(aliases) };
    const r = productPatch.safeParse(body);
    const a = zProductAliases.safeParse(body.aliases);
    const next = { name: r.success ? undefined : r.error.issues.find((i) => i.path[0] === "name")?.message, aliases: a.success ? undefined : a.error.issues[0]?.message };
    setErrors(next);
    if (next.name || next.aliases) return document.getElementById(next.name ? "product-name" : "product-aliases")?.focus();
    save.mutate(body);
  };
  return (
    <form noValidate className="flex flex-col gap-4" onSubmit={(e) => (e.preventDefault(), submit())}>
      <FieldGroup>
        <Field data-invalid={Boolean(errors.name) || undefined}>
          <FieldLabel htmlFor="product-name">官方产品名称</FieldLabel>
          <Input id="product-name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={Boolean(errors.name) || undefined} aria-describedby={errors.name ? "product-name-error" : undefined} />
          {errors.name && <FieldError id="product-name-error">{errors.name}</FieldError>}
        </Field>
        <Field data-invalid={Boolean(errors.aliases) || undefined}>
          <FieldLabel htmlFor="product-aliases">别名（选填）</FieldLabel>
          <Input id="product-aliases" value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="用逗号分隔，例如 Tail2，泰尔2" aria-invalid={Boolean(errors.aliases) || undefined} aria-describedby={errors.aliases ? "product-aliases-error" : "product-aliases-hint"} />
          {errors.aliases ? (
            <FieldError id="product-aliases-error">{errors.aliases}</FieldError>
          ) : (
            <FieldDescription id="product-aliases-hint">买家常用的叫法，AI 在消息里看到别名也能认出产品。</FieldDescription>
          )}
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          取消
        </Button>
        <Button type="submit" aria-disabled={save.isPending || undefined}>
          {save.isPending && <Spinner />}
          保存
        </Button>
      </DialogFooter>
    </form>
  );
}
