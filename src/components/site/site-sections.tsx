import type { CSSProperties, ReactNode } from "react";
import {
  BookOpen,
  ChartColumn,
  ClipboardList,
  GraduationCap,
  Hand,
  KeyRound,
  type LucideIcon,
  MessageSquareText,
  Package,
  Receipt,
  ScrollText,
  Store,
  Trash2,
  Truck,
  Undo2,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DraftConcept, FeishuConcept, InboxConcept, KnowledgeConcept, MediaConcept, ModeChat, OrdersConcept, TranslateConcept, m } from "./concepts";
import type { SiteCopy } from "./content";
import { MotionToggle } from "./site-motion";

/** 全站自动播放动画的暂停按钮：首屏演示下方一个，每个功能格标题行一个 */
export function Toggle({ copy, className }: { copy: SiteCopy; className?: string }) {
  return <MotionToggle pauseLabel={copy.concept.pause} playLabel={copy.concept.play} className={className} />;
}

/** 区块背后的光晕：径向渐变；带 site-drift 的允许动效时缓慢漂移（brand/DESIGN.md 官网例外） */
export function Glow({ tone = "mango", className, style }: { tone?: "mango" | "caramel"; className: string; style?: CSSProperties }) {
  return <div aria-hidden="true" data-tone={tone} className={cn("site-glow", className)} style={style} />;
}

/** 区块标题：小标题 + 大标题 + 导语，左对齐（VIS-004），导语限宽（VIS-013）；half 用在只占半栏的左文右图区块，宽屏不放到 64px */
function SectionHeading({ eyebrow, title, lead, half }: { eyebrow: string; title: string; lead: string; half?: boolean }) {
  return (
    <div className="site-reveal max-w-4xl">
      <p className="text-sm font-semibold text-(--semantic-color-text-link)">{eyebrow}</p>
      <h2 className={cn("site-headline mt-3", half && "site-headline-half")}>{title}</h2>
      <p className="site-lead mt-5 max-w-2xl text-muted-foreground">{lead}</p>
    </div>
  );
}

/** 功能格：白色大圆角卡片，滚进视口时微微放大浮现；下半是自动循环的概念动画（对辅助技术是一张带说明的图） */
function Tile({ copy, title, body, label, className, children, extra }: { copy: SiteCopy; title: string; body: string; label: string; className?: string; children: ReactNode; extra?: ReactNode }) {
  return (
    <div className={cn("site-tile site-tile-in flex flex-col p-7 lg:p-9", className)}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="site-tile-title">{title}</h3>
        <Toggle copy={copy} className="-mt-1 -mr-2 shrink-0" />
      </div>
      <p className="mt-3 max-w-prose text-base text-muted-foreground">{body}</p>
      <div className="mt-8 flex flex-1 flex-col justify-end">
        <figure role="img" aria-label={label} data-concept="0" className="rounded-(--semantic-radius-lg) bg-background p-3 sm:p-4">
          {children}
        </figure>
      </div>
      {extra}
    </div>
  );
}

export function FeaturesSection({ copy }: { copy: SiteCopy }) {
  const f = copy.features;
  const c = copy.concept;
  return (
    <section id="features" className="site-section bg-muted">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading eyebrow={copy.nav.features} title={f.title} lead={f.lead} />
        <div className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-6">
          <Tile copy={copy} title={f.inbox.title} body={f.inbox.body} label={c.inbox} className="lg:col-span-3">
            <InboxConcept />
          </Tile>
          <Tile
            copy={copy}
            title={f.draft.title}
            body={f.draft.body}
            label={c.draft}
            className="lg:col-span-3"
            extra={
              <div className="mt-6">
                <p className="text-xs text-muted-foreground">{f.draft.handoffLabel}</p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {f.draft.handoffChips.map((t) => (
                    <li key={t} className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-xs">
                      <Hand className="size-3.5 text-(--semantic-color-text-link)" />
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            }
          >
            <DraftConcept />
          </Tile>
          <Tile copy={copy} title={f.translate.title} body={f.translate.body} label={c.translate} className="lg:col-span-2">
            <TranslateConcept />
          </Tile>
          <Tile copy={copy} title={f.feishu.title} body={f.feishu.body} label={c.feishu} className="lg:col-span-2">
            <FeishuConcept />
          </Tile>
          <Tile copy={copy} title={f.media.title} body={f.media.body} label={c.media} className="md:col-span-2 lg:col-span-2">
            <MediaConcept />
          </Tile>
        </div>
      </div>
    </section>
  );
}

/** 接待档位：跟着滚动，四档的进度条依次填满，对应那一档的小对话浮起、回复冒出 */
export function ModesSection({ copy }: { copy: SiteCopy }) {
  const modes = copy.modes;
  return (
    <section id="modes" className="site-section relative isolate">
      <Glow tone="caramel" className="top-1/4 -right-96" />
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading eyebrow={copy.nav.modes} title={modes.title} lead={modes.lead} />
        <ol data-scrub="view" data-range="0.8,0.2" data-span="0,1,0,90" className="mt-14 grid gap-x-6 gap-y-10 md:grid-cols-2 lg:grid-cols-4">
          {modes.tiers.map((t, i) => (
            <li key={t.key} className="flex flex-col">
              <div className="relative h-1 overflow-hidden rounded-full bg-border">
                <span className="absolute inset-0 rounded-full bg-primary" {...m({ a: "grow", at: i * 23, d: 20, origin: "left" })} />
              </div>
              <p className="mt-5 text-sm font-semibold text-muted-foreground tabular-nums">0{i + 1}</p>
              <h3 className="site-tile-title mt-1">{t.name}</h3>
              <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
                <dt className="text-muted-foreground">{modes.aiLabel}</dt>
                <dd>{t.ai}</dd>
                <dt className="text-muted-foreground">{modes.agentLabel}</dt>
                <dd>{t.agent}</dd>
              </dl>
              <ModeChat tier={t.key} label={t.sampleLabel} accept={modes.accept} at={i * 23} />
            </li>
          ))}
        </ol>
        <p className="site-reveal mt-8 max-w-3xl text-sm text-muted-foreground">{modes.note}</p>
      </div>
    </section>
  );
}

/** 左文右图的说明区：条目一行一个能力，插图是一张白色大卡片，跟着滚动演一遍 */
function SplitSection({
  id,
  eyebrow,
  title,
  lead,
  items,
  label,
  figure,
  reverse,
  glow,
}: {
  id: string;
  eyebrow: string;
  title: string;
  lead: string;
  items: { icon: LucideIcon; title: string; body: string }[];
  label: string;
  figure: ReactNode;
  reverse?: boolean;
  glow: ReactNode;
}) {
  return (
    <section id={id} className="site-section relative isolate">
      {glow}
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 lg:grid-cols-2 lg:gap-16">
        <div className={cn(reverse && "lg:order-2")}>
          <SectionHeading eyebrow={eyebrow} title={title} lead={lead} half />
          <ul className="mt-10 flex flex-col gap-6">
            {items.map(({ icon: Icon, title: t, body }) => (
              <li key={t} className="site-reveal flex gap-4">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-(--semantic-color-text-link)">
                  <Icon className="size-4" />
                </span>
                <div>
                  <h3 className="font-semibold">{t}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <figure role="img" aria-label={label} data-scrub="view" data-range="0.85,0.25" data-span="0,1,0,86" className="site-tile site-tile-raised site-tile-in p-6 sm:p-8">
          {figure}
        </figure>
      </div>
    </section>
  );
}

export function OrdersSection({ copy }: { copy: SiteCopy }) {
  const o = copy.orders;
  return (
    <SplitSection
      id="orders"
      eyebrow={copy.nav.orders}
      title={o.title}
      lead={o.lead}
      items={[
        { icon: Truck, ...o.items.order },
        { icon: Undo2, ...o.items.refund },
        { icon: Receipt, ...o.items.invoice },
        { icon: ClipboardList, ...o.items.ticket },
      ]}
      label={copy.concept.orders}
      figure={<OrdersConcept copy={copy} />}
      glow={<Glow className="top-1/3 -right-96" />}
    />
  );
}

export function KnowledgeSection({ copy }: { copy: SiteCopy }) {
  const k = copy.knowledge;
  return (
    <SplitSection
      id="knowledge"
      eyebrow={copy.nav.knowledge}
      title={k.title}
      lead={k.lead}
      items={[
        { icon: MessageSquareText, ...k.items.qa },
        { icon: Package, ...k.items.products },
        { icon: BookOpen, ...k.items.cards },
        { icon: GraduationCap, ...k.items.learn },
      ]}
      label={copy.concept.knowledge}
      figure={<KnowledgeConcept copy={copy} />}
      reverse
      glow={<Glow tone="caramel" className="top-1/4 -left-96" />}
    />
  );
}

export function SecuritySection({ copy }: { copy: SiteCopy }) {
  const s = copy.security;
  const items = [
    { icon: Users, ...s.items.roles },
    { icon: Store, ...s.items.shops },
    { icon: KeyRound, ...s.items.twoFactor },
    { icon: ScrollText, ...s.items.audit },
    { icon: ChartColumn, ...s.items.dashboard },
    { icon: Trash2, ...s.items.retention },
  ];
  return (
    <section id="security" className="site-section bg-muted">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading eyebrow={copy.nav.security} title={s.title} lead={s.lead} />
        <ul className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(({ icon: Icon, title, body }) => (
            <li key={title} className="site-tile site-tile-in p-7">
              <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-(--semantic-color-text-link)">
                <Icon className="size-5" />
              </span>
              <h3 className="mt-5 text-lg font-bold">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
