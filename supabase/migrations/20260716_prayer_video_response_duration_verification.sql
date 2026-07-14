-- HTBF Prayer — video response duration verification state
-- Additive + idempotent. Safe to run more than once.
--
-- Trusted server-side duration probing is NOT implemented in this repo yet.
-- Until a worker (ffprobe) validates uploaded media, responses remain
-- `duration_verification_status = 'unavailable'` and must not auto-publish.
-- Admin approval is blocked when status = 'failed'.

BEGIN;

ALTER TABLE public.prayer_video_responses
  ADD COLUMN IF NOT EXISTS duration_verification_status text NOT NULL DEFAULT 'unavailable',
  ADD COLUMN IF NOT EXISTS duration_seconds numeric(8, 2),
  ADD COLUMN IF NOT EXISTS duration_verified_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'prayer_video_responses_duration_verification_status_check'
  ) THEN
    ALTER TABLE public.prayer_video_responses
      ADD CONSTRAINT prayer_video_responses_duration_verification_status_check
      CHECK (
        duration_verification_status IN (
          'pending',
          'verified',
          'failed',
          'unavailable'
        )
      );
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS prayer_video_responses_duration_status_idx
  ON public.prayer_video_responses (duration_verification_status)
  WHERE status IN ('submitted', 'approved');

COMMIT;
