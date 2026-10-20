"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { canPretranslate, pretranslateKey, rememberTranslation } from "@/lib/pretranslate";

const DEBOUNCE_MS = 800;

export type Pretranslation = { status: "idle" } | { status: "pending" } | { status: "done"; text: string } | { status: "error" };

/**
 * 客服停止输入 800 ms 后预先翻译当前文字（API-CONV-012），结果按「文字 + 目标语言」缓存。
 * 文字或语言一变，上一次的请求取消；陈旧响应按键入缓存，不会顶替当前文字的结果。
 * get() 给发送用：命中就随消息带上译文，服务端不再同步翻译。
 */
export function usePretranslate(text: string, lang: string): { key: string; state: Pretranslation; get: (text: string, lang: string) => string | undefined } {
  const [cache, setCache] = useState<Map<string, string>>(() => new Map());
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const key = pretranslateKey(text, lang);
  const active = canPretranslate(text, lang);

  useEffect(() => {
    if (!active || cache.has(key)) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const r = await api.post<{ text: string }>("/api/v1/translate", { text: text.trim(), target: lang }, undefined, 15_000, ctrl.signal);
        if (ctrl.signal.aborted) return;
        setCache((prev) => {
          const next = new Map(prev);
          rememberTranslation(next, key, r.text);
          return next;
        });
      } catch {
        if (!ctrl.signal.aborted) setFailedKey(key);
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [active, cache, key, text, lang]);

  const get = useCallback((t: string, l: string) => cache.get(pretranslateKey(t, l)), [cache]);
  const done = cache.get(key);
  const state: Pretranslation = !active ? { status: "idle" } : done !== undefined ? { status: "done", text: done } : failedKey === key ? { status: "error" } : { status: "pending" };
  return { key, state, get };
}
