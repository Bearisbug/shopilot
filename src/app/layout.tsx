import type { Metadata } from "next";
import { IBM_Plex_Sans_Thai_Looped, Nunito } from "next/font/google";
import { AppProviders } from "@/components/providers/app-providers";
import "./globals.css";

const nunito = Nunito({ subsets: ["latin", "latin-ext", "vietnamese"], weight: ["400", "500", "600"], variable: "--font-nunito", display: "swap" });
const thai = IBM_Plex_Sans_Thai_Looped({ subsets: ["thai", "latin"], weight: ["400", "500", "600"], variable: "--font-thai", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Shopilot", template: "%s · Shopilot" },
  description: "多店铺聚合客服工作台",
  icons: { icon: "/brand/app-icon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className={`${nunito.variable} ${thai.variable}`}>
      <body className="font-sans">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
