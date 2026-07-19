# HTBF Guided Experience — “See How HTBF Works”

**Status:** Design only. Route **not implemented** in Phase 1A.
**Future route:** `/welcome/how-htbf-works`

---

## Purpose

Optional onboarding that demonstrates **generalized interaction patterns** — not real community activity. Users must always understand they are viewing **Sample / Demo** content.

This experience is separate from:

1. **Staging synthetic test data** (developer/QA density validation)
2. **Future production demo library** (owner-curated onboarding samples)
3. **Real member content**

---

## Phase 1 recommendation: overlay-first, not DB writes

For the first implemented version, prefer a **local guided overlay** or **read-only curated demo scenario** rather than writing reactions and responses to the database when a new user taps controls.

| Approach | Pros | Cons |
|----------|------|------|
| **Overlay / simulated UI state (recommended Phase 1)** | Zero impact on counts; no spoofing risk; works before seed exists | Less faithful to realtime edge cases |
| DB-backed demo scenario | Tests full stack | Requires strict trigger isolation; more complex |

When DB-backed demo is used (Phase 3+), all writes must target `is_demo = true` rows with trigger-enforced `demo_seed_run_id`.

---

## Experience flow (8 steps)

1. **Welcome** — “This is a guided **sample** experience. Demo members are not real people.”
2. **Discover a prayer** — Highlight sample prayer card (Scenario B or dedicated tour scenario)
3. **I’m Praying** — Simulated press; overlay shows count badge **without** incrementing real counts
4. **Encouragement** — Demonstrate Amen / Praise God / Encouraged UI states (overlay or demo-only row)
5. **Respond** — Open respond sheet; explain public video vs private message **conceptually**
6. **Public video response** — Show branded placeholder player (no photorealistic person)
7. **God Did It** — Show answered-state transformation (read-only demo scenario A)
8. **Return to Feed** — Restore scroll position; offer “Explore real community” CTA

---

## How sample actions avoid altering real counts

| Action | Phase 1 behavior |
|--------|------------------|
| I’m Praying | Overlay animates; **no** `story_reactions` INSERT |
| Encouragement | Overlay toggles; **no** INSERT |
| Respond | Sheet opens in **preview mode**; submit disabled or routes to demo-only endpoint |
| Save / Follow | Display-only chip; no persistence |
| God Did It | Read-only demo card; user cannot submit on tour |

Phase 3+ optional: writes go to demo-flagged rows via `service_role` seed actor only — not the viewing member.

---

## Progress, dismissal, and completion storage

### Recommended: `profiles.demo_tour_state jsonb`

**Justification:**

- `profiles` already stores onboarding-adjacent fields (`profile_completed`, `journey_focus`).
- `prayer_search_preferences` is a separate table for domain-specific prefs — guided tour is cross-cutting onboarding, not prayer-only.
- JSONB allows evolution without repeated migrations (`completed_at`, `dismissed_at`, `last_step`, `replay_count`).

**Proposed shape (not applied until migration approved):**

```json
{
  "how_htbf_works": {
    "version": 1,
    "status": "in_progress",
    "current_step": 3,
    "started_at": "2026-07-19T12:00:00.000Z",
    "dismissed_at": null,
    "completed_at": null,
    "replay_requested_at": null
  }
}
```

**Allowed keys under `how_htbf_works`:** `version`, `status`, `current_step`, `started_at`, `dismissed_at`, `completed_at`, `replay_requested_at`.

**Updates:** Members must call `update_my_demo_tour_state(jsonb)` — a SECURITY DEFINER RPC that validates the patch shape and merges only the `how_htbf_works` key. Direct client updates to `profiles.demo_tour_state` or unrelated profile JSON are rejected by trigger.

**Why this remains the best fit:** `profiles` already stores onboarding-adjacent fields (`profile_completed`, `journey_focus`). A separate table is deferred until a second guided flow exists.

---

## Dismissal behavior

- User taps “Skip” or closes sheet → set `dismissed_at` in `demo_tour_state`.
- Do **not** mark completed.
- Do not show again unless user opens **Settings → Replay guided tour** or `/welcome/how-htbf-works` directly.

---

## Completion behavior

- Set `completed_at` when user finishes step 8 or taps “Got it”.
- Hide auto-prompt on Feed/Prayer first visit.
- Allow explicit replay from Settings (clears `completed_at` or sets `replay_requested_at`).

---

## Replay

Settings entry: **“Replay how HTBF works”**

- Resets tour progress in client state.
- Optionally sets `replay_requested_at` for analytics (demo-only metric, not community engagement).
- Does not delete or mutate demo seed data.

---

## Entry points

| Entry | When shown |
|-------|------------|
| First-login soft prompt | `profile_completed = true` AND no `completed_at` AND no `dismissed_at` |
| Settings | Always available |
| Direct URL | `/welcome/how-htbf-works` |

**Never** auto-inject demo content into Feed/Prayer without user opt-in.

---

## Loader: `loadDemoScenarioForViewer()`

Dedicated server module (future `lib/demo-content/loadDemoScenarioForViewer.ts`):

```typescript
// Pseudocode — not implemented
loadDemoScenarioForViewer({
  scenarioId: 'prayer-to-god-did-it',
  viewerUserId,
  authorization: 'guided-tour' | 'admin-preview',
})
```

Requirements:

- Requires authenticated user.
- **Admin preview** requires `role = 'admin'`.
- **Guided tour** uses read-only demo scenario IDs allowlisted in code.
- Query explicitly `.eq('is_demo', true).eq('demo_scenario_id', scenarioId)`.
- Never mixed with member loaders.

**No public `?demo=1` query parameter.**

---

## Private response concepts without fake private conversations

Step 5 explains:

- **Public video response** — visible to community (show sample branded clip).
- **Private message / private video** — described in copy + illustration only.

Do **not** render `story_video_replies` content in the guided tour.

Optional: static illustration card labeled **“Private — not shown in tour”**.

Staging Scenario E must not insert demo private threads visible to real accounts.

---

## Accessibility

| Requirement | Implementation |
|-------------|----------------|
| Sample / Demo announcement | `aria-label="Sample prayer request"` on cards; visible badge + text |
| Focus management | Focus trap in tour modal; return focus on close |
| Keyboard | Enter/Space activate steps; Escape dismisses |
| Reduced motion | Respect `prefers-reduced-motion`: disable slide animations; instant step transitions |
| Screen reader step announcements | `aria-live="polite"` region for step title + instructions |
| Video | Transcript from `demo_media_transcript`; no autoplay audio without gesture |

---

## Mobile-first layout

- Bottom sheet for respond explanation on mobile.
- Full-screen step cards on small viewports.
- Touch targets ≥ 44px.
- Scroll position preserved via `sessionStorage` key `htbf-guided-tour-feed-scroll` (no PII).

---

## Security

- Tour state stored per authenticated user only.
- No demo content in SSR HTML for unauthenticated visitors unless on public marketing page (future decision).
- Admin preview gated by role check server-side.

---

## Files to create (future phases)

| File | Purpose |
|------|---------|
| `app/welcome/how-htbf-works/page.tsx` | Route shell |
| `components/demo/GuidedExperienceOverlay.tsx` | Step UI |
| `components/demo/DemoContentBadge.tsx` | Shared badge |
| `lib/demo-content/loadDemoScenarioForViewer.ts` | Demo loader |
| `lib/demo-content/guidedTourState.ts` | Call `update_my_demo_tour_state()` RPC |
| `lib/demo-content/guidedTourState.test.ts` | State machine tests |

---

## Test plan (guided experience)

- Tour does not appear after `completed_at` set
- Dismissal prevents auto-prompt
- Replay from Settings works
- Step actions do not INSERT into `story_reactions` (Phase 1 overlay)
- Screen reader labels present on every demo card
- Reduced motion disables animations
- No private message content rendered
- `loadDemoScenarioForViewer` rejects unauthenticated callers
- Non-admin cannot access admin preview scenarios
