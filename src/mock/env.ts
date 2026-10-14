// 模拟平台自己的环境读取：不 import src/server/**（ADR-004 代码互不引用）。
import path from "node:path";

export function mockEnabled(): boolean {
  return process.env.MOCK_PLATFORM === "1";
}

/** 模拟平台对外地址，用于拼图片 URL 与授权页链接；请求里能拿到 origin 时优先用请求的。 */
export function mockBaseUrl(): string {
  return (process.env.APP_BASE_URL ?? "http://127.0.0.1:3360").replace(/\/$/, "");
}

export function uploadDir(): string {
  return path.resolve(process.env.DATA_DIR ?? "./data", "mock-uploads");
}
