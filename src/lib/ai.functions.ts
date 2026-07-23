import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const InputSchema = z.object({
  prompt: z.string().min(3).max(2000),
  category: z.string().max(64).optional(),
  // Обязательное поле: генерация работает как img2img (Gemini переносит РЕАЛЬНЫЙ
  // товар с фото в новую сцену), без исходного фото identity товара сохранить нечем.
  inputImageUrl: z.string().url(),
  marketplace: z.enum(["wb", "ozon", "ym"]).default("wb"),
  // Сценарий демонстрации товара и ракурс — шаги визарда (см. dashboard.index.tsx)
  scenario: z.enum(["white_bg", "flat_lay", "in_hand", "lifestyle"]).default("white_bg"),
  angle: z.enum(["auto", "low", "side", "three_quarter", "in_hand", "macro"]).default("auto"),
  // Фото — чистый предметный кадр без текста. Инфографика — тот же кадр, но
  // AI встраивает заголовок/подзаголовок (только если это разрешено
  // маркетплейсом, см. preset.allowText). Раньше этот выбор из визарда никуда
  // не отправлялся, и WB всегда получал встроенный текст — это и была причина
  // бага "выбрал Фото, а текст всё равно есть".
  contentType: z.enum(["photo", "infographic"]).default("photo"),
  // Сколько параллельных вариантов сгенерировать за один запуск (1-4)
  numVariants: z.number().int().min(1).max(4).default(1),
  // Тестовый режим: сгенерировать один и тот же кадр параллельно тремя
  // разными AI-моделями, чтобы сравнить качество/цену вживую. Если true —
  // numVariants игнорируется, вариантов ровно столько, сколько в COMPARE_MODELS.
  compareModels: z.boolean().default(false),
});

// Модели для тестового режима "Сравнить модели" — все доступны через тот же
// OpenRouter, без смены инфраструктуры. Цены указаны на момент подключения
// (июль 2026), могут измениться — сверяйте на openrouter.ai/models.
const COMPARE_MODELS = [
  { id: "google/gemini-3.1-flash-image-preview", label: "Gemini 3.1 Flash (Nano Banana 2)", priceHint: "~$0.07/шт" },
  { id: "black-forest-labs/flux.2-pro", label: "FLUX.2 Pro", priceHint: "~$0.04/шт" },
  { id: "bytedance-seed/seedream-4.5", label: "Seedream 4.5", priceHint: "~$0.04/шт" },
] as const;

// Основная модель для обычной генерации + запасные (пробуем по порядку, если
// предыдущая недоступна/упала). Дешевле, чем Gemini, но Gemini остаётся
// последним в цепочке как самый проверенный вариант.
const MODEL_FALLBACK_CHAIN = [
  { id: "black-forest-labs/flux.2-pro", label: "FLUX.2 Pro" },
  { id: "bytedance-seed/seedream-4.5", label: "Seedream 4.5" },
  { id: "google/gemini-3.1-flash-image-preview", label: "Gemini 3.1 Flash (Nano Banana 2)" },
] as const;

type Marketplace = "wb" | "ozon" | "ym";

type MarketplacePreset = {
  // Aspect ratio для параметра image_config.aspect_ratio у Gemini-моделей на
  // OpenRouter (поддерживаемые значения: 1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4,
  // 9:16, 16:9, 21:9) — заменяет прежний size, который был форматом
  // OpenAI /v1/images/generations и для OpenRouter не подходит.
  aspectRatio: "3:4" | "1:1";
  allowText: boolean;
  productFramePct: string; // e.g. "75-85%"
  bgRule: string;
  extraRules: string[];
};

const PRESETS: Record<Marketplace, MarketplacePreset> = {
  wb: {
    aspectRatio: "3:4",
    allowText: true,
    productFramePct: "75-85%",
    bgRule: "светлый чистый студийный фон, контрастирующий с цветом товара",
    extraRules: [
      "формат вертикальный 3:4, edge-to-edge, без полей",
      "разрешён крупный русский заголовок сверху и короткий подзаголовок",
    ],
  },
  ozon: {
    aspectRatio: "3:4",
    allowText: false,
    productFramePct: "75-85%",
    bgRule: "чистый белый фон #FFFFFF без градиентов и теней-подложек кроме мягкой контактной тени",
    extraRules: [
      "формат вертикальный 3:4, edge-to-edge, без полей",
      "СТРОГО без какого-либо текста, надписей, слоганов, цифр и подписей на изображении — только сам товар",
      "никаких плашек, стикеров, инфографики — чистый предметный шот",
    ],
  },
  ym: {
    aspectRatio: "1:1",
    allowText: false,
    productFramePct: "70-80% с обязательными белыми полями 5-10% по краям",
    bgRule: "чистый белый фон #FFFFFF",
    extraRules: [
      "формат квадратный 1:1",
      "ОБЯЗАТЕЛЬНЫ равномерные белые отступы 5-10% со всех сторон, товар не касается краёв",
      "СТРОГО без какого-либо текста, надписей и цифр на изображении",
      "никаких плашек, стикеров, инфографики",
    ],
  },
};

// Тексты для шага "Сценарий" визарда — что именно происходит с товаром в кадре
const SCENARIO_RULES: Record<string, string> = {
  white_bg:
    "Классическая предметная фотография — товар на чистом нейтральном/белом фоне, базовый кадр для карточки маркетплейса.",
  flat_lay:
    "Вид строго сверху (flat lay) — товар (и уместные комплектующие/аксессуары к нему) разложен на плоской поверхности, камера смотрит вертикально вниз.",
  in_hand:
    "Товар ФИЗИЧЕСКИ УДЕРЖИВАЕТСЯ пальцами руки крупным планом — пальцы явно обхватывают товар так, как человек держал бы его в реальности (не просто рука или запястье присутствуют где-то в кадре рядом с товаром). Рука и товар — единая композиция, рука занимает заметную часть кадра, между рукой и товаром есть очевидный физический контакт (обхват, прижим, удержание). Это НЕ раскладка товара на поверхности с рукой на заднем плане.",
  lifestyle:
    "Товар в подходящей жизненной обстановке (интерьер, природа, рабочее место — выбери сцену, естественную именно для этой категории товара), стиль lifestyle-фотографии, не студийный.",
};

// Тексты для шага "Ракурс" визарда
const ANGLE_RULES: Record<string, string> = {
  auto: "Ракурс выбери сам — наиболее выигрышный именно для этого товара.",
  low: "Низкий ракурс (hero-shot) — камера немного снизу, товар выглядит крупнее и внушительнее.",
  side: "Ракурс строго сбоку (профиль) — показывает толщину и боковую форму товара.",
  three_quarter: "Ракурс 3/4 — универсальный рекламный угол, показывает и фронт, и объём.",
  in_hand: "Ракурс крупным планом на пальцы руки, которые ДЕРЖАТ товар — товар явно зажат/обхвачен пальцами, а не просто лежит рядом с рукой или на заднем плане; масштаб товара виден относительно руки.",
  macro: "Макро-план — крупный кадр с акцентом на текстуру материала и мелкие детали.",
};

const CREDITS_COST_PER_VARIANT = 15;

type GenVariant = { id: string; outputUrl: string; modelLabel?: string };

type GenResult = {
  variants: GenVariant[];
  balance: number;
  analysis: string;
  warnings: string[];
};

type AnalysisResult = {
  success: boolean;
  analysis: string;
  warnings: string[];
  fallbackUsed: boolean;
  errorCode?: "empty_input" | "empty_analysis" | "timeout" | "moderation" | "unknown";
};

// Шаг "AI-анализ" визарда — только анализ, кредиты не списываются. Пользователь
// видит распознанный товар и может доработать текстовое описание (prompt) перед
// тем, как двигаться дальше по шагам визарда.
export const analyzeProductStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        prompt: z.string().min(1).max(2000),
        category: z.string().max(64).optional(),
        inputImageUrl: z.string().url(),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<AnalysisResult> => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured");
    return analyzeProduct(apiKey, data.prompt, data.category, data.inputImageUrl);
  });

// Шаг "Инфографика", часть 1: предложить пользователю короткие характеристики
// товара на основе уже имеющегося анализа — бесплатно, кредиты не списываются.
// Пользователь потом либо соглашается ("Подходит"), либо пишет свои.
export const proposeCharacteristics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        analysis: z.string().min(1).max(4000),
        prompt: z.string().max(2000).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<{ characteristics: string[] }> => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured");

    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.OPENROUTER_SITE_URL ?? "https://exact-match.app",
        "X-Title": "Exact Match",
      },
      body: JSON.stringify({
        model: "openai/gpt-5-mini",
        messages: [
          {
            role: "system",
            content:
              "Ты помощник продавца маркетплейса. По анализу товара составь 3-5 КОРОТКИХ характеристик " +
              "(2-5 слов каждая) для инфографики на карточке товара — то, что покупатель увидит как выноски " +
              "на фото (например: «Футболка с коротким рукавом», «Эластичный пояс со шнурком»). " +
              "Отвечай СТРОГО в формате JSON-массива строк, без пояснений: [\"...\", \"...\"]",
          },
          {
            role: "user",
            content: `Анализ товара:\n${data.analysis}\n\nОписание от продавца: ${data.prompt ?? ""}`,
          },
        ],
      }),
    });

    if (!resp.ok) throw new Error(`ai_error_${resp.status}`);
    const json = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = json.choices?.[0]?.message?.content?.trim() ?? "[]";
    const cleaned = raw.replace(/^```json\s*|```$/g, "").trim();
    let characteristics: string[] = [];
    try {
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) characteristics = parsed.filter((x) => typeof x === "string").slice(0, 5);
    } catch {
      // Модель не вернула валидный JSON — отдаём пустой список, фронтенд
      // предложит пользователю написать характеристики самому.
    }
    return { characteristics };
  });

// Шаг "Инфографика", часть 2: сгенерировать вариант с выносками-характеристиками
// поверх УЖЕ готового фото (referencing тот же результат, а не исходное фото
// товара) — это отдельная платная генерация, кредиты списываются как за
// обычный вариант.
export const generateInfographicVariant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        baseImageUrl: z.string().url(),
        characteristics: z.array(z.string().min(1).max(80)).min(1).max(6),
        marketplace: z.enum(["wb", "ozon", "ym"]).default("wb"),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<{ id: string; outputUrl: string; balance: number }> => {
    const { supabase, userId } = context;
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured");

    const preset = PRESETS[data.marketplace];
    if (!preset.allowText) {
      // Ozon/ЯМ строго запрещают текст на главном фото — инфографика для них
      // не создаётся вообще, фронтенд не должен даже показывать эту кнопку
      // для этих площадок, но на бэкенде тоже подстрахуемся.
      throw new Error("infographic_not_allowed_for_marketplace");
    }

    const { data: newBalance, error: spendErr } = await supabase.rpc("spend_credits", {
      _amount: CREDITS_COST_PER_VARIANT,
    });
    if (spendErr) {
      if (spendErr.message.includes("insufficient_credits")) throw new Error("insufficient_credits");
      throw new Error(spendErr.message);
    }

    const bulletsList = data.characteristics.map((c) => `— ${c}`).join("\n");
    const infographicPrompt = `Возьми ЭТО ИЗОБРАЖЕНИЕ как основу и добавь поверх него инфографику-выноски (callout) в стиле карточки маркетплейса:
${bulletsList}

Требования:
— НЕ меняй сам товар, фон, композицию, свет — они уже финальные, трогать нельзя.
— Для каждой характеристики добавь: тонкую линию-выноску от соответствующей детали товара к небольшой подписи с текстом характеристики (кириллица, читаемый шрифт без засечек).
— Подписи размещай по краям кадра, не перекрывая сам товар.
— Стиль — чистый, коммерческий, как на реальных карточках Wildberries: белые/светлые плашки под текстом, тонкие линии-указатели, без лишней графики.
— Не добавляй никакой другой текст, кроме перечисленных характеристик.`;

    let gen: { id: string } | null = null;
    try {
      const { data: insData, error: insErr } = await supabase
        .from("generations")
        .insert({
          user_id: userId,
          prompt: infographicPrompt.slice(0, 500),
          input_image_url: data.baseImageUrl,
          status: "processing",
          credits_cost: CREDITS_COST_PER_VARIANT,
        })
        .select("id")
        .single();
      if (insErr || !insData) throw new Error(insErr?.message ?? "insert_failed");
      gen = insData;

      const b64 = await callImageModel(
        apiKey,
        infographicPrompt,
        data.baseImageUrl,
        preset.aspectRatio,
        "google/gemini-3.1-flash-image-preview",
      );

      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const path = `${userId}/${gen.id}.png`;
      const { error: upErr } = await supabase.storage
        .from("generations")
        .upload(path, bytes, { contentType: "image/png", upsert: true });
      if (upErr) throw new Error(`storage_error: ${upErr.message}`);

      await supabase.from("generations").update({ status: "done", output_image_url: path }).eq("id", gen.id);
      const { data: signed } = await supabase.storage.from("generations").createSignedUrl(path, 60 * 60);

      return { id: gen.id, outputUrl: signed?.signedUrl ?? "", balance: newBalance as number };
    } catch (err) {
      if (gen) {
        const message = err instanceof Error ? err.message : String(err);
        await supabase.from("generations").update({ status: "failed", error: message }).eq("id", gen.id);
      }
      // Неудавшуюся инфографику возвращаем деньгами целиком — это отдельная
      // разовая покупка, а не один из нескольких вариантов.
      await supabase.rpc("refund_credits", { _amount: CREDITS_COST_PER_VARIANT }).catch(() => {});
      throw err;
    }
  });

export const generateCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data, context }): Promise<GenResult> => {
    const { supabase, userId } = context;
    // Endpoint временно переведён на OpenRouter (вместо Lovable AI Gateway).
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured");

    const t0 = Date.now();

    // Step 1: Analyze BEFORE spending credits. If analysis fails, user pays nothing.
    const analysisResult = await analyzeProduct(
      apiKey,
      data.prompt,
      data.category,
      data.inputImageUrl,
    );

    if (!analysisResult.success) {
      const msg = analysisResult.warnings[0] ?? "analysis_failed";
      console.error("[generateCard] analysis_failed", {
        category: data.category,
        promptLength: data.prompt.length,
        hasImage: !!data.inputImageUrl,
        error: msg,
      });
      throw new Error(msg);
    }

    // Step 2: Spend credits — analysis succeeded, we now commit to generating.
    // Списываем сразу за все запрошенные варианты одним вызовом. В режиме
    // сравнения моделей вариантов ровно столько, сколько моделей в COMPARE_MODELS.
    const variantCount = data.compareModels ? COMPARE_MODELS.length : data.numVariants;
    const totalCost = CREDITS_COST_PER_VARIANT * variantCount;
    const { data: newBalance, error: spendErr } = await supabase.rpc("spend_credits", {
      _amount: totalCost,
    });
    if (spendErr) {
      if (spendErr.message.includes("insufficient_credits")) throw new Error("insufficient_credits");
      throw new Error(spendErr.message);
    }

    const preset = PRESETS[data.marketplace];
    // Текст встраивается AI ТОЛЬКО если и маркетплейс это разрешает (WB), И
    // пользователь явно выбрал "Инфографика" на шаге типа контента. При
    // "Фото" — всегда чистый кадр без текста, для любого маркетплейса.
    const bakeText = preset.allowText && data.contentType === "infographic";
    const imagePrompt = buildHeroCellPrompt(
      analysisResult.analysis,
      data.prompt,
      preset,
      data.scenario,
      data.angle,
      bakeText,
    );
    console.log(
      "[generateCard] marketplace:",
      data.marketplace,
      "aspectRatio:",
      preset.aspectRatio,
      "scenario:",
      data.scenario,
      "angle:",
      data.angle,
      "numVariants:",
      data.numVariants,
      "compareModels:",
      data.compareModels,
      "prompt_length:",
      imagePrompt.length,
    );

    const variants: GenVariant[] = [];

    // В обычном режиме — variantCount вызовов с автоматическим фолбэком по
    // цепочке MODEL_FALLBACK_CHAIN (model: null сигнализирует "использовать
    // цепочку"). В режиме сравнения — по одному вызову на каждую модель из
    // COMPARE_MODELS, без фолбэка (сравниваем именно эти модели, а не замену).
    const jobs: { model: string | null; label?: string }[] = data.compareModels
      ? COMPARE_MODELS.map((m) => ({ model: m.id, label: m.label }))
      : Array.from({ length: data.numVariants }, () => ({ model: null }));

    // Генерируем варианты по одному — каждый идёт своей строкой в `generations`,
    // чтобы у пользователя была честная история (и можно было отследить, какой
    // именно вариант не удался, если что-то пойдёт не так на одном из них).
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      const { data: gen, error: insErr } = await supabase
        .from("generations")
        .insert({
          user_id: userId,
          prompt: data.prompt,
          category: data.category ?? null,
          input_image_url: data.inputImageUrl ?? null,
          status: "processing",
          credits_cost: CREDITS_COST_PER_VARIANT,
        })
        .select("id")
        .single();
      if (insErr || !gen) throw new Error(insErr?.message ?? "insert_failed");

      try {
        // Если у job задана конкретная модель (режим сравнения) — используем
        // только её, без фолбэка. Иначе (обычная генерация) — пробуем модели
        // из MODEL_FALLBACK_CHAIN по порядку, пока одна не сработает.
        const chain = job.model ? [{ id: job.model, label: job.label }] : MODEL_FALLBACK_CHAIN;
        let b64: string | undefined;
        let usedLabel: string | undefined = job.label;
        let lastErr: unknown;
        for (const candidate of chain) {
          try {
            b64 = await callImageModel(apiKey, imagePrompt, data.inputImageUrl, preset.aspectRatio, candidate.id);
            usedLabel = job.model ? job.label : candidate.label;
            break;
          } catch (err) {
            lastErr = err;
            console.error("[generateCard] model_attempt_failed", {
              model: candidate.id,
              variantIndex: i,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
        if (!b64) throw lastErr instanceof Error ? lastErr : new Error("all_models_failed");

        const mime = "image/png";
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

        const path = `${userId}/${gen.id}.png`;
        const { error: upErr } = await supabase.storage
          .from("generations")
          .upload(path, bytes, { contentType: mime, upsert: true });
        if (upErr) throw new Error(`storage_error: ${upErr.message}`);

        await supabase
          .from("generations")
          .update({ status: "done", output_image_url: path, analysis: analysisResult.analysis })
          .eq("id", gen.id);

        const { data: signed } = await supabase.storage
          .from("generations")
          .createSignedUrl(path, 60 * 60);

        variants.push({ id: gen.id, outputUrl: signed?.signedUrl ?? "", modelLabel: usedLabel });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[generateCard] variant_failed", {
          variantIndex: i,
          category: data.category,
          totalMs: Date.now() - t0,
          error: message,
        });
        await supabase
          .from("generations")
          .update({ status: "failed", error: message })
          .eq("id", gen.id);
        // Раньше здесь был ранний throw для единственного варианта — из-за
        // этого деньги за него не возвращались вообще (обычная генерация без
        // сравнения моделей). Теперь просто продолжаем — цикл завершится,
        // ниже единая логика посчитает failedCount и вернёт кредиты, а если
        // успешных вариантов 0 — бросит all_variants_failed уже ПОСЛЕ возврата.
      }
    }

    // Возврат кредитов за неудавшиеся варианты. Раньше кредиты списывались
    // сразу за все jobs.length штук, а за упавшие — не возвращались вообще.
    // Именно из-за этого при частичном сбое (например, в режиме сравнения
    // моделей, когда 2 из 3 моделей не ответили) с пользователя списывалось
    // за 3, а получал он 1 — деньги за 2 неудавшихся сгорали молча. Теперь
    // считаем разницу и возвращаем её.
    const failedCount = jobs.length - variants.length;
    let finalBalance = newBalance as number;
    if (failedCount > 0) {
      const refundAmount = CREDITS_COST_PER_VARIANT * failedCount;
      const { data: refundedBalance, error: refundErr } = await supabase.rpc("refund_credits", {
        _amount: refundAmount,
      });
      if (refundErr) {
        // Не роняем весь запрос из-за неудавшегося возврата — пользователь
        // и так получит хотя бы то, что сгенерировалось; ошибку логируем,
        // чтобы можно было вернуть кредиты вручную при разборе инцидента.
        console.error("[generateCard] refund_failed", { failedCount, refundAmount, error: refundErr.message });
      } else {
        finalBalance = refundedBalance as number;
      }
    }

    if (variants.length === 0) {
      throw new Error("all_variants_failed");
    }

    console.log(
      "[generateCard] total_ms:",
      Date.now() - t0,
      "succeeded:",
      variants.length,
      "failed:",
      failedCount,
    );

    return {
      variants,
      balance: finalBalance,
      analysis: analysisResult.analysis,
      warnings:
        failedCount > 0
          ? [
              ...analysisResult.warnings,
              `${failedCount} из ${jobs.length} вариантов не удалось сгенерировать — кредиты за них возвращены.`,
            ]
          : analysisResult.warnings,
    };
  });

// Один вызов модели генерации изображения (img2img через OpenRouter). Вынесен
// отдельно, чтобы вызывать в цикле для нескольких вариантов/моделей за один запуск.
async function callImageModel(
  apiKey: string,
  imagePrompt: string,
  inputImageUrl: string,
  aspectRatio: MarketplacePreset["aspectRatio"],
  model: string,
): Promise<string> {
  // Официальный выделенный Image API OpenRouter: POST /api/v1/images (НЕ
  // /chat/completions — это отдельный, унифицированный для всех
  // image-моделей эндпоинт с нормализованными параметрами aspect_ratio и
  // input_references для img2img). Работает одинаково для Gemini, FLUX,
  // Seedream и остальных — раньше здесь был chat/completions-формат, который
  // подходит только части моделей (в основном Gemini), из-за чего FLUX/Seedream
  // в режиме сравнения падали с ошибкой.
  const resp = await fetch("https://openrouter.ai/api/v1/images", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.OPENROUTER_SITE_URL ?? "https://exact-match.app",
      "X-Title": "Exact Match",
    },
    body: JSON.stringify({
      model,
      prompt: imagePrompt,
      aspect_ratio: aspectRatio,
      input_references: [{ type: "image_url", image_url: { url: inputImageUrl } }],
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    if (resp.status === 429) throw new Error("rate_limited");
    if (resp.status === 402) throw new Error("ai_credits_exhausted");
    if (resp.status === 502) throw new Error("generation_failed_upstream");
    if (resp.status === 400 && (errText.includes("content_policy") || errText.includes("safety"))) {
      throw new Error("image_moderation_blocked");
    }
    throw new Error(`ai_error_${resp.status}: ${errText.slice(0, 200)}`);
  }

  // Формат ответа dedicated Image API: { data: [{ b64_json, media_type }], usage }
  const json = (await resp.json()) as { data?: Array<{ b64_json?: string }> };
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error("no_image_returned");
  return b64;
}

async function analyzeProduct(
  apiKey: string,
  userPrompt: string,
  category: string | undefined,
  imageUrl: string,
): Promise<AnalysisResult> {
  const warnings: string[] = [];
  // fallbackUsed зарезервирован под будущие сценарии деградации анализа
  // (например, при таймауте vision-части) — сейчас фото всегда есть.
  const fallbackUsed = false;

  const trimmed = userPrompt.trim();
  if (!trimmed) {
    warnings.push("Описание не предоставлено — анализ будет основан только на изображении");
  }

  const sys = ANALYST_SYSTEM_PROMPT;
  const userText = buildAnalystUserPrompt(category ?? "general", trimmed, true);

  const userContent: unknown = [
    { type: "image_url", image_url: { url: imageUrl } },
    { type: "text", text: userText },
  ];

  try {
    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.OPENROUTER_SITE_URL ?? "https://exact-match.app",
        "X-Title": "Exact Match",
      },
      body: JSON.stringify({
        model: "openai/gpt-5-mini",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: userContent },
        ],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      if (resp.status === 429) {
        return {
          success: false,
          analysis: "",
          warnings: [...warnings, "Слишком много запросов к аналитику — попробуйте через минуту"],
          fallbackUsed,
          errorCode: "unknown",
        };
      }
      if (
        resp.status === 400 &&
        (errText.includes("content_policy") || errText.includes("safety"))
      ) {
        return {
          success: false,
          analysis: "",
          warnings: [...warnings, "Изображение не прошло модерацию — попробуйте другое фото товара"],
          fallbackUsed,
          errorCode: "moderation",
        };
      }
      return {
        success: false,
        analysis: "",
        warnings: [...warnings, `Ошибка аналитика (${resp.status})`],
        fallbackUsed,
        errorCode: "unknown",
      };
    }

    const json = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const analysis = json.choices?.[0]?.message?.content?.trim() ?? "";

    if (!analysis || analysis.length < 100) {
      return {
        success: false,
        analysis: "",
        warnings: [
          ...warnings,
          "Модель не смогла составить анализ товара — проверьте описание или изображение",
        ],
        fallbackUsed,
        errorCode: "empty_analysis",
      };
    }

    const notRecognizedPhrases = [
      "не могу определить",
      "невозможно идентифицировать",
      "недостаточно информации",
      "не удалось распознать",
    ];
    const analysisLower = analysis.toLowerCase();
    if (notRecognizedPhrases.some((p) => analysisLower.includes(p))) {
      warnings.push("Товар не распознан однозначно — карточка будет создана на основе частичных данных");
    }

    console.log("[analyzeProduct] length:", analysis.length, "fallback:", fallbackUsed, "warnings:", warnings.length);


    return {
      success: true,
      analysis: analysis.slice(0, 4000),
      warnings,
      fallbackUsed,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("timeout") || msg.includes("ETIMEDOUT")) {
      return {
        success: false,
        analysis: "",
        warnings: [...warnings, "Превышено время ожидания ответа от аналитика — попробуйте ещё раз"],
        fallbackUsed,
        errorCode: "timeout",
      };
    }
    return {
      success: false,
      analysis: "",
      warnings: [...warnings, `Ошибка аналитика: ${msg}`],
      fallbackUsed,
      errorCode: "unknown",
    };
  }
}

function buildAnalystUserPrompt(category: string, userPrompt: string, hasImage: boolean): string {
  const imageNote = hasImage
    ? "Изображение товара приложено — используй его как основной источник визуальной информации."
    : "Изображение не приложено — составь анализ только на основе описания и своих знаний о данном товаре.";

  return `Категория: ${category}
Описание пользователя: ${userPrompt || "(не указано)"}
${imageNote}

Важно: все конкретные характеристики (бренд, модель, объём, размер, цвет, аромат, стойкость и любые числовые данные) передай в анализе дословно. Не домысливай детали, которых нет ни в описании, ни на изображении, ни в официальных данных о модели.`;
}

const ANALYST_SYSTEM_PROMPT = `Ты — товарный аналитик для карточек Wildberries/Ozon. По описанию товара, категории и приложенному изображению составь подробный анализ на русском языке (5-10 предложений), который будет передан модели-художнику для генерации главной карточки товара.

АЛГОРИТМ РАБОТЫ — выполняй строго по шагам:

ШАГ 1 — ИДЕНТИФИКАЦИЯ ТОВАРА
Если приложено изображение:
— внимательно изучи его: форма, цвет, логотип, надписи, конструктивные детали;
— определи бренд и модель по визуальным признакам;
— если бренд или модель явно указаны на изображении — считай их достоверными.

Если описание пользователя неполное или отсутствует:
— используй изображение как основной источник идентификации;
— определи категорию, бренд и модель самостоятельно по внешнему виду.

ШАГ 2 — ПОЛУЧЕНИЕ ОФИЦИАЛЬНЫХ ХАРАКТЕРИСТИК
Если удалось определить бренд и модель:
— используй свои знания об официальных характеристиках этой модели (название, технические параметры, ключевые особенности);
— официальные данные имеют приоритет над описанием пользователя, если пользователь допустил неточность;
— если пользователь указал характеристику, которой нет в официальных данных — сохрани её, но отметь как «указано пользователем».

ШАГ 3 — ДОПОЛНЕНИЕ НЕПОЛНОГО ОПИСАНИЯ
Если описание пользователя есть, но неполное:
— дополни недостающие характеристики из своих знаний о данной модели;
— не домысливай и не придумывай — только проверенные данные;
— характеристики из описания пользователя, совпадающие с официальными, передавай дословно.

Если не удаётся уверенно идентифицировать товар ни по изображению, ни по описанию — прямо укажи в ответе фразу «не удалось распознать» и объясни, каких данных не хватает.

ШАГ 4 — СОСТАВЛЕНИЕ АНАЛИЗА
Пиши в следующем порядке:
1. Что это за товар — точное название, бренд, модель, тип и назначение.
2. Точные визуальные признаки: форма, цвет, материал, конструктивные детали.
3. Целевая аудитория и сценарии использования с учётом категории.
4. Ключевые преимущества и характеристики — цифры и свойства передавай точно.
5. Настроение и визуальный стиль подачи: фон, освещение, атмосфера для данной категории товара.

Пиши плотно, связным текстом, без воды. Никаких markdown-заголовков, списков, кавычек и скобок — только сплошной аналитический текст.`;

function buildHeroCellPrompt(
  analysis: string,
  userPrompt: string,
  preset: MarketplacePreset,
  scenario: string,
  angle: string,
  bakeText: boolean,
): string {
  const textBlock = bakeText
    ? `ОРИЕНТИР ПО СТИЛЮ:
— крупный жирный русский заголовок в 2-3 строки в верхней части;
— чуть ниже — короткий русский подзаголовок / слоган, не более 5-6 слов;
— товар — герой композиции, занимает ${preset.productFramePct} кадра, верхняя треть — для заголовка;
— ${preset.bgRule}; никаких декоративных теней, лучей и диагональных бликов — только мягкое равномерное студийное освещение;
— лёгкая тень-подложка под товаром для объёма;
— общая подача: премиум, свежо, высокая конверсия.`
    : `ОРИЕНТИР ПО СТИЛЮ:
— товар — единственный герой композиции, занимает ${preset.productFramePct} кадра;
— ${preset.bgRule};
— мягкое равномерное студийное освещение, без декоративных теней, лучей и диагональных бликов;
— лёгкая контактная тень под товаром для объёма;
— общая подача: чистый предметный шот коммерческого уровня.`;

  const textTaskBlock = bakeText
    ? `— сам придумай короткий русский заголовок (1-3 слова) и подзаголовок (не более 5-6 слов), помести их аккуратно в композицию;
— если из анализа следует тип подключения, совместимость, ключевая характеристика или состав комплекта — вынеси ОДНУ из них мелким читаемым текстом в нижнюю часть карточки на русском языке;
— весь видимый текст — на русском (кириллица), идеально читаемый, без опечаток и «фейковых» букв;`
    : `— НИКАКОГО текста, надписей, слоганов, цифр, подписей и водяных знаков на изображении;
— только сам товар в кадре, без сопровождающих букв и символов;`;

  const marketplaceRules = preset.extraRules.map((r) => `— ${r}`).join("\n");

  const scenarioText = SCENARIO_RULES[scenario] ?? SCENARIO_RULES.white_bg;
  const angleText = ANGLE_RULES[angle] ?? ANGLE_RULES.auto;
  // Примечание: для Ozon/ЯМ требования маркетплейса (чистый белый фон, без
  // текста) — приоритетнее сценария. Фронтенд ограничивает выбор сценария на
  // этих площадках до "белый фон", но на всякий случай явно проговариваем
  // порядок приоритета в самом промпте.
  const sceneBlock = `СЦЕНАРИЙ И РАКУРС:
— Сцена: ${scenarioText}
— Ракурс: ${angleText}
Если сценарий противоречит требованиям маркетплейса выше (например, площадка требует строго белый фон) — требования маркетплейса ИМЕЮТ ПРИОРИТЕТ.`;

  return `Ты — арт-директор и дизайнер главной (hero) карточки товара для российских маркетплейсов. К этому запросу приложено РЕАЛЬНОЕ ФОТО товара — твоя задача НЕ нарисовать похожий товар с нуля, а ПЕРЕНЕСТИ именно ЭТОТ товар с фото в новую студийную сцену/композицию. Результат — ОДНА карточка, фотореалистичная предметная съёмка (не иллюстрация, не flat design), студийный свет, коммерческий уровень качества.

ТРЕБОВАНИЯ МАРКЕТПЛЕЙСА (СОБЛЮДАТЬ СТРОГО):
${marketplaceRules}

${sceneBlock}

${textBlock}

РЕФЕРЕНС ТОВАРА (ОБЯЗАТЕЛЬНО К ИСПОЛНЕНИЮ):
Приложенное изображение товара — ЕДИНСТВЕННЫЙ источник истины о том, как товар выглядит. Ты обязан точно воспроизвести с фото, без изменений:
— форму, силуэт и конструктивные детали товара;
— цвет и фактуру материала — ровно те же оттенки, что на фото;
— все декоративные детали (вышивка, кружево, логотип, паттерн, надписи на самом товаре и т.д.).
НЕ изменяй фасон, конструкцию и детали товара даже частично. НЕ придумывай товар заново — меняется только сцена/фон/свет/ракурс вокруг него, сам товар остаётся тем же самым, что на фото.
Анализ от аналитика дополняет референс смыслом (для текста на карточке и композиции), но НЕ заменяет фото визуально и не даёт права переосмыслить внешний вид товара.

АНАЛИЗ ТОВАРА:
"""
${analysis}
"""

ИСХОДНЫЙ ЗАПРОС ПОЛЬЗОВАТЕЛЯ: "${userPrompt}"

${
  bakeText
    ? `ВАЖНО — ОБЯЗАТЕЛЬНЫЕ ЭЛЕМЕНТЫ ИЗ ЗАПРОСА ПОЛЬЗОВАТЕЛЯ:
— если указан бренд — он ОБЯЗАТЕЛЬНО присутствует в тексте на карточке, точно и без искажений;
— если указаны числовые характеристики (объём, размер, вес, сроки и т.д.) — они ОБЯЗАТЕЛЬНО отображаются на карточке крупно и читаемо;
— если указан ключевой аромат, цвет, вкус или потребительское свойство — оно отражается в заголовке или подзаголовке;
— все данные берутся ТОЧНО из запроса, без домысливания.`
    : `ВАЖНО:
— все текстовые характеристики из запроса пользователя НЕ отображаются на изображении (текст запрещён правилами маркетплейса);
— визуально передай только сам товар, его форму, цвет и материал согласно запросу.`
}

ТВОЯ ЗАДАЧА:
— сам придумай композицию, ракурс товара, цветовую гамму фона в рамках правил маркетплейса выше;
${textTaskBlock}
— для категории «одежда и аксессуары»: манекен БЕЗ головы или флэтлэй; голова манекена в кадре недопустима;
— НЕ рисуй бейджи / плашки со скидками / цены / иконки с подписями / логотипы брендов / знаки качества / сертификаты;
— упаковка НЕ должна занимать более 20% площади кадра;
— НЕ придумывай характеристики, которых нет в запросе и анализе.`;
}

