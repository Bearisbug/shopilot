import { sql } from "drizzle-orm";
import { db } from "@/server/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  // slot、version 由部署环境注入（deploy/compose.yaml），用来确认流量落在哪个实例、对外是不是新版本
  const id = { service: "shopilot", slot: process.env.SLOT ?? "local", version: process.env.APP_VERSION ?? process.env.npm_package_version ?? "0.1.0" };
  try {
    await db().execute(sql`select 1`);
    return Response.json({ ...id, db: "ok" }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ ...id, db: "down" }, { status: 503 });
  }
}
