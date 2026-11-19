-- Phase 3B.4D.5 — Target session revocation via narrow RPC (replaces JWT-less admin sign-out call)
-- Mirrors GoTrue global logout: DELETE FROM auth.sessions WHERE user_id = target (see supabase/auth models.Logout).
-- Supabase Admin API global sign-out requires a logged-in JWT, not a user id (official JS reference).
-- Additive hardening only; no orchestrator wiring in SQL.

BEGIN;

DO $$
BEGIN
  IF to_regclass('auth.sessions') IS NULL THEN
    RAISE EXCEPTION '3B.4D.5 precondition failed: auth.sessions missing';
  END IF;

  IF to_regprocedure('public.account_deletion_attempt_transition_precheck(uuid, uuid)') IS NULL THEN
    RAISE EXCEPTION '3B.4D.5 precondition failed: account_deletion_attempt_transition_precheck missing';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Narrow session revocation RPC (service_role only, attempt-gated)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.revoke_account_deletion_target_auth_sessions(
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
  sessions_removed integer := 0;
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

  IF resolved_target IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'target_mismatch');
  END IF;

  DELETE FROM auth.sessions AS session_row
  WHERE session_row.user_id = resolved_target;

  GET DIAGNOSTICS sessions_removed = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'revoked',
    'request_id', p_request_id,
    'attempt_id', p_attempt_id,
    'target_user_id', resolved_target,
    'sessions_removed', sessions_removed
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'code', 'auth_session_revocation_failed');
END;
$$;

ALTER FUNCTION public.revoke_account_deletion_target_auth_sessions(uuid, uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.revoke_account_deletion_target_auth_sessions(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_account_deletion_target_auth_sessions(uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.revoke_account_deletion_target_auth_sessions(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.revoke_account_deletion_target_auth_sessions(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Extend session transition foundation readiness
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
        ('record_account_deletion_session_revocation_failure(uuid, uuid, text, text)'),
        ('revoke_account_deletion_target_auth_sessions(uuid, uuid)')
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

  check_ok := to_regclass('auth.sessions') IS NOT NULL;
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'auth_sessions_table_present',
      'ready', check_ok,
      'detail', 'auth.sessions required for target session revocation'
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

COMMIT;
