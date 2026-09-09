-- Phase 4C.7B.1E.2C.2 / 2C.2A: Account deletion execution foundation + shared write-freeze
-- Local migration only — apply manually via Supabase SQL Editor.
-- NO account deletion execution, NO auth delete, NO storage delete, NO request DML.
--
-- Establishes:
--   - durable account_deletion_execution_attempts audit/state table
--   - trigger-enforced shared-party write freeze while target is deletion_in_progress
--     (INSERT/UPDATE/DELETE — applies to authenticated AND service_role)
--   - internal-only deletion-status helpers (no authenticated EXECUTE — no enumeration)
--   - read-only execution lock prerequisite helpers
--   - extended schema-readiness probe (preserves all prior prerequisites)

BEGIN;

-- ---------------------------------------------------------------------------
-- Fail-closed preconditions (2C.2A — catalog-verified prior state)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  missing text[] := ARRAY[]::text[];
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS rel
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public' AND rel.relname = 'account_deletion_requests'
  ) THEN
    RAISE EXCEPTION '2C.2A precondition failed: public.account_deletion_requests missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS proc
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = proc.pronamespace
    WHERE nsp.nspname = 'public'
      AND proc.proname = 'current_user_account_write_blocked'
      AND proc.prosecdef = true
      AND proc.provolatile = 's'
  ) THEN
    RAISE EXCEPTION '2C.2A precondition failed: current_user_account_write_blocked() missing or wrong security — apply 2B.0A first';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS rel
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'story_video_replies'
      AND rel.relrowsecurity = true
  ) THEN
    missing := array_append(missing, 'story_video_replies RLS not enabled');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies AS pol
    WHERE pol.schemaname = 'public'
      AND pol.tablename = 'story_video_replies'
      AND pol.policyname = 'account_deletion_write_block_insert'
      AND pol.permissive = 'RESTRICTIVE'
  ) THEN
    missing := array_append(missing, '2B.0A story_video_replies account_deletion_write_block_insert');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies AS pol
    WHERE pol.schemaname = 'public'
      AND pol.tablename = 'story_video_replies'
      AND pol.policyname = 'Users can add video replies'
      AND pol.cmd = 'INSERT'
  ) THEN
    missing := array_append(missing, 'baseline story_video_replies INSERT policy');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies AS pol
    WHERE pol.schemaname = 'public'
      AND pol.tablename = 'story_video_replies'
      AND pol.policyname = 'Users can update their video replies'
      AND pol.cmd = 'UPDATE'
  ) THEN
    missing := array_append(missing, 'baseline story_video_replies UPDATE policy');
  END IF;

  IF NOT coalesce((
    SELECT c.is_nullable = 'YES'
    FROM information_schema.columns AS c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'story_video_replies'
      AND c.column_name = 'user_id'
  ), false) THEN
    missing := array_append(missing, 'story_video_replies.user_id not nullable');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS con
    JOIN pg_catalog.pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    JOIN pg_catalog.pg_attribute AS src_attr
      ON src_attr.attrelid = rel.oid AND src_attr.attnum = ANY (con.conkey)
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'story_video_replies'
      AND con.contype = 'f'
      AND src_attr.attname = 'user_id'
      AND con.confdeltype = 'n'
  ) THEN
    missing := array_append(missing, 'story_video_replies.user_id ON DELETE SET NULL FK — apply 2B.2 first');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS con
    JOIN pg_catalog.pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    JOIN pg_catalog.pg_attribute AS src_attr
      ON src_attr.attrelid = rel.oid AND src_attr.attnum = ANY (con.conkey)
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'story_video_replies'
      AND con.contype = 'f'
      AND src_attr.attname = 'recipient_user_id'
      AND con.confdeltype = 'n'
  ) THEN
    missing := array_append(missing, 'story_video_replies.recipient_user_id ON DELETE SET NULL FK — apply 2B.2 first');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS con
    JOIN pg_catalog.pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    JOIN pg_catalog.pg_attribute AS src_attr
      ON src_attr.attrelid = rel.oid AND src_attr.attnum = ANY (con.conkey)
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'story_video_replies'
      AND con.contype = 'f'
      AND src_attr.attname = 'parent_reply_id'
      AND con.confdeltype = 'n'
  ) THEN
    missing := array_append(missing, 'story_video_replies.parent_reply_id ON DELETE SET NULL FK — apply 2B.3a first');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS con
    JOIN pg_catalog.pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    JOIN pg_catalog.pg_attribute AS src_attr
      ON src_attr.attrelid = rel.oid AND src_attr.attnum = ANY (con.conkey)
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'story_video_replies'
      AND con.contype = 'f'
      AND src_attr.attname = 'story_id'
      AND con.confdeltype = 'c'
  ) THEN
    missing := array_append(missing, 'story_video_replies.story_id ON DELETE CASCADE FK (expected unchanged)');
  END IF;

  IF cardinality(missing) > 0 THEN
    RAISE EXCEPTION '2C.2A precondition failed: %', array_to_string(missing, '; ');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- A) Execution attempt audit/state table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.account_deletion_execution_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deletion_request_id uuid NOT NULL
    REFERENCES public.account_deletion_requests(id) ON DELETE RESTRICT,
  target_user_id uuid NOT NULL,
  initiated_by uuid NULL
    REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL,
  stage text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  last_error_code text NULL,
  last_error_detail_safe text NULL,
  retry_count integer NOT NULL DEFAULT 0,
  story_inventory_fingerprint text NULL,
  reply_inventory_fingerprint text NULL,
  database_plan_fingerprint text NULL,
  database_rows_affected jsonb NOT NULL DEFAULT '{}'::jsonb,
  storage_objects_expected integer NULL,
  storage_objects_deleted integer NULL,
  auth_delete_started_at timestamptz NULL,
  auth_deleted_at timestamptz NULL,
  CONSTRAINT account_deletion_execution_attempts_status_check CHECK (
    status = ANY (ARRAY['active'::text, 'completed'::text, 'failed'::text, 'blocked'::text])
  ),
  CONSTRAINT account_deletion_execution_attempts_stage_check CHECK (
    stage = ANY (
      ARRAY[
        'preflight'::text,
        'lock_acquired'::text,
        'sessions_pending'::text,
        'inventory'::text,
        'database'::text,
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
  ),
  CONSTRAINT account_deletion_execution_attempts_retry_count_nonnegative CHECK (retry_count >= 0)
);

COMMENT ON TABLE public.account_deletion_execution_attempts IS
  'Durable execution-attempt audit/state for account deletion orchestration. '
  'No substantive deleted content — fingerprints and safe metadata only. '
  'Not user-readable; service_role orchestrator access only.';

CREATE UNIQUE INDEX IF NOT EXISTS account_deletion_execution_attempts_one_active_per_request_idx
  ON public.account_deletion_execution_attempts (deletion_request_id)
  WHERE status = 'active'::text;

CREATE INDEX IF NOT EXISTS account_deletion_execution_attempts_target_user_id_idx
  ON public.account_deletion_execution_attempts (target_user_id);

CREATE INDEX IF NOT EXISTS account_deletion_execution_attempts_request_started_idx
  ON public.account_deletion_execution_attempts (deletion_request_id, started_at DESC);

ALTER TABLE public.account_deletion_execution_attempts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.account_deletion_execution_attempts FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.account_deletion_execution_attempts TO service_role;

CREATE OR REPLACE FUNCTION public.touch_account_deletion_execution_attempt_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.touch_account_deletion_execution_attempt_updated_at() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.touch_account_deletion_execution_attempt_updated_at() FROM PUBLIC;

DROP TRIGGER IF EXISTS account_deletion_execution_attempts_updated_at
  ON public.account_deletion_execution_attempts;

CREATE TRIGGER account_deletion_execution_attempts_updated_at
  BEFORE UPDATE ON public.account_deletion_execution_attempts
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_account_deletion_execution_attempt_updated_at();

-- ---------------------------------------------------------------------------
-- B) Internal shared-freeze helpers (trigger-only — NO authenticated EXECUTE)
--     REPLY_TREE_DEPTH_SAFETY_CAP = 100 (aligned with 2B.3b inventory)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.account_user_deletion_in_progress(p_target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    p_target_user_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.account_deletion_requests AS request_row
      WHERE request_row.status = 'deletion_in_progress'::text
        AND (
          request_row.user_id = p_target_user_id
          OR (
            request_row.user_id IS NULL
            AND request_row.target_user_id_snapshot = p_target_user_id
          )
        )
    );
$$;

ALTER FUNCTION public.account_user_deletion_in_progress(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_user_deletion_in_progress(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_user_deletion_in_progress(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.account_user_deletion_in_progress(uuid) FROM anon;

COMMENT ON FUNCTION public.account_user_deletion_in_progress(uuid) IS
  'Internal trigger-only helper. Returns true when target has deletion_in_progress request. '
  'Matches user_id while populated; after auth deletion matches target_user_id_snapshot. '
  'NOT granted to authenticated — prevents arbitrary deletion-status enumeration.';

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
    );
$$;

ALTER FUNCTION public.account_deletion_story_shared_write_blocked(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_story_shared_write_blocked(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_deletion_story_shared_write_blocked(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_story_shared_write_blocked(uuid) FROM anon;

COMMENT ON FUNCTION public.account_deletion_story_shared_write_blocked(uuid) IS
  'Internal trigger-only. Blocks story-associated writes when owner is deletion_in_progress OR '
  'an active execution attempt associates the story with the deletion target (covers owner NULL race).';

CREATE OR REPLACE FUNCTION public.story_video_reply_row_targets_deletion_in_progress(
  p_user_id uuid,
  p_recipient_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    (p_user_id IS NOT NULL AND public.account_user_deletion_in_progress(p_user_id))
    OR (
      p_recipient_user_id IS NOT NULL
      AND public.account_user_deletion_in_progress(p_recipient_user_id)
    );
$$;

ALTER FUNCTION public.story_video_reply_row_targets_deletion_in_progress(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.story_video_reply_row_targets_deletion_in_progress(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.story_video_reply_row_targets_deletion_in_progress(uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.story_video_reply_row_targets_deletion_in_progress(uuid, uuid) FROM anon;

CREATE OR REPLACE FUNCTION public.story_video_reply_parent_thread_blocked(
  p_parent_reply_id uuid,
  p_story_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_id uuid;
  current_story_id uuid;
  current_user_id uuid;
  current_recipient uuid;
  current_parent uuid;
  depth integer := 0;
  visited uuid[] := ARRAY[]::uuid[];
BEGIN
  IF p_parent_reply_id IS NULL THEN
    RETURN false;
  END IF;

  current_id := p_parent_reply_id;

  WHILE current_id IS NOT NULL LOOP
    IF current_id = ANY (visited) THEN
      RETURN true;
    END IF;
    visited := array_append(visited, current_id);
    depth := depth + 1;
    IF depth > 100 THEN
      RETURN true;
    END IF;

    SELECT r.story_id, r.user_id, r.recipient_user_id, r.parent_reply_id
    INTO current_story_id, current_user_id, current_recipient, current_parent
    FROM public.story_video_replies AS r
    WHERE r.id = current_id;

    IF NOT FOUND THEN
      RETURN true;
    END IF;

    IF current_story_id IS DISTINCT FROM p_story_id THEN
      RETURN true;
    END IF;

    IF public.story_video_reply_row_targets_deletion_in_progress(
      current_user_id,
      current_recipient
    ) THEN
      RETURN true;
    END IF;

    current_id := current_parent;
  END LOOP;

  RETURN false;
END;
$$;

ALTER FUNCTION public.story_video_reply_parent_thread_blocked(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.story_video_reply_parent_thread_blocked(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.story_video_reply_parent_thread_blocked(uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.story_video_reply_parent_thread_blocked(uuid, uuid) FROM anon;

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
    OR public.story_video_reply_parent_thread_blocked(p_parent_reply_id, p_story_id);
$$;

ALTER FUNCTION public.story_video_reply_shared_write_blocked(uuid, uuid, uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.story_video_reply_shared_write_blocked(uuid, uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.story_video_reply_shared_write_blocked(uuid, uuid, uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.story_video_reply_shared_write_blocked(uuid, uuid, uuid, uuid) FROM anon;

COMMENT ON FUNCTION public.story_video_reply_shared_write_blocked(uuid, uuid, uuid, uuid) IS
  'Internal trigger-only. True when INSERT/UPDATE/DELETE on story_video_replies must be blocked '
  'because it would create or mutate evidence tied to a deletion_in_progress target.';

CREATE OR REPLACE FUNCTION public.account_deletion_inbox_row_shared_write_blocked(
  p_recipient_user_id uuid,
  p_sender_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    (p_recipient_user_id IS NOT NULL AND public.account_user_deletion_in_progress(p_recipient_user_id))
    OR (
      p_sender_user_id IS NOT NULL
      AND public.account_user_deletion_in_progress(p_sender_user_id)
    );
$$;

ALTER FUNCTION public.account_deletion_inbox_row_shared_write_blocked(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_inbox_row_shared_write_blocked(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_deletion_inbox_row_shared_write_blocked(uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_inbox_row_shared_write_blocked(uuid, uuid) FROM anon;

-- ---------------------------------------------------------------------------
-- C) Trigger-enforced shared write freeze (authenticated + service_role)
-- ---------------------------------------------------------------------------

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

DROP TRIGGER IF EXISTS account_deletion_shared_story_video_replies_write_freeze
  ON public.story_video_replies;

CREATE TRIGGER account_deletion_shared_story_video_replies_write_freeze
  BEFORE INSERT OR UPDATE OR DELETE ON public.story_video_replies
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_account_deletion_shared_story_video_replies_write_freeze();

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

-- Remove prior 2C.2 RLS shared-freeze policies if present (superseded by triggers)
DROP POLICY IF EXISTS account_deletion_shared_reply_insert_block ON public.story_video_replies;
DROP POLICY IF EXISTS account_deletion_shared_story_reactions_insert_block ON public.story_reactions;
DROP POLICY IF EXISTS account_deletion_shared_saved_content_insert_block ON public.saved_content;
DROP POLICY IF EXISTS account_deletion_shared_prayer_follows_insert_block ON public.prayer_follows;
DROP POLICY IF EXISTS account_deletion_shared_prayer_video_responses_insert_block ON public.prayer_video_responses;
DROP POLICY IF EXISTS account_deletion_shared_prayer_written_responses_insert_block ON public.prayer_written_responses;
DROP POLICY IF EXISTS account_deletion_shared_prayer_updates_insert_block ON public.prayer_updates;
DROP POLICY IF EXISTS account_deletion_shared_content_reports_insert_block ON public.content_reports;
DROP POLICY IF EXISTS account_deletion_shared_inbox_insert_block ON public.inbox_messages;
DROP POLICY IF EXISTS account_deletion_shared_blocked_users_insert_block ON public.blocked_users;

DROP TRIGGER IF EXISTS account_deletion_shared_story_reactions_write_freeze ON public.story_reactions;
CREATE TRIGGER account_deletion_shared_story_reactions_write_freeze
  BEFORE INSERT OR UPDATE OR DELETE ON public.story_reactions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_account_deletion_shared_story_id_engagement_write_freeze();

DROP TRIGGER IF EXISTS account_deletion_shared_saved_content_write_freeze ON public.saved_content;
CREATE TRIGGER account_deletion_shared_saved_content_write_freeze
  BEFORE INSERT OR UPDATE OR DELETE ON public.saved_content
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_account_deletion_shared_story_id_engagement_write_freeze();

DROP TRIGGER IF EXISTS account_deletion_shared_prayer_follows_write_freeze ON public.prayer_follows;
CREATE TRIGGER account_deletion_shared_prayer_follows_write_freeze
  BEFORE INSERT OR UPDATE OR DELETE ON public.prayer_follows
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_account_deletion_shared_story_id_engagement_write_freeze();

DROP TRIGGER IF EXISTS account_deletion_shared_prayer_video_responses_write_freeze ON public.prayer_video_responses;
CREATE TRIGGER account_deletion_shared_prayer_video_responses_write_freeze
  BEFORE INSERT OR UPDATE OR DELETE ON public.prayer_video_responses
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_account_deletion_shared_story_id_engagement_write_freeze();

DROP TRIGGER IF EXISTS account_deletion_shared_prayer_written_responses_write_freeze ON public.prayer_written_responses;
CREATE TRIGGER account_deletion_shared_prayer_written_responses_write_freeze
  BEFORE INSERT OR UPDATE OR DELETE ON public.prayer_written_responses
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_account_deletion_shared_story_id_engagement_write_freeze();

DROP TRIGGER IF EXISTS account_deletion_shared_prayer_updates_write_freeze ON public.prayer_updates;
CREATE TRIGGER account_deletion_shared_prayer_updates_write_freeze
  BEFORE INSERT OR UPDATE OR DELETE ON public.prayer_updates
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_account_deletion_shared_story_id_engagement_write_freeze();

DROP TRIGGER IF EXISTS account_deletion_shared_inbox_write_freeze ON public.inbox_messages;
CREATE TRIGGER account_deletion_shared_inbox_write_freeze
  BEFORE INSERT OR UPDATE OR DELETE ON public.inbox_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_account_deletion_shared_inbox_write_freeze();

-- content_reports and blocked_users: intentionally NOT frozen (2C.2A — preserve abuse reporting; low staleness risk)

-- ---------------------------------------------------------------------------
-- D) Read-only execution lock prerequisite helpers (no mutations)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.read_account_deletion_execution_request_context(
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  ctx record;
BEGIN
  IF p_request_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_request_id');
  END IF;

  SELECT
    r.id,
    r.status,
    r.user_id,
    r.target_user_id_snapshot,
    r.approved_at,
    r.approved_by,
    r.execution_started_at,
    r.execution_completed_at
  INTO ctx
  FROM public.account_deletion_requests AS r
  WHERE r.id = p_request_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'request_not_found');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'request_id', ctx.id,
    'status', ctx.status,
    'user_id', ctx.user_id,
    'target_user_id_snapshot', ctx.target_user_id_snapshot,
    'approved_at', ctx.approved_at,
    'approved_by', ctx.approved_by,
    'execution_started_at', ctx.execution_started_at,
    'execution_completed_at', ctx.execution_completed_at
  );
END;
$$;

ALTER FUNCTION public.read_account_deletion_execution_request_context(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.read_account_deletion_execution_request_context(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.read_account_deletion_execution_request_context(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.read_account_deletion_execution_request_context(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.validate_account_deletion_execution_lock_prerequisites(
  p_request_id uuid,
  p_expected_target_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  ctx record;
  resolved_target uuid;
BEGIN
  IF p_request_id IS NULL OR p_expected_target_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_arguments');
  END IF;

  SELECT
    r.id,
    r.status,
    r.user_id,
    r.target_user_id_snapshot,
    r.approved_at
  INTO ctx
  FROM public.account_deletion_requests AS r
  WHERE r.id = p_request_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'request_not_found');
  END IF;

  resolved_target := coalesce(ctx.user_id, ctx.target_user_id_snapshot);
  IF resolved_target IS DISTINCT FROM p_expected_target_user_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'target_mismatch');
  END IF;

  IF ctx.status NOT IN ('approved'::text, 'deletion_in_progress'::text) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'invalid_status',
      'status', ctx.status
    );
  END IF;

  IF ctx.approved_at IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_approved');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'request_id', ctx.id,
    'status', ctx.status,
    'target_user_id', resolved_target
  );
END;
$$;

ALTER FUNCTION public.validate_account_deletion_execution_lock_prerequisites(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.validate_account_deletion_execution_lock_prerequisites(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_account_deletion_execution_lock_prerequisites(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.validate_account_deletion_execution_lock_prerequisites(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.validate_account_deletion_execution_lock_prerequisites(uuid, uuid) IS
  'Read-only execution lock prerequisite validation — no row mutations. '
  'Future executor must still acquire request-row FOR UPDATE and advisory lock inside a DB transaction.';

-- ---------------------------------------------------------------------------
-- E) Read-only execution foundation readiness probe
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.verify_account_deletion_execution_foundation_ready()
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
  engagement_tables text[] := ARRAY[
    'story_reactions',
    'saved_content',
    'prayer_follows',
    'prayer_video_responses',
    'prayer_written_responses',
    'prayer_updates'
  ];
  engagement_table text;
BEGIN
  check_ok := EXISTS (
    SELECT 1
    FROM information_schema.columns AS c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'account_deletion_execution_attempts'
      AND c.column_name = 'deletion_request_id'
      AND c.is_nullable = 'NO'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.columns AS c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'account_deletion_execution_attempts'
      AND c.column_name = 'target_user_id'
      AND c.is_nullable = 'NO'
  ) AND EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS con
    JOIN pg_catalog.pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'account_deletion_execution_attempts'
      AND con.contype = 'f'
      AND con.confdeltype = 'r'
  );
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'execution_attempt_table_ready',
    'satisfied', check_ok,
    'detail', 'account_deletion_execution_attempts has required NOT NULL columns and deletion_request_id ON DELETE RESTRICT FK'
  ));
  all_ready := all_ready AND check_ok;

  check_ok := EXISTS (
    SELECT 1
    FROM pg_catalog.pg_indexes AS idx
    WHERE idx.schemaname = 'public'
      AND idx.tablename = 'account_deletion_execution_attempts'
      AND idx.indexname = 'account_deletion_execution_attempts_one_active_per_request_idx'
      AND idx.indexdef ILIKE '%UNIQUE%'
      AND idx.indexdef ILIKE '%deletion_request_id%'
      AND idx.indexdef ILIKE '%status%'
      AND idx.indexdef ILIKE '%active%'
  );
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'execution_attempt_single_active_constraint',
    'satisfied', check_ok,
    'detail', 'Partial unique index on deletion_request_id WHERE status = active'
  ));
  all_ready := all_ready AND check_ok;

  check_ok := EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS proc
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = proc.pronamespace
    WHERE nsp.nspname = 'public'
      AND proc.proname = 'account_user_deletion_in_progress'
      AND proc.prosecdef = true
  ) AND NOT pg_catalog.has_function_privilege('authenticated', 'public.account_user_deletion_in_progress(uuid)', 'EXECUTE');
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'shared_target_freeze_helper_ready',
    'satisfied', check_ok,
    'detail', 'Internal account_user_deletion_in_progress(uuid) exists and is NOT executable by authenticated'
  ));
  all_ready := all_ready AND check_ok;

  check_ok := EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS trg
    JOIN pg_catalog.pg_class AS rel ON rel.oid = trg.tgrelid
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'story_video_replies'
      AND trg.tgname = 'account_deletion_shared_story_video_replies_write_freeze'
      AND trg.tgenabled = 'O'
  ) AND EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS proc
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = proc.pronamespace
    WHERE nsp.nspname = 'public'
      AND proc.proname = 'trg_account_deletion_shared_story_video_replies_write_freeze'
      AND proc.prosecdef = true
  );
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'story_video_replies_shared_write_freeze_ready',
    'satisfied', check_ok,
    'detail', 'story_video_replies BEFORE INSERT/UPDATE/DELETE trigger enforces shared write freeze (service_role safe)'
  ));
  all_ready := all_ready AND check_ok;

  check_ok := true;
  FOREACH engagement_table IN ARRAY engagement_tables
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_trigger AS trg
      JOIN pg_catalog.pg_class AS rel ON rel.oid = trg.tgrelid
      JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = rel.relnamespace
      WHERE nsp.nspname = 'public'
        AND rel.relname = engagement_table
        AND trg.tgname LIKE 'account_deletion_shared_%_write_freeze'
        AND trg.tgenabled = 'O'
    ) THEN
      check_ok := false;
      EXIT;
    END IF;
  END LOOP;
  check_ok := check_ok AND EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS trg
    JOIN pg_catalog.pg_class AS rel ON rel.oid = trg.tgrelid
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'inbox_messages'
      AND trg.tgname = 'account_deletion_shared_inbox_write_freeze'
      AND trg.tgenabled = 'O'
  );
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'shared_engagement_write_freeze_ready',
    'satisfied', check_ok,
    'detail', 'All shared engagement tables and inbox_messages have active write-freeze triggers'
  ));
  all_ready := all_ready AND check_ok;

  check_ok := EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS proc
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = proc.pronamespace
    WHERE nsp.nspname = 'public'
      AND proc.proname = 'validate_account_deletion_execution_lock_prerequisites'
      AND proc.prosecdef = true
  ) AND NOT pg_catalog.has_function_privilege(
    'authenticated',
    'public.validate_account_deletion_execution_lock_prerequisites(uuid, uuid)',
    'EXECUTE'
  ) AND EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS proc
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = proc.pronamespace
    WHERE nsp.nspname = 'public'
      AND proc.proname = 'read_account_deletion_execution_request_context'
      AND proc.prosecdef = true
  ) AND NOT pg_catalog.has_function_privilege(
    'authenticated',
    'public.read_account_deletion_execution_request_context(uuid)',
    'EXECUTE'
  );
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'execution_foundation_security_ready',
    'satisfied', check_ok,
    'detail', 'Read-only execution lock helpers are SECURITY DEFINER and service_role-only'
  ));
  all_ready := all_ready AND check_ok;

  RETURN jsonb_build_object(
    'ready', all_ready,
    'checked_at', to_jsonb(now()),
    'prerequisites', prerequisites
  );
END;
$$;

ALTER FUNCTION public.verify_account_deletion_execution_foundation_ready() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.verify_account_deletion_execution_foundation_ready() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_account_deletion_execution_foundation_ready() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.verify_account_deletion_execution_foundation_ready() TO service_role;

-- ---------------------------------------------------------------------------
-- F) Extend live catalog schema-readiness probe (preserves all prior checks)
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
  foundation jsonb;
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

  -- 6a) story_video_replies.user_id nullable + SET NULL auth FK (catalog-aligned)
  check_ok := coalesce((
    SELECT c.is_nullable = 'YES'
    FROM information_schema.columns AS c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'story_video_replies'
      AND c.column_name = 'user_id'
  ), false) AND EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS con
    JOIN pg_catalog.pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    JOIN pg_catalog.pg_class AS frel ON frel.oid = con.confrelid
    JOIN pg_catalog.pg_namespace AS fnsp ON fnsp.oid = frel.relnamespace
    JOIN pg_catalog.pg_attribute AS src_attr
      ON src_attr.attrelid = rel.oid AND src_attr.attnum = con.conkey[1]
    JOIN pg_catalog.pg_attribute AS dst_attr
      ON dst_attr.attrelid = frel.oid AND dst_attr.attnum = con.confkey[1]
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'story_video_replies'
      AND con.contype = 'f'
      AND cardinality(con.conkey) = 1
      AND cardinality(con.confkey) = 1
      AND src_attr.attname = 'user_id'
      AND fnsp.nspname = 'auth'
      AND frel.relname = 'users'
      AND dst_attr.attname = 'id'
      AND con.confdeltype = 'n'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS con
    JOIN pg_catalog.pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    JOIN pg_catalog.pg_attribute AS src_attr
      ON src_attr.attrelid = rel.oid AND src_attr.attnum = ANY (con.conkey)
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'story_video_replies'
      AND con.contype = 'f'
      AND src_attr.attname = 'user_id'
      AND con.confdeltype = 'c'
  );
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'story_video_replies_user_id_set_null',
    'satisfied', check_ok,
    'detail', 'story_video_replies.user_id nullable with catalog-verified ON DELETE SET NULL auth.users(id) FK'
  ));
  all_ready := all_ready AND check_ok;

  -- 6b) story_video_replies.recipient_user_id nullable + SET NULL auth FK (catalog-aligned)
  check_ok := coalesce((
    SELECT c.is_nullable = 'YES'
    FROM information_schema.columns AS c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'story_video_replies'
      AND c.column_name = 'recipient_user_id'
  ), false) AND EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS con
    JOIN pg_catalog.pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    JOIN pg_catalog.pg_class AS frel ON frel.oid = con.confrelid
    JOIN pg_catalog.pg_namespace AS fnsp ON fnsp.oid = frel.relnamespace
    JOIN pg_catalog.pg_attribute AS src_attr
      ON src_attr.attrelid = rel.oid AND src_attr.attnum = con.conkey[1]
    JOIN pg_catalog.pg_attribute AS dst_attr
      ON dst_attr.attrelid = frel.oid AND dst_attr.attnum = con.confkey[1]
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'story_video_replies'
      AND con.contype = 'f'
      AND cardinality(con.conkey) = 1
      AND cardinality(con.confkey) = 1
      AND src_attr.attname = 'recipient_user_id'
      AND fnsp.nspname = 'auth'
      AND frel.relname = 'users'
      AND dst_attr.attname = 'id'
      AND con.confdeltype = 'n'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS con
    JOIN pg_catalog.pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    JOIN pg_catalog.pg_attribute AS src_attr
      ON src_attr.attrelid = rel.oid AND src_attr.attnum = ANY (con.conkey)
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'story_video_replies'
      AND con.contype = 'f'
      AND src_attr.attname = 'recipient_user_id'
      AND con.confdeltype = 'c'
  );
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'story_video_replies_recipient_user_id_set_null',
    'satisfied', check_ok,
    'detail', 'story_video_replies.recipient_user_id nullable with catalog-verified ON DELETE SET NULL auth.users(id) FK'
  ));
  all_ready := all_ready AND check_ok;

  -- 6c) story_video_replies.parent_reply_id nullable + SET NULL self FK (catalog-aligned)
  check_ok := coalesce((
    SELECT c.is_nullable = 'YES'
    FROM information_schema.columns AS c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'story_video_replies'
      AND c.column_name = 'parent_reply_id'
  ), false) AND EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS con
    JOIN pg_catalog.pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    JOIN pg_catalog.pg_class AS frel ON frel.oid = con.confrelid
    JOIN pg_catalog.pg_namespace AS fnsp ON fnsp.oid = frel.relnamespace
    JOIN pg_catalog.pg_attribute AS src_attr
      ON src_attr.attrelid = rel.oid AND src_attr.attnum = con.conkey[1]
    JOIN pg_catalog.pg_attribute AS dst_attr
      ON dst_attr.attrelid = frel.oid AND dst_attr.attnum = con.confkey[1]
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'story_video_replies'
      AND con.contype = 'f'
      AND cardinality(con.conkey) = 1
      AND cardinality(con.confkey) = 1
      AND src_attr.attname = 'parent_reply_id'
      AND fnsp.nspname = 'public'
      AND frel.relname = 'story_video_replies'
      AND dst_attr.attname = 'id'
      AND con.confdeltype = 'n'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS con
    JOIN pg_catalog.pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    JOIN pg_catalog.pg_attribute AS src_attr
      ON src_attr.attrelid = rel.oid AND src_attr.attnum = ANY (con.conkey)
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'story_video_replies'
      AND con.contype = 'f'
      AND src_attr.attname = 'parent_reply_id'
      AND con.confdeltype = 'c'
  ) AND (
    SELECT count(*)
    FROM pg_catalog.pg_constraint AS con
    JOIN pg_catalog.pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    JOIN pg_catalog.pg_attribute AS src_attr
      ON src_attr.attrelid = rel.oid AND src_attr.attnum = ANY (con.conkey)
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'story_video_replies'
      AND con.contype = 'f'
      AND src_attr.attname = 'parent_reply_id'
  ) = 1;
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'story_video_replies_parent_reply_id_set_null',
    'satisfied', check_ok,
    'detail', 'story_video_replies.parent_reply_id nullable with catalog-verified ON DELETE SET NULL self-FK to story_video_replies(id)'
  ));
  all_ready := all_ready AND check_ok;

  -- 6d) story_video_replies.story_id ON DELETE CASCADE (expected unchanged)
  check_ok := EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS con
    JOIN pg_catalog.pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    JOIN pg_catalog.pg_attribute AS src_attr
      ON src_attr.attrelid = rel.oid AND src_attr.attnum = ANY (con.conkey)
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'story_video_replies'
      AND con.contype = 'f'
      AND src_attr.attname = 'story_id'
      AND con.confdeltype = 'c'
  );
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'story_video_replies_story_id_cascade',
    'satisfied', check_ok,
    'detail', 'story_video_replies.story_id FK uses ON DELETE CASCADE (expected unchanged)'
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


  foundation := public.verify_account_deletion_execution_foundation_ready();
  prerequisites := prerequisites || coalesce(foundation->'prerequisites', '[]'::jsonb);
  all_ready := all_ready AND coalesce((foundation->>'ready')::boolean, false);

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
  'Read-only live catalog probe for account-deletion schema + write-freeze + execution foundation readiness. '
  'Includes 2B.0A write-freeze, 2B.2/2B.3a reply FK hardening, and 2C.2/2C.2A execution foundation. '
  'Does not consult supabase_migrations.schema_migrations. Fail-closed. '
  'EXECUTE restricted to service_role for server-side readiness verification only.';

COMMIT;
