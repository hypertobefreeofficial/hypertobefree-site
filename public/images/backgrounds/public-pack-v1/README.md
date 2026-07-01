# HTBF Public Background Pack V1

This folder contains approved public background assets used by the HTBF Creation Center for guided text/card story templates.

These files are referenced by `lib/creationCenter.ts` and must be present for template backgrounds to render in the creator preview and feed.

## Required template images

Place these files in this directory:

- `01-scripture-woods.PNG`
- `03-psalm-praise.PNG`
- `05-lighthouse-scripture.PNG`
- `09-eagle-soar.PNG`
- `14-lake-worship.PNG`
- `18-breaking-chains-freedom.PNG`
- `19-valley-praise.PNG`
- `20-be-still-psalms-prayer.PNG`

These assets are not committed in the repo yet and must be added separately.

## Other required public images

These are used elsewhere in the app (template watermark, media stamps) and must also be added separately:

- `public/images/htbf-logo.png`
- `public/images/hero-freedom.png`

## Guidelines

- Match filenames exactly (including `.PNG` extension as referenced in code).
- Do not rename existing assets without updating `lib/creationCenter.ts`.
- Prefer WebP only if code paths are updated to match.
