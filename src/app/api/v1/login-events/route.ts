import { loginEventsQuery } from "@/contracts/team";
import { csv, route } from "@/server/http/route";
import { loginEvents } from "@/server/team/service";
import { inTz } from "@/lib/format";

// API-TEAM-011
export const GET = route({
  auth: "member",
  perm: "team.manage",
  query: loginEventsQuery,
  handler: async ({ ctx, query }) => {
    const items = await loginEvents(ctx, query);
    if (query.format === "csv") {
      return csv("登录记录.csv", [["时间", "邮箱", "姓名", "结果", "原因", "IP", "设备"], ...items.map((e) => [inTz(e.createdAt, ctx.merchant.timezone, "yyyy-MM-dd HH:mm:ss"), e.email, e.name, e.result === "success" ? "成功" : "失败", e.reason, e.ip, e.userAgent])]);
    }
    return { items };
  },
});
