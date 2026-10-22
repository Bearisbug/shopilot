import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SiteLanding, siteMetadata } from "@/components/site/site-landing";
import { auth } from "@/server/auth/auth";

export const metadata = siteMetadata("zh");

// 官网中文版（PAGE-SITE）：已登录的成员直接进工作台
export default async function Home() {
  // 先取 headers()：页面由此标为动态，构建时不会在没有环境变量的情况下调用 auth()
  const h = await headers();
  const session = await auth().api.getSession({ headers: h });
  if (session) redirect("/wb");
  return <SiteLanding locale="zh" />;
}
