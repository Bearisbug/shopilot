import { downloadFile } from "@/server/files/service";
import { route } from "@/server/http/route";

// API-CONV-011：按文件所属商户鉴权；private, max-age=300
export const GET = route({ auth: "member", handler: ({ ctx, params }) => downloadFile(ctx, String(params.id)) });
