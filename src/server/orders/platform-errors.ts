// 订单与售后写操作调平台失败时转 problem（DESIGN §14）：店铺不可用 409 shop_auth_expired；超时 504；其余平台错误 502。
import { Problem } from "@/server/http/problem";
import { ShopUnavailableError } from "@/server/platforms/clients";
import { PlatformError, platformErrorText } from "@/server/platforms/types";

export function platformProblem(e: unknown): unknown {
  if (e instanceof ShopUnavailableError) {
    return new Problem("not-allowed", { detail: "店铺授权已失效或已断开，请管理员到「店铺与连接」续期授权后再操作。", code: "shop_auth_expired" });
  }
  if (e instanceof PlatformError) {
    return new Problem(e.kind === "timeout" ? "platform-timeout" : "platform", { detail: platformErrorText(e), extra: { platformCode: e.code, platformMessage: e.message } });
  }
  return e;
}

/** 包一层：平台与店铺错误转 problem，其余原样抛出 */
export async function onPlatform<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw platformProblem(e);
  }
}
