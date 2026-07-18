# HTBF Staging Load-Test Plan (Design Only)

**Status:** Not executed. Do not run against production.
**Tool:** k6 (design stage — no scripts created in this audit)

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
| **Staging Supabase project** | Separate from production; same schema/migrations applied |
| **Staging Vercel deployment** | Matching production build; staging env vars |
| **Test users** | Pre-seeded auth users (e.g. 1,200 accounts); never production users |
| **Test content** | Synthetic stories/prayers/responses with fixture media |
| **OpenAI** | Separate key with hard spend cap; mock endpoint optional for smoke |
| **Observability** | Dashboards open during test (see checklist doc) |
| **Load generator** | k6 runners outside Vercel (CI VM or dedicated load box) |

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

| Stage | Name | VUs | Duration | Purpose |
|-------|------|-----|----------|---------|
| 0 | Smoke | 10 | 5 min | Script validation, auth flow |
| 1 | Baseline | 50 | 15 min | Establish p95 baseline |
| 2 | Growth A | 100 | 20 min | Gate A candidate |
| 3 | Growth B | 250 | 25 min | Gate B candidate |
| 4 | Growth C | 500 | 30 min | Gate C candidate |
| 5 | Stress | 1,000 | 20 min | Gate D candidate |
| 6 | Soak | 250 | 60 min | Memory leak / connection drift |

**Ramp:** Linear ramp-up 2 min per stage entry; 5 min cool-down between major stages.

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

## Scenarios (k6 outline — not implemented)

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
- Vercel: function duration, invocations, errors
- Supabase: connections, CPU, IO, Realtime messages, slow queries
- OpenAI: request count and errors (staging key)
- Storage: operation count and egress

---

## Certification gates (roadmap)

### Gate A — 100 concurrent users

| Category | Prerequisite |
|----------|--------------|
| Infrastructure | Staging Supabase Pro+ with pooler; Vercel Pro; Realtime enabled |
| Code | None blocking for smoke; document baseline metrics |
| Security | Staging keys only; moderate-story auth fix recommended |
| Test | Stage 2 (100 VU) 20 min + 10 VU smoke |
| Pass | All Gate A thresholds |
| Monitoring | Manual dashboard watch |
| Rollback | Stop k6; no prod impact |
| Engineering | **Small** (harness + fixtures) |

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

## Next deliverable (after audit approval)

1. `loadtests/k6/` scripts per scenario above
2. Staging seed/cleanup Node scripts
3. GitHub Actions manual workflow (`workflow_dispatch`) targeting staging only
