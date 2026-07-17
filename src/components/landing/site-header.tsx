import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { LangSwitch } from "@/components/lang-switch";
import { ThemeToggle } from "@/components/theme-toggle";

export function SiteHeader() {
  const { t } = useI18n();
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-6">
        <Link to="/" className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-brand">
            <Sparkles className="h-4 w-4 text-white" />
          </span>
          <span className="font-display text-lg font-bold tracking-tight">Карточная</span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
          <a href="#tools" className="transition-colors hover:text-foreground">{t.nav.features}</a>
          <a href="#gallery" className="transition-colors hover:text-foreground">{t.nav.gallery}</a>
          <a href="#pricing" className="transition-colors hover:text-foreground">{t.nav.pricing}</a>
          <a href="#seo" className="transition-colors hover:text-foreground">{t.nav.blog}</a>
        </nav>
        <div className="flex items-center gap-3">
          <LangSwitch />
          <ThemeToggle />
          <Link to="/auth" className="hidden text-sm text-muted-foreground hover:text-foreground sm:inline">
            {t.nav.login}
          </Link>
          <Button asChild className="bg-gradient-brand text-white hover:opacity-90">
            <Link to="/auth">{t.nav.cta}</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
