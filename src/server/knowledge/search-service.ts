// 知识库检索层（ADR-014、§17）：一个接口两种实现。cloudflare 调 Cloudflare AI Search REST（每商户一个实例、内置存储），
// stub 是本机与测试用的替身（KNOWLEDGE_MODE=stub，API-MOCK-010）。调用方只认 types.ts 里的类型，不直接碰检索服务的返回结构。
import { env } from "@/server/env";
import { cloudflareSearchService } from "./cloudflare";
import { stubSearchService } from "./stub";
import type { KnowledgeSearchService } from "./types";

export type { KnowledgeSearchService } from "./types";

export function searchService(): KnowledgeSearchService {
  return env().KNOWLEDGE_MODE === "cloudflare" ? cloudflareSearchService() : stubSearchService();
}
