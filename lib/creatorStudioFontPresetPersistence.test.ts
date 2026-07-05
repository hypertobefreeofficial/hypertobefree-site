import { describe, expect, it } from "vitest";
import type { CreatorStudioDesign } from "./creationCenter";
import {
  buildCreatorStudioAiSuggestionsPayload,
  readCreatorStudioDesignFromSuggestions,
  readStoredCreatorStudioDesignFromStory,
  serializeCreatorStudioDesignForStorage,
} from "./creatorStudioMetadata";
import { buildCreatorStudioLayerTypography } from "./creatorStudioCanvasRender";
import { resolveCreatorStudioDesignForRender } from "./creatorStudioRenderPipeline";
import {
  applyCreatorStudioFontPreset,
  creatorStudioTextStylePresets,
} from "./creatorStudioTextStylePresets";
import {
  getCreatorStudioFontClassName,
  normalizeCreatorStudioFontPreset,
  type CreatorStudioFontPreset as FontPresetId,
} from "./creatorStudioTypography";

function buildSampleDesign(fontPreset: FontPresetId): CreatorStudioDesign {
  const layerStyle = applyCreatorStudioFontPreset(fontPreset);

  return {
    id: "test-design",
    studioPath: "tell-story",
    sourceMode: "start-template",
    title: "God Is Faithful",
    overlayText: "He restored my hope",
    caption: "What God did in my life this week.",
    category: "Testimony",
    topic: "Hope",
    templateId: "scripture-woods",
    styleMood: "Hopeful",
    layoutType: "text-over-image-testimony",
    suggestedPostFormat: "HTBF design post",
    colorPalette: ["#062A57", "#FFFFFF", "#D4AF37"],
    textStyle: {
      fontSize: "large",
      weight: "bold",
      italic: false,
      align: "left",
      color: "#FFFFFF",
      position: "bottom",
    },
    layerStyles: {
      title: {
        ...layerStyle,
        align: "center",
        color: "#FFFFFF",
        x: 50,
        y: 22,
      },
      overlay: {
        fontPreset: "clean-modern-sans",
        weight: "regular",
        fontSize: "medium",
        align: "center",
        color: "#FFFFFF",
        x: 50,
        y: 50,
      },
      caption: {
        fontPreset: "clean-modern-sans",
        weight: "regular",
        fontSize: "small",
        align: "center",
        color: "#FFFFFF",
        x: 50,
        y: 78,
      },
    },
  };
}

describe("creator studio fontPreset persistence", () => {
  it("keeps fontPreset through serialize and metadata read", () => {
    const design = buildSampleDesign("cinematic-poster");
    const serialized = serializeCreatorStudioDesignForStorage(design);
    const payload = buildCreatorStudioAiSuggestionsPayload({ design: serialized });
    const stored = readCreatorStudioDesignFromSuggestions(payload);

    expect(stored?.layerStyles?.title?.fontPreset).toBe("cinematic-poster");
    expect(stored?.layerStyles?.overlay?.fontPreset).toBe("clean-modern-sans");
  });

  it("survives publish payload, reload, and feed read helpers", () => {
    const design = buildSampleDesign("hero-title");
    const payload = buildCreatorStudioAiSuggestionsPayload({
      design: serializeCreatorStudioDesignForStorage(design),
    });

    const reloaded = readStoredCreatorStudioDesignFromStory({
      ai_suggestions: payload,
      creation_mode: "creator-studio",
    });

    expect(reloaded?.layerStyles?.title?.fontPreset).toBe("hero-title");
    expect(normalizeCreatorStudioFontPreset("worshipful")).toBe("worship-script");
  });

  it("uses the same render pipeline for preview, feed, detail, and shared", () => {
    const design = buildSampleDesign("magazine-editorial");
    const resolved = resolveCreatorStudioDesignForRender(design);

    for (const compact of [false, true]) {
      const typography = buildCreatorStudioLayerTypography(
        resolved,
        "title",
        compact
      );
      const className = getCreatorStudioFontClassName(
        resolved,
        typography.layerStyle,
        "title"
      );

      expect(typography.layerStyle.fontPreset).toBe("magazine-editorial");
      expect(className).toContain("--font-creator-magazine-editorial");
    }
  });

  it("defines 20 unique font families across presets", () => {
    const families = new Set(
      creatorStudioTextStylePresets.map((preset) => preset.fontFamily)
    );

    expect(creatorStudioTextStylePresets).toHaveLength(20);
    expect(families.size).toBeGreaterThanOrEqual(15);
  });
});
