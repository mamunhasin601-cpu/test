import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/dashboard/history")({
  component: HistoryPage,
});

function HistoryPage() {
  const { t, lang } = useI18n();
  const { user } = useAuth();

  const { data: rows, isLoading } = useQuery({
    queryKey: ["generations", user?.id, "all"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("generations")
        .select("id, created_at, category, status, credits_cost, prompt")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  const l = lang === "ru";

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-3xl font-bold tracking-tight">{t.historyPage.title}</h2>
        <p className="mt-2 text-muted-foreground">{t.historyPage.subtitle}</p>
      </div>
      <Card className="border-border/60 bg-card/60 p-0">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !rows?.length ? (
          <div className="py-16 text-center text-muted-foreground">
            {l ? "Пока пусто" : "Nothing yet"}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.historyPage.date}</TableHead>
                <TableHead>{l ? "Промпт" : "Prompt"}</TableHead>
                <TableHead>{l ? "Категория" : "Category"}</TableHead>
                <TableHead>{t.historyPage.status}</TableHead>
                <TableHead className="text-right">{t.historyPage.credits}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString(l ? "ru-RU" : "en-US")}
                  </TableCell>
                  <TableCell className="max-w-xs truncate">{r.prompt}</TableCell>
                  <TableCell>{r.category ?? "—"}</TableCell>
                  <TableCell>{statusBadge(r.status, l)}</TableCell>
                  <TableCell className="text-right">
                    {r.status === "done" ? `−${r.credits_cost}` : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function statusBadge(status: string, l: boolean) {
  if (status === "done")
    return <Badge className="bg-primary/20 text-primary hover:bg-primary/20">{l ? "Готово" : "Done"}</Badge>;
  if (status === "failed") return <Badge variant="destructive">{l ? "Ошибка" : "Failed"}</Badge>;
  return <Badge variant="secondary">{l ? "В работе" : "Processing"}</Badge>;
}
