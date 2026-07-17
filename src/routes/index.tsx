import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Sparkles,
  Copy,
  Layers,
  Film,
  Upload,
  Wand2,
  Download,
  Check,
  ArrowRight,
  ShieldCheck,
  TrendingUp,
  CreditCard,
  Gift,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { SiteHeader } from "@/components/landing/site-header";
import { SiteFooter } from "@/components/landing/site-footer";

import beauty1 from "@/assets/gallery/beauty-1.jpg";
import beauty2 from "@/assets/gallery/beauty-2.jpg";
import apparel1 from "@/assets/gallery/apparel-1.jpg";
import apparel2 from "@/assets/gallery/apparel-2.jpg";
import electronics1 from "@/assets/gallery/electronics-1.jpg";
import electronics2 from "@/assets/gallery/electronics-2.jpg";
import goods1 from "@/assets/gallery/goods-1.jpg";
import goods2 from "@/assets/gallery/goods-2.jpg";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

type Cat = "all" | "apparel" | "beauty" | "electronics" | "goods";

const GALLERY: { src: string; cat: Exclude<Cat, "all"> }[] = [
  { src: beauty1, cat: "beauty" },
  { src: apparel1, cat: "apparel" },
  { src: electronics1, cat: "electronics" },
  { src: goods1, cat: "goods" },
  { src: beauty2, cat: "beauty" },
  { src: apparel2, cat: "apparel" },
  { src: electronics2, cat: "electronics" },
  { src: goods2, cat: "goods" },
];

function LandingPage() {
  const { t } = useI18n();
  const [cat, setCat] = useState<Cat>("all");

  const items = useMemo(
    () => (cat === "all" ? GALLERY : GALLERY.filter((g) => g.cat === cat)),
    [cat],
  );

  const cats: { key: Cat; label: string }[] = [
    { key: "all", label: t.gallery.all },
    { key: "apparel", label: t.gallery.apparel },
    { key: "beauty", label: t.gallery.beauty },
    { key: "electronics", label: t.gallery.electronics },
    { key: "goods", label: t.gallery.goods },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-x-0 -top-40 h-[600px] bg-[radial-gradient(60%_60%_at_50%_30%,rgba(124,58,237,0.35),transparent_70%)]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-x-0 top-40 h-[500px] bg-[radial-gradient(50%_50%_at_70%_60%,rgba(59,130,246,0.25),transparent_70%)]"
          aria-hidden
        />
        <div className="relative mx-auto max-w-7xl px-6 pb-24 pt-20 md:pt-28">
          <div className="mx-auto max-w-3xl text-center">
            <Badge
              variant="outline"
              className="mb-6 gap-2 border-primary/40 bg-primary/10 text-primary"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {t.hero.badge}
            </Badge>
            <h1 className="font-display text-5xl font-bold tracking-tight md:text-7xl">
              {t.hero.title1}{" "}
              <span className="text-gradient-brand">{t.hero.title2}</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
              {t.hero.subtitle}
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <Button
                asChild
                size="lg"
                className="bg-gradient-brand text-white hover:opacity-90 glow-brand"
              >
                <Link to="/dashboard">
                  {t.hero.ctaPrimary}
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/dashboard">{t.hero.ctaSecondary}</Link>
              </Button>
            </div>
            <p className="mt-6 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-70" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                </span>
                {t.hero.counter}
              </span>
            </p>
          </div>

          {/* Mock preview card */}
          <div className="relative mx-auto mt-16 max-w-5xl">
            <div className="absolute -inset-4 rounded-3xl bg-gradient-brand opacity-20 blur-2xl" />
            <div className="relative rounded-3xl border border-border/60 bg-card/70 p-3 backdrop-blur">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {GALLERY.slice(0, 4).map((g, i) => (
                  <div
                    key={i}
                    className="aspect-[3/4] overflow-hidden rounded-2xl border border-border/60 bg-muted"
                  >
                    <img
                      src={g.src}
                      alt=""
                      loading="lazy"
                      width={512}
                      height={683}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TRUST BAR */}
      <section className="border-y border-border/60 bg-card/30">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-6 py-8 text-sm md:grid-cols-4">
          <TrustItem icon={TrendingUp} label={t.trust.sellers} />
          <TrustItem icon={Sparkles} label={t.trust.ctr} />
          <TrustItem icon={CreditCard} label={t.trust.noCard} />
          <TrustItem icon={Gift} label={t.trust.free} />
        </div>
      </section>

      {/* TOOLS */}
      <section id="tools" className="mx-auto max-w-7xl px-6 py-24">
        <SectionHeading title={t.tools.title} subtitle={t.tools.subtitle} />
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          <ToolCard icon={Copy} title={t.tools.copy.title} desc={t.tools.copy.desc} />
          <ToolCard icon={Layers} title={t.tools.info.title} desc={t.tools.info.desc} />
          <ToolCard icon={Film} title={t.tools.video.title} desc={t.tools.video.desc} />
        </div>
      </section>

      {/* GALLERY */}
      <section id="gallery" className="border-t border-border/60 bg-card/20 py-24">
        <div className="mx-auto max-w-7xl px-6">
          <SectionHeading title={t.gallery.title} subtitle={t.gallery.subtitle} />
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            {cats.map((c) => (
              <button
                key={c.key}
                onClick={() => setCat(c.key)}
                className={cn(
                  "rounded-full border px-4 py-1.5 text-sm transition-colors",
                  cat === c.key
                    ? "border-primary bg-primary/15 text-foreground"
                    : "border-border bg-card/40 text-muted-foreground hover:text-foreground",
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-4">
            {items.map((g, i) => (
              <div
                key={`${g.cat}-${i}`}
                className="group relative aspect-[3/4] overflow-hidden rounded-2xl border border-border/60 bg-muted"
              >
                <img
                  src={g.src}
                  alt=""
                  loading="lazy"
                  width={512}
                  height={683}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="mx-auto max-w-7xl px-6 py-24">
        <SectionHeading title={t.how.title} />
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          <StepCard n={1} icon={Upload} title={t.how.s1t} desc={t.how.s1d} />
          <StepCard n={2} icon={Wand2} title={t.how.s2t} desc={t.how.s2d} />
          <StepCard n={3} icon={Download} title={t.how.s3t} desc={t.how.s3d} />
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="border-t border-border/60 bg-card/20 py-24">
        <div className="mx-auto max-w-7xl px-6">
          <SectionHeading title={t.pricing.title} subtitle={t.pricing.subtitle} />
          <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {t.pricing.plans.map((p) => {
              const popular = "popular" in p && p.popular;
              return (
                <Card
                  key={p.name}
                  className={cn(
                    "relative flex flex-col gap-6 border-border/60 bg-card/60 p-6",
                    popular && "border-primary/60 glow-brand",
                  )}
                >
                  {popular && (
                    <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-brand text-white">
                      {t.pricing.popular}
                    </Badge>
                  )}
                  <div>
                    <div className="font-display text-lg font-semibold">{p.name}</div>
                    <div className="mt-2 font-display text-4xl font-bold">{p.price}</div>
                    <div className="mt-1 text-sm text-muted-foreground">{p.credits}</div>
                  </div>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-primary" /> {p.img} {t.pricing.perImage}
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-primary" /> {p.vid} {t.pricing.perVideo}
                    </li>
                    <li className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-primary" /> WB · Ozon · Я.Маркет
                    </li>
                  </ul>
                  <Button
                    asChild
                    className={cn(
                      "mt-auto",
                      popular
                        ? "bg-gradient-brand text-white hover:opacity-90"
                        : "bg-card border border-border hover:bg-muted",
                    )}
                    variant={popular ? "default" : "outline"}
                  >
                    <Link to="/dashboard">{t.pricing.cta}</Link>
                  </Button>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="mx-auto max-w-4xl px-6 py-24 text-center">
        <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-card/60 p-12">
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(124,58,237,0.35),transparent_70%)]"
            aria-hidden
          />
          <div className="relative">
            <h2 className="font-display text-4xl font-bold md:text-5xl">
              {t.finalCta.title}
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
              {t.finalCta.subtitle}
            </p>
            <Button
              asChild
              size="lg"
              className="mt-8 bg-gradient-brand text-white hover:opacity-90 glow-brand"
            >
              <Link to="/dashboard">
                {t.finalCta.button} <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* SEO */}
      <section id="seo" className="border-t border-border/60 bg-card/20 py-16">
        <div className="mx-auto max-w-3xl px-6">
          <h2 className="font-display text-2xl font-semibold">{t.seo.title}</h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{t.seo.body}</p>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <h2 className="font-display text-3xl font-bold tracking-tight md:text-5xl">{title}</h2>
      {subtitle && <p className="mt-4 text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

function TrustItem({ icon: Icon, label }: { icon: typeof TrendingUp; label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 text-muted-foreground">
      <Icon className="h-4 w-4 text-primary" />
      <span>{label}</span>
    </div>
  );
}

function ToolCard({
  icon: Icon,
  title,
  desc,
}: {
  icon: typeof Copy;
  title: string;
  desc: string;
}) {
  return (
    <Card className="group relative overflow-hidden border-border/60 bg-card/60 p-8 transition-all hover:border-primary/50">
      <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-gradient-brand opacity-0 blur-3xl transition-opacity group-hover:opacity-30" />
      <div className="relative">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-brand">
          <Icon className="h-5 w-5 text-white" />
        </div>
        <h3 className="mt-6 font-display text-xl font-semibold">{title}</h3>
        <p className="mt-3 text-sm text-muted-foreground">{desc}</p>
      </div>
    </Card>
  );
}

function StepCard({
  n,
  icon: Icon,
  title,
  desc,
}: {
  n: number;
  icon: typeof Upload;
  title: string;
  desc: string;
}) {
  return (
    <Card className="relative overflow-hidden border-border/60 bg-card/60 p-8">
      <div className="text-gradient-brand font-display text-6xl font-bold opacity-40">
        0{n}
      </div>
      <Icon className="mt-2 h-6 w-6 text-primary" />
      <h3 className="mt-4 font-display text-xl font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{desc}</p>
    </Card>
  );
}
