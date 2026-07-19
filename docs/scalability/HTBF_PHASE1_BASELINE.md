# HTBF Scalability Phase 1 Baseline

Phase 1 improves **readiness and safeguards** for staging capacity testing. It does **not** certify concurrent capacity. Load testing (Gate A) is still required before any production capacity claims.

Diagnostics switch: `NEXT_PUBLIC_HTBF_LOAD_DIAGNOSTICS=1` or `localStorage.setItem('htbf-load-diagnostics','1')`.

---

## 0. Manual Preview regressions (Gate A blockers)

Recorded during manual Preview testing after Phase 1. **Not fixed in Phase 1.**

| Regression | Classification | Impact |
|------------|----------------|--------|
| **Feed video autoplay** — videos no longer automatically play when scrolled into view | **Must restore before Gate A capacity certification** | Autoplay changes real media/network workload. A load test with autoplay disabled would understate production media demand. |
| **God Did It action not working** | **Must fix before merge to main** | Functional regression. Does not block building the load-test harness, but blocks final production merge approval. |

Gate A k6 harness (prepared, not executed) targets a **local production build** on `http://127.0.0.1:3100` connected to the **htbf-staging** Supabase branch only. Vercel Preview is for manual functional testing; automated k6 traffic does not target Vercel. Local Gate A does not certify Vercel or production concurrency capacity. The harness intentionally excludes video file downloads until autoplay is restored.

---

## 1. `/api/moderate-story` security

| Aspect | Before | After |
|--------|--------|-------|
| Authentication | None | Supabase Bearer session required |
| Identity source | N/A | Verified `getUser()` — no client user ID |
| Rate limit | None | 30/hr/user + 60/hr/IP (in-memory; per-instance only) |
| Payload validation | Minimal | Size cap + required fields |
| Idempotency | None | 5-minute dedupe cache per user+payload hash |
| OpenAI timeout | None | 12s with safe fallback to admin review |
| Error exposure | Raw provider errors possible | Generic client messages; structured server logs |
| Client callers | Unauthenticated fetch | Bearer via `buildModerationAuthHeaders()` |

### Provider failure safety

| Failure | Server response | Client behavior |
|---------|-----------------|-----------------|
| OpenAI timeout / network error | HTTP 502, `provider_failed` | `submitted` / admin review (never `approved`) |
| OpenAI non-OK HTTP | HTTP 502, `provider_failed` | Same |
| Unexpected OpenAI payload | HTTP 502, `provider_failed` | Same |
| Missing OpenAI key | HTTP 503, `provider_unconfigured` | Same |
| Auth failure | HTTP 401 | Publish blocked |
| Rate limit | HTTP 429 | Publish blocked until retry |

**Provider failures never return HTTP 200 with `statusToUse: approved`.**

### Distributed safeguards still required before higher-capacity certification

| Safeguard | Phase 1 status | Required before certification |
|-----------|----------------|------------------------------|
| Rate limiting | In-memory per Vercel instance | Shared store (Redis/KV or edge rate limiter) |
| Idempotency | In-memory 5-minute cache per instance | Durable dedupe (DB or shared cache) |
| Multi-instance duplicate OpenAI calls | Reduced by request-level idempotency on single instance | Requires distributed idempotency |

Documented in `lib/server/prayerRateLimit.ts` and `lib/server/moderateStoryHandler.ts`.

---

## 2. Query bounds and record reachability

All paginated surfaces use **keyset (cursor) pagination** with `ORDER BY created_at DESC, id DESC` and filter `created_at.lt.X OR (created_at.eq.X AND id.lt.Y)`.

| Surface | Page size | Hard ceiling | Reachability |
|---------|-----------|--------------|--------------|
| Search | 120/page | **None** — Load more continues until DB exhausted | Text/filter search runs client-side on loaded corpus; older matches require Load more |
| Admin stories | 100/page | **None** — Load more continues until DB exhausted | All stories reachable via pagination |
| Admin reports | 100/page | **None** — Load more continues until DB exhausted | All reports reachable via pagination |
| Prayer discovery | 80/page | **300 rows in browser memory** | Older prayers beyond 300 require refresh (new head window) or narrower filters; not all historical rows stay in memory |

**Corrections from pre-commit review:** Earlier draft language implying all records remain reachable via Load more was inaccurate for Prayer (300 memory cap) and temporarily wrong for Search/Admin (removed erroneous max-page caps).

---

## 3. Prayer request / signing estimates

| Metric | Before (audit) | After Phase 1 (code-derived) |
|--------|----------------|------------------------------|
| Initial DB story rows | 300 | 80 |
| Initial load DB round-trips | ~16–24 × **2** (double load) | ~8–12 × **1** (single bootstrap) |
| Signing ops (initial) | up to **900** (3 × 300) | up to **~180–240** (deduped; worst case 3 × 80) |
| Typical signing (shared paths) | 300–900 | **~60–120** (session dedupe) |
| Hide/publish reload | Full 300-row refetch | 80-row head refetch |
| Server pagination | None | Cursor `created_at\|id`, 80/page |

**Remaining unknowns:** Geo-filtered discovery still client-filters the loaded page; map markers use same page data. Separate lightweight marker query not yet split.

---

## 4. Feed signing estimates (40-item page)

| Metric | Before (audit) | After Phase 1 (code-derived) |
|--------|----------------|------------------------------|
| Enrichment pattern | Sequential per-card signing | Parallel enrichment + `StorageSignSession` |
| Duplicate path signs | Same path signed per card | **Once per bucket+path per load** |
| Worst-case sign ops | 120–200+ | **~80–140** (deduped) |
| Typical sign ops | 80–150 | **~40–90** |
| Page size | 40 | **40 unchanged** |

---

## 5. Realtime scoping

| Surface | Before | After |
|---------|--------|-------|
| Community Feed reactions | Full multi-page head reload | Targeted `patchFeedReactionCountsForStories` when reaction-only |
| Video feed reactions | Full `loadVideoStories` on every event | Patch visible story counts; debounced full reload fallback (450ms) |
| Video feed stories/replies | Immediate full reload | Debounced full reload |
| Subscription cleanup | Present | Preserved + timer cleanup on unmount |

**Supabase limitation:** `postgres_changes` on `story_reactions` cannot filter by `story_id` in all deployments; client-side narrowing applies after event receipt.

---

## 6. Proposed indexes (prepared, not applied)

File: `supabase/migrations/20260724_scalability_indexes.sql`
Verification: `supabase/scalability/verify-scalability-indexes.sql`

| Index | Supports | Duplicate check |
|-------|----------|-----------------|
| `stories_feed_approved_created_idx` | Feed approved stories sort | None found |
| `stories_prayer_approved_created_idx` | Prayer list head + pagination | Geo index differs (lat/lng) |
| `prayer_video_responses_story_approved_idx` | Response rails with sort | Complements `prayer_video_responses_public_idx` |
| `story_reactions_story_id_idx` | Reaction count patches | Partial unique indexes exist but are type-scoped |
| `blocked_users_*_idx` | Bidirectional block lookups | None found in migrations |
| `stories_admin_pending_created_idx` | Admin pending queue | None found |
| `content_reports_admin_created_idx` | Admin report pagination | None found |
| `content_reports_open_created_idx` | Open/reviewing queue | Predicate matches app statuses |
| `prayer_follows_user_id_idx` | **Skipped** — PK `(user_id, story_id)` already covers | Duplicate of PK leading column |

**Rollout locking:** Standard `CREATE INDEX` takes a share lock and can block writes on large tables. For production, prefer `CREATE INDEX CONCURRENTLY` outside a transaction during a maintenance window. Monitor `pg_stat_progress_create_index`.

---

## 7. Instrumentation

| Loader | Trace prefix | Counters |
|--------|--------------|----------|
| Feed enrichment | `feed` / `enrich` | records, sign ops |
| Prayer load | `prayer` / `media-resolution` | records, sign ops |
| Search | `search` / `initial`, `page` | records fetched |
| Admin | `admin` / `stories-*`, `reports-*` | dbQueries, records |

**Privacy:** Logs contain only trace IDs, loader names, durations, and aggregate counts. No tokens, story text, signed URLs, or emails.

**Production behavior:** Disabled unless `NEXT_PUBLIC_HTBF_LOAD_DIAGNOSTICS=1`. The `localStorage` override also works in production builds but exposes only the same aggregate timing/count fields — it cannot enable private-content debug logging because call sites never pass that data.

---

## 8. Gate A readiness

| Requirement | Status |
|-------------|--------|
| Secure moderate-story | Done |
| Bounded per-request fetches | Done |
| Signing storm reduction | Done (Feed + Prayer session dedupe) |
| Realtime over-fetch reduction | Partial (Feed + video-feed reactions) |
| Index migration prepared | Done (not applied) |
| Load diagnostics | Done (env/localStorage gated) |
| Distributed rate limit + idempotency | **Required before certification** |
| Staging dashboard metrics | **Still required** |
| EXPLAIN ANALYZE on hot queries | **Still required** |
| k6 / Gate A load tests | **Harness built; 10-user local smoke not run** |
| Local Gate A architecture | k6 → `127.0.0.1:3100` → htbf-staging |
| Vercel-hosted k6 | **Disabled** (Hobby plan / policy) |

**Verdict:** HTBF is **ready to run** the 10-user local smoke against htbf-staging, but **not ready to certify** hosted or 500–1k concurrent users.

---

## 9. Remaining blockers before Gate A

1. Apply and validate index migration on staging with `EXPLAIN ANALYZE`.
2. Wire dashboard metrics (p95 loader duration, DB connections, storage sign rate, OpenAI spend).
3. Run local Gate A 10-user smoke (`node load-tests/scripts/run-smoke-10.mjs`) per `HTBF_LOAD_TEST_PLAN.md`. Baseline-50 and gate-a-100 remain inactive until smoke passes.
4. Replace in-memory moderate-story rate limit and idempotency with distributed stores if multi-instance staging proves bypass.
5. Optional: split Prayer map-marker query from full card enrichment.
6. Optional: dedupe video-feed storage signing with `StorageSignSession`.

See `supabase/scalability/read-only-diagnostics.sql` for starter queries.
