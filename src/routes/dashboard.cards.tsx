import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/dashboard/cards")({
  component: CardsPage,
});

function CardsPage() {
  const { t } = useI18n();
  const { user } = useAuth();

  const { data: cards, isLoading } = useQuery({
    queryKey: ["generations", user?.id, "done"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("generations")
        .select("id, output_image_url, prompt, created_at")
        .eq("user_id", user!.id)
        .eq("status", "done")
        .not("output_image_url", "is", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (!data?.length) return [] as { id: string; url: string; prompt: string }[];
      const paths = data.map((r) => r.output_image_url!).filter(Boolean);
      const { data: signed } = await supabase.storage
        .from("generations")
        .createSignedUrls(paths, 60 * 60);
      const byPath = new Map(signed?.map((s) => [s.path, s.signedUrl]) ?? []);
      return data.map((r) => ({
        id: r.id,
        prompt: r.prompt,
        url: byPath.get(r.output_image_url!) ?? "",
      }));
    },
  });

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="font-display text-3xl font-bold tracking-tight">{t.cards.title}</h2>
          <p className="mt-2 text-muted-foreground">{t.cards.subtitle}</p>
        </div>
        <Button asChild className="bg-gradient-brand text-white hover:opacity-90">
          <Link to="/dashboard">
            <Plus className="mr-1 h-4 w-4" /> {t.dashboard.new}
          </Link>
        </Button>
      </div>

      {isLoading && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && !cards?.length && (
        <Card className="flex flex-col items-center gap-4 border-dashed border-border/60 bg-card/40 p-16 text-center">
          <div className="text-muted-foreground">{t.cards.empty}</div>
          <Button asChild className="bg-gradient-brand text-white hover:opacity-90">
            <Link to="/dashboard">
              <Plus className="mr-1 h-4 w-4" /> {t.dashboard.new}
            </Link>
          </Button>
        </Card>
      )}

      {cards && cards.length > 0 && (
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
          {cards.map((c) => (
            <Card key={c.id} className="group relative overflow-hidden border-border/60 bg-card/60 p-0">
              <div className="aspect-[3/4] overflow-hidden bg-muted">
                <img
                  src={c.url}
                  alt={c.prompt}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                />
              </div>
              <div className="absolute inset-x-0 bottom-0 flex gap-1 p-2 opacity-0 transition-opacity group-hover:opacity-100">
                <Button asChild size="sm" className="flex-1 bg-background/80 backdrop-blur" variant="secondary">
                  <a href={c.url} download target="_blank" rel="noreferrer">
                    <Download className="mr-1 h-3.5 w-3.5" /> {t.newGen.download}
                  </a>
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
