// 发件箱开发页（PAGE-DEV-OUTBOX）：本期邮件不外发，全部在这里看。只在 MOCK_PLATFORM=1 时可访问。
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { mockPlatformEnabled } from "@/server/env";
import { OutboxClient } from "./outbox-client";

export const metadata: Metadata = { title: { absolute: "发件箱 · Shopilot 开发" } };

export default async function OutboxPage() {
  await connection();
  if (!mockPlatformEnabled()) notFound();
  return (
    <Suspense>
      <OutboxClient />
    </Suspense>
  );
}
