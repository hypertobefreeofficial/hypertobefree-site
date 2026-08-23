import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  creationCenterImages,
  creationCenterStoryTemplates,
} from "./creationCenter";
import {
  CREATION_CENTER_CURATED_PACK_BASE,
  CREATOR_STUDIO_CURATED_BACKGROUND_FALLBACK,
  CREATOR_STUDIO_CURATED_EAGLE_ALIAS_FILENAMES,
  CREATOR_STUDIO_CURATED_TEMPLATE_FILENAMES,
  CREATOR_STUDIO_CURATED_TEMPLATE_PATHS,
  CREATOR_STUDIO_HOMEPAGE_PACK_FILENAMES,
  CREATOR_STUDIO_HOMEPAGE_PACK_PATHS,
  assertCuratedFilenameUsesUppercasePngExtension,
  curatedPackPathToPublicFile,
  getCreatorStudioTemplateAssetPaths,
  isCuratedPackBackgroundPath,
} from "./creationCenterCuratedAssets";
import { isAiImageGenerationEnabled } from "./server/aiImageGenerationGate";

const PUBLIC_ROOT = join(process.cwd(), "public");

function publicAssetExists(relativePath: string) {
  return existsSync(join(PUBLIC_ROOT, relativePath));
}

describe("creationCenterCuratedAssets inventory", () => {
  it("lists every Creator Studio template background with an uppercase .PNG extension", () => {
    for (const filename of CREATOR_STUDIO_CURATED_TEMPLATE_FILENAMES) {
      expect(assertCuratedFilenameUsesUppercasePngExtension(filename)).toBe(
        true
      );
    }
  });

  it("keeps creationCenterImages aligned with the curated template inventory", () => {
    const imagePaths = Object.values(creationCenterImages);

    expect(imagePaths).toHaveLength(
      CREATOR_STUDIO_CURATED_TEMPLATE_FILENAMES.length
    );
    expect(imagePaths).toEqual(CREATOR_STUDIO_CURATED_TEMPLATE_PATHS);

    for (const path of imagePaths) {
      expect(isCuratedPackBackgroundPath(path)).toBe(true);
      const filename = path.slice(CREATION_CENTER_CURATED_PACK_BASE.length);
      expect(CREATOR_STUDIO_CURATED_TEMPLATE_FILENAMES).toContain(filename);
    }
  });

  it("ensures every Creator Studio template points at a curated pack path", () => {
    const templatePaths = getCreatorStudioTemplateAssetPaths();

    expect(templatePaths).toHaveLength(8);
    expect(new Set(templatePaths.map((entry) => entry.templateId)).size).toBe(8);

    for (const { templateId, imagePath } of templatePaths) {
      expect(templateId).not.toBe("none");
      expect(isCuratedPackBackgroundPath(imagePath)).toBe(true);
      expect(publicAssetExists(curatedPackPathToPublicFile(imagePath))).toBe(
        true
      );
    }
  });

  it("ensures homepage curated pack references exist in public/", () => {
    for (const path of CREATOR_STUDIO_HOMEPAGE_PACK_PATHS) {
      expect(publicAssetExists(curatedPackPathToPublicFile(path))).toBe(true);
    }
  });

  it("ensures the approved runtime fallback asset exists in public/", () => {
    expect(
      publicAssetExists(
        curatedPackPathToPublicFile(CREATOR_STUDIO_CURATED_BACKGROUND_FALLBACK)
      )
    ).toBe(true);
  });

  it("documents eagle alias filenames as duplicate assets in the pack", () => {
    for (const filename of CREATOR_STUDIO_CURATED_EAGLE_ALIAS_FILENAMES) {
      expect(publicAssetExists(`images/backgrounds/public-pack-v1/${filename}`)).toBe(
        true
      );
    }

    expect(creationCenterImages.eagleSoar).toContain("09-eagle-soar.PNG");
    expect(CREATOR_STUDIO_HOMEPAGE_PACK_FILENAMES).toContain("08-eagle-soar.PNG");
  });

  it("does not route curated template selection through AI image generation", () => {
    expect(isAiImageGenerationEnabled()).toBe(false);

    for (const template of creationCenterStoryTemplates) {
      if (!template.imagePath) continue;
      expect(template.imagePath.startsWith("http")).toBe(false);
      expect(template.imagePath).not.toContain("openai");
      expect(template.imagePath).not.toContain("creator-studio/");
    }
  });

  it("limits fallback to one hop by keeping the fallback asset outside the curated pack", () => {
    expect(isCuratedPackBackgroundPath(CREATOR_STUDIO_CURATED_BACKGROUND_FALLBACK)).toBe(
      false
    );
    expect(isCuratedPackBackgroundPath("https://cdn.example/photo.jpg")).toBe(
      false
    );
    expect(
      isCuratedPackBackgroundPath("user-1/creator-studio/upload.png")
    ).toBe(false);
  });
});
