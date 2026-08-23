# HTBF Public Background Pack V1

This folder contains approved public background assets used by the HTBF Creation Center for guided text/card story templates.

These files are referenced by `lib/creationCenter.ts` and must be present for template backgrounds to render in the creator preview and feed.

## Required Creator Studio template images

These eight files are referenced by `lib/creationCenter.ts` / `creationCenterStoryTemplates`:

- `01-scripture-woods.PNG`
- `03-psalm-praise.PNG`
- `05-lighthouse-scripture.PNG`
- `09-eagle-soar.PNG`
- `14-lake-worship.PNG`
- `18-breaking-chains-freedom.PNG`
- `19-valley-praise.PNG`
- `20-be-still-psalms-prayer.PNG`

Inventory and existence checks live in `lib/creationCenterCuratedAssets.ts` and `lib/creationCenterCuratedAssets.test.ts`.

## Homepage pack references

The marketing homepage also uses:

- `06-long-road.PNG`
- `08-eagle-soar.PNG` (byte-identical alias of `09-eagle-soar.PNG`)
- `12-sunraise-clouds.PNG`

## Other required public images

These are used elsewhere in the app (template watermark, media stamps) and must remain in `public/images/`:

- `public/images/htbf-logo.png`
- `public/images/hero-freedom.png`

## Runtime fallback

If a curated pack background fails to load in Creator Studio UI, the app falls back to `/images/prayer/prayer-global-hero.png` (see `CreatorStudioCuratedBackground`). Development builds log a console warning when this happens.

## Guidelines

- Match filenames exactly (including `.PNG` extension as referenced in code).
- Do not rename existing assets without updating `lib/creationCenter.ts`.
- Prefer WebP only if code paths are updated to match.
- Do not substitute unrelated imagery when adding or restoring pack files.
