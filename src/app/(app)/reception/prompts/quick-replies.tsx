"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquareTextIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { TRANSLATE_TARGETS } from "@/contracts/conversations";
import {
  QUICK_REPLY_STAGES,
  QUICK_REPLY_TEXT_MAX,
  charCount,
  quickReplyBody,
  type QuickReply,
  type QuickReplyBody,
  type QuickReplyLang,
  type QuickReplyList,
  type QuickReplyStage,
} from "@/contracts/reception";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState, ErrorState, LoadingRows, Panel, PanelHeader } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, api, errorText, newKey } from "@/lib/api";
import { cn } from "@/lib/utils";
import { STAGE_LABEL } from "@/server/ai/prompts";
import { LANG_LABEL } from "../../wb/wb-shared";

const QR_STAGE_LABEL: Record<QuickReplyStage, string> = { presale: STAGE_LABEL.presale, insale: STAGE_LABEL.insale, aftersale: STAGE_LABEL.aftersale, any: "通用" };
const DIALOG = "quick-reply";

// 新增：?dialog=quick-reply；编辑：?dialog=quick-reply&reply=<id>
function useReplyDialog() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const go = (mutate: (p: URLSearchParams) => void, mode: "push" | "replace") => {
    const next = new URLSearchParams(params.toString());
    mutate(next);
    const qs = next.toString();
    router[mode](qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  return {
    open: params.get("dialog") === DIALOG,
    replyId: params.get("reply"),
    openFor: (id?: string) =>
      go((p) => {
        p.set("dialog", DIALOG);
        if (id) p.set("reply", id);
        else p.delete("reply");
      }, "push"),
    close: () =>
      go((p) => {
        p.delete("dialog");
        p.delete("reply");
      }, "replace"),
  };
}

export function QuickRepliesPanel() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["quick-replies"], queryFn: () => api.get<QuickReplyList>("/api/v1/quick-replies") });
  const dialog = useReplyDialog();
  const [deleting, setDeleting] = useState<QuickReply | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/quick-replies/${id}`),
    onSuccess: () => {
      toast.success(`已删除快捷回复「${deleting?.title}」`);
      setDeleting(null);
      qc.invalidateQueries({ queryKey: ["quick-replies"] });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 404) qc.invalidateQueries({ queryKey: ["quick-replies"] });
      toast.error(errorText(e));
    },
  });
  const items = list.data?.items ?? [];

  return (
    <Panel>
      <PanelHeader title="快捷回复" description="客服在工作台的快捷回复弹层里按阶段点选，内容插入输入框，不会直接发送">
        <Button variant="outline" size="sm" onClick={() => dialog.openFor()}>
          <PlusIcon />
          新增快捷回复
        </Button>
      </PanelHeader>
      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : !list.data ? (
        <LoadingRows rows={3} />
      ) : items.length === 0 ? (
        <EmptyState icon={MessageSquareTextIcon} title="还没有快捷回复" description="按售前、售中、售后或通用分组添加常用回复，客服在工作台点一下就插入输入框。" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-48">标题</TableHead>
              <TableHead className="w-20">阶段</TableHead>
              <TableHead>内容</TableHead>
              <TableHead className="w-24">
                <span className="sr-only">操作</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="max-w-48 whitespace-normal">
                  <span className="font-medium">{r.title}</span>
                  {r.variants.length > 0 && <span className="mt-0.5 block text-xs text-muted-foreground">另有{r.variants.map((v) => LANG_LABEL[v.lang]).join("、")}版</span>}
                </TableCell>
                <TableCell>{QR_STAGE_LABEL[r.stage]}</TableCell>
                <TableCell className="max-w-0">
                  <p className="line-clamp-2 text-sm whitespace-normal text-muted-foreground">{r.text}</p>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon-sm" aria-label={`编辑「${r.title}」`} onClick={() => dialog.openFor(r.id)}>
                      <PencilIcon />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`删除「${r.title}」`} onClick={() => setDeleting(r)}>
                      <Trash2Icon />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialog.open} onOpenChange={(o) => !o && dialog.close()}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{dialog.replyId ? "编辑快捷回复" : "新增快捷回复"}</DialogTitle>
            <DialogDescription>客服点选后内容插入输入框，可再修改后发送。</DialogDescription>
          </DialogHeader>
          {dialog.replyId && !list.data ? (
            <LoadingRows rows={3} />
          ) : dialog.replyId && !items.some((r) => r.id === dialog.replyId) ? (
            <p className="text-sm text-muted-foreground">这条快捷回复不存在或已删除。</p>
          ) : (
            <ReplyForm key={dialog.replyId ?? "new"} reply={items.find((r) => r.id === dialog.replyId)} close={dialog.close} />
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`删除快捷回复「${deleting?.title ?? ""}」？`}
        desc="客服的快捷回复弹层里不再出现这条，删除后不能恢复。"
        confirmText="删除"
        destructive
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </Panel>
  );
}

// 对话框关闭即卸载，重开是新表单
function ReplyForm({ reply, close }: { reply?: QuickReply; close: () => void }) {
  const qc = useQueryClient();
  const [key, setKey] = useState(newKey);
  const form = useForm<QuickReplyBody>({
    resolver: zodResolver(quickReplyBody),
    mode: "onTouched",
    defaultValues: reply ? { title: reply.title, stage: reply.stage, text: reply.text, variants: reply.variants } : { title: "", stage: "any", text: "", variants: [] },
  });
  const variants = useFieldArray({ control: form.control, name: "variants" });
  const watched = useWatch({ control: form.control, name: ["text", "variants"] });
  // 当前编辑的版本：default 或语言代码
  const [tab, setTab] = useState<string>("default");
  const addable = TRANSLATE_TARGETS.filter((l) => !variants.fields.some((f) => f.lang === l));
  const errors = form.formState.errors;
  const tabError = (t: string) => (t === "default" ? !!errors.text : !!errors.variants?.[variants.fields.findIndex((f) => f.lang === t)]?.text);
  const n = charCount((tab === "default" ? watched[0] : watched[1]?.find((v) => v.lang === tab)?.text) ?? "");

  const save = useMutation({
    mutationFn: (v: QuickReplyBody) => (reply ? api.patch<QuickReply>(`/api/v1/quick-replies/${reply.id}`, v) : api.post<QuickReply>("/api/v1/quick-replies", v, key)),
    onSuccess: (r) => {
      toast.success(reply ? `已保存「${r.title}」` : `已新增「${r.title}」`);
      qc.invalidateQueries({ queryKey: ["quick-replies"] });
      close();
    },
    onError: (e) => {
      const fields = e instanceof ApiError ? (e.problem.extra?.fields as Record<string, string> | undefined) : undefined;
      for (const [path, message] of Object.entries(fields ?? {})) form.setError(path as keyof QuickReplyBody, { message });
      toast.error(errorText(e));
      setKey(newKey());
    },
  });

  // 校验没过：切到第一个出错的版本，免得错误藏在没打开的页签里
  const onInvalid = (errs: typeof errors) => {
    if (errs.text) return setTab("default");
    const i = Array.isArray(errs.variants) ? errs.variants.findIndex((v) => v?.text) : -1;
    if (i >= 0) setTab(variants.fields[i].lang);
  };

  const addLang = (lang: QuickReplyLang) => {
    variants.append({ lang, text: "" });
    setTab(lang);
  };
  const removeLang = (lang: string) => {
    variants.remove(variants.fields.findIndex((f) => f.lang === lang));
    setTab("default");
  };

  return (
    <form noValidate onSubmit={form.handleSubmit((v) => save.mutate(v), onInvalid)} className="flex flex-col gap-4">
      <FieldGroup>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_160px]">
          <Controller
            name="title"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="qr-title">标题</FieldLabel>
                <Input {...field} id="qr-title" placeholder="例如 发货时间" aria-invalid={fieldState.invalid} />
                {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
              </Field>
            )}
          />
          <Controller
            name="stage"
            control={form.control}
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor="qr-stage">阶段</FieldLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="qr-stage" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {QUICK_REPLY_STAGES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {QR_STAGE_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
          />
        </div>
        <Field>
          <div className="flex items-end justify-between gap-3">
            <FieldLabel htmlFor={tab === "default" ? "qr-text" : `qr-text-${tab}`}>回复内容</FieldLabel>
            <span className={cn("text-xs tabular-nums", n > QUICK_REPLY_TEXT_MAX ? "text-destructive" : "text-muted-foreground")}>
              {n.toLocaleString("en-US")} / {QUICK_REPLY_TEXT_MAX.toLocaleString("en-US")}
            </span>
          </div>
          <Tabs value={tab} onValueChange={setTab} className="gap-3">
            {/* 版本多时横向滚动，不显示滚动条（RESP-016）；-ml-1.5 抵消页签内边距，「默认」与「回复内容」左缘对齐 */}
            <div className="flex min-w-0 items-center gap-1">
              <TabsList variant="line" className="scroll-nav -ml-1.5 min-w-0 justify-start overflow-x-auto px-0">
                {["default", ...variants.fields.map((f) => f.lang)].map((t) => (
                  <TabsTrigger key={t} value={t} className="flex-none" aria-invalid={tabError(t) || undefined}>
                    {t === "default" ? "默认" : LANG_LABEL[t]}
                    {tabError(t) && <span aria-hidden className="size-1.5 rounded-full bg-destructive" />}
                  </TabsTrigger>
                ))}
              </TabsList>
              {addable.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="ghost" size="sm" className="shrink-0">
                      <PlusIcon />
                      语言版本
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {addable.map((l) => (
                      <DropdownMenuItem key={l} onSelect={() => addLang(l)}>
                        {LANG_LABEL[l]}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            <TabsContent value="default" className="flex flex-col gap-2">
              <Controller
                name="text"
                control={form.control}
                render={({ field, fieldState }) => (
                  <>
                    <Textarea {...field} id="qr-text" rows={5} placeholder="例如：订单会在 1–2 个工作日内发出。" aria-invalid={fieldState.invalid} className="scroll-y max-h-72" />
                    {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
                  </>
                )}
              />
              <FieldDescription>会话的发送目标语言没有对应版本时插入默认版本，发送前照常翻译。</FieldDescription>
            </TabsContent>
            {variants.fields.map((f, i) => (
              <TabsContent key={f.id} value={f.lang} className="flex flex-col gap-2">
                <Controller
                  name={`variants.${i}.text`}
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <>
                      <Textarea {...field} id={`qr-text-${f.lang}`} rows={5} placeholder={`${LANG_LABEL[f.lang]}的回复内容`} aria-invalid={fieldState.invalid} className="scroll-y max-h-72" />
                      {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
                    </>
                  )}
                />
                <div className="flex items-start justify-between gap-3">
                  <FieldDescription className="min-w-0 flex-1">会话的发送目标语言是{LANG_LABEL[f.lang]}时插入这一版，发送时不再翻译。</FieldDescription>
                  <Button type="button" variant="ghost" size="sm" className="-mr-2 shrink-0 text-muted-foreground" onClick={() => removeLang(f.lang)}>
                    <Trash2Icon />
                    删除这个版本
                  </Button>
                </div>
              </TabsContent>
            ))}
          </Tabs>
          {errors.variants?.root?.message && <FieldError>{errors.variants.root.message}</FieldError>}
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={close}>
          取消
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <Spinner />}
          保存
        </Button>
      </DialogFooter>
    </form>
  );
}
