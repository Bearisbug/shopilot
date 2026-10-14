import { translateBody } from "@/contracts/conversations";
import { AiError } from "@/server/ai/client";
import { translateText } from "@/server/ai/translate";
import { Problem } from "@/server/http/problem";
import { route } from "@/server/http/route";

// API-CONV-012
export const POST = route({
  auth: "member",
  perm: "wb.handle",
  body: translateBody,
  handler: async ({ body }) => {
    try {
      return { text: await translateText(body.text, body.target) };
    } catch (e) {
      if (e instanceof AiError) throw new Problem(e.kind === "timeout" ? "platform-timeout" : "ai-unavailable", { detail: "翻译暂时不可用，请稍后再试。" });
      throw e;
    }
  },
});
