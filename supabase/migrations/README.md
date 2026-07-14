# Prayer production migrations

## Order of operations

1. Run **preflight** (read-only) in the Supabase SQL editor:

   `20260712_prayer_production_readiness_preflight.sql`

2. Review the four result sets:
   - Invalid / incomplete coordinates and visibility values
   - Duplicate authenticated `praying` / `encouraged` reactions
   - Null-user prayer reactions
   - Approved prayer rows still needing coordinate backfill

3. If preflight reports invalid coordinate/visibility data, correct those rows
   first. The hardened migration will abort on those conditions.

4. Apply the **hardened** migration during a low-traffic window only after
   preflight looks acceptable:

   `20260712_prayer_production_readiness_hardened.sql`

5. Do **not** apply migrations from this repo automatically. There is no local
   `DATABASE_URL` / Supabase CLI wiring in this project by default.

## Current files

| File | Purpose |
|------|---------|
| `20260712_prayer_production_readiness_preflight.sql` | Read-only preflight checks |
| `20260712_prayer_production_readiness_hardened.sql` | Hardened transactional migration |

| `20260713_prayer_search_preferences.sql` | User-owned prayer discovery defaults (optional) |
| `20260714_prayer_video_response_removal.sql` | Soft-removal bookkeeping for public video responses (additive) |
| `20260715_prayer_interaction_persistence.sql` | Server-backed hide (`prayer_hidden_stories`) + optional `content_reports` RLS |
| `20260716_prayer_video_response_duration_verification.sql` | Duration verification state on public video responses |
| `20260718_prayer_video_response_thumbnails.sql` | Persisted thumbnails on public video responses |

The original unhardened `20260712_prayer_production_readiness.sql` has been
removed and replaced by the hardened file.

`20260714_prayer_video_response_removal.sql` is additive and idempotent. It adds
`removed_at`, `removed_by_user_id`, `removal_source`, `removal_reason`, and
`updated_at` to the pre-existing `prayer_video_responses` table, plus an
`updated_at` touch trigger and a partial index for still-public responses. It
does **not** change the existing `status` CHECK constraint; prayer-owner,
author, and moderator removals all use `status = 'removed'` and are
distinguished by `removal_source`. Who may remove a response is enforced
server-side by `/api/remove-prayer-video-response` (service role,
ownership-verified). The app degrades gracefully if this migration has not been
applied yet.

`20260715_prayer_interaction_persistence.sql` is additive and idempotent. It
creates `prayer_hidden_stories` (private per-user hide, with RLS) and optionally
hardens `content_reports` with snapshot columns + reporter-only policies when
that table already exists. Save continues to reuse `saved_content`; follow
continues to use `prayer_follows` (20260712). Apply manually in Supabase SQL
editor (dev/staging first):

```sql
-- In Supabase SQL editor:
\i supabase/migrations/20260715_prayer_interaction_persistence.sql
```

Or paste the file contents into the SQL editor and run.

## Optional follow-up migration

`20260713_prayer_search_preferences.sql` stores per-user Prayer discovery
defaults (search mode, approximate center, radius, filters). The app falls
back to `localStorage` when this table is not applied yet.

## What the hardened migration does

- Adds privacy-safe public geo columns with validation + CHECK constraints
- Deduplicates prayer `praying` / `encouraged` reactions, then adds a partial
  unique index (or relies on a stronger existing all-reaction unique constraint)
- Creates `prayer_follows` with tighter insert eligibility + column grants
- Creates `prayer_written_responses` with timestamp trigger, tighter RLS, and
  limited grants

## What it does not do

- Does not backfill legacy prayer locations into `public_lat` / `public_lng`
- Does not prove coordinates were privacy-jittered before insert
- Does not fully encode per-request “allow written prayers” settings in RLS
  (server endpoint must still enforce that)

## Notes

- Saved requests continue to reuse existing `saved_content`
- Until coordinates are stored/backfilled, the app may fall back to client-side
  privacy-safe geocoding of location labels
