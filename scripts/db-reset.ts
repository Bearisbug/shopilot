// 清空本机开发库并重新建表。只用于本机（DATABASE_URL 必须指向 127.0.0.1）。
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const url = process.env.DATABASE_URL ?? "";
if (!/@(127\.0\.0\.1|localhost):/.test(url)) {
  console.error("db:reset 只允许对本机数据库执行");
  process.exit(1);
}
const pool = new Pool({ connectionString: url });
await pool.query("drop schema if exists public cascade; create schema public; drop schema if exists pgboss cascade; drop schema if exists drizzle cascade;");
await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
await pool.end();
console.log("database reset");
