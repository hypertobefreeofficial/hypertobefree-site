# HTBF Gate A Staging Runbook

Manual steps for the repository owner. **Do not run against production.**

This runbook supports Gate A preparation on branch `feat/scalability-phase-1`. It does **not** execute load tests or apply migrations automatically.

---

## Step 0 — Confirm Preview uses staging Supabase (mandatory)

The repository **does not contain** Vercel Preview environment values. Confirm manually before any SQL or k6 work.

### In Vercel

1. Open the HTBF Vercel project.
2. Go to **Settings → Environment Variables**.
3. Compare **Preview** vs **Production** for:
   - `NEXT_PUBLIC_SUPABASE_URL`
4. Record only safe identifiers:
   - Supabase hostname (e.g. `abcdefgh.supabase.co`)
   - Project reference (subdomain before `.supabase.co`)
   - Whether Preview and Production references **match**

### Safe recording template

```
Preview deployment URL:
Preview NEXT_PUBLIC_SUPABASE_URL hostname:
Preview Supabase project ref:
Production NEXT_PUBLIC_SUPABASE_URL hostname:
Production Supabase project ref:
Preview and Production match? (yes/no):
Confirmed staging-only for Gate A? (yes/no):
```

### Critical rule

| Condition | Action |
|-----------|--------|
| Preview and Production Supabase refs **match** | **STOP.** Do not apply indexes. Do not run k6 against Preview. |
| Preview uses a **separate staging** Supabase project | Proceed with Steps A–E on **staging only** |
| Cannot confirm | **STOP** until Vercel owner verifies |

Local `.env.local` in this workspace currently contains **no** `NEXT_PUBLIC_SUPABASE_URL`; local env cannot be used to infer Preview configuration.

---

## Step A — Verify before migration

**Where:** Supabase **staging** project → SQL Editor

**Run:** entire contents of `supabase/scalability/verify-scalability-indexes.sql`

**Record:**

| Item | Your notes |
|------|------------|
| Existing matching indexes | |
| Missing proposed indexes | |
| Unexpected duplicates | |
| Column verification query errors | |
| Tables/columns missing | |

**Stop** if required columns are missing. Resolve schema drift before continuing.

---

## Step B — Read-only baseline

**Where:** Supabase **staging** project → SQL Editor

**Run:** entire contents of `supabase/scalability/read-only-diagnostics.sql`

**Record:**

| Metric | Your notes |
|--------|------------|
| Database size | |
| Largest tables (top 5) | |
| Largest indexes (top 5) | |
| Active connections | |
| Max connections | |
| Sequential scan hotspots | |
| Cache hit ratio | |
| Long-running queries | |
| Slow-query extension availability | |

Export or screenshot results. Label with date/time and project ref.

---

## Step C — Apply staging migration (staging only)

**Only after Step 0 confirms a separate staging project.**

**Where:** Supabase **staging** project → SQL Editor

**Run:** entire contents of `supabase/migrations/20260724_scalability_indexes.sql`

### Safety checklist

- [ ] This is the **staging** project, not production
- [ ] Step A column verification passed
- [ ] Owner has screenshots/export ready
- [ ] Maintenance window acceptable if tables are large
- [ ] Team notified that index builds may briefly increase write latency

### If any error appears

**Stop immediately.** Do not retry blindly. Capture the exact error message and table/column name.

### Locking note

Standard `CREATE INDEX` can lock writes on large tables. For production-sized datasets, prefer `CREATE INDEX CONCURRENTLY` in a controlled maintenance window (future production runbook).

---

## Step D — Verify after migration

**Where:** Supabase **staging** project → SQL Editor

**Run:** `supabase/scalability/verify-scalability-indexes.sql` again

**Confirm each intended index exists:**

- [ ] `stories_feed_approved_created_idx`
- [ ] `stories_prayer_approved_created_idx`
- [ ] `prayer_video_responses_story_approved_idx`
- [ ] `story_reactions_story_id_idx`
- [ ] `blocked_users_blocker_idx`
- [ ] `blocked_users_blocked_idx`
- [ ] `stories_admin_pending_created_idx`
- [ ] `content_reports_admin_created_idx`
- [ ] `content_reports_open_created_idx`

---

## Step E — Functional regression check after indexes

Retest on **staging Preview** (manual):

| Area | Pass/Fail | Notes |
|------|-----------|-------|
| Feed load | | |
| Prayer load | | |
| Search pagination (Load more) | | |
| Admin pagination (Load more) | | |
| Reactions | | |
| Report and Block | | |
| Public video responses | | |

### Known regressions (do not blame indexes without evidence)

| Issue | Classification | Gate A impact |
|-------|----------------|---------------|
| Feed videos not autoplaying on scroll | **Must restore before Gate A media certification** | Load test without autoplay understates media/network demand |
| God Did It action not working | **Must fix before merge to main** | Does not block building harness; blocks production merge approval |

Do not claim indexes caused or fixed these unless evidence proves it.

---

## Step F — Gate A metrics capture (during future k6 run)

Use `docs/scalability/HTBF_DASHBOARD_DATA_CHECKLIST.md` Gate A section.

Collect simultaneously from k6 output and dashboards:

### Vercel (Preview deployment under test)

- Preview deployment URL
- Function invocation count
- Function p50 / p95 / p99
- Error rate
- Highest-latency routes
- Function memory
- External API duration

### Supabase (staging project)

- Compute tier
- Pooler mode
- Active / max DB connections
- CPU
- Memory
- Database size
- Slow queries
- Realtime connections / messages
- Storage operation volume

### OpenAI (staging key only)

- Requests during test window
- 429 errors
- Spend during test window

---

## Step G — k6 harness (prepare only in this phase)

Files live under `load-tests/k6/`.

**Do not run** until:

1. Step 0 confirms staging isolation
2. Staging seed users and load-test content exist
3. Feed autoplay restoration is planned for media-capacity certification

See `load-tests/k6/README.md` for environment variables and guards.

---

## Gate A certification gate

Gate A tooling may be prepared, but Gate A **must not be certified** until:

1. Video autoplay is restored and media workload is included or separately measured
2. Test runs against a **confirmed separate staging** environment
3. Thresholds in `load-tests/k6/config.example.js` pass on staging
4. God Did It functional regression is fixed before main merge approval
