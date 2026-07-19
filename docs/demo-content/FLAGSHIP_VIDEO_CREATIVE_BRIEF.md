# HTBF Flagship Demo Video — Creative Brief

**Phase:** Creative Prototype (owner review)
**Status:** In-browser prototypes only — **no final video rendered**
**Route:** `/admin/demo-content/creative-lab` (admin-only)

---

## Purpose

Present three genuinely premium creative directions for HTBF’s first flagship fictional demo experience:

**Prayer → Support → God Did It**

This is not bulk filler content. Each direction must feel worthy of a professionally funded faith-centered social platform while remaining clearly fictional and labeled **SAMPLE DEMO**.

---

## Fictional narrative (connected sample)

| Beat | Copy |
|------|------|
| Prayer request | “Please pray that God gives me peace while I wait for a decision that could change my family’s next season.” |
| Public response | “I'm standing with you in prayer. May God give you peace before the answer comes and clarity for whatever door opens.” |
| God Did It | “God Did It. The door opened—but the first answer was the peace He gave me while I waited.” |
| Final invitation | “Share the prayer. Stand together. Celebrate what God did.” |

---

## Three creative directions

### Direction A — Cinematic Dawn

Warm sunrise and open-sky atmosphere; soft cloud parallax; ivory, warm gold, soft blue, and earth tones; elegant editorial typography; hopeful and restrained; unmistakably HTBF.

**Recommended audio:** Warm documentary narration; soft orchestral dawn pad; subtle morning ambience at opening.

### Direction B — Sacred Journal

Premium devotional-journal aesthetic; tactile paper, refined handwritten accents, layered light; intimate and calm; no scrapbook clichés.

**Recommended audio:** Intimate first-person journal reading; minimal acoustic guitar or sparse piano. **Text-only may be stronger** for this direction.

### Direction C — Living Testimony

Premium modern social-video treatment; full-screen storytelling; kinetic captions; purposeful transitions; energetic yet reverent; shows HTBF community interaction.

**Recommended audio:** Friendly guide narration; modern faith-pop instrumental; soft UI taps on support beat.

---

## Format

| Spec | Value |
|------|-------|
| Primary aspect | 9:16 vertical (1080×1920 target) |
| Duration | ~28 seconds (20–30s target) |
| Composition | Center-safe for future 4:5 crop |
| Labeling | **SAMPLE DEMO** integrated on every prototype |
| Audio (this phase) | None — documentation only |

### Six required moments

1. SAMPLE DEMO opening
2. Prayer request
3. “I'm Praying” + encouragement support
4. Public response
5. God Did It update
6. Final HTBF journey invitation

---

## Quality bar

**Avoid:** generic gradient slides, Canva-template styling, stock collages, TTS, fake talking-head AI, cheap particles, religious clip art, cluttered captions, tiny text, low contrast, overly dark screens.

**Require:** excellent typography hierarchy, premium spacing, smooth restrained animation, clear emotional progression, mobile readability, accessible contrast, HTBF logo watermark, fictional labeling throughout.

---

## Implementation constraints (this phase)

- Admin-only Creative Lab route
- In-browser CSS animation prototypes
- Play / pause / restart / scrub controls
- Reduced-motion support
- No database writes
- No external API calls
- No generated video files
- No FFmpeg
- No staging seed
- No paid AI or audio services

---

## Production gate

**No final video has been rendered. These are owner-review creative prototypes.**

Full production (FFmpeg render pipeline, optional narration, staging asset upload) is **blocked until the owner approves one direction**.

---

## Owner preview steps

1. Sign in as an HTBF admin on the Preview deployment (`feat/demo-content-system`).
2. Open `/admin/demo-content/creative-lab`.
3. Select Direction A, B, or C from the side panel.
4. Use Play, Pause, Restart, and the timeline scrubber to review all six beats.
5. Review the documented audio recommendations for each direction.
6. Choose one direction for Phase 4 video production planning.
