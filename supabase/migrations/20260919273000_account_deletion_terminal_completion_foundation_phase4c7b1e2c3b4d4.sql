-- Phase 4C.7B.1E.2C.3B.4D.4 — Terminal account deletion completion (bookkeeping only).
-- No Auth/Storage/Profile/session destructive work. Preservation holds do NOT block
-- terminal bookkeeping at finalize (Auth is already complete; no destructive step remains).

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.complete_account_deletion_auth_execution(uuid, uuid, uuid, text)') IS NULL THEN
    RAISE EXCEPTION '3B.4D.4 precondition failed: auth execution complete RPC missing';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- A) Audit vocabulary
-- ---------------------------------------------------------------------------

ALTER TABLE public.account_deletion_storage_execution_audit
  DROP CONSTRAINT IF EXISTS account_deletion_storage_execution_audit_event_type_check;

ALTER TABLE public.account_deletion_storage_execution_audit
  ADD CONSTRAINT account_deletion_storage_execution_audit_event_type_check CHECK (
    event_type = ANY (
      ARRAY[
        'results_initialized'::text,
        'hold_created'::text,
        'hold_released'::text,
        'hold_create_rejected_committed'::text,
        'claim_acquired'::text,
        'claim_expired_reclaimed'::text,
        'execution_state_changed'::text,
        'delete_authorized'::text,
        'delete_authorized_missing_precheck'::text,
        'delete_completed'::text,
        'storage_stage_entered'::text,
        'storage_stage_completed'::text,
        'profile_stage_entered'::text,
        'profile_private_data_deleted'::text,
        'profile_identity_scrubbed'::text,
        'profile_media_claimed'::text,
        'profile_media_claim_reclaimed'::text,
        'profile_media_delete_authorized'::text,
        'profile_media_completed'::text,
        'profile_shell_deleted'::text,
        'auth_stage_entered'::text,
        'auth_execution_claimed'::text,
        'auth_execution_claim_reclaimed'::text,
        'auth_execution_completed'::text,
        'account_deletion_completed'::text
      ]
    )
  );

-- ---------------------------------------------------------------------------
-- B) Internal evidence helpers (STABLE; service_role only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.account_deletion_profile_completion_evidence_valid(
  p_request_id uuid,
  p_attempt_id uuid,
  p_target_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    NOT EXISTS (
      SELECT 1
      FROM public.profiles AS profile_row
      WHERE profile_row.id = p_target_user_id
    )
    AND EXISTS (
      SELECT 1
      FROM public.account_deletion_execution_attempts AS attempt_row
      WHERE attempt_row.id = p_attempt_id
        AND attempt_row.deletion_request_id = p_request_id
        AND attempt_row.target_user_id = p_target_user_id
        AND attempt_row.stage = ANY (
          ARRAY[
            'profile_completed'::text,
            'auth_pending'::text,
            'auth'::text,
            'finalize'::text,
            'completed'::text
          ]
        )
        AND coalesce(attempt_row.profile_rows_affected, '{}'::jsonb)
          @> '{"profile_shell_deleted": 1}'::jsonb
    )
    AND EXISTS (
      SELECT 1
      FROM public.account_deletion_storage_execution_audit AS audit_row
      WHERE audit_row.deletion_request_id = p_request_id
        AND audit_row.execution_attempt_id = p_attempt_id
        AND audit_row.event_type = 'profile_shell_deleted'::text
    );
$$;

ALTER FUNCTION public.account_deletion_profile_completion_evidence_valid(uuid, uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_profile_completion_evidence_valid(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_deletion_profile_completion_evidence_valid(uuid, uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_profile_completion_evidence_valid(uuid, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.account_deletion_profile_completion_evidence_valid(uuid, uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.account_deletion_profile_completion_evidence_valid(uuid, uuid, uuid) IS
  '3B.4D.4 extends stage vocabulary with completed for terminal idempotent replay.';

CREATE OR REPLACE FUNCTION public.account_deletion_auth_terminal_evidence_valid(
  p_request_id uuid,
  p_attempt_id uuid,
  p_target_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.account_deletion_execution_attempts AS attempt_row
    WHERE attempt_row.id = p_attempt_id
      AND attempt_row.deletion_request_id = p_request_id
      AND attempt_row.target_user_id = p_target_user_id
      AND attempt_row.auth_deleted_at IS NOT NULL
      AND attempt_row.auth_delete_completion_outcome = ANY (
        ARRAY['deleted'::text, 'already_absent'::text]
      )
      AND coalesce(attempt_row.auth_rows_affected, '{}'::jsonb)
        @> '{"auth_execution_completed": 1}'::jsonb
      AND attempt_row.auth_delete_claim_token IS NULL
      AND attempt_row.auth_delete_claim_expires_at IS NULL
      AND attempt_row.auth_delete_commit_token IS NULL
      AND attempt_row.auth_delete_commit_expires_at IS NULL
  )
  AND EXISTS (
    SELECT 1
    FROM public.account_deletion_storage_execution_audit AS audit_row
    WHERE audit_row.deletion_request_id = p_request_id
      AND audit_row.execution_attempt_id = p_attempt_id
      AND audit_row.event_type = 'auth_execution_completed'::text
  );
$$;

ALTER FUNCTION public.account_deletion_auth_terminal_evidence_valid(uuid, uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_auth_terminal_evidence_valid(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_deletion_auth_terminal_evidence_valid(uuid, uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_auth_terminal_evidence_valid(uuid, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.account_deletion_auth_terminal_evidence_valid(uuid, uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.account_deletion_storage_terminal_evidence_valid(
  p_request_id uuid,
  p_attempt_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  att record;
  completion jsonb;
BEGIN
  SELECT
    attempt_row.storage_manifest_status
  INTO att
  FROM public.account_deletion_execution_attempts AS attempt_row
  WHERE attempt_row.id = p_attempt_id
    AND attempt_row.deletion_request_id = p_request_id;

  IF NOT FOUND OR att.storage_manifest_status IS DISTINCT FROM 'finalized'::text THEN
    RETURN false;
  END IF;

  completion := public.account_deletion_storage_execution_completion_blocked(
    p_request_id,
    p_attempt_id
  );
  IF coalesce((completion->>'ok')::boolean, false) = false THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.account_deletion_storage_execution_audit AS audit_row
    WHERE audit_row.deletion_request_id = p_request_id
      AND audit_row.execution_attempt_id = p_attempt_id
      AND audit_row.event_type = 'storage_stage_completed'::text
  );
END;
$$;

ALTER FUNCTION public.account_deletion_storage_terminal_evidence_valid(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_storage_terminal_evidence_valid(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_deletion_storage_terminal_evidence_valid(uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_storage_terminal_evidence_valid(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.account_deletion_storage_terminal_evidence_valid(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.account_deletion_terminal_completion_evidence_valid(
  p_request_id uuid,
  p_attempt_id uuid,
  p_target_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    public.account_deletion_auth_terminal_evidence_valid(
      p_request_id,
      p_attempt_id,
      p_target_user_id
    )
    AND public.account_deletion_profile_completion_evidence_valid(
      p_request_id,
      p_attempt_id,
      p_target_user_id
    )
    AND public.account_deletion_storage_terminal_evidence_valid(
      p_request_id,
      p_attempt_id
    );
$$;

ALTER FUNCTION public.account_deletion_terminal_completion_evidence_valid(uuid, uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_terminal_completion_evidence_valid(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_deletion_terminal_completion_evidence_valid(uuid, uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_terminal_completion_evidence_valid(uuid, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.account_deletion_terminal_completion_evidence_valid(uuid, uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.account_deletion_terminal_completion_evidence_valid(uuid, uuid, uuid) IS
  '3B.4D.4 Auth+Profile+Storage authoritative completion markers. Session/database progression '
  'is implied by the shipped stage-transition RPC chain required to reach finalize '
  '(manifest finalized only after inventory/database path). No preservation-hold gate here.';

-- ---------------------------------------------------------------------------
-- C) finalize_account_deletion_execution
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.finalize_account_deletion_execution(
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
  row_count integer;
  checked_at timestamptz := pg_catalog.now();
BEGIN
  IF p_request_id IS NULL OR p_attempt_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_arguments');
  END IF;

  SELECT
    request_row.id,
    request_row.status,
    request_row.user_id,
    request_row.target_user_id_snapshot,
    request_row.execution_completed_at
  INTO req
  FROM public.account_deletion_requests AS request_row
  WHERE request_row.id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'request_not_in_progress');
  END IF;

  resolved_target := coalesce(req.user_id, req.target_user_id_snapshot);
  IF resolved_target IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'target_unresolved');
  END IF;

  lock_key := pg_catalog.hashtextextended(
    'account_deletion:' || resolved_target::text,
    0::bigint
  );
  PERFORM pg_advisory_xact_lock(lock_key);

  SELECT
    attempt_row.id,
    attempt_row.deletion_request_id,
    attempt_row.target_user_id,
    attempt_row.status,
    attempt_row.stage,
    attempt_row.completed_at
  INTO att
  FROM public.account_deletion_execution_attempts AS attempt_row
  WHERE attempt_row.id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND
     OR att.deletion_request_id IS DISTINCT FROM p_request_id
     OR att.target_user_id IS DISTINCT FROM resolved_target THEN
    RETURN jsonb_build_object('ok', false, 'code', 'attempt_mismatch');
  END IF;

  IF att.stage = 'completed'::text AND att.status = 'completed'::text THEN
    IF req.status <> 'deleted'::text
       OR req.execution_completed_at IS NULL
       OR att.completed_at IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'code', 'inconsistent_state');
    END IF;
    IF NOT public.account_deletion_terminal_completion_evidence_valid(
      p_request_id,
      p_attempt_id,
      resolved_target
    ) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'inconsistent_state');
    END IF;
    RETURN jsonb_build_object(
      'ok', true,
      'code', 'already_completed',
      'request_id', p_request_id,
      'attempt_id', p_attempt_id,
      'target_user_id', resolved_target,
      'attempt_stage', 'completed'::text,
      'attempt_status', 'completed'::text,
      'request_status', 'deleted'::text,
      'checked_at', checked_at
    );
  END IF;

  IF req.status <> 'deletion_in_progress'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'request_not_in_progress');
  END IF;

  IF att.status <> 'active'::text OR att.stage <> 'finalize'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_stage');
  END IF;

  IF NOT public.account_deletion_terminal_completion_evidence_valid(
    p_request_id,
    p_attempt_id,
    resolved_target
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'terminal_precondition_failed');
  END IF;

  UPDATE public.account_deletion_execution_attempts AS attempt_row
  SET
    stage = 'completed'::text,
    status = 'completed'::text,
    completed_at = coalesce(attempt_row.completed_at, pg_catalog.now()),
    updated_at = pg_catalog.now()
  WHERE attempt_row.id = p_attempt_id
    AND attempt_row.deletion_request_id = p_request_id
    AND attempt_row.status = 'active'::text
    AND attempt_row.stage = 'finalize'::text;

  GET DIAGNOSTICS row_count = ROW_COUNT;
  IF row_count <> 1 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invariant_failed');
  END IF;

  UPDATE public.account_deletion_requests AS request_row
  SET
    status = 'deleted'::text,
    execution_completed_at = coalesce(request_row.execution_completed_at, pg_catalog.now())
  WHERE request_row.id = p_request_id
    AND request_row.status = 'deletion_in_progress'::text;

  GET DIAGNOSTICS row_count = ROW_COUNT;
  IF row_count <> 1 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invariant_failed');
  END IF;

  PERFORM public.account_deletion_storage_execution_audit_append(
    'account_deletion_completed'::text,
    p_request_id,
    p_attempt_id,
    NULL,
    NULL,
    NULL,
    NULL,
    'terminal'
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'completed',
    'request_id', p_request_id,
    'attempt_id', p_attempt_id,
    'target_user_id', resolved_target,
    'attempt_stage', 'completed'::text,
    'attempt_status', 'completed'::text,
    'request_status', 'deleted'::text,
    'checked_at', checked_at
  );
EXCEPTION
  WHEN SQLSTATE 'P0001' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invariant_failed');
END;
$$;

ALTER FUNCTION public.finalize_account_deletion_execution(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.finalize_account_deletion_execution(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_account_deletion_execution(uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.finalize_account_deletion_execution(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.finalize_account_deletion_execution(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.finalize_account_deletion_execution(uuid, uuid) IS
  '3B.4D.4 Terminal bookkeeping: finalize→completed attempt + request deleted. '
  'Non-destructive; preservation holds do not block this RPC. '
  'Prior session/database progression is enforced by shipped stage RPCs required to reach finalize.';

-- ---------------------------------------------------------------------------
-- D) Terminal completion readiness
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.verify_account_deletion_terminal_completion_ready()
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
  terminal_oid oid;
  fn_def text;
  audit_check text;
BEGIN
  terminal_oid := to_regprocedure(
    'public.finalize_account_deletion_execution(uuid, uuid)'
  );
  check_ok := terminal_oid IS NOT NULL;
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'terminal_completion_rpc_present',
    'ready', check_ok,
    'detail', 'finalize_account_deletion_execution installed'
  ));
  all_ready := all_ready AND check_ok;

  IF terminal_oid IS NOT NULL THEN
    fn_def := pg_catalog.pg_get_functiondef(terminal_oid);
    check_ok := fn_def ILIKE '%SECURITY DEFINER%'
      AND fn_def ILIKE '%FOR UPDATE%'
      AND fn_def ILIKE '%account_deletion_terminal_completion_evidence_valid%'
      AND fn_def NOT ILIKE '%auth.users%'
      AND fn_def NOT ILIKE '%deleteUser%'
      AND fn_def NOT ILIKE '%auth.admin%';
    prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
      'id', 'terminal_completion_rpc_hardening',
      'ready', check_ok,
      'detail', 'terminal RPC is SD with locks and evidence; no destructive Auth/Storage ops'
    ));
    all_ready := all_ready AND check_ok;

    check_ok := pg_catalog.has_function_privilege(
      'service_role',
      'public.finalize_account_deletion_execution(uuid, uuid)',
      'EXECUTE'
    )
    AND NOT pg_catalog.has_function_privilege(
      'authenticated',
      'public.finalize_account_deletion_execution(uuid, uuid)',
      'EXECUTE'
    );
    prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
      'id', 'terminal_completion_grants_service_role_only',
      'ready', check_ok,
      'detail', 'terminal RPC executable only by service_role'
    ));
    all_ready := all_ready AND check_ok;
  END IF;

  SELECT pg_catalog.pg_get_constraintdef(con.oid)
  INTO audit_check
  FROM pg_catalog.pg_constraint AS con
  WHERE con.conname = 'account_deletion_storage_execution_audit_event_type_check'
    AND con.conrelid = 'public.account_deletion_storage_execution_audit'::regclass;

  check_ok := audit_check ~ '''account_deletion_completed''::text';
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'terminal_completion_audit_vocabulary',
    'ready', check_ok,
    'detail', 'audit CHECK includes account_deletion_completed'
  ));
  all_ready := all_ready AND check_ok;

  check_ok := EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS con
    WHERE con.conname = 'account_deletion_requests_status_check'
      AND con.conrelid = 'public.account_deletion_requests'::regclass
      AND pg_catalog.pg_get_constraintdef(con.oid) LIKE '%deleted%'
  )
  AND EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute AS attr
    WHERE attr.attrelid = 'public.account_deletion_requests'::regclass
      AND attr.attname = 'execution_completed_at'
      AND NOT attr.attisdropped
  )
  AND EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute AS attr
    WHERE attr.attrelid = 'public.account_deletion_execution_attempts'::regclass
      AND attr.attname = 'completed_at'
      AND NOT attr.attisdropped
  );
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'terminal_completion_schema_vocabulary',
    'ready', check_ok,
    'detail', 'request deleted status + execution_completed_at + attempt completed_at'
  ));
  all_ready := all_ready AND check_ok;

  RETURN jsonb_build_object(
    'ready', all_ready,
    'checked_at', to_jsonb(pg_catalog.now()),
    'prerequisites', prerequisites
  );
END;
$$;

ALTER FUNCTION public.verify_account_deletion_terminal_completion_ready() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.verify_account_deletion_terminal_completion_ready() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_account_deletion_terminal_completion_ready() FROM authenticated;
REVOKE ALL ON FUNCTION public.verify_account_deletion_terminal_completion_ready() FROM anon;
GRANT EXECUTE ON FUNCTION public.verify_account_deletion_terminal_completion_ready() TO service_role;

-- ---------------------------------------------------------------------------
-- E) Schema execution readiness composition
-- ---------------------------------------------------------------------------

ALTER FUNCTION public.verify_account_deletion_schema_execution_ready()
  RENAME TO verify_account_deletion_schema_execution_ready_before_3b4d4;

CREATE OR REPLACE FUNCTION public.verify_account_deletion_schema_execution_ready()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  prior jsonb;
  terminal_ready jsonb;
  prerequisites jsonb;
  all_ready boolean;
  profile_rpc_count integer;
  auth_rpc_count integer;
  terminal_rpc_count integer;
BEGIN
  prior := public.verify_account_deletion_schema_execution_ready_before_3b4d4();
  terminal_ready := public.verify_account_deletion_terminal_completion_ready();
  prerequisites :=
    coalesce(prior->'prerequisites', '[]'::jsonb)
    || coalesce(terminal_ready->'prerequisites', '[]'::jsonb);

  SELECT count(*)::integer
  INTO profile_rpc_count
  FROM jsonb_array_elements(prerequisites) AS elem
  WHERE elem->>'id' = 'profile_completion_rpc_present';

  SELECT count(*)::integer
  INTO auth_rpc_count
  FROM jsonb_array_elements(prerequisites) AS elem
  WHERE elem->>'id' = 'auth_execution_rpc_present';

  SELECT count(*)::integer
  INTO terminal_rpc_count
  FROM jsonb_array_elements(prerequisites) AS elem
  WHERE elem->>'id' = 'terminal_completion_rpc_present';

  all_ready :=
    coalesce((prior->>'ready')::boolean, false)
    AND coalesce((terminal_ready->>'ready')::boolean, false)
    AND profile_rpc_count = 1
    AND auth_rpc_count = 1
    AND terminal_rpc_count = 1;

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

COMMIT;
