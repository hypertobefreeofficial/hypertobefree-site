import { beforeEach, describe, expect, it, vi } from "vitest";
import { AI_IMAGE_GENERATION_ENABLED_ENV } from "./aiImageGenerationGate";
import { AI_FEATURES_DISABLED_ENV } from "./aiKillSwitch";
import {
  CREATOR_STUDIO_AI_RATE_LIMITS,
  resetRateLimitBucketsForTests,
} from "./prayerRateLimit";
import { readCreatorStudioAiQuotaCounts } from "./creatorStudioAiLimits";

const mockGetUser = vi.fn();
const mockUpload = vi.fn();
const mockGetPublicUrl = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
    storage: {
      from: vi.fn(() => ({
        upload: (...args: unknown[]) => mockUpload(...args),
        getPublicUrl: (...args: unknown[]) => mockGetPublicUrl(...args),
      })),
    },
  })),
}));

const mockUserA = {
  id: "user-a-1111-2222-3333-444455556666",
  aud: "authenticated",
  role: "authenticated",
};

const mockUserB = {
  id: "user-b-aaaa-bbbb-cccc-dddddddddddd",
  aud: "authenticated",
  role: "authenticated",
};

function authHeaders(token = "valid-token") {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

function openAiChatSuccess(content: string) {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content } }],
    }),
    { status: 200 }
  );
}

function openAiImageSuccess() {
  return new Response(
    JSON.stringify({
      data: [{ b64_json: Buffer.from("fake-image").toString("base64") }],
    }),
    { status: 200 }
  );
}

function quotaCounts(userId: string, endpoint: keyof typeof CREATOR_STUDIO_AI_RATE_LIMITS) {
  return readCreatorStudioAiQuotaCounts({ userId, endpoint });
}

describe("Creator Studio AI routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    resetRateLimitBucketsForTests();
    delete process.env[AI_FEATURES_DISABLED_ENV];
    delete process.env[AI_IMAGE_GENERATION_ENABLED_ENV];

    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.OPENAI_API_KEY = "sk-test-key";

    mockGetUser.mockImplementation(async (token: string) => {
      if (token === "valid-token-a") {
        return { data: { user: mockUserA }, error: null };
      }
      if (token === "valid-token-b") {
        return { data: { user: mockUserB }, error: null };
      }
      return { data: { user: null }, error: new Error("invalid") };
    });

    mockUpload.mockResolvedValue({ error: null });
    mockGetPublicUrl.mockReturnValue({
      data: { publicUrl: "https://example.com/image.png" },
    });
  });

  describe("POST /api/shape-story", () => {
    it("rejects logged-out requests before OpenAI", async () => {
      const fetchMock = vi.spyOn(globalThis, "fetch");
      const { POST } = await import("../../app/api/shape-story/route");

      const response = await POST(
        new Request("https://htbf.test/api/shape-story", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ draftText: "Hello" }),
        })
      );

      expect(response.status).toBe(401);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects oversized prompt before OpenAI without consuming quota", async () => {
      const fetchMock = vi.spyOn(globalThis, "fetch");
      const { POST } = await import("../../app/api/shape-story/route");

      const response = await POST(
        new Request("https://htbf.test/api/shape-story", {
          method: "POST",
          headers: authHeaders("valid-token-a"),
          body: JSON.stringify({ prompt: "x".repeat(4001) }),
        })
      );

      expect(response.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(quotaCounts(mockUserA.id, "shape_story")).toEqual([
        { windowMs: 3_600_000, count: 0 },
        { windowMs: 86_400_000, count: 0 },
      ]);
    });

    it("returns 429 when hourly quota is exceeded", async () => {
      const fetchMock = vi.spyOn(globalThis, "fetch");
      const { POST } = await import("../../app/api/shape-story/route");
      const hourlyLimit =
        CREATOR_STUDIO_AI_RATE_LIMITS.shape_story.windows[0].limit;

      for (let index = 0; index < hourlyLimit; index += 1) {
        fetchMock.mockResolvedValueOnce(
          openAiChatSuccess(
            JSON.stringify({
              storyType: "testimony",
              topics: [],
              faithStreams: [],
              titles: ["Title"],
              caption: "Caption",
              scriptureReferences: [],
              template: "testimony_story",
              layoutSuggestion: "",
            })
          )
        );

        const okResponse = await POST(
          new Request("https://htbf.test/api/shape-story", {
            method: "POST",
            headers: authHeaders("valid-token-a"),
            body: JSON.stringify({ draftText: "Story" }),
          })
        );
        expect(okResponse.status).toBe(200);
      }

      const blocked = await POST(
        new Request("https://htbf.test/api/shape-story", {
          method: "POST",
          headers: authHeaders("valid-token-a"),
          body: JSON.stringify({ draftText: "Story again" }),
        })
      );

      expect(blocked.status).toBe(429);
      expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThanOrEqual(1);
      expect(fetchMock).toHaveBeenCalledTimes(hourlyLimit);
    });

    it("consumes one hourly and one daily slot on successful provider request", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        openAiChatSuccess(
          JSON.stringify({
            storyType: "testimony",
            topics: [],
            faithStreams: [],
            titles: ["Title"],
            caption: "Caption",
            scriptureReferences: [],
            template: "testimony_story",
            layoutSuggestion: "",
          })
        )
      );

      const { POST } = await import("../../app/api/shape-story/route");
      await POST(
        new Request("https://htbf.test/api/shape-story", {
          method: "POST",
          headers: authHeaders("valid-token-a"),
          body: JSON.stringify({ draftText: "Story" }),
        })
      );

      expect(quotaCounts(mockUserA.id, "shape_story")).toEqual([
        { windowMs: 3_600_000, count: 1 },
        { windowMs: 86_400_000, count: 1 },
      ]);
    });

    it("includes max_tokens on default shape-story OpenAI request", async () => {
      const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        openAiChatSuccess(
          JSON.stringify({
            storyType: "testimony",
            topics: [],
            faithStreams: [],
            titles: ["Title"],
            caption: "Caption",
            scriptureReferences: [],
            template: "testimony_story",
            layoutSuggestion: "",
          })
        )
      );

      const { POST } = await import("../../app/api/shape-story/route");
      const response = await POST(
        new Request("https://htbf.test/api/shape-story", {
          method: "POST",
          headers: authHeaders("valid-token-a"),
          body: JSON.stringify({ draftText: "Story" }),
        })
      );

      expect(response.status).toBe(200);
      const [, requestInit] = fetchMock.mock.calls[0] ?? [];
      const body = JSON.parse(String(requestInit?.body));
      expect(body.max_tokens).toBe(2048);
    });

    it("blocks when AI_FEATURES_DISABLED=1 without consuming quota", async () => {
      process.env[AI_FEATURES_DISABLED_ENV] = "1";
      const fetchMock = vi.spyOn(globalThis, "fetch");
      const { POST } = await import("../../app/api/shape-story/route");

      const response = await POST(
        new Request("https://htbf.test/api/shape-story", {
          method: "POST",
          headers: authHeaders("valid-token-a"),
          body: JSON.stringify({ draftText: "Story" }),
        })
      );

      expect(response.status).toBe(503);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(quotaCounts(mockUserA.id, "shape_story")).toEqual([
        { windowMs: 3_600_000, count: 0 },
        { windowMs: 86_400_000, count: 0 },
      ]);
    });

    it("returns controlled response on provider timeout without retry and consumes quota", async () => {
      vi.useFakeTimers();

      vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(
              Object.assign(new Error("The operation was aborted"), {
                name: "AbortError",
              })
            );
          });
        });
      });

      const { POST } = await import("../../app/api/shape-story/route");
      const responsePromise = POST(
        new Request("https://htbf.test/api/shape-story", {
          method: "POST",
          headers: authHeaders("valid-token-b"),
          body: JSON.stringify({ draftText: "Story" }),
        })
      );

      await vi.advanceTimersByTimeAsync(15_000);
      const response = await responsePromise;
      vi.useRealTimers();

      expect(response.status).toBe(200);
      const payload = await response.json();
      expect(payload.fallbackReason).toContain("timed out");
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(quotaCounts(mockUserB.id, "shape_story")).toEqual([
        { windowMs: 3_600_000, count: 1 },
        { windowMs: 86_400_000, count: 1 },
      ]);
    });

    it("consumes quota once on provider failure without retry", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("provider failed", { status: 500 })
      );

      const { POST } = await import("../../app/api/shape-story/route");
      const response = await POST(
        new Request("https://htbf.test/api/shape-story", {
          method: "POST",
          headers: authHeaders("valid-token-b"),
          body: JSON.stringify({ draftText: "Story" }),
        })
      );

      expect(response.status).toBe(200);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(quotaCounts(mockUserB.id, "shape_story")).toEqual([
        { windowMs: 3_600_000, count: 1 },
        { windowMs: 86_400_000, count: 1 },
      ]);
    });

    it("includes max_tokens on creator_studio OpenAI request", async () => {
      const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        openAiChatSuccess(
          JSON.stringify({
            designs: Array.from({ length: 6 }, (_entry, index) => ({
              id: `design-${index + 1}`,
              studioPath: "tell-story",
              sourceMode: "build-ai",
              title: "Title",
              overlayText: "Overlay",
              caption: "Caption",
              category: "Testimony",
              topic: "Hope",
              templateId: "none",
              styleMood: "Hopeful",
              layoutType: "full-image-poster",
              scriptureSuggestion: "",
              suggestedPostFormat: "portrait",
              colorPalette: ["#112233"],
              typographyStyle: "modern bold",
              designTreatment: "clean",
              callToAction: "",
              typographyPairing: "modern bold",
              fontHierarchy: "title-first",
              backgroundTreatment: "soft light",
              layoutComposition: "centered",
              overlayStyle: "minimal",
              decorativeElements: "none",
              visualTheme: "peace",
              filterRecommendation: "soft",
              cropRecommendation: "center",
              alternateTitles: ["Alt"],
              alternateCaptions: ["Cap"],
              hashtags: ["#hope"],
              conceptReason: "Reason",
              textStyle: {
                fontSize: "medium",
                weight: "regular",
                italic: false,
                align: "center",
                color: "#ffffff",
                position: "center",
              },
            })),
          })
        )
      );

      const { POST } = await import("../../app/api/shape-story/route");
      const response = await POST(
        new Request("https://htbf.test/api/shape-story", {
          method: "POST",
          headers: authHeaders("valid-token-b"),
          body: JSON.stringify({
            mode: "creator_studio",
            prompt: "My testimony",
          }),
        })
      );

      expect(response.status).toBe(200);
      const [, requestInit] = fetchMock.mock.calls[0] ?? [];
      const body = JSON.parse(String(requestInit?.body));
      expect(body.max_tokens).toBe(8192);
    });
  });

  describe("POST /api/creator-studio-rewrite-layer", () => {
    it("rejects logged-out requests before OpenAI", async () => {
      const fetchMock = vi.spyOn(globalThis, "fetch");
      const { POST } = await import(
        "../../app/api/creator-studio-rewrite-layer/route"
      );

      const response = await POST(
        new Request("https://htbf.test/api/creator-studio-rewrite-layer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ currentText: "Thank you Jesus." }),
        })
      );

      expect(response.status).toBe(401);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects oversized rewrite text before OpenAI without consuming quota", async () => {
      const fetchMock = vi.spyOn(globalThis, "fetch");
      const { POST } = await import(
        "../../app/api/creator-studio-rewrite-layer/route"
      );

      const response = await POST(
        new Request("https://htbf.test/api/creator-studio-rewrite-layer", {
          method: "POST",
          headers: authHeaders("valid-token-a"),
          body: JSON.stringify({ currentText: "x".repeat(4001) }),
        })
      );

      expect(response.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(quotaCounts(mockUserA.id, "creator_studio_rewrite_layer")).toEqual([
        { windowMs: 3_600_000, count: 0 },
        { windowMs: 86_400_000, count: 0 },
      ]);
    });

    it("includes max_tokens on rewrite OpenAI request", async () => {
      const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        openAiChatSuccess(JSON.stringify({ text: "Thank You, Jesus." }))
      );

      const { POST } = await import(
        "../../app/api/creator-studio-rewrite-layer/route"
      );
      const response = await POST(
        new Request("https://htbf.test/api/creator-studio-rewrite-layer", {
          method: "POST",
          headers: authHeaders("valid-token-a"),
          body: JSON.stringify({
            currentText: "thank you jesus",
            action: "clearer",
          }),
        })
      );

      expect(response.status).toBe(200);
      const [, requestInit] = fetchMock.mock.calls[0] ?? [];
      const body = JSON.parse(String(requestInit?.body));
      expect(body.max_tokens).toBe(1024);
    });

    it("blocks when AI_FEATURES_DISABLED=1 without consuming quota", async () => {
      process.env[AI_FEATURES_DISABLED_ENV] = "1";
      const fetchMock = vi.spyOn(globalThis, "fetch");
      const { POST } = await import(
        "../../app/api/creator-studio-rewrite-layer/route"
      );

      const response = await POST(
        new Request("https://htbf.test/api/creator-studio-rewrite-layer", {
          method: "POST",
          headers: authHeaders("valid-token-a"),
          body: JSON.stringify({ currentText: "Thank you Jesus." }),
        })
      );

      expect(response.status).toBe(503);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/generate-creator-studio-image", () => {
    it("rejects logged-out requests before OpenAI", async () => {
      const fetchMock = vi.spyOn(globalThis, "fetch");
      const { POST } = await import(
        "../../app/api/generate-creator-studio-image/route"
      );

      const response = await POST(
        new Request("https://htbf.test/api/generate-creator-studio-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "AI Background",
            prompt: "Peaceful light",
          }),
        })
      );

      expect(response.status).toBe(401);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("blocks authenticated requests by default without OpenAI or quota use", async () => {
      const fetchMock = vi.spyOn(globalThis, "fetch");
      const { POST } = await import(
        "../../app/api/generate-creator-studio-image/route"
      );

      const response = await POST(
        new Request("https://htbf.test/api/generate-creator-studio-image", {
          method: "POST",
          headers: authHeaders("valid-token-a"),
          body: JSON.stringify({
            action: "AI Background",
            prompt: "Peaceful light",
          }),
        })
      );

      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body.code).toBe("image_generation_disabled");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(quotaCounts(mockUserA.id, "generate_creator_studio_image")).toEqual([
        { windowMs: 3_600_000, count: 0 },
        { windowMs: 86_400_000, count: 0 },
      ]);
    });

    it("rejects oversized image prompt before OpenAI without consuming quota", async () => {
      process.env[AI_IMAGE_GENERATION_ENABLED_ENV] = "1";
      const fetchMock = vi.spyOn(globalThis, "fetch");
      const { POST } = await import(
        "../../app/api/generate-creator-studio-image/route"
      );

      const response = await POST(
        new Request("https://htbf.test/api/generate-creator-studio-image", {
          method: "POST",
          headers: authHeaders("valid-token-a"),
          body: JSON.stringify({
            action: "AI Background",
            prompt: "x".repeat(2001),
          }),
        })
      );

      expect(response.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(quotaCounts(mockUserA.id, "generate_creator_studio_image")).toEqual([
        { windowMs: 3_600_000, count: 0 },
        { windowMs: 86_400_000, count: 0 },
      ]);
    });

    it("returns 429 when hourly image quota is exceeded", async () => {
      process.env[AI_IMAGE_GENERATION_ENABLED_ENV] = "1";
      const fetchMock = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(() => Promise.resolve(openAiImageSuccess()));
      const { POST } = await import(
        "../../app/api/generate-creator-studio-image/route"
      );
      const hourlyLimit =
        CREATOR_STUDIO_AI_RATE_LIMITS.generate_creator_studio_image.windows[0]
          .limit;

      for (let index = 0; index < hourlyLimit; index += 1) {
        const okResponse = await POST(
          new Request("https://htbf.test/api/generate-creator-studio-image", {
            method: "POST",
            headers: authHeaders("valid-token-a"),
            body: JSON.stringify({
              action: "AI Background",
              prompt: "Peaceful light",
            }),
          })
        );
        expect(okResponse.status).toBe(200);
      }

      const blocked = await POST(
        new Request("https://htbf.test/api/generate-creator-studio-image", {
          method: "POST",
          headers: authHeaders("valid-token-a"),
          body: JSON.stringify({
            action: "AI Background",
            prompt: "One more",
          }),
        })
      );

      expect(blocked.status).toBe(429);
      expect(fetchMock).toHaveBeenCalledTimes(hourlyLimit);
    });

    it("returns successful image payload when feature is enabled", async () => {
      process.env[AI_IMAGE_GENERATION_ENABLED_ENV] = "1";
      vi.spyOn(globalThis, "fetch").mockResolvedValue(openAiImageSuccess());
      const { POST } = await import(
        "../../app/api/generate-creator-studio-image/route"
      );

      const response = await POST(
        new Request("https://htbf.test/api/generate-creator-studio-image", {
          method: "POST",
          headers: authHeaders("valid-token-b"),
          body: JSON.stringify({
            action: "AI Background",
            prompt: "Peaceful light",
          }),
        })
      );

      expect(response.status).toBe(200);
      const payload = await response.json();
      expect(payload.imageUrl).toContain("https://example.com/image.png");
      expect(payload.bucket).toBe("story-images");
    });

    it("prefers kill switch over enabled image generation", async () => {
      process.env[AI_IMAGE_GENERATION_ENABLED_ENV] = "1";
      process.env[AI_FEATURES_DISABLED_ENV] = "1";
      const fetchMock = vi.spyOn(globalThis, "fetch");
      const { POST } = await import(
        "../../app/api/generate-creator-studio-image/route"
      );

      const response = await POST(
        new Request("https://htbf.test/api/generate-creator-studio-image", {
          method: "POST",
          headers: authHeaders("valid-token-a"),
          body: JSON.stringify({
            action: "AI Background",
            prompt: "Peaceful light",
          }),
        })
      );

      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body.code).toBe("ai_disabled");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("blocks when AI_FEATURES_DISABLED=1 without consuming quota", async () => {
      process.env[AI_FEATURES_DISABLED_ENV] = "1";
      const fetchMock = vi.spyOn(globalThis, "fetch");
      const { POST } = await import(
        "../../app/api/generate-creator-studio-image/route"
      );

      const response = await POST(
        new Request("https://htbf.test/api/generate-creator-studio-image", {
          method: "POST",
          headers: authHeaders("valid-token-a"),
          body: JSON.stringify({
            action: "AI Background",
            prompt: "Peaceful light",
          }),
        })
      );

      expect(response.status).toBe(503);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
