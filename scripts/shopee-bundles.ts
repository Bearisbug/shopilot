// 补拉历史常见问题记录（Shopee bundle_message）：本功能上线前入库的记录只存了「平台通知」，没有买家与商店 AI 助手的对话。
// 按收到时间取最近 N 天、还没拉到内容的记录，逐条按 shopee.bundle 同一逻辑拉取写回；只打印计数与失败原因，不打印消息内容。
//   --days <N>   只补最近 N 天（默认 30）
//   --force      已拉到的也重拉
// 本机：pnpm shopee:bundles --days 30
// 服务器：docker compose exec -T worker sh -c "cd /app && node --import tsx scripts/shopee-bundles.ts --days 30"
import { and, desc, gt, sql } from "drizzle-orm";
import { fillBundle } from "@/server/conversations/bundle";
import { db, pool, schema } from "@/server/db/client";

const args = process.argv.slice(2);
const daysArg = args.indexOf("--days");
const days = daysArg >= 0 ? Number(args[daysArg + 1]) : 30;
const force = args.includes("--force");
if (!Number.isFinite(days) || days <= 0) {
  console.error("用法：--days <正整数> [--force]");
  process.exit(2);
}
/** 两条之间停一下，免得撞平台限流 */
const PACE_MS = 300;

async function main() {
  const m = schema.message;
  const rows = await db()
    .select({ id: m.id })
    .from(m)
    .where(
      and(
        gt(m.sentAt, new Date(Date.now() - days * 86_400_000)),
        sql`${m.senderRole} = 'system'`,
        sql`${m.payload}->>'platformType' = 'bundle_message'`,
        force ? sql`true` : sql`coalesce(${m.payload}->'bundle'->>'status', 'pending') <> 'ok'`,
      ),
    )
    .orderBy(desc(m.sentAt));
  console.log(`最近 ${days} 天待补的常见问题记录：${rows.length} 条`);
  const tally = { ok: 0, failed: 0, error: 0 };
  for (const [i, r] of rows.entries()) {
    try {
      const rec = await fillBundle({ messageId: r.id, force });
      if (rec?.status === "ok") tally.ok++;
      else {
        tally.failed++;
        console.log(`  失败 ${r.id}：${rec?.error ?? "未知"}`);
      }
    } catch (e) {
      // 超时、5xx 这类可重试错误：脚本不重试，记下来，可以再跑一次
      tally.error++;
      console.log(`  出错 ${r.id}：${e instanceof Error ? e.message.slice(0, 200) : String(e)}`);
    }
    if ((i + 1) % 20 === 0) console.log(`  已处理 ${i + 1}/${rows.length}`);
    await new Promise((res) => setTimeout(res, PACE_MS));
  }
  console.log(`完成：拉到 ${tally.ok}，取不到 ${tally.failed}，出错 ${tally.error}（出错的可以再跑一次）`);
}

main().finally(() => pool().end());
