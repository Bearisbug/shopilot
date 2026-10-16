// 翻译（REQ-CONV-008、REQ-AI-007）：TikTok 买家消息译成商户语言（message.translate）；影子回复译成商户语言（draft.translate）；发送前译成买家语言（API-CONV-012）。
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

/** 汉字占非空白字符三成以上算中文，不再翻译 */
export function isChinese(text: string): boolean {
  const chars = text.replace(/\s+/g, "");
  if (!chars) return true;
  const han = chars.match(/[\u3400-\u9fff\uf900-\ufaff]/g)?.length ?? 0;
  return han / chars.length >= 0.3;
}

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

/** 任务 draft.translate：影子回复不是商户语言时存一份商户语言译文；翻译失败抛给队列重试，影子回复本身不动 */
export async function translateDraft(data: Record<string, unknown>): Promise<void> {
  const [d] = await db().select().from(schema.draft).where(eq(schema.draft.id, String(data.draftId ?? ""))).limit(1);
  if (!d || d.mode !== "shadow" || d.translation) return;
  const [merchant] = await db().select({ language: schema.merchant.language }).from(schema.merchant).where(eq(schema.merchant.id, d.merchantId)).limit(1);
  const language = merchant?.language ?? "zh-CN";
  if (language.startsWith("zh") && isChinese(d.text)) return;
  const translation = await translateText(d.text, language);
  await db().update(schema.draft).set({ translation }).where(eq(schema.draft.id, d.id));
}
