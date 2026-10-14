// TikTok 坐席接单开关（REQ-RCP-001：TikTok 店设为 off 时同步 can_accept_chat=false）。
// 平台调用由平台适配器完成；接待设置只调这里。
import { syncAcceptChat } from "../platforms/agent-settings-impl";

export async function setTikTokAcceptChat(shopId: string, accept: boolean): Promise<{ ok: boolean; error?: string }> {
  return syncAcceptChat(shopId, accept);
}
