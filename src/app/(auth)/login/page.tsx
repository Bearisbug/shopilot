import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/server/auth/auth";
import { LoginForm } from "./login-form";

export const metadata = { title: "登录" };

// 已登录再打开登录页：直接回到 next 指向的页面或工作台
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  // 先取 headers()：页面由此标为动态，构建时不会在没有环境变量的情况下调用 auth()
  const h = await headers();
  const session = await auth().api.getSession({ headers: h });
  if (session) {
    const { next } = await searchParams;
    redirect(next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/login") ? next : "/wb");
  }
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
