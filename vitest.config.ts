import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  // 测试文件串行：AI 替身、知识库替身的设定与最后一次请求存在库里的单行，多个文件并行时会互相覆盖
  test: { environment: "node", include: ["src/**/*.test.ts"], fileParallelism: false },
});
