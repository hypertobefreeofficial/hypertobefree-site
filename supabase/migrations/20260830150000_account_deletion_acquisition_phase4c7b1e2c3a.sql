-- Phase 4C.7B.1E.2C.3A — Account deletion acquisition, execution ownership & session barrier
-- Schema/trigger/RPC/readiness only. ZERO request/content DML on apply.
-- Does NOT invoke acquisition, create attempts, revoke sessions, or enable execution.

BEGIN;

-- ---------------------------------------------------------------------------
-- Preconditions (fail-closed — catalog state, not schema_migrations history)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.account_deletion_execution_attempts') IS NULL THEN
    RAISE EXCEPTION '2C.3A precondition failed: account_deletion_execution_attempts missing';
  END IF;

  IF to_regclass('public.account_deletion_requests') IS NULL THEN
    RAISE EXCEPTION '2C.3A precondition failed: account_deletion_requests missing';
  END IF;

  IF to_regprocedure('public.verify_account_deletion_execution_foundation_ready()') IS NULL THEN
    RAISE EXCEPTION '2C.3A precondition failed: verify_account_deletion_execution_foundation_ready() missing';
  END IF;

  IF to_regprocedure('public.verify_account_deletion_schema_execution_ready()') IS NULL THEN
    RAISE EXCEPTION '2C.3A precondition failed: verify_account_deletion_schema_execution_ready() missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_indexes AS idx
    WHERE idx.schemaname = 'public'
      AND idx.tablename = 'account_deletion_execution_attempts'
      AND idx.indexname = 'account_deletion_execution_attempts_one_active_per_request_idx'
  ) THEN
    RAISE EXCEPTION '2C.3A precondition failed: one-active execution attempt index missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS proc
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = proc.pronamespace
    WHERE nsp.nspname = 'public'
      AND proc.proname = 'account_user_deletion_in_progress'
  ) THEN
    RAISE EXCEPTION '2C.3A precondition failed: account_user_deletion_in_progress(uuid) missing';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- A) Extend attempt stage enum for session-revocation progression
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
-- B) Owner authority helper (DB-side cross-check for acquisition RPC)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.account_deletion_actor_is_owner(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    p_user_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.profiles AS profile_row
      WHERE profile_row.id = p_user_id
        AND profile_row.is_owner = true
    );
$$;

ALTER FUNCTION public.account_deletion_actor_is_owner(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_actor_is_owner(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_deletion_actor_is_owner(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_actor_is_owner(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.account_deletion_actor_is_owner(uuid) TO service_role;

COMMENT ON FUNCTION public.account_deletion_actor_is_owner(uuid) IS
  'Returns true when p_user_id is the HTBF founder/root profile (profiles.is_owner). '
  'Used by acquisition RPC to independently verify execution actor authority. '
  'service_role only — not callable by browser clients.';

-- ---------------------------------------------------------------------------
-- C) Attempt target/request validation trigger (all rows — audit integrity)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_account_deletion_execution_attempt_target_validation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  request_target uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.deletion_request_id IS DISTINCT FROM OLD.deletion_request_id THEN
      RAISE EXCEPTION 'attempt_deletion_request_id_immutable'
        USING ERRCODE = '23514';
    END IF;

    IF NEW.target_user_id IS DISTINCT FROM OLD.target_user_id THEN
      RAISE EXCEPTION 'attempt_target_user_id_immutable'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  SELECT coalesce(request_row.user_id, request_row.target_user_id_snapshot)
  INTO request_target
  FROM public.account_deletion_requests AS request_row
  WHERE request_row.id = NEW.deletion_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'attempt_request_not_found'
      USING ERRCODE = '23503';
  END IF;

  IF request_target IS NULL THEN
    RAISE EXCEPTION 'attempt_request_target_unresolved'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.target_user_id IS DISTINCT FROM request_target THEN
    RAISE EXCEPTION 'attempt_target_mismatch'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.trg_account_deletion_execution_attempt_target_validation() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.trg_account_deletion_execution_attempt_target_validation() FROM PUBLIC;

DROP TRIGGER IF EXISTS account_deletion_execution_attempt_target_validation
  ON public.account_deletion_execution_attempts;

CREATE TRIGGER account_deletion_execution_attempt_target_validation
  BEFORE INSERT OR UPDATE ON public.account_deletion_execution_attempts
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_account_deletion_execution_attempt_target_validation();

-- ---------------------------------------------------------------------------
-- D) Atomic acquisition RPC (service_role only — no caller-supplied target)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.acquire_account_deletion_execution_lock(
  p_request_id uuid,
  p_initiated_by uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  req record;
  resolved_target uuid;
  active_attempt record;
  active_count integer;
  new_attempt_id uuid;
  readiness jsonb;
  lock_key bigint;
  rows_updated integer;
BEGIN
  IF p_request_id IS NULL OR p_initiated_by IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_arguments');
  END IF;

  IF NOT public.account_deletion_actor_is_owner(p_initiated_by) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'unauthorized_owner');
  END IF;

  readiness := public.verify_account_deletion_schema_execution_ready();
  IF coalesce((readiness->>'ready')::boolean, false) = false THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'readiness_failed',
      'readiness', readiness
    );
  END IF;

  SELECT
    request_row.id,
    request_row.status,
    request_row.user_id,
    request_row.target_user_id_snapshot,
    request_row.approved_at,
    request_row.execution_started_at
  INTO req
  FROM public.account_deletion_requests AS request_row
  WHERE request_row.id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'request_not_found');
  END IF;

  resolved_target := coalesce(req.user_id, req.target_user_id_snapshot);
  IF resolved_target IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'target_not_resolved');
  END IF;

  lock_key := public.hashtextextended(
    'account_deletion:' || resolved_target::text,
    0::bigint
  );
  PERFORM pg_advisory_xact_lock(lock_key);

  IF req.status = 'deletion_in_progress'::text THEN
    SELECT count(*)::integer
    INTO active_count
    FROM public.account_deletion_execution_attempts AS attempt_row
    WHERE attempt_row.deletion_request_id = p_request_id
      AND attempt_row.status = 'active'::text;

    IF active_count = 1 THEN
      SELECT
        attempt_row.id,
        attempt_row.target_user_id,
        attempt_row.stage,
        attempt_row.status
      INTO active_attempt
      FROM public.account_deletion_execution_attempts AS attempt_row
      WHERE attempt_row.deletion_request_id = p_request_id
        AND attempt_row.status = 'active'::text
      LIMIT 1;

      IF active_attempt.target_user_id IS DISTINCT FROM resolved_target THEN
        RETURN jsonb_build_object('ok', false, 'code', 'ambiguous_state_target_mismatch');
      END IF;

      RETURN jsonb_build_object(
        'ok', true,
        'code', 'already_acquired',
        'request_id', p_request_id,
        'attempt_id', active_attempt.id,
        'target_user_id', resolved_target,
        'attempt_stage', active_attempt.stage,
        'attempt_status', active_attempt.status
      );
    END IF;

    RETURN jsonb_build_object(
      'ok', false,
      'code', 'ambiguous_state',
      'active_attempt_count', active_count
    );
  END IF;

  IF req.status <> 'approved'::text OR req.approved_at IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'request_not_approved',
      'status', req.status
    );
  END IF;

  INSERT INTO public.account_deletion_execution_attempts (
    deletion_request_id,
    target_user_id,
    initiated_by,
    status,
    stage
  ) VALUES (
    p_request_id,
    resolved_target,
    p_initiated_by,
    'active'::text,
    'lock_acquired'::text
  )
  RETURNING id INTO new_attempt_id;

  UPDATE public.account_deletion_requests AS request_row
  SET
    status = 'deletion_in_progress'::text,
    execution_started_at = coalesce(request_row.execution_started_at, now())
  WHERE request_row.id = p_request_id
    AND request_row.status = 'approved'::text;

  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  IF rows_updated <> 1 THEN
    RAISE EXCEPTION 'acquisition_request_transition_failed'
      USING ERRCODE = '23514';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'acquired',
    'request_id', p_request_id,
    'attempt_id', new_attempt_id,
    'target_user_id', resolved_target
  );

EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'code', 'active_attempt_conflict');
END;
$$;

ALTER FUNCTION public.acquire_account_deletion_execution_lock(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.acquire_account_deletion_execution_lock(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.acquire_account_deletion_execution_lock(uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.acquire_account_deletion_execution_lock(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.acquire_account_deletion_execution_lock(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.acquire_account_deletion_execution_lock(uuid, uuid) IS
  'Atomically acquires account-deletion execution ownership for an approved request. '
  'Uses request-row FOR UPDATE + pg_advisory_xact_lock(hashtextextended(''account_deletion:''||target,0)). '
  'Derives target exclusively from account_deletion_requests — never accepts target from caller. '
  'Requires profiles.is_owner actor. Creates one active attempt (stage=lock_acquired) and transitions '
  'approved→deletion_in_progress in one transaction. Idempotent already_acquired when in-progress with '
  'exactly one valid active attempt. Fail-closed on ambiguous in-progress state. No content mutations.';

-- ---------------------------------------------------------------------------
-- E) Acquisition foundation readiness probe
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.verify_account_deletion_acquisition_foundation_ready()
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
  check_ok := EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS trg
    JOIN pg_catalog.pg_class AS rel ON rel.oid = trg.tgrelid
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'account_deletion_execution_attempts'
      AND trg.tgname = 'account_deletion_execution_attempt_target_validation'
      AND trg.tgenabled = 'O'
  ) AND EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS proc
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = proc.pronamespace
    WHERE nsp.nspname = 'public'
      AND proc.proname = 'trg_account_deletion_execution_attempt_target_validation'
      AND proc.prosecdef = true
  );
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'execution_attempt_target_validation_ready',
    'satisfied', check_ok,
    'detail', 'BEFORE INSERT/UPDATE trigger validates attempt.target_user_id against request target for all rows'
  ));
  all_ready := all_ready AND check_ok;

  check_ok := EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS proc
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = proc.pronamespace
    WHERE nsp.nspname = 'public'
      AND proc.proname = 'acquire_account_deletion_execution_lock'
      AND proc.prosecdef = true
  ) AND pg_catalog.has_function_privilege(
    'service_role',
    'public.acquire_account_deletion_execution_lock(uuid, uuid)',
    'EXECUTE'
  ) AND NOT pg_catalog.has_function_privilege(
    'authenticated',
    'public.acquire_account_deletion_execution_lock(uuid, uuid)',
    'EXECUTE'
  );
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'account_deletion_acquisition_rpc_ready',
    'satisfied', check_ok,
    'detail', 'acquire_account_deletion_execution_lock(uuid,uuid) exists SECURITY DEFINER service_role-only'
  ));
  all_ready := all_ready AND check_ok;

  check_ok := EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS proc
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = proc.pronamespace
    WHERE nsp.nspname = 'public'
      AND proc.proname = 'account_deletion_actor_is_owner'
      AND proc.prosecdef = true
  ) AND NOT pg_catalog.has_function_privilege(
    'authenticated',
    'public.account_deletion_actor_is_owner(uuid)',
    'EXECUTE'
  );
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'owner_execution_validation_ready',
    'satisfied', check_ok,
    'detail', 'account_deletion_actor_is_owner(uuid) exists and is not executable by authenticated'
  ));
  all_ready := all_ready AND check_ok;

  check_ok := EXISTS (
    SELECT 1
    FROM pg_catalog.pg_indexes AS idx
    WHERE idx.schemaname = 'public'
      AND idx.tablename = 'account_deletion_execution_attempts'
      AND idx.indexname = 'account_deletion_execution_attempts_one_active_per_request_idx'
      AND idx.indexdef ILIKE '%UNIQUE%'
      AND idx.indexdef ILIKE '%active%'
  );
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'attempt_single_active_constraint_ready',
    'satisfied', check_ok,
    'detail', 'Partial unique index enforces one active attempt per deletion request'
  ));
  all_ready := all_ready AND check_ok;

  check_ok := EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS proc
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = proc.pronamespace
    WHERE nsp.nspname = 'public'
      AND proc.proname = 'acquire_account_deletion_execution_lock'
  ) AND EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS proc
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = proc.pronamespace
    WHERE nsp.nspname = 'public'
      AND proc.proname = 'account_deletion_actor_is_owner'
  ) AND NOT pg_catalog.has_function_privilege(
    'authenticated',
    'public.acquire_account_deletion_execution_lock(uuid, uuid)',
    'EXECUTE'
  ) AND NOT pg_catalog.has_function_privilege(
    'anon',
    'public.acquire_account_deletion_execution_lock(uuid, uuid)',
    'EXECUTE'
  );
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'account_deletion_acquisition_security_ready',
    'satisfied', check_ok,
    'detail', 'Acquisition RPC and owner helper are not executable by authenticated/anon'
  ));
  all_ready := all_ready AND check_ok;

  RETURN jsonb_build_object(
    'ready', all_ready,
    'checked_at', to_jsonb(now()),
    'prerequisites', prerequisites
  );
END;
$$;

ALTER FUNCTION public.verify_account_deletion_acquisition_foundation_ready() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.verify_account_deletion_acquisition_foundation_ready() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_account_deletion_acquisition_foundation_ready() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.verify_account_deletion_acquisition_foundation_ready() TO service_role;

-- ---------------------------------------------------------------------------
-- F) Compose acquisition readiness into schema execution readiness
-- ---------------------------------------------------------------------------

ALTER FUNCTION public.verify_account_deletion_schema_execution_ready()
  RENAME TO verify_account_deletion_schema_execution_ready_before_acquisition;

CREATE OR REPLACE FUNCTION public.verify_account_deletion_schema_execution_ready()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  core jsonb;
  acquisition jsonb;
  prerequisites jsonb;
  all_ready boolean;
BEGIN
  core := public.verify_account_deletion_schema_execution_ready_before_acquisition();
  acquisition := public.verify_account_deletion_acquisition_foundation_ready();

  prerequisites :=
    coalesce(core->'prerequisites', '[]'::jsonb)
    || coalesce(acquisition->'prerequisites', '[]'::jsonb);

  all_ready :=
    coalesce((core->>'ready')::boolean, false)
    AND coalesce((acquisition->>'ready')::boolean, false);

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
  'Read-only live catalog probe for account-deletion schema + write-freeze + execution + acquisition readiness. '
  'Composes verify_account_deletion_schema_execution_ready_before_acquisition() with '
  'verify_account_deletion_acquisition_foundation_ready(). Does not consult schema_migrations. '
  'Fail-closed. service_role only. Does not enable execution.';

COMMIT;
