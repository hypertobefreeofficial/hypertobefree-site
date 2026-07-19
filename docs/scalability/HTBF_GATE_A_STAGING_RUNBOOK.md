# HTBF Gate A Staging Runbook

Manual steps for the repository owner. **Do not run against production.**

This runbook supports Gate A preparation on branch `feat/scalability-phase-1`. It does **not** execute load tests or apply migrations automatically.

---

## Policy — load testing boundary

| Target | Permitted use |
|--------|---------------|
| **Local production build** (`http://127.0.0.1:3100`) | **Active Gate A k6 smoke** (10 VUs, read-only) |
| **Supabase htbf-staging branch** | Backend for local build and k6 REST reads |
| **Vercel Preview** | **Manual functional testing only** — no k6 |
| **Vercel / production hosted URLs** | **Disabled** for automated load traffic unless separately authorized |

**Local Gate A tests HTBF code and Supabase staging only. It does not certify Vercel or production concurrency capacity.**

### Active architecture

```
k6 on owner's Mac
  → HTBF production build at http://127.0.0.1:3100
  → isolated Supabase htbf-staging branch
```

Active settings: `HTBF_LOAD_TEST_ENV=local-staging`, `HTBF_BASE_URL=http://127.0.0.1:3100`

See `load-tests/k6/README.md` for harness details.

---

## Step 0 — Confirm staging isolation (mandatory)

The repository **does not contain** live Supabase credentials. Confirm manually before any SQL or k6 work.

### In Vercel (manual functional testing only)

1. Open the HTBF Vercel project.
2. Go to **Settings → Environment Variables**.
3. Compare **Preview** vs **Production** for `NEXT_PUBLIC_SUPABASE_URL`.
4. Record only safe identifiers (hostname, project ref, whether Preview and Production match).

### In Supabase

1. Open the **htbf-staging** branch dashboard.
2. Record the **generated project reference** (hostname prefix before `.supabase.co`).
3. Confirm it is **not** the production project reference.

### Safe recording template

```
htbf-staging Supabase project ref (generated):
Production Supabase project ref:
Preview and Production match? (yes/no):
Local Gate A uses htbf-staging only? (yes/no):
```

### Critical rule

| Condition | Action |
|-----------|--------|
| htbf-staging and production refs **match** | **STOP.** Do not seed, load test, or apply indexes until isolation is confirmed. |
| htbf-staging is a **separate branch/project** | Proceed with Steps A–G on **staging only** |
| Cannot confirm | **STOP** until owner verifies |

**Do not run k6 against Vercel Preview** under the current Hobby plan.

---

## Step A — Verify before migration

**Where:** Supabase **htbf-staging** → SQL Editor

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

**Where:** Supabase **htbf-staging** → SQL Editor

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

**Where:** Supabase **htbf-staging** → SQL Editor

**Run:** entire contents of `supabase/migrations/20260724_scalability_indexes.sql`

### Safety checklist

- [ ] This is the **htbf-staging** project, not production
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

**Where:** Supabase **htbf-staging** → SQL Editor

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

## Step E — Functional regression check

### Manual — Vercel Preview (optional)

Use Preview for **manual** functional checks only (not k6):

| Area | Pass/Fail | Notes |
|------|-----------|-------|
| Feed load | | |
| Prayer load | | |
| Search pagination (Load more) | | |
| Admin pagination (Load more) | | |
| Reactions | | |
| Report and Block | | |
| Public video responses | | |

### Local — before k6 smoke

After starting the local production build (`start-local-staging.mjs`), confirm `/feed` responds on `http://127.0.0.1:3100`.

### Known regressions (do not blame indexes without evidence)

| Issue | Classification | Gate A impact |
|-------|----------------|---------------|
| Feed videos not autoplaying on scroll | **Must restore before Gate A media certification** | Load test without autoplay understates media/network demand |
| God Did It action not working | **Must fix before merge to main** | Does not block building harness; blocks production merge approval |

---

## Step F — Gate A metrics capture (during local k6 smoke)

Use `docs/scalability/HTBF_DASHBOARD_DATA_CHECKLIST.md` Gate A section.

Collect from k6 output and **Supabase htbf-staging** dashboards:

### Local application (127.0.0.1:3100)

- Total requests, failure rate, p50/p95/p99
- Feed, Prayer, Search p95
- Local Next.js server errors (stdout)
- Mac CPU/memory (optional, Activity Monitor)

### Supabase (htbf-staging)

- Compute tier
- Pooler mode
- Active / max DB connections
- CPU, memory, database size
- Slow queries
- Realtime connections / messages
- Storage operation volume

### Not applicable to local Gate A

- Vercel function invocations, CDN, hosted concurrency (local build bypasses Vercel infrastructure)

### OpenAI (staging key only)

- Should remain **zero** during read-only smoke

---

## Step G — Local k6 harness

Files live under `load-tests/k6/` and `load-tests/scripts/`.

**Workflow (owner):**

1. Copy `.env.staging.local.example` → `.env.staging.local` (gitignored)
2. `node load-tests/scripts/start-local-staging.mjs`
3. `node load-tests/scripts/seed-gate-a-staging.mjs`
4. `node load-tests/scripts/run-smoke-10.mjs`

**Do not run** until Step 0 confirms staging isolation.

**Inactive until 10-user smoke passes:** `baseline-50.js`, `gate-a-100.js` (hosted scenarios disabled by policy).

---

## Gate A certification gate

Gate A tooling may be prepared, but Gate A **must not be certified** until:

1. Video autoplay is restored and media workload is included or separately measured
2. Local 10-user read-only smoke passes against htbf-staging
3. Thresholds in `load-tests/k6/config.example.js` pass locally
4. God Did It functional regression is fixed before main merge approval
5. Hosted end-to-end capacity certification requires written Vercel approval or an eligible Vercel plan
