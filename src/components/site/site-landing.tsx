import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { ArrowRight, Music2, ShoppingBag } from "lucide-react";
import { Lockup, Symbol } from "@/components/brand/logo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { HeroConcept, m } from "./concepts";
import { LOCALE_PATH, SITE_COPY, SITE_URL, type Locale, type SiteCopy } from "./content";
import { SiteMotion } from "./site-motion";
import { FeaturesSection, Glow, KnowledgeSection, ModesSection, OrdersSection, SecuritySection, Toggle } from "./site-sections";
import "./site.css";

/** 官网首页（REQ-SITE-001、PAGE-SITE）：中文在 /，英文在 /en，两版同一结构、只换文案 */
export function SiteLanding({ locale }: { locale: Locale }) {
  const copy = SITE_COPY[locale];
  return (
    <div lang={copy.htmlLang} className="site-root min-h-dvh bg-background text-foreground">
      <SiteMotion />
      <SiteHeader copy={copy} locale={locale} />
      <main>
        <Hero copy={copy} />
        <Story copy={copy} />
        <Statement copy={copy} />
        <FeaturesSection copy={copy} />
        <ModesSection copy={copy} />
        <OrdersSection copy={copy} />
        <KnowledgeSection copy={copy} />
        <SecuritySection copy={copy} />
        <Closing copy={copy} />
      </main>
      <SiteFooter copy={copy} locale={locale} />
    </div>
  );
}

export function siteMetadata(locale: Locale): Metadata {
  const { meta } = SITE_COPY[locale];
  const url = new URL(LOCALE_PATH[locale], SITE_URL).toString();
  return {
    title: { absolute: meta.title },
    description: meta.description,
    alternates: {
      canonical: url,
      languages: { "zh-CN": new URL(LOCALE_PATH.zh, SITE_URL).toString(), en: new URL(LOCALE_PATH.en, SITE_URL).toString(), "x-default": new URL(LOCALE_PATH.zh, SITE_URL).toString() },
    },
    openGraph: { type: "website", siteName: "Shopilot", title: meta.title, description: meta.description, url, locale: meta.ogLocale },
  };
}

function delay(ms: number): CSSProperties {
  return { "--site-delay": `${ms}ms` } as CSSProperties;
}

const LANGUAGE_LINKS: { locale: Locale; label: string; hrefLang: string }[] = [
  { locale: "zh", label: "中文", hrefLang: "zh-CN" },
  { locale: "en", label: "EN", hrefLang: "en" },
];

/** 语言切换：两个普通链接，当前语言标 aria-current */
function LanguageSwitch({ copy, locale }: { copy: SiteCopy; locale: Locale }) {
  return (
    <nav aria-label={copy.nav.languages} className="flex items-center rounded-full border border-input p-0.5">
      {LANGUAGE_LINKS.map((l) => (
        <a
          key={l.locale}
          href={LOCALE_PATH[l.locale]}
          hrefLang={l.hrefLang}
          lang={l.hrefLang}
          aria-current={l.locale === locale ? "page" : undefined}
          className={cn("state-layer focus-ring inline-flex h-7 items-center rounded-full px-2.5 text-sm font-medium", l.locale === locale ? "bg-accent text-(--semantic-color-text-link)" : "text-muted-foreground")}
        >
          {l.label}
        </a>
      ))}
    </nav>
  );
}

/** 顶栏：浮在页面上的玻璃胶囊（官网例外，见 brand/DESIGN.md） */
function SiteHeader({ copy, locale }: { copy: SiteCopy; locale: Locale }) {
  const anchors = [
    ["#features", copy.nav.features],
    ["#modes", copy.nav.modes],
    ["#orders", copy.nav.orders],
    ["#knowledge", copy.nav.knowledge],
    ["#security", copy.nav.security],
  ];
  return (
    <header className="fixed inset-x-0 top-0 z-30 px-3 pt-3 sm:px-4 sm:pt-4">
      <div className="site-glass mx-auto flex h-14 max-w-6xl items-center gap-4 rounded-full pr-2 pl-5 lg:gap-6">
        <a href={LOCALE_PATH[locale]} className="focus-ring shrink-0 rounded-sm">
          <Lockup />
        </a>
        <nav aria-label={copy.nav.label} className="hidden flex-1 items-center justify-center gap-1 lg:flex">
          {anchors.map(([href, label]) => (
            <a key={href} href={href} className="state-layer focus-ring inline-flex h-9 items-center rounded-full px-3 text-sm font-medium text-muted-foreground">
              {label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <LanguageSwitch copy={copy} locale={locale} />
          <a href="/login" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "rounded-full")}>
            {copy.nav.login}
          </a>
        </div>
      </div>
    </header>
  );
}

/** 首屏：居中大标题（VIS-004 允许 hero 居中），两行依次浮现，重点词是渐变字；背后两团光晕缓慢漂移 */
function Hero({ copy }: { copy: SiteCopy }) {
  const h = copy.hero;
  const [before, after] = h.title[1].split(h.titleMark);
  return (
    <section className="relative isolate px-6 pt-32 text-center sm:pt-40 lg:pt-44">
      <Glow className="site-drift -top-[30rem] left-1/2 -translate-x-full" />
      <Glow tone="caramel" className="site-drift top-0 -right-80" style={delay(-12000)} />
      <p className="site-enter inline-flex min-h-8 items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1 text-sm font-medium">
        <span className="site-ping relative size-2 shrink-0 rounded-full bg-primary" />
        {h.kicker}
      </p>
      <h1 className="site-hero mx-auto mt-6 max-w-5xl">
        <span className="site-rise block" style={delay(80)}>
          {h.title[0]}
        </span>
        <span className="site-rise block" style={delay(160)}>
          {before}
          <span className="site-gradient">{h.titleMark}</span>
          {after}
        </span>
      </h1>
      <p className="site-lead site-enter mx-auto mt-6 max-w-2xl text-muted-foreground" style={delay(240)}>
        {h.lead}
      </p>
      <div className="site-enter mt-10 flex flex-wrap items-center justify-center gap-3" style={delay(320)}>
        <a href="/login" className={cn(buttonVariants({ size: "lg" }), "rounded-full px-6")}>
          {h.login}
          <ArrowRight />
        </a>
        <a href="#features" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "rounded-full px-6")}>
          {h.tour}
        </a>
      </div>
    </section>
  );
}

/* 首屏演示的滚动进度（百分比）：区块进入视口到 24% 时面板立起并吸住；28%–95% 演完插图时间轴 0–84%；
   字幕按插图里的四段切换：消息汇入 0–31、买家消息与译文 31–46、AI 草稿与依据 46–65、发送 65–84 */
const STORY_STEPS: [number, number][] = [
  [18, 53],
  [53, 65],
  [65, 80],
  [80, 100],
];
const TILT = m({
  a: "keys",
  track: "p",
  k: [
    [0, "translate3d(0, 8%, 0) rotateX(20deg) scale(0.9)"],
    [24, "translate3d(0, 0, 0) rotateX(0deg) scale(1)"],
  ],
});
const ZOOM = m({
  a: "keys",
  track: "p",
  k: [
    [64, "scale(1)"],
    [69, "scale(1.1)"],
    [86, "scale(1.1)"],
    [90, "scale(1)"],
  ],
});

/** 字幕 i 在自己那一段里显示，前后各用 2% 的进度淡入淡出；最后一句留到区块结束 */
function captionFade(i: number) {
  const [a, b] = STORY_STEPS[i];
  const k: [number, number][] = i === STORY_STEPS.length - 1 ? [[a, 0], [a + 2, 1]] : [[a, 0], [a + 2, 1], [b - 2, 1], [b, 0]];
  return m({ a: "keys", track: "p", prop: "opacity", k });
}
function captionMove(i: number) {
  const [a, b] = STORY_STEPS[i];
  const enter: [number, string][] = [
    [a, "translateY(0.5em)"],
    [a + 3, "translateY(0em)"],
  ];
  return m({ a: "keys", track: "p", k: i === STORY_STEPS.length - 1 ? enter : [...enter, [b - 2, "translateY(0em)"], [b, "translateY(-0.5em)"]] });
}

/** 没有 JS 时滚动驱动不会发生：退回静止版（面板下列出四步） */
const NO_SCRIPT_STORY = `.site-story{height:auto!important}.site-story-stage{position:static!important;height:auto!important}.site-story-frame{width:100%!important}.site-story-caps>li{grid-area:auto!important;opacity:1!important}.site-story-steps{display:none!important}`;

/** 首屏演示：一块玻璃面板跟着滚动演完一条消息的处理，字幕在下面轮换（滚动驱动，见 site-motion.tsx） */
function Story({ copy }: { copy: SiteCopy }) {
  const s = copy.story;
  return (
    <section aria-label={s.label} className="site-story" data-scrub="pin" data-span="0.28,0.95,0,84">
      <noscript>
        <style>{NO_SCRIPT_STORY}</style>
      </noscript>
      <div className="site-story-stage px-3 sm:px-6">
        <div className="site-story-frame">
          <div className="site-story-tilt" {...TILT}>
            <div className="site-story-zoom" {...ZOOM}>
              <div className="site-aura">
                <figure role="img" aria-label={copy.concept.hero} className="site-glass-raised relative rounded-(--semantic-site-radius-tile) bg-background p-3 sm:p-5 lg:p-6">
                  <span aria-hidden="true" className="site-rim" />
                  <HeroConcept copy={copy} />
                </figure>
              </div>
            </div>
          </div>
        </div>
        <div className="flex w-full flex-col items-center gap-5">
          <ol className="site-story-caps px-3">
            {s.steps.map((t, i) => (
              <li key={t} {...captionFade(i)}>
                <p className="site-story-cap" {...captionMove(i)}>
                  <span className="site-story-num mb-1 block text-sm font-medium text-(--semantic-color-text-link) tabular-nums">0{i + 1}</span>
                  {t}
                </p>
              </li>
            ))}
          </ol>
          <div className="flex items-center gap-4">
            <div aria-hidden="true" className="site-story-steps items-center gap-2">
              {STORY_STEPS.map(([a, b]) => (
                <span key={a} className="relative h-1 w-10 overflow-hidden rounded-full bg-border">
                  <span
                    className="absolute inset-0 rounded-full bg-primary"
                    {...m({
                      a: "keys",
                      track: "p",
                      origin: "left",
                      k: [
                        [a, "scaleX(0)"],
                        [b, "scaleX(1)"],
                      ],
                    })}
                  />
                </span>
              ))}
            </div>
            <Toggle copy={copy} />
          </div>
        </div>
      </div>
    </section>
  );
}

/** 中文逐字点亮，标点并进前一个字；英文逐词 */
function splitWords(text: string, zh: boolean) {
  if (!zh) return text.split(/(?<=\s)/);
  const out: string[] = [];
  for (const ch of text) {
    if (/[，。、；：！？]/.test(ch) && out.length) out[out.length - 1] += ch;
    else out.push(ch);
  }
  return out;
}

/** 一段大字陈述，随滚动逐字点亮（读屏读隐藏的整段原文）；下面是接入的平台与站点 */
function Statement({ copy }: { copy: SiteCopy }) {
  const p = copy.platforms;
  const words = splitWords(copy.statement, copy.htmlLang.startsWith("zh"));
  const icons = [ShoppingBag, Music2];
  return (
    <section aria-labelledby="site-platforms" className="site-section">
      <div className="mx-auto max-w-6xl px-6">
        <p className="sr-only">{copy.statement}</p>
        <p aria-hidden="true" className="site-statement max-w-5xl" data-scrub="view" data-range="0.85,0.35">
          {words.map((w, i) => (
            <span key={i} {...m({ a: "lit", at: (i / words.length) * 90, d: 10 })}>
              {w}
            </span>
          ))}
        </p>
        <h2 id="site-platforms" className="site-reveal mt-16 text-sm font-medium text-muted-foreground lg:mt-24">
          {p.title}
        </h2>
        <ul className="site-reveal mt-5 flex flex-wrap items-center gap-x-8 gap-y-4">
          {p.names.map((n, i) => {
            const Icon = icons[i];
            return (
              <li key={n} className="flex items-center gap-2 text-2xl font-bold whitespace-nowrap">
                <Icon className="size-6 text-(--semantic-color-text-link)" />
                {n}
              </li>
            );
          })}
          {p.markets.map(([code, name]) => (
            <li key={code} className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm whitespace-nowrap">
              <span className="text-xs font-semibold text-muted-foreground">{code}</span>
              {name}
            </li>
          ))}
        </ul>
        <p className="site-reveal mt-6 max-w-3xl text-sm text-muted-foreground">{p.note}</p>
      </div>
    </section>
  );
}

/** 收尾：居中大字（VIS-004 允许 final CTA 居中），背后两团光晕缓慢漂移 */
function Closing({ copy }: { copy: SiteCopy }) {
  const c = copy.closing;
  return (
    <section className="relative isolate px-6 py-24 text-center lg:py-40">
      <Glow className="site-drift top-0 left-1/2 -translate-x-1/2" />
      <Glow tone="caramel" className="site-drift -bottom-40 -left-80" style={delay(-8000)} />
      <div className="site-reveal mx-auto max-w-4xl">
        <Symbol className="mx-auto size-14" />
        <h2 className="site-headline mt-8">{c.title}</h2>
        <p className="site-lead mx-auto mt-6 max-w-2xl text-muted-foreground">{c.lead}</p>
        <a href="/login" className={cn(buttonVariants({ size: "lg" }), "mt-10 rounded-full px-6")}>
          {c.login}
          <ArrowRight />
        </a>
      </div>
    </section>
  );
}

function SiteFooter({ copy, locale }: { copy: SiteCopy; locale: Locale }) {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <Symbol className="size-6" />
          <p className="text-sm text-muted-foreground">{copy.footer.tagline}</p>
        </div>
        <div className="flex items-center gap-4 sm:ml-auto">
          <LanguageSwitch copy={copy} locale={locale} />
          <p className="text-sm text-muted-foreground tabular-nums">{copy.footer.copyright}</p>
        </div>
      </div>
    </footer>
  );
}
