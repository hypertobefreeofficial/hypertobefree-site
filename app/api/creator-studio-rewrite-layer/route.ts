import { createClient } from "@supabase/supabase-js";

type RewriteAction =
  | "keep-words"
  | "clearer"
  | "worshipful"
  | "shorter"
  | "stronger"
  | "alternatives";

const layerLabels: Record<string, string> = {
  title: "headline",
  overlay: "subtitle",
  caption: "caption",
  scripture: "scripture reference",
  callToAction: "closing testimony line",
};

const actionInstructions: Record<RewriteAction, string> = {
  "keep-words":
    "Apply only light punctuation, capitalization, and spacing fixes. Keep the same words in the same order. Do not add new ideas.",
  clearer:
    "Make the wording slightly clearer with a light polish only. Preserve the user's exact meaning, facts, and emotional tone. Change as few words as possible.",
  worshipful:
    "Add a gentle worshipful tone while preserving the user's meaning and words as much as possible. Do not invent a new story.",
  shorter:
    "Shorten the wording while preserving the same meaning and key words from the original.",
  stronger:
    "Rewrite more boldly and declaratively, but still preserve the user's core meaning. Do not invent new themes the user did not mention.",
  alternatives:
    "Return exactly 5 distinct alternative phrasings that preserve the user's meaning. Each option should stay close to the original words and intent.",
};

const forbiddenInventionTerms = [
  "fear",
  "freedom",
  "transformation",
  "healing",
  "deliverance",
  "breakthrough",
  "chains",
  "darkness to light",
];

function readBearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

function readConfiguredEnv(name: string) {
  return process.env[name]?.trim() ?? "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function sentenceCase(text: string) {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function keepWordsFallback(currentText: string) {
  const trimmed = currentText.trim().replace(/\s+/g, " ");
  if (!trimmed) return trimmed;

  const withJesusHonorifics = trimmed
    .replace(/\bthank you jesus\b/gi, "Thank You, Jesus")
    .replace(/\bthank you lord\b/gi, "Thank You, Lord")
    .replace(/\bthank you god\b/gi, "Thank You, God");

  const punctuated = withJesusHonorifics.endsWith(".")
    ? withJesusHonorifics
    : `${withJesusHonorifics}.`;

  return sentenceCase(punctuated);
}

function clearerFallback(currentText: string) {
  return keepWordsFallback(currentText);
}

function worshipfulFallback(currentText: string) {
  const base = keepWordsFallback(currentText).replace(/\.$/, "");
  if (/^thank you/i.test(base)) {
    return `${base.replace(/^thank you/i, "Thank You")}.`;
  }
  if (/^jesus, thank you/i.test(base)) {
    return `${base}.`;
  }
  return `${base}.`;
}

function shorterFallback(currentText: string) {
  const words = currentText.trim().split(/\s+/);
  return words.slice(0, Math.max(3, Math.ceil(words.length * 0.7))).join(" ");
}

function strongerFallback(currentText: string) {
  return keepWordsFallback(currentText);
}

function alternativesFallback(currentText: string) {
  const base = keepWordsFallback(currentText).replace(/\.$/, "");

  return [
    keepWordsFallback(currentText),
    base.replace(/^thank you jesus/i, "Thank You, Jesus"),
    base.replace(/^thank you/i, "Jesus, thank You"),
    base.replace(/^thank you/i, "Thank You, Lord"),
    `${base}.`,
  ]
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 5);
}

function fallbackRewrite(
  currentText: string,
  action: RewriteAction
): { text?: string; alternatives?: string[] } {
  const trimmed = currentText.trim();
  if (!trimmed) return { text: trimmed };

  if (action === "alternatives") {
    return { alternatives: alternativesFallback(trimmed) };
  }

  if (action === "keep-words") {
    return { text: keepWordsFallback(trimmed) };
  }

  if (action === "clearer") {
    return { text: clearerFallback(trimmed) };
  }

  if (action === "worshipful") {
    return { text: worshipfulFallback(trimmed) };
  }

  if (action === "shorter") {
    return { text: shorterFallback(trimmed) };
  }

  return { text: strongerFallback(trimmed) };
}

function userMentionedTerm(text: string, term: string) {
  return text.toLowerCase().includes(term.toLowerCase());
}

function sanitizeRewrite(currentText: string, candidate: string) {
  let next = candidate.trim();
  if (!next) return keepWordsFallback(currentText);

  for (const term of forbiddenInventionTerms) {
    if (!userMentionedTerm(currentText, term) && userMentionedTerm(next, term)) {
      return fallbackRewrite(currentText, "clearer").text ?? keepWordsFallback(currentText);
    }
  }

  return next;
}

export async function POST(request: Request) {
  const accessToken = readBearerToken(request);
  const supabaseUrl = readConfiguredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseAnonKey = readConfiguredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseAnonKey) {
    return Response.json(
      { error: "Creator Studio is not configured yet." },
      { status: 503 }
    );
  }

  if (!accessToken) {
    return Response.json({ error: "Please sign in to use AI rewrite." }, { status: 401 });
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
  } = await authClient.auth.getUser(accessToken);

  if (!user) {
    return Response.json({ error: "Please sign in again." }, { status: 401 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!isRecord(body)) {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const layer = readString(body.layer) || "title";
  const rawAction = readString(body.action) || "clearer";
  const action = (
    [
      "keep-words",
      "clearer",
      "worshipful",
      "shorter",
      "stronger",
      "alternatives",
    ].includes(rawAction)
      ? rawAction
      : "clearer"
  ) as RewriteAction;
  const currentText = readString(body.currentText).trim();
  const storyContext = isRecord(body.storyContext) ? body.storyContext : {};

  if (!currentText) {
    return Response.json(
      { error: "Add some text before asking AI to rewrite it." },
      { status: 400 }
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const fallback = fallbackRewrite(currentText, action);

  if (!apiKey) {
    return Response.json(fallback);
  }

  const layerLabel = layerLabels[layer] ?? "text";
  const wantsAlternatives = action === "alternatives";
  const isStrongRewrite = action === "stronger";

  const prompt = [
    `Assist with this Creator Studio ${layerLabel} for a faith testimony post.`,
    `Current text: "${currentText}"`,
    `Instruction: ${actionInstructions[action]}`,
    "Critical rules:",
    "- Preserve the user's words, meaning, and intent.",
    "- Default to light polish only. Change as few words as possible.",
    "- Do NOT invent fear, freedom, transformation, healing, deliverance, breakthrough, or similar themes unless the user already said them.",
    "- Do NOT replace a simple thank-you line with a totally different testimony.",
    "- Do NOT use generic church-marketing slogans or promotional CTA language.",
    "- Do not quote full Bible verses. Scripture references only if the layer is scripture.",
    isStrongRewrite
      ? "- This is an explicit strong rewrite request, but still preserve the user's core meaning."
      : "- This is NOT a strong rewrite. Keep the result very close to the original.",
    `Story context: title="${readString(storyContext.title)}", caption="${readString(storyContext.caption)}", topic="${readString(storyContext.topic)}", theme="${readString(storyContext.visualTheme)}".`,
    wantsAlternatives
      ? "Return JSON with alternatives: an array of exactly 5 distinct strings that preserve meaning."
      : "Return JSON with text: a single assisted string.",
  ].join("\n\n");

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_STORY_SHAPING_MODEL ?? "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You lightly assist testimony text. Preserve user meaning. Return JSON only. Never invent themes the user did not mention.",
          },
          { role: "user", content: prompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "htbf_layer_rewrite",
            strict: true,
            schema: wantsAlternatives
              ? {
                  type: "object",
                  additionalProperties: false,
                  required: ["alternatives"],
                  properties: {
                    alternatives: {
                      type: "array",
                      minItems: 5,
                      maxItems: 5,
                      items: { type: "string" },
                    },
                  },
                }
              : {
                  type: "object",
                  additionalProperties: false,
                  required: ["text"],
                  properties: {
                    text: { type: "string" },
                  },
                },
          },
        },
        temperature: isStrongRewrite ? 0.7 : 0.35,
      }),
    });

    if (!response.ok) {
      console.error("[creator-studio-rewrite-layer] OpenAI error", response.status);
      return Response.json(fallback);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;

    if (!content) {
      return Response.json(fallback);
    }

    const parsed = JSON.parse(content) as {
      text?: string;
      alternatives?: string[];
    };

    if (wantsAlternatives && parsed.alternatives?.length) {
      return Response.json({
        alternatives: parsed.alternatives
          .slice(0, 5)
          .map((entry) => sanitizeRewrite(currentText, entry)),
      });
    }

    if (parsed.text?.trim()) {
      return Response.json({
        text: sanitizeRewrite(currentText, parsed.text.trim()),
      });
    }

    return Response.json(fallback);
  } catch (error) {
    console.error("[creator-studio-rewrite-layer] rewrite failed", error);
    return Response.json(fallback);
  }
}
