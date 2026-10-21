"use client";

// 工作台「提交学习」（API-CONV-018、API-CONV-019）：勾选本会话的消息（最多 20 条，买家和客服的都可以），可附一句备注；
// 提交后由 AI 分析，组长与管理员在知识库「学习」页签审核。三种角色都能提交。
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GraduationCapIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { LEARNING_MESSAGES_MAX, LEARNING_NOTE_MAX, LEARNING_RESULT_LABEL, LEARNING_STATUS_LABEL, type ConversationLearning, type LearningTaskResult } from "@/contracts/cards";
import { charCount } from "@/contracts/reception";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { api, errorText, newKey } from "@/lib/api";
import { cn } from "@/lib/utils";

export const conversationLearningKey = (id: string) => ["conversation-learning", id] as const;

/** 本会话被提交过学习的消息 → 最近一次提交的进度或结论（有结论写结论，没有写状态，如「待审核」「新建了经验卡」） */
export function useLearnedMessages(conversationId: string): ReadonlyMap<string, string> {
  const q = useQuery({ queryKey: conversationLearningKey(conversationId), queryFn: () => api.get<ConversationLearning>(`/api/v1/conversations/${conversationId}/learning`) });
  const marks = new Map<string, string>();
  // 接口按提交时间倒序：同一条消息被提交过多次时取最近一次
  for (const t of q.data?.items ?? []) for (const id of t.messageIds) if (!marks.has(id)) marks.set(id, t.result ? LEARNING_RESULT_LABEL[t.result] : LEARNING_STATUS_LABEL[t.status]);
  return marks;
}

/** 选择模式下替换输入框的底部条：已选数、备注、提交、取消 */
export function LearningBar({ conversationId, picked, onCancel, onDone }: { conversationId: string; picked: ReadonlySet<string>; onCancel: () => void; onDone: () => void }) {
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [key] = useState(newKey);
  const n = charCount(note);
  const over = n > LEARNING_NOTE_MAX;
  const submit = useMutation({
    mutationFn: () => api.post<LearningTaskResult>(`/api/v1/conversations/${conversationId}/learning`, { messageIds: [...picked], ...(note.trim() ? { note: note.trim() } : {}) }, key),
    onSuccess: () => {
      toast.success("已提交学习", { description: "AI 分析后，组长或管理员会在知识库「学习」页签审核。" });
      qc.invalidateQueries({ queryKey: conversationLearningKey(conversationId) });
      onDone();
    },
    onError: (e) => toast.error("没有提交成功", { description: errorText(e) }),
  });
  const blocked = picked.size === 0 || over || submit.isPending;
  return (
    <form
      noValidate
      aria-label="提交学习"
      className="shrink-0 border-t border-border px-4 py-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!blocked) submit.mutate();
      }}
    >
      <p className="flex flex-wrap items-center gap-x-2 text-sm">
        <GraduationCapIcon className="size-4 text-muted-foreground" aria-hidden />
        <span className="font-medium">提交学习</span>
        <span role="status" className="text-muted-foreground tabular-nums">
          已选 {picked.size} / {LEARNING_MESSAGES_MAX} 条{picked.size >= LEARNING_MESSAGES_MAX ? "，已选满" : ""}
        </span>
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">勾选能说明这次怎么处理的消息，买家和客服的都可以；AI 会连同前后几条对话一起分析。</p>
      <div className="mt-2 flex flex-wrap items-start gap-2">
        <div className="flex min-w-48 flex-1 flex-col gap-1">
          <label htmlFor="learning-note" className="sr-only">
            备注（选填）
          </label>
          <Input id="learning-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="备注（选填），例如 这次换货流程要记下来" aria-invalid={over || undefined} aria-describedby="learning-note-count" />
          <span id="learning-note-count" className={cn("text-xs tabular-nums", over ? "text-destructive" : "text-muted-foreground")}>
            {n} / {LEARNING_NOTE_MAX}
          </span>
        </div>
        <Button type="button" variant="outline" onClick={onCancel}>
          取消
        </Button>
        {/* aria-disabled：没选消息时仍能被读屏发现，按下后不失焦（A11Y-007、A11Y-013） */}
        <Button type="submit" aria-disabled={blocked || undefined}>
          {submit.isPending && <Spinner />}
          提交
        </Button>
      </div>
    </form>
  );
}
