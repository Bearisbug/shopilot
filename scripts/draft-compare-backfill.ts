// pnpm drafts:compare-backfill --from 2026-10-01 --to 2026-10-20 [--merchant <商户 ID>] [--rate 1]
// AI 草稿与人工回复对比的历史补算：起止日按 UTC 切日、含首尾，按草稿生成时间挑；只补还没对比、生成满 15 分钟的；--rate 为每秒处理的份数。
// 生产上在 worker 容器里跑：npx tsx scripts/draft-compare-backfill.ts --from … --to …（环境变量由容器提供）。
import { parseArgs } from "node:util";
import { backfillDraftReviews } from "@/server/analysis/compare";
import { pool } from "@/server/db/client";

async function main() {
  const { values } = parseArgs({ options: { from: { type: "string" }, to: { type: "string" }, merchant: { type: "string" }, rate: { type: "string" } } });
  const day = /^\d{4}-\d{2}-\d{2}$/;
  if (!values.from || !values.to || !day.test(values.from) || !day.test(values.to) || values.from > values.to) {
    console.error("用法：pnpm drafts:compare-backfill --from YYYY-MM-DD --to YYYY-MM-DD [--merchant <商户 ID>] [--rate 1]");
    process.exit(2);
  }
  const from = new Date(`${values.from}T00:00:00Z`);
  const to = new Date(new Date(`${values.to}T00:00:00Z`).getTime() + 86_400_000);
  const perSecond = values.rate ? Number(values.rate) : 1;
  if (!Number.isFinite(perSecond) || perSecond <= 0) {
    console.error("--rate 要是正数");
    process.exit(2);
  }
  console.log(`补算 ${values.from} 至 ${values.to}（UTC）${values.merchant ? `，商户 ${values.merchant}` : ""}，每秒 ${perSecond} 份，只补还没对比的`);
  const r = await backfillDraftReviews({ from, to, merchantId: values.merchant, perSecond, log: console.log });
  console.log(`完成：共 ${r.total} 份，对比 ${r.done}，无人工回复 ${r.no_reply}，失败 ${r.failed}（失败的会由定时补扫在 8 天内重试，更早的可再跑一次本脚本）`);
}

main().finally(() => pool().end());
