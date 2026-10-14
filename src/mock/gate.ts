// 路由入口用的开关：MOCK_PLATFORM 不是 1 时一律 404。
import { connection } from "next/server";
import { mockEnabled } from "./env";
import { notFoundResponse } from "./http";

/** 先等请求到达（避免被预渲染），再按环境变量决定是否放行。 */
export async function mockGate(): Promise<Response | null> {
  await connection();
  return mockEnabled() ? null : notFoundResponse();
}
