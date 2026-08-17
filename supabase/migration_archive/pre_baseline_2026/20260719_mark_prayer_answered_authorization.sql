-- HTBF Community Feed — authorized "God Did It" writes
-- Additive + idempotent. Apply manually in Supabase SQL editor (dev/staging first).
--
-- Owner-facing updates must use mark_my_prayer_answered().
-- Trusted backend updates may use service_role JWT or direct postgres sessions.

BEGIN;

CREATE OR REPLACE FUNCTION public.allow_prayer_answered_field_write()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT
    pg_catalog.coalesce(
      pg_catalog.current_setting('app.mark_prayer_answered', true),
      ''
    ) = '1'
    OR pg_catalog.coalesce(
      pg_catalog.current_setting('request.jwt.claim.role', true),
      ''
    ) = 'service_role'
    OR pg_catalog.session_user IN ('postgres', 'supabase_admin');
$$;

ALTER FUNCTION public.allow_prayer_answered_field_write() OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.mark_my_prayer_answered(
  p_story_id uuid,
  p_answered_text text
)
RETURNS public.stories
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_story public.stories;
  v_clean text := pg_catalog.btrim(pg_catalog.coalesce(p_answered_text, ''));
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF pg_catalog.char_length(v_clean) < 1
     OR pg_catalog.char_length(v_clean) > 2000 THEN
    RAISE EXCEPTION 'answered text must be between 1 and 2000 characters'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.set_config('app.mark_prayer_answered', '1', true);

  UPDATE public.stories AS s
  SET
    prayer_status = 'answered',
    answered_at = pg_catalog.now(),
    answered_text = v_clean
  WHERE s.id = p_story_id
    AND s.user_id = v_user_id
    AND pg_catalog.lower(pg_catalog.coalesce(s.status, '')) = 'approved'
    AND s.removed_at IS NULL
    AND pg_catalog.coalesce(s.prayer_status, 'active') = 'active'
    AND pg_catalog.lower(pg_catalog.coalesce(s.story_type, '')) LIKE '%prayer%'
  RETURNING * INTO v_story;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'could not mark this prayer answered'
      USING ERRCODE = '22023';
  END IF;

  RETURN v_story;
END;
$$;

ALTER FUNCTION public.mark_my_prayer_answered(uuid, text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.mark_my_prayer_answered(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_my_prayer_answered(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.mark_my_prayer_answered(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.protect_prayer_answered_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF (
    OLD.prayer_status IS DISTINCT FROM NEW.prayer_status
    OR OLD.answered_at IS DISTINCT FROM NEW.answered_at
    OR OLD.answered_text IS DISTINCT FROM NEW.answered_text
  )
  AND NOT public.allow_prayer_answered_field_write() THEN
    RAISE EXCEPTION 'prayer answered fields must be updated through mark_my_prayer_answered()'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.protect_prayer_answered_fields() OWNER TO postgres;

DROP TRIGGER IF EXISTS stories_protect_prayer_answered_fields ON public.stories;

CREATE TRIGGER stories_protect_prayer_answered_fields
  BEFORE UPDATE ON public.stories
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_prayer_answered_fields();

COMMIT;
