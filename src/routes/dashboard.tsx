import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Wand2,
  Images,
  History,
  Wallet,
  Settings as SettingsIcon,
  Sparkles,
  Search,
  LogOut,
  Loader2,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LangSwitch } from "@/components/lang-switch";
import { ThemeToggle } from "@/components/theme-toggle";
import { MarketplaceTabs } from "@/components/marketplace-tabs";
import { MarketplaceProvider, useMarketplace } from "@/lib/marketplace";


export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Личный кабинет — Карточная" },
      { name: "description", content: "Управляйте генерациями, кредитами и заказами Карточная." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DashboardLayout,
});

function DashboardLayout() {
  const { t } = useI18n();
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, avatar_url, email")
        .eq("id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  const { data: credits } = useQuery({
    queryKey: ["credits", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("credits")
        .select("balance")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data?.balance ?? 0;
    },
  });

  const nav: { to: string; label: string; icon: typeof Wand2; exact?: boolean }[] = [
    { to: "/dashboard", label: t.dashboard.new, icon: Wand2, exact: true },
    { to: "/dashboard/cards", label: t.dashboard.cards, icon: Images },
    { to: "/dashboard/history", label: t.dashboard.history, icon: History },
    { to: "/dashboard/billing", label: t.dashboard.billing, icon: Wallet },
    { to: "/dashboard/settings", label: t.dashboard.settings, icon: SettingsIcon },
  ];

  const activeLabel =
    nav.find((n) => (n.exact ? pathname === n.to : pathname.startsWith(n.to)))?.label ??
    t.dashboard.new;

  const initials = (profile?.full_name || profile?.email || user?.email || "K A")
    .split(" ")
    .map((s: string) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <MarketplaceProvider>
      <DashboardShell
        nav={nav}
        pathname={pathname}
        activeLabel={activeLabel}
        profile={profile}
        credits={credits}
        initials={initials}
        onSignOut={async () => {
          await signOut();
          navigate({ to: "/" });
        }}
        t={t}
      />
    </MarketplaceProvider>
  );
}

type ShellProps = {
  nav: { to: string; label: string; icon: typeof Wand2; exact?: boolean }[];
  pathname: string;
  activeLabel: string;
  profile: { full_name?: string | null; avatar_url?: string | null; email?: string | null } | null | undefined;
  credits: number | undefined;
  initials: string;
  onSignOut: () => void;
  t: ReturnType<typeof useI18n>["t"];
};

function DashboardShell({
  nav,
  pathname,
  activeLabel,
  profile,
  credits,
  initials,
  onSignOut,
  t,
}: ShellProps) {
  const { marketplace } = useMarketplace();

  return (
    <div className="flex min-h-screen bg-background text-foreground" data-mp={marketplace}>
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border/60 bg-sidebar md:flex">
        <div className="flex h-16 items-center gap-2 border-b border-border/60 px-6">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-brand">
            <Sparkles className="h-4 w-4 text-white" />
          </span>
          <span className="font-display text-lg font-bold">Карточная</span>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {nav.map((n) => {
            const active = n.exact ? pathname === n.to : pathname.startsWith(n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-primary/15 text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <n.icon className="h-4 w-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border/60 p-4">
          <div className="rounded-xl border border-border/60 bg-card/60 p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              {t.dashboard.balance}
            </div>
            <div className="mt-1 font-display text-2xl font-bold">
              {credits ?? 0}{" "}
              <span className="text-sm font-medium text-muted-foreground">
                {t.dashboard.credits}
              </span>
            </div>
            <Button
              asChild
              size="sm"
              className="mt-3 w-full bg-gradient-brand text-white hover:opacity-90"
            >
              <Link to="/dashboard/billing">{t.dashboard.topup}</Link>
            </Button>
          </div>
        </div>
      </aside>

      <div className="relative flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border/60 bg-background/70 px-6 backdrop-blur-xl">
          <h1 className="font-display text-lg font-semibold">{activeLabel}</h1>
          <div className="relative ml-auto hidden max-w-sm flex-1 md:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder={t.dashboard.search} className="pl-9" />
          </div>
          <LangSwitch />
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            title={t.dashboard.logout}
            onClick={onSignOut}
          >
            <LogOut className="h-4 w-4" />
          </Button>
          <Avatar className="h-8 w-8">
            {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt="" />}
            <AvatarFallback className="bg-gradient-brand text-xs text-white">
              {initials}
            </AvatarFallback>
          </Avatar>
        </header>

        {/* Marketplace switcher strip */}
        <div className="border-b border-border/60 bg-background/60 px-6 py-3">
          <MarketplaceTabs />
        </div>

        {/* G1 — soft top gradient wash tinted by active marketplace */}
        <div className="relative flex-1">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 mp-gradient-full"
          />

          <main className="relative mx-auto w-full max-w-6xl px-6 py-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}

