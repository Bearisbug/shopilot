"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";

/**
 * 弹层关闭后把焦点还给打开前的元素（A11Y-013）。
 * 由 URL（?dialog= / ?panel=）或外部 state 控制的 Radix 弹层没有 Trigger，Radix 关闭时只会去聚焦空的 triggerRef，焦点掉到 body。
 * 用法：Content 的第一个子节点放 <OpenerProbe openerRef={openerRef} />，记下打开瞬间的焦点；onCloseAutoFocus 用这里返回的处理函数。
 */
export function useReturnFocus(onCloseAutoFocus?: (event: Event) => void) {
  const openerRef = useRef<HTMLElement | null>(null);
  return {
    openerRef,
    onCloseAutoFocus(event: Event) {
      onCloseAutoFocus?.(event);
      const el = openerRef.current;
      openerRef.current = null;
      // 调用方自己 preventDefault 时表示它要接管焦点
      if (event.defaultPrevented || !el?.isConnected) return;
      event.preventDefault();
      el.focus();
    },
  };
}

/**
 * 弹层内容挂载时记下当时的焦点。必须是 Content 的第一个子节点：
 * React 按子树顺序执行 layout effect，这样能赶在后面带 autoFocus 的输入框抢走焦点之前读到触发元素。
 * 只在还没记录时写入：开发模式 StrictMode 会再跑一次 effect，那时焦点已经在弹层里。
 */
export function OpenerProbe({ openerRef }: { openerRef: RefObject<HTMLElement | null> }) {
  useLayoutEffect(() => {
    const el = document.activeElement;
    if (!openerRef.current && el instanceof HTMLElement && el !== document.body) openerRef.current = el;
  }, [openerRef]);
  return null;
}
