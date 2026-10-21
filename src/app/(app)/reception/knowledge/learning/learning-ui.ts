"use client";

// 「学习」页签共用：查询键、待审核数、审核时的本机草稿（PAGE-RECEPTION-KB）
import { useQuery } from "@tanstack/react-query";
import type { LearningList } from "@/contracts/cards";
import type { CardFormValues } from "@/lib/card-form";
import { api } from "@/lib/api";

export const learningKey = ["knowledge-learning"] as const;
export const learningItemKey = (id: string) => ["knowledge-learning-item", id] as const;
export const POLL_MS = 5_000;

/** 待审核数：页签标题用；counts 不受筛选影响，取一条就够 */
export function useLearningPendingCount() {
  const q = useQuery({ queryKey: [...learningKey, "pending-count"], queryFn: () => api.get<LearningList>("/api/v1/knowledge/learning?limit=1") });
  return q.data?.counts.pending_review;
}

/** 审核时编辑的卡内容存成本机草稿（INT-022）：按用户、商户、任务与任务版本区分（INT-007），任务版本变了就不再恢复 */
export type LearningDraft = { values: CardFormValues; savedAt: string };
export const learningDraftKey = (userId: string, merchantId: string, taskId: string, version: number) => `shopilot:learning-draft:v1:${userId}:${merchantId}:${taskId}:${version}`;

export function readLearningDraft(key: string): LearningDraft | null {
  try {
    const raw = window.localStorage.getItem(key);
    const d = raw ? (JSON.parse(raw) as LearningDraft) : null;
    return d && d.values && typeof d.savedAt === "string" ? d : null;
  } catch {
    return null;
  }
}
