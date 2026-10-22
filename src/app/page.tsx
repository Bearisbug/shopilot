import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SiteLanding, siteMetadata } from "@/components/site/site-landing";
import { auth } from "@/server/auth/auth";

export const metadata = siteMetadata("zh");

// 官网中文版（PAGE-SITE）：已登录的成员直接进工作台
export default async function Home() {
  const session = await auth().api.getSession({ headers: await headers() });
  if (session) redirect("/wb");
  return <SiteLanding locale="zh" />;
}
