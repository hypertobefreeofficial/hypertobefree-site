-- HTBF Prayer — server-backed hide persistence + content_reports hardening
-- Additive + idempotent. Safe to run more than once.
--
-- Context:
--   Save reuses existing `saved_content` (pre-existing, app-wide).
--   Follow uses `prayer_follows` (20260712 migration).
--   Hide moves from localStorage to `prayer_hidden_stories` here.
--
-- Apply manually in Supabase SQL editor (dev/staging first):
--   \i supabase/migrations/20260715_prayer_interaction_persistence.sql

BEGIN;

-- ============================================================
-- 1) Private per-user hidden prayers
-- ============================================================

CREATE TABLE IF NOT EXISTS public.prayer_hidden_stories (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  story_id uuid NOT NULL REFERENCES public.stories (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, story_id)
);

CREATE INDEX IF NOT EXISTS prayer_hidden_stories_user_id_idx
  ON public.prayer_hidden_stories (user_id, created_at DESC);

ALTER TABLE public.prayer_hidden_stories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prayer_hidden_stories_select_own"
  ON public.prayer_hidden_stories;
CREATE POLICY "prayer_hidden_stories_select_own"
  ON public.prayer_hidden_stories
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "prayer_hidden_stories_insert_own"
  ON public.prayer_hidden_stories;
CREATE POLICY "prayer_hidden_stories_insert_own"
  ON public.prayer_hidden_stories
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND EXISTS (
      SELECT 1
      FROM public.stories s
      WHERE s.id = story_id
        AND s.status = 'approved'
        AND s.removed_at IS NULL
        AND lower(coalesce(s.story_type, '')) LIKE '%prayer%'
    )
  );

DROP POLICY IF EXISTS "prayer_hidden_stories_delete_own"
  ON public.prayer_hidden_stories;
CREATE POLICY "prayer_hidden_stories_delete_own"
  ON public.prayer_hidden_stories
  FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE public.prayer_hidden_stories FROM anon, authenticated;
GRANT SELECT, DELETE ON TABLE public.prayer_hidden_stories TO authenticated;
GRANT INSERT (user_id, story_id)
  ON TABLE public.prayer_hidden_stories
  TO authenticated;

-- ============================================================
-- 2) Optional content_reports snapshot columns + RLS hardening
--    (only when the shared moderation table already exists)
-- ============================================================

DO $$
BEGIN
  IF to_regclass('public.content_reports') IS NOT NULL THEN
    ALTER TABLE public.content_reports
      ADD COLUMN IF NOT EXISTS content_type text,
      ADD COLUMN IF NOT EXISTS content_snapshot text,
      ADD COLUMN IF NOT EXISTS media_reference text;

    -- Reporters may insert only their own rows; cannot read others' reports.
    ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "content_reports_insert_own" ON public.content_reports;
    CREATE POLICY "content_reports_insert_own"
      ON public.content_reports
      FOR INSERT
      TO authenticated
      WITH CHECK ((SELECT auth.uid()) = reporter_user_id);

    DROP POLICY IF EXISTS "content_reports_select_own" ON public.content_reports;
    CREATE POLICY "content_reports_select_own"
      ON public.content_reports
      FOR SELECT
      TO authenticated
      USING ((SELECT auth.uid()) = reporter_user_id);

    -- Prevent ordinary users from updating moderation fields.
    DROP POLICY IF EXISTS "content_reports_no_user_update" ON public.content_reports;
    CREATE POLICY "content_reports_no_user_update"
      ON public.content_reports
      FOR UPDATE
      TO authenticated
      USING (false);

    DROP POLICY IF EXISTS "content_reports_no_user_delete" ON public.content_reports;
    CREATE POLICY "content_reports_no_user_delete"
      ON public.content_reports
      FOR DELETE
      TO authenticated
      USING (false);
  END IF;
END;
$$;

COMMIT;
