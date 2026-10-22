"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 官网动效的播放器（PAGE-SITE）。插图元素用 data-a 声明动作，data-at / data-to 是时间轴上的百分比。两种驱动：
 * - data-concept="<起点>"：自动循环（功能格），一轮 semantic.site.duration.loop，从起点百分比开始；露出不到四分之一就暂停。
 * - data-scrub：跟着滚动走，滚动进度换算成时间轴位置并平滑追上，停止滚动就停在那一帧。
 *   pin：区块比一屏高、里面的舞台 sticky，区块顶到达视口底时进度为 0，区块底到达视口底时为 1；
 *   view：data-range="a,b"，元素顶在视口高度 a 处为 0、在 b 处为 1。
 *   data-span="p0,p1,t0,t1" 把进度 p0–p1 映射到插图时间轴 t0–t1；带 data-track="p" 的元素（镜头、字幕）直接用进度。
 * 暂停按钮只管自动循环和 CSS 循环（WCAG 2.2.2）；滚动驱动的画面由用户的滚动控制，不受它影响。
 * 没有 JS 或系统开了减少动效时不建动画，元素停在默认样式，即每张插图的静止画面（MOTION-004）。
 */

type MotionState = "off" | "playing" | "paused";

let state: MotionState = "off";
const listeners = new Set<() => void>();

function setState(next: MotionState) {
  state = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 按 data-* 生成关键帧；百分比换成 0–1 的 offset */
function frames(d: DOMStringMap, step: number, easing: string): Keyframe[] {
  const at = Number(d.at ?? 0);
  const to = Number(d.to ?? 92);
  const len = Number(d.d ?? 0) || step;
  const o = (p: number) => Math.min(Math.max(p, 0), 100) / 100;
  const shift = d.dx || d.dy ? `translate(${d.dx ?? 0}px, ${d.dy ?? 0}px)` : "translate(0px, 8px)";
  const out = (from: string) => [
    { offset: o(to), opacity: 1, transform: "none", easing },
    { offset: o(to + step), opacity: 0, transform: "none" },
    { offset: 1, opacity: 0, transform: from },
  ];
  switch (d.a) {
    case "in":
    case "pop":
    case "fade":
    case "grow":
    case "grow-y": {
      const from = { in: shift, pop: "scale(0.85)", fade: "none", grow: "scaleX(0)", "grow-y": "scaleY(0)" }[d.a];
      const fades = d.a === "in" || d.a === "pop" || d.a === "fade";
      return [
        { offset: 0, opacity: fades ? 0 : 1, transform: from },
        { offset: o(at), opacity: fades ? 0 : 1, transform: from, easing },
        { offset: o(at + len), opacity: 1, transform: "none" },
        ...out(from),
      ];
    }
    case "press": {
      const scale = `scale(${d.v ?? 0.92})`;
      return [
        { offset: 0, transform: "none" },
        { offset: o(at), transform: "none", easing },
        { offset: o(at + step / 2), transform: scale, easing },
        { offset: o(at + step), transform: "none" },
        { offset: 1, transform: "none" },
      ];
    }
    case "move":
      return [
        { offset: 0, transform: shift },
        { offset: o(at), transform: shift, easing },
        { offset: o(at + len), transform: "none" },
        { offset: 1, transform: "none" },
      ];
    case "cursor":
      return [
        { offset: 0, opacity: 0, transform: shift },
        { offset: o(at), opacity: 0, transform: shift, easing },
        { offset: o(at + step / 2), opacity: 1, transform: shift, easing },
        { offset: o(at + len), opacity: 1, transform: "none", easing },
        { offset: o(at + len + step / 2), opacity: 1, transform: "scale(0.85)", easing },
        { offset: o(at + len + step), opacity: 1, transform: "none" },
        ...out(shift),
      ];
    case "wiggle":
      return [
        { offset: 0, transform: "none" },
        { offset: o(at), transform: "none" },
        { offset: o(at + 1), transform: "rotate(14deg)" },
        { offset: o(at + 2), transform: "rotate(-10deg)" },
        { offset: o(at + 3), transform: "rotate(6deg)" },
        { offset: o(at + 4), transform: "none" },
        { offset: 1, transform: "none" },
      ];
    case "drain":
      return [
        { offset: 0, strokeDashoffset: 0 },
        { offset: o(at), strokeDashoffset: 0 },
        { offset: o(to), strokeDashoffset: Number(d.v ?? 100) },
        { offset: 1, strokeDashoffset: Number(d.v ?? 100) },
      ];
    case "packet":
      return [
        { offset: 0, strokeDashoffset: 10 },
        { offset: o(at), strokeDashoffset: 10, easing },
        { offset: o(at + len), strokeDashoffset: -100 },
        { offset: 1, strokeDashoffset: -100 },
      ];
    /* 逐词点亮：未读到的词留浅色 */
    case "lit":
      return [
        { offset: 0, opacity: 0.22 },
        { offset: o(at), opacity: 0.22, easing },
        { offset: o(at + len), opacity: 1 },
        { offset: 1, opacity: 1 },
      ];
    /* 任意关键帧：data-prop 是属性名，data-k 是 [[百分比, 值], …] */
    case "keys": {
      const prop = d.prop ?? "transform";
      const keys = (JSON.parse(d.k ?? "[]") as [number, string | number][]).map(([p, v]) => ({ offset: o(p), [prop]: v, easing }));
      return [{ ...keys[0], offset: 0 }, ...keys, { ...keys[keys.length - 1], offset: 1 }];
    }
    default:
      return [];
  }
}

/** 构建会把 9600ms 压成 9.6s，两种单位都要认 */
function toMs(value: string) {
  const v = value.trim();
  return v.endsWith("ms") ? parseFloat(v) : parseFloat(v) * 1000;
}

/** CSS 写的循环（面板光晕、背景光晕漂移、小圆点脉冲）关键帧名都以 site-loop- 开头，只跟暂停按钮走 */
function cssLoops(root: Element) {
  return root.getAnimations({ subtree: true }).filter((a): a is CSSAnimation => a instanceof CSSAnimation && a.animationName.startsWith("site-loop-"));
}

/** 滚动驱动的时间轴长度：只是换算单位，和真实时长无关 */
const SCRUB = 1000;

type Scrub = { el: HTMLElement; concept: Animation[]; raw: Animation[]; span: number[]; range: number[]; pin: boolean; cur: number };

function progress(s: Scrub, vh: number) {
  const r = s.el.getBoundingClientRect();
  const p = s.pin ? (vh - r.top) / r.height : (s.range[0] * vh - r.top) / ((s.range[0] - s.range[1]) * vh);
  return Math.min(Math.max(p, 0), 1);
}

function seek(s: Scrub) {
  const [p0, p1, t0, t1] = s.span;
  const t = t0 + (t1 - t0) * Math.min(Math.max((s.cur - p0) / (p1 - p0), 0), 1);
  s.concept.forEach((a) => (a.currentTime = (t / 100) * SCRUB));
  s.raw.forEach((a) => (a.currentTime = s.cur * SCRUB));
}

export function SiteMotion() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".site-root");
    if (!root || matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const css = getComputedStyle(root);
    const loop = toMs(css.getPropertyValue("--semantic-site-duration-loop"));
    const slow = toMs(css.getPropertyValue("--semantic-motion-duration-slow"));
    const step = (slow / loop) * 100;
    const easing = css.getPropertyValue("--semantic-motion-easing-standard").trim();
    const nums = (v: string | undefined, fallback: number[]) => (v ? v.split(",").map(Number) : fallback);

    /* 自动循环：功能格 */
    const panels = new Map<Element, Animation[]>();
    root.querySelectorAll<HTMLElement>("[data-concept]").forEach((panel) => {
      const start = (Number(panel.dataset.concept) / 100) * loop;
      const anims = Array.from(panel.querySelectorAll<HTMLElement | SVGElement>("[data-a]"), (el) => {
        const a = el.animate(frames(el.dataset, step, easing), { duration: loop, iterations: Infinity });
        a.currentTime = start;
        a.pause();
        return a;
      });
      panels.set(panel, anims);
    });

    /* 跟着滚动：首屏演示、陈述、接待档位、订单、知识库 */
    const scrubs: Scrub[] = Array.from(root.querySelectorAll<HTMLElement>("[data-scrub]"), (el) => {
      const s: Scrub = { el, concept: [], raw: [], span: nums(el.dataset.span, [0, 1, 0, 100]), range: nums(el.dataset.range, [0.9, 0.3]), pin: el.dataset.scrub === "pin", cur: 0 };
      el.querySelectorAll<HTMLElement | SVGElement>("[data-a]").forEach((node) => {
        const a = node.animate(frames(node.dataset, step, easing), { duration: SCRUB, fill: "both" });
        a.pause();
        (node.dataset.track === "p" ? s.raw : s.concept).push(a);
      });
      s.cur = progress(s, innerHeight);
      seek(s);
      return s;
    });

    /* 平滑追随：剩余距离按指数衰减，约 slow 档（320ms）落定，与刷新率无关 */
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      const dt = last ? Math.min(now - last, 64) : 16;
      const k = 1 - Math.exp(-dt / (slow / 3));
      const vh = innerHeight;
      let moving = false;
      scrubs.forEach((s) => {
        const d = progress(s, vh) - s.cur;
        if (d === 0) return;
        if (Math.abs(d) < 0.0005) s.cur += d;
        else {
          s.cur += d * k;
          moving = true;
        }
        seek(s);
      });
      last = now;
      raf = moving ? requestAnimationFrame(tick) : 0;
      if (!moving) last = 0;
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    addEventListener("scroll", kick, { passive: true });
    addEventListener("resize", kick);

    const visible = new Set<Element>();
    const sync = () => {
      const paused = state === "paused";
      panels.forEach((anims, panel) => anims.forEach((a) => (visible.has(panel) && !paused ? a.play() : a.pause())));
      cssLoops(root).forEach((a) => (paused ? a.pause() : a.play()));
    };
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => (e.intersectionRatio >= 0.25 ? visible.add(e.target) : visible.delete(e.target)));
        sync();
      },
      { threshold: [0, 0.25] },
    );
    panels.forEach((_, panel) => io.observe(panel));
    listeners.add(sync);
    setState("playing");

    return () => {
      io.disconnect();
      listeners.delete(sync);
      removeEventListener("scroll", kick);
      removeEventListener("resize", kick);
      cancelAnimationFrame(raf);
      panels.forEach((anims) => anims.forEach((a) => a.cancel()));
      scrubs.forEach((s) => [...s.concept, ...s.raw].forEach((a) => a.cancel()));
      setState("off");
    };
  }, []);
  return null;
}

/** 暂停 / 播放全站自动播放的动画；动画没建起来（无 JS、减少动效）时不显示 */
export function MotionToggle({ pauseLabel, playLabel, className }: { pauseLabel: string; playLabel: string; className?: string }) {
  const s = useSyncExternalStore(subscribe, () => state, () => "off");
  if (s === "off") return null;
  const paused = s === "paused";
  return (
    <button
      type="button"
      onClick={() => setState(paused ? "playing" : "paused")}
      aria-label={paused ? playLabel : pauseLabel}
      title={paused ? playLabel : pauseLabel}
      className={cn("site-glass state-layer focus-ring inline-flex size-8 items-center justify-center rounded-full text-muted-foreground", className)}
    >
      {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
    </button>
  );
}
