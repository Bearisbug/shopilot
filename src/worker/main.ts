// Worker 进程：注册后台任务处理器与定时（DESIGN §17 内部后台任务表）。
import { boss, QUEUES, SCHEDULES, type QueueName } from "@/server/jobs/boss";
import { handlers } from "./handlers";

async function main() {
  const b = await boss("worker");
  for (const name of Object.keys(QUEUES) as QueueName[]) {
    const handler = handlers[name];
    if (!handler) continue;
    // 入站按店严格先后：同一店的下一条要等上一条完成后的下一次轮询，轮询间隔压到 0.5 秒（pg-boss 下限）
    const opts = { localConcurrency: name === "inbound.process" ? 10 : name === "draft.generate" ? 20 : 2, ...(name === "inbound.process" ? { pollingIntervalSeconds: 0.5 } : {}) };
    await b.work(name, opts, async (jobs) => {
      for (const job of jobs) {
        const started = Date.now();
        try {
          await handler(job.data as Record<string, unknown>);
          console.log(JSON.stringify({ t: new Date().toISOString(), level: "info", job: name, id: job.id, durationMs: Date.now() - started }));
        } catch (err) {
          console.error(JSON.stringify({ t: new Date().toISOString(), level: "error", job: name, id: job.id, err: err instanceof Error ? err.stack : String(err) }));
          throw err;
        }
      }
    });
  }
  for (const [name, cron] of Object.entries(SCHEDULES)) {
    await b.schedule(name, cron as string, {}, { tz: "UTC" });
  }
  console.log(JSON.stringify({ t: new Date().toISOString(), level: "info", msg: "worker ready", queues: Object.keys(handlers) }));
  const stop = async () => {
    await b.stop({ graceful: true, timeout: 110_000 });
    process.exit(0);
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
