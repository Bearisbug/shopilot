import { messageMedia } from "@/server/conversations/media";
import { route } from "@/server/http/route";

// API-CONV-017：下载一条图片、视频或贴纸消息的媒体文件（附件）；过期 410，超过 200 MB 413
export const GET = route({ auth: "member", perm: "wb.handle", handler: ({ ctx, params }) => messageMedia(ctx, String(params.id), String(params.messageId)) });
