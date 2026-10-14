import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { auth } from "@/server/auth/auth";

// 受保护页入口：未登录重定向到 /login（DESIGN §13）。侧栏收起状态从 cookie 读，首帧即正确（INT-021）。
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const h = await headers();
  const session = await auth().api.getSession({ headers: h });
  if (!session) {
    const path = h.get("x-shopilot-path") ?? "/wb";
    redirect(`/login?next=${encodeURIComponent(path)}`);
  }
  const jar = await cookies();
  return (
    <AppShell initialCollapsed={jar.get("sp_sidebar")?.value === "collapsed"}>
      {children}
    </AppShell>
  );
}
