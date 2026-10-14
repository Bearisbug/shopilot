// TikTok 坐席接单开关（PUT customer_service/202309/agents/settings）。失败只返回原因，不阻断接待设置的保存。
import { withShop } from "./clients";
import { tiktokSetAcceptChat } from "./tiktok";
import { PlatformError, platformErrorText } from "./types";

export async function syncAcceptChat(shopId: string, accept: boolean): Promise<{ ok: boolean; error?: string }> {
  try {
    await withShop(shopId, async (c) => {
      if (c.platform !== "tiktok") return;
      await tiktokSetAcceptChat(c.app, c.auth, accept);
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof PlatformError ? platformErrorText(e) : e instanceof Error ? e.message : String(e) };
  }
}
