// 模拟器页（PAGE-MOCK-SIM）：扮演买家与平台。只在 MOCK_PLATFORM=1 时可访问，否则 404。
import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { mockEnabled } from "@/mock/env";
import { Simulator } from "./simulator";

export const metadata: Metadata = { title: { absolute: "Shopilot 模拟器" } };

export default async function SimulatorPage() {
  await connection();
  if (!mockEnabled()) notFound();
  return (
    <Suspense>
      <Simulator />
    </Suspense>
  );
}
