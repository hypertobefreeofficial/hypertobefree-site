import { createClient } from "@supabase/supabase-js";

type StoryShapeResponse = {
  storyType: string;
  topics: string[];
  titles: string[];
  caption: string;
  scriptureReferences: string[];
  template: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function readBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";

  return authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
}

function fallbackShape(body: Record<string, unknown>): StoryShapeResponse {
  const storyType = readString(body.storyType) || "testimony";
  const topics = readStringArray(body.topics).slice(0, 4);
  const titleBase =
    storyType === "prayer"
      ? "Praying for Breakthrough"
      : storyType === "worship"
        ? "A Worship Moment"
        : storyType === "teaching"
          ? "A Word to Remember"
          : "God Is Moving";

  return {
    storyType,
    topics,
    titles: [titleBase, "What God Placed on My Heart"],
    caption: readString(body.currentText),
    scriptureReferences: [],
    template: `${storyType}_story`,
  };
}

function cleanShape(value: unknown, fallback: StoryShapeResponse) {
  if (!isRecord(value)) return fallback;

  return {
    storyType: readString(value.storyType) || fallback.storyType,
    topics: readStringArray(value.topics).slice(0, 6),
    titles: readStringArray(value.titles).slice(0, 4),
    caption: readString(value.caption),
    scriptureReferences: readStringArray(value.scriptureReferences).slice(0, 4),
    template: readString(value.template) || fallback.template,
  };
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const accessToken = readBearerToken(request);

  if (!supabaseUrl || !supabaseAnonKey || !accessToken) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
  } = await authClient.auth.getUser(accessToken);

  if (!user) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
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

  const fallback = fallbackShape(body);
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return Response.json(fallback);
  }

  const promptAnswers = isRecord(body.promptAnswers)
    ? Object.entries(body.promptAnswers)
        .filter(([, answer]) => typeof answer === "string" && answer.trim())
        .map(([question, answer]) => `${question}: ${answer}`)
        .join("\n")
    : "";

  const input = [
    "You help shape faith-centered HTBF posts. Return JSON only.",
    "Do not include full Bible verse text. Suggest references only.",
    `Content format: ${readString(body.contentFormat)}`,
    `Story type: ${readString(body.storyType)}`,
    `Selected topics: ${readStringArray(body.topics).join(", ")}`,
    `Current text: ${readString(body.currentText)}`,
    `Guided answers:\n${promptAnswers || "None"}`,
    'JSON shape: {"storyType":"","topics":[],"titles":[],"caption":"","scriptureReferences":[],"template":""}',
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
              "You return concise structured JSON for faith-centered post suggestions. Never quote copyrighted Bible text; references only.",
          },
          { role: "user", content: input },
        ],
        response_format: { type: "json_object" },
        temperature: 0.5,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      return Response.json(fallback);
    }

    const payload: unknown = await response.json();
    const content =
      isRecord(payload) &&
      Array.isArray(payload.choices) &&
      isRecord(payload.choices[0]) &&
      isRecord(payload.choices[0].message)
        ? payload.choices[0].message.content
        : null;

    if (typeof content !== "string") {
      return Response.json(fallback);
    }

    return Response.json(cleanShape(JSON.parse(content), fallback));
  } catch (error) {
    console.error("Story shaping failed:", error);
    return Response.json(fallback);
  }
}
