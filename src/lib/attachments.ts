// 工作台输入框的附件（粘贴或选择的图片、视频）：先放进输入框，和文字一起按顺序发送。
// 这里只放与界面无关的规则：能不能加、最多几个、发送顺序与失败即停。

export const ATTACH_MAX = 9;
export const IMAGE_RULE = "JPG、PNG、WebP，不超过 10 MB";
export const MEDIA_RULE = "JPG、PNG、WebP 图片不超过 10 MB，MP4 视频不超过 30 MB";
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const VIDEO_MAX_BYTES = 30 * 1024 * 1024;
const mb = (n: number) => (n / 1024 / 1024).toFixed(1);

export type MediaKind = "image" | "video";
type FileLike = { type: string; size: number };

/** 能不能发、按什么发：视频只有 Shopee 能发（TikTok 客服接口没有视频上传）；不能发时给出原因 */
export function checkMedia(f: FileLike, shopee: boolean): { kind: MediaKind } | { error: string } {
  if (IMAGE_TYPES.includes(f.type)) return f.size > IMAGE_MAX_BYTES ? { error: `图片 ${mb(f.size)} MB，超过 10 MB 上限。` } : { kind: "image" };
  if (f.type.startsWith("video/")) {
    if (!shopee) return { error: "TikTok 接口暂不支持发视频。" };
    if (f.type !== "video/mp4") return { error: "只支持 MP4 视频，MOV 等格式请先导出为 MP4。" };
    return f.size > VIDEO_MAX_BYTES ? { error: `视频 ${mb(f.size)} MB，超过 30 MB 上限。` } : { kind: "video" };
  }
  if (f.type.startsWith("image/")) return { error: `只支持 ${IMAGE_RULE}。` };
  return { error: shopee ? "平台聊天只能发图片和 MP4 视频，PDF 等文件发不出去。" : "平台聊天只能发图片，视频、PDF 等文件发不出去。" };
}

/** 按给出的顺序挑出能加入的文件；已有 existing 个附件，总数不超过 ATTACH_MAX，超出的不加入 */
export function acceptFiles<F extends FileLike>(files: F[], existing: number, shopee: boolean): { accepted: Array<{ file: F; kind: MediaKind }>; errors: string[] } {
  const accepted: Array<{ file: F; kind: MediaKind }> = [];
  const errors: string[] = [];
  let full = false;
  for (const file of files) {
    const r = checkMedia(file, shopee);
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
