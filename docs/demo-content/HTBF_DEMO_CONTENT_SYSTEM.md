# HTBF Demo Content System — Architecture (Phase 0 / 1A)

**Status:** Design and reviewable schema draft only. **Not applied.**

**Branch:** `feat/demo-content-system`

**Target environment for first implementation:** htbf-staging only

---

## Purpose

The HTBF Demo Content System serves **two distinct purposes** that must never be conflated:

| Layer | Purpose | Environment |
|-------|---------|-------------|
| **Staging synthetic test data** | Validate layouts, pagination, response flows, moderation, search, realtime, and high-density states | htbf-staging only (automated seed) |
| **Future production demo library** | Curated onboarding samples showing how Prayer, Feed, public video responses, encouragement, and God Did It work | Production — **explicit owner approval required** |
| **Real member content** | Authentic community submissions | Production and staging member accounts |

**Real member content must never be copied, paraphrased, or transformed into the demo library.**

Demo scenarios are based only on **generalized feature and interaction patterns**, using plainly fictional composite text and visible **Sample** or **Demo** labeling.

---

## Separation from Gate A load testing

| Mechanism | Tag | Lifecycle |
|-----------|-----|-----------|
| Gate A load tests | `creation_mode = 'loadtest'` | k6 harness; `load-tests/scripts/seed-gate-a-staging.mjs` |
| Demo content | `is_demo = true` + `demo_seed_run_id` | Demo seed/cleanup scripts; never merged |

`creation_mode='loadtest'` records **must not** be treated as demo content and **must not** receive demo badges or guided-tour inclusion.

---

## Current state (audit summary)

### Existing schema support

- **`stories.creation_mode`** — values: `guided`, `creator-studio`, `loadtest`. Tag only; no UI label; not used for feed exclusion.
- **God Did It** — `prayer_status`, `answered_at`, `answered_text`; RPC `mark_my_prayer_answered`.
- **Public video responses** — `prayer_video_responses` with `response_context`, moderation fields, soft removal.
- **Reactions** — `story_reactions` (`praying`, `encouraged`, `amen`, `praise_god`).
- **Moderation** — `content_reports`, admin review flows.

### Missing demo infrastructure

No columns today: `is_demo`, `demo_seed_run_id`, `demo_scenario_id`, `content_origin`, `demo_display_label`, `is_ai_generated`, central seed registry.

### Inadequate existing patterns

| Pattern | Problem |
|---------|---------|
| Prayer mock mode (`mockPrayerData.ts`) | Client-only; uses realistic personal names — **not acceptable for persisted demo** |
| Feed visual fixtures (`?fixture=1`) | Dev-only; no DB |
| Gate A `loadtest` seed | Density testing; no scenario structure or ethics labeling |

### Key code paths (loaders requiring exclusion changes)

- Feed: `lib/community-feed/aggregateFeedItems.ts`, `enrichFeedItems.ts`, `eligibility.ts`
- Prayer: `lib/prayer-connect/loadPrayerConnectRequests.ts`, `responseCounts.ts`
- Search: `lib/search/loadSearchStories.ts`
- Realtime: `lib/community-feed/processRealtimeFeedUpdates.ts`, `patchFeedReactionCounts.ts`
- Moderation: `app/admin/page.tsx`, `app/api/submit-content-report/route.ts`

Default public eligibility today: `status = 'approved'` AND `removed_at IS NULL` — **no demo filter**.

---

## Central demo-seed registry

### Table: `demo_seed_runs`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | Referenced by all demo rows |
| `seed_version` | `text` UNIQUE NOT NULL | Human-readable version slug, e.g. `2026-07-staging-v1` |
| `environment` | `text` NOT NULL | CHECK: `staging` for automated scripts |
| `status` | `text` NOT NULL | `pending`, `running`, `completed`, `failed`, `cleaned` |
| `description` | `text` | Operator notes |
| `created_at` | `timestamptz` NOT NULL | |
| `completed_at` | `timestamptz` | |
| `created_by` | `text` | Operator identifier (not PII) |
| `record_counts` | `jsonb` | Post-seed audit snapshot |
| `storage_prefix` | `text` NOT NULL | e.g. `demo/{run_id}/` |

### Registry rules

1. **Automated seed scripts** may insert runs only with `environment = 'staging'`.
2. **Production seed operations are denied by default** — require separate manual RPC with multi-step confirmation (future Phase 7).
3. **`seed_version` must be unique** — reruns update the same run row or abort if completed run exists (idempotency policy documented in seed design).
4. **Cleanup targets a specific `demo_seed_runs.id`** — never a bare text version alone.
5. **Cleanup requires** `is_demo = true` AND matching `demo_seed_run_id` on every deleted row.

---

## Core demo fields

### `profiles`

| Field | Purpose |
|-------|---------|
| `is_demo` | Demo actor account |
| `demo_seed_run_id` | FK → `demo_seed_runs` (nullable for future production library actors) |
| `demo_display_label` | e.g. "HTBF Guide", "Sample Encourager" |

### `stories`

| Field | Purpose |
|-------|---------|
| `is_demo` | Demo content flag |
| `demo_seed_run_id` | FK → `demo_seed_runs` |
| `demo_scenario_id` | e.g. `prayer-to-god-did-it` |
| `content_origin` | Constrained origin (see below) |
| `demo_display_label` | Visible badge text |
| `is_ai_generated` | Narration / AI-assisted media disclosure |

### `prayer_video_responses`

Same applicable fields as stories, plus:

| Field | Purpose |
|-------|---------|
| `demo_media_transcript` | Accessibility captions / screen reader text |

### Child interaction tables

Each child table requires **both** `is_demo` and `demo_seed_run_id` for:

- Safe cleanup (DELETE scoped by run UUID)
- Realtime filtering without joins on every event
- Count exclusion in aggregations
- Moderation queue isolation
- Idempotent seed upserts

**Child demo status must be trigger-derived — never client-supplied.**

| Table | Demo fields | Derivation source |
|-------|-------------|-------------------|
| `story_reactions` | `is_demo`, `demo_seed_run_id` | Story OR reactor profile |
| `content_reports` | `is_demo`, `demo_seed_run_id` | Reported content OR reporter profile |
| `saved_content` | `is_demo`, `demo_seed_run_id` | Story + saver profile |
| `prayer_follows` | `is_demo`, `demo_seed_run_id` | Story + follower profile |
| `prayer_written_responses` | `is_demo`, `demo_seed_run_id` | Story + author profile |
| `story_video_replies` | `is_demo`, `demo_seed_run_id` | Story + participants — **staging seed should avoid creating demo private threads unless isolated to demo-only accounts** |

---

## Content-origin model

Constrained `content_origin` values (CHECK constraint):

| Value | Meaning |
|-------|---------|
| `member` | Default for all existing and future real member content |
| `staging_demo` | Automated staging seed (`demo_seed_runs.environment = 'staging'`) |
| `production_demo_library` | Owner-approved curated production onboarding content |
| `system` | HTBF system-generated placeholders (future) |

Rules:

- Existing rows default to `member`; **no backfill**.
- `staging_demo` requires `is_demo = true` and valid `demo_seed_run_id`.
- `production_demo_library` requires `is_demo = true`, explicit approval flag on run or scenario registry (future), and **cannot** be created by automated staging scripts.

---

## Demo-seed operator authorization model

### Trusted path only — no spoofable session flags

Demo seed and cleanup **must not** rely on `app.demo_seed_operator` or any other GUC that an ordinary authenticated client could set.

`htbf_is_demo_seed_operator()` returns true **only** when:

1. JWT role is `service_role` (seed/cleanup scripts using the service key — never exposed to browsers), **or**
2. Session user is `postgres` or `supabase_admin` (migrations / manual SQL editor).

**Why a normal member cannot satisfy this:** Supabase PostgREST connects members as the `authenticated` role with a member JWT. That JWT’s `role` claim is never `service_role`, and members cannot assume `postgres` / `supabase_admin`. There is no member-callable RPC that sets a seed-operator flag.

### SECURITY DEFINER functions in this draft

| Function | Purpose | EXECUTE granted to |
|----------|---------|-------------------|
| `htbf_is_demo_seed_operator()` | Internal operator check | `service_role` only |
| `update_my_demo_tour_state(jsonb)` | Validated guided-tour progress writes | `authenticated` |

All SECURITY DEFINER functions in the draft:

- Set fixed safe `search_path = ''`
- Schema-qualify referenced tables and functions (`public.stories`, etc.)
- `REVOKE EXECUTE FROM PUBLIC` and `anon` (and `authenticated` where not required)
- Grant only to the exact trusted role
- Use no dynamic SQL
- Do not trust user-controlled JWT metadata for seed authorization

Tour-state writes use a transaction-local GUC (`app.demo_tour_state_write`) set **only inside** `update_my_demo_tour_state()` — acceptable because members cannot call `set_config` for that GUC outside the SECURITY DEFINER owner context.

---

## Database-enforced consistency

### Row combination rules

| Realm | `is_demo` | `demo_seed_run_id` | `content_origin` |
|-------|-----------|-------------------|------------------|
| Genuine member content | `false` | `NULL` | `member` |
| Staging demo (seed path) | `true` | `NOT NULL` (staging run) | `staging_demo` |
| Future production demo library | `true` | `NOT NULL` (production run, Phase 7+) | `production_demo_library` |
| System placeholders (future) | `true` | `NOT NULL` | `system` |

**Existing genuine rows remain valid without backfill** — defaults are `is_demo = false`, `content_origin = 'member'`, `demo_seed_run_id = NULL`.

**Staging seed path guard:** `htbf_guard_staging_demo_seed_content()` rejects `production_demo_library` rows and requires the referenced `demo_seed_runs.environment = 'staging'`.

**Child rows:** `is_demo` and `demo_seed_run_id` are trigger-derived for member paths; clients cannot submit or override. Mismatched parent/run combinations fail at insert.

### Foreign-key delete behavior (`demo_seed_run_id`)

All `demo_seed_run_id` foreign keys use **`ON DELETE RESTRICT`**. Deleting a `demo_seed_runs` row while child demo content exists is blocked. **`ON DELETE SET NULL` is not used** — it would orphan `is_demo = true` rows.

**Controlled cleanup deletion order** (service_role script only):

1. Child engagement: `story_reactions`, `content_reports`, `saved_content`, `prayer_follows`, `prayer_written_responses`, `story_video_replies`
2. `prayer_video_responses`
3. `stories`
4. `profiles` (demo actors)
5. Supabase Storage objects under `demo_seed_runs.storage_prefix`
6. `UPDATE demo_seed_runs SET status = 'cleaned'` (or `DELETE` the run row last)

### Privilege model

| Actor | Can set `is_demo` / `demo_seed_run_id`? |
|-------|----------------------------------------|
| `authenticated` (members) | **No** — triggers force `false` / `NULL` |
| `service_role` (seed scripts) | **Yes** — direct writes with operator check |
| `postgres` / migration | Schema setup only |

### Trigger summary

See migration draft `supabase/migrations/20260725_demo_content_system.sql`.

| Trigger | Behavior | Failure |
|---------|----------|---------|
| `stories_reject_member_demo_flags_trg` | BEFORE INSERT/UPDATE: members cannot set demo flags | `42501` |
| `story_reactions_derive_demo_trg` | BEFORE INSERT: deny all member demo engagement | `42501` |
| `*_derive_demo_trg` (child tables) | Same cross-realm deny pattern | `42501` |
| `prayer_video_responses_derive_demo_trg` | Deny cross-realm video responses | `42501` |
| `stories_demo_origin_consistency_check` | CHECK: genuine vs demo origin combinations | `23514` |
| `demo_seed_runs_guard_insert_trg` | INSERT: service_role only; staging environment only in Phase 1 | `42501` |
| `htbf_guard_staging_demo_seed_content` | Staging seed cannot create `production_demo_library` | `42501` |
| `profiles_protect_demo_tour_state_trg` | Tour state updates only via RPC | `42501` |

### Cross-origin engagement prohibition (Phase 1 — DENY)

**Resolved decision:** For the initial staging implementation, **deny all cross-interaction** between genuine and demo records. This restriction may be reconsidered later **only through an explicit reviewed design**.

| Interaction | Phase 1 policy |
|-------------|----------------|
| Genuine user reacts to demo story | **Denied** (trigger `42501`) |
| Demo actor reacts to genuine story | **Denied** |
| Genuine user reports / saves / follows demo content | **Denied** |
| Demo actor reports / saves / follows genuine content | **Denied** |
| Genuine `prayer_video_responses` on demo story | **Denied** |
| Demo video response on genuine story | **Denied** |
| Guided tour engagement | **Overlay / read-only only** — no DB writes |

The guided tour must not create `story_reactions`, `prayer_video_responses`, `saved_content`, `prayer_follows`, or other engagement rows. Demo-only engagement rows may exist only when inserted by **service_role seed scripts** (Phase 2+), never by viewing members.

---

## Hard sequencing requirement (loader before seeding)

**Server-side demo exclusion must be implemented before any staging demo seed is permitted.**

Mandatory implementation order:

1. **Schema and database safeguards** (migration apply on htbf-staging)
2. **Server-loader exclusions** (`is_demo = false` on all member-facing queries)
3. **Count and Realtime isolation** (reaction/response/praying counts; Realtime drop filter)
4. **Tests** (loader exclusion, trigger denial, cleanup guards)
5. **Only then** staging demo seeding (Phase 2 scripts)

**Do not run Phase 2 seed scripts immediately after schema application** if default loaders and Realtime exclusions are not yet deployed. Seeding before loader exclusion would expose demo rows to genuine member surfaces.

---

## RLS and privilege protections

1. **No new permissive policies** for members to write demo flags.
2. **Existing INSERT policies** remain; triggers enforce demo derivation underneath RLS.
3. **Demo seed/cleanup** uses `service_role` JWT only — never browser-exposed keys or spoofable session flags.
4. **`demo_seed_runs` table:** INSERT/UPDATE/DELETE revoked from `authenticated` and `anon`; granted to `service_role`.
5. **SELECT policies** unchanged for Phase 1 — exclusion happens in **server loaders**, not by hiding rows from RLS (admins may still need to preview demo rows).
6. **Future:** optional restrictive policy preventing authenticated SELECT of `is_demo = true` rows except via security definer functions (Phase 3+).

---

## Server-side exclusion rules (loader matrix)

Default loaders **must** append `is_demo = false` (and `content_origin = 'member'` where applicable) at the **database query** level.

| Surface | Loader / module | Exclusion filter | Demo-specific loader |
|---------|-----------------|------------------|----------------------|
| Community Feed | `aggregateFeedItems.ts` | `.eq('is_demo', false)` on stories + responses | `loadDemoScenarioForViewer()` |
| Prayer Connect | `loadPrayerConnectRequests.ts` | `.eq('is_demo', false)` | `loadDemoPrayerScenario()` |
| Search | `loadSearchStories.ts` | `.eq('is_demo', false)` | Admin/demo route only |
| Reaction counts | `enrichFeedItems.ts` | Exclude `is_demo` reactions in COUNT/query | Demo loader includes demo-only |
| Praying counts | `loadPrayerConnectRequests.ts` | Same | Same |
| Video response counts | `responseCounts.ts` | `.eq('is_demo', false)` | Demo loader |
| Saved / followed counts | Profile sections | Filter demo rows | N/A |
| Ranking / sort | `prayer-connect/utils.ts` | Exclude demo before sort | Demo mode only |
| Realtime | `processRealtimeFeedUpdates.ts` | Drop events where payload `is_demo = true` | Demo channel isolated (future) |
| Moderation queue | Admin loaders | `.eq('is_demo', false)` default | `loadDemoModerationSamples()` admin-only |
| Analytics | N/A today | Future: exclude demo | Separate demo dashboard |
| Notifications | Email/push paths | Never notify for demo activity | N/A |
| AI moderation | Submit handlers | Skip or sandbox demo submissions | Forced outcomes in Scenario 7 |

**Do not expose demo content via public `?demo=1` query parameter.**

Admin preview requires authenticated owner/admin authorization check (`role = 'admin'` or allowlist).

---

## Realtime isolation design

Current subscriptions are **table-wide** (no row filters). Phase 1 approach:

1. **Server-side event handler** checks `is_demo` on incoming payload; drops demo events for normal feed listeners.
2. **Future Phase 3:** separate Realtime channel `demo-scenarios` for admin preview only.
3. **Count patches** (`patchFeedReactionCounts.ts`) re-query with `is_demo = false` filter.

---

## Moderation isolation design

- Default admin queue queries: `WHERE is_demo = false`.
- Demo Scenario 7 (`moderation-restoration-testing`) creates `content_reports` with `is_demo = true` — visible only in **Demo Moderation Preview** admin tab.
- AI moderation for demo content: sandbox mode — no OpenAI spend, or forced deterministic outcome stored in seed manifest.

---

## Staging seed and cleanup design (future scripts)

```
scripts/demo-content/
  demoGuards.mjs           # Production hostname + project ref rejection
  demoScenarios.mjs        # Scenario A–E definitions (fictional composite text)
  demoSeedRegistry.mjs     # demo_seed_runs CRUD
  seed-demo-staging.mjs    # Creates run → upserts entities by deterministic UUIDs
  cleanup-demo-staging.mjs # DELETE WHERE demo_seed_run_id = $id AND is_demo = true
  verify-demo-staging.mjs  # Label + count assertions
```

### Idempotency

- Deterministic UUIDs: `uuid_v5(namespace, seed_run_id + scenario_id + slot)`.
- Upsert on conflict; update `record_counts` on completion.
- Re-run same `seed_version`: abort if run `status = 'completed'` unless `--force-reset` deletes run first.

### Cleanup safeguards

1. Dry-run default.
2. Requires `HTBF_DEMO_CLEANUP_DRY_RUN=0` AND `HTBF_CONFIRM_DEMO_CLEANUP=1`.
3. Requires explicit `--run-id=<uuid>`.
4. Pre-delete SELECT must return **zero** rows where `is_demo = false`.
5. Storage delete scoped to `storage_prefix` from registry row only.
6. Mismatched run UUID → abort.

Reuse patterns from `load-tests/scripts/stagingGuards.mjs` and `cleanup-gate-a-staging.mjs`.

---

## Proposed demo accounts (staging)

All `@staging.htbf.test`, `is_demo = true`:

| Email pattern | Display label |
|---------------|---------------|
| `demo_guide_0001@staging.htbf.test` | HTBF Guide |
| `demo_community_0001@staging.htbf.test` | HTBF Community Demo |
| `demo_encourager_0001@staging.htbf.test` | Sample Encourager |
| `demo_member_0001@staging.htbf.test` | Sample Prayer Member |

No celebrity names, no photorealistic avatars, no PII.

---

## Initial demo set (Phase 2+ seed manifest)

**Six user-facing demo experiences** plus **one admin-only scenario**. Premium, intentionally written fictional content — not bulk filler.

### User-facing (6)

| # | Experience | `demo_scenario_id` | Pattern demonstrated |
|---|------------|-------------------|----------------------|
| 1 | Prayer Needing Support | `prayer-needing-support` | Empty responses, location/category metadata, encouragement affordances |
| 2 | Active Community Prayer | `active-community-prayer` | Multiple public video responses, horizontal rail, view-all |
| 3 | Prayer to God Did It | `prayer-to-god-did-it` | Prayer → reactions → public video metadata → God Did It answered state |
| 4 | Testimony / Praise Report | `testimony-praise-report` | Testimony + image metadata + encouragement display |
| 5 | How to Respond | `how-to-respond` | Respond sheet, public vs private explanation, sample response metadata |
| 6 | Guided HTBF Tour | `guided-htbf-tour` | Overlay-first onboarding (see `GUIDED_EXPERIENCE.md`) — read-only, no DB engagement |

### Admin-only (1)

| # | Experience | `demo_scenario_id` | Pattern demonstrated |
|---|------------|-------------------|----------------------|
| 7 | Moderation and restoration testing | `moderation-restoration-testing` | Pending / removed / restored demo report flows — isolated admin preview |

### Required on every visible item

- **Sample** or **Demo** text labeling (`demo_display_label`, visible badge)
- HTBF-branded fictional profile (no realistic personal identifiers)
- Accessibility label (`aria-label` / screen-reader text)
- Transcript for any future video (`demo_media_transcript`)
- No effect on genuine metrics (loaders, counts, Realtime exclude demo)
- No claim that activity came from actual members

All `story_text` prefixed with `[HTBF SAMPLE]`. Narration and copy are premium composite fiction only.

---

## Demo content ethics (permanent rules)

Prohibited:

- Copying or paraphrasing actual prayers or testimonies
- Reusing real member videos or images without explicit permission
- Real names or realistic personal identifiers
- Artificial healing or miracle claims presented as genuine
- Simulating private conversations in public surfaces
- Inflating real engagement, trending, or user-count statistics
- Presenting generated activity as proof of an active community

Required:

- Plainly fictional composite content
- Visible **Sample** or **Demo** labeling on every surface
- Traceability to `demo_scenario_id` and `demo_seed_run_id`

---

## Production demo library separation

| Aspect | Staging demo | Production demo library |
|--------|--------------|-------------------------|
| Origin | `staging_demo` | `production_demo_library` |
| Creation | Automated seed script | Owner admin approval workflow |
| Visibility | Staging app + admin preview | Production onboarding route only |
| Cleanup | By `demo_seed_run_id` | Separate lifecycle; never auto-deleted by staging cleanup |
| Promotion | **Never automatic** | Explicit multi-step approval |

---

## Phased implementation

| Phase | Deliverable |
|-------|-------------|
| **1A (this pass)** | Architecture docs + migration draft for review |
| **1B** | Apply migration on htbf-staging only; badge component |
| **2** | Loader exclusion + count filters + Realtime isolation + tests (**required before seed**) |
| **3** | Seed/cleanup CLI + six user-facing scenarios + admin scenario metadata (no video) |
| **4** | Branded video pipeline (after FFmpeg approval) |
| **5** | Admin demo controls |
| **6** | Guided experience route |
| **7** | Production demo library (owner-approved subset) |

**Hard rule:** Phase 3 seeding must not precede Phase 2 loader/count/Realtime exclusions.

---

## Future files to create or modify

See migration draft header and `GUIDED_EXPERIENCE.md` / `VIDEO_RENDERING.md`.

**New (future phases):**

- `scripts/demo-content/*`
- `lib/demo-content/types.ts`, `eligibility.ts`, `loadDemoScenarioForViewer.ts`
- `components/demo/DemoContentBadge.tsx`
- `app/admin/demo-content/page.tsx`
- `app/welcome/how-htbf-works/page.tsx`

**Modified (future phases):**

- `lib/community-feed/aggregateFeedItems.ts`, `enrichFeedItems.ts`
- `lib/prayer-connect/loadPrayerConnectRequests.ts`, `responseCounts.ts`
- `lib/search/loadSearchStories.ts`
- `lib/community-feed/processRealtimeFeedUpdates.ts`
- `components/FreedomFeed.tsx`, `PrayerConnectExperience.tsx`, `FeedListItem.tsx`

---

## Test plan

See `HTBF_DEMO_CONTENT_SYSTEM.md` § Test Plan in migration review companion and checklist:

- Normal members cannot set `is_demo` or `demo_seed_run_id`
- Trigger-derived child status cannot be spoofed
- Real loaders exclude demo by default
- Demo loader includes only requested scenario
- Demo Realtime events do not enter real feeds
- Demo counts never affect real counts
- Demo moderation isolated
- Cleanup cannot delete real records; mismatched run UUID aborts
- Production project refs and hostnames rejected
- Seed idempotent; media cleanup prefix-scoped
- Guided tour does not write genuine engagement
- Private responses remain private
- Screen-reader demo labels present

---

## Rollback analysis (migration)

**Safe rollback (if migration applied on staging only):**

1. Drop triggers and functions added by migration.
2. Drop FK constraints from demo columns.
3. Drop columns (only if no demo data depended upon — staging cleanup first).
4. Drop `demo_seed_runs` table.

**Unsafe / do not automate:**

- Dropping columns while demo FKs exist
- Mass UPDATE setting `is_demo = false` on unknown rows
- Applying rollback on production without data audit

Existing real records are unaffected — all new columns have safe defaults (`is_demo = false`, `content_origin = 'member'`).

---

## Live seeding readiness matrix (Phase 2B)

**Seeding is not approved in this phase.** All gates below must be green, automated tests must pass, and `schema state` must equal **`ready`** before any staging seed command runs.

| Gate | Scope | Status |
|------|-------|--------|
| 1. Schema safeguards | Migration `20260725_demo_content_system.sql` on htbf-staging | **Complete** |
| 2. Feed exclusion | `aggregateFeedItems`, enrichment, keyset pagination | **Complete** (471e06da) |
| 3. Prayer exclusion | `loadPrayerConnectRequests`, community responses | **Complete** (471e06da) |
| 4. Search exclusion | `loadSearchStoriesPage` | **Complete** (471e06da) |
| 5. Count isolation | Reactions, praying, video-response counts | **Complete** (471e06da) |
| 6. Realtime isolation | Feed ingress + sync + revalidation | **Complete** (471e06da) |
| 7. Moderation isolation | Admin queues, `content_reports`, video-response admin | **Complete** (Phase 2B) |
| 8. Notification / email suppression | `inbox_messages` writes, future Resend gate | **Complete** (Phase 2B) |
| 9. AI moderation / cost suppression | Story + video-response moderation, Creator Studio AI routes | **Complete** (Phase 2B) |

Additional Phase 2B gates:

| Gate | Scope | Status |
|------|-------|--------|
| Testimony Map isolation | `loadMapStories.ts` stories + reactions | **Complete** (Phase 2B) |
| Private / inbox isolation | Saved, follows, private messages, Journey Inbox, Messages | **Complete** (Phase 2B) |
| Schema readiness | `pre_schema` / `ready` / `schema_drift` detection | **Complete** (Phase 2B) |

### Schema state rules

| State | Meaning | Public loader behavior |
|-------|---------|------------------------|
| `pre_schema` | All required tables missing `is_demo` | Genuine loaders run without demo filter (demo rows cannot exist yet) |
| `ready` | All required tables have demo columns | Genuine loaders **must** apply `is_demo = false` |
| `schema_drift` | Mixed present/missing columns | **`DemoContentSchemaDriftError`** — public loading stops; seeding prohibited |

Required tables for readiness: `profiles`, `stories`, `prayer_video_responses`, `story_reactions`, `content_reports`, `saved_content`, `prayer_follows`, `prayer_written_responses`, `story_video_replies`.

Future seed commands must call `assertDemoSchemaReadyForSeeding()` and require `state === "ready"`.

---

## Resolved decisions (Phase 1A)

1. **Real-to-demo cross-interaction:** **Denied** for Phase 1. Reconsider only via explicit reviewed design.
2. **`demo_tour_state` storage:** `profiles.demo_tour_state jsonb` — updates via `update_my_demo_tour_state()` RPC only.
3. **Demo-seed authorization:** `service_role` JWT or `postgres`/`supabase_admin` only — no spoofable session flags.
4. **Separate Realtime channel vs. server-side drop:** Start with server-side drop; revisit if latency unacceptable.
5. **Production demo library approval workflow UI:** Defer to Phase 7.
