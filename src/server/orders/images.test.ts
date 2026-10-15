// 订单行的商品图：两个平台的订单归一化取出图片；同步覆盖订单时沿用已存的图（含补图任务记下的空串）
import { describe, expect, it } from "vitest";
import { keepImages } from "./mirror";
import { normalizeShopeeOrder } from "@/server/platforms/shopee";
import { normalizeTiktokOrder } from "@/server/platforms/tiktok";

describe("订单归一化带商品图", () => {
  it("TikTok 取 line_items 的 sku_image", () => {
    const o = normalizeTiktokOrder({
      id: "581",
      status: "COMPLETED",
      payment: { total_amount: "10", currency: "THB" },
      line_items: [{ sku_id: "s1", product_id: "p1", product_name: "Meet 2", sku_name: "", sale_price: "10", sku_image: "https://img.test/p1.jpg" }],
      create_time: 1,
    });
    expect(o.items[0]).toMatchObject({ productId: "p1", image: "https://img.test/p1.jpg" });
  });

  it("Shopee 取 item_list 的 image_info.image_url，没有图时不带 image", () => {
    const o = normalizeShopeeOrder({
      order_sn: "251",
      order_status: "COMPLETED",
      total_amount: 5,
      currency: "MYR",
      item_list: [
        { item_id: 1, item_name: "A", model_id: 11, model_quantity_purchased: 1, model_discounted_price: 5, image_info: { image_url: "https://img.test/1.jpg" } },
        { item_id: 2, item_name: "B", model_id: 22, model_quantity_purchased: 1, model_discounted_price: 5 },
      ],
      create_time: 1,
    });
    expect(o.items[0].image).toBe("https://img.test/1.jpg");
    expect(o.items[1].image).toBeUndefined();
  });
});

describe("keepImages", () => {
  const prev = [
    { name: "A", skuId: "s1", productId: "p1", qty: 1, unitPrice: "1", image: "https://img.test/a.jpg" },
    { name: "B", skuId: "s2", productId: "p2", qty: 1, unitPrice: "1", image: "" },
  ];

  it("新数据没带图时按 SKU 沿用已存的图与空串", () => {
    const next = keepImages(
      [
        { name: "A", skuId: "s1", productId: "p1", qty: 2, unitPrice: "1" },
        { name: "B", skuId: "s2", productId: "p2", qty: 1, unitPrice: "1" },
      ],
      prev,
    );
    expect(next.map((i) => i.image)).toEqual(["https://img.test/a.jpg", ""]);
    expect(next[0].qty).toBe(2);
  });

  it("新数据带了图就用新的", () => {
    const next = keepImages([{ name: "A", skuId: "s1", productId: "p1", qty: 1, unitPrice: "1", image: "https://img.test/new.jpg" }], prev);
    expect(next[0].image).toBe("https://img.test/new.jpg");
  });
});
