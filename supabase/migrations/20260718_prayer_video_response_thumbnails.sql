-- HTBF Prayer — persisted thumbnails for public video responses
-- Additive + idempotent. Apply manually in Supabase SQL editor.

BEGIN;

ALTER TABLE public.prayer_video_responses
  ADD COLUMN IF NOT EXISTS thumbnail_url text;

CREATE INDEX IF NOT EXISTS prayer_video_responses_thumbnail_idx
  ON public.prayer_video_responses (story_id)
  WHERE thumbnail_url IS NOT NULL;

COMMIT;
