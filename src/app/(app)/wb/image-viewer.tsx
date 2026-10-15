"use client";

import { ExternalLinkIcon } from "lucide-react";
import { useMemo, useState } from "react";
import Lightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";
import "./image-viewer.css";

export type ViewerImage = { id: string; src: string; caption: string };

const LABELS = {
  Previous: "上一张",
  Next: "下一张",
  Close: "关闭",
  Lightbox: "聊天图片查看器",
  Carousel: "图片",
  Slide: "图片",
  "Photo gallery": "本会话的聊天图片",
  "{index} of {total}": "第 {index} 张，共 {total} 张",
  "Zoom in": "放大",
  "Zoom out": "缩小",
};

function cssMs(name: string, fallback: number) {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  return Number.isFinite(v) ? v : fallback;
}

/**
 * 聊天图片灯箱：深色遮罩上等比显示原图，左右切换本会话已加载的图片，可缩放拖动。
 * 关闭后焦点回到点开它的那张缩略图（A11Y-013）；减少动态效果时只保留短淡入淡出（MOTION-004）。
 */
export function ImageViewer({
  open,
  images,
  index,
  trigger,
  onClose,
  onExited,
}: {
  open: boolean;
  images: ViewerImage[];
  index: number;
  trigger: HTMLElement | null;
  /** 开始关闭（淡出期间保持挂载） */
  onClose: () => void;
  /** 淡出结束，可以卸载 */
  onExited: () => void;
}) {
  const [current, setCurrent] = useState(index);
  // 只在点开缩略图后于浏览器里挂载，可以直接读媒体查询与 token
  const [anim] = useState(() => {
    if (typeof window === "undefined") return { fade: 200, swipe: 200, zoom: 200 };
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const base = cssMs("--semantic-motion-duration-base", 200);
    const fast = cssMs("--semantic-motion-duration-fast", 120);
    return reduce ? { fade: fast, swipe: 0, zoom: 0 } : { fade: base, swipe: base, zoom: base };
  });

  // slides 换了引用 YARL 会回到 index 指定的那张：按图片集合记忆，时间线轮询重渲染时不打断浏览。
  // 不传宽高：消息里带的是缩略图尺寸，传了会按缩略图大小封顶，原图显示不全
  const key = images.map((i) => i.id).join(",");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 只在图片集合变化时重建
  const slides = useMemo(() => images.map((i) => ({ src: i.src, alt: i.caption })), [key]);
  const img = images[current];
  return (
    <Lightbox
      open={open}
      index={index}
      close={onClose}
      slides={slides}
      plugins={[Zoom]}
      labels={LABELS}
      animation={{ fade: anim.fade, swipe: anim.swipe, zoom: anim.zoom }}
      carousel={{ finite: true, padding: "48px", spacing: "16px" }}
      controller={{ closeOnBackdropClick: true }}
      zoom={{ maxZoomPixelRatio: 3, scrollToZoom: true, doubleClickMaxStops: 2 }}
      on={{
        view: ({ index: i }) => setCurrent(i),
        // 缩略图可能已随时间线翻页卸载：先确认还在文档里再还原焦点
        exited: () => {
          if (trigger?.isConnected) trigger.focus();
          onExited();
        },
      }}
      toolbar={{
        buttons: [
          img ? (
            <a key="open" href={img.src} target="_blank" rel="noopener noreferrer" className="yarl__button" aria-label="在新标签页打开原图" title="打开原图">
              <ExternalLinkIcon className="yarl__icon" aria-hidden />
            </a>
          ) : null,
          "zoom",
          "close",
        ],
      }}
      render={{
        buttonPrev: images.length > 1 ? undefined : () => null,
        buttonNext: images.length > 1 ? undefined : () => null,
        controls: () =>
          img ? (
            <p className="viewer-caption" aria-live="polite">
              <span className="tabular-nums">
                第 {current + 1} 张 / 共 {images.length} 张
              </span>
              {img.caption ? <span> · {img.caption}</span> : null}
            </p>
          ) : null,
      }}
    />
  );
}
