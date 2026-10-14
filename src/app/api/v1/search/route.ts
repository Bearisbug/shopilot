import { searchQuery } from "@/contracts/search";
import { route } from "@/server/http/route";
import { search } from "@/server/search/service";

// API-SEARCH-001：全部成员可用，结果按各自可见范围过滤
export const GET = route({ auth: "member", query: searchQuery, handler: ({ ctx, query }) => search(ctx, query) });
