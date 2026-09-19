-- Phase 4C.7B.1E.2C.3B.2B — Session/stage transition foundation (narrow RPCs)
-- Additive hardening only. No orchestration wiring. No content DML on apply.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.account_deletion_execution_attempts') IS NULL THEN
    RAISE EXCEPTION '2C.3B.2B precondition failed: account_deletion_execution_attempts missing';
  END IF;

  IF to_regprocedure('public.acquire_account_deletion_execution_lock(uuid, uuid)') IS NULL THEN
    RAISE EXCEPTION '2C.3B.2B precondition failed: acquire_account_deletion_execution_lock missing';
  END IF;

  IF to_regprocedure('public.verify_account_deletion_schema_execution_ready()') IS NULL THEN
    RAISE EXCEPTION '2C.3B.2B precondition failed: verify_account_deletion_schema_execution_ready missing';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- A) Internal locked context for attempt stage transitions (not callable by callers)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.account_deletion_attempt_transition_precheck(
  p_request_id uuid,
  p_attempt_id uuid,
  OUT o_resolved_target uuid,
  OUT o_current_stage text,
  OUT o_error_code text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  req record;
  att record;
  active_count integer;
  readiness jsonb;
  lock_key bigint;
BEGIN
  o_resolved_target := NULL;
  o_current_stage := NULL;
  o_error_code := NULL;

  IF p_request_id IS NULL OR p_attempt_id IS NULL THEN
    o_error_code := 'invalid_arguments';
    RETURN;
  END IF;

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
    o_error_code := 'request_not_found';
    RETURN;
  END IF;

  IF req.status <> 'deletion_in_progress'::text THEN
    o_error_code := 'request_not_in_progress';
    RETURN;
  END IF;

  o_resolved_target := coalesce(req.user_id, req.target_user_id_snapshot);
  IF o_resolved_target IS NULL THEN
    o_error_code := 'target_mismatch';
    RETURN;
  END IF;

  lock_key := public.hashtextextended(
    'account_deletion:' || o_resolved_target::text,
    0::bigint
  );
  PERFORM pg_advisory_xact_lock(lock_key);

  readiness := public.verify_account_deletion_schema_execution_ready();
  IF coalesce((readiness->>'ready')::boolean, false) = false THEN
    o_error_code := 'readiness_failed';
    RETURN;
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
    o_error_code := 'attempt_not_found';
    RETURN;
  END IF;

  IF att.deletion_request_id IS DISTINCT FROM p_request_id THEN
    o_error_code := 'attempt_request_mismatch';
    RETURN;
  END IF;

  IF att.status <> 'active'::text THEN
    o_error_code := 'attempt_not_active';
    RETURN;
  END IF;

  IF att.target_user_id IS DISTINCT FROM o_resolved_target THEN
    o_error_code := 'target_mismatch';
    RETURN;
  END IF;

  SELECT count(*)::integer
  INTO active_count
  FROM public.account_deletion_execution_attempts AS attempt_row
  WHERE attempt_row.deletion_request_id = p_request_id
    AND attempt_row.status = 'active'::text;

  IF active_count <> 1 THEN
    o_error_code := 'invariant_failed';
    RETURN;
  END IF;

  o_current_stage := att.stage;
END;
$$;

ALTER FUNCTION public.account_deletion_attempt_transition_precheck(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_attempt_transition_precheck(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_deletion_attempt_transition_precheck(uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_attempt_transition_precheck(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.account_deletion_attempt_transition_precheck(uuid, uuid) FROM service_role;

-- ---------------------------------------------------------------------------
-- B) Narrow stage transition RPCs (service_role only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.advance_account_deletion_attempt_to_sessions_pending(
  p_request_id uuid,
  p_attempt_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  resolved_target uuid;
  current_stage text;
  error_code text;
  row_count integer;
BEGIN
  SELECT
    precheck.o_resolved_target,
    precheck.o_current_stage,
    precheck.o_error_code
  INTO resolved_target, current_stage, error_code
  FROM public.account_deletion_attempt_transition_precheck(
    p_request_id,
    p_attempt_id
  ) AS precheck;

  IF error_code IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', error_code);
  END IF;

  IF current_stage = 'sessions_pending'::text THEN
    RETURN jsonb_build_object(
      'ok', true,
      'code', 'already_at_stage',
      'request_id', p_request_id,
      'attempt_id', p_attempt_id,
      'stage', 'sessions_pending'::text
    );
  END IF;

  IF current_stage <> 'lock_acquired'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'stage_conflict');
  END IF;

  UPDATE public.account_deletion_execution_attempts AS attempt_row
  SET
    stage = 'sessions_pending'::text,
    last_error_code = NULL,
    last_error_detail_safe = NULL
  WHERE attempt_row.id = p_attempt_id
    AND attempt_row.deletion_request_id = p_request_id
    AND attempt_row.status = 'active'::text
    AND attempt_row.stage = 'lock_acquired'::text;

  GET DIAGNOSTICS row_count = ROW_COUNT;
  IF row_count <> 1 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invariant_failed');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'advanced',
    'request_id', p_request_id,
    'attempt_id', p_attempt_id,
    'stage', 'sessions_pending'::text
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.advance_account_deletion_attempt_to_sessions_revoked(
  p_request_id uuid,
  p_attempt_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  resolved_target uuid;
  current_stage text;
  error_code text;
  row_count integer;
BEGIN
  SELECT
    precheck.o_resolved_target,
    precheck.o_current_stage,
    precheck.o_error_code
  INTO resolved_target, current_stage, error_code
  FROM public.account_deletion_attempt_transition_precheck(
    p_request_id,
    p_attempt_id
  ) AS precheck;

  IF error_code IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', error_code);
  END IF;

  IF current_stage = 'sessions_revoked'::text THEN
    RETURN jsonb_build_object(
      'ok', true,
      'code', 'already_at_stage',
      'request_id', p_request_id,
      'attempt_id', p_attempt_id,
      'stage', 'sessions_revoked'::text
    );
  END IF;

  IF current_stage <> 'sessions_pending'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'stage_conflict');
  END IF;

  UPDATE public.account_deletion_execution_attempts AS attempt_row
  SET
    stage = 'sessions_revoked'::text,
    last_error_code = NULL,
    last_error_detail_safe = NULL
  WHERE attempt_row.id = p_attempt_id
    AND attempt_row.deletion_request_id = p_request_id
    AND attempt_row.status = 'active'::text
    AND attempt_row.stage = 'sessions_pending'::text;

  GET DIAGNOSTICS row_count = ROW_COUNT;
  IF row_count <> 1 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invariant_failed');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'advanced',
    'request_id', p_request_id,
    'attempt_id', p_attempt_id,
    'stage', 'sessions_revoked'::text
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.advance_account_deletion_attempt_to_inventory(
  p_request_id uuid,
  p_attempt_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  resolved_target uuid;
  current_stage text;
  error_code text;
  row_count integer;
BEGIN
  SELECT
    precheck.o_resolved_target,
    precheck.o_current_stage,
    precheck.o_error_code
  INTO resolved_target, current_stage, error_code
  FROM public.account_deletion_attempt_transition_precheck(
    p_request_id,
    p_attempt_id
  ) AS precheck;

  IF error_code IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', error_code);
  END IF;

  IF current_stage = 'inventory'::text THEN
    RETURN jsonb_build_object(
      'ok', true,
      'code', 'already_at_stage',
      'request_id', p_request_id,
      'attempt_id', p_attempt_id,
      'stage', 'inventory'::text
    );
  END IF;

  IF current_stage <> 'sessions_revoked'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'stage_conflict');
  END IF;

  UPDATE public.account_deletion_execution_attempts AS attempt_row
  SET stage = 'inventory'::text
  WHERE attempt_row.id = p_attempt_id
    AND attempt_row.deletion_request_id = p_request_id
    AND attempt_row.status = 'active'::text
    AND attempt_row.stage = 'sessions_revoked'::text;

  GET DIAGNOSTICS row_count = ROW_COUNT;
  IF row_count <> 1 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invariant_failed');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'advanced',
    'request_id', p_request_id,
    'attempt_id', p_attempt_id,
    'stage', 'inventory'::text
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_account_deletion_session_revocation_failure(
  p_request_id uuid,
  p_attempt_id uuid,
  p_error_code text,
  p_error_fingerprint text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  resolved_target uuid;
  current_stage text;
  error_code text;
  row_count integer;
  safe_code text;
  safe_fingerprint text;
  next_retry integer;
BEGIN
  SELECT
    precheck.o_resolved_target,
    precheck.o_current_stage,
    precheck.o_error_code
  INTO resolved_target, current_stage, error_code
  FROM public.account_deletion_attempt_transition_precheck(
    p_request_id,
    p_attempt_id
  ) AS precheck;

  IF error_code IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', error_code);
  END IF;

  IF current_stage <> 'sessions_pending'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'stage_conflict');
  END IF;

  safe_code := left(coalesce(trim(p_error_code), 'session_revocation_failed'), 120);
  safe_fingerprint := left(coalesce(trim(p_error_fingerprint), ''), 240);
  IF safe_fingerprint = '' THEN
    safe_fingerprint := NULL;
  END IF;

  SELECT attempt_row.retry_count + 1
  INTO next_retry
  FROM public.account_deletion_execution_attempts AS attempt_row
  WHERE attempt_row.id = p_attempt_id;

  UPDATE public.account_deletion_execution_attempts AS attempt_row
  SET
    stage = 'sessions_pending'::text,
    status = 'active'::text,
    last_error_code = safe_code,
    last_error_detail_safe = safe_fingerprint,
    retry_count = next_retry
  WHERE attempt_row.id = p_attempt_id
    AND attempt_row.deletion_request_id = p_request_id
    AND attempt_row.status = 'active'::text
    AND attempt_row.stage = 'sessions_pending'::text;

  GET DIAGNOSTICS row_count = ROW_COUNT;
  IF row_count <> 1 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invariant_failed');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'recorded',
    'request_id', p_request_id,
    'attempt_id', p_attempt_id,
    'stage', 'sessions_pending'::text,
    'retry_count', next_retry
  );
END;
$$;

ALTER FUNCTION public.advance_account_deletion_attempt_to_sessions_pending(uuid, uuid) OWNER TO postgres;
ALTER FUNCTION public.advance_account_deletion_attempt_to_sessions_revoked(uuid, uuid) OWNER TO postgres;
ALTER FUNCTION public.advance_account_deletion_attempt_to_inventory(uuid, uuid) OWNER TO postgres;
ALTER FUNCTION public.record_account_deletion_session_revocation_failure(uuid, uuid, text, text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.advance_account_deletion_attempt_to_sessions_pending(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.advance_account_deletion_attempt_to_sessions_pending(uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.advance_account_deletion_attempt_to_sessions_pending(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.advance_account_deletion_attempt_to_sessions_pending(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.advance_account_deletion_attempt_to_sessions_revoked(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.advance_account_deletion_attempt_to_sessions_revoked(uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.advance_account_deletion_attempt_to_sessions_revoked(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.advance_account_deletion_attempt_to_sessions_revoked(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.advance_account_deletion_attempt_to_inventory(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.advance_account_deletion_attempt_to_inventory(uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.advance_account_deletion_attempt_to_inventory(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.advance_account_deletion_attempt_to_inventory(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.record_account_deletion_session_revocation_failure(uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_account_deletion_session_revocation_failure(uuid, uuid, text, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.record_account_deletion_session_revocation_failure(uuid, uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_account_deletion_session_revocation_failure(uuid, uuid, text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- C) Revoke direct service_role mutation on execution attempts
-- ---------------------------------------------------------------------------

REVOKE INSERT, UPDATE, DELETE ON TABLE public.account_deletion_execution_attempts FROM service_role;
GRANT SELECT ON TABLE public.account_deletion_execution_attempts TO service_role;

-- ---------------------------------------------------------------------------
-- D) Session transition foundation readiness
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.verify_account_deletion_session_transition_foundation_ready()
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
  proc record;
BEGIN
  FOR proc IN
    SELECT *
    FROM (
      VALUES
        ('advance_account_deletion_attempt_to_sessions_pending(uuid, uuid)'),
        ('advance_account_deletion_attempt_to_sessions_revoked(uuid, uuid)'),
        ('advance_account_deletion_attempt_to_inventory(uuid, uuid)'),
        ('record_account_deletion_session_revocation_failure(uuid, uuid, text, text)')
    ) AS required(signature)
  LOOP
    check_ok := to_regprocedure('public.' || proc.signature) IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM pg_catalog.pg_proc AS p
        JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.oid = to_regprocedure('public.' || proc.signature)
          AND p.prosecdef = true
          AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
          AND pg_catalog.pg_get_functiondef(p.oid) LIKE '%search_path%'
      )
      AND pg_catalog.has_function_privilege(
        'service_role',
        'public.' || proc.signature,
        'EXECUTE'
      )
      AND NOT pg_catalog.has_function_privilege(
        'authenticated',
        'public.' || proc.signature,
        'EXECUTE'
      )
      AND NOT pg_catalog.has_function_privilege(
        'anon',
        'public.' || proc.signature,
        'EXECUTE'
      );
    prerequisites := prerequisites || jsonb_build_array(
      jsonb_build_object(
        'id', 'session_transition_rpc_' || split_part(proc.signature, '(', 1),
        'ready', check_ok,
        'detail', proc.signature
      )
    );
    all_ready := all_ready AND check_ok;
  END LOOP;

  check_ok := NOT pg_catalog.has_table_privilege(
    'service_role',
    'public.account_deletion_execution_attempts',
    'UPDATE'
  )
  AND NOT pg_catalog.has_table_privilege(
    'service_role',
    'public.account_deletion_execution_attempts',
    'INSERT'
  )
  AND NOT pg_catalog.has_table_privilege(
    'service_role',
    'public.account_deletion_execution_attempts',
    'DELETE'
  )
  AND pg_catalog.has_table_privilege(
    'service_role',
    'public.account_deletion_execution_attempts',
    'SELECT'
  );
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'execution_attempts_service_role_mutation_revoked',
      'ready', check_ok,
      'detail', 'service_role may SELECT attempts only; stage changes via narrow RPCs'
    )
  );
  all_ready := all_ready AND check_ok;

  check_ok := coalesce(
    (
      SELECT (public.verify_account_deletion_acquisition_foundation_ready()->>'ready')::boolean
    ),
    false
  );
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'acquisition_foundation_still_ready',
      'ready', check_ok,
      'detail', 'acquisition RPC readiness unchanged'
    )
  );
  all_ready := all_ready AND check_ok;

  check_ok := coalesce(
    (
      SELECT (
        public.verify_account_deletion_nondestructive_database_stage_ready()->>'ready'
      )::boolean
    ),
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
    'checked_at', to_jsonb(now()),
    'prerequisites', prerequisites
  );
END;
$$;

ALTER FUNCTION public.verify_account_deletion_session_transition_foundation_ready() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.verify_account_deletion_session_transition_foundation_ready() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_account_deletion_session_transition_foundation_ready() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.verify_account_deletion_session_transition_foundation_ready() TO service_role;

-- ---------------------------------------------------------------------------
-- E) Compose schema execution readiness with 3B.2B probe
-- ---------------------------------------------------------------------------

ALTER FUNCTION public.verify_account_deletion_schema_execution_ready()
  RENAME TO verify_account_deletion_schema_execution_ready_before_3b2b;

CREATE OR REPLACE FUNCTION public.verify_account_deletion_schema_execution_ready()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  core jsonb;
  session_foundation jsonb;
  prerequisites jsonb;
  all_ready boolean;
BEGIN
  core := public.verify_account_deletion_schema_execution_ready_before_3b2b();
  session_foundation := public.verify_account_deletion_session_transition_foundation_ready();

  prerequisites :=
    coalesce(core->'prerequisites', '[]'::jsonb)
    || coalesce(session_foundation->'prerequisites', '[]'::jsonb);

  all_ready :=
    coalesce((core->>'ready')::boolean, false)
    AND coalesce((session_foundation->>'ready')::boolean, false);

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

COMMIT;
