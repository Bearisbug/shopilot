// 商户内连续编号（工单 T-1001 起、发票 INV-YYYY-NNNNNN）：sequence 表行锁自增，随所在事务提交。
import { sql } from "drizzle-orm";
import type { Executor } from "../db/client";

export async function nextSequence(tx: Executor, merchantId: string, key: string, start: number): Promise<number> {
  const res = await tx.execute<{ value: number }>(sql`
    insert into sequence (merchant_id, key, next) values (${merchantId}, ${key}, ${start + 1})
    on conflict (merchant_id, key) do update set next = sequence.next + 1
    returning next - 1 as value`);
  return Number(res.rows[0].value);
}
