import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Upload,
  Wand2,
  Sparkles,
  Loader2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Check,
  Image as ImageIcon,
  LayoutGrid,
  Layers,
  RotateCcw,
  Minus,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { CardOverlayEditor } from "@/components/card-overlay-editor";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { generateCard, analyzeProductStep } from "@/lib/ai.functions";
import { useMarketplace } from "@/lib/marketplace";

export const Route = createFileRoute("/dashboard/")({
  component: NewGenerationPage,
});

const CREDITS_PER_VARIANT = 15;

type Scenario = "white_bg" | "flat_lay" | "in_hand" | "lifestyle";
type Angle = "auto" | "low" | "side" | "three_quarter" | "in_hand" | "macro";
type ContentType = "photo" | "infographic";

// Шаги визарда — см. REWORK_PLAN.md, синтез двух референсных механик
const STEP_IDS = ["upload", "analysis", "content", "scenario", "angle", "prompt", "variants"] as const;
type StepId = (typeof STEP_IDS)[number];

function NewGenerationPage() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const generateFn = useServerFn(generateCard);
  const analyzeFn = useServerFn(analyzeProductStep);

  const { marketplace } = useMarketplace();
  const l = lang === "ru";

  const [stepIndex, setStepIndex] = useState(0);
  const step: StepId = STEP_IDS[stepIndex];

  // Шаг 1: фото + описание
  const [prompt, setPrompt] = useState("");
  const [category, setCategory] = useState("apparel");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [inputImageUrl, setInputImageUrl] = useState<string | null>(null);

  // Шаг 2: AI-анализ
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [analysisWarnings, setAnalysisWarnings] = useState<string[]>([]);

  // Шаг 3: тип контента
  const [contentType, setContentType] = useState<ContentType>("photo");

  // Шаг 4: сценарий
  const [scenario, setScenario] = useState<Scenario>("white_bg");

  // Шаг 5: ракурс
  const [angle, setAngle] = useState<Angle>("auto");

  // Шаг 7: количество вариантов
  const [numVariants, setNumVariants] = useState(1);
  const [compareModels, setCompareModels] = useState(false);

  // Результат
  const [variants, setVariants] = useState<{ id: string; outputUrl: string; modelLabel?: string }[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [overlayFor, setOverlayFor] = useState<string | null>(null);

  // Ozon / ЯМ требуют строго чистый фон без сцены — ограничиваем выбор сценария
  const scenarioAllowed: Scenario[] =
    marketplace === "wb" ? ["white_bg", "flat_lay", "in_hand", "lifestyle"] : ["white_bg"];
  useEffect(() => {
    if (!scenarioAllowed.includes(scenario)) setScenario("white_bg");
  }, [marketplace]); // eslint-disable-line react-hooks/exhaustive-deps

  const onFile = (f: File | null) => {
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  };

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("not_authenticated");
      if (!file) throw new Error(l ? "Загрузите фото товара" : "Upload a product photo");
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("uploads")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw new Error(upErr.message);
      const { data: signed } = await supabase.storage.from("uploads").createSignedUrl(path, 60 * 60);
      if (!signed?.signedUrl) throw new Error("upload_failed");
      return signed.signedUrl;
    },
    onSuccess: (url) => {
      setInputImageUrl(url);
      setStepIndex(1);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      if (!inputImageUrl) throw new Error("no_image");
      return analyzeFn({ data: { prompt, category, inputImageUrl } });
    },
    onSuccess: (res) => {
      setAnalysis(res.analysis);
      setAnalysisWarnings(res.warnings ?? []);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Автоматически запускаем анализ при входе на шаг 2
  useEffect(() => {
    if (step === "analysis" && !analysis && !analyzeMutation.isPending && inputImageUrl) {
      analyzeMutation.mutate();
    }
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!inputImageUrl) throw new Error("no_image");
      setProgress(10);
      const interval = setInterval(() => setProgress((p) => Math.min(90, p + 4)), 700);
      try {
        const res = await generateFn({
          data: { prompt, category, marketplace, inputImageUrl, scenario, angle, contentType, numVariants, compareModels },
        });
        setProgress(100);
        return res;
      } finally {
        clearInterval(interval);
      }
    },
    onSuccess: (res) => {
      setVariants(res.variants);
      setAnalysis(res.analysis);
      setWarnings(res.warnings ?? []);
      qc.invalidateQueries({ queryKey: ["credits", user?.id] });
      qc.invalidateQueries({ queryKey: ["generations", user?.id] });
      toast.success(l ? "Готово!" : "Done!");
    },
    onError: (err: Error) => {
      setProgress(0);
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
      } else if (err.message === "all_variants_failed") {
        toast.error(l ? "Ни один вариант не удалось сгенерировать" : "No variant could be generated");
      } else {
        toast.error(err.message);
      }
    },
  });

  const resetAll = () => {
    setStepIndex(0);
    setFile(null);
    setPreview(null);
    setInputImageUrl(null);
    setPrompt("");
    setAnalysis(null);
    setAnalysisWarnings([]);
    setContentType("photo");
    setScenario("white_bg");
    setAngle("auto");
    setNumVariants(1);
    setCompareModels(false);
    setVariants([]);
    setWarnings([]);
    setOverlayFor(null);
  };

  const showingResults = variants.length > 0 && !generateMutation.isPending;

  const canGoNext =
    (step === "upload" && !!file && prompt.trim().length > 0) ||
    (step === "analysis" && !!analysis && !analyzeMutation.isPending) ||
    step === "content" ||
    step === "scenario" ||
    step === "angle" ||
    step === "prompt";

  const goNext = () => {
    if (step === "upload") {
      uploadMutation.mutate();
      return;
    }
    setStepIndex((i) => Math.min(i + 1, STEP_IDS.length - 1));
  };
  const goBack = () => setStepIndex((i) => Math.max(i - 1, 0));

  const STEP_LABELS: Record<StepId, string> = {
    upload: l ? "Фото" : "Photo",
    analysis: l ? "Анализ" : "Analysis",
    content: l ? "Тип" : "Type",
    scenario: l ? "Сцена" : "Scene",
    angle: l ? "Ракурс" : "Angle",
    prompt: l ? "Промпт" : "Prompt",
    variants: l ? "Кол-во" : "Count",
  };

  const SCENARIOS: { id: Scenario; label: string; desc: string }[] = [
    { id: "white_bg", label: l ? "Белый фон" : "White bg", desc: l ? "Классика для карточки" : "Classic listing shot" },
    { id: "flat_lay", label: l ? "Вид сверху" : "Flat lay", desc: l ? "Раскладка сверху" : "Top-down layout" },
    { id: "in_hand", label: l ? "В руках" : "In hand", desc: l ? "Показать размер" : "Show real scale" },
    { id: "lifestyle", label: l ? "Лайфстайл" : "Lifestyle", desc: l ? "В обстановке" : "In a real setting" },
  ];

  const ANGLES: { id: Angle; label: string }[] = [
    { id: "auto", label: l ? "Авто" : "Auto" },
    { id: "low", label: l ? "Низкий" : "Low" },
    { id: "side", label: l ? "Сбоку" : "Side" },
    { id: "three_quarter", label: "3/4" },
    { id: "in_hand", label: l ? "В руке" : "In hand" },
    { id: "macro", label: l ? "Макро" : "Macro" },
  ];

  const QUICK_PRESETS = l
    ? ["чистый белый фон", "ровный свет", "по центру кадра", "без теней"]
    : ["clean white background", "even lighting", "centered composition", "no shadows"];

  const togglePreset = (text: string) => {
    setPrompt((p) => (p.includes(text) ? p.replace(text, "").replace(/,\s*,/g, ",").trim() : (p.trim() ? `${p.trim()}, ${text}` : text)));
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-3xl font-bold tracking-tight">{t.newGen.title}</h2>
        <p className="mt-2 text-muted-foreground">{t.newGen.subtitle}</p>
      </div>

      {!showingResults && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {STEP_IDS.map((id, i) => (
              <div key={id} className="flex items-center gap-2">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${
                    i < stepIndex
                      ? "bg-primary text-primary-foreground"
                      : i === stepIndex
                        ? "bg-gradient-brand text-white"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {i < stepIndex ? <Check className="h-4 w-4" /> : i + 1}
                </div>
                <span className={`text-xs ${i === stepIndex ? "font-semibold" : "text-muted-foreground"}`}>
                  {STEP_LABELS[id]}
                </span>
                {i < STEP_IDS.length - 1 && <div className="h-px w-4 bg-border sm:w-8" />}
              </div>
            ))}
          </div>

          <Card className="relative overflow-hidden border-border/60 bg-card/60 p-6">
            <div aria-hidden className="mp-card-accent-bar absolute inset-x-0 top-0 h-1" />

            {step === "upload" && (
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
              </div>
            )}

            {step === "analysis" && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <h3 className="font-display text-lg font-semibold">
                    {l ? "AI-анализ товара" : "AI product analysis"}
                  </h3>
                </div>
                {analyzeMutation.isPending && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {l ? "Распознаём товар по фото..." : "Recognizing product from photo..."}
                  </div>
                )}
                {analysis && !analyzeMutation.isPending && (
                  <p className="whitespace-pre-wrap rounded-lg border border-border/60 bg-background/40 p-4 text-sm leading-relaxed text-muted-foreground">
                    {analysis}
                  </p>
                )}
                {analysisWarnings.length > 0 && (
                  <div className="flex flex-col gap-1 text-xs text-amber-600 dark:text-amber-400">
                    {analysisWarnings.map((w, i) => (
                      <div key={i}>{w}</div>
                    ))}
                  </div>
                )}
                <div>
                  <Label className="mb-2 block">
                    {l ? "Дополните описание, если нужно" : "Refine the description if needed"}
                  </Label>
                  <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} />
                </div>
                {analyzeMutation.isError && (
                  <Button variant="outline" size="sm" onClick={() => analyzeMutation.mutate()}>
                    {l ? "Повторить анализ" : "Retry analysis"}
                  </Button>
                )}
              </div>
            )}

            {step === "content" && (
              <div className="space-y-4">
                <Label>{l ? "Что генерируем?" : "What are we generating?"}</Label>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      { id: "photo" as ContentType, icon: ImageIcon, label: l ? "Фото" : "Photo", desc: l ? "Реалистичный кадр товара" : "Realistic product shot" },
                      { id: "infographic" as ContentType, icon: Layers, label: l ? "Инфографика" : "Infographic", desc: l ? "Фото + текстовые блоки поверх" : "Photo with text overlays" },
                    ]
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => setContentType(opt.id)}
                      className={`flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors ${
                        contentType === opt.id ? "border-primary bg-primary/5" : "border-border/60 hover:border-primary/40"
                      }`}
                    >
                      <opt.icon className="h-5 w-5 text-primary" />
                      <div className="font-medium">{opt.label}</div>
                      <div className="text-xs text-muted-foreground">{opt.desc}</div>
                    </button>
                  ))}
                </div>
                {contentType === "infographic" && (
                  <p className="text-xs text-muted-foreground">
                    {l
                      ? "Текстовые блоки можно будет добавить и отредактировать прямо на результате."
                      : "Text overlays can be added and edited directly on the result."}
                  </p>
                )}
              </div>
            )}

            {step === "scenario" && (
              <div className="space-y-4">
                <Label>{l ? "Сценарий демонстрации товара" : "Product scenario"}</Label>
                <div className="grid gap-3 sm:grid-cols-2">
                  {SCENARIOS.map((s) => {
                    const allowed = scenarioAllowed.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        disabled={!allowed}
                        onClick={() => setScenario(s.id)}
                        className={`flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition-colors ${
                          !allowed
                            ? "cursor-not-allowed border-border/40 opacity-40"
                            : scenario === s.id
                              ? "border-primary bg-primary/5"
                              : "border-border/60 hover:border-primary/40"
                        }`}
                      >
                        <div className="font-medium">{s.label}</div>
                        <div className="text-xs text-muted-foreground">{s.desc}</div>
                      </button>
                    );
                  })}
                </div>
                {scenarioAllowed.length === 1 && (
                  <p className="text-xs text-muted-foreground">
                    {l
                      ? "Для этого маркетплейса разрешён только чистый белый фон без сцены."
                      : "This marketplace only allows a clean white background."}
                  </p>
                )}
              </div>
            )}

            {step === "angle" && (
              <div className="space-y-4">
                <Label>{l ? "Ракурс камеры" : "Camera angle"}</Label>
                <div className="flex flex-wrap gap-2">
                  {ANGLES.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => setAngle(a.id)}
                      className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                        angle === a.id
                          ? "border-primary bg-primary/10 font-medium"
                          : "border-border/60 hover:border-primary/40"
                      }`}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === "prompt" && (
              <div className="space-y-4">
                <div>
                  <Label className="mb-2 block">{l ? "Финальный промпт" : "Final prompt"}</Label>
                  <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} />
                </div>
                <div>
                  <Label className="mb-2 block text-xs text-muted-foreground">
                    {l ? "Быстрые пресеты (нажмите, чтобы добавить)" : "Quick presets (click to add)"}
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {QUICK_PRESETS.map((p) => (
                      <button
                        key={p}
                        onClick={() => togglePreset(p)}
                        className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                          prompt.includes(p)
                            ? "border-primary bg-primary/10 font-medium"
                            : "border-border/60 hover:border-primary/40"
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {step === "variants" && (
              <div className="space-y-6">
                <button
                  type="button"
                  onClick={() => setCompareModels((v) => !v)}
                  className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors ${
                    compareModels ? "border-primary bg-primary/5" : "border-border/60 hover:border-primary/40"
                  }`}
                >
                  <div
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                      compareModels ? "border-primary bg-primary text-primary-foreground" : "border-border"
                    }`}
                  >
                    {compareModels && <Check className="h-3.5 w-3.5" />}
                  </div>
                  <div>
                    <div className="font-medium">
                      {l ? "Тестовый режим: сравнить модели" : "Test mode: compare models"}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {l
                        ? "Один и тот же кадр сгенерируют 3 разные AI-модели (Gemini, FLUX Kontext Pro, Seedream) — удобно сравнить качество и выбрать, что нравится больше."
                        : "The same shot is generated by 3 different AI models (Gemini, FLUX Kontext Pro, Seedream) — compare quality side by side."}
                    </div>
                  </div>
                </button>

                <div className={compareModels ? "opacity-40" : ""}>
                  <Label className="mb-2 block">{l ? "Количество вариантов" : "Number of variants"}</Label>
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setNumVariants((n) => Math.max(1, n - 1))}
                      disabled={numVariants <= 1 || compareModels}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span className="w-8 text-center font-display text-xl font-bold">
                      {compareModels ? 3 : numVariants}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setNumVariants((n) => Math.min(4, n + 1))}
                      disabled={numVariants >= 4 || compareModels}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="rounded-xl border border-border/60 bg-background/40 p-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    {l ? "Стоимость" : "Cost"}
                  </div>
                  <div className="mt-1 font-display text-2xl font-bold">
                    {CREDITS_PER_VARIANT * (compareModels ? 3 : numVariants)}{" "}
                    <span className="text-sm font-medium text-muted-foreground">{t.dashboard.credits}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {CREDITS_PER_VARIANT} × {compareModels ? 3 : numVariants}
                  </div>
                </div>

                <Button
                  onClick={() => generateMutation.mutate()}
                  disabled={generateMutation.isPending}
                  className="w-full bg-gradient-brand text-white hover:opacity-90"
                >
                  {generateMutation.isPending ? (
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
              </div>
            )}

            {step !== "variants" && (
              <div className="mt-6 flex items-center justify-between border-t border-border/60 pt-4">
                <Button variant="ghost" onClick={goBack} disabled={stepIndex === 0}>
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  {l ? "Назад" : "Back"}
                </Button>
                <Button onClick={goNext} disabled={!canGoNext || uploadMutation.isPending}>
                  {uploadMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      {l ? "Далее" : "Next"}
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            )}
            {step === "variants" && stepIndex > 0 && (
              <div className="mt-4">
                <Button variant="ghost" onClick={goBack} disabled={generateMutation.isPending}>
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  {l ? "Назад" : "Back"}
                </Button>
              </div>
            )}
          </Card>
        </>
      )}

      {generateMutation.isPending && (
        <Card className="border-border/60 bg-card/60 p-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="h-4 w-4 text-primary" />
            {t.newGen.processing}...
          </div>
          <Progress value={progress} className="mt-3" />
        </Card>
      )}

      {warnings.length > 0 && !generateMutation.isPending && (
        <div className="flex flex-col gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300">
          {warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>{w}</div>
            </div>
          ))}
        </div>
      )}

      {showingResults && (
        <Card className="border-border/60 bg-card/60 p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-display text-xl font-semibold">{t.newGen.results}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {l
                  ? `Сгенерировано вариантов: ${variants.length}. Нажмите "Инфографика" на карточке, чтобы добавить текст.`
                  : `${variants.length} variant(s) generated. Click "Infographic" on a card to add text.`}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={resetAll}>
              <RotateCcw className="mr-2 h-4 w-4" />
              {l ? "Новая генерация" : "New generation"}
            </Button>
          </div>

          <div className={`grid gap-6 ${variants.length > 1 ? "sm:grid-cols-2" : ""}`}>
            {variants.map((v) => (
              <div key={v.id} className="space-y-3">
                {v.modelLabel && (
                  <div className="inline-flex items-center rounded-full border border-border/60 bg-background/60 px-3 py-1 text-xs font-medium">
                    {v.modelLabel}
                  </div>
                )}
                {overlayFor === v.id ? (
                  <div style={{ containerType: "inline-size" as const }}>
                    <CardOverlayEditor
                      imageUrl={v.outputUrl}
                      lang={lang === "ru" ? "ru" : "en"}
                      initial={{ title: prompt.split(/[.,\n]/)[0].slice(0, 40) || "Название товара" }}
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <img src={v.outputUrl} alt="" className="w-full rounded-xl border border-border/60" />
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" asChild>
                        <a href={v.outputUrl} download>
                          {l ? "Скачать" : "Download"}
                        </a>
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setOverlayFor(v.id)}>
                        <LayoutGrid className="mr-2 h-4 w-4" />
                        {l ? "Инфографика" : "Infographic"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {generateMutation.isError && !generateMutation.isPending && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>{(generateMutation.error as Error).message}</div>
        </div>
      )}
    </div>
  );
}
