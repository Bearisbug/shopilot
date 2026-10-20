// 后台任务队列（ADR-006）：pg-boss。Web 进程只投递，Worker 进程（src/worker）注册处理器与定时。
import { PgBoss } from "pg-boss";
import { env } from "../env";

export const QUEUES = {
  "inbound.process": { policy: "key_strict_fifo" as const, expireInSeconds: 60, retryLimit: 3, retryDelay: 10, retryBackoff: true },
  // Shopee 卖家后台回复的补拉：同一会话最多一个排队、一个执行中（singletonKey = 店铺:会话），平台出错 30 秒后重试 2 次
  "inbound.refetch": { policy: "stately" as const, expireInSeconds: 60, retryLimit: 2, retryDelay: 30 },
  // Shopee 常见问题记录（bundle_message）按 ID 拉成员：超时、5xx 退避重试 4 次（15、30、60、120 秒）
  "shopee.bundle": { policy: "standard" as const, expireInSeconds: 60, retryLimit: 4, retryDelay: 15, retryBackoff: true },
  // 出稿含改写 6 + 检索 13 + 出稿 25 秒，任务超时 60 秒（§17）
  "draft.generate": { policy: "stately" as const, expireInSeconds: 60, retryLimit: 0 },
  // 知识库：入库单份 ≤ 20 分钟（任务内自己计时，这里留余量）；删除重试 5 次指数退避，每小时补扫
  "knowledge.ingest": { policy: "stately" as const, expireInSeconds: 1320, retryLimit: 0 },
  "knowledge.purge": { policy: "standard" as const, expireInSeconds: 300, retryLimit: 5, retryDelay: 30, retryBackoff: true },
  "message.translate": { policy: "standard" as const, expireInSeconds: 20, retryLimit: 1, retryDelay: 1 },
  "draft.translate": { policy: "standard" as const, expireInSeconds: 20, retryLimit: 1, retryDelay: 1 },
  "order.sync": { policy: "stately" as const, expireInSeconds: 300, retryLimit: 2, retryDelay: 30 },
  "shop.backfill": { policy: "stately" as const, expireInSeconds: 1800, retryLimit: 3, retryDelay: 60 },
  "data.export": { policy: "stately" as const, expireInSeconds: 600, retryLimit: 0 },
  "order.images": { policy: "stately" as const, expireInSeconds: 3600, retryLimit: 0 },
  "product.prefetch": { policy: "stately" as const, expireInSeconds: 3600, retryLimit: 0 },
  "email.send": { policy: "standard" as const, expireInSeconds: 60, retryLimit: 5, retryDelay: 30, retryBackoff: true },
  // 飞书卡片：构卡含 AI 总结 6 秒、译文与图片上传，发送 10 秒；重试 5 次指数退避
  "feishu.send": { policy: "standard" as const, expireInSeconds: 90, retryLimit: 5, retryDelay: 30, retryBackoff: true },
  "product.fetch": { policy: "standard" as const, expireInSeconds: 60, retryLimit: 2, retryDelay: 60, retryBackoff: true },
  // 定时任务（cron 驱动，每个都是单例）
  "inbound.sweep": { policy: "stately" as const, expireInSeconds: 60, retryLimit: 0 },
  // 只读接入的店：一次任务拉两轮（中间等 30 秒），单例不重叠
  "inbound.poll": { policy: "stately" as const, expireInSeconds: 180, retryLimit: 0 },
  "token.refresh": { policy: "stately" as const, expireInSeconds: 120, retryLimit: 0 },
  "shop.metrics": { policy: "stately" as const, expireInSeconds: 120, retryLimit: 0 },
  "logistics.scan": { policy: "stately" as const, expireInSeconds: 300, retryLimit: 0 },
  "conversation.idle_close": { policy: "stately" as const, expireInSeconds: 120, retryLimit: 0 },
  "draft.expire": { policy: "stately" as const, expireInSeconds: 120, retryLimit: 0 },
  "unclaimed.remind": { policy: "stately" as const, expireInSeconds: 60, retryLimit: 0 },
  "ticket.scan": { policy: "stately" as const, expireInSeconds: 120, retryLimit: 0 },
  "ticket.auto_close": { policy: "stately" as const, expireInSeconds: 120, retryLimit: 0 },
  "handover.scan": { policy: "stately" as const, expireInSeconds: 120, retryLimit: 0 },
  "invitation.expire": { policy: "stately" as const, expireInSeconds: 60, retryLimit: 0 },
  "usage.rollover": { policy: "stately" as const, expireInSeconds: 120, retryLimit: 0 },
  "data.retention_purge": { policy: "stately" as const, expireInSeconds: 600, retryLimit: 0 },
  "merchant.purge": { policy: "stately" as const, expireInSeconds: 1800, retryLimit: 0 },
} as const;

export type QueueName = keyof typeof QUEUES;

export const SCHEDULES: Partial<Record<QueueName, string>> = {
  "inbound.sweep": "* * * * *",
  "inbound.poll": "* * * * *",
  "token.refresh": "*/10 * * * *",
  "shop.metrics": "7 * * * *",
  "order.sync": "15 * * * *",
  "logistics.scan": "25 * * * *",
  "conversation.idle_close": "*/10 * * * *",
  "draft.expire": "5 * * * *",
  "unclaimed.remind": "* * * * *",
  "ticket.scan": "*/5 * * * *",
  "ticket.auto_close": "35 * * * *",
  "handover.scan": "*/15 * * * *",
  "invitation.expire": "45 * * * *",
  "usage.rollover": "50 * * * *",
  "data.retention_purge": "0 * * * *",
  "merchant.purge": "30 3 * * *",
  "knowledge.purge": "40 * * * *",
};

/** pg-boss 定时投递用的内部队列名（pg-boss 未导出该常量） */
const SEND_IT = "__pgboss__send-it";

const g = globalThis as unknown as { __shopilotBoss?: Promise<PgBoss> };

async function create(role: "web" | "worker"): Promise<PgBoss> {
  const boss = new PgBoss({
    connectionString: env().DATABASE_URL,
    schema: "pgboss",
    max: role === "web" ? 4 : 10,
    supervise: role === "worker",
    schedule: role === "worker",
  });
  boss.on("error", (err) => console.error(JSON.stringify({ t: new Date().toISOString(), level: "error", msg: "pg-boss", err: String(err) })));
  await boss.start();
  for (const [name, opts] of Object.entries(QUEUES)) {
    const { policy, ...rest } = opts;
    // 已有队列同步超时与重试参数（策略建了就不能改）
    if (!(await boss.getQueue(name))) await boss.createQueue(name, { policy, ...rest });
    else await boss.updateQueue(name, rest);
  }
  // 定时随队列一起登记（幂等 upsert）：pnpm db:reset 删掉 pgboss schema 后，db:seed 调 boss() 重建队列时把定时也补回，
  // 不必重启 Worker。定时由 Worker 的 pg-boss 经内部队列 __pgboss__send-it 投递，它只在 Worker 启动时建，这里一并补上。
  if (!(await boss.getQueue(SEND_IT))) await boss.createQueue(SEND_IT);
  for (const [name, cron] of Object.entries(SCHEDULES)) await boss.schedule(name, cron, {}, { tz: "UTC" });
  return boss;
}

export function boss(role: "web" | "worker" = "web"): Promise<PgBoss> {
  if (!g.__shopilotBoss) g.__shopilotBoss = create(role);
  return g.__shopilotBoss;
}

/** singletonSeconds 配 singletonKey：同一键在同一时间窗内只投递一个任务（任何队列策略都生效） */
export async function enqueue(name: QueueName, data: object, opts: { singletonKey?: string; singletonSeconds?: number; startAfter?: number } = {}) {
  const b = await boss();
  return b.send(name, data, { singletonKey: opts.singletonKey, singletonSeconds: opts.singletonSeconds, startAfter: opts.startAfter });
}
