/**
 * Backfill missing prayer video thumbnails using a headless browser.
 *
 * Requires:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Optional:
 *   PRAYER_BACKFILL_ALLOW_PRODUCTION=1  (required when URL looks like production)
 *   PRAYER_BACKFILL_LIMIT=25            (max records per table per run)
 *   PRAYER_BACKFILL_DRY_RUN=1           (log only, no uploads/updates)
 *
 * Usage:
 *   node scripts/backfill-prayer-thumbnails.mjs
 *   node scripts/backfill-prayer-thumbnails.mjs --responses-only
 *   node scripts/backfill-prayer-thumbnails.mjs --stories-only
 */

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync } from "fs";
import { resolve } from "path";

const args = new Set(process.argv.slice(2));
const storiesOnly = args.has("--stories-only");
const responsesOnly = args.has("--responses-only");
const dryRun = process.env.PRAYER_BACKFILL_DRY_RUN === "1";
const limit = Number(process.env.PRAYER_BACKFILL_LIMIT || 25);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const looksProduction =
  /supabase\.co/i.test(supabaseUrl) &&
  !/localhost|127\.0\.0\.1|staging|dev|preview/i.test(supabaseUrl);

if (looksProduction && process.env.PRAYER_BACKFILL_ALLOW_PRODUCTION !== "1") {
  console.error(
    "Refusing production backfill without PRAYER_BACKFILL_ALLOW_PRODUCTION=1"
  );
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const STORY_VIDEO_BUCKET = "story-videos";
const STORY_THUMBNAIL_BUCKET = "story-thumbnails";

function getStoragePath(value, bucket) {
  if (!value) return null;
  if (!value.startsWith("http")) return value.replace(/^\/+/, "");
  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = value.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(value.slice(idx + marker.length).split("?")[0]);
}

async function signVideoUrl(videoRef) {
  const path = getStoragePath(videoRef, STORY_VIDEO_BUCKET);
  if (!path) return null;
  const { data, error } = await admin.storage
    .from(STORY_VIDEO_BUCKET)
    .createSignedUrl(path, 60 * 15);
  if (error) {
    console.error("Could not sign video:", path, error.message);
    return null;
  }
  return data.signedUrl;
}

async function captureThumbnailBlob(page, signedVideoUrl) {
  return page.evaluate(async (videoUrl) => {
    function waitFor(target, eventName, timeoutMs = 20000) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`Timed out waiting for ${eventName}`)),
          timeoutMs
        );
        target.addEventListener(
          eventName,
          () => {
            clearTimeout(timer);
            resolve(undefined);
          },
          { once: true }
        );
        target.addEventListener(
          "error",
          () => {
            clearTimeout(timer);
            reject(new Error(`Video ${eventName} failed`));
          },
          { once: true }
        );
      });
    }

    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = videoUrl;
    document.body.appendChild(video);

    try {
      await waitFor(video, "loadedmetadata");
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      const candidates =
        duration > 0
          ? [Math.min(1, duration * 0.1), duration * 0.5, 0.05, 0]
          : [0.05, 0];

      let lastError = null;
      for (const seekTime of candidates) {
        try {
          video.currentTime = seekTime;
          await waitFor(video, "seeked", 8000);
          const maxWidth = 1280;
          const vw = video.videoWidth || 720;
          const vh = video.videoHeight || 1280;
          const scale = vw > maxWidth ? maxWidth / vw : 1;
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(vw * scale);
          canvas.height = Math.round(vh * scale);
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("No canvas context");
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const blob = await new Promise((resolveBlob, rejectBlob) => {
            canvas.toBlob(
              (result) =>
                result ? resolveBlob(result) : rejectBlob(new Error("No blob")),
              "image/webp",
              0.82
            );
          });
          return {
            bytes: Array.from(new Uint8Array(await blob.arrayBuffer())),
            mimeType: blob.type || "image/webp",
            width: canvas.width,
            height: canvas.height,
          };
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError || new Error("Could not capture thumbnail");
    } finally {
      video.remove();
    }
  }, signedVideoUrl);
}

async function uploadThumbnail(ownerUserId, capture) {
  const extension = capture.mimeType.includes("webp") ? "webp" : "jpg";
  const path = `${ownerUserId}/${Date.now()}-backfill-${crypto.randomUUID()}.${extension}`;
  const body = Buffer.from(capture.bytes);

  const { error } = await admin.storage.from(STORY_THUMBNAIL_BUCKET).upload(path, body, {
    cacheControl: "3600",
    upsert: false,
    contentType: capture.mimeType,
  });

  if (error) throw new Error(error.message);
  return path;
}

async function processStoryRecords(page) {
  const { data, error } = await admin
    .from("stories")
    .select("id, user_id, video_url, thumbnail_url, story_type")
    .not("video_url", "is", null)
    .is("thumbnail_url", null)
    .ilike("story_type", "%prayer%")
    .limit(limit);

  if (error) {
    console.error("Story query failed:", error.message);
    return { attempted: 0, updated: 0, skipped: 0, failed: 0 };
  }

  const rows = data ?? [];
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    if (!row.video_url || !row.user_id) {
      skipped += 1;
      continue;
    }

    const signed = await signVideoUrl(row.video_url);
    if (!signed) {
      failed += 1;
      console.log(`story ${row.id}: could not sign video`);
      continue;
    }

    try {
      const capture = await captureThumbnailBlob(page, signed);
      if (dryRun) {
        console.log(
          `story ${row.id}: dry-run thumbnail ${capture.width}x${capture.height}`
        );
        updated += 1;
        continue;
      }

      const thumbnailPath = await uploadThumbnail(row.user_id, capture);
      const { error: updateError } = await admin
        .from("stories")
        .update({ thumbnail_url: thumbnailPath })
        .eq("id", row.id)
        .is("thumbnail_url", null);

      if (updateError) throw new Error(updateError.message);
      console.log(`story ${row.id}: thumbnail saved`);
      updated += 1;
    } catch (captureError) {
      failed += 1;
      console.log(
        `story ${row.id}: failed — ${
          captureError instanceof Error ? captureError.message : "unknown"
        }`
      );
    }
  }

  return { attempted: rows.length, updated, skipped, failed };
}

async function processResponseRecords(page) {
  const { data, error } = await admin
    .from("prayer_video_responses")
    .select("id, user_id, video_url, thumbnail_url, status, removed_at")
    .not("video_url", "is", null)
    .is("thumbnail_url", null)
    .neq("status", "removed")
    .is("removed_at", null)
    .limit(limit);

  if (error) {
    if (/thumbnail_url|removed_at/i.test(error.message)) {
      console.log("Response backfill skipped — optional columns unavailable.");
      return { attempted: 0, updated: 0, skipped: 0, failed: 0 };
    }
    console.error("Response query failed:", error.message);
    return { attempted: 0, updated: 0, skipped: 0, failed: 0 };
  }

  const rows = data ?? [];
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    if (!row.video_url || !row.user_id) {
      skipped += 1;
      continue;
    }

    const signed = await signVideoUrl(row.video_url);
    if (!signed) {
      failed += 1;
      console.log(`response ${row.id}: could not sign video`);
      continue;
    }

    try {
      const capture = await captureThumbnailBlob(page, signed);
      if (dryRun) {
        console.log(
          `response ${row.id}: dry-run thumbnail ${capture.width}x${capture.height}`
        );
        updated += 1;
        continue;
      }

      const thumbnailPath = await uploadThumbnail(row.user_id, capture);
      const { error: updateError } = await admin
        .from("prayer_video_responses")
        .update({ thumbnail_url: thumbnailPath })
        .eq("id", row.id)
        .is("thumbnail_url", null);

      if (updateError) throw new Error(updateError.message);
      console.log(`response ${row.id}: thumbnail saved`);
      updated += 1;
    } catch (captureError) {
      failed += 1;
      console.log(
        `response ${row.id}: failed — ${
          captureError instanceof Error ? captureError.message : "unknown"
        }`
      );
    }
  }

  return { attempted: rows.length, updated, skipped, failed };
}

async function main() {
  mkdirSync(resolve(process.cwd(), ".screenshots"), { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent("<body></body>");

  const summary = {
    stories: { attempted: 0, updated: 0, skipped: 0, failed: 0 },
    responses: { attempted: 0, updated: 0, skipped: 0, failed: 0 },
  };

  if (!responsesOnly) {
    summary.stories = await processStoryRecords(page);
  }
  if (!storiesOnly) {
    summary.responses = await processResponseRecords(page);
  }

  await browser.close();

  console.log("\nBackfill summary:");
  console.log(JSON.stringify(summary, null, 2));
  if (dryRun) {
    console.log("Dry run only — no records were updated.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
