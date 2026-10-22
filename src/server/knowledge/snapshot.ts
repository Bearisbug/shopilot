// 学习任务的消息快照（§9.6 learning_task.messages）：会话学习、Agent 挑会话与按卡体检共用。
import type { LearningMessage } from "@/contracts/cards";
import type { schema } from "@/server/db/client";

type MessageRow = typeof schema.message.$inferSelect;

export function senderOf(role: MessageRow["senderRole"]): LearningMessage["from"] {
  if (role === "buyer") return "buyer";
  if (role === "agent" || role === "platform_human") return "seller";
  if (role === "system") return "system";
  return "ai";
}

/** 消息快照：文字原样，非文字写「[类型]」 */
export function snapshotOf(m: MessageRow, selected: boolean): LearningMessage {
  return { id: m.id, from: senderOf(m.senderRole), type: m.type, text: m.text?.trim() ? m.text : `[${m.type}]`, at: m.sentAt.toISOString(), selected };
}
