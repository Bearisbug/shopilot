// pnpm issues:backfill --from 2026-10-01 --to 2026-10-20 [--merchant <商户 ID>] [--rate 1] [--force]
// 看板问题提取的历史补算：起止日按 UTC 切日、含首尾；默认只补还没提取的会话段，--force 全部重算；--rate 为每秒处理的段数。
// 生产上在 worker 容器里跑：npx tsx scripts/issues-backfill.ts --from … --to …（环境变量由容器提供）。
import { parseArgs } from "node:util";
import { pool } from "@/server/db/client";
import { backfillIssues } from "@/server/issues/extract";

async function main() {
  const { values } = parseArgs({ options: { from: { type: "string" }, to: { type: "string" }, merchant: { type: "string" }, rate: { type: "string" }, force: { type: "boolean" } } });
  const day = /^\d{4}-\d{2}-\d{2}$/;
  if (!values.from || !values.to || !day.test(values.from) || !day.test(values.to) || values.from > values.to) {
    console.error("用法：pnpm issues:backfill --from YYYY-MM-DD --to YYYY-MM-DD [--merchant <商户 ID>] [--rate 1] [--force]");
    process.exit(2);
  }
  const from = new Date(`${values.from}T00:00:00Z`);
  const to = new Date(new Date(`${values.to}T00:00:00Z`).getTime() + 86_400_000);
  const perSecond = values.rate ? Number(values.rate) : 1;
  if (!Number.isFinite(perSecond) || perSecond <= 0) {
    console.error("--rate 要是正数");
    process.exit(2);
  }
  console.log(`补算 ${values.from} 至 ${values.to}（UTC）${values.merchant ? `，商户 ${values.merchant}` : ""}，每秒 ${perSecond} 段${values.force ? "，全部重算" : "，只补还没提取的"}`);
  const r = await backfillIssues({ from, to, merchantId: values.merchant, force: values.force, perSecond, log: (line) => console.log(line) });
  console.log(`完成：共 ${r.total} 段，成功 ${r.done}，无买家消息 ${r.no_buyer}，失败 ${r.failed}（失败的段会由定时补扫在 8 天内重试，更早的可再跑一次本脚本）`);
}

main().finally(() => pool().end());
