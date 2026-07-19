# HTBF Staging Load-Test Plan

**Status:** Local Gate A **complete** — 10-user smoke, 50-user baseline, and corrected 100-user run **passed** (2026-07-19). Do not run against production.
**Tool:** k6 (scripts under `load-tests/k6/`)

---

## Active Gate A architecture (current policy)

```
k6 on owner's Mac
  → HTBF production build at http://127.0.0.1:3100
  → isolated Supabase htbf-staging branch
```

| Setting | Value |
|---------|-------|
| `HTBF_LOAD_TEST_ENV` | `local-staging` |
| `HTBF_BASE_URL` | `http://127.0.0.1:3100` |

- **Vercel Preview:** manual functional testing only — **no k6**.
- **Hosted load testing:** disabled unless separately authorized.
- **Local Gate A** measures HTBF code and Supabase staging only; it does **not** certify Vercel or production capacity.

---

## Local Gate A completion summary (2026-07-19)

| Stage | VUs | Duration | Result |
|-------|-----|----------|--------|
| Smoke | 10 | 5 min | **Passed** |
| Baseline | 50 | 15 min | **Passed** |
| Growth A (corrected) | 100 | 20 min | **Passed** |

Latency remained stable across all three tests. No HTTP failures or failed checks occurred at any stage.

**Local Gate A is now complete.** Larger local VU testing is **not currently recommended**. The next phase requires a **deliberately designed workload** (media delivery, writes, AI, hosted infrastructure) rather than simply increasing VUs.

### What local Gate A validates

- Authenticated read paths: Feed, Prayer, Video Feed metadata, reaction-count reads, Search
- HTBF application code against a production-style local Next.js build
- htbf-staging Supabase read capacity for the workloads above

### What local Gate A does **not** certify

- Vercel Functions
- Vercel networking or CDN
- Production concurrency
- Full video delivery or autoplay-driven media fetches
- Uploads
- AI workloads
- Write-heavy behavior (reactions, saves, follows, reports, blocks, admin)
- Browser rendering or autoplay performance

Result JSON remains local and gitignored under `load-tests/k6/results/`.

---

## Accepted 10-user local smoke (2026-07-19)

| Metric | Result |
|--------|--------|
| Virtual users | 10 |
| Duration | 5 minutes |
| Total HTTP requests | 604 |
| HTTP failure rate | 0.00% |
| Check pass rate | 100.00% |
| HTTP p50 / p95 | 81.8 ms / 107.2 ms |
| Feed / Prayer / Search p95 | 102 ms / 99 ms / 101.1 ms |
| Preflight authentication requests | 10 (per-VU sign-in) |
| Authentication failures | 0 |
| HTTP 4xx / 5xx | 0 / 0 |

---

## Accepted 50-user local baseline (2026-07-19)

| Metric | Result |
|--------|--------|
| Virtual users | 50 |
| Duration | 15 minutes |
| Total HTTP requests | 8,108 |
| Requests per second | 8.93 |
| Iterations | 7,004 |
| HTTP failure rate | 0.00% |
| Check pass rate | 100.00% |
| HTTP p50 / p95 / p99 | 79.7 ms / 100.2 ms / 134.1 ms |
| Feed p95 / p99 | 102 ms / 120 ms |
| Prayer p95 / p99 | 101 ms / 115 ms |
| Video Feed p95 / p99 | 97 ms / 112 ms |
| Search p95 / p99 | 100 ms / 117 ms |
| Load-phase authentication requests | 50 (per-VU sign-in) |
| Authentication failures | 0 |
| HTTP 4xx / 5xx | 0 / 0 |

---

## Accepted corrected 100-user Gate A (2026-07-19)

| Metric | Result |
|--------|--------|
| Virtual users | 100 |
| Duration | 20 minutes |
| Total HTTP requests | 21,958 |
| Requests per second | 18.17 |
| Iterations | 19,067 |
| Iterations per second | 15.78 |
| HTTP failure rate | 0.00% |
| Check pass rate | 100.00% |
| HTTP p50 / p95 / p99 | 77.3 ms / 96.7 ms / 136.8 ms |
| Feed p95 / p99 | 100 ms / 148 ms |
| Prayer p95 / p99 | 98 ms / 146 ms |
| Video Feed p95 / p99 | 96 ms / 136 ms |
| Search p95 / p99 | 97.7 ms / 143 ms |
| Preflight authentication requests | 10 (sequential, cached sessions) |
| Load-phase authentication requests | 0 |
| Auth 429 responses | 0 |
| HTTP 4xx / 5xx | 0 / 0 |
| Seed after run | 10 users, 35 stories, 22 prayer stories (unchanged) |
| Local server health | HTTP 200 before and after run |

Read-only workload: Feed, Prayer, Video Feed metadata (including reaction-count reads), Search. No reactions, saves, follows, reports, blocks, uploads, AI calls, or admin mutations.

**Session model:** 10 synthetic users authenticated sequentially before k6; 100 VUs mapped deterministically with `(VU - 1) % 10` (~10 VUs per cached session). Zero password sign-ins or token refresh during the load phase.

---

## Aborted first 100-user attempt (2026-07-19 — do not use for capacity verdict)

| Classification | Detail |
|----------------|--------|
| Status | **ABORTED** — authentication burst from one IP triggered Supabase Auth HTTP 429 |
| Cause | Per-VU password sign-in during ramp (~100 `/auth/v1/token` requests from one IP) |
| First 429 | ~52 VUs during 2-minute ramp |
| Capacity verdict | **Not an HTBF read-capacity failure** — auth rate limiting only |

The corrected harness (preflight session pool + zero load-phase auth) resolved this before the accepted run above.

---

## Objectives

1. Measure p95/p99 latency and error rates at staged concurrency levels
2. Identify first-failing component (Vercel, Supabase DB, Storage, Realtime, OpenAI)
3. Validate rate limits and RLS under parallel users
4. Produce evidence for certification gates (100 / 250 / 500 / 1,000 CCU)

---

## Environment requirements

| Requirement | Notes |
|-------------|-------|
| **htbf-staging Supabase branch** | Separate from production; use generated project reference |
| **Local production build** | `next build` + `next start` on `127.0.0.1:3100` via `start-local-staging.mjs` |
| **Vercel Preview** | Manual functional testing only — not a k6 target |
| **Test users** | 10 synthetic users (`loadtest_user_*@staging.htbf.test`) |
| **Test content** | Synthetic stories tagged `creation_mode='loadtest'` |
| **OpenAI** | Not called during read-only Gate A |
| **Observability** | Supabase htbf-staging dashboards + k6 output; Vercel N/A for local runs |
| **Load generator** | k6 on owner's Mac only |

---

## Test-data requirements

| Entity | Minimum for 1k CCU test | Cleanup |
|--------|-------------------------|---------|
| Auth users | 1,200 (`loadtest_user_0001@staging.htbf.test`) | Delete auth users + profiles after test |
| Approved stories | 5,000 mixed types | Tag `creation_mode='loadtest'` for bulk delete |
| Prayer rows | 2,000 with geo coords | Same tag |
| Video responses | 500 approved | Delete by tag + storage prefix |
| Reactions | 50,000 distributed | Delete by story_id set |
| Blocks/saves | 10% of users | Delete join rows |

**Storage prefix:** `{userId}/loadtest/` for all uploaded blobs.
**Post-test cleanup script:** Required before next run (not created in this audit).

---

## Workload mix (based on code paths)

| Workflow | % of VUs | Primary endpoints / actions |
|----------|----------|----------------------------|
| Feed browse (initial + load more) | 35% | Supabase: stories/responses aggregate; Storage: signed URLs |
| Prayer discovery (scroll, tab switch) | 20% | Supabase: 300-row load; client filter; optional detail open 10% |
| Video metadata / video-feed | 15% | Supabase stories limit 30; Realtime channel |
| Search (authenticated) | 5% | Supabase unbounded stories select |
| Reactions (feed encouragement) | 10% | Supabase insert/delete `story_reactions` |
| I'm Praying / prayer reactions | 5% | Supabase `story_reactions` |
| Save / follow | 3% | Supabase `saved_content`, `prayer_follows` |
| Report / block | 2% | POST `/api/submit-content-report`; `blocked_users` upsert |
| Upload init + finalize (video response) | 3% | Storage upload + POST `/api/responses/public-video` |
| Public video response view | 2% | Signed URL fetch (CDN) |
| Admin moderation | <1% | Separate admin VU pool (5 users) |
| Journey / messages | 5% | Inbox + messages Realtime |

Local Gate A (10 / 50 / 100) used **read-only** subset only: Feed, Prayer, Video Feed metadata, reaction-count reads, Search.

---

## k6 stages (ramp design)

| Stage | Name | VUs | Duration | Status |
|-------|------|-----|----------|--------|
| 0 | Smoke | 10 | 5 min | **Passed** — local read-only (`smoke-10.js`) |
| 1 | Baseline | 50 | 15 min | **Passed** — `baseline-50.js` via `run-baseline-50.mjs` |
| 2 | Growth A | 100 | 20 min | **Passed** — corrected `gate-a-100.js` via `run-gate-a-100.mjs` |
| 3 | Growth B | 250 | 25 min | Future — requires hosted authorization + new workload design |
| 4 | Growth C | 500 | 30 min | Future — requires hosted authorization |
| 5 | Stress | 1,000 | 20 min | Future — requires hosted authorization |
| 6 | Soak | 250 | 60 min | Future — requires hosted authorization |

**Ramp:** Linear ramp-up 2 min per stage entry; 5 min cool-down between major stages (inactive scenarios preserved for future use).

---

## Per-scenario thresholds (pass/fail)

| Metric | Gate A (100) | Gate B (250) | Gate C (500) | Gate D (1000) |
|--------|--------------|--------------|--------------|---------------|
| HTTP/API failure rate | <1% | <1% | <2% | <3% |
| Feed load p95 | <3s | <4s | <6s | <8s |
| Feed load p99 | <6s | <8s | <12s | <15s |
| Prayer load p95 | <4s | <6s | <8s | <10s |
| Video response submit p95 | <5s | <7s | <10s | <12s |
| Supabase DB CPU (dashboard) | <60% | <70% | <80% | <85% |
| DB active connections | <50% max | <60% | <70% | <75% |
| Realtime connections | <50% plan limit | <60% | <70% | <75% |
| Vercel function error rate | <0.5% | <1% | <1% | <2% |
| Duplicate records | 0 | 0 | 0 | 0 |
| Unauthorized access (403/RLS) | 0 | 0 | 0 | 0 |
| AI duplicate charges (staging) | 0 unexpected | 0 | 0 | 0 |

**Stop conditions (abort test):**

- DB connections >90% max for 2 min
- Error rate >10% for 3 min
- OpenAI spend > staging daily cap
- Data corruption detected
- Production URL hit (hard block in k6 env)

---

## Scenarios (k6 — implemented under load-tests/k6/scenarios/)

### S1 — Feed browse

1. Authenticate as `loadtest_user_{vu}` (or use cached session for 100-user run)
2. GET feed data via Supabase REST (mirror client queries)
3. Sleep 3–8s (think time)

### S2 — Prayer discovery

1. Authenticate (or cached session)
2. Fetch prayer bundle query
3. Sleep 3–8s

### S3 — Reaction toggle

1. Pick random visible story ID from seed data
2. Insert `story_reactions` if absent; else delete
3. **Not included in local Gate A read-only runs**

### S4 — Video response submit

1. Upload small fixture MP4 to Storage (direct)
2. POST `/api/responses/public-video` with Bearer token
3. **Not included in local Gate A read-only runs**

### S5 — Report

1. POST `/api/submit-content-report`
2. **Not included in local Gate A read-only runs**

---

## Monitoring during test

Collect simultaneously:

- k6: `http_req_duration`, `http_req_failed`, custom Supabase metrics
- Local Next.js: server stdout errors during run
- Supabase htbf-staging: connections, CPU, IO, Realtime messages, slow queries
- OpenAI: should remain zero during read-only Gate A
- Storage: operation count (metadata-only; no video downloads)

**Not applicable to local Gate A:** Vercel function duration, invocations, CDN egress.

---

## Certification gates (roadmap)

### Gate A — 100 concurrent users (local read-only — **passed 2026-07-19**)

| Category | Status |
|----------|--------|
| Infrastructure | htbf-staging Supabase; local production build on `127.0.0.1:3100` |
| Code | 10 / 50 / 100 local read-only runs passed |
| Security | htbf-staging keys only; never production |
| Test | Stages 0–2 passed with zero HTTP failures |
| Pass | All local thresholds met |
| Limitation | Does **not** certify Vercel, CDN, media delivery, writes, or AI |

### Gate B — 250 concurrent users

| Category | Prerequisite |
|----------|--------------|
| Infrastructure | Connection pooler sized; alert rules configured; **hosted load authorization** |
| Code | Deliberate workload design beyond read-only VU scaling |
| Security | Distributed rate limits for public APIs |
| Test | Stage 3 + soak 250 VU 30 min |
| Pass | Gate B thresholds; no connection exhaustion |
| Engineering | **Medium** |

### Gate C — 500 concurrent users

| Category | Prerequisite |
|----------|--------------|
| Infrastructure | Supabase compute upgrade path validated |
| Code | Prayer SQL pagination; search limits; reaction aggregation |
| Security | WAF/edge limits on OpenAI routes |
| Test | Stage 4 + 1h soak at 250 VU |
| Pass | Gate C thresholds |
| Engineering | **Large** |

### Gate D — 1,000 concurrent users

| Category | Prerequisite |
|----------|--------------|
| Infrastructure | Realtime plan limits confirmed; CDN for public media |
| Code | Incremental sync everywhere; async AI moderation queue |
| Security | Full abuse suite; admin pagination |
| Test | Stage 5 stress + 2h soak at 500 VU |
| Pass | Gate D thresholds with margin |
| Engineering | **Large** |

---

## Out of scope for first harness

- Production traffic mirroring
- Chaos testing / region failover
- Mobile WebView-specific tests
- Email deliverability load tests

---

## Deliverables (current)

1. `load-tests/k6/` scripts — smoke, baseline, and corrected gate-a-100 **passed**
2. `load-tests/scripts/` — seed, cleanup, local server, smoke/baseline/gate-a orchestrators, session pool
3. GitHub Actions workflow — **not created** (local-only policy)

## Limitations

**Local Gate A tests HTBF code and Supabase staging only. It does not certify Vercel or production concurrency capacity.**

**HTBF Gate A passed at 10, 50, and 100 local virtual users against Supabase staging. This validates the current authenticated read paths, but it does not certify Vercel or production capacity.**
