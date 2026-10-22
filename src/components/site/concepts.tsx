import type { ComponentProps, CSSProperties } from "react";
import {
  BadgeCheck,
  Bell,
  BookOpen,
  Check,
  CheckCheck,
  CircleCheck,
  ClipboardList,
  Clock,
  FileText,
  Hand,
  Headset,
  Image as ImageIcon,
  Inbox,
  Languages,
  type LucideIcon,
  MessageSquareText,
  Music2,
  Package,
  PenLine,
  Play,
  Search,
  Send,
  ShoppingBag,
  ShoppingCart,
  Ticket,
  TriangleAlert,
  Truck,
  Undo2,
  UserCheck,
  UserRound,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SiteCopy } from "./content";

/**
 * 官网概念动效插图（PAGE-SITE）：线框卡片、灰色文字条和图标，不画真实界面，界面改版不用跟着改。
 * data-a 等属性由 site-motion.tsx 的播放器读取，时间是一轮（9.6 秒）里的百分比；默认样式就是静止画面，
 * data-static="hidden" 的元素静止时不显示。外层 data-concept 是播放起点（见 site-motion.tsx）。
 */

type Kind = "in" | "pop" | "fade" | "grow" | "grow-y" | "press" | "move" | "cursor" | "wiggle" | "drain" | "packet" | "lit" | "keys";
type Motion = {
  a: Kind;
  at?: number;
  to?: number;
  d?: number;
  dx?: number;
  dy?: number;
  v?: number;
  hidden?: boolean;
  origin?: "left" | "right" | "top";
  /** keys 用：属性名与 [百分比, 值] 列表 */
  prop?: "opacity" | "transform";
  k?: [number, string | number][];
  /** 滚动驱动时直接用滚动进度，不换算成插图时间轴 */
  track?: "p";
};

export function m({ a, at, to, d, dx, dy, v, hidden, origin, prop, k, track }: Motion) {
  return {
    "data-a": a,
    "data-at": at,
    "data-to": to,
    "data-d": d,
    "data-dx": dx,
    "data-dy": dy,
    "data-v": v,
    "data-static": hidden ? "hidden" : undefined,
    "data-origin": origin,
    "data-prop": prop,
    "data-k": k && JSON.stringify(k),
    "data-track": track,
  };
}

/** AI 草稿写作时让位：会话列表与店铺卡淡下去，发出后恢复（插图时间轴） */
const FOCUS = m({ a: "keys", prop: "opacity", k: [[0, 1], [46, 1], [50, 0.3], [74, 0.3], [78, 1]] });

type Platform = "shopee" | "tiktok";
const PLATFORM_ICON: Record<Platform, LucideIcon> = { shopee: ShoppingBag, tiktok: Music2 };

/* ---------- SVG 小零件 ---------- */

function Svg({ w, h, className, children }: { w: number; h: number; className?: string; children: React.ReactNode }) {
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cn("cpt block h-auto w-full", className)} aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

type Tone = "soft" | "strong" | "link" | "ink" | "warn";
/** 灰色文字条：代替真实文字 */
function Bar({ x, y, w, h = 8, tone = "soft", ...rest }: { x: number; y: number; w: number; h?: number; tone?: Tone } & Omit<ComponentProps<"rect">, "x" | "y" | "width" | "height">) {
  return <rect x={x} y={y} width={w} height={h} rx={h / 2} className={`cpt-bar-${tone}`} {...rest} />;
}

/** 一串短条：代替外语原文，与译文的整条区分 */
function Segs({ x, y, ws, h = 8 }: { x: number; y: number; ws: number[]; h?: number }) {
  const starts = ws.map((_, i) => x + ws.slice(0, i).reduce((sum, w) => sum + w + 5, 0));
  return (
    <>
      {ws.map((w, i) => (
        <rect key={i} x={starts[i]} y={y} width={w} height={h} rx={h / 2} className="cpt-bar-strong" />
      ))}
    </>
  );
}

function Icon({ icon: I, x, y, s = 16, tone = "ink" }: { icon: LucideIcon; x: number; y: number; s?: number; tone?: "ink" | "link" | "on-mango" | "warn" | "ok" }) {
  return (
    <g transform={`translate(${x} ${y})`} className={`cpt-${tone}`}>
      <I size={s} />
    </g>
  );
}

function Ai({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x} y={y} width={24} height={17} rx={4} className="cpt-cocoa" />
      <text x={x + 12} y={y + 12.5} textAnchor="middle" fontSize={10} className="cpt-on-inverse">
        AI
      </text>
    </g>
  );
}

/** 指针：热点在 (0,0) */
function Cursor() {
  return <path d="M0 0v19l5-4.6 3.6 7.9 3.2-1.4-3.5-7.6H15z" className="cpt-cursor" />;
}

function Wire({ d }: { d: string }) {
  return <path d={d} className="cpt-wire" />;
}

/** 沿连线跑过去的一小段光：pathLength 归一到 100 */
function Packet({ d, at, len }: { d: string; at: number; len: number }) {
  return <path d={d} pathLength={100} className="cpt-packet" {...m({ a: "packet", at, d: len })} />;
}

/* ---------- 首屏：各店消息汇入 → AI 起草 → 译文 → 客服发出 ---------- */

const HERO_SHOPS: [Platform, string][] = [
  ["shopee", "MY"],
  ["tiktok", "TH"],
  ["shopee", "VN"],
  ["tiktok", "PH"],
  ["shopee", "SG"],
];
const PLATFORM_NAME: Record<Platform, string> = { shopee: "Shopee", tiktok: "TikTok Shop" };
const HERO_ROWS: { p: Platform; name: number; preview: number; status?: "ai" | "wait" | "ticket" }[] = [
  { p: "shopee", name: 92, preview: 168, status: "ai" },
  { p: "tiktok", name: 110, preview: 140 },
  { p: "shopee", name: 80, preview: 156, status: "wait" },
  { p: "tiktok", name: 104, preview: 120 },
  { p: "shopee", name: 96, preview: 150, status: "ticket" },
];

/** 首屏桌面版与窄屏版：同一段对话流程，窄屏去掉会话列表 */
export function HeroConcept({ copy }: { copy: SiteCopy }) {
  const market: Record<string, string> = Object.fromEntries(copy.platforms.markets);
  return (
    <>
      <Svg w={1120} h={560} className="hidden md:block">
        <g {...FOCUS}>
        {HERO_SHOPS.map(([p, code], i) => {
          const cy = 76 + i * 102;
          const wire = `M224 ${cy} C 280 ${cy}, 274 280, 330 280`;
          return (
            <g key={code}>
              <Wire d={wire} />
              <Packet d={wire} at={3 + i * 4} len={7} />
              <rect x={24} y={cy - 26} width={200} height={52} rx={14} className="cpt-card" />
              <circle cx={52} cy={cy} r={15} className="cpt-sunken" />
              <Icon icon={PLATFORM_ICON[p]} x={45} y={cy - 7} s={14} />
              <text x={76} y={cy - 3} fontSize={13} className="cpt-text">
                {PLATFORM_NAME[p]}
              </text>
              <text x={76} y={cy + 14} fontSize={11} className="cpt-caption">
                {code} · {market[code]}
              </text>
              <g {...m({ a: "pop", at: 2 + i * 4 })}>
                <circle cx={200} cy={cy} r={10} className="cpt-mango" />
                <text x={200} y={cy + 4} textAnchor="middle" fontSize={11} className="cpt-text">
                  1
                </text>
              </g>
            </g>
          );
        })}
        </g>

        <g {...FOCUS}>
        <rect x={330} y={24} width={310} height={512} rx={20} className="cpt-card" />
        <Icon icon={Inbox} x={352} y={46} s={18} />
        <Bar x={380} y={51} w={96} h={9} tone="strong" />
        <rect x={576} y={44} width={40} height={22} rx={11} className="cpt-accent" />
        <Bar x={588} y={52} w={16} h={6} tone="link" />
        <rect x={352} y={82} width={120} height={26} rx={8} className="cpt-outline" />
        <Bar x={364} y={91} w={64} h={7} />
        <rect x={480} y={82} width={136} height={26} rx={8} className="cpt-outline" />
        <Bar x={492} y={91} w={80} h={7} />
        <line x1={330} y1={124} x2={640} y2={124} className="cpt-divider" />
        <g {...m({ a: "fade", at: 28 })}>
          <rect x={338} y={134} width={294} height={70} rx={12} className="cpt-accent" />
          <rect x={338} y={146} width={4} height={46} rx={2} className="cpt-caramel" />
        </g>
        {HERO_ROWS.map((r, i) => (
          <g key={i} {...m({ a: "in", at: 9 + i * 4, dx: -16 })}>
            <g transform={`translate(0 ${132 + i * 78})`}>
              <circle cx={370} cy={36} r={18} className="cpt-sunken" />
              <Icon icon={UserRound} x={362} y={28} />
              <Bar x={398} y={16} w={r.name} h={9} tone="strong" />
              <Bar x={590} y={17} w={26} h={7} />
              <Icon icon={PLATFORM_ICON[r.p]} x={398} y={31} s={12} />
              <Bar x={416} y={34} w={64} h={7} />
              <Bar x={398} y={52} w={r.preview} h={7} />
              {r.status === "ai" && (
                <>
                  <g {...m({ a: "fade", at: 0, to: 76 })}>
                    <Ai x={592} y={46} />
                  </g>
                  <g {...m({ a: "pop", at: 78, hidden: true })}>
                    <Icon icon={CheckCheck} x={596} y={46} tone="link" />
                  </g>
                </>
              )}
              {r.status === "wait" && <Icon icon={TriangleAlert} x={596} y={46} tone="warn" />}
              {r.status === "ticket" && <Icon icon={ClipboardList} x={596} y={46} />}
            </g>
          </g>
        ))}
        </g>

        <rect x={668} y={24} width={428} height={512} rx={20} className="cpt-card" />
        <g {...m({ a: "fade", at: 30 })}>
          <circle cx={708} cy={60} r={18} className="cpt-sunken" />
          <Icon icon={UserRound} x={700} y={52} />
          <Bar x={736} y={48} w={110} h={9} tone="strong" />
          <Icon icon={ShoppingBag} x={736} y={63} s={12} />
          <Bar x={754} y={66} w={70} h={7} />
          <rect x={992} y={44} width={80} height={32} rx={10} className="cpt-outline" />
          <Icon icon={Hand} x={1004} y={53} s={14} />
          <Bar x={1024} y={56} w={36} h={8} tone="strong" />
        </g>
        <line x1={668} y1={96} x2={1096} y2={96} className="cpt-divider" />
        <ChatFlow x={692} y={116} w={380} cursor={[150, 96]} gid="site-ai-hero" />
        <rect x={692} y={460} width={380} height={52} rx={14} className="cpt-card" />
        <Bar x={710} y={482} w={180} />
        <Icon icon={ImageIcon} x={968} y={478} />
        <Icon icon={Zap} x={996} y={478} />
        <circle cx={1050} cy={486} r={15} className="cpt-sunken" />
        <Icon icon={Send} x={1043} y={479} s={14} />
      </Svg>

      <Svg w={360} h={476} className="md:hidden">
        <g {...FOCUS}>
        {HERO_SHOPS.slice(0, 3).map(([p, code], i) => {
          const x = 12 + i * 116;
          const wire = `M${x + 52} 52 C ${x + 52} 78, 180 74, 180 100`;
          return (
            <g key={code}>
              <Wire d={wire} />
              <Packet d={wire} at={3 + i * 4} len={7} />
              <rect x={x} y={12} width={104} height={40} rx={12} className="cpt-card" />
              <Icon icon={PLATFORM_ICON[p]} x={x + 12} y={25} s={14} />
              <text x={x + 32} y={36.5} fontSize={11} className="cpt-text">
                {p === "shopee" ? "Shopee" : "TikTok"} {code}
              </text>
              <g {...m({ a: "pop", at: 2 + i * 4 })}>
                <circle cx={x + 100} cy={14} r={8} className="cpt-mango" />
                <text x={x + 100} y={17.5} textAnchor="middle" fontSize={9.5} className="cpt-text">
                  1
                </text>
              </g>
            </g>
          );
        })}
        </g>
        <rect x={12} y={100} width={336} height={364} rx={18} className="cpt-card" />
        <g {...m({ a: "fade", at: 30 })}>
          <circle cx={44} cy={128} r={16} className="cpt-sunken" />
          <Icon icon={UserRound} x={37} y={121} s={14} />
          <Bar x={68} y={117} w={96} h={9} tone="strong" />
          <Icon icon={ShoppingBag} x={68} y={131} s={12} />
          <Bar x={84} y={134} w={60} h={7} />
          <rect x={262} y={113} width={72} height={30} rx={9} className="cpt-outline" />
          <Icon icon={Hand} x={272} y={121} s={14} />
          <Bar x={290} y={124} w={32} h={8} tone="strong" />
        </g>
        <line x1={12} y1={156} x2={348} y2={156} className="cpt-divider" />
        <ChatFlow x={28} y={170} w={304} cursor={[110, 70]} gid="site-ai-hero-m" />
      </Svg>
    </>
  );
}

/** AI 草稿的光晕描边：芒果、琥珀、浅芒果三色渐变，写作时外圈一明一暗（与官网面板光晕同色） */
function AiRim({ gid, x = 0, y, w, h, rx = 18, at = 45 }: { gid: string; x?: number; y: number; w: number; h: number; rx?: number; at?: number }) {
  return (
    <>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" className="cpt-stop-1" />
          <stop offset="0.55" className="cpt-stop-3" />
          <stop offset="1" className="cpt-stop-2" />
        </linearGradient>
      </defs>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={rx}
        stroke={`url(#${gid})`}
        className="cpt-ai-haze"
        {...m({ a: "keys", prop: "opacity", k: [[0, 0.2], [at, 0.2], [at + 6, 0.55], [at + 12, 0.25], [at + 18, 0.5], [at + 26, 0.3]] })}
      />
      <rect x={x} y={y} width={w} height={h} rx={rx} stroke={`url(#${gid})`} className="cpt-ai-rim" />
    </>
  );
}

/** 对话区：买家来信 34% → 译文 40% → AI 草稿 45% 逐行写出 → 依据 60% → 指针点发送 71% → 草稿换成已发出的消息 75% */
function ChatFlow({ x, y, w, cursor, gid }: { x: number; y: number; w: number; cursor: [number, number]; gid: string }) {
  const bubble = Math.round(w * 0.66);
  const sent = Math.round(w * 0.68);
  return (
    <g transform={`translate(${x} ${y})`}>
      <g {...m({ a: "pop", at: 34, origin: "left" })}>
        <rect width={bubble} height={54} rx={16} className="cpt-sunken" />
        <Bar x={16} y={15} w={Math.round(w * 0.52)} tone="strong" />
        <Bar x={16} y={31} w={Math.round(w * 0.34)} tone="strong" />
      </g>
      <g {...m({ a: "in", at: 40, dx: -8 })}>
        <Icon icon={Languages} x={4} y={64} s={14} tone="link" />
        <Bar x={24} y={68} w={Math.round(w * 0.44)} h={7} tone="link" />
      </g>
      <g {...m({ a: "pop", at: 45, to: 73 })}>
        <rect y={94} width={w} height={196} rx={18} className="cpt-warm" />
        <AiRim gid={gid} y={94} w={w} h={196} />
        <Ai x={18} y={110} />
        <Bar x={50} y={114} w={72} tone="strong" />
        <Bar x={130} y={115} w={48} h={6} />
        <Bar x={18} y={146} w={w - 44} h={9} tone="strong" {...m({ a: "grow", at: 48, d: 4, origin: "left" })} />
        <Bar x={18} y={166} w={w - 80} h={9} tone="strong" {...m({ a: "grow", at: 52, d: 4, origin: "left" })} />
        <Bar x={18} y={186} w={Math.round(w * 0.55)} h={9} tone="strong" {...m({ a: "grow", at: 56, d: 4, origin: "left" })} />
        <g {...m({ a: "pop", at: 60, origin: "left" })}>
          <rect x={18} y={208} width={168} height={26} rx={13} className="cpt-card" />
          <Icon icon={BookOpen} x={28} y={214} s={14} tone="link" />
          <Bar x={50} y={218} w={120} h={7} tone="link" />
        </g>
        <g {...m({ a: "press", at: 71 })}>
          <rect x={18} y={246} width={96} height={32} rx={10} className="cpt-mango" />
          <Icon icon={Send} x={32} y={255} s={14} tone="on-mango" />
          <Bar x={54} y={258} w={44} tone="ink" />
        </g>
        <rect x={124} y={246} width={80} height={32} rx={10} className="cpt-outline" />
        <Icon icon={PenLine} x={136} y={255} s={14} />
        <Bar x={158} y={258} w={34} tone="strong" />
        <Bar x={216} y={258} w={40} />
      </g>
      <g transform="translate(66 262)">
        <g {...m({ a: "cursor", at: 64, d: 6, dx: cursor[0], dy: cursor[1], to: 80, hidden: true })}>
          <Cursor />
        </g>
      </g>
      <g {...m({ a: "pop", at: 75, hidden: true, origin: "right" })}>
        <rect x={w - sent} y={100} width={sent} height={54} rx={16} className="cpt-accent" />
        <Bar x={w - sent + 16} y={115} w={sent - 56} tone="strong" />
        <Bar x={w - sent + 16} y={131} w={Math.round(sent * 0.5)} tone="strong" />
        <Bar x={w - 108} y={168} w={52} h={6} />
        <Icon icon={Languages} x={w - 48} y={163} s={14} tone="link" />
        <Icon icon={CheckCheck} x={w - 26} y={163} s={14} tone="link" />
      </g>
    </g>
  );
}

/* ---------- 功能格 ---------- */

/** 会话按等待时间重排：等得最久的那条升到最前 16%，指针点认领 30–37%，选中 40%，认领人出现 50% */
export function InboxConcept() {
  const rows: { y: number; dy: number; wait: number; warn?: boolean; p: Platform; name: number }[] = [
    { y: 18, dy: 180, wait: 84, warn: true, p: "shopee", name: 96 },
    { y: 78, dy: -60, wait: 46, p: "tiktok", name: 120 },
    { y: 138, dy: -60, wait: 30, p: "shopee", name: 84 },
    { y: 198, dy: -60, wait: 14, p: "tiktok", name: 108 },
  ];
  return (
    <Svg w={520} h={262}>
      <g {...m({ a: "fade", at: 0 })}>
        {rows.map((r, i) => (
          <g key={i} {...m({ a: "move", at: 16, d: 10, dy: r.dy })}>
            <g transform={`translate(16 ${r.y})`}>
              <rect width={488} height={50} rx={12} className="cpt-card" />
              {i === 0 && (
                <g {...m({ a: "fade", at: 40 })}>
                  <rect width={488} height={50} rx={12} className="cpt-accent" />
                  <rect y={10} width={4} height={30} rx={2} className="cpt-caramel" />
                </g>
              )}
              <circle cx={28} cy={25} r={14} className="cpt-sunken" />
              <Icon icon={UserRound} x={21} y={18} s={14} />
              <Bar x={52} y={13} w={r.name} tone="strong" />
              <Icon icon={PLATFORM_ICON[r.p]} x={52} y={27} s={11} />
              <Bar x={68} y={30} w={56} h={6} />
              <Icon icon={r.warn ? TriangleAlert : Clock} x={236} y={17} s={15} tone={r.warn ? "warn" : "ink"} />
              <Bar x={258} y={21} w={r.wait} tone={r.warn ? "warn" : "soft"} />
              {i === 0 && (
                <>
                  <g {...m({ a: "pop", at: 26, to: 46, hidden: true })}>
                    <g {...m({ a: "press", at: 37 })}>
                      <rect x={400} y={12} width={76} height={26} rx={13} className="cpt-outline" />
                      <Icon icon={Hand} x={412} y={18} s={14} />
                      <Bar x={432} y={21} w={32} h={7} tone="strong" />
                    </g>
                  </g>
                  <g {...m({ a: "pop", at: 50 })}>
                    <circle cx={460} cy={25} r={14} className="cpt-card" />
                    <Icon icon={UserCheck} x={453} y={18} s={14} tone="link" />
                  </g>
                </>
              )}
            </g>
          </g>
        ))}
      </g>
      <g transform="translate(440 43)">
        <g {...m({ a: "cursor", at: 30, d: 6, dx: 50, dy: 90, to: 46, hidden: true })}>
          <Cursor />
        </g>
      </g>
    </Svg>
  );
}

/** 资料汇入 AI：三路来源 6–22%，AI 起草 28–47%，依据亮起 54%（对应的来源同时描边） */
export function DraftConcept() {
  const sources = [MessageSquareText, FileText, BookOpen];
  return (
    <Svg w={520} h={260}>
      {sources.map((I, i) => {
        const cy = 48 + i * 82;
        const wire = `M152 ${cy} C 176 ${cy}, 170 130, 192 130`;
        return (
          <g key={i}>
            <Wire d={wire} />
            <Packet d={wire} at={6 + i * 4} len={8} />
            <rect x={16} y={cy - 22} width={136} height={44} rx={12} className="cpt-card" />
            <Icon icon={I} x={30} y={cy - 8} tone="link" />
            <Bar x={56} y={cy - 4} w={i === 1 ? 64 : 80} tone="strong" />
            {i === 2 && <rect x={16} y={cy - 22} width={136} height={44} rx={12} className="cpt-ring" {...m({ a: "fade", at: 54 })} />}
          </g>
        );
      })}
      <Wire d="M244 130 H 280" />
      <Packet d="M244 130 H 280" at={24} len={5} />
      <g {...m({ a: "press", at: 20, v: 1.12 })}>
        <circle cx={218} cy={130} r={26} className="cpt-cocoa" />
        <text x={218} y={135} textAnchor="middle" fontSize={14} className="cpt-on-inverse">
          AI
        </text>
      </g>
      <g {...m({ a: "pop", at: 28 })}>
        <rect x={280} y={22} width={224} height={216} rx={16} className="cpt-warm" />
        <AiRim gid="site-ai-draft" x={280} y={22} w={224} h={216} rx={16} at={28} />
        <Ai x={296} y={38} />
        <Bar x={328} y={42} w={60} tone="strong" />
        <Bar x={296} y={74} w={188} tone="strong" {...m({ a: "grow", at: 32, d: 5, origin: "left" })} />
        <Bar x={296} y={92} w={172} tone="strong" {...m({ a: "grow", at: 37, d: 5, origin: "left" })} />
        <Bar x={296} y={110} w={116} tone="strong" {...m({ a: "grow", at: 42, d: 5, origin: "left" })} />
        <g {...m({ a: "pop", at: 54, origin: "left" })}>
          <rect x={296} y={134} width={150} height={26} rx={13} className="cpt-card" />
          <Icon icon={BookOpen} x={306} y={140} s={14} tone="link" />
          <Bar x={326} y={144} w={104} h={7} tone="link" />
        </g>
        <rect x={296} y={184} width={80} height={32} rx={10} className="cpt-mango" />
        <Icon icon={Send} x={309} y={193} s={14} tone="on-mango" />
        <Bar x={330} y={196} w={34} tone="ink" />
        <rect x={384} y={184} width={64} height={32} rx={10} className="cpt-outline" />
        <Icon icon={PenLine} x={396} y={193} s={14} />
        <Bar x={416} y={196} w={22} tone="strong" />
      </g>
    </Svg>
  );
}

/** 翻译：买家外语消息 6% → 译文 16% → 客服用自己的语言写 32% → 发送前译成买家的语言 58% */
export function TranslateConcept() {
  return (
    <Svg w={340} h={200}>
      <g {...m({ a: "pop", at: 6, origin: "left" })}>
        <rect x={16} y={16} width={212} height={52} rx={16} className="cpt-card" />
        <Segs x={30} y={29} ws={[28, 18, 36, 22, 30]} />
        <Segs x={30} y={45} ws={[22, 34, 26]} />
      </g>
      <g {...m({ a: "in", at: 16, dx: -8 })}>
        <Icon icon={Languages} x={20} y={78} s={14} tone="link" />
        <Bar x={40} y={82} w={150} h={7} tone="link" {...m({ a: "grow", at: 18, d: 6, origin: "left" })} />
      </g>
      <g {...m({ a: "pop", at: 32, to: 54, hidden: true, origin: "right" })}>
        <rect x={112} y={112} width={212} height={52} rx={16} className="cpt-dashed" />
        <Bar x={126} y={125} w={150} tone="strong" {...m({ a: "grow", at: 36, d: 5, origin: "left" })} />
        <Bar x={126} y={141} w={96} tone="strong" {...m({ a: "grow", at: 41, d: 4, origin: "left" })} />
      </g>
      <g {...m({ a: "pop", at: 50, to: 58, hidden: true })}>
        <circle cx={218} cy={138} r={16} className="cpt-card" />
        <Icon icon={Languages} x={211} y={131} s={14} tone="link" />
      </g>
      <g {...m({ a: "pop", at: 58, origin: "right" })}>
        <rect x={112} y={112} width={212} height={52} rx={16} className="cpt-accent" />
        <Segs x={126} y={125} ws={[30, 22, 40, 26, 30]} />
        <Segs x={126} y={141} ws={[26, 36, 20]} />
      </g>
      <g {...m({ a: "in", at: 62 })}>
        <Bar x={210} y={176} w={64} h={6} />
        <Icon icon={Languages} x={282} y={171} s={14} tone="link" />
        <Icon icon={CheckCheck} x={304} y={171} s={14} tone="link" />
      </g>
    </Svg>
  );
}

/** 飞书：待认领卡片滑入 6%，铃铛晃 14%，指针点认领 28–37%，按钮变成已认领 40%，会话出现在工作台 46% */
export function FeishuConcept() {
  return (
    <Svg w={340} h={236}>
      <g {...m({ a: "in", at: 6, dy: -16 })}>
        <rect x={20} y={14} width={300} height={136} rx={14} className="cpt-card" />
        <g transform="translate(36 28)">
          <g className="cpt-link" {...m({ a: "wiggle", at: 14, origin: "top" })}>
            <Bell size={16} />
          </g>
        </g>
        <Bar x={60} y={32} w={110} tone="strong" />
        <Icon icon={ShoppingBag} x={36} y={54} s={12} />
        <Bar x={54} y={57} w={72} h={6} />
        <Ai x={36} y={78} />
        <Bar x={68} y={82} w={196} tone="strong" />
        <Bar x={68} y={98} w={140} tone="strong" />
        <g {...m({ a: "press", at: 37 })}>
          <rect x={236} y={114} width={72} height={26} rx={8} className="cpt-mango" />
          <Icon icon={Hand} x={246} y={120} s={13} tone="on-mango" />
          <Bar x={264} y={124} w={34} h={6} tone="ink" />
        </g>
        <g {...m({ a: "fade", at: 40 })}>
          <rect x={236} y={114} width={72} height={26} rx={8} className="cpt-sunken" />
          <Icon icon={Check} x={246} y={120} s={13} tone="ok" />
          <Bar x={264} y={124} w={34} h={6} />
        </g>
      </g>
      <Wire d="M272 140 V 168" />
      <Packet d="M272 140 V 168" at={42} len={4} />
      <g {...m({ a: "pop", at: 46 })}>
        <rect x={20} y={168} width={300} height={56} rx={14} className="cpt-card" />
        <circle cx={48} cy={196} r={14} className="cpt-sunken" />
        <Icon icon={UserRound} x={41} y={189} s={14} />
        <Bar x={72} y={184} w={96} tone="strong" />
        <Bar x={72} y={201} w={150} h={6} />
        <Icon icon={UserCheck} x={288} y={188} tone="link" />
      </g>
      <g transform="translate(272 127)">
        <g {...m({ a: "cursor", at: 28, d: 7, dx: 40, dy: 70, to: 58, hidden: true })}>
          <Cursor />
        </g>
      </g>
    </Svg>
  );
}

/** 富媒体：图片 6%、视频 14%、商品卡 24%、优惠券 34% 依次发出 */
export function MediaConcept() {
  return (
    <Svg w={340} h={236}>
      <g {...m({ a: "pop", at: 6, origin: "right" })}>
        <rect x={88} y={12} width={112} height={76} rx={14} className="cpt-decor" />
        <Icon icon={ImageIcon} x={133} y={39} s={22} />
      </g>
      <g {...m({ a: "pop", at: 14, origin: "right" })}>
        <rect x={208} y={12} width={116} height={76} rx={14} className="cpt-cocoa" />
        <circle cx={266} cy={50} r={17} className="cpt-card" />
        <Icon icon={Play} x={260} y={43} s={14} />
      </g>
      <g {...m({ a: "pop", at: 24, origin: "right" })}>
        <rect x={124} y={100} width={200} height={60} rx={14} className="cpt-card" />
        <rect x={134} y={110} width={40} height={40} rx={10} className="cpt-decor" />
        <Icon icon={Package} x={145} y={121} s={18} />
        <Bar x={184} y={114} w={110} tone="strong" />
        <Bar x={184} y={129} w={70} h={6} />
        <Bar x={184} y={142} w={40} tone="link" />
      </g>
      <g {...m({ a: "pop", at: 34, origin: "right" })}>
        <rect x={164} y={172} width={160} height={50} rx={12} className="cpt-voucher" />
        <Icon icon={Ticket} x={178} y={188} s={18} tone="link" />
        <Bar x={206} y={186} w={90} tone="strong" />
        <Bar x={206} y={201} w={60} h={6} />
      </g>
    </Svg>
  );
}

/* ---------- HTML 概念图：要换行的标签用 HTML 写 ---------- */

/** HTML 里的灰色文字条 */
export function Line({ w, tone, className }: { w?: string; tone?: "strong"; className?: string }) {
  return <span className={cn("site-bar", tone === "strong" && "site-bar-strong", className)} style={w ? ({ width: w } as CSSProperties) : undefined} />;
}

function AiChip() {
  return <span className="inline-flex h-4 items-center rounded-sm bg-(--semantic-color-surface-inverse) px-1 text-[0.625rem] font-semibold text-(--semantic-color-text-on-inverse)">AI</span>;
}

/** 接待档位一栏里的小对话：第 i 档在一轮的第 i 个四分之一浮成白卡，回复轻轻弹一下 */
export function ModeChat({ tier, label, accept, at }: { tier: string; label: string; accept: string; at: number }) {
  return (
    <div aria-hidden="true" className="relative mt-5 flex flex-1 flex-col gap-2 rounded-(--semantic-radius-md) bg-muted p-4">
      <span className="site-mode-on absolute inset-0 rounded-[inherit]" {...m({ a: "fade", at, to: at + 23, hidden: true })} />
      <span className="relative flex w-3/4 flex-col gap-1.5 self-start rounded-xl border border-border bg-card px-3 py-2.5">
        <Line w="90%" tone="strong" />
        <Line w="55%" tone="strong" />
      </span>
      <div className="relative flex w-4/5 flex-col items-end gap-1 self-end" {...m({ a: "press", at: at + 2, v: 1.05, origin: "right" })}>
        {tier === "assist" ? (
          <span className="flex w-full flex-col gap-1.5 rounded-xl bg-(--semantic-color-surface-warm) p-3">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <AiChip />
              {label}
            </span>
            <Line w="90%" tone="strong" />
            <Line w="60%" tone="strong" />
            <span className="mt-1 inline-flex h-6 w-fit items-center rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground">{accept}</span>
          </span>
        ) : (
          <>
            <span className={cn("flex w-full flex-col gap-1.5 rounded-xl px-3 py-2.5", tier === "shadow" ? "border border-dashed border-input" : "bg-accent")}>
              <Line w="85%" tone={tier === "shadow" ? undefined : "strong"} />
              <Line w="50%" tone={tier === "shadow" ? undefined : "strong"} />
            </span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {tier === "auto" && <AiChip />}
              {label}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

const ORDER_ICONS = [ShoppingCart, Truck, Undo2, BadgeCheck, ClipboardList];
const ORDER_BARS = ["48%", "64%", "56%", "40%", "52%"];

/** 订单售后：五步依次点亮（6%、22%、38%、54%、70%），退货申请旁的截止时间在同意退款前倒数，最后冒出工单 74% */
export function OrdersConcept({ copy }: { copy: SiteCopy }) {
  const c = copy.concept;
  const lit = (i: number) => 6 + i * 16;
  return (
    <ol className="flex flex-col gap-6">
      {c.orderSteps.map((label, i) => {
        const StepIcon = ORDER_ICONS[i];
        return (
          <li key={label} className="relative flex min-h-10 items-center gap-4">
            {i < 4 && (
              <span className="absolute top-10 left-[19px] h-6 w-0.5 overflow-hidden rounded-full bg-border">
                <span className="absolute inset-0 rounded-full bg-primary" {...m({ a: "grow-y", at: lit(i) + 2, d: 12, origin: "top" })} />
              </span>
            )}
            <span className="relative flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-card">
              <span className="absolute inset-0 rounded-full bg-accent ring-2 ring-(--semantic-color-text-link)" {...m({ a: "fade", at: lit(i) })} />
              <StepIcon className="relative size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{label}</p>
              <Line w={ORDER_BARS[i]} className="mt-1.5" />
            </div>
            {i === 2 && (
              <span className="flex shrink-0 items-center gap-1.5 text-xs text-(--semantic-color-feedback-warning)" {...m({ a: "pop", at: lit(2) + 2 })}>
                <TriangleAlert className="size-3.5" />
                {c.deadline}
                <svg viewBox="0 0 20 20" className="size-5 -rotate-90" aria-hidden="true">
                  <circle cx="10" cy="10" r="8" className="cpt-track" />
                  <circle cx="10" cy="10" r="8" pathLength={100} className="cpt-countdown" {...m({ a: "drain", at: lit(2) + 2, to: lit(3), v: 40 })} />
                </svg>
              </span>
            )}
            {i === 3 && (
              <span className="shrink-0" {...m({ a: "pop", at: lit(3) + 2 })}>
                <CircleCheck className="size-5 text-(--semantic-color-feedback-success)" />
              </span>
            )}
            {i === 4 && (
              <span className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-2.5" {...m({ a: "pop", at: lit(4) + 4 })}>
                <ClipboardList className="size-3.5 text-(--semantic-color-text-link)" />
                <Line className="w-10" />
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

const BRANCH_ICONS = [Truck, ClipboardList, Headset];

/** 经验卡：先查订单状态，一轮里依次走三种情况（每段 30%）：小圆点沿主干落下，命中的情况与处理亮起 */
export function KnowledgeConcept({ copy }: { copy: SiteCopy }) {
  const c = copy.knowledge.card;
  const [first, ...branches] = c.steps;
  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-(--semantic-color-text-link)">
          <BookOpen className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">
            {c.label} · {c.scope}
          </p>
          <p className="font-semibold">{c.title}</p>
        </div>
      </div>
      <div className="mt-6 flex flex-col items-center">
        <p className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium">
          <Search className="size-4 text-(--semantic-color-text-link)" />
          {first.text}
        </p>
        <div className="relative h-8 w-0.5 bg-border">
          {[0, 30, 60].map((t) => (
            <span key={t} className="absolute bottom-0 -left-[3px] size-2 rounded-full bg-(--semantic-color-text-link)" {...m({ a: "in", at: t + 2, to: t + 28, d: 6, dy: -24, hidden: true })} />
          ))}
        </div>
        <div className="relative grid w-full grid-cols-3 gap-3">
          <span className="absolute top-0 right-[16.667%] left-[16.667%] h-0.5 bg-border" />
          {branches.map((b, i) => {
            const t = i * 30;
            const BranchIcon = BRANCH_ICONS[i];
            return (
              <div key={b.text} className="relative flex flex-col items-center pt-5">
                <span className="absolute top-0 h-5 w-0.5 bg-border" />
                <p className="relative rounded-full border border-border bg-card px-2.5 py-1 text-center text-xs">
                  <span className="absolute inset-0 rounded-full bg-accent ring-1 ring-(--semantic-color-text-link)" {...m({ a: "fade", at: t + 6, to: t + 28, hidden: true })} />
                  <span className="relative">{b.text}</span>
                </p>
                <span className="h-4 w-0.5 bg-border" />
                <div className="relative flex w-full flex-1 flex-col items-center gap-2 rounded-lg border border-border bg-card p-3 text-center text-xs">
                  <span className="absolute inset-0 rounded-[inherit] bg-accent ring-1 ring-(--semantic-color-text-link)" {...m({ a: "fade", at: t + 9, to: t + 28, hidden: true })} />
                  <BranchIcon className="relative size-4 text-(--semantic-color-text-link)" />
                  <span className="relative">{b.branch}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
