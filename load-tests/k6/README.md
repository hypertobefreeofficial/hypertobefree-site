# HTBF Gate A k6 Harness (Local Staging Only)

**Status:** Prepared — not executed by default.
**Do not run against production.**

This harness implements the workload design in `docs/scalability/HTBF_LOAD_TEST_PLAN.md` for Gate A preparation only.

## Active architecture

```
k6 on owner's Mac
  → HTBF production build at http://127.0.0.1:3100
  → isolated Supabase htbf-staging branch
```

**Active environment settings:**

| Variable | Value |
|----------|-------|
| `HTBF_LOAD_TEST_ENV` | `local-staging` |
| `HTBF_BASE_URL` | `http://127.0.0.1:3100` |

### Policy boundaries

- **Vercel Preview** is for **manual functional testing only**.
- **Automated load traffic targets localhost only.** No k6 test may target Vercel under the current Hobby plan.
- **Local Gate A** measures HTBF application code and Supabase staging behavior.
- **Local Gate A does not certify** Vercel Functions, Vercel networking, CDN, scaling, or production concurrency capacity.
- **Hosted load testing** (Vercel, production domains, or `*.vercel.app`) remains **disabled** unless separately authorized or an eligible Vercel plan is in place.

---

## Prerequisites

1. **htbf-staging Supabase branch** — separate from production; use the generated project reference (not the branch display name `htbf-staging`). See `docs/scalability/HTBF_GATE_A_STAGING_RUNBOOK.md`.
2. **Local production build** — start with `node load-tests/scripts/start-local-staging.mjs` (reads only gitignored `load-tests/k6/.env.staging.local`).
3. **Synthetic test users** — e.g. `loadtest_user_0001@staging.htbf.test` (never production emails).
4. **Synthetic seed content** — stories tagged `creation_mode='loadtest'`.
5. **k6 installed locally** — https://grafana.com/docs/k6/latest/set-up/install-k6/

---

## Required environment variables

Copy `load-tests/k6/.env.staging.local.example` → `load-tests/k6/.env.staging.local` (gitignored).

| Variable | Required | Notes |
|----------|----------|-------|
| `HTBF_LOAD_TEST_ENV` | Yes | Must be exactly `local-staging` |
| `HTBF_BASE_URL` | Yes | Must be `http://127.0.0.1:3100` (or configured local port) |
| `HTBF_STAGING_PROJECT_REF` | Yes | Generated Supabase project reference for htbf-staging |
| `HTBF_SUPABASE_URL` | Yes | Must exactly match `{HTBF_STAGING_PROJECT_REF}.supabase.co` |
| `HTBF_SUPABASE_ANON_KEY` | Yes | htbf-staging anon key only |
| `HTBF_SUPABASE_SERVICE_ROLE_KEY` | Seed/cleanup only | Never commit |
| `HTBF_TEST_USER_POOL_FILE` | Smoke run | Path to CSV `email,password` rows |
| `HTBF_ALLOW_MUTATIONS` | Smoke | Must remain `0` for first read-only smoke |
| `HTBF_ABORT_ON_ERROR` | Optional | Set `1` to fail fast above 5% HTTP errors |
| `HTBF_ALLOW_OPENAI` | Optional | Leave unset — OpenAI routes are not called |

---

## Runtime guards

The harness **refuses to start** when:

- `HTBF_LOAD_TEST_ENV` is not exactly `local-staging`
- `HTBF_BASE_URL` targets Vercel (`*.vercel.app`), `hypertobefree.com`, or any non-local host
- `HTBF_BASE_URL` uses a port other than the configured local test port (default 3100)
- `HTBF_STAGING_PROJECT_REF` is missing, equals the branch display name `htbf-staging`, or does not match the Supabase URL hostname
- Supabase URL or anon key is missing
- Test user pool / credentials are missing
- Smoke run has `HTBF_ALLOW_MUTATIONS=1`
- Mutation scenarios run without `HTBF_ALLOW_MUTATIONS=1` (future scenarios)
- Single-user email looks like production (`@hypertobefree.com`) or lacks `@staging.`

---

## Scenarios

| File | VUs | Duration | Status |
|------|-----|----------|--------|
| `scenarios/smoke-10.js` | 10 | 5 min | **Active** — read-only local smoke |
| `scenarios/baseline-50.js` | 50 | 15 min (2 min ramp) | **Inactive** — disabled until 10-user local smoke passes |
| `scenarios/gate-a-100.js` | 100 | 20 min (2 min ramp) | **Inactive** — disabled until 10-user local smoke passes |

Inactive scenarios call `assertHostedScenarioAllowed()` and refuse to run. They are preserved for future hosted certification only after separate authorization.

Shared modules:

- `scenarios/read-only-browse.js` — Feed, Prayer, Video Feed metadata, Search (no video downloads)
- `scenarios/authenticated-actions.js` — reactions, praying, saves/follows, dedicated reports (not used in first smoke)

---

## Workload mix (smoke — read-only)

| Workflow | Target share |
|----------|--------------|
| Feed browsing | 35% |
| Prayer browsing | 20% |
| Video Feed metadata | 15% |
| Search | 10% |

First local smoke run: **no reactions, uploads, reports, blocks, AI calls, or admin mutations.**

Future inactive scenarios retain the full mix documented in `config.example.js`.

---

## Thresholds (initial Gate A)

| Metric | Target |
|--------|--------|
| HTTP failure rate | < 1% |
| Feed p95 | < 3s |
| Prayer p95 | < 3s |
| Search p95 | < 3s |
| Unexpected auth failures | 0 |
| Unauthorized access | 0 |

---

## Media workload limitation

- This harness does **not** simulate video file downloads or autoplay-driven media fetches.
- The first Gate A run measures **API/DB/metadata** workload only.
- **Gate A cannot certify full media capacity** until autoplay is restored and a separate media-bandwidth scenario is added.

---

## Local Gate A workflow

### 1. Configure credentials (owner only)

```bash
cp load-tests/k6/.env.staging.local.example load-tests/k6/.env.staging.local
# Fill ACTUAL_STAGING_PROJECT_REF and htbf-staging keys — never commit this file
```

### 2. Start local production build

```bash
node load-tests/scripts/start-local-staging.mjs
```

### 3. Seed synthetic users/content (separate terminal, owner only)

```bash
node load-tests/scripts/seed-gate-a-staging.mjs
```

### 4. Run read-only smoke (10 VUs / 5 min)

```bash
node load-tests/scripts/run-smoke-10.mjs
```

Results are written to gitignored `load-tests/k6/results/`.

---

## DISABLED — do not use (Hobby plan / policy)

The following are **not permitted** as active Gate A targets:

```bash
# DISABLED — no k6 against Vercel Preview
# export HTBF_LOAD_TEST_ENV=staging
# export HTBF_BASE_URL=https://your-preview.vercel.app

# DISABLED — no production or hosted load testing without authorization
# k6 run load-tests/k6/scenarios/baseline-50.js
# k6 run load-tests/k6/scenarios/gate-a-100.js
```

Vercel Preview may still be used for **manual** functional verification (Feed, Prayer, Search, etc.).

---

## Safety controls

- Synthetic staging accounts only (`loadtest_user_*@staging.htbf.test`)
- Synthetic staging content tagged `creation_mode='loadtest'`
- No OpenAI calls unless explicitly enabled
- No destructive admin actions
- No deletion of non-test content (cleanup is marker-scoped)
- Conservative think times between requests
- Optional abort on elevated error rate

---

## Cleanup

Scripts (local-staging only — do not run against production):

```bash
# Dry-run is the default (no deletes)
node load-tests/scripts/cleanup-gate-a-staging.mjs

# Live delete requires explicit confirmation
HTBF_CLEANUP_DRY_RUN=0 HTBF_CONFIRM_CLEANUP=1 node load-tests/scripts/cleanup-gate-a-staging.mjs
```

Cleanup requires:

- `HTBF_LOAD_TEST_ENV=local-staging` (via `load-tests/k6/.env.staging.local`)
- Dry-run by default; live delete needs `HTBF_CLEANUP_DRY_RUN=0` and `HTBF_CONFIRM_CLEANUP=1`
- Deletes only `creation_mode='loadtest'` stories and `loadtest_user_*@staging.htbf.test` auth users

---

## Limitations statement

**Local Gate A tests HTBF code and Supabase staging only. It does not certify Vercel or production concurrency capacity.**

---

## External dashboards

During local smoke, watch **Supabase htbf-staging** dashboards manually. Vercel metrics are not applicable to local Gate A runs. See `docs/scalability/HTBF_DASHBOARD_DATA_CHECKLIST.md` and `docs/scalability/HTBF_GATE_A_STAGING_RUNBOOK.md`.
