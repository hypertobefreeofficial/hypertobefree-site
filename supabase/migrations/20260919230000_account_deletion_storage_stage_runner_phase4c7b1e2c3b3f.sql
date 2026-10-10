-- Phase 4C.7B.1E.2C.3B.3F.1 — Storage stage runner + stage transition foundation
-- DDL/RPC/readiness only. No Storage deletion. No profile/auth deletion. No orchestrator wiring.

BEGIN;

-- Stage runner RPCs emit storage_stage_entered / storage_stage_completed audit events.
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
        'storage_stage_completed'::text
      ]
    )
  );

DO $$
BEGIN
  IF to_regprocedure('public.initialize_account_deletion_storage_execution_results(uuid, uuid)') IS NULL THEN
    RAISE EXCEPTION '3B.3F.1 precondition failed: initialize_account_deletion_storage_execution_results missing';
  END IF;
  IF to_regprocedure('public.authorize_account_deletion_storage_object_delete(uuid, uuid, uuid, uuid)') IS NULL THEN
    RAISE EXCEPTION '3B.3F.1 precondition failed: authorize_account_deletion_storage_object_delete missing';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- A) Shared storage-stage manifest gate (internal)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.account_deletion_storage_stage_manifest_gate(
  p_request_id uuid,
  p_attempt_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  att record;
  capture_row record;
  blocked_count integer;
BEGIN
  IF p_request_id IS NULL OR p_attempt_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_arguments');
  END IF;

  SELECT
    attempt_row.id,
    attempt_row.deletion_request_id,
    attempt_row.storage_manifest_status
  INTO att
  FROM public.account_deletion_execution_attempts AS attempt_row
  WHERE attempt_row.id = p_attempt_id;

  IF NOT FOUND OR att.deletion_request_id IS DISTINCT FROM p_request_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'attempt_mismatch');
  END IF;

  IF att.storage_manifest_status IS DISTINCT FROM 'finalized'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'storage_manifest_not_finalized');
  END IF;

  SELECT capture.status
  INTO capture_row
  FROM public.account_deletion_storage_manifest_capture AS capture
  WHERE capture.execution_attempt_id = p_attempt_id
    AND capture.deletion_request_id = p_request_id;

  IF NOT FOUND OR capture_row.status IS DISTINCT FROM 'finalized'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'storage_manifest_not_finalized');
  END IF;

  SELECT count(*)::integer
  INTO blocked_count
  FROM public.account_deletion_storage_manifest AS manifest
  WHERE manifest.execution_attempt_id = p_attempt_id
    AND manifest.deletion_request_id = p_request_id
    AND manifest.disposition = 'BLOCK_UNRESOLVED'::text;

  IF blocked_count > 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'storage_manifest_blocked');
  END IF;

  RETURN jsonb_build_object('ok', true, 'code', 'manifest_gate_passed');
END;
$$;

ALTER FUNCTION public.account_deletion_storage_stage_manifest_gate(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_storage_stage_manifest_gate(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_deletion_storage_stage_manifest_gate(uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_storage_stage_manifest_gate(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.account_deletion_storage_stage_manifest_gate(uuid, uuid) FROM service_role;

-- ---------------------------------------------------------------------------
-- B) Authoritative completion predicate (internal)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.account_deletion_storage_execution_completion_blocked(
  p_request_id uuid,
  p_attempt_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  total_count integer := 0;
  nonterminal_count integer := 0;
  manifest_count integer := 0;
  result_count integer := 0;
BEGIN
  SELECT count(*)::integer
  INTO manifest_count
  FROM public.account_deletion_storage_manifest AS manifest
  WHERE manifest.execution_attempt_id = p_attempt_id
    AND manifest.deletion_request_id = p_request_id;

  SELECT count(*)::integer
  INTO result_count
  FROM public.account_deletion_storage_execution_results AS result_row
  WHERE result_row.execution_attempt_id = p_attempt_id
    AND result_row.deletion_request_id = p_request_id;

  IF manifest_count <> result_count THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'result_manifest_count_mismatch',
      'manifest_count', manifest_count,
      'result_count', result_count
    );
  END IF;

  SELECT
    count(*)::integer,
    count(*) FILTER (
      WHERE result_row.execution_state NOT IN (
        'deleted'::text,
        'missing'::text,
        'preserved'::text,
        'deferred_profile'::text
      )
    )::integer
  INTO total_count, nonterminal_count
  FROM public.account_deletion_storage_execution_results AS result_row
  WHERE result_row.execution_attempt_id = p_attempt_id
    AND result_row.deletion_request_id = p_request_id;

  IF nonterminal_count > 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'storage_execution_not_terminal',
      'total', total_count,
      'nonterminal', nonterminal_count
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'storage_execution_complete',
    'total', total_count
  );
END;
$$;

ALTER FUNCTION public.account_deletion_storage_execution_completion_blocked(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_storage_execution_completion_blocked(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_deletion_storage_execution_completion_blocked(uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_storage_execution_completion_blocked(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.account_deletion_storage_execution_completion_blocked(uuid, uuid) FROM service_role;

-- ---------------------------------------------------------------------------
-- C) Progress snapshot (service_role)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.account_deletion_storage_execution_progress_snapshot(
  p_request_id uuid,
  p_attempt_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  counts jsonb;
BEGIN
  IF p_request_id IS NULL OR p_attempt_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_arguments');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.account_deletion_execution_attempts AS attempt_row
    WHERE attempt_row.id = p_attempt_id
      AND attempt_row.deletion_request_id = p_request_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'attempt_mismatch');
  END IF;

  SELECT jsonb_build_object(
    'total', count(*)::integer,
    'pending', count(*) FILTER (WHERE execution_state = 'pending'::text)::integer,
    'failed_retryable', count(*) FILTER (WHERE execution_state = 'failed_retryable'::text)::integer,
    'deleting', count(*) FILTER (WHERE execution_state = 'deleting'::text)::integer,
    'deleted', count(*) FILTER (WHERE execution_state = 'deleted'::text)::integer,
    'missing', count(*) FILTER (WHERE execution_state = 'missing'::text)::integer,
    'preserved', count(*) FILTER (WHERE execution_state = 'preserved'::text)::integer,
    'deferred_profile', count(*) FILTER (WHERE execution_state = 'deferred_profile'::text)::integer,
    'blocked', count(*) FILTER (WHERE execution_state = 'blocked'::text)::integer,
    'blocked_on_hold', count(*) FILTER (WHERE execution_state = 'blocked_on_hold'::text)::integer,
    'failed_terminal', count(*) FILTER (WHERE execution_state = 'failed_terminal'::text)::integer
  )
  INTO counts
  FROM public.account_deletion_storage_execution_results AS result_row
  WHERE result_row.execution_attempt_id = p_attempt_id
    AND result_row.deletion_request_id = p_request_id;

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'snapshot',
    'counts', coalesce(counts, '{}'::jsonb)
  );
END;
$$;

ALTER FUNCTION public.account_deletion_storage_execution_progress_snapshot(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_storage_execution_progress_snapshot(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_deletion_storage_execution_progress_snapshot(uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_storage_execution_progress_snapshot(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.account_deletion_storage_execution_progress_snapshot(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- D) Stage transition: database_completed → storage
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.advance_account_deletion_attempt_to_storage(
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
  gate jsonb;
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

  IF current_stage = 'storage_completed'::text THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'stage_conflict',
      'detail', 'storage_already_completed'
    );
  END IF;

  IF current_stage = 'storage'::text THEN
    RETURN jsonb_build_object(
      'ok', true,
      'code', 'already_storage',
      'request_id', p_request_id,
      'attempt_id', p_attempt_id,
      'stage', 'storage'::text
    );
  END IF;

  IF current_stage <> 'database_completed'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'stage_conflict');
  END IF;

  gate := public.account_deletion_storage_stage_manifest_gate(p_request_id, p_attempt_id);
  IF coalesce((gate->>'ok')::boolean, false) = false THEN
    RETURN gate;
  END IF;

  UPDATE public.account_deletion_execution_attempts AS attempt_row
  SET
    stage = 'storage'::text,
    last_error_code = NULL,
    last_error_detail_safe = NULL,
    updated_at = now()
  WHERE attempt_row.id = p_attempt_id
    AND attempt_row.deletion_request_id = p_request_id
    AND attempt_row.status = 'active'::text
    AND attempt_row.stage = 'database_completed'::text;

  GET DIAGNOSTICS row_count = ROW_COUNT;
  IF row_count <> 1 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invariant_failed');
  END IF;

  PERFORM public.account_deletion_storage_execution_audit_append(
    'storage_stage_entered'::text,
    p_request_id,
    p_attempt_id,
    NULL,
    NULL,
    NULL,
    NULL,
    'storage'
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'advanced',
    'request_id', p_request_id,
    'attempt_id', p_attempt_id,
    'stage', 'storage'::text
  );
END;
$$;

ALTER FUNCTION public.advance_account_deletion_attempt_to_storage(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.advance_account_deletion_attempt_to_storage(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.advance_account_deletion_attempt_to_storage(uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.advance_account_deletion_attempt_to_storage(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.advance_account_deletion_attempt_to_storage(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- E) Stage transition: storage → storage_completed (atomic completion authority)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.advance_account_deletion_attempt_to_storage_completed(
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
  gate jsonb;
  completion jsonb;
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

  IF current_stage = 'storage_completed'::text THEN
    RETURN jsonb_build_object(
      'ok', true,
      'code', 'already_storage_completed',
      'request_id', p_request_id,
      'attempt_id', p_attempt_id,
      'stage', 'storage_completed'::text
    );
  END IF;

  IF current_stage <> 'storage'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'stage_conflict');
  END IF;

  gate := public.account_deletion_storage_stage_manifest_gate(p_request_id, p_attempt_id);
  IF coalesce((gate->>'ok')::boolean, false) = false THEN
    RETURN gate;
  END IF;

  -- attempt row remains locked (FOR UPDATE) from account_deletion_attempt_transition_precheck
  -- in this transaction until commit; claim_account_deletion_storage_execution_object
  -- blocks on the same attempt lock.
  completion := public.account_deletion_storage_execution_completion_blocked(
    p_request_id,
    p_attempt_id
  );
  IF coalesce((completion->>'ok')::boolean, false) = false THEN
    RETURN completion;
  END IF;

  UPDATE public.account_deletion_execution_attempts AS attempt_row
  SET
    stage = 'storage_completed'::text,
    last_error_code = NULL,
    last_error_detail_safe = NULL,
    updated_at = now()
  WHERE attempt_row.id = p_attempt_id
    AND attempt_row.deletion_request_id = p_request_id
    AND attempt_row.status = 'active'::text
    AND attempt_row.stage = 'storage'::text;

  GET DIAGNOSTICS row_count = ROW_COUNT;
  IF row_count <> 1 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invariant_failed');
  END IF;

  PERFORM public.account_deletion_storage_execution_audit_append(
    'storage_stage_completed'::text,
    p_request_id,
    p_attempt_id,
    NULL,
    NULL,
    NULL,
    NULL,
    'storage_completed'
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'advanced',
    'request_id', p_request_id,
    'attempt_id', p_attempt_id,
    'stage', 'storage_completed'::text
  );
END;
$$;

ALTER FUNCTION public.advance_account_deletion_attempt_to_storage_completed(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.advance_account_deletion_attempt_to_storage_completed(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.advance_account_deletion_attempt_to_storage_completed(uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.advance_account_deletion_attempt_to_storage_completed(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.advance_account_deletion_attempt_to_storage_completed(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- F) Destructive Storage RPC stage guards → storage
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_account_deletion_storage_execution_object(
  p_request_id uuid,
  p_attempt_id uuid,
  p_manifest_object_id uuid,
  p_lease_seconds integer DEFAULT 900
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  att record;
  manifest_row record;
  result_id uuid;
  result_state text;
  result_lease timestamptz;
  new_token uuid;
  lease_until timestamptz;
BEGIN
  IF p_request_id IS NULL OR p_attempt_id IS NULL OR p_manifest_object_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_arguments');
  END IF;

  IF p_lease_seconds IS NULL OR p_lease_seconds < 30 OR p_lease_seconds > 3600 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_lease');
  END IF;

  -- Serialize against storage → storage_completed (same attempt row as transition precheck).
  SELECT
    attempt_row.id,
    attempt_row.deletion_request_id,
    attempt_row.status,
    attempt_row.stage
  INTO att
  FROM public.account_deletion_execution_attempts AS attempt_row
  WHERE attempt_row.id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND
     OR att.deletion_request_id IS DISTINCT FROM p_request_id
     OR att.status <> 'active'::text
     OR att.stage <> 'storage'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'attempt_mismatch');
  END IF;

  SELECT
    manifest.id,
    manifest.disposition,
    manifest.execution_attempt_id,
    manifest.deletion_request_id
  INTO manifest_row
  FROM public.account_deletion_storage_manifest AS manifest
  WHERE manifest.id = p_manifest_object_id;

  IF NOT FOUND
     OR manifest_row.execution_attempt_id IS DISTINCT FROM p_attempt_id
     OR manifest_row.deletion_request_id IS DISTINCT FROM p_request_id
     OR manifest_row.disposition <> 'DELETE_PRIVATE'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_delete_eligible');
  END IF;

  IF public.account_deletion_storage_preservation_hold_active(
    p_request_id,
    p_attempt_id,
    p_manifest_object_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'preservation_hold_active');
  END IF;

  SELECT
    result_row.id,
    result_row.execution_state,
    result_row.claim_lease_expires_at
  INTO result_id, result_state, result_lease
  FROM public.account_deletion_storage_execution_results AS result_row
  WHERE result_row.execution_attempt_id = p_attempt_id
    AND result_row.manifest_object_id = p_manifest_object_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'execution_result_missing');
  END IF;

  IF result_state = 'deleting'::text
     AND result_lease IS NOT NULL
     AND result_lease <= now() THEN
    UPDATE public.account_deletion_storage_execution_results AS expired_row
    SET
      execution_state = 'failed_retryable'::text,
      claim_token = NULL,
      claim_lease_expires_at = NULL,
      claim_backend_pid = NULL,
      last_error_code = 'claim_lease_expired'::text,
      attempt_count = expired_row.attempt_count + 1,
      updated_at = now()
    WHERE expired_row.id = result_id;

    PERFORM public.account_deletion_storage_execution_audit_append(
      'claim_expired_reclaimed'::text,
      p_request_id,
      p_attempt_id,
      p_manifest_object_id,
      result_id,
      NULL,
      NULL,
      'claim_lease_expired'
    );

    SELECT
      refreshed.execution_state,
      refreshed.claim_lease_expires_at
    INTO result_state, result_lease
    FROM public.account_deletion_storage_execution_results AS refreshed
    WHERE refreshed.id = result_id
    FOR UPDATE;
  END IF;

  IF result_state NOT IN ('pending'::text, 'failed_retryable'::text) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'not_claimable',
      'execution_state', result_state
    );
  END IF;

  new_token := gen_random_uuid();
  lease_until := now() + make_interval(secs => p_lease_seconds);

  UPDATE public.account_deletion_storage_execution_results AS claim_row
  SET
    execution_state = 'deleting'::text,
    claim_token = new_token,
    claim_lease_expires_at = lease_until,
    claim_backend_pid = pg_catalog.pg_backend_pid(),
    attempt_count = claim_row.attempt_count + 1,
    last_attempt_at = now(),
    updated_at = now()
  WHERE claim_row.id = result_id
    AND claim_row.execution_state IN ('pending'::text, 'failed_retryable'::text);

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'claim_conflict');
  END IF;

  PERFORM public.account_deletion_storage_execution_audit_append(
    'claim_acquired'::text,
    p_request_id,
    p_attempt_id,
    p_manifest_object_id,
    result_id,
    NULL,
    NULL,
    'claim_acquired'
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'claimed',
    'claim_token', new_token,
    'claim_lease_expires_at', lease_until
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.authorize_account_deletion_storage_object_delete(
  p_request_id uuid,
  p_attempt_id uuid,
  p_result_id uuid,
  p_claim_token uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  req record;
  att record;
  result_row record;
  manifest_row record;
  new_commit uuid;
  commit_until timestamptz;
  object_exists boolean;
BEGIN
  IF p_request_id IS NULL OR p_attempt_id IS NULL OR p_result_id IS NULL OR p_claim_token IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_arguments');
  END IF;

  SELECT request_row.id, request_row.status, request_row.user_id
  INTO req
  FROM public.account_deletion_requests AS request_row
  WHERE request_row.id = p_request_id;

  IF NOT FOUND OR req.status <> 'deletion_in_progress'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'request_not_in_progress');
  END IF;

  SELECT
    attempt_row.id,
    attempt_row.deletion_request_id,
    attempt_row.target_user_id,
    attempt_row.status,
    attempt_row.stage,
    attempt_row.storage_manifest_status
  INTO att
  FROM public.account_deletion_execution_attempts AS attempt_row
  WHERE attempt_row.id = p_attempt_id;

  IF NOT FOUND
     OR att.deletion_request_id IS DISTINCT FROM p_request_id
     OR att.status <> 'active'::text
     OR att.stage <> 'storage'::text
     OR att.storage_manifest_status IS DISTINCT FROM 'finalized'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'attempt_mismatch');
  END IF;

  SELECT
    result.id,
    result.deletion_request_id,
    result.execution_attempt_id,
    result.manifest_object_id,
    result.target_user_id,
    result.bucket,
    result.object_path,
    result.disposition_snapshot,
    result.execution_state,
    result.claim_token,
    result.claim_lease_expires_at,
    result.delete_commit_token,
    result.delete_committed_at,
    result.delete_commit_expires_at
  INTO result_row
  FROM public.account_deletion_storage_execution_results AS result
  WHERE result.id = p_result_id
  FOR UPDATE;

  IF NOT FOUND
     OR result_row.deletion_request_id IS DISTINCT FROM p_request_id
     OR result_row.execution_attempt_id IS DISTINCT FROM p_attempt_id
     OR result_row.target_user_id IS DISTINCT FROM att.target_user_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'result_mismatch');
  END IF;

  IF result_row.disposition_snapshot <> 'DELETE_PRIVATE'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_delete_eligible');
  END IF;

  IF public.account_deletion_storage_preservation_hold_active(
    p_request_id,
    p_attempt_id,
    result_row.manifest_object_id
  ) THEN
    IF result_row.execution_state = 'deleting'::text
       AND result_row.delete_commit_token IS NULL THEN
      PERFORM public.account_deletion_storage_execution_invalidate_precommit_deleting(
        p_request_id,
        p_attempt_id,
        result_row.manifest_object_id
      );
    END IF;
    RETURN jsonb_build_object('ok', false, 'code', 'preservation_hold_active');
  END IF;

  IF NOT public.account_deletion_storage_destructive_bucket_allowed(result_row.bucket) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bucket_not_destructive_allowed');
  END IF;

  IF result_row.execution_state IN ('deleted'::text, 'missing'::text, 'failed_terminal'::text) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'already_terminal');
  END IF;

  IF result_row.execution_state <> 'deleting'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_deleting');
  END IF;

  SELECT
    manifest.id,
    manifest.disposition,
    manifest.bucket,
    manifest.object_path,
    manifest.target_user_id
  INTO manifest_row
  FROM public.account_deletion_storage_manifest AS manifest
  WHERE manifest.id = result_row.manifest_object_id;

  IF NOT FOUND
     OR manifest_row.disposition <> 'DELETE_PRIVATE'::text
     OR manifest_row.bucket IS DISTINCT FROM result_row.bucket
     OR manifest_row.object_path IS DISTINCT FROM result_row.object_path
     OR manifest_row.target_user_id IS DISTINCT FROM result_row.target_user_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'manifest_authority_mismatch');
  END IF;

  IF NOT public.account_deletion_storage_object_path_canonical(result_row.object_path) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'object_path_not_canonical');
  END IF;

  IF result_row.delete_commit_token IS NOT NULL
     AND result_row.delete_commit_expires_at IS NOT NULL
     AND result_row.delete_commit_expires_at > now()
     AND result_row.claim_token IS NOT DISTINCT FROM p_claim_token THEN
    object_exists := public.account_deletion_storage_object_exact_exists(
      result_row.bucket,
      result_row.object_path
    );
    RETURN jsonb_build_object(
      'ok', true,
      'code', 'already_authorized',
      'delete_commit_token', result_row.delete_commit_token,
      'delete_commit_expires_at', result_row.delete_commit_expires_at,
      'bucket', result_row.bucket,
      'object_path', result_row.object_path,
      'object_exists', object_exists
    );
  END IF;

  IF result_row.delete_commit_token IS NOT NULL
     AND result_row.delete_commit_expires_at IS NOT NULL
     AND result_row.delete_commit_expires_at > now()
     AND result_row.claim_token IS DISTINCT FROM p_claim_token THEN
    RETURN jsonb_build_object('ok', false, 'code', 'claim_token_mismatch');
  END IF;

  IF result_row.delete_commit_token IS NOT NULL
     AND result_row.delete_commit_expires_at IS NOT NULL
     AND result_row.delete_commit_expires_at <= now() THEN
    UPDATE public.account_deletion_storage_execution_results AS expired_commit
    SET
      delete_commit_token = NULL,
      delete_committed_at = NULL,
      delete_commit_expires_at = NULL,
      updated_at = now()
    WHERE expired_commit.id = p_result_id;
  END IF;

  IF result_row.claim_token IS DISTINCT FROM p_claim_token THEN
    RETURN jsonb_build_object('ok', false, 'code', 'claim_token_mismatch');
  END IF;

  IF result_row.claim_lease_expires_at IS NULL OR result_row.claim_lease_expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'claim_lease_expired');
  END IF;

  object_exists := public.account_deletion_storage_object_exact_exists(
    result_row.bucket,
    result_row.object_path
  );

  IF NOT object_exists THEN
    UPDATE public.account_deletion_storage_execution_results AS missing_row
    SET
      execution_state = 'missing'::text,
      completed_at = now(),
      claim_token = NULL,
      claim_lease_expires_at = NULL,
      claim_backend_pid = NULL,
      delete_commit_token = NULL,
      delete_committed_at = NULL,
      delete_commit_expires_at = NULL,
      updated_at = now()
    WHERE missing_row.id = p_result_id;

    PERFORM public.account_deletion_storage_execution_audit_append(
      'delete_authorized_missing_precheck'::text,
      p_request_id,
      p_attempt_id,
      result_row.manifest_object_id,
      p_result_id,
      NULL,
      NULL,
      'missing'
    );

    RETURN jsonb_build_object(
      'ok', true,
      'code', 'precheck_missing',
      'terminal', true,
      'bucket', result_row.bucket,
      'object_path', result_row.object_path,
      'object_exists', false
    );
  END IF;

  new_commit := gen_random_uuid();
  commit_until := now() + make_interval(mins => 15);

  UPDATE public.account_deletion_storage_execution_results AS commit_row
  SET
    delete_commit_token = new_commit,
    delete_committed_at = now(),
    delete_commit_expires_at = commit_until,
    updated_at = now()
  WHERE commit_row.id = p_result_id
    AND commit_row.execution_state = 'deleting'::text
    AND commit_row.claim_token = p_claim_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'commit_conflict');
  END IF;

  PERFORM public.account_deletion_storage_execution_audit_append(
    'delete_authorized'::text,
    p_request_id,
    p_attempt_id,
    result_row.manifest_object_id,
    p_result_id,
    NULL,
    NULL,
    'delete_committed'
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'authorized',
    'delete_commit_token', new_commit,
    'delete_commit_expires_at', commit_until,
    'bucket', result_row.bucket,
    'object_path', result_row.object_path,
    'object_exists', true
  );
END;
$$;



-- ---------------------------------------------------------------------------
-- G) Stage runner readiness + schema composition
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.verify_account_deletion_storage_stage_runner_ready()
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
  claim_def text;
  authorize_def text;
  foundation jsonb;
BEGIN
  foundation := public.verify_account_deletion_storage_execution_foundation_ready();
  check_ok := coalesce((foundation->>'ready')::boolean, false);
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'storage_execution_foundation_ready',
      'ready', check_ok,
      'detail', '3B.3C execution results + claim foundation remain ready'
    )
  );
  all_ready := all_ready AND check_ok;

  check_ok := coalesce((public.verify_account_deletion_storage_executor_ready()->>'ready')::boolean, false);
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'storage_executor_ready',
      'ready', check_ok,
      'detail', '3B.3D authorize/complete/commit authority remains ready'
    )
  );
  all_ready := all_ready AND check_ok;

  check_ok := to_regprocedure('public.advance_account_deletion_attempt_to_storage(uuid, uuid)') IS NOT NULL
  AND to_regprocedure('public.advance_account_deletion_attempt_to_storage_completed(uuid, uuid)') IS NOT NULL
  AND to_regprocedure('public.account_deletion_storage_execution_progress_snapshot(uuid, uuid)') IS NOT NULL
  AND to_regprocedure('public.account_deletion_storage_execution_completion_blocked(uuid, uuid)') IS NOT NULL;
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'storage_stage_runner_rpcs_present',
      'ready', check_ok,
      'detail', 'advance storage/completed + snapshot + completion predicate installed'
    )
  );
  all_ready := all_ready AND check_ok;

  claim_def := pg_catalog.pg_get_functiondef(
    to_regprocedure(
      'public.claim_account_deletion_storage_execution_object(uuid, uuid, uuid, integer)'
    )
  );
  authorize_def := pg_catalog.pg_get_functiondef(
    to_regprocedure(
      'public.authorize_account_deletion_storage_object_delete(uuid, uuid, uuid, uuid)'
    )
  );
  check_ok := claim_def ILIKE '%<> ''storage''::text%'
  AND authorize_def ILIKE '%<> ''storage''::text%'
  AND claim_def NOT ILIKE '%<> ''database_completed''::text%'
  AND authorize_def NOT ILIKE '%<> ''database_completed''::text%'
  AND claim_def ILIKE '%account_deletion_execution_attempts%'
  AND claim_def ILIKE '%FOR UPDATE%';
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'destructive_storage_stage_guard_storage_only',
      'ready', check_ok,
      'detail', 'claim/authorize require attempt.stage=storage; claim locks attempt row FOR UPDATE'
    )
  );
  all_ready := all_ready AND check_ok;

  check_ok := NOT pg_catalog.has_function_privilege(
    'authenticated',
    'public.advance_account_deletion_attempt_to_storage(uuid, uuid)',
    'EXECUTE'
  )
  AND NOT pg_catalog.has_function_privilege(
    'anon',
    'public.advance_account_deletion_attempt_to_storage(uuid, uuid)',
    'EXECUTE'
  )
  AND pg_catalog.has_function_privilege(
    'service_role',
    'public.advance_account_deletion_attempt_to_storage(uuid, uuid)',
    'EXECUTE'
  )
  AND NOT pg_catalog.has_function_privilege(
    'authenticated',
    'public.advance_account_deletion_attempt_to_storage_completed(uuid, uuid)',
    'EXECUTE'
  )
  AND pg_catalog.has_function_privilege(
    'service_role',
    'public.advance_account_deletion_attempt_to_storage_completed(uuid, uuid)',
    'EXECUTE'
  );
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'storage_stage_runner_grants_service_role_only',
      'ready', check_ok,
      'detail', 'stage transitions executable only by service_role'
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

ALTER FUNCTION public.verify_account_deletion_storage_stage_runner_ready() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.verify_account_deletion_storage_stage_runner_ready() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_account_deletion_storage_stage_runner_ready() FROM authenticated;
REVOKE ALL ON FUNCTION public.verify_account_deletion_storage_stage_runner_ready() FROM anon;
GRANT EXECUTE ON FUNCTION public.verify_account_deletion_storage_stage_runner_ready() TO service_role;

CREATE OR REPLACE FUNCTION public.verify_account_deletion_schema_execution_ready()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  core jsonb;
  storage_executor jsonb;
  storage_runner jsonb;
  prerequisites jsonb;
  all_ready boolean;
  runner_count integer;
BEGIN
  core := public.verify_account_deletion_schema_execution_ready_before_3b3d();
  storage_executor := public.verify_account_deletion_storage_executor_ready();
  storage_runner := public.verify_account_deletion_storage_stage_runner_ready();

  prerequisites :=
    coalesce(core->'prerequisites', '[]'::jsonb)
    || coalesce(storage_executor->'prerequisites', '[]'::jsonb)
    || coalesce(storage_runner->'prerequisites', '[]'::jsonb);

  SELECT count(*)::integer
  INTO runner_count
  FROM jsonb_array_elements(prerequisites) AS elem
  WHERE elem->>'id' = 'storage_stage_runner_rpcs_present';

  all_ready :=
    coalesce((core->>'ready')::boolean, false)
    AND coalesce((storage_executor->>'ready')::boolean, false)
    AND coalesce((storage_runner->>'ready')::boolean, false)
    AND runner_count = 1;

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
  'Live catalog probe: core + 3B.3C storage execution + 3B.3D executor + 3B.3F.1 stage runner. '
  'Does not enable execution flags or perform Storage deletion.';

COMMIT;
