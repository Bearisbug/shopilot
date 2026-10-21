import { learningSubmitBody } from "@/contracts/cards";
import { json, route } from "@/server/http/route";
import { conversationLearning, submitLearning } from "@/server/knowledge/learning";

// API-CONV-018：勾选本会话的消息提交学习（全部角色，会话要在可见范围内；每会话每分钟 5 次）
export const POST = route({ auth: "member", perm: "wb.handle", body: learningSubmitBody, idempotency: "optional", handler: async ({ ctx, params, body }) => json(await submitLearning(ctx, String(params.id), body), 201) });

// API-CONV-019：本会话的学习任务（时间线据此标「已提交学习」）
export const GET = route({ auth: "member", perm: "wb.handle", handler: ({ ctx, params }) => conversationLearning(ctx, String(params.id)) });
