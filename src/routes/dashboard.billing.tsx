import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/dashboard/billing")({
  component: BillingPage,
});

function BillingPage() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const l = lang === "ru";

  const { data: balance } = useQuery({
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

  const { data: history } = useQuery({
    queryKey: ["generations", user?.id, "spend"],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("generations")
        .select("id, created_at, credits_cost, status")
        .eq("user_id", user!.id)
        .eq("status", "done")
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });
  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-3xl font-bold tracking-tight">{t.billingPage.title}</h2>
      </div>

      <Card className="relative overflow-hidden border-border/60 bg-card/60 p-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_100%_at_100%_0%,rgba(124,58,237,0.3),transparent_70%)]" />
        <div className="relative">
          <div className="text-sm text-muted-foreground">{t.billingPage.current}</div>
          <div className="mt-2 font-display text-6xl font-bold">
            {balance ?? 0} <span className="text-2xl font-medium text-muted-foreground">{t.dashboard.credits}</span>
          </div>
        </div>
      </Card>

      <div>
        <h3 className="font-display text-xl font-semibold">{t.billingPage.buyMore}</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {t.pricing.plans.map((p) => {
            const popular = "popular" in p && p.popular;
            return (
              <Card
                key={p.name}
                className={cn(
                  "flex flex-col gap-4 border-border/60 bg-card/60 p-6",
                  popular && "border-primary/60",
                )}
              >
                <div>
                  <div className="font-display font-semibold">{p.name}</div>
                  <div className="mt-1 font-display text-3xl font-bold">{p.price}</div>
                  <div className="text-sm text-muted-foreground">{p.credits}</div>
                </div>
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-primary" /> {p.img} {t.pricing.perImage}
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-primary" /> {p.vid} {t.pricing.perVideo}
                  </li>
                </ul>
                <Button
                  className={cn(
                    "mt-auto",
                    popular
                      ? "bg-gradient-brand text-white hover:opacity-90"
                      : "border border-border bg-card hover:bg-muted",
                  )}
                  variant={popular ? "default" : "outline"}
                >
                  {t.pricing.cta}
                </Button>
                {popular && (
                  <Badge className="self-start bg-gradient-brand text-white">
                    {t.pricing.popular}
                  </Badge>
                )}
              </Card>
            );
          })}
        </div>
        <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" /> ЮKassa · СБП · Тинькофф
        </p>
      </div>

      <div>
        <h3 className="font-display text-xl font-semibold">{t.billingPage.history}</h3>
        <Card className="mt-4 border-border/60 bg-card/60 p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.historyPage.date}</TableHead>
                <TableHead>Операция</TableHead>
                <TableHead className="text-right">{t.historyPage.credits}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(!history || history.length === 0) && (
                <TableRow>
                  <TableCell colSpan={3} className="py-10 text-center text-muted-foreground">
                    {l ? "Пока нет операций" : "No transactions yet"}
                  </TableCell>
                </TableRow>
              )}
              {history?.map((h) => (
                <TableRow key={h.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {new Date(h.created_at).toLocaleDateString(l ? "ru-RU" : "en-US")}
                  </TableCell>
                  <TableCell>{l ? "Генерация карточки" : "Card generation"}</TableCell>
                  <TableCell className="text-right font-medium">−{h.credits_cost}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
