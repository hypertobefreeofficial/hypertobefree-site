# HTBF Staging Load-Test Plan

**Status:** 10-user local smoke **passed** (2026-07-19). 50-user local baseline is the next checkpoint. Do not run against production.
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

## Accepted 10-user local smoke (2026-07-19)

Local Gate A smoke passed against htbf-staging with a production-style Next.js build on `http://127.0.0.1:3100`.

| Metric | Result |
|--------|--------|
| Virtual users | 10 |
| Duration | 5 minutes |
| Total HTTP requests | 604 |
| HTTP failure rate | 0.00% |
| Check pass rate | 100.00% |
| HTTP p50 | 81.8 ms |
| HTTP p95 | 107.2 ms |
| Feed p95 | 102 ms |
| Prayer p95 | 99 ms |
| Search p95 | 101.1 ms |
| Authentication failures | 0 |
| HTTP 4xx | 0 |
| HTTP 5xx | 0 |

**Scope:** This run tested HTBF application code and the htbf-staging Supabase branch only. It did **not** test Vercel Functions, CDN behavior, full media streaming, or production infrastructure.

**Next checkpoint:** 50-user local baseline (`node load-tests/scripts/run-baseline-50.mjs`) after starting the local server.

Result JSON remains local and gitignored under `load-tests/k6/results/`.

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
| **Test users** | 10 synthetic users for smoke (`loadtest_user_*@staging.htbf.test`); scale up for future gates |
| **Test content** | Synthetic stories tagged `creation_mode='loadtest'` |
| **OpenAI** | Not called during read-only smoke |
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

---

## k6 stages (ramp design)

| Stage | Name | VUs | Duration | Status |
|-------|------|-----|----------|--------|
| 0 | Smoke | 10 | 5 min | **Passed** — local read-only (`smoke-10.js`) |
| 1 | Baseline | 50 | 15 min | **Prepared** — `baseline-50.js` via `run-baseline-50.mjs` |
| 2 | Growth A | 100 | 20 min | **Inactive** — `gate-a-100.js` disabled until baseline passes |
| 3 | Growth B | 250 | 25 min | Future — requires hosted authorization |
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

1. Authenticate as `loadtest_user_{vu}`
2. GET feed data via Supabase REST (mirror client queries) or Playwright-less HTTP if exposed
3. Simulate signed URL requests (HEAD/GET to Storage URLs returned)
4. Sleep 3–8s (think time)
5. Load more with cursor (50% iterations)

### S2 — Prayer discovery

1. Authenticate
2. Fetch prayer bundle (300 limit query)
3. Client-side filter simulation (CPU on k6 — optional)
4. 10% open detail → fetch responses

### S3 — Reaction toggle

1. Pick random visible story ID from seed data
2. Insert `story_reactions` if absent; else delete
3. Measure Realtime side effects indirectly via feed reload VUs

### S4 — Video response submit

1. Upload small fixture MP4 to Storage (direct)
2. POST `/api/responses/public-video` with Bearer token
3. Assert 200 + row created

### S5 — Report

1. POST `/api/submit-content-report`
2. Assert rate limit after 20/hr/user

---

## Monitoring during test

Collect simultaneously:

- k6: `http_req_duration`, `http_req_failed`, custom Supabase metrics
- Local Next.js: server stdout errors during run
- Supabase htbf-staging: connections, CPU, IO, Realtime messages, slow queries
- OpenAI: should remain zero during read-only smoke
- Storage: operation count (metadata-only smoke; no video downloads)

**Not applicable to local Gate A:** Vercel function duration, invocations, CDN egress.

---

## Certification gates (roadmap)

### Gate A — 100 concurrent users (future; inactive locally)

| Category | Prerequisite |
|----------|--------------|
| Infrastructure | htbf-staging Supabase; local build for smoke; hosted cert requires Vercel authorization |
| Code | 10-user local smoke must pass first |
| Security | htbf-staging keys only; never production |
| Test | Stage 0 (10 VU local smoke) first; Stage 2 (100 VU) inactive until authorized |
| Pass | Local smoke thresholds; hosted thresholds TBD |
| Monitoring | Supabase htbf-staging dashboards |
| Rollback | Stop k6; cleanup marked data |
| Engineering | **Small** (harness + fixtures — done) |

### Gate B — 250 concurrent users

| Category | Prerequisite |
|----------|--------------|
| Infrastructure | Connection pooler sized; alert rules configured |
| Code | Feed signing optimization **or** measured headroom; Realtime incremental sync **or** filter |
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

1. `load-tests/k6/` scripts — smoke passed; baseline prepared; gate-a inactive
2. `load-tests/scripts/` — seed, cleanup, local server, smoke/baseline orchestrators
3. GitHub Actions workflow — **not created** (local-only policy)

## Limitations

**Local Gate A tests HTBF code and Supabase staging only. It does not certify Vercel or production concurrency capacity.**
