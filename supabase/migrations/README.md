# HTBF Supabase Migrations

Migration history was **squashed on 2026-08-16**.

## Active migrations

Only these files are replayed by Supabase CLI on a clean database:

| Version | File | Purpose |
|---------|------|---------|
| `20260816183000` | `20260816183000_current_production_baseline.sql` | Current production schema immediately before Journey Private Media Phase 1 |
| `20260816183100` | `20260816183100_journey_private_media_phase1.sql` | Journey Inbox private media boundary (private bucket + inbox RLS hardening) |

## Squash rationale

Historical July 2026 incremental migrations were archived to
`supabase/migration_archive/pre_baseline_2026/`. They remain in Git for audit
and reference but must **not** be replayed on preview branches or new
environments.

The baseline already includes the effects of those migrations as they exist in
**production today**.

## Production deployment rules

1. **Do not run the baseline SQL against existing production.** Production
   already has this schema. Use migration repair to mark
   `20260816183000` as applied without executing it.

2. **Phase 1 (`20260816183100`)** remains pending on production until
   explicitly deployed after preview validation.

3. **Future schema changes** must use unique 14-digit Supabase migration
   timestamps (e.g. `20260817120000_description.sql`). Do not reuse or
   duplicate version numbers.

4. **Do not manually paste production schema changes** into the Supabase SQL
   editor without adding a corresponding migration file to this directory.

## Archived migrations

Pre-squash files live in:

```
supabase/migration_archive/pre_baseline_2026/
```

Includes the former `20260712`–`20260816` incremental migrations and the
superseded proposed baseline (`20260711`).

## Preview branch workflow (temporary)

```
Empty Supabase preview branch
  → 20260816183000 (baseline)
  → 20260816183100 (Phase 1)
  → Vercel Preview + security tests
  → delete branch same day
```

## Local introspection artifacts

`supabase/production_public_schema.sql` is a local-only schema dump used to
build the baseline. It is gitignored and must not be committed.
