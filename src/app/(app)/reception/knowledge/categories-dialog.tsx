"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LockIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { categoryBody, KNOWLEDGE_CATEGORY_LIMIT, type KnowledgeCategory, type KnowledgeCategoryDeleteResult } from "@/contracts/knowledge";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { ErrorState, LoadingRows } from "@/components/shell/page";
import { useDialogParam } from "@/components/shell/global-dialogs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, api, errorText, newKey } from "@/lib/api";
import { categoriesKey, docsKey, useCategories } from "./knowledge-ui";

/** 新增、改名的服务端拒绝原因（FLOW-KB-MANAGE S7） */
function nameError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.type === "duplicate") return "已有同名分类";
    if (e.type === "not-allowed" && e.problem.code === "category_quota") return `分类最多 ${KNOWLEDGE_CATEGORY_LIMIT} 个`;
    if (e.type === "not-allowed" && e.problem.code === "builtin") return "「未分类」不能改名";
    if (e.type === "validation") return e.problem.detail ?? "分类名不合规";
  }
  return errorText(e);
}

/** 前端先按契约校验名字（1..20 字），通过才发请求 */
function checkName(name: string): string | undefined {
  const r = categoryBody.safeParse({ name });
  return r.success ? undefined : r.error.issues[0]?.message;
}

/** ?dialog=categories：列出分类与资料数，新增、改名、删除；「未分类」不能改名或删除（REQ-KB-003） */
export function CategoriesDialog() {
  const { open, close } = useDialogParam("categories");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="flex flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>分类管理</DialogTitle>
          <DialogDescription>分类只用来整理与筛选资料，改名、删除都不会重新解析。</DialogDescription>
        </DialogHeader>
        {open && <CategoriesBody />}
      </DialogContent>
    </Dialog>
  );
}

function CategoriesBody() {
  const qc = useQueryClient();
  const categories = useCategories();
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  const [key, setKey] = useState(newKey);
  const [removing, setRemoving] = useState<KnowledgeCategory | null>(null);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: categoriesKey });
    qc.invalidateQueries({ queryKey: docsKey });
  };

  const create = useMutation({
    mutationFn: (n: string) => api.post<KnowledgeCategory>("/api/v1/knowledge/categories", { name: n }, key),
    onSuccess: (c) => {
      toast.success(`已新增分类「${c.name}」`);
      setName("");
      setError(undefined);
      setKey(newKey());
      qc.invalidateQueries({ queryKey: categoriesKey });
    },
    onError: (e) => {
      setKey(newKey());
      setError(nameError(e));
    },
  });
  const remove = useMutation({
    mutationFn: (c: KnowledgeCategory) => api.delete<KnowledgeCategoryDeleteResult>(`/api/v1/knowledge/categories/${c.id}`),
    onSuccess: (r, c) => {
      toast.success(`已删除分类「${c.name}」`, { description: r.movedDocuments ? `${r.movedDocuments} 份资料归入「未分类」，不重新解析。` : undefined });
      setRemoving(null);
      refresh();
    },
    onError: (e) => {
      toast.error(errorText(e));
      setRemoving(null);
      refresh();
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const msg = checkName(name);
    if (msg) return setError(msg);
    create.mutate(name.trim());
  };

  if (categories.isError) return <ErrorState error={categories.error} onRetry={() => categories.refetch()} />;
  if (!categories.data) return <LoadingRows rows={4} />;
  const items = categories.data.items;
  const full = items.length >= KNOWLEDGE_CATEGORY_LIMIT;

  return (
    <>
      <form noValidate onSubmit={submit} className="flex flex-col gap-1">
        <Field data-invalid={Boolean(error) || undefined}>
          <label htmlFor="new-category" className="sr-only">
            新分类名
          </label>
          <div className="flex gap-2">
            <Input
              id="new-category"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(checkName(e.target.value));
              }}
              placeholder={full ? `分类已满 ${KNOWLEDGE_CATEGORY_LIMIT} 个` : "新分类名，如「保修与退换」"}
              disabled={full}
              aria-invalid={Boolean(error) || undefined}
              aria-describedby={error ? "new-category-error" : "new-category-hint"}
            />
            <Button type="submit" variant="outline" aria-disabled={create.isPending || full || undefined} onClick={(e) => (create.isPending || full) && e.preventDefault()}>
              {create.isPending ? <Spinner /> : <PlusIcon />}
              新增
            </Button>
          </div>
          {error ? (
            <FieldError id="new-category-error">{error}</FieldError>
          ) : (
            <p id="new-category-hint" className="text-xs text-muted-foreground tabular-nums">
              最多 20 个字；已有 {items.length} / {KNOWLEDGE_CATEGORY_LIMIT} 个分类
            </p>
          )}
        </Field>
      </form>

      <ul className="scroll-y -mr-2 flex max-h-80 flex-col pr-2" aria-label="分类">
        {items.map((c) => (
          <CategoryRow key={c.id} c={c} onRemove={() => setRemoving(c)} onChanged={refresh} />
        ))}
      </ul>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && !remove.isPending && setRemoving(null)}
        title={`删除分类「${removing?.name ?? ""}」？`}
        desc={removing?.documentCount ? `其中 ${removing.documentCount} 份资料会归入「未分类」，资料本身不变，也不重新解析。` : "这个分类下没有资料。"}
        confirmText="删除分类"
        destructive
        pending={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing)}
      />
    </>
  );
}

function CategoryRow({ c, onRemove, onChanged }: { c: KnowledgeCategory; onRemove: () => void; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(c.name);
  const [error, setError] = useState<string>();
  const rename = useMutation({
    mutationFn: (n: string) => api.patch<KnowledgeCategory>(`/api/v1/knowledge/categories/${c.id}`, { name: n }),
    onSuccess: (r) => {
      toast.success(`已改名为「${r.name}」`);
      setEditing(false);
      setError(undefined);
      onChanged();
    },
    onError: (e) => setError(nameError(e)),
  });
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const msg = checkName(name);
    if (msg) return setError(msg);
    if (name.trim() === c.name) return setEditing(false);
    rename.mutate(name.trim());
  };
  const errId = `category-${c.id}-error`;

  if (editing)
    return (
      <li className="border-b border-border py-2 last:border-0">
        <form noValidate onSubmit={save} className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              value={name}
              aria-label={`「${c.name}」的新名字`}
              aria-invalid={Boolean(error) || undefined}
              aria-describedby={error ? errId : undefined}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(checkName(e.target.value));
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setEditing(false);
                  setName(c.name);
                  setError(undefined);
                }
              }}
            />
            <Button type="submit" size="sm" aria-disabled={rename.isPending || undefined} onClick={(e) => rename.isPending && e.preventDefault()}>
              {rename.isPending && <Spinner />}
              保存
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setName(c.name);
                setError(undefined);
              }}
            >
              取消
            </Button>
          </div>
          {error && (
            <p id={errId} className="text-xs text-destructive">
              {error}
            </p>
          )}
        </form>
      </li>
    );

  return (
    <li className="flex min-h-12 items-center gap-3 border-b border-border py-2 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium [overflow-wrap:anywhere]">{c.name}</p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {c.documentCount} 份资料{c.builtin ? " · 删除分类后资料归到这里" : ""}
        </p>
      </div>
      {c.builtin ? (
        <span className="inline-flex items-center gap-1 text-xs whitespace-nowrap text-muted-foreground">
          <LockIcon className="size-3.5" aria-hidden />
          内置，不能改名或删除
        </span>
      ) : (
        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" size="icon-sm" aria-label={`改名「${c.name}」`} onClick={() => setEditing(true)}>
            <PencilIcon />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label={`删除「${c.name}」`} className="text-destructive" onClick={onRemove}>
            <Trash2Icon />
          </Button>
        </div>
      )}
    </li>
  );
}
