// TikTok 大文件分块上传（guides/large-file-uploads.md，DESIGN §8.11）：Upload File Init 建上传会话，分块 PUT 到 upload_url，
// 收齐后合并成一条上传记录，resource_id 就是上传 ID，客服 Send Message 用它当 vid。只模拟客服视频这一种绑定。
// 会话与分块放在 ${DATA_DIR}/mock-uploads/sessions/，合并后删掉。
import { randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { mockDb } from "../db/client";
import { mockApp } from "../db/schema";
import { uploadDir } from "../env";
import { saveChunkedVideo } from "../uploads";
import { ok, T, tokenShops, type TiktokApp, type TiktokShop } from "./core";

export const UPLOAD_PATH = "/file/v1/upload";
const CS_TARGET = "[POST]/customer_service/202309/conversations/{conversation_id}/messages";
const CS_MAX_BYTES = 100 * 1024 * 1024;
const MIN_CHUNK_BYTES = 5 * 1024 * 1024;
const MAX_CHUNK_BYTES = 30 * 1024 * 1024;
const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const SESSION_TTL_MS = 3600_000;

type Session = { appKey: string; shopIds: string[]; fileSize: number; fileName: string; total: number; createdAt: number };

const sessionDir = () => path.join(uploadDir(), "sessions");
const sessionFile = (token: string) => path.join(sessionDir(), `${token}.json`);
const partFile = (token: string, n: number) => path.join(sessionDir(), `${token}.${n}`);

/** POST /open/202512/file/init：校验声明的文件，发 upload_token；upload_url 指向本模拟主机 */
export async function initUpload(app: TiktokApp, shops: TiktokShop[], body: Record<string, unknown>, origin: string): Promise<Response> {
  const fileSize = Number(body.file_size);
  const total = Number(body.total_chunk_count);
  const fileName = typeof body.file_name === "string" ? body.file_name.trim() : "";
  if (!Number.isInteger(fileSize) || fileSize <= 0) throw T.param("file_size is required.");
  if (!fileName) throw T.param("file_name is required.");
  if (!Number.isInteger(total) || total < 1) throw T.param("total_chunk_count is required.");
  if (!["video", "image", "pdf"].includes(String(body.file_type))) throw T.param("file_type is invalid.");
  if (body.target_path !== CS_TARGET) throw T.param("target_path is invalid.");
  if (body.file_type !== "video") throw T.param("file_type is not supported by target_path.");
  if (fileSize > CS_MAX_BYTES) throw T.param("file_size must not exceed 100MB for Customer Service.");
  const token = randomBytes(16).toString("hex");
  const session: Session = { appKey: app.appKey, shopIds: shops.map((s) => s.shopId), fileSize, fileName, total, createdAt: Date.now() };
  await mkdir(sessionDir(), { recursive: true });
  await writeFile(sessionFile(token), JSON.stringify(session));
  return ok({ upload_url: `${origin}/mock/tiktok/open-api${UPLOAD_PATH}`, upload_token: token });
}

/** PUT upload_url：不签名，凭 upload_token、app_key、x-tts-access-token 与 shop_cipher；最后一块收齐后合并并返回 resource_id */
export async function uploadChunk(req: Request, query: URLSearchParams): Promise<Response> {
  const appKey = query.get("app_key") ?? "";
  const [app] = appKey ? await mockDb().select().from(mockApp).where(and(eq(mockApp.platform, "tiktok"), eq(mockApp.appKey, appKey))).limit(1) : [];
  if (!app) throw T.badAppKey();
  const shops = await tokenShops(appKey, req.headers.get("x-tts-access-token"));
  const cipher = query.get("shop_cipher");
  if (!cipher) throw T.noCipher();
  const shop = shops.find((s) => s.cipher === cipher);
  if (!shop) throw T.cipherMismatch();

  const token = query.get("upload_token") ?? "";
  const session = /^[0-9a-f]{32}$/.test(token) ? await readSession(token) : null;
  if (!session || session.appKey !== appKey || !session.shopIds.includes(shop.shopId) || Date.now() - session.createdAt > SESSION_TTL_MS) throw T.param("upload_token is invalid or expired.");
  const n = Number(query.get("chunk_num"));
  if (!Number.isInteger(n) || n < 1 || n > session.total) throw T.param("chunk_num is invalid.");
  const mime = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!VIDEO_TYPES.includes(mime)) throw T.param("Content-Type does not match file_type.");
  const data = Buffer.from(await req.arrayBuffer());
  if (data.length > MAX_CHUNK_BYTES) throw T.param("chunk size must not exceed 30MB.");
  // 多块上传时每块都要 5 MB 以上（末块不足 5 MB 应并进上一块）；只有一块时不限下限
  if (session.total > 1 && data.length < MIN_CHUNK_BYTES) throw T.param("chunk size must be at least 5MB.");
  await writeFile(partFile(token, n), data);

  const parts = (await readdir(sessionDir())).filter((f) => f.startsWith(`${token}.`) && !f.endsWith(".json"));
  const sizes = await Promise.all(parts.map((f) => stat(path.join(sessionDir(), f)).then((x) => x.size)));
  const uploaded = sizes.reduce((sum, x) => sum + x, 0);
  if (uploaded > session.fileSize) {
    await discard(token);
    throw T.param("uploaded size exceeds file_size.");
  }
  if (parts.length < session.total) return ok({ part_id: `${token}-${n}` });

  const merged = Buffer.concat(await Promise.all(Array.from({ length: session.total }, (_, i) => readFile(partFile(token, i + 1)))));
  await discard(token);
  if (merged.length !== session.fileSize) throw T.param("uploaded size does not match file_size.");
  const stored = await saveChunkedVideo(shop.shopId, session.fileName, mime, merged);
  if (!stored) throw T.param("file content does not match Content-Type.");
  return ok({ resource_id: stored.id });
}

async function readSession(token: string): Promise<Session | null> {
  try {
    return JSON.parse(await readFile(sessionFile(token), "utf8")) as Session;
  } catch {
    return null;
  }
}

async function discard(token: string) {
  const files = (await readdir(sessionDir())).filter((f) => f.startsWith(`${token}.`));
  await Promise.all(files.map((f) => rm(path.join(sessionDir(), f), { force: true })));
}
