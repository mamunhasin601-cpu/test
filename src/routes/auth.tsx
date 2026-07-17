import { createFileRoute, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Вход и регистрация — Карточная" },
      { name: "description", content: "Войдите или создайте аккаунт Карточная." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { t, lang } = useI18n();
  const { user, loading, signInEmail, signUpEmail, signInGoogle } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!loading && user && pathname === "/auth") {
      navigate({ to: "/dashboard" });
    }
  }, [user, loading, pathname, navigate]);

  const [tab, setTab] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [gbusy, setGbusy] = useState(false);

  const l = lang === "ru";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res =
      tab === "in"
        ? await signInEmail(email, password)
        : await signUpEmail(email, password, name || undefined);
    setBusy(false);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success(l ? "Успех" : "Success");
      if (tab === "in") navigate({ to: "/dashboard" });
      else toast.message(l ? "Аккаунт создан. Входим..." : "Account created. Signing in...");
    }
  };

  const google = async () => {
    setGbusy(true);
    const res = await signInGoogle();
    setGbusy(false);
    if (res.error) toast.error(res.error);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-brand">
            <Sparkles className="h-4 w-4 text-white" />
          </span>
          <span className="font-display text-xl font-bold">Карточная</span>
        </Link>
        <Card className="border-border/60 bg-card/70 p-6 backdrop-blur">
          <Tabs value={tab} onValueChange={(v) => setTab(v as "in" | "up")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="in">{l ? "Вход" : "Sign in"}</TabsTrigger>
              <TabsTrigger value="up">{l ? "Регистрация" : "Sign up"}</TabsTrigger>
            </TabsList>

            <form onSubmit={submit} className="mt-6 space-y-4">
              {tab === "up" && (
                <div>
                  <Label htmlFor="name">{l ? "Имя" : "Name"}</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5" />
                </div>
              )}
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="password">{l ? "Пароль" : "Password"}</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete={tab === "in" ? "current-password" : "new-password"}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1.5"
                />
              </div>
              <Button type="submit" disabled={busy} className="w-full bg-gradient-brand text-white hover:opacity-90">
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {tab === "in" ? (l ? "Войти" : "Sign in") : (l ? "Создать аккаунт" : "Create account")}
              </Button>
            </form>

            <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-wider text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              {l ? "или" : "or"}
              <span className="h-px flex-1 bg-border" />
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={gbusy}
              onClick={google}
            >
              {gbusy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z"/>
                </svg>
              )}
              {l ? "Войти через Google" : "Continue with Google"}
            </Button>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                disabled
                title={l ? "Скоро" : "Soon"}
                className="w-full justify-center gap-2"
              >
                <svg className="h-4 w-4" viewBox="0 0 32 32" aria-hidden="true">
                  <rect width="32" height="32" rx="6" fill="#0077FF" />
                  <path
                    fill="#fff"
                    d="M17.3 22.6c-6.6 0-10.4-4.6-10.5-12.2h3.3c.1 5.6 2.5 7.9 4.5 8.4V10.4h3.1v4.8c1.9-.2 4-2.4 4.7-4.8h3.1c-.5 3-2.7 5.2-4.3 6.1 1.6.7 4.1 2.7 5 6.1H22c-.7-2.4-2.6-4.2-4.7-4.4v4.4z"
                  />
                </svg>
                <span>VK</span>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  · {l ? "скоро" : "soon"}
                </span>
              </Button>

              <Button
                type="button"
                variant="outline"
                disabled
                title={l ? "Скоро" : "Soon"}
                className="w-full justify-center gap-2"
              >
                <svg className="h-4 w-4" viewBox="0 0 32 32" aria-hidden="true">
                  <rect width="32" height="32" rx="6" fill="#FC3F1D" />
                  <path
                    fill="#fff"
                    d="M18.5 24h2.9V8h-4.2c-4.2 0-6.4 2.2-6.4 5.4 0 2.6 1.2 4.1 3.4 5.6l-3.9 4.9h3.1l4.3-5.7-1.5-1c-1.7-1.2-2.5-2.1-2.5-4 0-1.7 1.2-2.9 2.9-2.9h1.9V24z"
                  />
                </svg>
                <span>Яндекс&nbsp;ID</span>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  · {l ? "скоро" : "soon"}
                </span>
              </Button>
            </div>
          </Tabs>
        </Card>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          <Link to="/" className="hover:text-foreground">
            ← {l ? "На главную" : "Home"}
          </Link>
        </p>
      </div>
    </div>
  );
}
