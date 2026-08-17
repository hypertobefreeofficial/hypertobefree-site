-- HTBF Community Feed — feed encouragement reactions + approved response read access
-- Additive + idempotent. Apply manually in Supabase SQL editor (dev/staging first).

BEGIN;

-- ============================================================
-- 1) Feed encouragement toggles (amen / praise_god / encouraged)
-- ============================================================

ALTER TABLE public.story_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "story_reactions_select_public"
  ON public.story_reactions;
CREATE POLICY "story_reactions_select_public"
  ON public.story_reactions
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "story_reactions_insert_feed_encouragement_own"
  ON public.story_reactions;
CREATE POLICY "story_reactions_insert_feed_encouragement_own"
  ON public.story_reactions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND reaction_type IN ('amen', 'praise_god', 'encouraged')
    AND EXISTS (
      SELECT 1
      FROM public.stories s
      WHERE s.id = story_id
        AND s.status = 'approved'
        AND s.removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "story_reactions_delete_feed_encouragement_own"
  ON public.story_reactions;
CREATE POLICY "story_reactions_delete_feed_encouragement_own"
  ON public.story_reactions
  FOR DELETE
  TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    AND reaction_type IN ('amen', 'praise_god', 'encouraged')
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.story_reactions'::regclass
      AND conname = 'story_reactions_story_user_type_unique'
  ) THEN
    EXECUTE $sql$
      CREATE UNIQUE INDEX IF NOT EXISTS story_reactions_feed_encouragement_unique_idx
      ON public.story_reactions (story_id, user_id, reaction_type)
      WHERE reaction_type IN ('amen', 'praise_god', 'encouraged')
        AND user_id IS NOT NULL
    $sql$;
  END IF;
END $$;

GRANT SELECT ON TABLE public.story_reactions TO anon, authenticated;
GRANT INSERT (story_id, user_id, reaction_type)
  ON TABLE public.story_reactions
  TO authenticated;
GRANT DELETE ON TABLE public.story_reactions TO authenticated;

-- ============================================================
-- 2) Approved public video responses on eligible parent stories
-- ============================================================

ALTER TABLE public.prayer_video_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prayer_video_responses_select_approved_public"
  ON public.prayer_video_responses;
CREATE POLICY "prayer_video_responses_select_approved_public"
  ON public.prayer_video_responses
  FOR SELECT
  TO anon, authenticated
  USING (
    status = 'approved'
    AND removed_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.stories s
      WHERE s.id = prayer_video_responses.story_id
        AND s.status = 'approved'
        AND s.removed_at IS NULL
    )
  );

COMMIT;
