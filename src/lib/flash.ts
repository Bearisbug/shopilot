// 跨页提示：先存进 sessionStorage，下一个页面挂载时显示。用在保存后立即跳转、页面可能紧接着整页刷新的场景
// （例如保存安全策略后自己被要求先开两步验证：客户端跳转后，被拦下的请求还可能触发一次整页刷新）。
// 所以取的时候不立刻删，留 8 秒有效期：刷新后的页面还能再显示一次；同一句提示用固定 id，不会叠两条。
const KEY = "shopilot:flash";
const TTL_MS = 8_000;

export function setFlash(text: string) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ text, until: Date.now() + TTL_MS }));
  } catch {
    // 隐私模式等存不进去时放弃，不影响主流程
  }
}

export function peekFlash(): string | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const { text, until } = JSON.parse(raw) as { text: string; until: number };
    if (Date.now() > until) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    return text;
  } catch {
    return null;
  }
}
