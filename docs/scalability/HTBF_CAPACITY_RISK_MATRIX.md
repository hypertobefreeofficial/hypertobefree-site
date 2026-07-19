# HTBF Capacity Risk Matrix

**Audit date:** 2026-07-18
**Method:** Static code analysis only — probabilities are engineering judgments, not measured failure rates.

> Capacity targets (500–1,000 concurrent users) are **not certified** by this matrix.

---

## Top 10 scalability risks (ranked)

| Rank | Component | Likely failure mode | P | Impact | Fix before |
|------|-----------|---------------------|---|--------|------------|
| 1 | Feed signed URL enrichment | Storage API latency/timeouts; page load p99 spikes | High | High | 250 CCU |
| 2 | Supabase Realtime (global table listeners) | Connection limit exhaustion; thundering herd refetches | High | High | 250 CCU |
| 3 | Prayer 300-row bulk load + signing | Browser memory/CPU; DB read amplification | High | High | 250 CCU |
| 4 | Search unbounded stories fetch | OOM / multi-second loads as catalog grows | High | High | 100 CCU |
| 5 | In-memory API rate limits | Abuse bypass across serverless instances | Med | High | 500 CCU |
| 6 | Unauthenticated `/api/moderate-story` | OpenAI cost abuse; function saturation | Med | High | 100 CCU |
| 7 | Video-feed/messages Realtime full reload | DB + sign storm on every global reaction | Med | Med | 250 CCU |
| 8 | Missing observability | Cannot detect degradation before user impact | High | Med | 100 CCU |
| 9 | DB index gaps on `stories` feed queries | Sequential scans as rows grow | Med | High | 500 CCU |
| 10 | Admin unbounded client loads | Moderator UI failure with queue growth | Med | Med | 500 CCU |

---

## Full risk matrix

| Component | Current implementation | Scaling behavior | Failure mode | P | Impact | Evidence | Remediation | Priority | 100 | 250 | 500 | 1000 |
|-----------|------------------------|------------------|--------------|---|--------|----------|-------------|----------|-----|-----|-----|------|
| Feed enrichment signing | Sequential `createSignedUrl` per item | O(items × media) | p95 load >8s; Storage rate limits | High | High | `enrichFeedItems.ts`, `loadParentApprovedVideoResponses.ts` | Batch signing; public CDN for approved media; reduce signs via longer TTL cache | P0 | ✓ | ✓ | ✓ | ✓ |
| Feed Realtime sync | 3 global tables, debounced head refetch | O(viewers × events) | CPU/network saturation on clients + DB | High | High | `FreedomFeed.tsx:614–652`, `processRealtimeFeedUpdates.ts` | Row-level filters; incremental patch; cap refresh window | P0 | | ✓ | ✓ | ✓ |
| Feed reaction query | Fetch all reaction rows for page IDs | O(reaction rows) | Large payloads; slow enrichment | Med | Med | `enrichFeedItems.ts:453–457` | SQL `COUNT` aggregation or materialized counts | P1 | | ✓ | ✓ | ✓ |
| Prayer discovery | `.limit(300)` + client filter/sign | Fixed 300 but signs ×300 | 900 Storage ops; double load on mount | High | High | `loadPrayerConnectRequests.ts:179` | SQL geo + cursor pagination; server-side filter | P0 | | ✓ | ✓ | ✓ |
| Search | No limit on approved stories | O(catalog) | Browser crash; 10s+ loads | High | High | `app/search/page.tsx:309–313` | Server pagination + full-text index | P0 | ✓ | ✓ | ✓ | ✓ |
| Rate limiting | In-memory Map per instance | Bypassed at scale | Spam uploads/reports | Med | High | `lib/server/prayerRateLimit.ts:1–4` | Redis/Upstash or edge WAF | P1 | | | ✓ | ✓ |
| Moderate-story API | No auth, no rate limit | Open proxy | AI cost spike | Med | High | `app/api/moderate-story/route.ts:56+` | Require auth + rate limit | P0 | ✓ | ✓ | ✓ | ✓ |
| Video-feed Realtime | Full `loadVideoStories` on event | O(events × 15 signs) | Janky UX; DB load | Med | Med | `app/video-feed/page.tsx:821–843` | Incremental updates | P1 | | ✓ | ✓ | ✓ |
| Messages Realtime | Full reload | O(messages) | Slow inbox | Med | Med | `app/messages/page.tsx:83–101` | Incremental patch | P2 | | | ✓ | ✓ |
| Journey watchlist | Global 100 stories + reactions | Stale/incomplete watchlist | Wrong UX; wasted reads | Low | Low | `app/journey/page.tsx` | User-scoped query | P2 | | | ✓ | ✓ |
| Admin moderation UI | Client loads all stories/reports | O(queue) | Admin unusable | Med | Med | `app/admin/page.tsx` | Paginated admin API | P2 | | | ✓ | ✓ |
| DB connection pool | Browser-direct + API server clients | Connections ∝ concurrent API + pooler load | `too many connections` | Med | High | Architecture | Supabase pooler sizing; reduce chatty patterns | P1 | | ✓ | ✓ | ✓ |
| Storage bucket RLS | Not in repo | Unknown | Unauthorized access or denied reads | Unknown | High | No migration DDL | Audit dashboard policies | P0 | ✓ | ✓ | ✓ | ✓ |
| Duration verification worker | Missing | Manual admin burden | Unverified videos published | Med | Med | `20260716_*`, `responsePublication.ts` | Background worker | P2 | | | ✓ | ✓ |
| Email / notifications | Missing Resend | No transactional email at scale | Auth/support gaps | Med | Med | `forgot-username/page.tsx` | Supabase Auth + Resend | P2 | | | ✓ | ✓ |
| Dependency pinning | `"latest"` in package.json | Non-reproducible deploys | Surprise breaking changes | Low | Med | `package.json` | Pin versions | P2 | ✓ | ✓ | ✓ | ✓ |
| Client-only auth gating | No middleware | Scraping/API abuse via anon key | Data exfil within RLS bounds | Med | Med | No `middleware.ts` | Server-side auth for sensitive reads | P2 | | ✓ | ✓ | ✓ |
| Duplicate video response submit | App check only | Race under concurrency | Duplicate rows | Low | Med | `submitPublicVideoResponse.ts` | DB unique partial index | P2 | | | ✓ | ✓ |
| OpenAI sync on submit | Blocks HTTP request | Latency tail | Timeouts on Vercel functions | Med | Med | `submitPublicVideoResponse.ts` | Async queue + webhook status | P1 | | ✓ | ✓ | ✓ |
| PWA SW cache | Static only | Minimal perf win | — | Low | Low | `public/sw.js` | Expand only after cache policy review | P3 | | | | |

**Legend — fix before concurrent users (CCU):** ✓ = address before attempting to certify that gate.

---

## Probability / impact scale

- **Probability:** High = likely under target load without changes; Med = plausible; Low = edge case
- **Impact:** High = widespread outage or major cost; Med = degraded UX; Low = localized

---

## Remediation sizing (engineering category)

| ID | Remediation | Size |
|----|-------------|------|
| R1 | Batch/public CDN path for feed media | Large |
| R2 | Realtime filters + incremental sync | Large |
| R3 | Prayer SQL geo pagination | Medium |
| R4 | Search pagination + index | Medium |
| R5 | Distributed rate limiting | Medium |
| R6 | Lock down moderate-story API | Small |
| R7 | Reaction count aggregation | Medium |
| R8 | Observability stack (Sentry + dashboards) | Medium |
| R9 | Composite indexes on stories (verify first) | Small–Medium |
| R10 | Admin paginated APIs | Medium |

---

## Evidence index

| File | Risk |
|------|------|
| `lib/community-feed/enrichFeedItems.ts` | Feed signing, reactions |
| `components/FreedomFeed.tsx` | Realtime |
| `lib/prayer-connect/loadPrayerConnectRequests.ts` | Prayer bulk |
| `app/search/page.tsx` | Unbounded search |
| `lib/server/prayerRateLimit.ts` | Rate limits |
| `app/api/moderate-story/route.ts` | OpenAI abuse |
| `app/video-feed/page.tsx` | Realtime reload |
| `app/admin/page.tsx` | Admin scale |
| `supabase/migrations/20260712_*` | Geo index only on prayer subset |
