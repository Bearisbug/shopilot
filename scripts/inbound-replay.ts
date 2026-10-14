// pnpm inbound:replay <入站事件 ID>：把事件改回 queued 并重新排队，由 Worker 处理（DESIGN §11.3 第 3 次失败后的人工重放）。
import { boss } from "@/server/jobs/boss";
import { pool } from "@/server/db/client";
import { replayInbound } from "@/server/inbound/process";

async function main() {
  const id = process.argv[2];
  if (!id) {
    console.error("用法：pnpm inbound:replay <入站事件 ID>");
    process.exit(2);
  }
  const ok = await replayInbound(id);
  console.log(ok ? `已重新排队：${id}` : `找不到入站事件 ${id}`);
  await (await boss()).stop({ graceful: false });
  if (!ok) process.exitCode = 1;
}

main().finally(() => pool().end());
