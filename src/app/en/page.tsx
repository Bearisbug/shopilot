import { SiteLanding, siteMetadata } from "@/components/site/site-landing";

export const metadata = siteMetadata("en");

// 官网英文版（PAGE-SITE）：已登录也照常显示
export default function EnglishHome() {
  return <SiteLanding locale="en" />;
}
