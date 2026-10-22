// 平台工具（ADR-019，§6）：按用途登记，分只读与写两级。商户、任务与卡由服务端在建工具时带进来，模型只能传工具参数；
// 运行层（runtime.ts）把它们包成 SDK 的进程内 MCP 工具，负责计数、封顶、计时与记步骤，写工具每次调用另写审计。
import type { z } from "zod";

export type ToolTier = "read" | "write";

/** 工具返回给模型的内容，加一句记进 agent_run.steps 的结果摘要（不写买家原话与模型写的检索词） */
export type ToolOutput = { result: unknown; note: string };

export type AgentTool = {
  name: string;
  description: string;
  tier: ToolTier;
  input: z.ZodRawShape;
  /** 每次运行最多调几次；到上限后不执行，提示 Agent 直接提交 */
  max?: number;
  run: (args: Record<string, unknown>) => Promise<ToolOutput>;
};

/** 登记一个工具：参数按 input 的 zod 结构校验后才进 run */
export function defineTool<S extends z.ZodRawShape>(t: Omit<AgentTool, "input" | "run"> & { input: S; run: (args: z.infer<z.ZodObject<S>>) => Promise<ToolOutput> }): AgentTool {
  return t as unknown as AgentTool;
}

/** 提交：模型交回结论的唯一出口。accept 校验通过才算交回，否则把原因退给模型改好再交；只认第一次通过的 */
export type AgentSubmit<Out> = {
  description: string;
  input: z.ZodRawShape;
  accept: (args: Record<string, unknown>) => { ok: true; output: Out; note: string } | { ok: false; error: string };
};
