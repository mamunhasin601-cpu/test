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
});

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

const CREDITS_COST = 15;

type GenResult = {
  id: string;
  outputUrl: string;
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
    const { data: newBalance, error: spendErr } = await supabase.rpc("spend_credits", {
      _amount: CREDITS_COST,
    });
    if (spendErr) {
      if (spendErr.message.includes("insufficient_credits")) throw new Error("insufficient_credits");
      throw new Error(spendErr.message);
    }

    const { data: gen, error: insErr } = await supabase
      .from("generations")
      .insert({
        user_id: userId,
        prompt: data.prompt,
        category: data.category ?? null,
        input_image_url: data.inputImageUrl ?? null,
        status: "processing",
        credits_cost: CREDITS_COST,
      })
      .select("id")
      .single();
    if (insErr || !gen) throw new Error(insErr?.message ?? "insert_failed");

    try {
      const preset = PRESETS[data.marketplace];
      const imagePrompt = buildHeroCellPrompt(analysisResult.analysis, data.prompt, preset);
      console.log(
        "[generateCard] marketplace:",
        data.marketplace,
        "aspectRatio:",
        preset.aspectRatio,
        "prompt_length:",
        imagePrompt.length,
      );

      // img2img через OpenRouter: передаём исходное фото товара как визуальную
      // основу, а не только текстовое описание. gemini-3.1-flash-image-preview
      // ("Nano Banana 2") переносит РЕАЛЬНЫЙ товар с фото в новую сцену, сохраняя
      // форму/цвет/детали — в отличие от прежнего text-to-image (gpt-image-2),
      // который рисовал товар заново по описанию аналитика.
      // OpenRouter отдаёт картинки только через /v1/chat/completions с
      // modalities: ["image","text"] — отдельного /v1/images/generations
      // эндпоинта, как у Lovable AI Gateway / OpenAI, здесь нет.
      const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          // Необязательные, но рекомендованные OpenRouter атрибуты запроса —
          // не влияют на работу, можно заменить/убрать.
          "HTTP-Referer": process.env.OPENROUTER_SITE_URL ?? "https://exact-match.app",
          "X-Title": "Exact Match",
        },
        body: JSON.stringify({
          model: "google/gemini-3.1-flash-image-preview",
          messages: [
            {
              role: "user",
              content: [
                { type: "image_url", image_url: { url: data.inputImageUrl } },
                { type: "text", text: imagePrompt },
              ],
            },
          ],
          modalities: ["image", "text"],
          image_config: { aspect_ratio: preset.aspectRatio },
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        if (resp.status === 429) throw new Error("rate_limited");
        if (resp.status === 402) throw new Error("ai_credits_exhausted");
        if (
          resp.status === 400 &&
          (errText.includes("content_policy") || errText.includes("safety"))
        ) {
          throw new Error("image_moderation_blocked");
        }
        throw new Error(`ai_error_${resp.status}: ${errText.slice(0, 200)}`);
      }

      // Формат ответа подтверждён документацией OpenRouter для image-generation
      // моделей: choices[0].message.images[0].image_url.url в виде
      // data:image/png;base64,.... Остальные ветки оставлены как safety net
      // на случай смены модели/провайдера без переписывания парсинга.
      const json = (await resp.json()) as {
        data?: Array<{ b64_json?: string }>;
        choices?: Array<{
          message?: {
            images?: Array<{ image_url?: { url?: string } }>;
            content?: Array<{ type?: string; image_url?: { url?: string } }>;
          };
        }>;
      };

      const rawDataUrl =
        json.choices?.[0]?.message?.images?.[0]?.image_url?.url ??
        json.choices?.[0]?.message?.content?.find((c) => c.type === "image_url")?.image_url?.url;

      let b64: string | undefined = json.data?.[0]?.b64_json;
      if (!b64 && rawDataUrl) {
        // data:image/png;base64,AAAA... -> вытаскиваем чистый base64
        const match = /^data:[^;]+;base64,(.+)$/.exec(rawDataUrl);
        b64 = match ? match[1] : rawDataUrl;
      }
      if (!b64) throw new Error("no_image_returned");

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

      console.log("[generateCard] total_ms:", Date.now() - t0);

      return {
        id: gen.id,
        outputUrl: signed?.signedUrl ?? "",
        balance: newBalance as number,
        analysis: analysisResult.analysis,
        warnings: analysisResult.warnings,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[generateCard] failed", {
        category: data.category,
        promptLength: data.prompt.length,
        hasImage: !!data.inputImageUrl,
        totalMs: Date.now() - t0,
        error: message,
      });
      await supabase
        .from("generations")
        .update({ status: "failed", error: message })
        .eq("id", gen.id);
      throw err;
    }
  });

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
): string {
  const textBlock = preset.allowText
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

  const textTaskBlock = preset.allowText
    ? `— сам придумай короткий русский заголовок (1-3 слова) и подзаголовок (не более 5-6 слов), помести их аккуратно в композицию;
— если из анализа следует тип подключения, совместимость, ключевая характеристика или состав комплекта — вынеси ОДНУ из них мелким читаемым текстом в нижнюю часть карточки на русском языке;
— весь видимый текст — на русском (кириллица), идеально читаемый, без опечаток и «фейковых» букв;`
    : `— НИКАКОГО текста, надписей, слоганов, цифр, подписей и водяных знаков на изображении;
— только сам товар в кадре, без сопровождающих букв и символов;`;

  const marketplaceRules = preset.extraRules.map((r) => `— ${r}`).join("\n");

  return `Ты — арт-директор и дизайнер главной (hero) карточки товара для российских маркетплейсов. К этому запросу приложено РЕАЛЬНОЕ ФОТО товара — твоя задача НЕ нарисовать похожий товар с нуля, а ПЕРЕНЕСТИ именно ЭТОТ товар с фото в новую студийную сцену/композицию. Результат — ОДНА карточка, фотореалистичная предметная съёмка (не иллюстрация, не flat design), студийный свет, коммерческий уровень качества.

ТРЕБОВАНИЯ МАРКЕТПЛЕЙСА (СОБЛЮДАТЬ СТРОГО):
${marketplaceRules}

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
  preset.allowText
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

