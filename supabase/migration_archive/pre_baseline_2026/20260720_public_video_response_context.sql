-- HTBF — public video response context + AI review metadata
-- Additive + idempotent. Apply manually in Supabase SQL editor.

BEGIN;

ALTER TABLE public.prayer_video_responses
  ADD COLUMN IF NOT EXISTS response_context text;

ALTER TABLE public.prayer_video_responses
  ADD COLUMN IF NOT EXISTS ai_review_status text;

ALTER TABLE public.prayer_video_responses
  ADD COLUMN IF NOT EXISTS ai_risk_level text;

ALTER TABLE public.prayer_video_responses
  ADD COLUMN IF NOT EXISTS ai_suggested_action text;

ALTER TABLE public.prayer_video_responses
  ADD COLUMN IF NOT EXISTS ai_summary text;

ALTER TABLE public.prayer_video_responses
  ADD COLUMN IF NOT EXISTS ai_flags jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'prayer_video_responses_response_context_check'
  ) THEN
    ALTER TABLE public.prayer_video_responses
      ADD CONSTRAINT prayer_video_responses_response_context_check
      CHECK (
        response_context IS NULL
        OR response_context IN ('feed_post', 'prayer_request', 'video_post')
      );
  END IF;
END $$;

-- Backfill from parent story type where context is missing.
UPDATE public.prayer_video_responses pvr
SET response_context = CASE
  WHEN lower(coalesce(s.story_type, '')) LIKE '%prayer%' THEN 'prayer_request'
  WHEN lower(coalesce(s.story_type, '')) LIKE '%video%' THEN 'video_post'
  ELSE 'feed_post'
END
FROM public.stories s
WHERE s.id = pvr.story_id
  AND pvr.response_context IS NULL;

CREATE INDEX IF NOT EXISTS prayer_video_responses_context_status_idx
  ON public.prayer_video_responses (response_context, status);

COMMIT;
