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

The original unhardened `20260712_prayer_production_readiness.sql` has been
removed and replaced by the hardened file.

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
