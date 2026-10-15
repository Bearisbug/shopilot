// 知识库各接口共用的小工具。
import type { MemberContext } from "@/server/auth/context";
import { audit } from "@/server/core/audit";
import { notAllowed } from "@/server/http/problem";

/** 409 not-allowed 同时记 EVT:permission_denied（§20），供核对前后端口径 */
export async function deniedByRule(ctx: MemberContext, apiId: string, reason: string, detail: string): Promise<never> {
  await audit(ctx.actor, { module: "auth", action: "permission_denied", summary: `被业务规则拒绝：${detail}`, data: { api_id: apiId, role: ctx.membership.role, reason } });
  throw notAllowed(detail, reason);
}
