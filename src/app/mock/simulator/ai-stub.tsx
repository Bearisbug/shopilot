"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { AI_STUB_OPTIONS } from "./client";
import { Hint, SectionTitle } from "./ui";

type Stub = { next: string; sticky: boolean };
type StubState = Stub & { options: Record<string, unknown>; lastRequest: { kind: string; at: string; system: string; messages: Array<{ role: string; content: string }> } | null };

/** Shopilot 自己的开发接口（主会话实现）：不存在时显示未就绪。 */
async function getStub(): Promise<StubState | null> {
  const res = await fetch("/api/dev/ai-stub", { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = (await res.json()) as Partial<StubState>;
  return { next: String(j.next ?? "normal"), sticky: Boolean(j.sticky), options: j.options ?? {}, lastRequest: j.lastRequest ?? null };
}

export function AiStubPanel() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["ai-stub"], queryFn: getStub, retry: false, refetchOnWindowFocus: false });
  const [draft, setDraft] = useState<Stub | null>(null);
  const current: Stub | null = draft ?? q.data ?? null;
  const save = useMutation({
    mutationFn: async (s: Stub) => {
      const res = await fetch("/api/dev/ai-stub", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(s) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
    onSuccess: () => {
      toast.success("AI 替身已更新", { description: "下一份草稿按这里的设定生成。" });
      setDraft(null);
      qc.invalidateQueries({ queryKey: ["ai-stub"] });
    },
    onError: (e) => toast.error("AI 替身没有保存", { description: `${(e as Error).message}。确认 Shopilot dev server 在运行后重试。` }),
  });

  return (
    <div className="flex flex-col gap-3">
      <SectionTitle>AI 替身</SectionTitle>
      <Hint>Shopilot 在 AI_MODE=stub 时不调 DeepSeek，按这里设定的结果出稿，用来走通转人工、低置信度、模型出错与超时等路径。</Hint>
      {q.isPending ? (
        <Skeleton className="h-40" />
      ) : q.isError ? (
        <div role="alert" className="rounded-lg bg-muted p-3 text-sm">
          <p className="font-medium">读不到 AI 替身设定</p>
          <p className="mt-1 text-muted-foreground">{(q.error as Error).message}。</p>
          <Button size="xs" variant="outline" className="mt-2" onClick={() => q.refetch()}>
            重试
          </Button>
        </div>
      ) : !current ? (
        <div role="status" className="rounded-lg bg-muted p-3 text-sm">
          <p className="font-medium">Shopilot 开发接口未就绪</p>
          <p className="mt-1 text-muted-foreground">GET /api/dev/ai-stub 返回 404。Shopilot 实现这个开发接口后，这里可以切换替身回复。</p>
          <Button size="xs" variant="outline" className="mt-2" onClick={() => q.refetch()}>
            再检查一次
          </Button>
        </div>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(current);
          }}
        >
          <RadioGroup value={current.next} onValueChange={(v) => setDraft({ ...current, next: v })} aria-label="下一份草稿">
            {AI_STUB_OPTIONS.map((o) => (
              <Label key={o.value} className="flex cursor-pointer items-start gap-2.5 rounded-md px-1 py-1 font-normal">
                <RadioGroupItem value={o.value} className="mt-0.5" />
                <span>
                  <span className="block text-sm font-medium">{o.label}</span>
                  <span className="block text-xs text-muted-foreground">{o.hint}</span>
                </span>
              </Label>
            ))}
          </RadioGroup>
          <ToggleGroup type="single" size="sm" variant="outline" spacing={0} value={current.sticky ? "sticky" : "once"} onValueChange={(v) => v && setDraft({ ...current, sticky: v === "sticky" })} aria-label="生效范围">
            <ToggleGroupItem value="once" className="flex-1 data-[state=on]:bg-accent data-[state=on]:font-semibold">
              只对下一份草稿
            </ToggleGroupItem>
            <ToggleGroupItem value="sticky" className="flex-1 data-[state=on]:bg-accent data-[state=on]:font-semibold">
              一直按这个结果
            </ToggleGroupItem>
          </ToggleGroup>
          <div>
            <p className="text-xs font-medium">所选回复</p>
            <pre className="mt-1 max-h-32 overflow-auto rounded-md bg-muted p-2 text-xs whitespace-pre-wrap">
              {q.data?.options[current.next] === null ? "（不返回，按 25 秒超时处理）" : JSON.stringify(q.data?.options[current.next], null, 2)}
            </pre>
          </div>
          <Button type="submit" size="sm" variant="outline" disabled={save.isPending || !draft}>
            {save.isPending && <Spinner className="size-3.5" />}
            保存设定
          </Button>
        </form>
      )}
      {q.data && (
        <details className="rounded-md bg-muted p-2 text-xs">
          <summary className="cursor-pointer font-medium">最近一次出稿请求{q.data.lastRequest ? `（${new Date(q.data.lastRequest.at).toLocaleTimeString()}）` : "：还没有"}</summary>
          {q.data.lastRequest && (
            <div className="mt-2 flex flex-col gap-2">
              <p className="font-medium">system</p>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap">{q.data.lastRequest.system}</pre>
              {q.data.lastRequest.messages.map((m, i) => (
                <div key={i}>
                  <p className="font-medium">{m.role}</p>
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap">{m.content}</pre>
                </div>
              ))}
            </div>
          )}
        </details>
      )}
    </div>
  );
}
