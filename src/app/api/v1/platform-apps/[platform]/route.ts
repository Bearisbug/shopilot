import { z } from "zod";
import { route } from "@/server/http/route";
import { parsePlatform, saveApp } from "@/server/shops/connect";

// API-SHOP-003：两个平台的请求体不同，按路径里的平台在服务里校验
export const PUT = route({ auth: "member", perm: "shops.manage", body: z.unknown(), handler: ({ ctx, params, body }) => saveApp(ctx, parsePlatform(params.platform), body) });
