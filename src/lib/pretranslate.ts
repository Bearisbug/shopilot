// 输入框预翻译（API-CONV-012 + API-CONV-007 translatedText）：缓存键与能否预翻译的判定，供输入框与测试共用。

/** 翻译接口单次上限，和 translateBody 一致 */
export const PRETRANSLATE_MAX_CHARS = 2000;
/** 一个输入框里最多记住的译文条数：来回改字时能直接复用，又不无限增长 */
export const PRETRANSLATE_CACHE_MAX = 50;

/** 缓存键：去掉首尾空白的文字 + 目标语言；文字或语言一变就是新键，旧译文不再适用 */
export const pretranslateKey = (text: string, lang: string) => `${lang}\u0000${text.trim()}`;

/** 要翻译、有字、不超过翻译接口上限时才预翻译 */
export function canPretranslate(text: string, lang: string): boolean {
  const t = text.trim();
  return lang !== "none" && t.length > 0 && Array.from(t).length <= PRETRANSLATE_MAX_CHARS;
}

/** 记住一条译文；超过上限时丢掉最早记下的 */
export function rememberTranslation(cache: Map<string, string>, key: string, translation: string, max = PRETRANSLATE_CACHE_MAX): void {
  cache.delete(key);
  cache.set(key, translation);
  while (cache.size > max) cache.delete(cache.keys().next().value!);
}
