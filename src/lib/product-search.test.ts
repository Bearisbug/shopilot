// 「商品」页签搜索：名称、商品 ID、卖家 SKU 都能命中，不分大小写，多个词要全部命中
import { describe, expect, it } from "vitest";
import { searchProducts } from "./product-search";

const items = [
  { productId: "24580011001", name: "OBSBOT Tiny 2 Lite 4K Webcam", skus: ["TINY2L-BLK"] },
  { productId: "24580011002", name: "OBSBOT Meet 2 Webcam", skus: ["MEET2-GRY", "MEET2-BLK"] },
  { productId: "1729582718312380101", name: "Magnetic Mount", skus: [] },
];
const ids = (q: string) => searchProducts(items, q).map((p) => p.productId);

describe("商品搜索", () => {
  it("空查询返回全部", () => {
    expect(ids("  ")).toHaveLength(3);
  });
  it("按名称，不分大小写", () => {
    expect(ids("meet")).toEqual(["24580011002"]);
  });
  it("按商品 ID 的一部分", () => {
    expect(ids("380101")).toEqual(["1729582718312380101"]);
  });
  it("按任一规格的卖家 SKU", () => {
    expect(ids("meet2-blk")).toEqual(["24580011002"]);
  });
  it("多个词都要命中，可以跨名称与 SKU", () => {
    expect(ids("obsbot blk")).toEqual(["24580011001", "24580011002"]);
    expect(ids("tiny gry")).toEqual([]);
  });
});
