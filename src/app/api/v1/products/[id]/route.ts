import { productPatch } from "@/contracts/products";
import { route } from "@/server/http/route";
import { deleteProduct, updateProduct } from "@/server/products/dictionary";

// API-KB-022
export const PATCH = route({ auth: "member", perm: "products.manage", body: productPatch, handler: ({ ctx, params, body }) => updateProduct(ctx, String(params.id), body) });

// API-KB-023：还有问答关联时 409 product_in_use
export const DELETE = route({
  auth: "member",
  perm: "products.manage",
  handler: async ({ ctx, params }) => {
    await deleteProduct(ctx, String(params.id));
    return new Response(null, { status: 204 });
  },
});
