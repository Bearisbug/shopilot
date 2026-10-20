// get_message 按 ID 拉（常见问题记录成员）的请求形状：不带引号的数字数组、原样数字串不丢精度、超过 50 个分批。
import { describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => [] as URL[]);
vi.mock("./http", () => ({
  platformFetch: vi.fn(async (_p: string, url: string) => {
    calls.push(new URL(url));
    return { status: 200, json: { error: "", response: { messages: [{ message_id: "1" }] } } };
  }),
}));

const { shopeeMessagesByIds } = await import("./shopee");

const APP = { partnerId: "2044637", partnerKey: "k".repeat(64), host: "https://openplatform.shopee.cn" };
const SHOP = { shopId: "1605010448", accessToken: "t" };

describe("shopeeMessagesByIds", () => {
  it("message_id_list 是不带引号的数字数组，64 位 ID 原样拼入；非数字 ID 丢掉", async () => {
    calls.length = 0;
    await shopeeMessagesByIds(APP, SHOP, "4706525192896663553", ["2442096651766497650", "2442096655744745841", "abc"]);
    expect(calls).toHaveLength(1);
    expect(calls[0].pathname).toBe("/api/v2/sellerchat/get_message");
    expect(calls[0].searchParams.get("message_id_list")).toBe("[2442096651766497650,2442096655744745841]");
    expect(calls[0].searchParams.get("conversation_id")).toBe("4706525192896663553");
    expect(calls[0].searchParams.get("page_size")).toBe("2");
  });

  it("超过 50 个分批拉，结果合并", async () => {
    calls.length = 0;
    const ids = Array.from({ length: 120 }, (_, i) => `24420966517664976${String(i).padStart(2, "0")}`);
    const rows = await shopeeMessagesByIds(APP, SHOP, "c", ids);
    expect(calls.map((u) => u.searchParams.get("page_size"))).toEqual(["50", "50", "20"]);
    expect(calls[2].searchParams.get("message_id_list")).toBe(`[${ids.slice(100).join(",")}]`);
    expect(rows).toHaveLength(3);
  });
});
