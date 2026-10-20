// 平台调用节流：同键最小间隔排队、被限流后等一下重试一次；TikTok 读接口按「应用 × 店 × 接口」排队
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pace, retryOnRateLimit } from "./pace";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
vi.mock("./http", () => ({ platformFetch: (...a: unknown[]) => fetchMock(...a) }));

describe("pace / retryOnRateLimit", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date("2026-10-21T00:00:00Z") }));
  afterEach(() => vi.useRealTimers());

  it("同一个键并发三次：按 1 秒间隔依次放行；不同键互不影响", async () => {
    const started: Array<[string, number]> = [];
    const go = (key: string) => pace(key, 1_000).then(() => started.push([key, Date.now()]));
    const all = Promise.all([go("a"), go("a"), go("a"), go("b")]);
    await vi.runAllTimersAsync();
    await all;
    const t0 = new Date("2026-10-21T00:00:00Z").getTime();
    expect(started.filter(([k]) => k === "a").map(([, t]) => t - t0)).toEqual([0, 1_000, 2_000]);
    expect(started.filter(([k]) => k === "b").map(([, t]) => t - t0)).toEqual([0]);
  });

  it("被限流：等待后重试一次成功；再被限流就抛出；不是限流的错误不重试", async () => {
    const limited = new Error("limited");
    const isLimited = (e: unknown) => e === limited;

    const once = vi.fn().mockRejectedValueOnce(limited).mockResolvedValueOnce("ok");
    const p1 = retryOnRateLimit(once, isLimited, 1_500);
    await vi.advanceTimersByTimeAsync(1_500);
    await expect(p1).resolves.toBe("ok");
    expect(once).toHaveBeenCalledTimes(2);

    const always = vi.fn().mockRejectedValue(limited);
    const p2 = retryOnRateLimit(always, isLimited, 1_500);
    const caught = p2.catch((e) => e);
    await vi.advanceTimersByTimeAsync(1_500);
    expect(await caught).toBe(limited);
    expect(always).toHaveBeenCalledTimes(2);

    const other = vi.fn().mockRejectedValue(new Error("bad param"));
    await expect(retryOnRateLimit(other, isLimited, 1_500)).rejects.toThrow("bad param");
    expect(other).toHaveBeenCalledTimes(1);
  });
});

describe("TikTok 调用的节流与限流重试", () => {
  const app = { appKey: "pace-app", appSecret: "secret" };
  const shop = (cipher: string) => ({ accessToken: "at", cipher });

  async function load() {
    vi.resetModules();
    vi.stubEnv("DATABASE_URL", "postgresql://u:p@127.0.0.1:5432/db");
    vi.stubEnv("BETTER_AUTH_SECRET", "s".repeat(32));
    vi.stubEnv("APP_BASE_URL", "http://127.0.0.1:3360");
    vi.stubEnv("APP_ENCRYPTION_KEY", "k".repeat(44));
    vi.stubEnv("SHOPEE_HOSTS", "sg=http://127.0.0.1:3360/mock/shopee/sg");
    vi.stubEnv("TIKTOK_API_HOST", "http://tiktok.test");
    vi.stubEnv("TIKTOK_AUTH_HOST", "http://tiktok-auth.test");
    return import("./tiktok");
  }

  beforeEach(() => {
    fetchMock.mockReset();
    vi.useFakeTimers({ now: new Date("2026-10-21T01:00:00Z") });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("同一店连续取 4 个周期的客服绩效：每次相隔至少 1.1 秒；另一家店不排在后面", async () => {
    const t = await load();
    const at: Array<[string, number]> = [];
    fetchMock.mockImplementation(async (_p: string, url: string) => {
      at.push([new URL(url).searchParams.get("shop_cipher")!, Date.now()]);
      return { status: 200, json: { code: 0, data: { performance: { response_percentage: "90" } } } };
    });
    const runs = Promise.all([
      ...["7d", "30d", "this_month", "last_month"].map(() => t.tiktokPerformance(app, shop("c-one"), "2026-10-01", "2026-10-08")),
      t.tiktokPerformance(app, shop("c-two"), "2026-10-01", "2026-10-08"),
    ]);
    await vi.runAllTimersAsync();
    await runs;
    const one = at.filter(([c]) => c === "c-one").map(([, ms]) => ms);
    expect(one).toHaveLength(4);
    for (let i = 1; i < one.length; i++) expect(one[i] - one[i - 1]).toBeGreaterThanOrEqual(1_100);
    const two = at.find(([c]) => c === "c-two")![1];
    expect(two).toBe(one[0]);
  });

  it("业务码 36009002（限流）后等 1.5–2.5 秒重试一次；HTTP 429 同样处理；参数错误不重试", async () => {
    const t = await load();
    fetchMock
      .mockResolvedValueOnce({ status: 200, json: { code: 36009002, message: "Too many requests." } })
      .mockResolvedValueOnce({ status: 200, json: { code: 0, data: { tracking: [] } } });
    const p1 = t.tiktokTracking(app, shop("c-three"), "580000000000000001");
    await vi.advanceTimersByTimeAsync(1_400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_200);
    await expect(p1).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ status: 429, json: { code: 36009002, message: "Too many requests." } });
    const p2 = t.tiktokTracking(app, shop("c-four"), "580000000000000002").catch((e) => e);
    await vi.runAllTimersAsync();
    expect((await p2).code).toBe("36009002");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ status: 200, json: { code: 36009001, message: "bad param" } });
    const p3 = t.tiktokTracking(app, shop("c-five"), "580000000000000003").catch((e) => e);
    await vi.runAllTimersAsync();
    expect((await p3).code).toBe("36009001");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
