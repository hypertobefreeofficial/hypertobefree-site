import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  CREATIVE_DIRECTIONS,
  FLAGSHIP_MOMENTS,
  FLAGSHIP_STORY,
  SAMPLE_DEMO_LABEL,
  listCreativeDirectionIds,
} from "../../components/demo-content/creative-lab/creativeConcepts";
import { verifyCreativeLabAccess } from "./creativeLabAccess";
import {
  advancePlayback,
  listRequiredMomentIds,
  prefersReducedMotion,
  restartPlayback,
  resolveMomentAtTime,
  seekPlayback,
  togglePlayback,
} from "./creativeLabTimeline";

const CREATIVE_LAB_ROOT = join(
  process.cwd(),
  "components/demo-content/creative-lab"
);

function readCreativeLabSources(): string {
  const files = readdirSync(CREATIVE_LAB_ROOT).filter((file) =>
    /\.(tsx|ts|css)$/.test(file)
  );

  return files
    .map((file) => readFileSync(join(CREATIVE_LAB_ROOT, file), "utf8"))
    .join("\n");
}

describe("Creative Lab access", () => {
  it("requires owner/admin access via current_user_is_admin", async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    const getUser = vi.fn(async () => ({
      data: { user: { id: "admin-1" } },
    }));

    await expect(
      verifyCreativeLabAccess({
        auth: { getUser },
        rpc,
      })
    ).resolves.toEqual({ allowed: true });

    expect(rpc).toHaveBeenCalledWith("current_user_is_admin");
  });

  it("denies unauthenticated viewers", async () => {
    await expect(
      verifyCreativeLabAccess({
        auth: {
          getUser: async () => ({ data: { user: null } }),
        },
        rpc: vi.fn(),
      })
    ).resolves.toEqual({ allowed: false, reason: "unauthenticated" });
  });

  it("denies non-admin members", async () => {
    await expect(
      verifyCreativeLabAccess({
        auth: {
          getUser: async () => ({ data: { user: { id: "member-1" } } }),
        },
        rpc: async () => ({ data: false, error: null }),
      })
    ).resolves.toEqual({ allowed: false, reason: "forbidden" });
  });
});

describe("Creative Lab isolation guarantees", () => {
  it("does not perform database mutations in access helper", async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    const getUser = vi.fn(async () => ({
      data: { user: { id: "admin-1" } },
    }));
    const client = {
      auth: { getUser },
      rpc,
      from: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };

    await verifyCreativeLabAccess(client);

    expect(client.from).not.toHaveBeenCalled();
    expect(client.insert).not.toHaveBeenCalled();
    expect(client.update).not.toHaveBeenCalled();
    expect(client.delete).not.toHaveBeenCalled();
  });

  it("does not reference external requests in Creative Lab sources", () => {
    const sources = readCreativeLabSources();

    expect(sources).not.toMatch(/\bfetch\s*\(/);
    expect(sources).not.toMatch(/openai\.com/i);
    expect(sources).not.toMatch(/api\.resend\.com/i);
    expect(sources).not.toMatch(/supabase\.from\s*\(/);
  });
});

describe("Flagship narrative structure", () => {
  it("defines all six required moments", () => {
    expect(listRequiredMomentIds()).toEqual([
      "opening",
      "prayer-request",
      "praying-support",
      "public-response",
      "god-did-it",
      "final-invitation",
    ]);
    expect(FLAGSHIP_MOMENTS).toHaveLength(6);
  });

  it("includes SAMPLE DEMO in the opening beat label", () => {
    expect(FLAGSHIP_MOMENTS[0]?.label.toLowerCase()).toContain("sample demo");
    expect(SAMPLE_DEMO_LABEL).toBe("SAMPLE DEMO");
  });

  it("preserves the flagship fictional story copy", () => {
    expect(FLAGSHIP_STORY.prayerRequest).toContain("peace while I wait");
    expect(FLAGSHIP_STORY.publicResponse).toContain("standing with you");
    expect(FLAGSHIP_STORY.godDidIt).toContain("God Did It");
    expect(FLAGSHIP_STORY.finalInvitation).toContain("Share the prayer");
  });

  it("documents three distinct creative directions", () => {
    expect(listCreativeDirectionIds()).toEqual([
      "cinematic-dawn",
      "sacred-journal",
      "living-testimony",
    ]);
    expect(CREATIVE_DIRECTIONS.every((direction) => direction.audio)).toBe(true);
  });
});

describe("Flagship demo playback controls", () => {
  it("supports play, pause, restart, and scrub", () => {
    let state = { currentTime: 4, isPlaying: false };
    state = togglePlayback(state);
    expect(state.isPlaying).toBe(true);

    state = seekPlayback(state, 12.5);
    expect(state.currentTime).toBe(12.5);

    state = advancePlayback(state, 1);
    expect(state.currentTime).toBe(13.5);

    state = restartPlayback();
    expect(state).toEqual({ currentTime: 0, isPlaying: true });
  });

  it("resolves the active moment from timeline position", () => {
    const snapshot = resolveMomentAtTime(15);
    expect(snapshot.moment.id).toBe("public-response");
    expect(snapshot.momentProgress).toBeGreaterThan(0);
  });
});

describe("Reduced-motion behavior", () => {
  it("treats reduced-motion preference as disabling major motion", () => {
    expect(prefersReducedMotion(true)).toBe(true);
    expect(prefersReducedMotion(false)).toBe(false);
  });

  it("documents reduced-motion CSS overrides in Creative Lab styles", () => {
    const css = readFileSync(
      join(CREATIVE_LAB_ROOT, "creativeLab.module.css"),
      "utf8"
    );

    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("animation: none");
  });
});

describe("Route scope", () => {
  it("adds an admin-only Creative Lab route without altering public route files", () => {
    const pageSource = readFileSync(
      join(process.cwd(), "app/admin/demo-content/creative-lab/page.tsx"),
      "utf8"
    );

    expect(pageSource).toContain("verifyCreativeLabAccess");
    expect(pageSource).not.toContain("include-demo");
  });
});
