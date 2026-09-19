-- Phase 4C.7B.1E.2C.3B.1 — Nondestructive database execution stage (disconnected RPC)
-- Schema/functions/readiness only. ZERO account/content DML on apply.
-- Does NOT invoke acquisition, executor, session revocation, or enable execution.

BEGIN;

-- ---------------------------------------------------------------------------
-- Preconditions (fail-closed — live catalog, not schema_migrations history)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.account_deletion_execution_attempts') IS NULL THEN
    RAISE EXCEPTION '2C.3B.1 precondition failed: account_deletion_execution_attempts missing';
  END IF;

  IF to_regclass('public.account_deletion_requests') IS NULL THEN
    RAISE EXCEPTION '2C.3B.1 precondition failed: account_deletion_requests missing';
  END IF;

  IF to_regprocedure('public.verify_account_deletion_schema_execution_ready()') IS NULL THEN
    RAISE EXCEPTION '2C.3B.1 precondition failed: verify_account_deletion_schema_execution_ready() missing';
  END IF;

  IF to_regprocedure('public.verify_account_deletion_acquisition_foundation_ready()') IS NULL THEN
    RAISE EXCEPTION '2C.3B.1 precondition failed: verify_account_deletion_acquisition_foundation_ready() missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_indexes AS idx
    WHERE idx.schemaname = 'public'
      AND idx.tablename = 'account_deletion_execution_attempts'
      AND idx.indexname = 'account_deletion_execution_attempts_one_active_per_request_idx'
  ) THEN
    RAISE EXCEPTION '2C.3B.1 precondition failed: one-active execution attempt index missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS trg
    JOIN pg_catalog.pg_class AS rel ON rel.oid = trg.tgrelid
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'account_deletion_execution_attempts'
      AND trg.tgname = 'account_deletion_execution_attempt_target_validation'
  ) THEN
    RAISE EXCEPTION '2C.3B.1 precondition failed: attempt target validation trigger missing';
  END IF;

  IF to_regprocedure('public.account_user_deletion_in_progress(uuid)') IS NULL THEN
    RAISE EXCEPTION '2C.3B.1 precondition failed: shared write-freeze foundation missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns AS c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'stories'
      AND c.column_name = 'user_id'
      AND c.is_nullable = 'YES'
  ) THEN
    RAISE EXCEPTION '2C.3B.1 precondition failed: stories.user_id must be nullable';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns AS c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'story_video_replies'
      AND c.column_name = 'deleted_by_sender'
  ) THEN
    RAISE EXCEPTION '2C.3B.1 precondition failed: story_video_replies.deleted_by_sender missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns AS c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'inbox_messages'
      AND c.column_name = 'sender_user_id'
  ) THEN
    RAISE EXCEPTION '2C.3B.1 precondition failed: inbox_messages.sender_user_id missing';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- A) Extend attempt stage CHECK — add database_completed
-- ---------------------------------------------------------------------------

ALTER TABLE public.account_deletion_execution_attempts
  DROP CONSTRAINT IF EXISTS account_deletion_execution_attempts_stage_check;

ALTER TABLE public.account_deletion_execution_attempts
  ADD CONSTRAINT account_deletion_execution_attempts_stage_check CHECK (
    stage = ANY (
      ARRAY[
        'preflight'::text,
        'lock_acquired'::text,
        'sessions_pending'::text,
        'sessions_revoked'::text,
        'inventory'::text,
        'database'::text,
        'database_completed'::text,
        'storage'::text,
        'profile'::text,
        'auth_pending'::text,
        'auth'::text,
        'finalize'::text,
        'completed'::text,
        'failed'::text,
        'blocked'::text
      ]
    )
  );

-- ---------------------------------------------------------------------------
-- B) Internal tombstone + display identity constants (not exposed to callers)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.account_deletion_reply_tombstone_message()
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT 'Message removed because the sender deleted their account.'::text;
$$;

ALTER FUNCTION public.account_deletion_reply_tombstone_message() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_reply_tombstone_message() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_deletion_reply_tombstone_message() FROM authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_reply_tombstone_message() FROM anon;
REVOKE ALL ON FUNCTION public.account_deletion_reply_tombstone_message() FROM service_role;

CREATE OR REPLACE FUNCTION public.account_deletion_deleted_public_author_display_name()
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT 'Deleted User'::text;
$$;

ALTER FUNCTION public.account_deletion_deleted_public_author_display_name() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_deleted_public_author_display_name() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_deletion_deleted_public_author_display_name() FROM authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_deleted_public_author_display_name() FROM anon;
REVOKE ALL ON FUNCTION public.account_deletion_deleted_public_author_display_name() FROM service_role;

-- ---------------------------------------------------------------------------
-- C) Internal reply graph validation (target-associated rows only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.account_deletion_validate_target_reply_graph(p_target uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  reply_row record;
  walk_id uuid;
  walk_parent uuid;
  depth integer;
BEGIN
  IF p_target IS NULL THEN
    RAISE EXCEPTION 'invariant_failed'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.story_video_replies AS graph_reply
    WHERE (
        graph_reply.user_id = p_target
        AND graph_reply.recipient_user_id IS NULL
      )
      OR (
        graph_reply.user_id IS NULL
        AND graph_reply.recipient_user_id = p_target
      )
  ) THEN
    RAISE EXCEPTION 'ambiguous_reply_graph'
      USING ERRCODE = 'P0001';
  END IF;

  FOR reply_row IN
    SELECT
      graph_reply.id,
      graph_reply.story_id,
      graph_reply.parent_reply_id
    FROM public.story_video_replies AS graph_reply
    WHERE graph_reply.user_id = p_target
       OR graph_reply.recipient_user_id = p_target
  LOOP
    IF reply_row.parent_reply_id IS NULL THEN
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.story_video_replies AS parent_row
      WHERE parent_row.id = reply_row.parent_reply_id
    ) THEN
      RAISE EXCEPTION 'ambiguous_reply_graph'
        USING ERRCODE = 'P0001';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.story_video_replies AS parent_row
      WHERE parent_row.id = reply_row.parent_reply_id
        AND parent_row.story_id IS DISTINCT FROM reply_row.story_id
    ) THEN
      RAISE EXCEPTION 'ambiguous_reply_graph'
        USING ERRCODE = 'P0001';
    END IF;

    walk_id := reply_row.parent_reply_id;
    depth := 0;

    WHILE walk_id IS NOT NULL LOOP
      depth := depth + 1;
      IF depth > 100 THEN
        RAISE EXCEPTION 'ambiguous_reply_graph'
          USING ERRCODE = 'P0001';
      END IF;

      IF walk_id = reply_row.id THEN
        RAISE EXCEPTION 'ambiguous_reply_graph'
          USING ERRCODE = 'P0001';
      END IF;

      SELECT parent_row.parent_reply_id
      INTO walk_parent
      FROM public.story_video_replies AS parent_row
      WHERE parent_row.id = walk_id
        AND parent_row.story_id = reply_row.story_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'ambiguous_reply_graph'
          USING ERRCODE = 'P0001';
      END IF;

      walk_id := walk_parent;
    END LOOP;
  END LOOP;
END;
$$;

ALTER FUNCTION public.account_deletion_validate_target_reply_graph(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_validate_target_reply_graph(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_deletion_validate_target_reply_graph(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_validate_target_reply_graph(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.account_deletion_validate_target_reply_graph(uuid) FROM service_role;

-- ---------------------------------------------------------------------------
-- D) Internal database-stage execution context + authorized mutation helpers
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.account_deletion_database_execution_context (
  backend_pid integer NOT NULL,
  transaction_id bigint NOT NULL,
  attempt_id uuid NOT NULL,
  deletion_request_id uuid NOT NULL,
  target_user_id uuid NOT NULL,
  purpose text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (backend_pid, transaction_id),
  CONSTRAINT account_deletion_database_execution_context_purpose_check CHECK (
    purpose = 'nondestructive_database_stage'::text
  )
);

COMMENT ON TABLE public.account_deletion_database_execution_context IS
  'Transaction-scoped, backend-bound authorization for 3B.1 executor mutations only. '
  'No direct caller access. Rows must never survive commit.';

ALTER TABLE public.account_deletion_database_execution_context OWNER TO postgres;
ALTER TABLE public.account_deletion_database_execution_context ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.account_deletion_database_execution_context FROM PUBLIC;
REVOKE ALL ON TABLE public.account_deletion_database_execution_context FROM authenticated;
REVOKE ALL ON TABLE public.account_deletion_database_execution_context FROM anon;
REVOKE ALL ON TABLE public.account_deletion_database_execution_context FROM service_role;

-- ---------------------------------------------------------------------------
-- D.1) Durable story freeze scope (request-scoped; survives 3B.1 identity detach)
-- Stores ONLY deletion_request_id, story_id, created_at — no target/attempt metadata.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.account_deletion_story_freeze_scope (
  deletion_request_id uuid NOT NULL,
  story_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (deletion_request_id, story_id),
  CONSTRAINT account_deletion_story_freeze_scope_request_fk
    FOREIGN KEY (deletion_request_id)
    REFERENCES public.account_deletion_requests (id)
    ON DELETE CASCADE,
  CONSTRAINT account_deletion_story_freeze_scope_story_fk
    FOREIGN KEY (story_id)
    REFERENCES public.stories (id)
    ON DELETE CASCADE
);

COMMENT ON TABLE public.account_deletion_story_freeze_scope IS
  'Internal lifecycle map: story IDs that remain story-associated-write frozen while '
  'account_deletion_requests.status = deletion_in_progress. Populated by 3B.1 executor '
  'before identity detach. No target UUID stored. Finalization decides physical cleanup.';

CREATE INDEX IF NOT EXISTS account_deletion_story_freeze_scope_story_request_idx
  ON public.account_deletion_story_freeze_scope (story_id, deletion_request_id);

ALTER TABLE public.account_deletion_story_freeze_scope OWNER TO postgres;
ALTER TABLE public.account_deletion_story_freeze_scope ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.account_deletion_story_freeze_scope FROM PUBLIC;
REVOKE ALL ON TABLE public.account_deletion_story_freeze_scope FROM authenticated;
REVOKE ALL ON TABLE public.account_deletion_story_freeze_scope FROM anon;
REVOKE ALL ON TABLE public.account_deletion_story_freeze_scope FROM service_role;

CREATE OR REPLACE FUNCTION public.account_deletion_story_shared_write_blocked(p_story_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    p_story_id IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.stories AS s
        WHERE s.id = p_story_id
          AND s.user_id IS NOT NULL
          AND public.account_user_deletion_in_progress(s.user_id)
      )
      OR EXISTS (
        SELECT 1
        FROM public.account_deletion_execution_attempts AS ea
        INNER JOIN public.account_deletion_requests AS r
          ON r.id = ea.deletion_request_id
        WHERE ea.status = 'active'::text
          AND r.status = 'deletion_in_progress'::text
          AND (
            EXISTS (
              SELECT 1
              FROM public.stories AS s
              WHERE s.id = p_story_id
                AND s.user_id = ea.target_user_id
            )
            OR EXISTS (
              SELECT 1
              FROM public.story_video_replies AS sv
              WHERE sv.story_id = p_story_id
                AND (
                  sv.user_id = ea.target_user_id
                  OR sv.recipient_user_id = ea.target_user_id
                )
            )
          )
      )
      OR EXISTS (
        SELECT 1
        FROM public.account_deletion_story_freeze_scope AS scope
        INNER JOIN public.account_deletion_requests AS request_row
          ON request_row.id = scope.deletion_request_id
        WHERE scope.story_id = p_story_id
          AND request_row.status = 'deletion_in_progress'::text
      )
    );
$$;

ALTER FUNCTION public.account_deletion_story_shared_write_blocked(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_story_shared_write_blocked(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_deletion_story_shared_write_blocked(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_story_shared_write_blocked(uuid) FROM anon;

CREATE OR REPLACE FUNCTION public.story_video_reply_shared_write_blocked(
  p_user_id uuid,
  p_recipient_user_id uuid,
  p_parent_reply_id uuid,
  p_story_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    public.story_video_reply_row_targets_deletion_in_progress(p_user_id, p_recipient_user_id)
    OR public.story_video_reply_parent_thread_blocked(p_parent_reply_id, p_story_id)
    OR public.account_deletion_story_shared_write_blocked(p_story_id);
$$;

ALTER FUNCTION public.story_video_reply_shared_write_blocked(uuid, uuid, uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.story_video_reply_shared_write_blocked(uuid, uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.story_video_reply_shared_write_blocked(uuid, uuid, uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.story_video_reply_shared_write_blocked(uuid, uuid, uuid, uuid) FROM anon;

CREATE OR REPLACE FUNCTION public.account_deletion_database_execution_context_is_valid()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.account_deletion_database_execution_context AS ctx
    INNER JOIN public.account_deletion_execution_attempts AS att
      ON att.id = ctx.attempt_id
    INNER JOIN public.account_deletion_requests AS req
      ON req.id = ctx.deletion_request_id
    WHERE ctx.backend_pid = pg_backend_pid()
      AND ctx.transaction_id = txid_current()::bigint
      AND ctx.purpose = 'nondestructive_database_stage'::text
      AND att.status = 'active'::text
      AND att.stage = 'inventory'::text
      AND att.deletion_request_id = ctx.deletion_request_id
      AND att.target_user_id = ctx.target_user_id
      AND req.id = ctx.deletion_request_id
      AND req.status = 'deletion_in_progress'::text
      AND coalesce(req.user_id, req.target_user_id_snapshot) = ctx.target_user_id
  );
$$;

ALTER FUNCTION public.account_deletion_database_execution_context_is_valid() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_database_execution_context_is_valid() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_deletion_database_execution_context_is_valid() FROM authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_database_execution_context_is_valid() FROM anon;
REVOKE ALL ON FUNCTION public.account_deletion_database_execution_context_is_valid() FROM service_role;

CREATE OR REPLACE FUNCTION public.account_deletion_story_video_reply_database_mutation_authorized(
  p_old public.story_video_replies,
  p_new public.story_video_replies
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target uuid;
  tombstone text;
BEGIN
  IF NOT public.account_deletion_database_execution_context_is_valid() THEN
    RETURN false;
  END IF;

  SELECT ctx.target_user_id
  INTO target
  FROM public.account_deletion_database_execution_context AS ctx
  WHERE ctx.backend_pid = pg_backend_pid()
    AND ctx.transaction_id = txid_current()::bigint
    AND ctx.purpose = 'nondestructive_database_stage'::text;

  IF target IS NULL THEN
    RETURN false;
  END IF;

  tombstone := public.account_deletion_reply_tombstone_message();

  IF p_old.user_id = target
     AND p_old.recipient_user_id IS NOT NULL
     AND p_old.recipient_user_id <> target
     AND p_new.user_id IS NULL
     AND p_new.message = tombstone
     AND p_new.deleted_by_sender = true
     AND (to_jsonb(p_new) - ARRAY['user_id'::text, 'message'::text, 'deleted_by_sender'::text])
         IS NOT DISTINCT FROM (to_jsonb(p_old) - ARRAY['user_id'::text, 'message'::text, 'deleted_by_sender'::text])
  THEN
    RETURN true;
  END IF;

  IF p_old.recipient_user_id = target
     AND p_old.user_id IS NOT NULL
     AND p_old.user_id <> target
     AND p_new.recipient_user_id IS NULL
     AND p_new.deleted_by_recipient = true
     AND p_new.message = p_old.message
     AND (to_jsonb(p_new) - ARRAY['recipient_user_id'::text, 'deleted_by_recipient'::text])
         IS NOT DISTINCT FROM (to_jsonb(p_old) - ARRAY['recipient_user_id'::text, 'deleted_by_recipient'::text])
  THEN
    RETURN true;
  END IF;

  IF p_old.user_id = target
     AND p_old.recipient_user_id = target
     AND p_new.user_id IS NULL
     AND p_new.recipient_user_id IS NULL
     AND p_new.message = tombstone
     AND p_new.deleted_by_sender = true
     AND p_new.deleted_by_recipient = true
     AND (to_jsonb(p_new) - ARRAY['user_id'::text, 'recipient_user_id'::text, 'message'::text, 'deleted_by_sender'::text, 'deleted_by_recipient'::text])
         IS NOT DISTINCT FROM (to_jsonb(p_old) - ARRAY['user_id'::text, 'recipient_user_id'::text, 'message'::text, 'deleted_by_sender'::text, 'deleted_by_recipient'::text])
  THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

ALTER FUNCTION public.account_deletion_story_video_reply_database_mutation_authorized(public.story_video_replies, public.story_video_replies) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_story_video_reply_database_mutation_authorized(public.story_video_replies, public.story_video_replies) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_deletion_story_video_reply_database_mutation_authorized(public.story_video_replies, public.story_video_replies) FROM authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_story_video_reply_database_mutation_authorized(public.story_video_replies, public.story_video_replies) FROM anon;
REVOKE ALL ON FUNCTION public.account_deletion_story_video_reply_database_mutation_authorized(public.story_video_replies, public.story_video_replies) FROM service_role;

CREATE OR REPLACE FUNCTION public.account_deletion_prayer_video_response_database_mutation_authorized(
  p_old public.prayer_video_responses,
  p_new public.prayer_video_responses
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target uuid;
BEGIN
  IF NOT public.account_deletion_database_execution_context_is_valid() THEN
    RETURN false;
  END IF;

  SELECT ctx.target_user_id
  INTO target
  FROM public.account_deletion_database_execution_context AS ctx
  WHERE ctx.backend_pid = pg_backend_pid()
    AND ctx.transaction_id = txid_current()::bigint
    AND ctx.purpose = 'nondestructive_database_stage'::text;

  IF target IS NULL THEN
    RETURN false;
  END IF;

  IF p_old.user_id = target
     AND p_new.user_id IS NULL
     AND (to_jsonb(p_new) - 'user_id'::text)
         IS NOT DISTINCT FROM (to_jsonb(p_old) - 'user_id'::text)
  THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

ALTER FUNCTION public.account_deletion_prayer_video_response_database_mutation_authorized(public.prayer_video_responses, public.prayer_video_responses) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_prayer_video_response_database_mutation_authorized(public.prayer_video_responses, public.prayer_video_responses) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_deletion_prayer_video_response_database_mutation_authorized(public.prayer_video_responses, public.prayer_video_responses) FROM authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_prayer_video_response_database_mutation_authorized(public.prayer_video_responses, public.prayer_video_responses) FROM anon;
REVOKE ALL ON FUNCTION public.account_deletion_prayer_video_response_database_mutation_authorized(public.prayer_video_responses, public.prayer_video_responses) FROM service_role;

CREATE OR REPLACE FUNCTION public.account_deletion_prayer_written_response_database_mutation_authorized(
  p_old public.prayer_written_responses,
  p_new public.prayer_written_responses
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target uuid;
BEGIN
  IF NOT public.account_deletion_database_execution_context_is_valid() THEN
    RETURN false;
  END IF;

  SELECT ctx.target_user_id
  INTO target
  FROM public.account_deletion_database_execution_context AS ctx
  WHERE ctx.backend_pid = pg_backend_pid()
    AND ctx.transaction_id = txid_current()::bigint
    AND ctx.purpose = 'nondestructive_database_stage'::text;

  IF target IS NULL THEN
    RETURN false;
  END IF;

  IF p_old.author_user_id = target
     AND p_new.author_user_id IS NULL
     AND (to_jsonb(p_new) - 'author_user_id'::text)
         IS NOT DISTINCT FROM (to_jsonb(p_old) - 'author_user_id'::text)
  THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

ALTER FUNCTION public.account_deletion_prayer_written_response_database_mutation_authorized(public.prayer_written_responses, public.prayer_written_responses) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_prayer_written_response_database_mutation_authorized(public.prayer_written_responses, public.prayer_written_responses) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_deletion_prayer_written_response_database_mutation_authorized(public.prayer_written_responses, public.prayer_written_responses) FROM authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_prayer_written_response_database_mutation_authorized(public.prayer_written_responses, public.prayer_written_responses) FROM anon;
REVOKE ALL ON FUNCTION public.account_deletion_prayer_written_response_database_mutation_authorized(public.prayer_written_responses, public.prayer_written_responses) FROM service_role;

CREATE OR REPLACE FUNCTION public.account_deletion_prayer_update_database_mutation_authorized(
  p_old public.prayer_updates,
  p_new public.prayer_updates
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target uuid;
BEGIN
  IF NOT public.account_deletion_database_execution_context_is_valid() THEN
    RETURN false;
  END IF;

  SELECT ctx.target_user_id
  INTO target
  FROM public.account_deletion_database_execution_context AS ctx
  WHERE ctx.backend_pid = pg_backend_pid()
    AND ctx.transaction_id = txid_current()::bigint
    AND ctx.purpose = 'nondestructive_database_stage'::text;

  IF target IS NULL THEN
    RETURN false;
  END IF;

  IF p_old.author_user_id = target
     AND p_new.author_user_id IS NULL
     AND (to_jsonb(p_new) - 'author_user_id'::text)
         IS NOT DISTINCT FROM (to_jsonb(p_old) - 'author_user_id'::text)
  THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

ALTER FUNCTION public.account_deletion_prayer_update_database_mutation_authorized(public.prayer_updates, public.prayer_updates) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_prayer_update_database_mutation_authorized(public.prayer_updates, public.prayer_updates) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_deletion_prayer_update_database_mutation_authorized(public.prayer_updates, public.prayer_updates) FROM authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_prayer_update_database_mutation_authorized(public.prayer_updates, public.prayer_updates) FROM anon;
REVOKE ALL ON FUNCTION public.account_deletion_prayer_update_database_mutation_authorized(public.prayer_updates, public.prayer_updates) FROM service_role;

CREATE OR REPLACE FUNCTION public.account_deletion_inbox_message_database_mutation_authorized(
  p_old public.inbox_messages,
  p_new public.inbox_messages
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target uuid;
BEGIN
  IF NOT public.account_deletion_database_execution_context_is_valid() THEN
    RETURN false;
  END IF;

  SELECT ctx.target_user_id
  INTO target
  FROM public.account_deletion_database_execution_context AS ctx
  WHERE ctx.backend_pid = pg_backend_pid()
    AND ctx.transaction_id = txid_current()::bigint
    AND ctx.purpose = 'nondestructive_database_stage'::text;

  IF target IS NULL THEN
    RETURN false;
  END IF;

  IF p_old.sender_user_id = target
     AND p_old.user_id IS DISTINCT FROM target
     AND p_new.sender_user_id IS NULL
     AND (to_jsonb(p_new) - 'sender_user_id'::text)
         IS NOT DISTINCT FROM (to_jsonb(p_old) - 'sender_user_id'::text)
  THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

ALTER FUNCTION public.account_deletion_inbox_message_database_mutation_authorized(public.inbox_messages, public.inbox_messages) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_inbox_message_database_mutation_authorized(public.inbox_messages, public.inbox_messages) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_deletion_inbox_message_database_mutation_authorized(public.inbox_messages, public.inbox_messages) FROM authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_inbox_message_database_mutation_authorized(public.inbox_messages, public.inbox_messages) FROM anon;
REVOKE ALL ON FUNCTION public.account_deletion_inbox_message_database_mutation_authorized(public.inbox_messages, public.inbox_messages) FROM service_role;

CREATE OR REPLACE FUNCTION public.account_deletion_story_database_mutation_authorized(
  p_old public.stories,
  p_new public.stories
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target uuid;
  deleted_display_name text;
BEGIN
  IF NOT public.account_deletion_database_execution_context_is_valid() THEN
    RETURN false;
  END IF;

  SELECT ctx.target_user_id
  INTO target
  FROM public.account_deletion_database_execution_context AS ctx
  WHERE ctx.backend_pid = pg_backend_pid()
    AND ctx.transaction_id = txid_current()::bigint
    AND ctx.purpose = 'nondestructive_database_stage'::text;

  IF target IS NULL THEN
    RETURN false;
  END IF;

  deleted_display_name := public.account_deletion_deleted_public_author_display_name();

  IF p_old.user_id = target
     AND p_new.user_id IS NULL
     AND p_new.name = deleted_display_name
     AND p_new.email IS NULL
     AND p_new.location IS NULL
     AND p_new.public_lat IS NULL
     AND p_new.public_lng IS NULL
     AND p_new.public_location_label IS NULL
     AND (to_jsonb(p_new) - ARRAY[
           'user_id'::text,
           'name'::text,
           'email'::text,
           'location'::text,
           'public_lat'::text,
           'public_lng'::text,
           'public_location_label'::text
         ])
         IS NOT DISTINCT FROM (to_jsonb(p_old) - ARRAY[
           'user_id'::text,
           'name'::text,
           'email'::text,
           'location'::text,
           'public_lat'::text,
           'public_lng'::text,
           'public_location_label'::text
         ])
  THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

ALTER FUNCTION public.account_deletion_story_database_mutation_authorized(public.stories, public.stories) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_story_database_mutation_authorized(public.stories, public.stories) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_deletion_story_database_mutation_authorized(public.stories, public.stories) FROM authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_story_database_mutation_authorized(public.stories, public.stories) FROM anon;
REVOKE ALL ON FUNCTION public.account_deletion_story_database_mutation_authorized(public.stories, public.stories) FROM service_role;

CREATE OR REPLACE FUNCTION public.trg_account_deletion_shared_stories_write_freeze()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.user_id IS NOT NULL
       AND public.account_user_deletion_in_progress(NEW.user_id) THEN
      RAISE EXCEPTION 'Account deletion in progress: story write blocked'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF public.account_deletion_story_shared_write_blocked(OLD.id)
       OR public.account_deletion_story_shared_write_blocked(NEW.id) THEN
      IF public.account_deletion_story_database_mutation_authorized(OLD, NEW) THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'Account deletion in progress: story write blocked'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF public.account_deletion_story_shared_write_blocked(OLD.id) THEN
      RAISE EXCEPTION 'Account deletion in progress: story write blocked'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

ALTER FUNCTION public.trg_account_deletion_shared_stories_write_freeze() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.trg_account_deletion_shared_stories_write_freeze() FROM PUBLIC;

DROP TRIGGER IF EXISTS account_deletion_shared_stories_write_freeze
  ON public.stories;
CREATE TRIGGER account_deletion_shared_stories_write_freeze
  BEFORE INSERT OR UPDATE OR DELETE ON public.stories
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_account_deletion_shared_stories_write_freeze();

CREATE OR REPLACE FUNCTION public.trg_account_deletion_shared_story_video_replies_write_freeze()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF public.story_video_reply_shared_write_blocked(
      NEW.user_id,
      NEW.recipient_user_id,
      NEW.parent_reply_id,
      NEW.story_id
    ) THEN
      RAISE EXCEPTION 'Account deletion in progress: story video reply write blocked'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF public.story_video_reply_shared_write_blocked(
      OLD.user_id,
      OLD.recipient_user_id,
      OLD.parent_reply_id,
      OLD.story_id
    ) OR public.story_video_reply_shared_write_blocked(
      NEW.user_id,
      NEW.recipient_user_id,
      NEW.parent_reply_id,
      NEW.story_id
    ) THEN
      IF public.account_deletion_story_video_reply_database_mutation_authorized(OLD, NEW) THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'Account deletion in progress: story video reply write blocked'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF public.story_video_reply_shared_write_blocked(
      OLD.user_id,
      OLD.recipient_user_id,
      OLD.parent_reply_id,
      OLD.story_id
    ) THEN
      RAISE EXCEPTION 'Account deletion in progress: story video reply write blocked'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

ALTER FUNCTION public.trg_account_deletion_shared_story_video_replies_write_freeze() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.trg_account_deletion_shared_story_video_replies_write_freeze() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.trg_account_deletion_shared_story_id_engagement_write_freeze()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF public.account_deletion_story_shared_write_blocked(NEW.story_id) THEN
      RAISE EXCEPTION 'Account deletion in progress: story-associated write blocked'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF public.account_deletion_story_shared_write_blocked(OLD.story_id)
       OR public.account_deletion_story_shared_write_blocked(NEW.story_id) THEN
      RAISE EXCEPTION 'Account deletion in progress: story-associated write blocked'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF public.account_deletion_story_shared_write_blocked(OLD.story_id) THEN
      RAISE EXCEPTION 'Account deletion in progress: story-associated write blocked'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

ALTER FUNCTION public.trg_account_deletion_shared_story_id_engagement_write_freeze() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.trg_account_deletion_shared_story_id_engagement_write_freeze() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.trg_account_deletion_shared_prayer_video_responses_write_freeze()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF public.account_deletion_story_shared_write_blocked(NEW.story_id) THEN
      RAISE EXCEPTION 'Account deletion in progress: story-associated write blocked'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF public.account_deletion_story_shared_write_blocked(OLD.story_id)
       OR public.account_deletion_story_shared_write_blocked(NEW.story_id) THEN
      IF public.account_deletion_prayer_video_response_database_mutation_authorized(OLD, NEW) THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'Account deletion in progress: story-associated write blocked'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF public.account_deletion_story_shared_write_blocked(OLD.story_id) THEN
      RAISE EXCEPTION 'Account deletion in progress: story-associated write blocked'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

ALTER FUNCTION public.trg_account_deletion_shared_prayer_video_responses_write_freeze() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.trg_account_deletion_shared_prayer_video_responses_write_freeze() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.trg_account_deletion_shared_prayer_written_responses_write_freeze()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF public.account_deletion_story_shared_write_blocked(NEW.story_id) THEN
      RAISE EXCEPTION 'Account deletion in progress: story-associated write blocked'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF public.account_deletion_story_shared_write_blocked(OLD.story_id)
       OR public.account_deletion_story_shared_write_blocked(NEW.story_id) THEN
      IF public.account_deletion_prayer_written_response_database_mutation_authorized(OLD, NEW) THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'Account deletion in progress: story-associated write blocked'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF public.account_deletion_story_shared_write_blocked(OLD.story_id) THEN
      RAISE EXCEPTION 'Account deletion in progress: story-associated write blocked'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

ALTER FUNCTION public.trg_account_deletion_shared_prayer_written_responses_write_freeze() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.trg_account_deletion_shared_prayer_written_responses_write_freeze() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.trg_account_deletion_shared_prayer_updates_write_freeze()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF public.account_deletion_story_shared_write_blocked(NEW.story_id) THEN
      RAISE EXCEPTION 'Account deletion in progress: story-associated write blocked'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF public.account_deletion_story_shared_write_blocked(OLD.story_id)
       OR public.account_deletion_story_shared_write_blocked(NEW.story_id) THEN
      IF public.account_deletion_prayer_update_database_mutation_authorized(OLD, NEW) THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'Account deletion in progress: story-associated write blocked'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF public.account_deletion_story_shared_write_blocked(OLD.story_id) THEN
      RAISE EXCEPTION 'Account deletion in progress: story-associated write blocked'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

ALTER FUNCTION public.trg_account_deletion_shared_prayer_updates_write_freeze() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.trg_account_deletion_shared_prayer_updates_write_freeze() FROM PUBLIC;

DROP TRIGGER IF EXISTS account_deletion_shared_prayer_video_responses_write_freeze
  ON public.prayer_video_responses;
CREATE TRIGGER account_deletion_shared_prayer_video_responses_write_freeze
  BEFORE INSERT OR UPDATE OR DELETE ON public.prayer_video_responses
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_account_deletion_shared_prayer_video_responses_write_freeze();

DROP TRIGGER IF EXISTS account_deletion_shared_prayer_written_responses_write_freeze
  ON public.prayer_written_responses;
CREATE TRIGGER account_deletion_shared_prayer_written_responses_write_freeze
  BEFORE INSERT OR UPDATE OR DELETE ON public.prayer_written_responses
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_account_deletion_shared_prayer_written_responses_write_freeze();

DROP TRIGGER IF EXISTS account_deletion_shared_prayer_updates_write_freeze
  ON public.prayer_updates;
CREATE TRIGGER account_deletion_shared_prayer_updates_write_freeze
  BEFORE INSERT OR UPDATE OR DELETE ON public.prayer_updates
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_account_deletion_shared_prayer_updates_write_freeze();

CREATE OR REPLACE FUNCTION public.trg_account_deletion_shared_inbox_write_freeze()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF public.account_deletion_inbox_row_shared_write_blocked(NEW.user_id, NEW.sender_user_id) THEN
      RAISE EXCEPTION 'Account deletion in progress: inbox write blocked'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF public.account_deletion_inbox_row_shared_write_blocked(OLD.user_id, OLD.sender_user_id)
       OR public.account_deletion_inbox_row_shared_write_blocked(NEW.user_id, NEW.sender_user_id) THEN
      IF public.account_deletion_inbox_message_database_mutation_authorized(OLD, NEW) THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'Account deletion in progress: inbox write blocked'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF public.account_deletion_inbox_row_shared_write_blocked(OLD.user_id, OLD.sender_user_id) THEN
      RAISE EXCEPTION 'Account deletion in progress: inbox write blocked'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

ALTER FUNCTION public.trg_account_deletion_shared_inbox_write_freeze() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.trg_account_deletion_shared_inbox_write_freeze() FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- E) Nondestructive database stage executor RPC (service_role only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.execute_account_deletion_nondestructive_database_stage(
  p_request_id uuid,
  p_attempt_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  req record;
  att record;
  resolved_target uuid;
  lock_key bigint;
  readiness jsonb;
  stage_readiness jsonb;
  checked_at timestamptz := now();
  rows_affected jsonb := '{}'::jsonb;
  row_count integer;
  expected_count integer;
  tombstone text;
  deleted_display_name text;
BEGIN
  IF p_request_id IS NULL OR p_attempt_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_arguments');
  END IF;

  tombstone := public.account_deletion_reply_tombstone_message();
  deleted_display_name := public.account_deletion_deleted_public_author_display_name();

  SELECT
    request_row.id,
    request_row.status,
    request_row.user_id,
    request_row.target_user_id_snapshot
  INTO req
  FROM public.account_deletion_requests AS request_row
  WHERE request_row.id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'request_not_in_progress');
  END IF;

  IF req.status <> 'deletion_in_progress'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'request_not_in_progress');
  END IF;

  resolved_target := coalesce(req.user_id, req.target_user_id_snapshot);
  IF resolved_target IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'target_unresolved');
  END IF;

  lock_key := public.hashtextextended(
    'account_deletion:' || resolved_target::text,
    0::bigint
  );
  PERFORM pg_advisory_xact_lock(lock_key);

  readiness := public.verify_account_deletion_schema_execution_ready();
  IF coalesce((readiness->>'ready')::boolean, false) = false THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'readiness_failed',
      'readiness', readiness
    );
  END IF;

  stage_readiness := public.verify_account_deletion_nondestructive_database_stage_ready();
  IF coalesce((stage_readiness->>'ready')::boolean, false) = false THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'readiness_failed',
      'readiness', stage_readiness
    );
  END IF;

  SELECT
    attempt_row.id,
    attempt_row.deletion_request_id,
    attempt_row.target_user_id,
    attempt_row.status,
    attempt_row.stage
  INTO att
  FROM public.account_deletion_execution_attempts AS attempt_row
  WHERE attempt_row.id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'attempt_mismatch');
  END IF;

  IF att.deletion_request_id IS DISTINCT FROM p_request_id
     OR att.target_user_id IS DISTINCT FROM resolved_target
     OR att.status <> 'active'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'attempt_mismatch');
  END IF;

  IF att.stage = 'database_completed'::text THEN
    RETURN jsonb_build_object(
      'ok', true,
      'code', 'already_completed',
      'request_id', p_request_id,
      'attempt_id', p_attempt_id,
      'target_user_id', resolved_target,
      'database_rows_affected', coalesce(
        (
          SELECT attempt_row.database_rows_affected
          FROM public.account_deletion_execution_attempts AS attempt_row
          WHERE attempt_row.id = p_attempt_id
        ),
        '{}'::jsonb
      ),
      'checked_at', checked_at
    );
  END IF;

  IF att.stage = 'database'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_stage');
  END IF;

  IF att.stage <> 'inventory'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_stage');
  END IF;

  PERFORM story_row.id
  FROM public.stories AS story_row
  WHERE story_row.user_id = resolved_target
  FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM public.stories AS story_row
    WHERE story_row.user_id = resolved_target
      AND story_row.removed_at IS NULL
      AND story_row.status = ANY (ARRAY['pending'::text, 'submitted'::text])
  ) THEN
    RAISE EXCEPTION 'unsupported_destructive_action'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.stories AS story_row
    WHERE story_row.user_id = resolved_target
      AND NOT (
        (story_row.status = 'approved'::text AND story_row.removed_at IS NULL)
        OR story_row.status = 'removed'::text
        OR story_row.removed_at IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION 'unsupported_destructive_action'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM locked_reply.id
  FROM public.story_video_replies AS locked_reply
  WHERE locked_reply.user_id = resolved_target
     OR locked_reply.recipient_user_id = resolved_target
  FOR UPDATE;

  PERFORM public.account_deletion_validate_target_reply_graph(resolved_target);

  INSERT INTO public.account_deletion_story_freeze_scope AS scope_row (
    deletion_request_id,
    story_id
  )
  SELECT
    p_request_id,
    associated.story_id
  FROM (
    SELECT story_preflight.id AS story_id
    FROM public.stories AS story_preflight
    WHERE story_preflight.user_id = resolved_target

    UNION

    SELECT reply_preflight.story_id
    FROM public.story_video_replies AS reply_preflight
    WHERE reply_preflight.user_id = resolved_target

    UNION

    SELECT reply_preflight.story_id
    FROM public.story_video_replies AS reply_preflight
    WHERE reply_preflight.recipient_user_id = resolved_target
  ) AS associated
  WHERE associated.story_id IS NOT NULL
  ON CONFLICT (deletion_request_id, story_id) DO NOTHING;

  IF EXISTS (
    SELECT 1
    FROM public.account_deletion_database_execution_context AS ctx
    WHERE ctx.backend_pid = pg_backend_pid()
      AND ctx.transaction_id = txid_current()::bigint
  ) THEN
    RAISE EXCEPTION 'invariant_failed'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.account_deletion_database_execution_context (
    backend_pid,
    transaction_id,
    attempt_id,
    deletion_request_id,
    target_user_id,
    purpose
  ) VALUES (
    pg_backend_pid(),
    txid_current()::bigint,
    p_attempt_id,
    p_request_id,
    resolved_target,
    'nondestructive_database_stage'::text
  );

  SELECT count(*)::integer
  INTO expected_count
  FROM public.story_video_replies AS reply_row
  WHERE reply_row.user_id = resolved_target
    AND reply_row.recipient_user_id IS NOT NULL
    AND reply_row.recipient_user_id <> resolved_target;

  UPDATE public.story_video_replies AS live_row
  SET
    user_id = NULL,
    message = tombstone,
    deleted_by_sender = true
  FROM public.story_video_replies AS expected_row
  WHERE live_row.id = expected_row.id
    AND expected_row.user_id = resolved_target
    AND expected_row.recipient_user_id IS NOT NULL
    AND expected_row.recipient_user_id <> resolved_target
    AND live_row.user_id = resolved_target
    AND live_row.recipient_user_id = expected_row.recipient_user_id
    AND live_row.story_id = expected_row.story_id
    AND live_row.parent_reply_id IS NOT DISTINCT FROM expected_row.parent_reply_id
    AND live_row.deleted_by_sender = false
    AND live_row.deleted_by_recipient = expected_row.deleted_by_recipient;

  GET DIAGNOSTICS row_count = ROW_COUNT;
  IF row_count <> expected_count THEN
    RAISE EXCEPTION 'row_count_mismatch'
      USING ERRCODE = 'P0001';
  END IF;
  rows_affected := rows_affected || jsonb_build_object('reply_sender_detach', row_count);

  SELECT count(*)::integer
  INTO expected_count
  FROM public.story_video_replies AS reply_row
  WHERE reply_row.recipient_user_id = resolved_target
    AND reply_row.user_id IS NOT NULL
    AND reply_row.user_id <> resolved_target;

  UPDATE public.story_video_replies AS live_row
  SET
    recipient_user_id = NULL,
    deleted_by_recipient = true
  FROM public.story_video_replies AS expected_row
  WHERE live_row.id = expected_row.id
    AND expected_row.recipient_user_id = resolved_target
    AND expected_row.user_id IS NOT NULL
    AND expected_row.user_id <> resolved_target
    AND live_row.recipient_user_id = resolved_target
    AND live_row.user_id = expected_row.user_id
    AND live_row.story_id = expected_row.story_id
    AND live_row.parent_reply_id IS NOT DISTINCT FROM expected_row.parent_reply_id
    AND live_row.message = expected_row.message
    AND live_row.deleted_by_sender = expected_row.deleted_by_sender
    AND live_row.deleted_by_recipient = false;

  GET DIAGNOSTICS row_count = ROW_COUNT;
  IF row_count <> expected_count THEN
    RAISE EXCEPTION 'row_count_mismatch'
      USING ERRCODE = 'P0001';
  END IF;
  rows_affected := rows_affected || jsonb_build_object('reply_recipient_detach', row_count);

  SELECT count(*)::integer
  INTO expected_count
  FROM public.story_video_replies AS reply_row
  WHERE reply_row.user_id = resolved_target
    AND reply_row.recipient_user_id = resolved_target;

  UPDATE public.story_video_replies AS live_row
  SET
    user_id = NULL,
    recipient_user_id = NULL,
    message = tombstone,
    deleted_by_sender = true,
    deleted_by_recipient = true
  FROM public.story_video_replies AS expected_row
  WHERE live_row.id = expected_row.id
    AND expected_row.user_id = resolved_target
    AND expected_row.recipient_user_id = resolved_target
    AND live_row.user_id = resolved_target
    AND live_row.recipient_user_id = resolved_target
    AND live_row.story_id = expected_row.story_id
    AND live_row.parent_reply_id IS NOT DISTINCT FROM expected_row.parent_reply_id
    AND live_row.deleted_by_sender = false
    AND live_row.deleted_by_recipient = false;

  GET DIAGNOSTICS row_count = ROW_COUNT;
  IF row_count <> expected_count THEN
    RAISE EXCEPTION 'row_count_mismatch'
      USING ERRCODE = 'P0001';
  END IF;
  rows_affected := rows_affected || jsonb_build_object('reply_self_detach', row_count);

  PERFORM prayer_row.id
  FROM public.prayer_video_responses AS prayer_row
  WHERE prayer_row.user_id = resolved_target
  FOR UPDATE;

  SELECT count(*)::integer
  INTO expected_count
  FROM public.prayer_video_responses AS prayer_row
  WHERE prayer_row.user_id = resolved_target;

  UPDATE public.prayer_video_responses AS live_row
  SET user_id = NULL
  WHERE live_row.user_id = resolved_target;

  GET DIAGNOSTICS row_count = ROW_COUNT;
  IF row_count <> expected_count THEN
    RAISE EXCEPTION 'row_count_mismatch'
      USING ERRCODE = 'P0001';
  END IF;
  rows_affected := rows_affected || jsonb_build_object('prayer_video_responses', row_count);

  PERFORM written_row.id
  FROM public.prayer_written_responses AS written_row
  WHERE written_row.author_user_id = resolved_target
  FOR UPDATE;

  SELECT count(*)::integer
  INTO expected_count
  FROM public.prayer_written_responses AS written_row
  WHERE written_row.author_user_id = resolved_target;

  UPDATE public.prayer_written_responses AS live_row
  SET author_user_id = NULL
  WHERE live_row.author_user_id = resolved_target;

  GET DIAGNOSTICS row_count = ROW_COUNT;
  IF row_count <> expected_count THEN
    RAISE EXCEPTION 'row_count_mismatch'
      USING ERRCODE = 'P0001';
  END IF;
  rows_affected := rows_affected || jsonb_build_object('prayer_written_responses', row_count);

  PERFORM update_row.id
  FROM public.prayer_updates AS update_row
  WHERE update_row.author_user_id = resolved_target
  FOR UPDATE;

  SELECT count(*)::integer
  INTO expected_count
  FROM public.prayer_updates AS update_row
  WHERE update_row.author_user_id = resolved_target;

  UPDATE public.prayer_updates AS live_row
  SET author_user_id = NULL
  WHERE live_row.author_user_id = resolved_target;

  GET DIAGNOSTICS row_count = ROW_COUNT;
  IF row_count <> expected_count THEN
    RAISE EXCEPTION 'row_count_mismatch'
      USING ERRCODE = 'P0001';
  END IF;
  rows_affected := rows_affected || jsonb_build_object('prayer_updates', row_count);

  PERFORM inbox_row.id
  FROM public.inbox_messages AS inbox_row
  WHERE inbox_row.sender_user_id = resolved_target
    AND inbox_row.user_id IS DISTINCT FROM resolved_target
  FOR UPDATE;

  SELECT count(*)::integer
  INTO expected_count
  FROM public.inbox_messages AS inbox_row
  WHERE inbox_row.sender_user_id = resolved_target
    AND inbox_row.user_id IS DISTINCT FROM resolved_target;

  UPDATE public.inbox_messages AS live_row
  SET sender_user_id = NULL
  WHERE live_row.sender_user_id = resolved_target
    AND live_row.user_id IS DISTINCT FROM resolved_target;

  GET DIAGNOSTICS row_count = ROW_COUNT;
  IF row_count <> expected_count THEN
    RAISE EXCEPTION 'row_count_mismatch'
      USING ERRCODE = 'P0001';
  END IF;
  rows_affected := rows_affected || jsonb_build_object('inbox_surviving_sent_copies', row_count);

  SELECT count(*)::integer
  INTO expected_count
  FROM public.stories AS story_row
  WHERE story_row.user_id = resolved_target;

  UPDATE public.stories AS live_row
  SET
    user_id = NULL,
    name = deleted_display_name,
    email = NULL,
    location = NULL,
    public_lat = NULL,
    public_lng = NULL,
    public_location_label = NULL
  WHERE live_row.user_id = resolved_target;

  GET DIAGNOSTICS row_count = ROW_COUNT;
  IF row_count <> expected_count THEN
    RAISE EXCEPTION 'row_count_mismatch'
      USING ERRCODE = 'P0001';
  END IF;
  rows_affected := rows_affected || jsonb_build_object('stories', row_count);

  DELETE FROM public.account_deletion_database_execution_context AS ctx
  WHERE ctx.backend_pid = pg_backend_pid()
    AND ctx.transaction_id = txid_current()::bigint
    AND ctx.attempt_id = p_attempt_id;

  GET DIAGNOSTICS row_count = ROW_COUNT;
  IF row_count <> 1 THEN
    RAISE EXCEPTION 'invariant_failed'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.account_deletion_execution_attempts AS attempt_row
  SET
    stage = 'database_completed'::text,
    database_rows_affected = rows_affected,
    last_error_code = NULL,
    last_error_detail_safe = NULL,
    updated_at = now()
  WHERE attempt_row.id = p_attempt_id
    AND attempt_row.status = 'active'::text
    AND attempt_row.stage = 'inventory'::text;

  GET DIAGNOSTICS row_count = ROW_COUNT;
  IF row_count <> 1 THEN
    RAISE EXCEPTION 'invariant_failed'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'completed',
    'request_id', p_request_id,
    'attempt_id', p_attempt_id,
    'target_user_id', resolved_target,
    'database_rows_affected', rows_affected,
    'checked_at', checked_at
  );

EXCEPTION
  WHEN SQLSTATE 'P0001' THEN
    CASE SQLERRM
      WHEN 'unsupported_destructive_action' THEN
        RETURN jsonb_build_object('ok', false, 'code', 'unsupported_destructive_action');
      WHEN 'ambiguous_reply_graph' THEN
        RETURN jsonb_build_object('ok', false, 'code', 'ambiguous_reply_graph');
      WHEN 'row_count_mismatch' THEN
        RETURN jsonb_build_object('ok', false, 'code', 'row_count_mismatch');
      WHEN 'stale_state' THEN
        RETURN jsonb_build_object('ok', false, 'code', 'stale_state');
      WHEN 'invariant_failed' THEN
        RETURN jsonb_build_object('ok', false, 'code', 'invariant_failed');
      ELSE
        RETURN jsonb_build_object('ok', false, 'code', 'invariant_failed');
    END CASE;
END;
$$;

ALTER FUNCTION public.execute_account_deletion_nondestructive_database_stage(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.execute_account_deletion_nondestructive_database_stage(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.execute_account_deletion_nondestructive_database_stage(uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.execute_account_deletion_nondestructive_database_stage(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.execute_account_deletion_nondestructive_database_stage(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.execute_account_deletion_nondestructive_database_stage(uuid, uuid) IS
  'Nondestructive account-deletion database stage (Phase 2C.3B.1). '
  'Accepts only request_id and attempt_id; target derived from locked request row. '
  'Requires deletion_in_progress, active attempt stage=inventory, live readiness, advisory lock, '
  'FOR UPDATE row locks, conservative story preflight, reply graph validation, identity-only mutations. '
  'No content_reports/profile/storage/auth mutations. No DELETE on user/content tables. '
  'Stories anonymized LAST. Success sets stage=database_completed atomically. service_role only.';

-- ---------------------------------------------------------------------------
-- F) Nondestructive database stage readiness probe
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.verify_account_deletion_nondestructive_database_stage_ready()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  prerequisites jsonb := '[]'::jsonb;
  all_ready boolean := true;
  check_ok boolean;
BEGIN
  check_ok := to_regprocedure(
    'public.execute_account_deletion_nondestructive_database_stage(uuid, uuid)'
  ) IS NOT NULL;
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'nondestructive_database_stage_rpc_ready',
      'ready', check_ok,
      'detail', CASE
        WHEN check_ok THEN 'execute_account_deletion_nondestructive_database_stage(uuid, uuid) exists'
        ELSE 'execute_account_deletion_nondestructive_database_stage(uuid, uuid) missing'
      END
    )
  );
  all_ready := all_ready AND check_ok;

  check_ok := EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS proc
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = proc.pronamespace
    WHERE nsp.nspname = 'public'
      AND proc.proname = 'execute_account_deletion_nondestructive_database_stage'
      AND proc.prosecdef = true
  );
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'nondestructive_database_stage_security_definer',
      'ready', check_ok,
      'detail', CASE
        WHEN check_ok THEN 'executor RPC is SECURITY DEFINER'
        ELSE 'executor RPC must be SECURITY DEFINER'
      END
    )
  );
  all_ready := all_ready AND check_ok;

  check_ok := EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS proc
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = proc.pronamespace
    WHERE nsp.nspname = 'public'
      AND proc.proname = 'execute_account_deletion_nondestructive_database_stage'
      AND pg_catalog.pg_get_userbyid(proc.proowner) = 'postgres'
  );
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'nondestructive_database_stage_owner_postgres',
      'ready', check_ok,
      'detail', CASE
        WHEN check_ok THEN 'executor RPC owned by postgres'
        ELSE 'executor RPC must be owned by postgres'
      END
    )
  );
  all_ready := all_ready AND check_ok;

  check_ok := has_function_privilege(
    'service_role',
    'public.execute_account_deletion_nondestructive_database_stage(uuid, uuid)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated',
    'public.execute_account_deletion_nondestructive_database_stage(uuid, uuid)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon',
    'public.execute_account_deletion_nondestructive_database_stage(uuid, uuid)',
    'EXECUTE'
  );
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'nondestructive_database_stage_grants',
      'ready', check_ok,
      'detail', CASE
        WHEN check_ok THEN 'executor RPC granted to service_role only'
        ELSE 'executor RPC grants must be service_role only'
      END
    )
  );
  all_ready := all_ready AND check_ok;

  check_ok := EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS con
    JOIN pg_catalog.pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'account_deletion_execution_attempts'
      AND con.conname = 'account_deletion_execution_attempts_stage_check'
      AND pg_get_constraintdef(con.oid) LIKE '%database_completed%'
  );
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'database_completed_stage_check',
      'ready', check_ok,
      'detail', CASE
        WHEN check_ok THEN 'attempt stage CHECK includes database_completed'
        ELSE 'attempt stage CHECK must include database_completed'
      END
    )
  );
  all_ready := all_ready AND check_ok;

  check_ok := to_regprocedure('public.account_deletion_reply_tombstone_message()') IS NOT NULL;
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'reply_tombstone_helper_ready',
      'ready', check_ok,
      'detail', CASE
        WHEN check_ok THEN 'account_deletion_reply_tombstone_message() exists'
        ELSE 'account_deletion_reply_tombstone_message() missing'
      END
    )
  );
  all_ready := all_ready AND check_ok;

  check_ok := coalesce(
    (public.verify_account_deletion_acquisition_foundation_ready()->>'ready')::boolean,
    false
  );
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'acquisition_foundation_still_ready',
      'ready', check_ok,
      'detail', CASE
        WHEN check_ok THEN 'verify_account_deletion_acquisition_foundation_ready() ready'
        ELSE 'acquisition foundation readiness failed'
      END
    )
  );
  all_ready := all_ready AND check_ok;

  check_ok := to_regclass('public.account_deletion_database_execution_context') IS NOT NULL;
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'database_execution_context_table_ready',
      'ready', check_ok,
      'detail', CASE
        WHEN check_ok THEN 'account_deletion_database_execution_context table exists'
        ELSE 'account_deletion_database_execution_context table missing'
      END
    )
  );
  all_ready := all_ready AND check_ok;

  check_ok := (
    SELECT count(*)::integer = 7
    FROM information_schema.columns AS c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'account_deletion_database_execution_context'
      AND c.column_name IN (
        'backend_pid',
        'transaction_id',
        'attempt_id',
        'deletion_request_id',
        'target_user_id',
        'purpose',
        'created_at'
      )
  );
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'database_execution_context_columns_ready',
      'ready', check_ok,
      'detail', CASE
        WHEN check_ok THEN 'execution context table has required columns'
        ELSE 'execution context table columns incomplete'
      END
    )
  );
  all_ready := all_ready AND check_ok;

  check_ok := pg_catalog.pg_get_userbyid(
    (SELECT relowner FROM pg_catalog.pg_class WHERE relname = 'account_deletion_database_execution_context')
  ) = 'postgres'
  AND EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS rel
    WHERE rel.relname = 'account_deletion_database_execution_context'
      AND rel.relrowsecurity = true
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS ctx_rel
    CROSS JOIN LATERAL aclexplode(coalesce(ctx_rel.relacl, acldefault('r', ctx_rel.relowner))) AS acl
    WHERE ctx_rel.relname = 'account_deletion_database_execution_context'
      AND acl.grantee = 0
      AND acl.privilege_type IN ('INSERT', 'UPDATE', 'DELETE')
  )
  AND NOT has_table_privilege('authenticated', 'public.account_deletion_database_execution_context', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.account_deletion_database_execution_context', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.account_deletion_database_execution_context', 'DELETE')
  AND NOT has_table_privilege('anon', 'public.account_deletion_database_execution_context', 'INSERT')
  AND NOT has_table_privilege('anon', 'public.account_deletion_database_execution_context', 'UPDATE')
  AND NOT has_table_privilege('anon', 'public.account_deletion_database_execution_context', 'DELETE')
  AND NOT has_table_privilege('service_role', 'public.account_deletion_database_execution_context', 'INSERT')
  AND NOT has_table_privilege('service_role', 'public.account_deletion_database_execution_context', 'UPDATE')
  AND NOT has_table_privilege('service_role', 'public.account_deletion_database_execution_context', 'DELETE');
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'database_execution_context_security_ready',
      'ready', check_ok,
      'detail', CASE
        WHEN check_ok THEN 'execution context owned by postgres with RLS; caller roles cannot mutate table'
        ELSE 'execution context table ownership/grants/RLS misconfigured'
      END
    )
  );
  all_ready := all_ready AND check_ok;

  check_ok := to_regprocedure('public.account_deletion_database_execution_context_is_valid()') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS proc
      JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = proc.pronamespace
      WHERE nsp.nspname = 'public'
        AND proc.proname = 'account_deletion_database_execution_context_is_valid'
        AND proc.prosecdef = true
        AND pg_catalog.pg_get_userbyid(proc.proowner) = 'postgres'
        AND (
          pg_catalog.pg_get_functiondef(proc.oid) LIKE '%search_path TO ''''%'
          OR pg_catalog.pg_get_functiondef(proc.oid) LIKE '%search_path = ''''%'
        )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS ctx_proc
      CROSS JOIN LATERAL aclexplode(coalesce(ctx_proc.proacl, acldefault('f', ctx_proc.proowner))) AS acl
      WHERE ctx_proc.oid = to_regprocedure('public.account_deletion_database_execution_context_is_valid()')
        AND acl.grantee = 0
        AND acl.privilege_type = 'EXECUTE'
    )
    AND NOT has_function_privilege('authenticated', 'public.account_deletion_database_execution_context_is_valid()', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.account_deletion_database_execution_context_is_valid()', 'EXECUTE')
    AND NOT has_function_privilege('service_role', 'public.account_deletion_database_execution_context_is_valid()', 'EXECUTE');
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'database_execution_context_validator_ready',
      'ready', check_ok,
      'detail', CASE
        WHEN check_ok THEN 'execution context validator exists, hardened, and is not caller-executable'
        ELSE 'execution context validator missing or over-exposed'
      END
    )
  );
  all_ready := all_ready AND check_ok;

  check_ok := to_regprocedure(
    'public.account_deletion_story_video_reply_database_mutation_authorized(public.story_video_replies, public.story_video_replies)'
  ) IS NOT NULL
  AND to_regprocedure(
    'public.account_deletion_story_database_mutation_authorized(public.stories, public.stories)'
  ) IS NOT NULL
  AND to_regprocedure(
    'public.account_deletion_prayer_video_response_database_mutation_authorized(public.prayer_video_responses, public.prayer_video_responses)'
  ) IS NOT NULL
  AND to_regprocedure(
    'public.account_deletion_prayer_written_response_database_mutation_authorized(public.prayer_written_responses, public.prayer_written_responses)'
  ) IS NOT NULL
  AND to_regprocedure(
    'public.account_deletion_prayer_update_database_mutation_authorized(public.prayer_updates, public.prayer_updates)'
  ) IS NOT NULL
  AND to_regprocedure(
    'public.account_deletion_inbox_message_database_mutation_authorized(public.inbox_messages, public.inbox_messages)'
  ) IS NOT NULL;
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'database_mutation_authorizers_present',
      'ready', check_ok,
      'detail', CASE
        WHEN check_ok THEN 'all 3B.1 mutation authorization helpers exist'
        ELSE 'one or more 3B.1 mutation authorization helpers missing'
      END
    )
  );
  all_ready := all_ready AND check_ok;

  check_ok := NOT EXISTS (
    SELECT 1
    FROM (
      VALUES
        ('account_deletion_story_video_reply_database_mutation_authorized(public.story_video_replies, public.story_video_replies)'),
        ('account_deletion_story_database_mutation_authorized(public.stories, public.stories)'),
        ('account_deletion_prayer_video_response_database_mutation_authorized(public.prayer_video_responses, public.prayer_video_responses)'),
        ('account_deletion_prayer_written_response_database_mutation_authorized(public.prayer_written_responses, public.prayer_written_responses)'),
        ('account_deletion_prayer_update_database_mutation_authorized(public.prayer_updates, public.prayer_updates)'),
        ('account_deletion_inbox_message_database_mutation_authorized(public.inbox_messages, public.inbox_messages)')
    ) AS required(signature)
    LEFT JOIN LATERAL (
      SELECT
        proc.prosecdef,
        pg_catalog.pg_get_userbyid(proc.proowner) AS owner_name,
        pg_catalog.pg_get_functiondef(proc.oid) AS definition
      FROM pg_catalog.pg_proc AS proc
      WHERE proc.oid = to_regprocedure('public.' || required.signature)
    ) AS meta ON true
    WHERE meta.prosecdef IS DISTINCT FROM true
       OR meta.owner_name IS DISTINCT FROM 'postgres'
       OR (
         meta.definition NOT LIKE '%search_path TO ''''%'
         AND meta.definition NOT LIKE '%search_path = ''''%'
       )
       OR EXISTS (
         SELECT 1
         FROM pg_catalog.pg_proc AS auth_proc
         CROSS JOIN LATERAL aclexplode(coalesce(auth_proc.proacl, acldefault('f', auth_proc.proowner))) AS acl
         WHERE auth_proc.oid = to_regprocedure('public.' || required.signature)
           AND acl.grantee = 0
           AND acl.privilege_type = 'EXECUTE'
       )
       OR has_function_privilege('authenticated', 'public.' || required.signature, 'EXECUTE')
       OR has_function_privilege('anon', 'public.' || required.signature, 'EXECUTE')
       OR has_function_privilege('service_role', 'public.' || required.signature, 'EXECUTE')
  );
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'database_mutation_authorizers_security_ready',
      'ready', check_ok,
      'detail', CASE
        WHEN check_ok THEN 'all mutation authorizers are postgres-owned SECURITY DEFINER helpers with hardened search_path and no caller EXECUTE'
        ELSE 'one or more mutation authorizers are missing or mispermissioned'
      END
    )
  );
  all_ready := all_ready AND check_ok;

  check_ok := NOT EXISTS (
    SELECT 1
    FROM (
      VALUES
        ('stories', 'account_deletion_shared_stories_write_freeze'),
        ('story_video_replies', 'account_deletion_shared_story_video_replies_write_freeze'),
        ('prayer_video_responses', 'account_deletion_shared_prayer_video_responses_write_freeze'),
        ('prayer_written_responses', 'account_deletion_shared_prayer_written_responses_write_freeze'),
        ('prayer_updates', 'account_deletion_shared_prayer_updates_write_freeze'),
        ('inbox_messages', 'account_deletion_shared_inbox_write_freeze')
    ) AS required(table_name, trigger_name)
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_trigger AS trg
      JOIN pg_catalog.pg_class AS rel ON rel.oid = trg.tgrelid
      JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = rel.relnamespace
      WHERE nsp.nspname = 'public'
        AND rel.relname = required.table_name
        AND trg.tgname = required.trigger_name
        AND NOT trg.tgisinternal
    )
  );
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'database_write_freeze_triggers_ready',
      'ready', check_ok,
      'detail', CASE
        WHEN check_ok THEN 'all required 3B.1 write-freeze triggers exist and point to expected functions'
        ELSE 'one or more 3B.1 write-freeze triggers missing or miswired'
      END
    )
  );
  all_ready := all_ready AND check_ok;

  check_ok := NOT EXISTS (
    SELECT 1
    FROM (
      VALUES
        ('stories', 'account_deletion_shared_stories_write_freeze', 'account_deletion_story_database_mutation_authorized'),
        ('story_video_replies', 'account_deletion_shared_story_video_replies_write_freeze', 'account_deletion_story_video_reply_database_mutation_authorized'),
        ('prayer_video_responses', 'account_deletion_shared_prayer_video_responses_write_freeze', 'account_deletion_prayer_video_response_database_mutation_authorized'),
        ('prayer_written_responses', 'account_deletion_shared_prayer_written_responses_write_freeze', 'account_deletion_prayer_written_response_database_mutation_authorized'),
        ('prayer_updates', 'account_deletion_shared_prayer_updates_write_freeze', 'account_deletion_prayer_update_database_mutation_authorized'),
        ('inbox_messages', 'account_deletion_shared_inbox_write_freeze', 'account_deletion_inbox_message_database_mutation_authorized')
    ) AS required(table_name, trigger_name, authorizer_marker)
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_trigger AS trg
      JOIN pg_catalog.pg_class AS rel ON rel.oid = trg.tgrelid
      JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = rel.relnamespace
      JOIN pg_catalog.pg_proc AS proc ON proc.oid = trg.tgfoid
      WHERE nsp.nspname = 'public'
        AND rel.relname = required.table_name
        AND trg.tgname = required.trigger_name
        AND NOT trg.tgisinternal
        AND pg_catalog.pg_get_functiondef(proc.oid) LIKE ('%' || required.authorizer_marker || '%')
    )
  );
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'database_write_freeze_authorization_wiring_ready',
      'ready', check_ok,
      'detail', CASE
        WHEN check_ok THEN 'write-freeze trigger functions invoke expected mutation authorizers'
        ELSE 'one or more write-freeze triggers missing authorization wiring'
      END
    )
  );
  all_ready := all_ready AND check_ok;

  check_ok := EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS proc
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = proc.pronamespace
    WHERE nsp.nspname = 'public'
      AND proc.proname = 'trg_account_deletion_shared_story_id_engagement_write_freeze'
      AND pg_catalog.pg_get_functiondef(proc.oid) NOT LIKE '%database_mutation_authorized%'
      AND pg_catalog.pg_get_functiondef(proc.oid) NOT LIKE '%execution_context_is_valid%'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM (
      VALUES
        ('story_reactions', 'account_deletion_shared_story_reactions_write_freeze'),
        ('saved_content', 'account_deletion_shared_saved_content_write_freeze'),
        ('prayer_follows', 'account_deletion_shared_prayer_follows_write_freeze')
    ) AS required(table_name, trigger_name)
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_trigger AS trg
      JOIN pg_catalog.pg_class AS rel ON rel.oid = trg.tgrelid
      JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = rel.relnamespace
      JOIN pg_catalog.pg_proc AS proc ON proc.oid = trg.tgfoid
      WHERE nsp.nspname = 'public'
        AND rel.relname = required.table_name
        AND trg.tgname = required.trigger_name
        AND proc.proname = 'trg_account_deletion_shared_story_id_engagement_write_freeze'
        AND NOT trg.tgisinternal
    )
  );
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'database_engagement_freeze_no_executor_bypass_ready',
      'ready', check_ok,
      'detail', CASE
        WHEN check_ok THEN 'engagement write-freeze triggers remain strict with no executor authorization bypass'
        ELSE 'engagement write-freeze triggers missing or unexpectedly expose executor authorization'
      END
    )
  );
  all_ready := all_ready AND check_ok;

  check_ok := to_regclass('public.account_deletion_story_freeze_scope') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint AS con
      JOIN pg_catalog.pg_class AS rel ON rel.oid = con.conrelid
      WHERE rel.relname = 'account_deletion_story_freeze_scope'
        AND con.contype = 'p'
        AND pg_get_constraintdef(con.oid) LIKE '%deletion_request_id%'
        AND pg_get_constraintdef(con.oid) LIKE '%story_id%'
    )
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.pg_indexes AS idx
      WHERE idx.schemaname = 'public'
        AND idx.tablename = 'account_deletion_story_freeze_scope'
        AND idx.indexname = 'account_deletion_story_freeze_scope_story_request_idx'
    )
    AND pg_catalog.pg_get_userbyid(
      (SELECT relowner FROM pg_catalog.pg_class WHERE relname = 'account_deletion_story_freeze_scope')
    ) = 'postgres'
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class AS scope_rel
      WHERE scope_rel.relname = 'account_deletion_story_freeze_scope'
        AND scope_rel.relrowsecurity = true
    )
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class AS scope_rel
      CROSS JOIN LATERAL aclexplode(coalesce(scope_rel.relacl, acldefault('r', scope_rel.relowner))) AS acl
      WHERE scope_rel.relname = 'account_deletion_story_freeze_scope'
        AND acl.grantee = 0
        AND acl.privilege_type IN ('INSERT', 'UPDATE', 'DELETE')
    )
    AND NOT has_table_privilege('authenticated', 'public.account_deletion_story_freeze_scope', 'INSERT')
    AND NOT has_table_privilege('anon', 'public.account_deletion_story_freeze_scope', 'INSERT')
    AND NOT has_table_privilege('service_role', 'public.account_deletion_story_freeze_scope', 'INSERT');
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'story_freeze_scope_table_ready',
      'ready', check_ok,
      'detail', CASE
        WHEN check_ok THEN 'durable story freeze scope table exists with PK, index, ownership, RLS, and revoked caller privileges'
        ELSE 'story freeze scope table missing or misconfigured'
      END
    )
  );
  all_ready := all_ready AND check_ok;

  check_ok := EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS proc
    WHERE proc.pronamespace = 'public'::regnamespace
      AND proc.proname = 'account_deletion_story_shared_write_blocked'
      AND pg_catalog.pg_get_functiondef(proc.oid) LIKE '%account_deletion_story_freeze_scope%'
      AND pg_catalog.pg_get_functiondef(proc.oid) LIKE '%deletion_in_progress%'
  )
  AND EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS proc
    WHERE proc.pronamespace = 'public'::regnamespace
      AND proc.proname = 'story_video_reply_shared_write_blocked'
      AND pg_catalog.pg_get_functiondef(proc.oid) LIKE '%account_deletion_story_shared_write_blocked%'
  )
  AND EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS proc
    WHERE proc.pronamespace = 'public'::regnamespace
      AND proc.proname = 'trg_account_deletion_shared_stories_write_freeze'
      AND pg_catalog.pg_get_functiondef(proc.oid) LIKE '%account_deletion_story_shared_write_blocked%'
  );
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'story_freeze_scope_lookup_wiring_ready',
      'ready', check_ok,
      'detail', CASE
        WHEN check_ok THEN 'story and reply shared-freeze helpers reference durable scope lookup'
        ELSE 'durable story freeze scope lookup not wired into shared-freeze helpers'
      END
    )
  );
  all_ready := all_ready AND check_ok;

  check_ok := EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS proc
    WHERE proc.pronamespace = 'public'::regnamespace
      AND proc.proname = 'execute_account_deletion_nondestructive_database_stage'
      AND pg_catalog.pg_get_functiondef(proc.oid) LIKE '%account_deletion_database_execution_context%'
      AND pg_catalog.pg_get_functiondef(proc.oid) LIKE '%account_deletion_story_freeze_scope%'
  );
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'database_executor_context_lifecycle_ready',
      'ready', check_ok,
      'detail', CASE
        WHEN check_ok THEN 'executor references execution context lifecycle and story freeze scope population'
        ELSE 'executor missing execution context lifecycle or story freeze scope population'
      END
    )
  );
  all_ready := all_ready AND check_ok;

  RETURN jsonb_build_object(
    'ready', all_ready,
    'checked_at', to_jsonb(now()),
    'prerequisites', prerequisites
  );
END;
$$;

ALTER FUNCTION public.verify_account_deletion_nondestructive_database_stage_ready() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.verify_account_deletion_nondestructive_database_stage_ready() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_account_deletion_nondestructive_database_stage_ready() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.verify_account_deletion_nondestructive_database_stage_ready() TO service_role;

COMMENT ON FUNCTION public.verify_account_deletion_nondestructive_database_stage_ready() IS
  'Read-only catalog probe for Phase 2C.3B.1 nondestructive database stage readiness. '
  'Checks executor RPC, security, grants, database_completed stage CHECK, tombstone helper, '
  'and acquisition foundation readiness. Does not enable execution. service_role only.';

-- ---------------------------------------------------------------------------
-- G) Compose schema execution readiness with 3B.1 probe
-- ---------------------------------------------------------------------------

ALTER FUNCTION public.verify_account_deletion_schema_execution_ready()
  RENAME TO verify_account_deletion_schema_execution_ready_before_3b1;

CREATE OR REPLACE FUNCTION public.verify_account_deletion_schema_execution_ready()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  core jsonb;
  nondestructive jsonb;
  prerequisites jsonb;
  all_ready boolean;
BEGIN
  core := public.verify_account_deletion_schema_execution_ready_before_3b1();
  nondestructive := public.verify_account_deletion_nondestructive_database_stage_ready();

  prerequisites :=
    coalesce(core->'prerequisites', '[]'::jsonb)
    || coalesce(nondestructive->'prerequisites', '[]'::jsonb);

  all_ready :=
    coalesce((core->>'ready')::boolean, false)
    AND coalesce((nondestructive->>'ready')::boolean, false);

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
  'Read-only live catalog probe for account-deletion schema + write-freeze + execution + acquisition + '
  'nondestructive database stage readiness. Composes verify_account_deletion_schema_execution_ready_before_3b1() '
  'with verify_account_deletion_nondestructive_database_stage_ready(). Fail-closed. service_role only. '
  'Does not enable execution.';

COMMIT;
