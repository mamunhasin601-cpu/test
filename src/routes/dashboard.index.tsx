import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Upload, Wand2, Sparkles, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { CardOverlayEditor } from "@/components/card-overlay-editor";


import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { generateCard } from "@/lib/ai.functions";
import { useMarketplace } from "@/lib/marketplace";


export const Route = createFileRoute("/dashboard/")({
  component: NewGenerationPage,
});

function NewGenerationPage() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const fn = useServerFn(generateCard);

  const { marketplace } = useMarketplace();

  const [prompt, setPrompt] = useState("");
  const [category, setCategory] = useState("apparel");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const [result, setResult] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);


  const l = lang === "ru";

  const mutation = useMutation({
    mutationFn: async () => {
      if (!prompt.trim()) throw new Error(l ? "Опишите товар" : "Describe the product");
      if (!file) {
        throw new Error(
          l
            ? "Загрузите фото товара — без него карточку сгенерировать нельзя"
            : "Upload a product photo — generation requires a reference image",
        );
      }
      if (!user) throw new Error("not_authenticated");

      // Progress simulation for UX
      setProgress(10);
      const interval = setInterval(() => {
        setProgress((p) => Math.min(90, p + 5));
      }, 700);

      try {
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
        const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("uploads")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) throw new Error(upErr.message);
        const { data: signed } = await supabase.storage
          .from("uploads")
          .createSignedUrl(path, 60 * 60);
        const inputImageUrl = signed?.signedUrl;
        if (!inputImageUrl) throw new Error("upload_failed");

        const res = await fn({ data: { prompt, category, marketplace, inputImageUrl } });
        setProgress(100);
        return res;
      } finally {
        clearInterval(interval);
      }
    },
    onSuccess: (res) => {
      setResult(res.outputUrl);
      setAnalysis(res.analysis);
      setWarnings(res.warnings ?? []);

      qc.invalidateQueries({ queryKey: ["credits", user?.id] });
      qc.invalidateQueries({ queryKey: ["generations", user?.id] });
      toast.success(l ? "Готово!" : "Done!");
    },
    onError: (err: Error) => {
      setProgress(0);
      setWarnings([]);
      if (err.message === "insufficient_credits") {
        toast.error(l ? "Недостаточно кредитов" : "Not enough credits");
      } else if (err.message === "rate_limited") {
        toast.error(l ? "Слишком много запросов. Подождите." : "Rate limited. Please wait.");
      } else if (err.message === "ai_credits_exhausted") {
        toast.error(l ? "AI-кредиты закончились. Пополните в Cloud." : "AI credits exhausted.");
      } else if (err.message === "image_moderation_blocked") {
        toast.error(
          l
            ? "Изображение не прошло модерацию. Измените описание или фото товара."
            : "Image blocked by moderation. Change the prompt or reference photo.",
        );
      } else {
        toast.error(err.message);
      }
    },
  });

  const onFile = (f: File | null) => {
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-3xl font-bold tracking-tight">{t.newGen.title}</h2>
        <p className="mt-2 text-muted-foreground">{t.newGen.subtitle}</p>
      </div>

      <Card className="relative grid gap-6 overflow-hidden border-border/60 bg-card/60 p-6 md:grid-cols-[1fr_320px]">
        {/* G4 — marketplace accent bar */}
        <div aria-hidden className="mp-card-accent-bar absolute inset-x-0 top-0 h-1" />

        <div className="space-y-6">
          <label className="flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-background/40 px-6 py-10 text-center transition-colors hover:border-primary/60 hover:bg-primary/5">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            />
            {preview ? (
              <img src={preview} alt="" className="max-h-40 rounded-lg object-contain" />
            ) : (
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-brand">
                <Upload className="h-5 w-5 text-white" />
              </div>
            )}
            <div className="font-medium">{file ? file.name : t.newGen.dropzone}</div>
            <div className="text-sm text-muted-foreground">{t.newGen.dropzoneHint}</div>
          </label>

          <div>
            <Label htmlFor="prompt" className="mb-2 block">
              {l ? "Описание товара" : "Product description"}
            </Label>
            <Textarea
              id="prompt"
              placeholder={
                l
                  ? "Например: белые кроссовки из кожи, женские, размер 38, для города"
                  : "e.g. white leather sneakers, women, size 38, urban style"
              }
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
            />
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <Label className="mb-2 block">{t.newGen.nicheLabel}</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="apparel">{t.gallery.apparel}</SelectItem>
                <SelectItem value="beauty">{t.gallery.beauty}</SelectItem>
                <SelectItem value="electronics">{t.gallery.electronics}</SelectItem>
                <SelectItem value="goods">{t.gallery.goods}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="mb-2 block">{t.newGen.marketLabel}</Label>
            <div className="rounded-lg border border-border/60 bg-background/40 p-3 text-sm">
              <div className="font-medium">
                {marketplace === "wb" && "Wildberries · 3:4 · с текстом"}
                {marketplace === "ozon" && "Ozon · 3:4 · без текста"}
                {marketplace === "ym" && "Яндекс Маркет · 1:1 · без текста"}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {marketplace === "wb" &&
                  (l
                    ? "1024×1536, светлый фон, разрешён заголовок на карточке"
                    : "1024×1536, light bg, headline allowed")}
                {marketplace === "ozon" &&
                  (l
                    ? "1024×1536, белый фон, без текста и плашек"
                    : "1024×1536, white bg, no text or badges")}
                {marketplace === "ym" &&
                  (l
                    ? "1024×1024, белый фон, отступы по краям, без текста"
                    : "1024×1024, white bg, borders, no text")}
              </p>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {l ? "Переключить маркетплейс — вкладками сверху" : "Switch marketplace via tabs above"}
              </p>
            </div>
          </div>



          <div className="rounded-xl border border-border/60 bg-background/40 p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              {l ? "Стоимость" : "Cost"}
            </div>
            <div className="mt-1 font-display text-2xl font-bold">
              15 <span className="text-sm font-medium text-muted-foreground">{t.dashboard.credits}</span>
            </div>
          </div>

          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !prompt.trim() || !file}
            className="w-full bg-gradient-brand text-white hover:opacity-90"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t.newGen.generating}
              </>
            ) : (
              <>
                <Wand2 className="mr-2 h-4 w-4" />
                {t.newGen.generate}
              </>
            )}
          </Button>
          {!file && !mutation.isPending && (
            <p className="text-center text-xs text-muted-foreground">
              {l ? "Сначала загрузите фото товара" : "Upload a product photo first"}
            </p>
          )}
        </div>
      </Card>

      {mutation.isPending && (
        <Card className="border-border/60 bg-card/60 p-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="h-4 w-4 text-primary" />
            {t.newGen.processing}...
          </div>
          <Progress value={progress} className="mt-3" />
        </Card>
      )}

      {warnings.length > 0 && !mutation.isPending && (
        <div className="flex flex-col gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300">
          {warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>{w}</div>
            </div>
          ))}
        </div>
      )}

      {analysis && !mutation.isPending && (
        <Card className="border-border/60 bg-card/60 p-6">
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h3 className="font-display text-lg font-semibold">
              {l ? "Анализ GPT" : "GPT analysis"}
            </h3>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
            {analysis}
          </p>
        </Card>
      )}



      {result && !mutation.isPending && (
        <Card className="border-border/60 bg-card/60 p-6">
          <div className="mb-4">
            <h3 className="font-display text-xl font-semibold">{t.newGen.results}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {l
                ? "Отредактируйте текст и скачайте карточку с наложенными надписями."
                : "Edit the text and download the card with overlays."}
            </p>
          </div>
          <div style={{ containerType: "inline-size" as const }}>
            <CardOverlayEditor
              imageUrl={result}
              lang={lang === "ru" ? "ru" : "en"}
              initial={{ title: prompt.split(/[.,\n]/)[0].slice(0, 40) || "Название товара" }}
            />
          </div>
        </Card>

      )}

      {mutation.isError && !mutation.isPending && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>{(mutation.error as Error).message}</div>
        </div>
      )}
    </div>
  );
}
