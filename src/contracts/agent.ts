// Agent 服务（ADR-019，§9.6 agent_run）：一次运行的视图，随学习任务详情返回（API-KB-039）。

export const AGENT_PURPOSES = ["learn", "card_review"] as const;
export type AgentPurpose = (typeof AGENT_PURPOSES)[number];
export const AGENT_PURPOSE_LABEL: Record<AgentPurpose, string> = { learn: "会话学习分析", card_review: "按卡体检分析" };

export const AGENT_RUN_STATUSES = ["running", "succeeded", "failed"] as const;
export type AgentRunStatus = (typeof AGENT_RUN_STATUSES)[number];
export const AGENT_RUN_STATUS_LABEL: Record<AgentRunStatus, string> = { running: "运行中", succeeded: "已完成", failed: "失败" };

/** 一次工具调用：工具名、耗时、是否成功、结果摘要（不含买家原话与模型写的检索词） */
export type AgentRunStep = { tool: string; ms: number; ok: boolean; note: string };

export type AgentRunView = {
  id: string;
  purpose: AgentPurpose;
  status: AgentRunStatus;
  model: string;
  error: string | null;
  startedAt: string;
  /** 结束才有 */
  durationMs: number | null;
  turns: number | null;
  toolCalls: number;
  tokens: { input: number; cacheRead: number; output: number } | null;
  steps: AgentRunStep[];
};
