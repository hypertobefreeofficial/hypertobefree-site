-- Phase 4C.7B.1E.2C.3B.2F.2A — Account deletion execution recovery foundation
-- DDL/functions/grants/readiness only. ZERO request, attempt, content, or Auth DML on apply.
-- Does NOT cancel executions, retry executions, or enable HTBF_ACCOUNT_DELETION_EXECUTION_ENABLED.
--
-- Lifecycle finding: deletion_in_progress → approved is NOT blocked by a database trigger.
-- enforce_account_deletion_user_cancellation only constrains ordinary-user submitted/reviewing
-- cancellation. Application lifecycle forbids the reverse transition; this RPC is the only
-- database authority that may perform it, and only for a cancellable pre-3B.1 attempt.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.account_deletion_requests') IS NULL THEN
    RAISE EXCEPTION '2C.3B.2F.2A precondition failed: account_deletion_requests missing';
  END IF;

  IF to_regclass('public.account_deletion_execution_attempts') IS NULL THEN
    RAISE EXCEPTION '2C.3B.2F.2A precondition failed: account_deletion_execution_attempts missing';
  END IF;

  IF to_regclass('public.account_deletion_story_freeze_scope') IS NULL THEN
    RAISE EXCEPTION '2C.3B.2F.2A precondition failed: account_deletion_story_freeze_scope missing';
  END IF;

  IF to_regclass('public.account_deletion_database_execution_context') IS NULL THEN
    RAISE EXCEPTION '2C.3B.2F.2A precondition failed: account_deletion_database_execution_context missing';
  END IF;

  IF to_regprocedure('public.account_deletion_actor_is_owner(uuid)') IS NULL THEN
    RAISE EXCEPTION '2C.3B.2F.2A precondition failed: account_deletion_actor_is_owner(uuid) missing';
  END IF;

  IF to_regprocedure('public.verify_account_deletion_schema_execution_ready()') IS NULL THEN
    RAISE EXCEPTION '2C.3B.2F.2A precondition failed: verify_account_deletion_schema_execution_ready() missing';
  END IF;

  IF to_regprocedure('public.verify_account_deletion_acquisition_foundation_ready()') IS NULL THEN
    RAISE EXCEPTION '2C.3B.2F.2A precondition failed: acquisition foundation readiness missing';
  END IF;

  IF to_regprocedure('public.verify_account_deletion_session_transition_foundation_ready()') IS NULL THEN
    RAISE EXCEPTION '2C.3B.2F.2A precondition failed: session transition foundation readiness missing';
  END IF;

  IF to_regprocedure('public.verify_account_deletion_nondestructive_database_stage_ready()') IS NULL THEN
    RAISE EXCEPTION '2C.3B.2F.2A precondition failed: nondestructive database stage readiness missing';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- A) Narrow cancel RPC. No caller-supplied target, status, or stage.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cancel_account_deletion_execution(
  p_request_id uuid,
  p_attempt_id uuid,
  p_initiated_by uuid
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
  active_other integer;
  scope_count integer;
  context_count integer;
  rows_updated integer;
  reauth_required boolean;
BEGIN
  IF p_request_id IS NULL OR p_attempt_id IS NULL OR p_initiated_by IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_arguments');
  END IF;

  IF NOT public.account_deletion_actor_is_owner(p_initiated_by) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'owner_required');
  END IF;

  readiness := public.verify_account_deletion_schema_execution_ready();
  IF coalesce((readiness->>'ready')::boolean, false) = false THEN
    RETURN jsonb_build_object('ok', false, 'code', 'readiness_failed');
  END IF;

  SELECT
    request_row.id,
    request_row.status,
    request_row.user_id,
    request_row.target_user_id_snapshot,
    request_row.approved_at
  INTO req
  FROM public.account_deletion_requests AS request_row
  WHERE request_row.id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'request_not_found');
  END IF;

  resolved_target := coalesce(req.user_id, req.target_user_id_snapshot);
  IF resolved_target IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invariant_failed');
  END IF;

  lock_key := public.hashtextextended(
    'account_deletion:' || resolved_target::text,
    0::bigint
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(lock_key);

  SELECT
    attempt_row.id,
    attempt_row.deletion_request_id,
    attempt_row.target_user_id,
    attempt_row.status,
    attempt_row.stage,
    attempt_row.last_error_code
  INTO att
  FROM public.account_deletion_execution_attempts AS attempt_row
  WHERE attempt_row.id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'attempt_not_found');
  END IF;

  IF att.deletion_request_id IS DISTINCT FROM p_request_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'attempt_request_mismatch');
  END IF;

  IF att.target_user_id IS DISTINCT FROM resolved_target THEN
    RETURN jsonb_build_object('ok', false, 'code', 'target_mismatch');
  END IF;

  SELECT count(*)::integer
  INTO active_other
  FROM public.account_deletion_execution_attempts AS attempt_row
  WHERE attempt_row.deletion_request_id = p_request_id
    AND attempt_row.status = 'active'::text
    AND attempt_row.id IS DISTINCT FROM p_attempt_id;

  IF active_other > 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invariant_failed');
  END IF;

  reauth_required := att.stage = ANY (
    ARRAY['sessions_pending'::text, 'sessions_revoked'::text, 'inventory'::text]
  );

  IF req.status = 'approved'::text
     AND att.status = 'failed'::text
     AND att.last_error_code = 'execution_cancelled'::text
     AND NOT EXISTS (
       SELECT 1
       FROM public.account_deletion_execution_attempts AS attempt_row
       WHERE attempt_row.deletion_request_id = p_request_id
         AND attempt_row.status = 'active'::text
     )
  THEN
    RETURN jsonb_build_object(
      'ok', true,
      'code', 'already_cancelled',
      'request_id', p_request_id,
      'attempt_id', p_attempt_id,
      'last_stage', att.stage,
      'reauthentication_may_be_required', reauth_required
    );
  END IF;

  IF req.status <> 'deletion_in_progress'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'request_not_in_progress');
  END IF;

  IF att.status <> ALL (ARRAY['active'::text, 'blocked'::text]) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'attempt_not_cancellable');
  END IF;

  IF att.stage = ANY (
    ARRAY[
      'database'::text,
      'database_completed'::text,
      'storage'::text,
      'profile'::text,
      'auth_pending'::text,
      'auth'::text,
      'finalize'::text,
      'completed'::text
    ]
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'irreversible_stage');
  END IF;

  IF att.stage <> ALL (
    ARRAY[
      'lock_acquired'::text,
      'sessions_pending'::text,
      'sessions_revoked'::text,
      'inventory'::text
    ]
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'stage_not_cancellable');
  END IF;

  SELECT count(*)::integer
  INTO scope_count
  FROM public.account_deletion_story_freeze_scope AS scope_row
  WHERE scope_row.deletion_request_id = p_request_id;

  IF scope_count <> 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'irreversible_state');
  END IF;

  SELECT count(*)::integer
  INTO context_count
  FROM public.account_deletion_database_execution_context AS ctx
  WHERE ctx.deletion_request_id = p_request_id
     OR ctx.attempt_id = p_attempt_id;

  IF context_count <> 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'execution_in_flight');
  END IF;

  UPDATE public.account_deletion_requests AS request_row
  SET
    status = 'approved'::text,
    execution_started_at = NULL
  WHERE request_row.id = p_request_id
    AND request_row.status = 'deletion_in_progress'::text;

  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  IF rows_updated <> 1 THEN
    RAISE EXCEPTION 'cancel_request_transition_failed'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.account_deletion_execution_attempts AS attempt_row
  SET
    status = 'failed'::text,
    last_error_code = 'execution_cancelled'::text,
    last_error_detail_safe = 'execution_cancelled'::text,
    completed_at = pg_catalog.now()
  WHERE attempt_row.id = p_attempt_id
    AND attempt_row.deletion_request_id = p_request_id
    AND attempt_row.target_user_id = resolved_target
    AND attempt_row.status = ANY (ARRAY['active'::text, 'blocked'::text])
    AND attempt_row.stage = att.stage;

  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  IF rows_updated <> 1 THEN
    RAISE EXCEPTION 'cancel_attempt_transition_failed'
      USING ERRCODE = '23514';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'cancelled',
    'request_id', p_request_id,
    'attempt_id', p_attempt_id,
    'last_stage', att.stage,
    'reauthentication_may_be_required', reauth_required
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invariant_failed');
END;
$$;

ALTER FUNCTION public.cancel_account_deletion_execution(uuid, uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.cancel_account_deletion_execution(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_account_deletion_execution(uuid, uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.cancel_account_deletion_execution(uuid, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_account_deletion_execution(uuid, uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.cancel_account_deletion_execution(uuid, uuid, uuid) IS
  'Narrow pre-3B.1 execution cancellation. Owner-verified, target derived from the request, '
  'same advisory lock as acquisition/3B.1. Allowed only for lock_acquired, sessions_pending, '
  'sessions_revoked, or inventory when story freeze scope is empty and no 3B.1 context exists. '
  'Restores request to approved and marks the attempt failed without moving stage backward. '
  'database_completed and later stages return irreversible_stage with zero writes. '
  'Does not restore Auth sessions, delete scope, or mutate content.';

-- ---------------------------------------------------------------------------
-- B) Recovery foundation readiness
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.verify_account_deletion_execution_recovery_foundation_ready()
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
  check_ok := to_regprocedure('public.cancel_account_deletion_execution(uuid, uuid, uuid)') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS proc
      JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = proc.pronamespace
      WHERE nsp.nspname = 'public'
        AND proc.oid = to_regprocedure('public.cancel_account_deletion_execution(uuid, uuid, uuid)')
        AND proc.prosecdef = true
        AND pg_catalog.pg_get_userbyid(proc.proowner) = 'postgres'
        AND pg_catalog.pg_get_functiondef(proc.oid) LIKE '%search_path%'
    )
    AND pg_catalog.has_function_privilege(
      'service_role',
      'public.cancel_account_deletion_execution(uuid, uuid, uuid)',
      'EXECUTE'
    )
    AND NOT pg_catalog.has_function_privilege(
      'authenticated',
      'public.cancel_account_deletion_execution(uuid, uuid, uuid)',
      'EXECUTE'
    )
    AND NOT pg_catalog.has_function_privilege(
      'anon',
      'public.cancel_account_deletion_execution(uuid, uuid, uuid)',
      'EXECUTE'
    )
    AND NOT pg_catalog.has_function_privilege(
      'public',
      'public.cancel_account_deletion_execution(uuid, uuid, uuid)',
      'EXECUTE'
    );
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'cancel_account_deletion_execution_rpc',
      'ready', check_ok,
      'detail', 'cancel_account_deletion_execution(uuid, uuid, uuid) owner/grants'
    )
  );
  all_ready := all_ready AND check_ok;

  check_ok := to_regprocedure('public.account_deletion_actor_is_owner(uuid)') IS NOT NULL;
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'account_deletion_actor_is_owner_present',
      'ready', check_ok,
      'detail', 'owner validation dependency present'
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
      'detail', 'acquisition foundation readiness unchanged'
    )
  );
  all_ready := all_ready AND check_ok;

  check_ok := coalesce(
    (public.verify_account_deletion_session_transition_foundation_ready()->>'ready')::boolean,
    false
  );
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'session_transition_foundation_still_ready',
      'ready', check_ok,
      'detail', 'session transition foundation readiness unchanged'
    )
  );
  all_ready := all_ready AND check_ok;

  check_ok := coalesce(
    (public.verify_account_deletion_nondestructive_database_stage_ready()->>'ready')::boolean,
    false
  );
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'nondestructive_database_stage_still_ready',
      'ready', check_ok,
      'detail', '3B.1 database stage readiness unchanged'
    )
  );
  all_ready := all_ready AND check_ok;

  RETURN jsonb_build_object(
    'ready', all_ready,
    'checked_at', to_jsonb(pg_catalog.now()),
    'prerequisites', prerequisites
  );
END;
$$;

ALTER FUNCTION public.verify_account_deletion_execution_recovery_foundation_ready() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.verify_account_deletion_execution_recovery_foundation_ready() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_account_deletion_execution_recovery_foundation_ready() FROM authenticated;
REVOKE ALL ON FUNCTION public.verify_account_deletion_execution_recovery_foundation_ready() FROM anon;
GRANT EXECUTE ON FUNCTION public.verify_account_deletion_execution_recovery_foundation_ready() TO service_role;

-- ---------------------------------------------------------------------------
-- C) Compose schema execution readiness with recovery foundation
-- ---------------------------------------------------------------------------

ALTER FUNCTION public.verify_account_deletion_schema_execution_ready()
  RENAME TO verify_account_deletion_schema_execution_ready_before_3b2f2a;

CREATE OR REPLACE FUNCTION public.verify_account_deletion_schema_execution_ready()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  core jsonb;
  recovery_foundation jsonb;
  prerequisites jsonb;
  all_ready boolean;
BEGIN
  core := public.verify_account_deletion_schema_execution_ready_before_3b2f2a();
  recovery_foundation := public.verify_account_deletion_execution_recovery_foundation_ready();

  prerequisites :=
    coalesce(core->'prerequisites', '[]'::jsonb)
    || coalesce(recovery_foundation->'prerequisites', '[]'::jsonb);

  all_ready :=
    coalesce((core->>'ready')::boolean, false)
    AND coalesce((recovery_foundation->>'ready')::boolean, false);

  RETURN jsonb_build_object(
    'ready', all_ready,
    'checked_at', to_jsonb(pg_catalog.now()),
    'prerequisites', prerequisites
  );
END;
$$;

ALTER FUNCTION public.verify_account_deletion_schema_execution_ready() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.verify_account_deletion_schema_execution_ready() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_account_deletion_schema_execution_ready() FROM authenticated;
REVOKE ALL ON FUNCTION public.verify_account_deletion_schema_execution_ready() FROM anon;
GRANT EXECUTE ON FUNCTION public.verify_account_deletion_schema_execution_ready() TO service_role;

COMMENT ON FUNCTION public.verify_account_deletion_schema_execution_ready() IS
  'Live catalog probe for account-deletion execution readiness including recovery cancellation. '
  'Composes verify_account_deletion_schema_execution_ready_before_3b2f2a() with '
  'verify_account_deletion_execution_recovery_foundation_ready(). Does not enable execution.';

COMMIT;
