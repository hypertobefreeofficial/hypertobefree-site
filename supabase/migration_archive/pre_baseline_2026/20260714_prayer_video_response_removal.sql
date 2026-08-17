-- HTBF Prayer — public video response removal (owner / author / moderator)
-- Additive + idempotent. Safe to run more than once.
--
-- Context:
--   `prayer_video_responses` is a pre-existing table (its base DDL is not in
--   this repo). This migration ONLY adds soft-removal bookkeeping columns and a
--   helper index. It does NOT alter the existing `status` CHECK constraint (its
--   definition is unknown here), so removal continues to use the already-valid
--   `status = 'removed'` value and records *who/why* in `removal_source` so a
--   prayer-owner removal stays distinguishable from a moderator enforcement.
--
-- REVIEW NOTES:
-- - removal_source disambiguates ownership removal vs. moderation:
--     'prayer_owner' | 'response_author' | 'moderator' | 'administrator'
-- - removed_by_user_id records the acting user (never editable by the responder)
-- - removal_reason may remain NULL for prayer-owner / author removals
-- - Public reads already filter status = 'approved', so a removed row is
--   excluded from public display automatically (no RLS change required here).
-- - Server-side enforcement of *who may remove* lives in the API route
--   /api/remove-prayer-video-response (service-role, ownership-verified).
--
-- OPTIONAL (not applied here): if the team prefers distinct status enums such
-- as 'removed_by_prayer_owner' / 'deleted_by_author' / 'removed_by_moderator',
-- extend the existing status CHECK constraint deliberately in a separate,
-- reviewed migration. This file intentionally avoids touching that constraint.

BEGIN;

ALTER TABLE public.prayer_video_responses
  ADD COLUMN IF NOT EXISTS removed_at timestamptz,
  ADD COLUMN IF NOT EXISTS removed_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS removal_source text,
  ADD COLUMN IF NOT EXISTS removal_reason text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Constrain removal_source to the known set when present.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'prayer_video_responses_removal_source_check'
  ) THEN
    ALTER TABLE public.prayer_video_responses
      ADD CONSTRAINT prayer_video_responses_removal_source_check
      CHECK (
        removal_source IS NULL
        OR removal_source IN (
          'prayer_owner',
          'response_author',
          'moderator',
          'administrator'
        )
      );
  END IF;
END;
$$;

-- Keep updated_at fresh on any change.
CREATE OR REPLACE FUNCTION public.touch_prayer_video_responses_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prayer_video_responses_touch_updated_at
  ON public.prayer_video_responses;
CREATE TRIGGER prayer_video_responses_touch_updated_at
  BEFORE UPDATE ON public.prayer_video_responses
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_prayer_video_responses_updated_at();

-- Index to quickly find a story's still-public responses.
CREATE INDEX IF NOT EXISTS prayer_video_responses_public_idx
  ON public.prayer_video_responses (story_id)
  WHERE status = 'approved' AND removed_at IS NULL;

COMMIT;
