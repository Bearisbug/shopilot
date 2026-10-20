// 平台调用节流（TikTok 限流按「应用 × 店铺 × 接口」分别计算，见 docs/platform-api/tiktok/guides/rate-limits.md）：
// 同一个键的调用按最小间隔排队；被限流时等一下重试一次，平台没有执行被限流的请求，重试不会重复副作用。

const nextAt = new Map<string, number>();

/** 占一个发送时刻：同一键两次调用至少相隔 gapMs；并发调用按到达顺序依次排开 */
export async function pace(key: string, gapMs: number): Promise<void> {
  const now = Date.now();
  const at = Math.max(now, nextAt.get(key) ?? 0);
  nextAt.set(key, at + gapMs);
  if (at > now) await new Promise((r) => setTimeout(r, at - now));
}

/** fn 被限流时等 waitMs 重试一次；再被限流就把错误抛给调用方 */
export async function retryOnRateLimit<T>(fn: () => Promise<T>, isRateLimited: (e: unknown) => boolean, waitMs: number): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (!isRateLimited(e)) throw e;
    await new Promise((r) => setTimeout(r, waitMs));
    return fn();
  }
}
