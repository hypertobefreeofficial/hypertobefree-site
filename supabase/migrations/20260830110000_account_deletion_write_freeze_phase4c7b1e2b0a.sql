-- Phase 4C.7B.1E.2B.0A: Account deletion write-freeze database foundation
-- Local migration only — review and manually apply to Production via Supabase SQL Editor.
--
-- Architecture:
--   The sole authoritative write-freeze signal is
--   account_deletion_requests.status = 'deletion_in_progress'.
--   No duplicate freeze state on profiles or elsewhere.
--
--   Once an admin execution lock transitions approved → deletion_in_progress,
--   the target user must be fail-closed from normal HTBF mutations through:
--     - RESTRICTIVE RLS (INSERT/UPDATE/DELETE only; reads unchanged)
--     - user-callable SECURITY DEFINER mutation RPC guards
--     - storage.objects authenticated mutation guards
--
-- Scope:
--   NO account deletion, NO auth deletion, NO session revocation, NO profile deletion,
--   NO storage object deletion, NO application data DELETE/TRUNCATE.
--
-- Rollout:
--   1) Apply after Phase 1B lifecycle (20260829190000) and Phase 1E.2A hardening (20260830100000).
--   2) Execution remains disabled in application code until later phases.
--   3) Service-role API actor checks are Phase 1E.2B.0B.

BEGIN;

-- ---------------------------------------------------------------------------
-- A) Write-freeze helper
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_user_account_write_blocked()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.account_deletion_requests AS request_row
      WHERE request_row.status = 'deletion_in_progress'::text
        AND (
          request_row.user_id = auth.uid()
          OR (
            request_row.user_id IS NULL
            AND request_row.target_user_id_snapshot = auth.uid()
          )
        )
    );
$$;

ALTER FUNCTION public.current_user_account_write_blocked() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.current_user_account_write_blocked() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_account_write_blocked() TO authenticated;

COMMENT ON FUNCTION public.current_user_account_write_blocked() IS
  'Returns true when auth.uid() has any account_deletion_requests row in deletion_in_progress. '
  'Matches user_id while populated; after auth deletion sets user_id NULL, matches target_user_id_snapshot. '
  'Used by RESTRICTIVE RLS and user-callable SECURITY DEFINER mutation RPCs. Read-only; does not mutate freeze state.';

-- ---------------------------------------------------------------------------
-- B) Partial indexes for deletion_in_progress lookup
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS account_deletion_requests_write_block_user_id_idx
  ON public.account_deletion_requests (user_id)
  WHERE status = 'deletion_in_progress'::text;

CREATE INDEX IF NOT EXISTS account_deletion_requests_write_block_target_snapshot_idx
  ON public.account_deletion_requests (target_user_id_snapshot)
  WHERE status = 'deletion_in_progress'::text
    AND target_user_id_snapshot IS NOT NULL;

-- ---------------------------------------------------------------------------
-- C) Harden ordinary-user account_deletion_requests submission
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can create their own deletion request"
  ON public.account_deletion_requests;

CREATE POLICY "Users can create their own deletion request"
  ON public.account_deletion_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND status = 'submitted'::text
  );

CREATE OR REPLACE FUNCTION public.enforce_account_deletion_request_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.current_user_is_admin() = true THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'account_deletion_requests must be created for the authenticated user'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.status IS DISTINCT FROM 'submitted'::text THEN
      RAISE EXCEPTION 'account_deletion_requests must be created with status submitted'
        USING ERRCODE = '42501';
    END IF;

    -- Never trust client-supplied identity snapshots on ordinary-user submission.
    -- target_username_snapshot is audit/display only and does not affect write-freeze
    -- or execution target resolution (resolveDeletionRequestTargetUserId uses UUID fields).
    NEW.target_user_id_snapshot := auth.uid();
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.enforce_account_deletion_request_submission() OWNER TO postgres;

DROP TRIGGER IF EXISTS account_deletion_requests_submission_guard
  ON public.account_deletion_requests;

CREATE TRIGGER account_deletion_requests_submission_guard
  BEFORE INSERT ON public.account_deletion_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_account_deletion_request_submission();

-- ---------------------------------------------------------------------------
-- D) RESTRICTIVE write-freeze RLS (mutations only — reads unchanged)
--     DROP IF EXISTS supports safe manual re-apply via SQL Editor.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS account_deletion_write_block ON public.stories;
DROP POLICY IF EXISTS account_deletion_write_block_insert ON public.stories;
DROP POLICY IF EXISTS account_deletion_write_block_update ON public.stories;
DROP POLICY IF EXISTS account_deletion_write_block_delete ON public.stories;

CREATE POLICY account_deletion_write_block_insert
  ON public.stories
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (NOT public.current_user_account_write_blocked());

CREATE POLICY account_deletion_write_block_update
  ON public.stories
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (NOT public.current_user_account_write_blocked())
  WITH CHECK (NOT public.current_user_account_write_blocked());

CREATE POLICY account_deletion_write_block_delete
  ON public.stories
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (NOT public.current_user_account_write_blocked());

DROP POLICY IF EXISTS account_deletion_write_block ON public.profiles;
DROP POLICY IF EXISTS account_deletion_write_block_insert ON public.profiles;
DROP POLICY IF EXISTS account_deletion_write_block_update ON public.profiles;
DROP POLICY IF EXISTS account_deletion_write_block_delete ON public.profiles;

CREATE POLICY account_deletion_write_block_insert
  ON public.profiles
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (NOT public.current_user_account_write_blocked());

CREATE POLICY account_deletion_write_block_update
  ON public.profiles
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (NOT public.current_user_account_write_blocked())
  WITH CHECK (NOT public.current_user_account_write_blocked());

CREATE POLICY account_deletion_write_block_delete
  ON public.profiles
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (NOT public.current_user_account_write_blocked());

DROP POLICY IF EXISTS account_deletion_write_block ON public.prayer_written_responses;
DROP POLICY IF EXISTS account_deletion_write_block_insert ON public.prayer_written_responses;
DROP POLICY IF EXISTS account_deletion_write_block_update ON public.prayer_written_responses;
DROP POLICY IF EXISTS account_deletion_write_block_delete ON public.prayer_written_responses;

CREATE POLICY account_deletion_write_block_insert
  ON public.prayer_written_responses
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (NOT public.current_user_account_write_blocked());

CREATE POLICY account_deletion_write_block_update
  ON public.prayer_written_responses
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (NOT public.current_user_account_write_blocked())
  WITH CHECK (NOT public.current_user_account_write_blocked());

CREATE POLICY account_deletion_write_block_delete
  ON public.prayer_written_responses
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (NOT public.current_user_account_write_blocked());

DROP POLICY IF EXISTS account_deletion_write_block ON public.prayer_updates;
DROP POLICY IF EXISTS account_deletion_write_block_insert ON public.prayer_updates;
DROP POLICY IF EXISTS account_deletion_write_block_update ON public.prayer_updates;
DROP POLICY IF EXISTS account_deletion_write_block_delete ON public.prayer_updates;

CREATE POLICY account_deletion_write_block_insert
  ON public.prayer_updates
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (NOT public.current_user_account_write_blocked());

CREATE POLICY account_deletion_write_block_update
  ON public.prayer_updates
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (NOT public.current_user_account_write_blocked())
  WITH CHECK (NOT public.current_user_account_write_blocked());

CREATE POLICY account_deletion_write_block_delete
  ON public.prayer_updates
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (NOT public.current_user_account_write_blocked());

DROP POLICY IF EXISTS account_deletion_write_block ON public.inbox_messages;
DROP POLICY IF EXISTS account_deletion_write_block_insert ON public.inbox_messages;
DROP POLICY IF EXISTS account_deletion_write_block_update ON public.inbox_messages;
DROP POLICY IF EXISTS account_deletion_write_block_delete ON public.inbox_messages;

CREATE POLICY account_deletion_write_block_insert
  ON public.inbox_messages
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (NOT public.current_user_account_write_blocked());

CREATE POLICY account_deletion_write_block_update
  ON public.inbox_messages
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (NOT public.current_user_account_write_blocked())
  WITH CHECK (NOT public.current_user_account_write_blocked());

CREATE POLICY account_deletion_write_block_delete
  ON public.inbox_messages
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (NOT public.current_user_account_write_blocked());

DROP POLICY IF EXISTS account_deletion_write_block ON public.story_reactions;
DROP POLICY IF EXISTS account_deletion_write_block_insert ON public.story_reactions;
DROP POLICY IF EXISTS account_deletion_write_block_update ON public.story_reactions;
DROP POLICY IF EXISTS account_deletion_write_block_delete ON public.story_reactions;

CREATE POLICY account_deletion_write_block_insert
  ON public.story_reactions
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (NOT public.current_user_account_write_blocked());

CREATE POLICY account_deletion_write_block_update
  ON public.story_reactions
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (NOT public.current_user_account_write_blocked())
  WITH CHECK (NOT public.current_user_account_write_blocked());

CREATE POLICY account_deletion_write_block_delete
  ON public.story_reactions
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (NOT public.current_user_account_write_blocked());

DROP POLICY IF EXISTS account_deletion_write_block ON public.story_video_replies;
DROP POLICY IF EXISTS account_deletion_write_block_insert ON public.story_video_replies;
DROP POLICY IF EXISTS account_deletion_write_block_update ON public.story_video_replies;
DROP POLICY IF EXISTS account_deletion_write_block_delete ON public.story_video_replies;

CREATE POLICY account_deletion_write_block_insert
  ON public.story_video_replies
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (NOT public.current_user_account_write_blocked());

CREATE POLICY account_deletion_write_block_update
  ON public.story_video_replies
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (NOT public.current_user_account_write_blocked())
  WITH CHECK (NOT public.current_user_account_write_blocked());

CREATE POLICY account_deletion_write_block_delete
  ON public.story_video_replies
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (NOT public.current_user_account_write_blocked());

DROP POLICY IF EXISTS account_deletion_write_block ON public.saved_content;
DROP POLICY IF EXISTS account_deletion_write_block_insert ON public.saved_content;
DROP POLICY IF EXISTS account_deletion_write_block_update ON public.saved_content;
DROP POLICY IF EXISTS account_deletion_write_block_delete ON public.saved_content;

CREATE POLICY account_deletion_write_block_insert
  ON public.saved_content
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (NOT public.current_user_account_write_blocked());

CREATE POLICY account_deletion_write_block_update
  ON public.saved_content
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (NOT public.current_user_account_write_blocked())
  WITH CHECK (NOT public.current_user_account_write_blocked());

CREATE POLICY account_deletion_write_block_delete
  ON public.saved_content
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (NOT public.current_user_account_write_blocked());

DROP POLICY IF EXISTS account_deletion_write_block ON public.prayer_follows;
DROP POLICY IF EXISTS account_deletion_write_block_insert ON public.prayer_follows;
DROP POLICY IF EXISTS account_deletion_write_block_update ON public.prayer_follows;
DROP POLICY IF EXISTS account_deletion_write_block_delete ON public.prayer_follows;

CREATE POLICY account_deletion_write_block_insert
  ON public.prayer_follows
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (NOT public.current_user_account_write_blocked());

CREATE POLICY account_deletion_write_block_update
  ON public.prayer_follows
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (NOT public.current_user_account_write_blocked())
  WITH CHECK (NOT public.current_user_account_write_blocked());

CREATE POLICY account_deletion_write_block_delete
  ON public.prayer_follows
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (NOT public.current_user_account_write_blocked());

DROP POLICY IF EXISTS account_deletion_write_block ON public.prayer_search_preferences;
DROP POLICY IF EXISTS account_deletion_write_block_insert ON public.prayer_search_preferences;
DROP POLICY IF EXISTS account_deletion_write_block_update ON public.prayer_search_preferences;
DROP POLICY IF EXISTS account_deletion_write_block_delete ON public.prayer_search_preferences;

CREATE POLICY account_deletion_write_block_insert
  ON public.prayer_search_preferences
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (NOT public.current_user_account_write_blocked());

CREATE POLICY account_deletion_write_block_update
  ON public.prayer_search_preferences
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (NOT public.current_user_account_write_blocked())
  WITH CHECK (NOT public.current_user_account_write_blocked());

CREATE POLICY account_deletion_write_block_delete
  ON public.prayer_search_preferences
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (NOT public.current_user_account_write_blocked());

DROP POLICY IF EXISTS account_deletion_write_block ON public.blocked_users;
DROP POLICY IF EXISTS account_deletion_write_block_insert ON public.blocked_users;
DROP POLICY IF EXISTS account_deletion_write_block_update ON public.blocked_users;
DROP POLICY IF EXISTS account_deletion_write_block_delete ON public.blocked_users;

CREATE POLICY account_deletion_write_block_insert
  ON public.blocked_users
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (NOT public.current_user_account_write_blocked());

CREATE POLICY account_deletion_write_block_update
  ON public.blocked_users
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (NOT public.current_user_account_write_blocked())
  WITH CHECK (NOT public.current_user_account_write_blocked());

CREATE POLICY account_deletion_write_block_delete
  ON public.blocked_users
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (NOT public.current_user_account_write_blocked());

DROP POLICY IF EXISTS account_deletion_write_block ON public.content_reports;
DROP POLICY IF EXISTS account_deletion_write_block_insert ON public.content_reports;
DROP POLICY IF EXISTS account_deletion_write_block_update ON public.content_reports;
DROP POLICY IF EXISTS account_deletion_write_block_delete ON public.content_reports;

CREATE POLICY account_deletion_write_block_insert
  ON public.content_reports
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (NOT public.current_user_account_write_blocked());

CREATE POLICY account_deletion_write_block_update
  ON public.content_reports
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (NOT public.current_user_account_write_blocked())
  WITH CHECK (NOT public.current_user_account_write_blocked());

CREATE POLICY account_deletion_write_block_delete
  ON public.content_reports
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (NOT public.current_user_account_write_blocked());

DROP POLICY IF EXISTS account_deletion_write_block ON public.account_deletion_requests;
DROP POLICY IF EXISTS account_deletion_write_block_insert ON public.account_deletion_requests;
DROP POLICY IF EXISTS account_deletion_write_block_update ON public.account_deletion_requests;
DROP POLICY IF EXISTS account_deletion_write_block_delete ON public.account_deletion_requests;

CREATE POLICY account_deletion_write_block_insert
  ON public.account_deletion_requests
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (NOT public.current_user_account_write_blocked());

CREATE POLICY account_deletion_write_block_update
  ON public.account_deletion_requests
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (NOT public.current_user_account_write_blocked())
  WITH CHECK (NOT public.current_user_account_write_blocked());

CREATE POLICY account_deletion_write_block_delete
  ON public.account_deletion_requests
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (NOT public.current_user_account_write_blocked());

DROP POLICY IF EXISTS account_deletion_write_block ON public.prayer_video_responses;
DROP POLICY IF EXISTS account_deletion_write_block_insert ON public.prayer_video_responses;
DROP POLICY IF EXISTS account_deletion_write_block_update ON public.prayer_video_responses;
DROP POLICY IF EXISTS account_deletion_write_block_delete ON public.prayer_video_responses;

CREATE POLICY account_deletion_write_block_insert
  ON public.prayer_video_responses
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (NOT public.current_user_account_write_blocked());

CREATE POLICY account_deletion_write_block_update
  ON public.prayer_video_responses
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (NOT public.current_user_account_write_blocked())
  WITH CHECK (NOT public.current_user_account_write_blocked());

CREATE POLICY account_deletion_write_block_delete
  ON public.prayer_video_responses
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (NOT public.current_user_account_write_blocked());

-- ---------------------------------------------------------------------------
-- E) Storage authenticated mutation write-freeze
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS account_deletion_storage_write_block ON storage.objects;
DROP POLICY IF EXISTS account_deletion_storage_write_block_insert ON storage.objects;
DROP POLICY IF EXISTS account_deletion_storage_write_block_update ON storage.objects;
DROP POLICY IF EXISTS account_deletion_storage_write_block_delete ON storage.objects;

CREATE POLICY account_deletion_storage_write_block_insert
  ON storage.objects
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (NOT public.current_user_account_write_blocked());

CREATE POLICY account_deletion_storage_write_block_update
  ON storage.objects
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (NOT public.current_user_account_write_blocked())
  WITH CHECK (NOT public.current_user_account_write_blocked());

CREATE POLICY account_deletion_storage_write_block_delete
  ON storage.objects
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (NOT public.current_user_account_write_blocked());

-- ---------------------------------------------------------------------------
-- F) Patch user-callable SECURITY DEFINER mutation helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.edit_my_story(story_id uuid, new_story_text text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.current_user_account_write_blocked() THEN
    RAISE EXCEPTION 'Account deletion in progress; writes are temporarily blocked'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.stories
  SET
    story_text = nullif(trim(new_story_text), ''),
    edited_at = now()
  WHERE id = story_id
    AND user_id = auth.uid()
    AND status IN ('pending', 'submitted', 'approved');
END;
$$;

ALTER FUNCTION public.edit_my_story(uuid, text) OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.remove_my_story(story_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.current_user_account_write_blocked() THEN
    RAISE EXCEPTION 'Account deletion in progress; writes are temporarily blocked'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.stories
  SET
    status = 'removed',
    removed_at = now(),
    removed_by = auth.uid()
  WHERE id = story_id
    AND user_id = auth.uid();
END;
$$;

ALTER FUNCTION public.remove_my_story(uuid) OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.remove_my_video_story(story_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.current_user_account_write_blocked() THEN
    RAISE EXCEPTION 'Account deletion in progress; writes are temporarily blocked'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.stories
  SET
    status = 'removed',
    removed_at = now(),
    removed_by = auth.uid()
  WHERE id = story_id
    AND user_id = auth.uid()
    AND video_url IS NOT NULL;
END;
$$;

ALTER FUNCTION public.remove_my_video_story(uuid) OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.remove_my_prayer_video_response(response_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.current_user_account_write_blocked() THEN
    RAISE EXCEPTION 'Account deletion in progress; writes are temporarily blocked'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.prayer_video_responses
  SET
    status = 'removed',
    removed_at = now()
  WHERE id = response_id
    AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prayer video response not found or not owned by user';
  END IF;
END;
$$;

ALTER FUNCTION public.remove_my_prayer_video_response(uuid) OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.hide_prayer_video_response(response_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.current_user_account_write_blocked() THEN
    RAISE EXCEPTION 'Account deletion in progress; writes are temporarily blocked'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.prayer_video_responses AS response
  SET hidden_at = now()
  WHERE response.id = response_id
    AND EXISTS (
      SELECT 1
      FROM public.stories
      WHERE stories.id = response.story_id
        AND stories.user_id = auth.uid()
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prayer video response not found or prayer not owned by user';
  END IF;
END;
$$;

ALTER FUNCTION public.hide_prayer_video_response(uuid) OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.submit_prayer_video_response(
  prayer_story_id uuid,
  response_video_url text,
  response_body text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security TO 'off'
AS $$
DECLARE
  current_user_id uuid;
  clean_video_url text;
  parent_status text;
  parent_story_type text;
  parent_user_id uuid;
  inserted_response_id uuid;
BEGIN
  current_user_id := auth.uid();
  clean_video_url := nullif(btrim(response_video_url), '');

  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF public.current_user_account_write_blocked() THEN
    RAISE EXCEPTION 'Account deletion in progress; writes are temporarily blocked'
      USING ERRCODE = '42501';
  END IF;

  IF clean_video_url IS NULL THEN
    RAISE EXCEPTION 'Response video URL is required'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    stories.status,
    stories.story_type,
    stories.user_id
  INTO
    parent_status,
    parent_story_type,
    parent_user_id
  FROM public.stories
  WHERE stories.id = prayer_story_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prayer story not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF parent_status IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'Prayer story must be approved'
      USING ERRCODE = '22023';
  END IF;

  IF lower(coalesce(parent_story_type, '')) NOT LIKE '%prayer%' THEN
    RAISE EXCEPTION 'Story is not a prayer request'
      USING ERRCODE = '22023';
  END IF;

  IF parent_user_id IS NOT DISTINCT FROM current_user_id THEN
    RAISE EXCEPTION 'Users cannot respond to their own prayer request'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.prayer_video_responses (
    story_id,
    user_id,
    video_url,
    body,
    status
  )
  VALUES (
    prayer_story_id,
    current_user_id,
    clean_video_url,
    nullif(btrim(response_body), ''),
    'submitted'
  )
  RETURNING id INTO inserted_response_id;

  RETURN inserted_response_id;
END;
$$;

ALTER FUNCTION public.submit_prayer_video_response(uuid, text, text) OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.can_insert_inbox_message(
  p_user_id uuid,
  p_sender_user_id uuid,
  p_parent_message_id uuid,
  p_story_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN public.current_user_is_admin() = true THEN true
    WHEN public.current_user_account_write_blocked() = true THEN false
    WHEN p_sender_user_id IS DISTINCT FROM auth.uid() THEN false
    WHEN p_user_id = auth.uid() THEN true
    WHEN p_parent_message_id IS NOT NULL THEN EXISTS (
      SELECT 1
      FROM public.inbox_messages AS parent
      WHERE parent.id = p_parent_message_id
        AND (
          (parent.user_id = auth.uid() AND parent.sender_user_id = p_user_id)
          OR (parent.sender_user_id = auth.uid() AND parent.user_id = p_user_id)
        )
    )
    WHEN p_story_id IS NOT NULL THEN EXISTS (
      SELECT 1
      FROM public.stories AS story
      WHERE story.id = p_story_id
        AND story.user_id = p_user_id
    )
    ELSE false
  END;
$$;

ALTER FUNCTION public.can_insert_inbox_message(uuid, uuid, uuid, uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.can_insert_inbox_message(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_insert_inbox_message(uuid, uuid, uuid, uuid) TO authenticated;

-- mark_my_prayer_answered is archived / not in production baseline — intentionally omitted.

-- ---------------------------------------------------------------------------
-- G) Live catalog schema-readiness probe (NOT schema_migrations)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.verify_account_deletion_schema_execution_ready()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  prerequisites jsonb := '[]'::jsonb;
  all_ready boolean := true;
  write_block_tables text[] := ARRAY[
    'stories',
    'profiles',
    'prayer_written_responses',
    'prayer_updates',
    'inbox_messages',
    'story_reactions',
    'story_video_replies',
    'saved_content',
    'prayer_follows',
    'prayer_search_preferences',
    'blocked_users',
    'content_reports',
    'account_deletion_requests',
    'prayer_video_responses'
  ];
  table_name text;
  policy_key text;
  check_ok boolean;
  missing_rls_policies text[] := ARRAY[]::text[];
  missing_rls_expression_policies text[] := ARRAY[]::text[];
BEGIN
  -- 1) stories.user_id nullable
  check_ok := coalesce((
    SELECT c.is_nullable = 'YES'
    FROM information_schema.columns AS c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'stories'
      AND c.column_name = 'user_id'
  ), false);
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'stories_user_id_nullable',
    'satisfied', check_ok,
    'detail', CASE
      WHEN check_ok THEN 'stories.user_id is nullable'
      ELSE 'stories.user_id must be nullable'
    END
  ));
  all_ready := all_ready AND check_ok;

  -- 1b) stories.user_id must not reference auth.users
  check_ok := NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS con
    JOIN pg_catalog.pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'stories'
      AND con.contype = 'f'
      AND pg_catalog.pg_get_constraintdef(con.oid) LIKE '%FOREIGN KEY (user_id)%auth.users%'
  );
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'stories_user_id_no_auth_fk',
    'satisfied', check_ok,
    'detail', CASE
      WHEN check_ok THEN 'stories.user_id has no auth.users FK'
      ELSE 'stories.user_id must not reference auth.users'
    END
  ));
  all_ready := all_ready AND check_ok;

  -- 2) prayer_video_responses.user_id nullable + SET NULL FK
  check_ok := coalesce((
    SELECT c.is_nullable = 'YES'
    FROM information_schema.columns AS c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'prayer_video_responses'
      AND c.column_name = 'user_id'
  ), false) AND EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS con
    JOIN pg_catalog.pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'prayer_video_responses'
      AND con.conname = 'prayer_video_responses_user_id_fkey'
      AND con.confdeltype = 'n'
  );
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'prayer_video_responses_user_id_set_null',
    'satisfied', check_ok,
    'detail', 'prayer_video_responses.user_id nullable with ON DELETE SET NULL FK'
  ));
  all_ready := all_ready AND check_ok;

  -- 3) prayer_written_responses.author_user_id nullable + SET NULL FK
  check_ok := coalesce((
    SELECT c.is_nullable = 'YES'
    FROM information_schema.columns AS c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'prayer_written_responses'
      AND c.column_name = 'author_user_id'
  ), false) AND EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS con
    JOIN pg_catalog.pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'prayer_written_responses'
      AND con.conname = 'prayer_written_responses_author_user_id_fkey'
      AND con.confdeltype = 'n'
  );
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'prayer_written_responses_author_set_null',
    'satisfied', check_ok,
    'detail', 'prayer_written_responses.author_user_id nullable with ON DELETE SET NULL FK'
  ));
  all_ready := all_ready AND check_ok;

  -- 4) prayer_updates.author_user_id nullable + SET NULL FK
  check_ok := coalesce((
    SELECT c.is_nullable = 'YES'
    FROM information_schema.columns AS c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'prayer_updates'
      AND c.column_name = 'author_user_id'
  ), false) AND EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS con
    JOIN pg_catalog.pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'prayer_updates'
      AND con.conname = 'prayer_updates_author_user_id_fkey'
      AND con.confdeltype = 'n'
  );
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'prayer_updates_author_set_null',
    'satisfied', check_ok,
    'detail', 'prayer_updates.author_user_id nullable with ON DELETE SET NULL FK'
  ));
  all_ready := all_ready AND check_ok;

  -- 5) inbox_messages.prayer_update_id SET NULL FK
  check_ok := EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS con
    JOIN pg_catalog.pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'inbox_messages'
      AND con.conname = 'inbox_messages_prayer_update_id_fkey'
      AND con.confdeltype = 'n'
  );
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'inbox_messages_prayer_update_id_set_null',
    'satisfied', check_ok,
    'detail', 'inbox_messages.prayer_update_id FK uses ON DELETE SET NULL'
  ));
  all_ready := all_ready AND check_ok;

  -- 6) content_reports.story_id SET NULL FK
  check_ok := EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS con
    JOIN pg_catalog.pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'content_reports'
      AND con.conname = 'content_reports_story_id_fkey'
      AND con.confdeltype = 'n'
  );
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'content_reports_story_id_set_null',
    'satisfied', check_ok,
    'detail', 'content_reports.story_id FK uses ON DELETE SET NULL'
  ));
  all_ready := all_ready AND check_ok;

  -- 7) write-freeze helper exists with expected security properties
  check_ok := EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS proc
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = proc.pronamespace
    WHERE nsp.nspname = 'public'
      AND proc.proname = 'current_user_account_write_blocked'
      AND pg_catalog.pg_get_function_identity_arguments(proc.oid) = ''
      AND pg_catalog.format_type(proc.prorettype, NULL) = 'boolean'
      AND proc.prosecdef = true
      AND proc.provolatile = 's'
      AND EXISTS (
        SELECT 1
        FROM unnest(coalesce(proc.proconfig, ARRAY[]::text[])) AS cfg
        WHERE cfg LIKE 'search_path=%'
      )
  );
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'current_user_account_write_blocked_present',
    'satisfied', check_ok,
    'detail', 'public.current_user_account_write_blocked() exists as STABLE SECURITY DEFINER boolean helper with search_path set'
  ));
  all_ready := all_ready AND check_ok;

  -- 8) RESTRICTIVE command-specific write-freeze RLS on required public tables
  FOREACH table_name IN ARRAY write_block_tables
  LOOP
    policy_key := table_name || ':insert';
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policies AS pol
      WHERE pol.schemaname = 'public'
        AND pol.tablename = table_name
        AND pol.policyname = 'account_deletion_write_block_insert'
        AND pol.permissive = 'RESTRICTIVE'
        AND pol.cmd = 'INSERT'
    ) THEN
      missing_rls_policies := array_append(missing_rls_policies, policy_key);
    ELSIF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policies AS pol
      WHERE pol.schemaname = 'public'
        AND pol.tablename = table_name
        AND pol.policyname = 'account_deletion_write_block_insert'
        AND pol.permissive = 'RESTRICTIVE'
        AND pol.cmd = 'INSERT'
        AND coalesce(pol.with_check, '') ILIKE '%current_user_account_write_blocked%'
    ) THEN
      missing_rls_expression_policies := array_append(missing_rls_expression_policies, policy_key);
    END IF;

    policy_key := table_name || ':update';
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policies AS pol
      WHERE pol.schemaname = 'public'
        AND pol.tablename = table_name
        AND pol.policyname = 'account_deletion_write_block_update'
        AND pol.permissive = 'RESTRICTIVE'
        AND pol.cmd = 'UPDATE'
    ) THEN
      missing_rls_policies := array_append(missing_rls_policies, policy_key);
    ELSIF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policies AS pol
      WHERE pol.schemaname = 'public'
        AND pol.tablename = table_name
        AND pol.policyname = 'account_deletion_write_block_update'
        AND pol.permissive = 'RESTRICTIVE'
        AND pol.cmd = 'UPDATE'
        AND coalesce(pol.qual, '') ILIKE '%current_user_account_write_blocked%'
        AND coalesce(pol.with_check, '') ILIKE '%current_user_account_write_blocked%'
    ) THEN
      missing_rls_expression_policies := array_append(missing_rls_expression_policies, policy_key);
    END IF;

    policy_key := table_name || ':delete';
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policies AS pol
      WHERE pol.schemaname = 'public'
        AND pol.tablename = table_name
        AND pol.policyname = 'account_deletion_write_block_delete'
        AND pol.permissive = 'RESTRICTIVE'
        AND pol.cmd = 'DELETE'
    ) THEN
      missing_rls_policies := array_append(missing_rls_policies, policy_key);
    ELSIF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policies AS pol
      WHERE pol.schemaname = 'public'
        AND pol.tablename = table_name
        AND pol.policyname = 'account_deletion_write_block_delete'
        AND pol.permissive = 'RESTRICTIVE'
        AND pol.cmd = 'DELETE'
        AND coalesce(pol.qual, '') ILIKE '%current_user_account_write_blocked%'
    ) THEN
      missing_rls_expression_policies := array_append(missing_rls_expression_policies, policy_key);
    END IF;
  END LOOP;

  check_ok := cardinality(missing_rls_policies) = 0
    AND cardinality(missing_rls_expression_policies) = 0;
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'write_freeze_public_rls_present',
    'satisfied', check_ok,
    'detail', CASE
      WHEN check_ok THEN
        'RESTRICTIVE account_deletion_write_block_insert/update/delete policies reference current_user_account_write_blocked on required public tables'
      WHEN cardinality(missing_rls_policies) > 0 THEN
        'Missing write-freeze RLS policies: ' || array_to_string(missing_rls_policies, ', ')
      ELSE
        'Write-freeze RLS present but missing helper expression on: '
          || array_to_string(missing_rls_expression_policies, ', ')
    END
  ));
  all_ready := all_ready AND check_ok;

  -- 9) Storage command-specific write-freeze RLS with helper expression
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies AS pol
    WHERE pol.schemaname = 'storage'
      AND pol.tablename = 'objects'
      AND pol.policyname = 'account_deletion_storage_write_block_insert'
      AND pol.permissive = 'RESTRICTIVE'
      AND pol.cmd = 'INSERT'
  ) THEN
    missing_rls_policies := array_append(missing_rls_policies, 'storage.objects:insert');
  ELSIF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies AS pol
    WHERE pol.schemaname = 'storage'
      AND pol.tablename = 'objects'
      AND pol.policyname = 'account_deletion_storage_write_block_insert'
      AND pol.permissive = 'RESTRICTIVE'
      AND pol.cmd = 'INSERT'
      AND coalesce(pol.with_check, '') ILIKE '%current_user_account_write_blocked%'
  ) THEN
    missing_rls_expression_policies := array_append(
      missing_rls_expression_policies,
      'storage.objects:insert'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies AS pol
    WHERE pol.schemaname = 'storage'
      AND pol.tablename = 'objects'
      AND pol.policyname = 'account_deletion_storage_write_block_update'
      AND pol.permissive = 'RESTRICTIVE'
      AND pol.cmd = 'UPDATE'
  ) THEN
    missing_rls_policies := array_append(missing_rls_policies, 'storage.objects:update');
  ELSIF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies AS pol
    WHERE pol.schemaname = 'storage'
      AND pol.tablename = 'objects'
      AND pol.policyname = 'account_deletion_storage_write_block_update'
      AND pol.permissive = 'RESTRICTIVE'
      AND pol.cmd = 'UPDATE'
      AND coalesce(pol.qual, '') ILIKE '%current_user_account_write_blocked%'
      AND coalesce(pol.with_check, '') ILIKE '%current_user_account_write_blocked%'
  ) THEN
    missing_rls_expression_policies := array_append(
      missing_rls_expression_policies,
      'storage.objects:update'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies AS pol
    WHERE pol.schemaname = 'storage'
      AND pol.tablename = 'objects'
      AND pol.policyname = 'account_deletion_storage_write_block_delete'
      AND pol.permissive = 'RESTRICTIVE'
      AND pol.cmd = 'DELETE'
  ) THEN
    missing_rls_policies := array_append(missing_rls_policies, 'storage.objects:delete');
  ELSIF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies AS pol
    WHERE pol.schemaname = 'storage'
      AND pol.tablename = 'objects'
      AND pol.policyname = 'account_deletion_storage_write_block_delete'
      AND pol.permissive = 'RESTRICTIVE'
      AND pol.cmd = 'DELETE'
      AND coalesce(pol.qual, '') ILIKE '%current_user_account_write_blocked%'
  ) THEN
    missing_rls_expression_policies := array_append(
      missing_rls_expression_policies,
      'storage.objects:delete'
    );
  END IF;

  check_ok := NOT (
    'storage.objects:insert' = ANY(missing_rls_policies)
    OR 'storage.objects:update' = ANY(missing_rls_policies)
    OR 'storage.objects:delete' = ANY(missing_rls_policies)
    OR 'storage.objects:insert' = ANY(missing_rls_expression_policies)
    OR 'storage.objects:update' = ANY(missing_rls_expression_policies)
    OR 'storage.objects:delete' = ANY(missing_rls_expression_policies)
  );
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'write_freeze_storage_rls_present',
    'satisfied', check_ok,
    'detail', CASE
      WHEN check_ok THEN
        'RESTRICTIVE account_deletion_storage_write_block_insert/update/delete reference current_user_account_write_blocked on storage.objects'
      WHEN 'storage.objects:insert' = ANY(missing_rls_policies)
        OR 'storage.objects:update' = ANY(missing_rls_policies)
        OR 'storage.objects:delete' = ANY(missing_rls_policies) THEN
        'Missing write-freeze storage RLS policies on storage.objects'
      ELSE
        'Write-freeze storage RLS present but missing helper expression on storage.objects'
    END
  ));
  all_ready := all_ready AND check_ok;

  RETURN jsonb_build_object(
    'ready', all_ready,
    'checked_at', to_jsonb(now()),
    'prerequisites', prerequisites
  );
END;
$$;

ALTER FUNCTION public.verify_account_deletion_schema_execution_ready() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.verify_account_deletion_schema_execution_ready() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_account_deletion_schema_execution_ready() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.verify_account_deletion_schema_execution_ready() TO service_role;

COMMENT ON FUNCTION public.verify_account_deletion_schema_execution_ready() IS
  'Read-only live catalog probe for account-deletion schema + write-freeze foundation readiness. '
  'Does not consult supabase_migrations.schema_migrations. Fail-closed. '
  'EXECUTE restricted to service_role for server-side readiness verification only.';

COMMIT;
