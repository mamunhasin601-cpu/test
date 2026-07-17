import { createFileRoute } from "@tanstack/react-router";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/dashboard/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { t } = useI18n();
  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-3xl font-bold tracking-tight">{t.settingsPage.title}</h2>
      </div>

      <Card className="border-border/60 bg-card/60 p-6">
        <h3 className="font-display text-lg font-semibold">{t.settingsPage.company}</h3>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="cname" className="mb-2 block">{t.settingsPage.companyName}</Label>
            <Input id="cname" defaultValue="ООО «Селлер»" />
          </div>
          <div>
            <Label htmlFor="inn" className="mb-2 block">{t.settingsPage.inn}</Label>
            <Input id="inn" defaultValue="7712345678" />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="mail" className="mb-2 block">{t.settingsPage.emailReceipts}</Label>
            <Input id="mail" type="email" defaultValue="ceo@example.com" />
          </div>
        </div>
        <Button className="mt-6 bg-gradient-brand text-white hover:opacity-90">
          {t.settingsPage.save}
        </Button>
      </Card>

      <Card className="border-border/60 bg-card/60 p-6">
        <h3 className="font-display text-lg font-semibold">{t.settingsPage.apiKey}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t.settingsPage.apiHint}</p>
        <div className="mt-4 flex gap-2">
          <Input
            readOnly
            value="sk_live_kart_a83f••••••••••••••••••b21e"
            className="font-mono text-xs"
          />
          <Button variant="outline" size="icon">
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      </Card>
    </div>
  );
}
