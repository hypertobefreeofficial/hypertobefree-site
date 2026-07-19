# HTBF Demo Video Rendering — Architecture (Future)

**Status:** Design only. **FFmpeg is not installed** on the development machine (`ffmpeg:not_installed`). **Do not install** without owner approval.

---

## Design constraints

| Rule | Detail |
|------|--------|
| No photorealistic artificial person | Branded graphics and typography only |
| No external paid API | Without explicit owner approval |
| No automated CI rendering | Manual or admin-triggered staging renders only |
| No representation as real member | Always labeled **SAMPLE PRAYER** or **SAMPLE RESPONSE** |
| Staging-first | Storage prefix scoped to `demo_seed_runs.storage_prefix` |
| Maximum duration | 15–30 seconds |
| Maximum resolution | 720p (1280×720) |
| Maximum file size | 5 MB per clip (enforced at upload) |

---

## Phase 1 scope

**No video generation in Phase 1A or 1B.**

Scenario seeds use:

- Placeholder `video_url` / `thumbnail_url` pointing to static HTBF-branded assets, or
- Metadata-only rows until Phase 4 render pipeline exists.

---

## HTBF-owned branded format

Visual composition (static or light motion):

```
┌─────────────────────────────────┐
│  [HTBF logo watermark]          │
│                                 │
│     SAMPLE RESPONSE             │  ← burned-in label (large)
│                                 │
│  "This is fictional sample text  │  ← short composite copy
│   for demonstration only."       │
│                                 │
│  [Caption line 1]               │  ← burned-in captions
│  [Caption line 2]               │
└─────────────────────────────────┘
```

Background: HTBF gradient or subtle animated gradient (no faces, no stock “testimony” imagery).

Optional Phase 4+: TTS narration marked `is_ai_generated = true` with transcript in `demo_media_transcript`.

---

## Toolchain (future — after FFmpeg approval)

| Component | Role |
|-----------|------|
| **FFmpeg** | Compose video from PNG/SVG frames + optional audio |
| **Node script** | `scripts/demo-content/render-demo-video.mjs` — orchestrates render |
| **Template assets** | `scripts/demo-content/assets/` (git-tracked SVG/PNG, no generated output) |
| **Output** | Local temp dir → upload to Supabase Storage |

**Pre-install report required:**

- FFmpeg version
- License compatibility (LGPL)
- Disk space estimate
- Whether install via Homebrew is acceptable on owner Mac

---

## Rendering process (proposed)

1. **Load template** for scenario slot (`response-1`, `prayer-intro`, etc.)
2. **Inject text** from scenario definition (fictional composite only)
3. **Render frames** — static PNG sequence or single frame held 20s
4. **Burn in** label + captions + watermark via FFmpeg `drawtext` / overlay filter
5. **Optional audio** — TTS file mixed in; flag `is_ai_generated`
6. **Validate** duration ≤ 30s, file size ≤ 5 MB
7. **Extract thumbnail** — frame at 1s → PNG
8. **Upload** to staging bucket under deterministic path
9. **Update** `prayer_video_responses` or `stories` metadata + `demo_media_transcript`

---

## Storage destination

| Environment | Bucket path |
|-------------|-------------|
| Staging | `{storage_prefix}{scenario_id}/{slot}.mp4` |
| Staging thumbnails | `{storage_prefix}{scenario_id}/{slot}.jpg` |

Where `storage_prefix` comes from `demo_seed_runs.storage_prefix` (e.g. `demo/a1b2c3d4-.../`).

**Never** write into member media prefixes `{userId}/...`.

---

## Deterministic file naming

```
demo/{demo_seed_run_id}/{demo_scenario_id}/{slot_role}.mp4
demo/{demo_seed_run_id}/{demo_scenario_id}/{slot_role}.jpg
demo/{demo_seed_run_id}/{demo_scenario_id}/{slot_role}.vtt   # optional captions sidecar
```

Enables idempotent re-render and prefix-scoped cleanup.

---

## Database metadata

| Column | Value |
|--------|-------|
| `video_url` | Storage public/signed path |
| `thumbnail_url` | Thumbnail path |
| `duration_seconds` | From FFprobe |
| `demo_media_transcript` | Full caption text for a11y |
| `is_ai_generated` | true if TTS used |
| `is_demo` | true |
| `demo_seed_run_id` | FK |
| `demo_display_label` | "Sample Response" |
| `content_origin` | `staging_demo` |

---

## Accessibility

- **Burned-in captions** on every demo video
- **`demo_media_transcript`** duplicated in DB for screen readers and feed alt text
- **No autoplay with sound** in guided tour without user gesture
- Player exposes transcript panel in demo mode

---

## Cleanup

1. Delete storage objects under `demo_seed_runs.storage_prefix` for run UUID.
2. Delete DB rows WHERE `demo_seed_run_id = $id` AND `is_demo = true`.
3. Abort if prefix does not start with `demo/`.
4. Abort if run `environment != 'staging'` unless production cleanup explicitly authorized (future).

---

## Storage and cost protection

| Guard | Limit |
|-------|-------|
| Max videos per seed run | 20 |
| Max total storage per run | 100 MB |
| Render batch | Manual CLI; no watch mode |
| TTS / external API | Disabled by default; owner flag required |
| Re-render | Overwrites same deterministic path (no orphan accumulation) |

---

## Cost implications

| Item | Staging estimate |
|------|------------------|
| 10 clips × 3 MB | ~30 MB storage |
| Egress during QA | Minimal (signed URLs, local dev) |
| TTS (if added) | ~$0.01–0.05 per clip — **off by default** |
| FFmpeg | Free; local CPU only |

Production demo library promotion copies approved assets separately — not automatic.

---

## Phase 4 deliverables (future)

- [ ] Owner approval for FFmpeg install
- [ ] Template asset pack in repo
- [ ] `render-demo-video.mjs` with validation
- [ ] Upload integration with staging guards
- [ ] Admin “Regenerate demo media” button (staging only)
- [ ] Tests: file size, duration, watermark presence (ffprobe metadata checks)

---

## Explicit non-goals

- Photorealistic AI avatars
- Lip-sync “fake member” videos
- Batch rendering in GitHub Actions
- Sora / Runway / HeyGen or similar without owner approval
- Using real member video as source material
