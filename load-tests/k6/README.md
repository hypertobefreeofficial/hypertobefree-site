# HTBF Gate A k6 Harness (Staging Only)

**Status:** Prepared — not executed by default.
**Do not run against production.**

This harness implements the workload design in `docs/scalability/HTBF_LOAD_TEST_PLAN.md` for Gate A preparation only. It exercises Supabase REST reads and optional authenticated mutations against a **confirmed staging** Preview deployment.

---

## Prerequisites

1. **Confirmed separate staging Supabase project** — see `docs/scalability/HTBF_GATE_A_STAGING_RUNBOOK.md` Step 0.
2. **Staging Preview URL** — Vercel Preview deployment for `feat/scalability-phase-1` or a dedicated staging branch.
3. **Synthetic test users** — e.g. `loadtest_user_0001@staging.htbf.test` (never production emails).
4. **Synthetic seed content** — stories tagged `creation_mode='loadtest'` for mutation scenarios.
5. **k6 installed locally** — https://grafana.com/docs/k6/latest/set-up/install-k6/

---

## Required environment variables

| Variable | Required | Notes |
|----------|----------|-------|
| `HTBF_LOAD_TEST_ENV` | Yes | Must be exactly `staging` |
| `HTBF_BASE_URL` | Yes | Staging Preview URL only |
| `HTBF_SUPABASE_URL` | Yes | Staging Supabase project URL |
| `HTBF_SUPABASE_ANON_KEY` | Yes | Staging anon key only |
| `HTBF_TEST_USER_POOL_FILE` | One of pool or single user | Path to CSV `email,password` rows |
| `HTBF_TEST_USER_EMAIL` | Alternative to pool | Single staging test user |
| `HTBF_TEST_USER_PASSWORD` | With single user | Staging password |
| `HTBF_ALLOW_MUTATIONS` | For mutation mix | Must be `1` to enable writes |
| `HTBF_REPORT_TARGET_STORY_ID` | For report tests | Dedicated load-test story UUID |
| `HTBF_ABORT_ON_ERROR` | Optional | Set `1` to fail fast above 5% HTTP errors |
| `HTBF_ALLOW_OPENAI` | Optional | Leave unset — OpenAI routes are not called |

---

## Production-run guards

The harness **refuses to start** when:

- `HTBF_LOAD_TEST_ENV` is not exactly `staging`
- `HTBF_BASE_URL` hostname matches `hypertobefree.com` or `www.hypertobefree.com`
- Supabase URL or anon key is missing
- Test user pool / credentials are missing
- Mutation scenarios run without `HTBF_ALLOW_MUTATIONS=1`
- Report tests run without `HTBF_REPORT_TARGET_STORY_ID`
- Single-user email looks like production (`@hypertobefree.com`) or lacks `@staging.`

---

## Scenarios

| File | VUs | Duration | Purpose |
|------|-----|----------|---------|
| `scenarios/smoke-10.js` | 10 | 5 min | Script validation |
| `scenarios/baseline-50.js` | 50 | 15 min (2 min ramp) | Baseline p95 |
| `scenarios/gate-a-100.js` | 100 | 20 min (2 min ramp) | Gate A candidate |

Shared modules:

- `scenarios/read-only-browse.js` — Feed, Prayer, Video Feed metadata, Search
- `scenarios/authenticated-actions.js` — reactions, praying, saves/follows, dedicated reports

---

## Workload mix (initial)

| Workflow | Target share |
|----------|--------------|
| Feed browsing | 35% |
| Prayer browsing | 20% |
| Video Feed metadata | 15% |
| Search | 10% |
| Reactions | 8% |
| I'm Praying | 5% |
| Saves / follows | 3% |
| Reports / blocks (dedicated test content) | 2% |
| Admin / moderation (future dedicated pool) | 2% |

Mutations are skipped unless `HTBF_ALLOW_MUTATIONS=1`.

---

## Thresholds (initial Gate A)

| Metric | Target |
|--------|--------|
| HTTP failure rate | < 1% |
| Feed p95 | < 3s |
| Prayer p95 | < 3s |
| Search p95 | < 3s |
| Mutation p95 | < 2.5s |
| Unexpected auth failures | 0 |
| Unauthorized access | 0 |
| Duplicate mutation records | 0 |

---

## Media workload limitation (current)

Manual Preview testing found **Feed video autoplay is currently broken**. Therefore:

- This harness does **not** simulate video file downloads or autoplay-driven media fetches.
- The first Gate A run measures **API/DB/signed-URL metadata** workload only.
- **Gate A cannot certify full media capacity** until autoplay is restored and a separate media-bandwidth scenario is added.

---

## Example commands (staging only — do not run until owner confirms environment)

```bash
export HTBF_LOAD_TEST_ENV=staging
export HTBF_BASE_URL=https://your-preview.vercel.app
export HTBF_SUPABASE_URL=https://your-staging-project.supabase.co
export HTBF_SUPABASE_ANON_KEY=your-staging-anon-key
export HTBF_TEST_USER_POOL_FILE=./load-tests/k6/fixtures/users.pool.example.csv
export HTBF_ALLOW_MUTATIONS=0
export HTBF_ABORT_ON_ERROR=1

k6 run load-tests/k6/scenarios/smoke-10.js
# k6 run load-tests/k6/scenarios/baseline-50.js
# k6 run load-tests/k6/scenarios/gate-a-100.js
```

---

## Safety controls

- Synthetic staging accounts only
- Synthetic staging content tagged `creation_mode='loadtest'`
- Report tests limited to `HTBF_REPORT_TARGET_STORY_ID`
- No OpenAI calls unless explicitly enabled
- No destructive admin actions
- No deletion of non-test content
- Conservative think times between requests
- Optional abort on elevated error rate

---

## Cleanup

No cleanup script is included in this phase. Future cleanup must:

- Require `HTBF_LOAD_TEST_ENV=staging`
- Match only rows tagged `creation_mode='loadtest'` or `notes='htbf_loadtest'`
- Never operate without an explicit staging project ref check

---

## External dashboards to watch manually

See `docs/scalability/HTBF_DASHBOARD_DATA_CHECKLIST.md` and `docs/scalability/HTBF_GATE_A_STAGING_RUNBOOK.md`.
