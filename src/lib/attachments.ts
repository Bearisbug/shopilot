// 工作台输入框的附件（粘贴或选择的图片、视频）：先放进输入框，和文字一起按顺序发送。
// 这里只放与界面无关的规则：能不能加、最多几个、发送顺序与失败即停。

export const ATTACH_MAX = 9;
export const IMAGE_RULE = "JPG、PNG、WebP，不超过 10 MB";
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const mb = (n: number) => (n / 1024 / 1024).toFixed(1);

export type ChatPlatform = "shopee" | "tiktok";
/**
 * 聊天视频按平台：Shopee 只认 MP4，上限没有文档（6.2 MB 实测通过），先限 30 MB；
 * TikTok 走大文件上传，平台对客服视频限 100 MB，Content-Type 支持 MP4、MOV、WebM
 */
export const VIDEO_RULES: Record<ChatPlatform, { types: string[]; formats: string; maxMb: number }> = {
  shopee: { types: ["video/mp4"], formats: "MP4", maxMb: 30 },
  tiktok: { types: ["video/mp4", "video/quicktime", "video/webm"], formats: "MP4、MOV、WebM", maxMb: 100 },
};
export const mediaRule = (p: ChatPlatform) => `JPG、PNG、WebP 图片不超过 10 MB，${VIDEO_RULES[p].formats} 视频不超过 ${VIDEO_RULES[p].maxMb} MB`;

export type MediaKind = "image" | "video";
type FileLike = { type: string; size: number };

/** 能不能发、按什么发：视频格式与上限按平台（VIDEO_RULES）；不能发时给出原因 */
export function checkMedia(f: FileLike, platform: ChatPlatform): { kind: MediaKind } | { error: string } {
  if (IMAGE_TYPES.includes(f.type)) return f.size > IMAGE_MAX_BYTES ? { error: `图片 ${mb(f.size)} MB，超过 10 MB 上限。` } : { kind: "image" };
  const v = VIDEO_RULES[platform];
  if (f.type.startsWith("video/")) {
    if (!v.types.includes(f.type)) return { error: `只支持 ${v.formats} 视频，${platform === "shopee" ? "MOV 等格式" : "其他格式"}请先导出为 MP4。` };
    return f.size > v.maxMb * 1024 * 1024 ? { error: `视频 ${mb(f.size)} MB，超过 ${v.maxMb} MB 上限。` } : { kind: "video" };
  }
  if (f.type.startsWith("image/")) return { error: `只支持 ${IMAGE_RULE}。` };
  return { error: `平台聊天只能发图片和 ${v.formats} 视频，PDF 等文件发不出去。` };
}

/** 按给出的顺序挑出能加入的文件；已有 existing 个附件，总数不超过 ATTACH_MAX，超出的不加入 */
export function acceptFiles<F extends FileLike>(files: F[], existing: number, platform: ChatPlatform): { accepted: Array<{ file: F; kind: MediaKind }>; errors: string[] } {
  const accepted: Array<{ file: F; kind: MediaKind }> = [];
  const errors: string[] = [];
  let full = false;
  for (const file of files) {
    const r = checkMedia(file, platform);
    if ("error" in r) errors.push(r.error);
    else if (existing + accepted.length >= ATTACH_MAX) full = true;
    else accepted.push({ file, kind: r.kind });
  }
  if (full) errors.push(`一次最多放 ${ATTACH_MAX} 个，后面的没有加入。`);
  return { accepted, errors: [...new Set(errors)] };
}

export type SendStep = { kind: "text" } | { kind: "media"; key: string };

/** 发送顺序：有文字先发文字，再按加入顺序发附件 */
export function sendPlan(hasText: boolean, keys: string[]): SendStep[] {
  return [...(hasText ? [{ kind: "text" as const }] : []), ...keys.map((key) => ({ kind: "media" as const, key }))];
}

/** 逐条执行，上一条完成才发下一条（平台上的顺序与这里一致）；某条失败就停下，后面的不发 */
export async function runPlan(steps: SendStep[], exec: (s: SendStep) => Promise<void>): Promise<{ done: number; failed: SendStep | null; error?: unknown }> {
  for (let i = 0; i < steps.length; i++) {
    try {
      await exec(steps[i]);
    } catch (error) {
      return { done: i, failed: steps[i], error };
    }
  }
  return { done: steps.length, failed: null };
}
