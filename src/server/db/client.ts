import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import { env } from "../env";

type DB = NodePgDatabase<typeof schema>;
const globalForDb = globalThis as unknown as { __shopilotPool?: Pool; __shopilotDb?: DB };

export function pool(): Pool {
  if (!globalForDb.__shopilotPool) {
    globalForDb.__shopilotPool = new Pool({ connectionString: env().DATABASE_URL, max: 20, statement_timeout: 30_000 });
  }
  return globalForDb.__shopilotPool;
}

export function db(): DB {
  if (!globalForDb.__shopilotDb) globalForDb.__shopilotDb = drizzle(pool(), { schema, casing: "snake_case" });
  return globalForDb.__shopilotDb;
}

export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type Executor = DB | Tx;
export { schema };
