import {
  creationCenterImages,
  creationCenterStoryTemplates,
  type CreationCenterStoryTemplate,
} from "./creationCenter";

export const CREATION_CENTER_CURATED_PACK_BASE =
  "/images/backgrounds/public-pack-v1/";

/** Approved in-repo fallback when a curated pack background 404s at runtime. */
export const CREATOR_STUDIO_CURATED_BACKGROUND_FALLBACK =
  "/images/prayer/prayer-global-hero.png";

export const CREATOR_STUDIO_CURATED_TEMPLATE_FILENAMES = [
  "01-scripture-woods.PNG",
  "03-psalm-praise.PNG",
  "05-lighthouse-scripture.PNG",
  "09-eagle-soar.PNG",
  "14-lake-worship.PNG",
  "18-breaking-chains-freedom.PNG",
  "19-valley-praise.PNG",
  "20-be-still-psalms-prayer.PNG",
] as const;

export const CREATOR_STUDIO_HOMEPAGE_PACK_FILENAMES = [
  "06-long-road.PNG",
  "08-eagle-soar.PNG",
  "12-sunraise-clouds.PNG",
] as const;

export const CREATOR_STUDIO_CURATED_TEMPLATE_PATHS = Object.values(
  creationCenterImages
);

export const CREATOR_STUDIO_HOMEPAGE_PACK_PATHS =
  CREATOR_STUDIO_HOMEPAGE_PACK_FILENAMES.map(
    (filename) => `${CREATION_CENTER_CURATED_PACK_BASE}${filename}`
  );

export const CREATOR_STUDIO_CURATED_EAGLE_ALIAS_FILENAMES = [
  "08-eagle-soar.PNG",
  "09-eagle-soar.PNG",
] as const;

const warnedMissingPaths = new Set<string>();

export function isCuratedPackBackgroundPath(path: string | null | undefined) {
  return (
    typeof path === "string" &&
    path.startsWith(CREATION_CENTER_CURATED_PACK_BASE)
  );
}

export function curatedPackPathToPublicFile(path: string) {
  return path.replace(/^\//, "");
}

export function getCuratedBackgroundFallbackSrc(missingPath: string) {
  warnMissingCuratedBackground(missingPath);
  return CREATOR_STUDIO_CURATED_BACKGROUND_FALLBACK;
}

export function warnMissingCuratedBackground(path: string) {
  if (process.env.NODE_ENV === "production") return;
  if (warnedMissingPaths.has(path)) return;

  warnedMissingPaths.add(path);
  console.warn(
    `[Creator Studio] Curated background missing at ${path}. Using approved fallback ${CREATOR_STUDIO_CURATED_BACKGROUND_FALLBACK}.`
  );
}

export function resetCuratedBackgroundWarningsForTests() {
  warnedMissingPaths.clear();
}

export function getCreatorStudioTemplateAssetPaths(
  templates: readonly CreationCenterStoryTemplate[] = creationCenterStoryTemplates
) {
  return templates
    .filter((template) => template.id !== "none" && template.imagePath)
    .map((template) => ({
      templateId: template.id,
      imagePath: template.imagePath as string,
    }));
}

export function assertCuratedFilenameUsesUppercasePngExtension(filename: string) {
  return filename.endsWith(".PNG");
}
