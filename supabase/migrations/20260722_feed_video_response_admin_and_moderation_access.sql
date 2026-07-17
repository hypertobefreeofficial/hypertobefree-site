-- HTBF Feed public video responses — admin moderation read access
-- Additive + idempotent. Apply manually in Supabase SQL editor.

BEGIN;

ALTER TABLE public.prayer_video_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prayer_video_responses_select_admin"
  ON public.prayer_video_responses;
CREATE POLICY "prayer_video_responses_select_admin"
  ON public.prayer_video_responses
  FOR SELECT
  TO authenticated
  USING (public.current_user_is_admin() = true);

DROP POLICY IF EXISTS "prayer_video_responses_select_own"
  ON public.prayer_video_responses;
CREATE POLICY "prayer_video_responses_select_own"
  ON public.prayer_video_responses
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

COMMIT;
