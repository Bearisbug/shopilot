// 审计日志，也是埋点事件的落点（ADR-012）：action 即 EVT 事件名或操作名。data 里不得出现密钥、令牌、完整卡号。
import { db, schema, type Executor } from "../db/client";

export type AuditModule = "workbench" | "tickets" | "orders" | "shops" | "team" | "reception" | "billing" | "settings" | "auth";

export type Actor =
  | { kind: "member"; merchantId: string; membershipId: string; userId: string; name: string; requestId?: string }
  | { kind: "system"; merchantId: string | null; requestId?: string }
  | { kind: "webhook"; merchantId: string | null; requestId?: string };

export async function audit(
  actor: Actor,
  entry: { module: AuditModule; action: string; summary: string; targetType?: string; targetId?: string; data?: Record<string, unknown> },
  tx: Executor = db(),
) {
  await tx.insert(schema.auditLog).values({
    merchantId: actor.merchantId,
    actorMembershipId: actor.kind === "member" ? actor.membershipId : null,
    actorUserId: actor.kind === "member" ? actor.userId : null,
    actorName: actor.kind === "member" ? actor.name : actor.kind === "system" ? "系统" : "平台",
    actorSource: actor.kind === "member" ? "page" : actor.kind,
    module: entry.module,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    summary: entry.summary,
    data: entry.data,
    requestId: actor.requestId,
  });
}

export const systemActor = (merchantId: string | null, requestId?: string): Actor => ({ kind: "system", merchantId, requestId });
