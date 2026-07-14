# HTBF Prayer Playwright tests

Development-only authenticated end-to-end tests for the Prayer page.

## Commands

```bash
npm run test:prayer          # smoke + auth suites (auth skips without credentials)
npm run test:prayer:auth     # @auth tagged tests only
npm run test:prayer:headed   # headed browser
```

Requires a running app at `PLAYWRIGHT_BASE_URL` (default `http://127.0.0.1:3492`):

```bash
npm run build && npx next start -p 3492
```

## Environment variables

Copy `.env.example` → `.env.local` and set development account credentials.
Never commit real passwords. Authentication storage states are written to
`.playwright/auth/` at runtime (gitignored).

## Migration application order

Apply manually in Supabase SQL editor (dev/staging first):

1. `20260712_prayer_production_readiness_preflight.sql` (read-only checks)
2. `20260712_prayer_production_readiness_hardened.sql` (prayer_follows, geo, written responses)
3. `20260713_prayer_search_preferences.sql` (optional)
4. `20260714_prayer_video_response_removal.sql` (soft-removal columns)
5. `20260715_prayer_interaction_persistence.sql` (prayer_hidden_stories, content_reports RLS)
6. `20260716_prayer_video_response_duration_verification.sql` (duration verification state)

## Post-migration verification checklist

- [ ] `prayer_follows` exists; authenticated user can insert/delete own rows only
- [ ] `prayer_hidden_stories` exists; hide persists across sessions
- [ ] `prayer_video_responses.removed_at` / `removal_source` columns exist
- [ ] `prayer_video_responses.duration_verification_status` defaults to `unavailable`
- [ ] `content_reports` accepts inserts via `/api/submit-content-report`
- [ ] `/api/remove-prayer-video-response` returns 403 for unauthorized users
- [ ] `/api/moderate-prayer-video-response` blocks approval when duration status is `failed`

## Manual tests still required

- Admin queue visibility (unless `PLAYWRIGHT_ADMIN_EMAIL` is configured)
- Full ffprobe worker pipeline (not implemented — see `lib/prayer-connect/responsePublication.ts`)
- Original prayer composer 120s server enforcement (no finalize API yet)

## Media fixtures

Video fixtures are generated at runtime via `ffmpeg` when available:
`tests/prayer/fixtures/generated/`

The 100 MB rejection test uploads a temporary object using `SUPABASE_SERVICE_ROLE_KEY`
and deletes it after the test.
