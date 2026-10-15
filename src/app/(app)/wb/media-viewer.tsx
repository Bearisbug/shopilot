"use client";

import { DownloadIcon, ExternalLinkIcon, LoaderCircleIcon, VideoOffIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import Lightbox, { type ContainerRect, type GenericSlide } from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";
import { toast } from "sonner";
import { api, errorText } from "@/lib/api";
import "./media-viewer.css";

/** 灯箱里的一项：图片或视频。downloadUrl 走自家下载接口（平台 CDN 跨域，<a download> 不生效） */
export type ViewerItem = {
  id: string;
  kind: "image" | "video";
  src: string;
  /** 视频封面 */
  poster?: string;
  width?: number;
  height?: number;
  caption: string;
  downloadUrl: string;
};

/** 聊天视频幻灯片：自己渲染 <video>，加载失败（签名过期）时就地说明，不留一个点不动的黑框 */
type ChatVideoSlide = GenericSlide & { type: "chat-video"; id: string; src: string; poster?: string; width?: number; height?: number };
declare module "yet-another-react-lightbox" {
  interface SlideTypes {
    "chat-video": ChatVideoSlide;
  }
}

const LABELS = {
  Previous: "上一个",
  Next: "下一个",
  Close: "关闭",
  Lightbox: "聊天图片与视频查看器",
  Carousel: "图片与视频",
  Slide: "图片或视频",
  "Photo gallery": "本会话的聊天图片与视频",
  "{index} of {total}": "第 {index} 个，共 {total} 个",
  "Zoom in": "放大",
  "Zoom out": "缩小",
};

function cssMs(name: string, fallback: number) {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  return Number.isFinite(v) ? v : fallback;
}

/** 经下载接口取文件，按响应头里的文件名存盘；失败时抛 ApiError（链接过期是 410） */
async function saveMedia(url: string) {
  const res = await api.download(url);
  const blob = await res.blob();
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(res.headers.get("content-disposition") ?? "")?.[1];
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = encoded ? decodeURIComponent(encoded) : "";
  a.click();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

/** 视频等比放进幻灯片区域；尺寸未知时先按视频自身大小显示，读到元数据后再放大到合适大小 */
function VideoSlide({ slide, rect, active, autoPlay, onError }: { slide: ChatVideoSlide; rect: ContainerRect; active: boolean; autoPlay: boolean; onError: (id: string) => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  // 切到别的幻灯片时暂停
  useEffect(() => {
    if (!active) ref.current?.pause();
  }, [active]);
  if (failed)
    return (
      <div className="viewer-error" role="status">
        <VideoOffIcon className="size-8" aria-hidden="true" />
        <p>视频加载不出来，链接可能已过期</p>
        <p className="viewer-error-sub">请到平台卖家后台查看这条消息</p>
      </div>
    );
  const w = natural?.w ?? slide.width;
  const h = natural?.h ?? slide.height;
  const scale = w && h ? Math.min(rect.width / w, rect.height / h) : null;
  return (
    <video
      ref={ref}
      src={slide.src}
      poster={slide.poster}
      controls
      playsInline
      autoPlay={autoPlay}
      preload="metadata"
      aria-label="聊天视频"
      className="viewer-video"
      style={w && h && scale ? { width: Math.round(w * scale), height: Math.round(h * scale) } : undefined}
      onLoadedMetadata={(e) => {
        const v = e.currentTarget;
        if (v.videoWidth && v.videoHeight) setNatural({ w: v.videoWidth, h: v.videoHeight });
      }}
      onError={() => {
        setFailed(true);
        onError(slide.id);
      }}
      // 拖动底部进度条时不让灯箱当成左右滑动切换
      onPointerDown={(e) => {
        if (e.currentTarget.getBoundingClientRect().bottom - e.clientY < 48) e.stopPropagation();
      }}
    />
  );
}

/**
 * 聊天媒体灯箱：深色遮罩上等比显示原图或播放视频，左右切换本会话已加载的图片与视频，图片可缩放拖动，每项都能下载。
 * items 是点开时的快照，浏览期间时间线轮询不打断；关闭后焦点回到点开它的缩略图（A11Y-013）；减少动态效果时只保留短淡入淡出（MOTION-004）。
 */
export function MediaViewer({
  open,
  items,
  index,
  trigger,
  onClose,
  onExited,
  onVideoError,
}: {
  open: boolean;
  items: ViewerItem[];
  index: number;
  trigger: HTMLElement | null;
  /** 开始关闭（淡出期间保持挂载） */
  onClose: () => void;
  /** 淡出结束，可以卸载 */
  onExited: () => void;
  /** 视频在灯箱里加载失败：时间线把这条换成过期提示 */
  onVideoError: (id: string) => void;
}) {
  const [current, setCurrent] = useState(index);
  const [downloading, setDownloading] = useState<ReadonlySet<string>>(new Set());
  // 只在点开缩略图后于浏览器里挂载，可以直接读媒体查询与 token
  const [anim] = useState(() => {
    if (typeof window === "undefined") return { fade: 200, swipe: 200, zoom: 200 };
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const base = cssMs("--semantic-motion-duration-base", 200);
    const fast = cssMs("--semantic-motion-duration-fast", 120);
    return reduce ? { fade: fast, swipe: 0, zoom: 0 } : { fade: base, swipe: base, zoom: base };
  });
  const openedId = items[index]?.id;

  // 不给图片传宽高：消息里带的是缩略图尺寸，传了会按缩略图大小封顶，原图显示不全
  const slides = useMemo(
    () => items.map((i) => (i.kind === "video" ? { type: "chat-video" as const, id: i.id, src: i.src, poster: i.poster, width: i.width, height: i.height } : { src: i.src, alt: i.caption })),
    [items],
  );
  const item = items[current];
  const busy = !!item && downloading.has(item.id);
  const download = async (target: ViewerItem) => {
    setDownloading((s) => new Set(s).add(target.id));
    try {
      await saveMedia(target.downloadUrl);
    } catch (e) {
      toast.error(target.kind === "video" ? "视频没有下载成功" : "图片没有下载成功", { description: errorText(e) });
    } finally {
      setDownloading((s) => {
        const next = new Set(s);
        next.delete(target.id);
        return next;
      });
    }
  };
  const noun = item?.kind === "video" ? "视频" : "图片";
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
          item ? (
            <button
              key="download"
              type="button"
              className="yarl__button"
              aria-label={busy ? `正在下载${noun}` : `下载${noun}`}
              title={busy ? "正在下载" : "下载"}
              aria-busy={busy}
              // 不用 disabled：按钮在下载中被禁用会丢焦点，灯箱就收不到方向键与 Esc（A11Y-013）
              aria-disabled={busy}
              onClick={() => {
                if (!busy) void download(item);
              }}
            >
              {busy ? <LoaderCircleIcon className="yarl__icon motion-safe:animate-spin" aria-hidden /> : <DownloadIcon className="yarl__icon" aria-hidden />}
            </button>
          ) : null,
          item ? (
            <a key="open" href={item.src} target="_blank" rel="noopener noreferrer" className="yarl__button" aria-label={`在新标签页打开原${noun}`} title={`打开原${noun}`}>
              <ExternalLinkIcon className="yarl__icon" aria-hidden />
            </a>
          ) : null,
          "zoom",
          "close",
        ],
      }}
      render={{
        slide: ({ slide, offset, rect }) =>
          slide.type === "chat-video" ? <VideoSlide key={slide.id} slide={slide} rect={rect} active={offset === 0} autoPlay={offset === 0 && slide.id === openedId} onError={onVideoError} /> : undefined,
        buttonPrev: items.length > 1 ? undefined : () => null,
        buttonNext: items.length > 1 ? undefined : () => null,
        controls: () =>
          item ? (
            <p className="viewer-caption" aria-live="polite">
              <span className="tabular-nums">
                {current + 1} / {items.length}
              </span>
              {item.caption ? <span> · {item.caption}</span> : null}
            </p>
          ) : null,
      }}
    />
  );
}
