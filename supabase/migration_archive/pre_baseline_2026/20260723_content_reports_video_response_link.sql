-- HTBF Feed — link content_reports to public video responses (additive)
-- Safe to run more than once. Only applies when content_reports already exists.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.content_reports') IS NOT NULL THEN
    ALTER TABLE public.content_reports
      ADD COLUMN IF NOT EXISTS prayer_video_response_id uuid;

    IF to_regclass('public.prayer_video_responses') IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'content_reports_prayer_video_response_id_fkey'
      ) THEN
        ALTER TABLE public.content_reports
          ADD CONSTRAINT content_reports_prayer_video_response_id_fkey
          FOREIGN KEY (prayer_video_response_id)
          REFERENCES public.prayer_video_responses(id)
          ON DELETE SET NULL;
      END IF;
    END IF;

    CREATE INDEX IF NOT EXISTS idx_content_reports_prayer_video_response_id
      ON public.content_reports (prayer_video_response_id)
      WHERE prayer_video_response_id IS NOT NULL;
  END IF;
END;
$$;

COMMIT;
