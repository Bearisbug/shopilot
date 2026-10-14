// 模拟平台自建的连接池与 drizzle 实例，只读 DATABASE_URL。
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

type MockDB = NodePgDatabase<typeof schema>;
const g = globalThis as unknown as { __mockPool?: Pool; __mockDb?: MockDB };

export function mockPool(): Pool {
  if (!g.__mockPool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL 未设置，模拟平台无法连接数据库");
    g.__mockPool = new Pool({ connectionString: url, max: 5, statement_timeout: 30_000 });
  }
  return g.__mockPool;
}

export function mockDb(): MockDB {
  if (!g.__mockDb) g.__mockDb = drizzle(mockPool(), { schema });
  return g.__mockDb;
}

/** 测试结束时关闭连接池。 */
export async function closeMockDb(): Promise<void> {
  if (g.__mockPool) await g.__mockPool.end();
  g.__mockPool = undefined;
  g.__mockDb = undefined;
}

export type MockTx = Parameters<Parameters<MockDB["transaction"]>[0]>[0];
export type MockExecutor = MockDB | MockTx;
export { schema };
