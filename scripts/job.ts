// pnpm job <任务名> [JSON 参数]：在本进程直接执行一次后台任务（任务名同 DESIGN §17）。手动触发带 force，不检查任务的时间窗。
import { pool } from "@/server/db/client";
import { QUEUES, type QueueName } from "@/server/jobs/boss";
import { handlers } from "@/worker/handlers";

async function main() {
  const name = process.argv[2] as QueueName | undefined;
  if (!name || !(name in QUEUES) || !handlers[name]) {
    console.error(`用法：pnpm job <任务名> [JSON 参数]\n可用：${Object.keys(handlers).join("、")}`);
    process.exit(2);
  }
  const extra = process.argv[3] ? (JSON.parse(process.argv[3]) as Record<string, unknown>) : {};
  const started = Date.now();
  await handlers[name]!({ force: true, ...extra });
  console.log(JSON.stringify({ job: name, ok: true, durationMs: Date.now() - started }));
}

main()
  .then(() => pool().end())
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error(e);
    await pool().end();
    process.exit(1);
  });
