// 按 drizzle/ 下的迁移文件建表（DESIGN §25）
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
await pool.end();
console.log("migrations applied");
