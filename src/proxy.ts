import { NextResponse, type NextRequest } from "next/server";

// 只把当前路径交给布局（未登录时拼 next 参数用）；鉴权在 (app)/layout 与 /api/v1 里做。
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-shopilot-path", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|brand|mock|favicon).*)"],
};
