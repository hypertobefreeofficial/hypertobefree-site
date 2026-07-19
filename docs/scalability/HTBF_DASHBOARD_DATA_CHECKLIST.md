# HTBF Dashboard Data Checklist

Use this checklist to gather runtime facts that **cannot** be determined from the repository alone.
Do **not** share secret keys or service-role tokens — plan names, limits, and anonymized metrics are sufficient.

---

## Vercel

| Item | Where to find | Why it matters |
|------|---------------|----------------|
| Plan tier (Hobby / Pro / Enterprise) | Team Settings → Billing | Concurrency and function limits |
| Fluid Compute enabled? | Project → Settings → Functions | Cold start / concurrency behavior |
| Function invocation count (7d) | Analytics → Functions | Baseline cost and hot routes |
| Function duration p50 / p95 / p99 | Analytics → Functions | Identify slow API routes |
| Function error rate | Analytics → Logs | Reliability baseline |
| Memory usage peaks | Logs / Runtime logs | Image/OpenAI routes |
| Edge requests (7d) | Analytics | Traffic volume |
| Data transfer (7d) | Usage | Egress cost |
| Image Optimization usage | Usage | If using `next/image` heavily |
| Highest-cost routes (top 5) | Analytics | Prioritize optimization |
| Max function duration setting | Project Settings | Video/AI routes near limit? |
| Regions deployed | Project Settings | Latency to Supabase region |

---

## Supabase

| Item | Where to find | Why it matters |
|------|---------------|----------------|
| Plan tier | Organization → Billing | Connection and compute caps |
| Compute size (Micro / Small / …) | Project Settings → Infrastructure | CPU headroom |
| Database region | Project Settings | Latency vs Vercel region |
| Pooler mode (Session / Transaction) | Database Settings → Pooler | Serverless compatibility |
| Pool size / max clients | Pooler settings | Connection exhaustion risk |
| Active connections (peak) | Reports → Database | vs max |
| Max connections | Plan docs + dashboard | Hard ceiling |
| CPU utilization (peak) | Reports | Query pressure |
| Memory utilization | Reports | Cache pressure |
| Disk IO | Reports | Growth / scan issues |
| Database size (GB) | Reports | Capacity planning |
| Table sizes (top 10) | SQL Editor → `read-only-diagnostics.sql` | Growth hotspots |
| Slow query log / Query Performance | Reports → Query Performance | Index gaps |
| Performance Advisor findings | Advisors | Missing indexes, RLS issues |
| Realtime connections (peak) | Realtime dashboard | vs plan limit |
| Realtime messages/sec (peak) | Realtime dashboard | Fan-out cost |
| Storage total bytes | Storage dashboard | Egress planning |
| Storage operations (Class A/B if shown) | Storage metrics | Signed URL volume |
| Auth MAU | Auth dashboard | vs 50k target |
| RLS policies on buckets | Storage → Policies | Not in repo migrations |

**Run in SQL Editor:** `supabase/scalability/read-only-diagnostics.sql`

---

## Cloudflare R2

| Item | Status in HTBF |
|------|----------------|
| Currently used? | **No** (per repo) |
| If enabled later: stored bytes, Class A/B ops, cache hit ratio | N/A today |

---

## OpenAI

| Item | Where to find | Why it matters |
|------|---------------|----------------|
| Organization daily spend (30d avg) | Usage dashboard | Cost projection |
| Hard spending limit configured? | Billing limits | Runaway protection |
| Rate limits (RPM/TPM) for moderation + chat | Limits page | Submit storm capacity |
| Error rate (429/5xx) | Usage logs | Headroom |
| Models enabled | Model access | gpt-4o-mini, gpt-image-2, omni-moderation |

---

## Optional: DNS / WAF (if Cloudflare fronting)

| Item | Why |
|------|-----|
| WAF rate rules on `/api/*` | Complement in-memory limits |
| Bot fight mode | Protect open moderation route |
| Cache rules for static/media | Reduce origin load |

---

## Data to paste back (template)

```
Vercel plan:
Fluid Compute:
Function p95 (top route):
Supabase plan / compute:
Pooler mode / pool size:
Peak DB connections / max:
Peak Realtime connections / plan limit:
DB size (GB):
Top 3 tables by size:
OpenAI daily spend (avg):
OpenAI spend limit set (Y/N):
Staging environment available (Y/N):
```

---

## Security reminder

- Share **metrics and plan names only**
- Never paste `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, or user passwords
- Use staging project IDs if distinguishing environments

---

## Gate A capture list (during staging k6 run)

Use this checklist **during** the first Gate A run on confirmed staging. Metrics are **not available from repository code** — collect from dashboards while k6 runs.

### Before the run

- [ ] Step 0 in `HTBF_GATE_A_STAGING_RUNBOOK.md` confirms Preview ≠ Production Supabase
- [ ] Staging seed users exist (`loadtest_user_*@staging.htbf.test`)
- [ ] Staging seed content tagged `creation_mode='loadtest'`
- [ ] `HTBF_LOAD_TEST_ENV=local-staging` set on load generator
- [ ] Local server healthy at `http://127.0.0.1:3100/feed` before k6
- [ ] Note start/end timestamps (UTC)

### Vercel (Preview deployment under test)

| Capture | Value |
|---------|-------|
| Preview deployment URL | |
| Function invocations (test window) | |
| Function p50 / p95 / p99 | |
| Function error rate | |
| Top 5 slowest routes | |
| Function memory peak | |
| External API duration (if shown) | |

### Supabase (staging project)

| Capture | Value |
|---------|-------|
| Compute tier | |
| Pooler mode | |
| Active connections (peak) | |
| Max connections | |
| CPU (peak / sustained) | |
| Memory | |
| Database size | |
| Slow queries (top 5) | |
| Realtime connections (peak) | |
| Realtime messages/sec (peak) | |
| Storage operations (if shown) | |

### OpenAI (staging key)

| Capture | Value |
|---------|-------|
| Requests during test window | |
| 429 errors | |
| Spend during test window | |

### Manual watch thresholds (external)

| Signal | Watch for |
|--------|-----------|
| DB connections | Below 75% of maximum |
| Supabase CPU | Preferably below 70% sustained |
| Lock queue | No growing lock queue |
| Vercel function 5xx | No repeated spikes |
| OpenAI spend | No uncontrolled spike |
| Realtime | No reconnect storm |
| Storage signing | No error spike |

### k6 result summary

| Metric | Result |
|--------|--------|
| Scenario | smoke / 50 / 100 |
| HTTP failure rate | |
| HTTP p50 / p95 / p99 | |
| Feed p95 / p99 | |
| Prayer p95 / p99 | |
| Search p95 / p99 | |
| Video Feed metadata p95 / p99 | |
| Auth request count | |
| HTTP 4xx / 5xx counts | |
| Unexpected auth failures | |
| Pass/fail vs thresholds | |

### Accepted local smoke reference (2026-07-19)

| Metric | Result |
|--------|--------|
| Scenario | smoke (10 VUs / 5 min) |
| HTTP failure rate | 0.00% |
| HTTP p50 / p95 | 81.8 ms / 107.2 ms |
| Feed / Prayer / Search p95 | 102 ms / 99 ms / 101.1 ms |
| Total requests | 604 |
| Auth failures | 0 |
| Pass/fail vs thresholds | Pass |

Local smoke tested HTBF code and Supabase staging only — not Vercel, CDN, full media streaming, or production.

**Note:** First Gate A run is **not** a complete media-capacity certification while Feed autoplay is broken. See `HTBF_PHASE1_BASELINE.md` §0.

---
