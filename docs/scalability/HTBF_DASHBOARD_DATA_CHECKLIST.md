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
