// 翻译（REQ-CONV-008）：TikTok 买家消息译成商户语言（message.translate）；发送前译成买家语言（API-CONV-012）。
import { eq } from "drizzle-orm";
import { db, schema } from "@/server/db/client";
import { chat } from "./client";

export const LANG_NAME: Record<string, string> = {
  ms: "Malay",
  en: "English",
  th: "Thai",
  vi: "Vietnamese",
  id: "Indonesian",
  tl: "Filipino",
  zh: "Simplified Chinese",
  "zh-CN": "Simplified Chinese",
};

export async function translateText(text: string, target: string): Promise<string> {
  const res = await chat(
    "translate",
    [
      { role: "system", content: `Translate the user's message into ${LANG_NAME[target] ?? target}. Keep order numbers, product names, emojis and line breaks. Output only the translation, nothing else.` },
      { role: "user", content: text },
    ],
    { maxTokens: 800, stubHint: text },
  );
  return res.content.trim();
}

export async function translateMessage(data: Record<string, unknown>): Promise<void> {
  const [m] = await db().select().from(schema.message).where(eq(schema.message.id, String(data.messageId ?? ""))).limit(1);
  if (!m || !m.text || m.translation) return;
  const [merchant] = await db().select({ language: schema.merchant.language }).from(schema.merchant).where(eq(schema.merchant.id, m.merchantId)).limit(1);
  const translation = await translateText(m.text, merchant?.language ?? "zh-CN");
  await db().update(schema.message).set({ translation, translationSource: "shopilot" }).where(eq(schema.message.id, m.id));
}
