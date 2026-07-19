# HTBF Scalability Discovery Audit

**Date:** 2026-07-18
**Scope:** Static repository analysis only. No load tests, no production access, no migrations applied.
**Target aspiration (unverified):** 50k registered users · 5k–10k DAU · 500–1k concurrent active users

> **Static code analysis cannot certify an exact concurrent-user capacity. Capacity must be proven by controlled load testing against staging with live observability.**

---

## Executive summary

HTBF is a **Next.js 16 App Router SPA-on-Next** application: pages are mostly client components that read/write Supabase directly from the browser with RLS, supplemented by **9 Vercel Route Handlers** for AI moderation, video-response finalization, and reporting. There is **no Redis, no job queue, no CDN cache layer for API/DB results, and no distributed rate limiting**. Realtime subscriptions listen to **entire tables** without row filters and often trigger **partial or full data reloads**.

**Capacity confidence today:** **Low–Medium for early growth; unproven for 500–1,000 concurrent users.** The architecture can likely support modest traffic, but several paths scale **linearly or worse** with catalog size and concurrent viewers. Nothing in this repo proves the 500–1,000 concurrent target.

---

## Phase 1 — Architecture inventory

| Component | Status | Evidence |
|-----------|--------|----------|
| **Next.js 16.2.9** App Router | Production-ready (framework) | `package-lock.json`, `app/**/page.tsx` |
| **Rendering model** | Client-heavy CSR | 22/36 pages use `"use client"`; feed/prayer/search load data in browser |
| **Server Components / RSC data loaders** | Minimal | `app/feed/page.tsx` is thin shell → `FreedomFeed`; no `"use server"` |
| **Middleware / edge auth** | Missing | No `middleware.ts`; login redirects client-side |
| **Vercel Functions** | 9 API routes | `app/api/**/route.ts` |
| **Supabase Auth** | Browser session + Bearer on API | `lib/supabaseClient.ts`, `lib/server/publicVideoResponseRequest.ts` |
| **Supabase DB (browser)** | Primary data path | `@supabase/supabase-js` anon key + RLS |
| **Supabase DB (server)** | Per-request clients | Route handlers; service role for admin/report paths |
| **Supabase Realtime** | 4 channels, 6 tables | See Phase 6 |
| **Supabase Storage** | 4 buckets, client-direct upload | `story-videos`, `story-images`, `story-thumbnails`, `profile-avatars` |
| **Cloudflare R2** | Missing | Documented as future only (`lib/prayer-connect/responsePublication.ts`) |
| **OpenAI** | 4 endpoints | Moderation + Creator Studio + shape-story |
| **Resend / email** | Missing in repo | `app/forgot-username/page.tsx` placeholder |
| **Cron / queues / workers** | Missing | No `vercel.json` cron, no Inngest/Bull; duration probe worker not implemented |
| **Caching** | Client reuse only | Signed URL cache via `existingItemsByKey`; no `unstable_cache`/Redis |
| **Rate limiting** | In-memory on 4 API routes | `lib/server/prayerRateLimit.ts` |
| **Monitoring** | Console logging only | No Sentry/Datadog/OTel |
| **Upload finalization** | Mixed | Stories: client insert; video responses: API after storage upload |
| **Thumbnail / video processing** | Client-side capture + server metadata validation | No transcoding; duration verification status defaults to `unavailable` |
| **PWA service worker** | Static assets only | `public/sw.js` |

**Unknown (requires dashboard):** Supabase plan/compute/pooler, Realtime connection limits, Storage bucket RLS policies, Vercel plan/concurrency, OpenAI billing caps.

---

## Phase 2 — Route and workload map

| Route / workflow | Server | Client DB | Storage/sign | External API | Realtime | Notable pattern |
|------------------|--------|-----------|--------------|--------------|----------|-----------------|
| `/feed` | Shell only | Heavy | Heavy signed URLs | — | 3 tables | Cursor pagination; enrichment signing storm |
| `/videos` → `/video-feed` | Shell | Medium | ~15 signs/page | — | 3 tables | **Full reload on any Realtime event** |
| `/prayer` | Shell | Heavy | Up to ~900 signs | — | — | **300-row bulk fetch**; client geo filter |
| `/journey` | Shell | Medium | Per-upload signs | — | 2 tables | Global 100 stories for watchlist |
| `/journey/inbox` | Shell | Medium | Upload on reply | — | — | Private video 30s max |
| `/search` | Shell | **Unbounded** | Public URLs | — | — | **No `.limit()` on approved stories** |
| `/profile`, `/profile/[section]` | Shell | Light–Medium | Avatar/signs | — | — | Section loads on mount |
| `/admin`, `/admin/video-review` | Shell | **Unbounded reads** | Batch signs | Moderation API | — | Full-table client loads |
| `/share-your-story` | — | Insert + upload | 2–4 uploads | `/api/moderate-story`, `/api/shape-story` | — | Unauthenticated moderation route |
| Public video responses | API finalize | Upload first | Video+thumb | OpenAI sync in submit | Feed Realtime | `lib/server/submitPublicVideoResponse.ts` |
| Report / Block | 1 API (report) | Direct upsert (block) | — | — | — | Report rate-limited; block is not |
| Private messages | — | Full reload | — | — | 1 table | Unbounded reply fetch |
| AI moderation | 4 routes | — | — | OpenAI | — | `/api/moderate-story` has **no auth** |

### Per-action request estimates (from code paths)

| User action | Approx. DB round trips | Approx. storage/sign ops | Full page reload? |
|-------------|------------------------|--------------------------|-------------------|
| Open `/feed` (signed in) | 15–25 | 40–200+ | Initial load |
| Feed “Load more” | 5–15 | 40–120 | No |
| Feed Realtime burst (1 page loaded) | 5–15 | 40–120 | Head window refresh |
| Feed reaction | 1 | 0 (+ debounced Realtime refresh) | No |
| Open `/prayer` (signed in) | 16–24 × **2** (double load) | up to ~900 | Yes on hide/publish |
| Prayer tab switch | 0 | 0 | No |
| Open prayer detail | +4–6 | 2× per video response | No |
| Open `/video-feed` | ~5 | ~15 | On every Realtime event |
| Open `/search` | 1 (unbounded rows) | 0 (public URLs) | N/A |
| Publish story | 1–2 | 2–4 uploads | — |
| Submit video response | 1 API (+ server DB/AI) | 2 uploads | — |
| Submit report | 1 API | — | No |

**N+1 / linear-cost hotspots (cited):**

1. **Sequential signed URLs in feed enrichment** — `lib/community-feed/enrichFeedItems.ts` loops items; signing inside `enrichStoryItem` / `loadParentApprovedVideoResponses.ts`
2. **Reaction rows fetched entirely, counted client-side** — `enrichFeedItems.ts:453–457`
3. **Prayer media signing per request** — `lib/prayer-connect/media.ts:attachResolvedMediaToRequests`
4. **Per-open prayer detail response load** — `lib/prayer-connect/communityResponses.ts`
5. **Realtime head refresh scales with scroll depth** — `lib/community-feed/processRealtimeFeedUpdates.ts` × `pagesLoaded`
6. **Prayer double initial load** — `PrayerConnectExperience.tsx` `refresh` depends on `userId`
7. **Search loads entire approved catalog** — `app/search/page.tsx:309–313` (no limit)

---

## Phase 3 — Feed query analysis

**Entry:** `app/feed/page.tsx` → `components/FreedomFeed.tsx`

| Stage | File | Detail |
|-------|------|--------|
| Page size | `aggregateFeedItems.ts:COMMUNITY_FEED_PAGE_LIMIT_DEFAULT` | **40** merged items |
| Source fetch | `aggregateFeedItems.ts` | ≥50 stories + ≤30 responses per batch; up to **20** merge iterations |
| Pagination | Cursor keyset | `decodeFeedCursor`, `loadCommunityFeedPage` |
| Enrichment | `enrichFeedItems.ts` | Batch: parent stories, profiles, approved/pending responses, all reaction rows for page |
| Block/save state | `FreedomFeed.tsx:loadAccountSafety` | Parallel safety queries on init |
| Media | `enrichFeedItems.ts`, `loadParentApprovedVideoResponses.ts` | `createSignedUrl` TTL 3600s; sequential per item |
| Realtime | `FreedomFeed.tsx:614–652` | Debounced ~400ms; `processRealtimeFeedUpdates.ts` refetches head window |
| Mutations | `FreedomFeed.tsx` | Mostly optimistic; no full feed reload except Realtime sync |

**Estimated per initial Feed page (signed in, cold):**

- **DB:** 15–25 round trips (auth, safety, aggregate loop, enrichment batches, schema probes cached after first)
- **Storage signing:** 40–200+ calls (depends on media density; worst case ~3/story + 2/response × approved responses on page)
- **External:** 0
- **Per displayed card marginal cost:** Signing dominates; reaction query grows with reaction row count for page story IDs (not O(cards) DB queries, but O(reaction rows))

**Linear / unbounded risks:**

- Signed URL count ∝ feed items with media + approved responses per story
- Realtime refresh window = `40 × pagesLoaded` items
- `story_reactions` SELECT returns all rows for story ID set (can be large)

---

## Phase 4 — Prayer query analysis

**Entry:** `app/prayer/page.tsx` → `PrayerConnectExperience.tsx` → `loadPrayerConnectRequests.ts`

| Aspect | Finding | Evidence |
|--------|---------|----------|
| Discovery fetch | `.limit(300)` approved stories | `loadPrayerConnectRequests.ts:179,199` |
| Geo/radius filter | **Client-side** after bulk fetch | `filterAndSortPrayerRequests` in `lib/prayer-connect/utils.ts` |
| Geo index exists | Partial index on `(public_lat, public_lng)` for prayer rows | `20260712_prayer_production_readiness_hardened.sql` |
| Map markers | Props from filtered in-memory list; **no extra DB** | `PrayerConnectMap.tsx` |
| Tab changes | **0 network** (except `my-requests` panel) | `tabRequests` useMemo |
| Search debounce | 250ms content filter (client) | `PrayerConnectExperience.tsx` |
| Saved search persist | 350ms debounced upsert | `searchPreferences.ts` |
| Per-card detail | 4–6 queries + signing on open | `communityResponses.ts` |
| Hide/publish | **Full 300-row reload** | `handleHidePrayer`, `onPublished` |
| Signed-in double load | `refresh` re-runs when `userId` resolves | `PrayerConnectExperience.tsx` |

**Estimated per Prayer page (signed in):**

- **DB:** ~8–12 queries × **2** on mount ≈ 16–24
- **Storage signing:** up to **3 × 300 = 900** parallel sign calls
- **External:** 0 (Nominatim only on place search)

---

## Phase 5 — Database and RLS (repository view)

Repo contains **13 additive migrations**; base DDL for core tables is **not in-repo**.

### Migration-defined indexes (high-traffic)

| Table | Index | File |
|-------|-------|------|
| `stories` | `stories_prayer_public_geo_idx` (partial, geo prayer) | `20260712_*_hardened.sql` |
| `story_reactions` | Partial unique indexes per reaction type sets | `20260712_*`, `20260721_*` |
| `prayer_video_responses` | `prayer_video_responses_public_idx`, duration, thumbnail, context | `20260714–20260720` |
| `content_reports` | `idx_content_reports_prayer_video_response_id` | `20260723_*` |
| `prayer_follows`, `prayer_written_responses`, `prayer_hidden_stories` | PK + supporting indexes | `20260712_*`, `20260715_*` |

### Gaps (likely need verification in Supabase)

- No migration index on `stories(status, removed_at, created_at DESC)` — dominant feed filter
- `blocked_users`, `saved_content`, `profiles`, `story_video_replies`, `inbox_messages` — **no migration coverage**
- `story_reactions_select_public USING (true)` — full table readable
- Video response duplicate prevention is **app-level**, not DB unique constraint

See `supabase/scalability/read-only-diagnostics.sql` for manual inspection queries.

---

## Phase 6 — Realtime analysis

| Channel | File | Tables | Filter | Cleanup |
|---------|------|--------|--------|---------|
| `freedom-feed-live-updates` | `FreedomFeed.tsx:614–652` | `story_reactions`, `stories`, `prayer_video_responses` | **None (global `*`)** | `removeChannel` on unmount |
| `journey-page-updates` | `app/journey/page.tsx:159–194` | `inbox_messages`, `stories` | None | On unmount |
| `video-feed-live-updates` | `app/video-feed/page.tsx:821–843` | `story_reactions`, `story_video_replies`, `stories` | None | On unmount |
| `messages-live-updates` | `app/messages/page.tsx:83–101` | `story_video_replies` | None | On unmount |

**Subscriptions per signed-in user (typical single tab):**

| Page open | Channels | Table listeners |
|-----------|----------|-----------------|
| `/feed` | 1 | 3 |
| `/video-feed` | 1 | 3 |
| `/journey` | 1 | 2 |
| `/messages` | 1 | 1 |

**Estimated Realtime connection demand (code-derived, not capacity-proven):**

| Concurrent users | Assumption: all on `/feed` | Connections | Global event fan-out |
|------------------|----------------------------|-------------|----------------------|
| 100 | 1 tab each | ~100 | Every reaction/story/response change → up to 100 debounced reloads |
| 250 | same | ~250 | High |
| 500 | same | ~500 | Very high |
| 1,000 | same | ~1,000 | Extreme; plan limits unknown |

**Risk:** Broad table subscriptions without `filter` mean **global write activity** drives client refetch work for all connected feed viewers.

---

## Phase 7 — Media and storage analysis

| Limit | Value | Source |
|-------|-------|--------|
| Public video response | 30s, 100 MB | `lib/responses/validateResponseVideo.ts` |
| Prayer request video | 120s, 100 MB | `PrayerPostComposer.tsx` |
| Journey inbox reply | 30s | `lib/journey/inbox/constants.ts` |
| Upload path | **Browser → Supabase Storage** | `lib/prayer-connect/media.ts` |
| Video bytes through Vercel | **OpenAI image route only** (base64); videos do not stream through Vercel on upload | `generate-creator-studio-image/route.ts` |
| Signed URL TTL | 3600s typical | `enrichFeedItems.ts` |
| Transcoding / compression | **Missing** | — |
| Duration verification worker | **Missing** | `20260716_*_duration_verification.sql` comment |
| Autoplay preload | Feed/video components load signed URLs; browser fetches media from Storage/CDN | Client-side |

**Per-operation media ops (approximate):**

| Operation | Storage writes | Sign/read ops |
|-----------|----------------|---------------|
| Feed video view | 0 | 1–3 signed URLs per card |
| Story video upload | 1–2 (video + thumb) | 0 on upload; signs on read |
| Public video response | 2 (video + thumb) | 2+ on display |
| Prayer page load (300 cards) | 0 | up to 900 signs |

---

## Phase 8 — AI and external services

| Endpoint | Trigger | Sync? | Model | Auth | Rate limit |
|----------|---------|-------|-------|------|------------|
| `/api/moderate-story` | Story/prayer publish | Yes | `omni-moderation-latest` | **None** | **None** |
| `moderatePublicContent` | Video response submit | Yes | same | Server env | None |
| `/api/shape-story` | Creator Studio | Yes | `gpt-4o-mini` | Bearer | None |
| `/api/creator-studio-rewrite-layer` | Layer rewrite | Yes | `gpt-4o-mini` | Bearer | None |
| `/api/generate-creator-studio-image` | Image gen | Yes | `gpt-image-2` | Bearer | None |

**Illustrative daily OpenAI call estimates (assumptions stated, not billing):**

Assume: 10% of DAU publish or trigger moderation once; video response submit includes 1 moderation call.

| DAU | Moderation calls/day (approx.) | Creator Studio calls (if 2% use) |
|-----|-------------------------------|----------------------------------|
| 100 | ~10 | ~2 |
| 1,000 | ~100 | ~20 |
| 10,000 | ~1,000 | ~200 |

**Risks:** Unauthenticated `/api/moderate-story` enables cost abuse; duplicate submits can duplicate charges; failures on video submit block user request synchronously.

---

## Phase 9 — Rate limiting and abuse capacity

| Surface | Implementation | Classification |
|---------|------------------|----------------|
| Video response submit | `checkPrayerRateLimit` 10/hr/user | In-memory / serverless-local |
| Video response remove | 30/hr/user | In-memory |
| Content report | 20/hr/user | In-memory |
| Admin moderate API | 60/hr/user | In-memory |
| `/api/moderate-story` | None | **Missing** |
| `/api/shape-story`, image gen, rewrite | None | **Missing** |
| Feed reads, reactions, saves, blocks | None (client → Supabase) | **Missing** |
| Auth/signup/reset | Supabase Auth defaults | Unknown-needs-dashboard |
| Report duplicate window | 24h DB check | DB-enforced logic |

**Multi-instance bypass:** All `prayerRateLimit` buckets reset per serverless instance and cold start.

---

## Phase 10 — Caching and background work

### Should move async (future)

- AI moderation (especially video metadata path)
- Video duration probing / ffprobe worker
- Thumbnail regeneration retries
- Email / notification delivery
- Media cleanup / orphaned upload GC
- Counter reconciliation (reactions, response counts)
- Report evidence snapshots at scale

### Safe caching candidates (future)

- Public approved story metadata (non-personalized)
- Public thumbnails where bucket policy allows
- Profile display names/avatars (short TTL)
- Prayer category/location summaries
- Approved response counts (materialized)

### Never public-cache

- RLS-personalized feed/prayer results
- Private messages / inbox
- Pending moderation / admin queues
- Session/auth tokens
- Block/save/hidden state

---

## Phase 11 — Observability requirements

See `HTBF_DASHBOARD_DATA_CHECKLIST.md`.

---

## Phase 12 — Capacity risk matrix

See `HTBF_CAPACITY_RISK_MATRIX.md` for full matrix and top-10 ranking.

---

## Phase 13 — Load-test plan

See `HTBF_LOAD_TEST_PLAN.md`.

---

## Phase 14 — Scalability certification roadmap

See `HTBF_LOAD_TEST_PLAN.md` § Certification gates.

---

## Validation performed

- Repository static analysis (this document)
- `npm run test:unit` (see Final Report)
- `npm run build` (see Final Report)
- Secret scan of new docs (no keys embedded)
- `git diff --check` on new files only

## Facts still required before stating verified capacity

1. Supabase plan: compute tier, max connections, pooler mode/size, Realtime limits
2. Vercel plan: function concurrency, duration limits, Fluid Compute
3. Live table row counts and index usage (`read-only-diagnostics.sql`)
4. p95/p99 latency under staged load for `/feed`, `/prayer`, video response submit
5. Storage egress and signed-URL operation rates at target concurrency
6. OpenAI org rate limits and spend caps
7. Whether `/api/moderate-story` is exposed publicly in production WAF rules
