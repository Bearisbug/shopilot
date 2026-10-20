import { productsQuery } from "@/contracts/products";
import { route } from "@/server/http/route";
import { listProducts } from "@/server/products/dictionary";

// API-KB-020：问答选产品也要读，所以读权限是 knowledge.manage（管理员、组长）
export const GET = route({ auth: "member", perm: "knowledge.manage", query: productsQuery, handler: ({ ctx, query }) => listProducts(ctx, query) });
