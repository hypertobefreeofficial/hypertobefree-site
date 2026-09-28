-- Phase 4C.7B.1E.2C.3B.3D — Physical storage executor foundation (DB authority + hold hardening).
-- DDL/functions/grants/readiness only. No Storage API calls. No orchestrator wiring.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.account_deletion_storage_execution_results') IS NULL THEN
    RAISE EXCEPTION '3B.3D precondition failed: account_deletion_storage_execution_results missing';
  END IF;
  IF to_regprocedure('public.claim_account_deletion_storage_execution_object(uuid, uuid, uuid, integer)') IS NULL THEN
    RAISE EXCEPTION '3B.3D precondition failed: claim RPC missing';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- A0) Audit event vocabulary for executor + hold conflict honesty
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
        'delete_completed'::text
      ]
    )
  );

-- ---------------------------------------------------------------------------
-- A) Delete commitment columns (point-of-no-return metadata)
-- ---------------------------------------------------------------------------

ALTER TABLE public.account_deletion_storage_execution_results
  ADD COLUMN IF NOT EXISTS delete_commit_token uuid NULL,
  ADD COLUMN IF NOT EXISTS delete_committed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS delete_commit_expires_at timestamptz NULL;

COMMENT ON COLUMN public.account_deletion_storage_execution_results.delete_commit_token IS
  '3B.3D: Unpredictable server-generated token authorizing one external Storage remove for this result row. '
  'Set only by authorize_account_deletion_storage_object_delete. Cleared on terminal completion or safe recovery.';

ALTER TABLE public.account_deletion_storage_execution_results
  DROP CONSTRAINT IF EXISTS account_deletion_storage_execution_results_claim_shape;

ALTER TABLE public.account_deletion_storage_execution_results
  ADD CONSTRAINT account_deletion_storage_execution_results_claim_shape CHECK (
    (
      execution_state = 'deleting'::text
      AND claim_token IS NOT NULL
      AND claim_lease_expires_at IS NOT NULL
    )
    OR (
      execution_state <> 'deleting'::text
      AND claim_token IS NULL
      AND claim_lease_expires_at IS NULL
      AND claim_backend_pid IS NULL
      AND delete_commit_token IS NULL
      AND delete_committed_at IS NULL
      AND delete_commit_expires_at IS NULL
    )
  );

ALTER TABLE public.account_deletion_storage_execution_results
  ADD CONSTRAINT account_deletion_storage_execution_results_delete_commit_shape CHECK (
    (
      delete_commit_token IS NULL
      AND delete_committed_at IS NULL
      AND delete_commit_expires_at IS NULL
    )
    OR (
      delete_commit_token IS NOT NULL
      AND delete_committed_at IS NOT NULL
      AND delete_commit_expires_at IS NOT NULL
      AND execution_state = 'deleting'::text
    )
  );

-- ---------------------------------------------------------------------------
-- B) Authenticated actor helpers (JWT-derived; not caller-supplied UUID)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.account_deletion_jwt_aal2_satisfied()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(NULLIF(auth.jwt() ->> 'aal', ''), '') = 'aal2'::text;
$$;

ALTER FUNCTION public.account_deletion_jwt_aal2_satisfied() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_jwt_aal2_satisfied() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_deletion_jwt_aal2_satisfied() FROM authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_jwt_aal2_satisfied() FROM anon;
REVOKE ALL ON FUNCTION public.account_deletion_jwt_aal2_satisfied() FROM service_role;

CREATE OR REPLACE FUNCTION public.account_deletion_authenticated_actor_is_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL
    AND public.current_user_is_owner();
$$;

ALTER FUNCTION public.account_deletion_authenticated_actor_is_owner() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_authenticated_actor_is_owner() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_deletion_authenticated_actor_is_owner() FROM anon;
REVOKE ALL ON FUNCTION public.account_deletion_authenticated_actor_is_owner() FROM service_role;
GRANT EXECUTE ON FUNCTION public.account_deletion_authenticated_actor_is_owner() TO authenticated;

CREATE OR REPLACE FUNCTION public.account_deletion_authenticated_owner_release_authorized()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.account_deletion_authenticated_actor_is_owner()
    AND public.account_deletion_jwt_aal2_satisfied();
$$;

ALTER FUNCTION public.account_deletion_authenticated_owner_release_authorized() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_authenticated_owner_release_authorized() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_deletion_authenticated_owner_release_authorized() FROM anon;
REVOKE ALL ON FUNCTION public.account_deletion_authenticated_owner_release_authorized() FROM service_role;
GRANT EXECUTE ON FUNCTION public.account_deletion_authenticated_owner_release_authorized() TO authenticated;

-- ---------------------------------------------------------------------------
-- C) Destructive bucket allowlist + exact existence (read-only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.account_deletion_storage_destructive_bucket_allowed(
  p_bucket text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT p_bucket = 'journey-private-media'::text;
$$;

ALTER FUNCTION public.account_deletion_storage_destructive_bucket_allowed(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_storage_destructive_bucket_allowed(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_deletion_storage_destructive_bucket_allowed(text) FROM authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_storage_destructive_bucket_allowed(text) FROM anon;
REVOKE ALL ON FUNCTION public.account_deletion_storage_destructive_bucket_allowed(text) FROM service_role;

CREATE OR REPLACE FUNCTION public.account_deletion_storage_object_path_canonical(p_path text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT p_path IS NOT NULL
    AND btrim(p_path) <> ''::text
    AND p_path = btrim(p_path)
    AND left(p_path, 1) <> '/'::text;
$$;

ALTER FUNCTION public.account_deletion_storage_object_path_canonical(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_storage_object_path_canonical(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_deletion_storage_object_path_canonical(text) FROM authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_storage_object_path_canonical(text) FROM anon;
REVOKE ALL ON FUNCTION public.account_deletion_storage_object_path_canonical(text) FROM service_role;

CREATE OR REPLACE FUNCTION public.account_deletion_storage_object_exact_exists(
  p_bucket text,
  p_object_path text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM storage.objects AS object_row
    WHERE object_row.bucket_id = p_bucket
      AND object_row.name = p_object_path
  );
$$;

ALTER FUNCTION public.account_deletion_storage_object_exact_exists(text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_storage_object_exact_exists(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_deletion_storage_object_exact_exists(text, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_storage_object_exact_exists(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.account_deletion_storage_object_exact_exists(text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- D) Hold invalidation for pre-commit deleting rows
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.account_deletion_storage_execution_invalidate_precommit_deleting(
  p_request_id uuid,
  p_attempt_id uuid,
  p_manifest_object_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  updated_count integer := 0;
BEGIN
  UPDATE public.account_deletion_storage_execution_results AS result_row
  SET
    execution_state = 'blocked_on_hold'::text,
    claim_token = NULL,
    claim_lease_expires_at = NULL,
    claim_backend_pid = NULL,
    delete_commit_token = NULL,
    delete_committed_at = NULL,
    delete_commit_expires_at = NULL,
    updated_at = now()
  WHERE result_row.deletion_request_id = p_request_id
    AND result_row.execution_attempt_id = p_attempt_id
    AND result_row.disposition_snapshot = 'DELETE_PRIVATE'::text
    AND result_row.execution_state = 'deleting'::text
    AND result_row.delete_commit_token IS NULL
    AND (
      p_manifest_object_id IS NULL
      OR result_row.manifest_object_id = p_manifest_object_id
    )
    AND public.account_deletion_storage_preservation_hold_active(
      result_row.deletion_request_id,
      result_row.execution_attempt_id,
      result_row.manifest_object_id
    );

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

ALTER FUNCTION public.account_deletion_storage_execution_invalidate_precommit_deleting(uuid, uuid, uuid)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_storage_execution_invalidate_precommit_deleting(uuid, uuid, uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_deletion_storage_execution_invalidate_precommit_deleting(uuid, uuid, uuid)
  FROM authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_storage_execution_invalidate_precommit_deleting(uuid, uuid, uuid)
  FROM anon;
REVOKE ALL ON FUNCTION public.account_deletion_storage_execution_invalidate_precommit_deleting(uuid, uuid, uuid)
  FROM service_role;

CREATE OR REPLACE FUNCTION public.account_deletion_storage_execution_refresh_hold_eligibility(
  p_request_id uuid,
  p_attempt_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  updated_count integer := 0;
  invalidated integer := 0;
BEGIN
  invalidated := public.account_deletion_storage_execution_invalidate_precommit_deleting(
    p_request_id,
    p_attempt_id,
    NULL
  );

  UPDATE public.account_deletion_storage_execution_results AS result_row
  SET
    execution_state = public.account_deletion_storage_execution_classify_from_manifest(
      result_row.disposition_snapshot,
      public.account_deletion_storage_preservation_hold_active(
        result_row.deletion_request_id,
        result_row.execution_attempt_id,
        result_row.manifest_object_id
      )
    ),
    updated_at = now()
  WHERE result_row.deletion_request_id = p_request_id
    AND result_row.execution_attempt_id = p_attempt_id
    AND result_row.disposition_snapshot = 'DELETE_PRIVATE'::text
    AND result_row.execution_state = ANY (
      ARRAY['pending'::text, 'blocked_on_hold'::text]
    );

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count + invalidated;
END;
$$;

-- ---------------------------------------------------------------------------
-- E) Seal spoofable hold RPCs → inner + authenticated wrappers
-- ---------------------------------------------------------------------------

ALTER FUNCTION public.create_account_deletion_storage_preservation_hold(
  uuid, uuid, text, text, uuid, uuid, text
) RENAME TO create_account_deletion_storage_preservation_hold_inner;

ALTER FUNCTION public.release_account_deletion_storage_preservation_hold(uuid, uuid)
  RENAME TO release_account_deletion_storage_preservation_hold_inner;

CREATE OR REPLACE FUNCTION public.create_account_deletion_storage_preservation_hold_inner(
  p_request_id uuid,
  p_created_by uuid,
  p_hold_scope text,
  p_reason_code text,
  p_execution_attempt_id uuid DEFAULT NULL,
  p_manifest_object_id uuid DEFAULT NULL,
  p_notes_safe text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  hold_id uuid;
  att record;
  manifest_row record;
  committed_conflict_count integer := 0;
  response_code text;
BEGIN
  IF p_request_id IS NULL OR p_created_by IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_arguments');
  END IF;

  IF NOT public.account_deletion_actor_is_owner(p_created_by) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'owner_required');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.account_deletion_requests AS request_row
    WHERE request_row.id = p_request_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'request_not_found');
  END IF;

  IF p_hold_scope = 'attempt'::text OR p_hold_scope = 'manifest_object'::text THEN
    SELECT attempt_row.id, attempt_row.deletion_request_id
    INTO att
    FROM public.account_deletion_execution_attempts AS attempt_row
    WHERE attempt_row.id = p_execution_attempt_id;

    IF NOT FOUND OR att.deletion_request_id IS DISTINCT FROM p_request_id THEN
      RETURN jsonb_build_object('ok', false, 'code', 'attempt_mismatch');
    END IF;
  END IF;

  IF p_hold_scope = 'manifest_object'::text THEN
    SELECT manifest.id, manifest.deletion_request_id, manifest.execution_attempt_id
    INTO manifest_row
    FROM public.account_deletion_storage_manifest AS manifest
    WHERE manifest.id = p_manifest_object_id;

    IF NOT FOUND
       OR manifest_row.deletion_request_id IS DISTINCT FROM p_request_id
       OR manifest_row.execution_attempt_id IS DISTINCT FROM p_execution_attempt_id THEN
      RETURN jsonb_build_object('ok', false, 'code', 'manifest_object_mismatch');
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.account_deletion_storage_execution_results AS result_row
      WHERE result_row.manifest_object_id = p_manifest_object_id
        AND result_row.delete_commit_token IS NOT NULL
        AND result_row.execution_state = 'deleting'::text
    ) THEN
      PERFORM public.account_deletion_storage_execution_audit_append(
        'hold_create_rejected_committed'::text,
        p_request_id,
        p_execution_attempt_id,
        p_manifest_object_id,
        NULL,
        NULL,
        p_created_by,
        'delete_already_committed'
      );
      RETURN jsonb_build_object('ok', false, 'code', 'delete_already_committed');
    END IF;
  END IF;

  IF p_hold_scope = 'request'::text OR p_hold_scope = 'attempt'::text THEN
    SELECT count(*)::integer
    INTO committed_conflict_count
    FROM public.account_deletion_storage_execution_results AS result_row
    WHERE result_row.deletion_request_id = p_request_id
      AND (
        p_hold_scope = 'request'::text
        OR result_row.execution_attempt_id = p_execution_attempt_id
      )
      AND result_row.disposition_snapshot = 'DELETE_PRIVATE'::text
      AND result_row.delete_commit_token IS NOT NULL
      AND result_row.execution_state = 'deleting'::text;
  END IF;

  INSERT INTO public.account_deletion_storage_preservation_holds (
    deletion_request_id,
    execution_attempt_id,
    manifest_object_id,
    hold_scope,
    reason_code,
    notes_safe,
    active,
    created_by
  ) VALUES (
    p_request_id,
    p_execution_attempt_id,
    p_manifest_object_id,
    p_hold_scope,
    p_reason_code,
    p_notes_safe,
    true,
    p_created_by
  )
  RETURNING id INTO hold_id;

  IF p_hold_scope = 'request'::text THEN
    PERFORM public.account_deletion_storage_execution_refresh_hold_eligibility(
      p_request_id,
      attempt_row.id
    )
    FROM public.account_deletion_execution_attempts AS attempt_row
    WHERE attempt_row.deletion_request_id = p_request_id
      AND attempt_row.stage = 'database_completed'::text;
  ELSE
    PERFORM public.account_deletion_storage_execution_refresh_hold_eligibility(
      p_request_id,
      p_execution_attempt_id
    );
  END IF;

  IF committed_conflict_count > 0 THEN
    PERFORM public.account_deletion_storage_execution_audit_append(
      'hold_created'::text,
      p_request_id,
      p_execution_attempt_id,
      p_manifest_object_id,
      NULL,
      hold_id,
      p_created_by,
      'hold_created_with_committed_conflicts'
    );
  ELSE
    PERFORM public.account_deletion_storage_execution_audit_append(
      'hold_created'::text,
      p_request_id,
      p_execution_attempt_id,
      p_manifest_object_id,
      NULL,
      hold_id,
      p_created_by,
      p_reason_code
    );
  END IF;

  response_code := CASE
    WHEN committed_conflict_count > 0 THEN 'hold_created_with_committed_conflicts'::text
    ELSE 'hold_created'::text
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'code', response_code,
    'hold_id', hold_id,
    'committed_conflict_count', committed_conflict_count
  );
END;
$$;

ALTER FUNCTION public.create_account_deletion_storage_preservation_hold_inner(
  uuid, uuid, text, text, uuid, uuid, text
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_account_deletion_storage_preservation_hold_inner(
  uuid, uuid, text, text, uuid, uuid, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_account_deletion_storage_preservation_hold_inner(
  uuid, uuid, text, text, uuid, uuid, text
) FROM authenticated;
REVOKE ALL ON FUNCTION public.create_account_deletion_storage_preservation_hold_inner(
  uuid, uuid, text, text, uuid, uuid, text
) FROM anon;
REVOKE ALL ON FUNCTION public.create_account_deletion_storage_preservation_hold_inner(
  uuid, uuid, text, text, uuid, uuid, text
) FROM service_role;

CREATE OR REPLACE FUNCTION public.create_account_deletion_storage_preservation_hold(
  p_request_id uuid,
  p_hold_scope text,
  p_reason_code text,
  p_execution_attempt_id uuid DEFAULT NULL,
  p_manifest_object_id uuid DEFAULT NULL,
  p_notes_safe text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor uuid;
BEGIN
  actor := auth.uid();
  IF actor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'authentication_required');
  END IF;

  IF NOT public.account_deletion_authenticated_actor_is_owner() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'owner_required');
  END IF;

  RETURN public.create_account_deletion_storage_preservation_hold_inner(
    p_request_id,
    actor,
    p_hold_scope,
    p_reason_code,
    p_execution_attempt_id,
    p_manifest_object_id,
    p_notes_safe
  );
END;
$$;

ALTER FUNCTION public.create_account_deletion_storage_preservation_hold(
  uuid, text, text, uuid, uuid, text
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_account_deletion_storage_preservation_hold(
  uuid, text, text, uuid, uuid, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_account_deletion_storage_preservation_hold(
  uuid, text, text, uuid, uuid, text
) FROM anon;
REVOKE ALL ON FUNCTION public.create_account_deletion_storage_preservation_hold(
  uuid, text, text, uuid, uuid, text
) FROM service_role;
GRANT EXECUTE ON FUNCTION public.create_account_deletion_storage_preservation_hold(
  uuid, text, text, uuid, uuid, text
) TO authenticated;

CREATE OR REPLACE FUNCTION public.release_account_deletion_storage_preservation_hold_inner(
  p_hold_id uuid,
  p_released_by uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  hold_row record;
BEGIN
  IF p_hold_id IS NULL OR p_released_by IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_arguments');
  END IF;

  IF NOT public.account_deletion_actor_is_owner(p_released_by) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'owner_required');
  END IF;

  SELECT
    hold.id,
    hold.deletion_request_id,
    hold.execution_attempt_id,
    hold.active
  INTO hold_row
  FROM public.account_deletion_storage_preservation_holds AS hold
  WHERE hold.id = p_hold_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'hold_not_found');
  END IF;

  IF hold_row.active = false THEN
    RETURN jsonb_build_object('ok', false, 'code', 'hold_already_released');
  END IF;

  UPDATE public.account_deletion_storage_preservation_holds AS hold
  SET
    active = false,
    released_at = now(),
    released_by = p_released_by
  WHERE hold.id = p_hold_id;

  IF hold_row.execution_attempt_id IS NOT NULL THEN
    PERFORM public.account_deletion_storage_execution_refresh_hold_eligibility(
      hold_row.deletion_request_id,
      hold_row.execution_attempt_id
    );
  ELSE
    PERFORM public.account_deletion_storage_execution_refresh_hold_eligibility(
      hold_row.deletion_request_id,
      attempt_row.id
    )
    FROM public.account_deletion_execution_attempts AS attempt_row
    WHERE attempt_row.deletion_request_id = hold_row.deletion_request_id
      AND attempt_row.stage = 'database_completed'::text;
  END IF;

  PERFORM public.account_deletion_storage_execution_audit_append(
    'hold_released'::text,
    hold_row.deletion_request_id,
    hold_row.execution_attempt_id,
    NULL,
    NULL,
    p_hold_id,
    p_released_by,
    'released'
  );

  RETURN jsonb_build_object('ok', true, 'code', 'hold_released');
END;
$$;

ALTER FUNCTION public.release_account_deletion_storage_preservation_hold_inner(uuid, uuid)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.release_account_deletion_storage_preservation_hold_inner(uuid, uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_account_deletion_storage_preservation_hold_inner(uuid, uuid)
  FROM authenticated;
REVOKE ALL ON FUNCTION public.release_account_deletion_storage_preservation_hold_inner(uuid, uuid)
  FROM anon;
REVOKE ALL ON FUNCTION public.release_account_deletion_storage_preservation_hold_inner(uuid, uuid)
  FROM service_role;

CREATE OR REPLACE FUNCTION public.release_account_deletion_storage_preservation_hold(
  p_hold_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor uuid;
BEGIN
  actor := auth.uid();
  IF actor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'authentication_required');
  END IF;

  IF NOT public.account_deletion_authenticated_actor_is_owner() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'owner_required');
  END IF;

  IF NOT public.account_deletion_jwt_aal2_satisfied() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'owner_aal2_required');
  END IF;

  RETURN public.release_account_deletion_storage_preservation_hold_inner(
    p_hold_id,
    actor
  );
END;
$$;

ALTER FUNCTION public.release_account_deletion_storage_preservation_hold(uuid)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.release_account_deletion_storage_preservation_hold(uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_account_deletion_storage_preservation_hold(uuid)
  FROM anon;
REVOKE ALL ON FUNCTION public.release_account_deletion_storage_preservation_hold(uuid)
  FROM service_role;
GRANT EXECUTE ON FUNCTION public.release_account_deletion_storage_preservation_hold(uuid)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- F) Final delete authorization (atomic point-of-no-return)
-- ---------------------------------------------------------------------------

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
     OR att.stage <> 'database_completed'::text
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

ALTER FUNCTION public.authorize_account_deletion_storage_object_delete(uuid, uuid, uuid, uuid)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.authorize_account_deletion_storage_object_delete(uuid, uuid, uuid, uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.authorize_account_deletion_storage_object_delete(uuid, uuid, uuid, uuid)
  FROM authenticated;
REVOKE ALL ON FUNCTION public.authorize_account_deletion_storage_object_delete(uuid, uuid, uuid, uuid)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.authorize_account_deletion_storage_object_delete(uuid, uuid, uuid, uuid)
  TO service_role;

-- ---------------------------------------------------------------------------
-- G) Terminal completion RPC
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.complete_account_deletion_storage_execution_object(
  p_request_id uuid,
  p_attempt_id uuid,
  p_result_id uuid,
  p_delete_commit_token uuid,
  p_outcome text,
  p_error_code text DEFAULT NULL,
  p_error_detail_safe text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  result_row record;
  manifest_row record;
  next_state text;
  max_auto_attempts constant integer := 20;
BEGIN
  IF p_request_id IS NULL OR p_attempt_id IS NULL OR p_result_id IS NULL OR p_outcome IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_arguments');
  END IF;

  IF p_outcome NOT IN (
    'deleted'::text,
    'missing'::text,
    'failed_retryable'::text,
    'failed_terminal'::text
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_outcome');
  END IF;

  SELECT
    result.id,
    result.deletion_request_id,
    result.execution_attempt_id,
    result.manifest_object_id,
    result.disposition_snapshot,
    result.execution_state,
    result.delete_commit_token,
    result.delete_commit_expires_at,
    result.claim_token,
    result.attempt_count
  INTO result_row
  FROM public.account_deletion_storage_execution_results AS result
  WHERE result.id = p_result_id
  FOR UPDATE;

  IF NOT FOUND
     OR result_row.deletion_request_id IS DISTINCT FROM p_request_id
     OR result_row.execution_attempt_id IS DISTINCT FROM p_attempt_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'result_mismatch');
  END IF;

  IF result_row.disposition_snapshot <> 'DELETE_PRIVATE'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_delete_eligible');
  END IF;

  IF result_row.execution_state IN ('deleted'::text, 'missing'::text, 'failed_terminal'::text) THEN
    RETURN jsonb_build_object('ok', true, 'code', 'already_terminal', 'execution_state', result_row.execution_state);
  END IF;

  IF result_row.delete_commit_token IS NOT NULL THEN
    IF p_delete_commit_token IS NULL
       OR result_row.delete_commit_token IS DISTINCT FROM p_delete_commit_token THEN
      RETURN jsonb_build_object('ok', false, 'code', 'delete_commit_token_mismatch');
    END IF;
    IF result_row.delete_commit_expires_at IS NULL OR result_row.delete_commit_expires_at <= now() THEN
      RETURN jsonb_build_object('ok', false, 'code', 'delete_commit_expired');
    END IF;
    IF result_row.execution_state <> 'deleting'::text THEN
      RETURN jsonb_build_object('ok', false, 'code', 'not_deleting');
    END IF;
  ELSE
    RETURN jsonb_build_object('ok', false, 'code', 'delete_commit_authority_required');
  END IF;

  SELECT manifest.disposition
  INTO manifest_row
  FROM public.account_deletion_storage_manifest AS manifest
  WHERE manifest.id = result_row.manifest_object_id;

  IF NOT FOUND OR manifest_row.disposition <> 'DELETE_PRIVATE'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'manifest_authority_mismatch');
  END IF;

  next_state := CASE p_outcome
    WHEN 'deleted'::text THEN 'deleted'::text
    WHEN 'missing'::text THEN 'missing'::text
    WHEN 'failed_retryable'::text THEN 'failed_retryable'::text
    WHEN 'failed_terminal'::text THEN 'failed_terminal'::text
    ELSE 'failed_terminal'::text
  END;

  IF p_outcome = 'failed_retryable'::text
     AND result_row.attempt_count >= max_auto_attempts THEN
    next_state := 'failed_terminal'::text;
    p_error_code := coalesce(p_error_code, 'max_automatic_attempts_exceeded');
  END IF;

  UPDATE public.account_deletion_storage_execution_results AS done_row
  SET
    execution_state = next_state,
    completed_at = CASE
      WHEN next_state IN ('deleted'::text, 'missing'::text, 'failed_terminal'::text) THEN now()
      ELSE done_row.completed_at
    END,
    claim_token = NULL,
    claim_lease_expires_at = NULL,
    claim_backend_pid = NULL,
    delete_commit_token = NULL,
    delete_committed_at = NULL,
    delete_commit_expires_at = NULL,
    last_error_code = CASE
      WHEN next_state IN ('failed_retryable'::text, 'failed_terminal'::text) THEN p_error_code
      ELSE NULL
    END,
    last_error_detail_safe = CASE
      WHEN next_state IN ('failed_retryable'::text, 'failed_terminal'::text) THEN p_error_detail_safe
      ELSE NULL
    END,
    updated_at = now()
  WHERE done_row.id = p_result_id;

  PERFORM public.account_deletion_storage_execution_audit_append(
    'delete_completed'::text,
    p_request_id,
    p_attempt_id,
    result_row.manifest_object_id,
    p_result_id,
    NULL,
    NULL,
    p_outcome
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'completed',
    'execution_state', next_state
  );
END;
$$;

ALTER FUNCTION public.complete_account_deletion_storage_execution_object(
  uuid, uuid, uuid, uuid, text, text, text
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.complete_account_deletion_storage_execution_object(
  uuid, uuid, uuid, uuid, text, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_account_deletion_storage_execution_object(
  uuid, uuid, uuid, uuid, text, text, text
) FROM authenticated;
REVOKE ALL ON FUNCTION public.complete_account_deletion_storage_execution_object(
  uuid, uuid, uuid, uuid, text, text, text
) FROM anon;
GRANT EXECUTE ON FUNCTION public.complete_account_deletion_storage_execution_object(
  uuid, uuid, uuid, uuid, text, text, text
) TO service_role;

-- ---------------------------------------------------------------------------
-- H) Claim by result id (machine entry; manifest derived)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_account_deletion_storage_execution_result(
  p_request_id uuid,
  p_attempt_id uuid,
  p_result_id uuid,
  p_lease_seconds integer DEFAULT 900
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  manifest_id uuid;
BEGIN
  SELECT result_row.manifest_object_id
  INTO manifest_id
  FROM public.account_deletion_storage_execution_results AS result_row
  WHERE result_row.id = p_result_id
    AND result_row.deletion_request_id = p_request_id
    AND result_row.execution_attempt_id = p_attempt_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'result_mismatch');
  END IF;

  RETURN public.claim_account_deletion_storage_execution_object(
    p_request_id,
    p_attempt_id,
    manifest_id,
    p_lease_seconds
  );
END;
$$;

ALTER FUNCTION public.claim_account_deletion_storage_execution_result(uuid, uuid, uuid, integer)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.claim_account_deletion_storage_execution_result(uuid, uuid, uuid, integer)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_account_deletion_storage_execution_result(uuid, uuid, uuid, integer)
  FROM authenticated;
REVOKE ALL ON FUNCTION public.claim_account_deletion_storage_execution_result(uuid, uuid, uuid, integer)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.claim_account_deletion_storage_execution_result(uuid, uuid, uuid, integer)
  TO service_role;

-- ---------------------------------------------------------------------------
-- I) Readiness: storage executor foundation
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.verify_account_deletion_storage_executor_ready()
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
  authorize_def text;
  complete_def text;
BEGIN
  check_ok := EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.account_deletion_storage_execution_results'::regclass
      AND attname = 'delete_commit_token'
      AND NOT attisdropped
  );
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'delete_commit_columns_present',
      'ready', check_ok,
      'detail', 'delete_commit_token/delete_committed_at/delete_commit_expires_at on results'
    )
  );
  all_ready := all_ready AND check_ok;

  check_ok := to_regprocedure(
    'public.authorize_account_deletion_storage_object_delete(uuid, uuid, uuid, uuid)'
  ) IS NOT NULL
  AND to_regprocedure(
    'public.complete_account_deletion_storage_execution_object(uuid, uuid, uuid, uuid, text, text, text)'
  ) IS NOT NULL
  AND to_regprocedure(
    'public.account_deletion_storage_object_exact_exists(text, text)'
  ) IS NOT NULL;
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'storage_executor_rpcs_present',
      'ready', check_ok,
      'detail', 'authorize + complete + exact existence helper installed'
    )
  );
  all_ready := all_ready AND check_ok;

  authorize_def := pg_catalog.pg_get_functiondef(
    to_regprocedure(
      'public.authorize_account_deletion_storage_object_delete(uuid, uuid, uuid, uuid)'
    )
  );
  check_ok := authorize_def ILIKE '%preservation_hold_active%'
  AND authorize_def ILIKE '%account_deletion_storage_destructive_bucket_allowed%'
  AND authorize_def ILIKE '%delete_commit_token%'
  AND authorize_def NOT ILIKE '%DELETE FROM storage.objects%';
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'storage_executor_authorize_hardened',
      'ready', check_ok,
      'detail', 'authorize rechecks hold, allowlist bucket, issues commit token; no storage.objects DELETE'
    )
  );
  all_ready := all_ready AND check_ok;

  complete_def := pg_catalog.pg_get_functiondef(
    to_regprocedure(
      'public.complete_account_deletion_storage_execution_object(uuid, uuid, uuid, uuid, text, text, text)'
    )
  );
  check_ok := complete_def ILIKE '%delete_commit_token%'
  AND complete_def ILIKE '%invalid_outcome%'
  AND complete_def ILIKE '%delete_commit_authority_required%';
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'storage_executor_complete_hardened',
      'ready', check_ok,
      'detail', 'completion requires current delete commit token for all outcomes'
    )
  );
  all_ready := all_ready AND check_ok;

  check_ok := pg_catalog.pg_get_functiondef(
    to_regprocedure('public.account_deletion_jwt_aal2_satisfied()')
  ) NOT ILIKE '%app_metadata%'
  AND pg_catalog.pg_get_functiondef(
    to_regprocedure(
      'public.create_account_deletion_storage_preservation_hold_inner(uuid, uuid, text, text, uuid, uuid, text)'
    )
  ) ILIKE '%hold_created_with_committed_conflicts%';
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'storage_executor_hold_aal_and_partial_conflict',
      'ready', check_ok,
      'detail', 'release AAL from current JWT only; broad holds survive committed conflicts'
    )
  );
  all_ready := all_ready AND check_ok;

  check_ok := to_regprocedure(
    'public.create_account_deletion_storage_preservation_hold(uuid, text, text, uuid, uuid, text)'
  ) IS NOT NULL
  AND NOT pg_catalog.has_function_privilege(
    'service_role',
    'public.create_account_deletion_storage_preservation_hold_inner(uuid, uuid, text, text, uuid, uuid, text)',
    'EXECUTE'
  )
  AND NOT pg_catalog.has_function_privilege(
    'service_role',
    'public.create_account_deletion_storage_preservation_hold(uuid, text, text, uuid, uuid, text)',
    'EXECUTE'
  )
  AND pg_catalog.has_function_privilege(
    'authenticated',
    'public.create_account_deletion_storage_preservation_hold(uuid, text, text, uuid, uuid, text)',
    'EXECUTE'
  );
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'hold_actor_binding_authenticated_wrappers',
      'ready', check_ok,
      'detail', 'hold create/release use auth.uid(); inner/spoofable path sealed from service_role'
    )
  );
  all_ready := all_ready AND check_ok;

  check_ok := pg_catalog.pg_get_functiondef(
    to_regprocedure(
      'public.account_deletion_storage_execution_refresh_hold_eligibility(uuid, uuid)'
    )
  ) ILIKE '%account_deletion_storage_execution_invalidate_precommit_deleting%';
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'hold_invalidates_precommit_deleting',
      'ready', check_ok,
      'detail', 'active hold clears deleting-without-commit claim authority'
    )
  );
  all_ready := all_ready AND check_ok;

  check_ok := public.account_deletion_storage_destructive_bucket_allowed('journey-private-media'::text)
  AND NOT public.account_deletion_storage_destructive_bucket_allowed('story-videos'::text);
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'destructive_bucket_allowlist_journey_private_only',
      'ready', check_ok,
      'detail', 'physical delete authority limited to journey-private-media in 3B.3D'
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

ALTER FUNCTION public.verify_account_deletion_storage_executor_ready() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.verify_account_deletion_storage_executor_ready() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_account_deletion_storage_executor_ready() FROM authenticated;
REVOKE ALL ON FUNCTION public.verify_account_deletion_storage_executor_ready() FROM anon;
GRANT EXECUTE ON FUNCTION public.verify_account_deletion_storage_executor_ready() TO service_role;

-- ---------------------------------------------------------------------------
-- J) Update 3B.3C foundation readiness for new hold RPC signatures
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.verify_account_deletion_storage_execution_foundation_ready()
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
  init_def text;
  claim_def text;
BEGIN
  check_ok := to_regclass('public.account_deletion_storage_execution_results') IS NOT NULL
  AND to_regclass('public.account_deletion_storage_preservation_holds') IS NOT NULL
  AND to_regclass('public.account_deletion_storage_execution_audit') IS NOT NULL;
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'storage_execution_tables_present',
      'ready', check_ok,
      'detail', 'execution results + preservation holds + audit tables exist'
    )
  );
  all_ready := all_ready AND check_ok;

  check_ok := EXISTS (
    SELECT 1
    FROM pg_catalog.pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'account_deletion_storage_execution_results_attempt_manifest_uidx'
  );
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'storage_execution_idempotency_unique',
      'ready', check_ok,
      'detail', 'unique (execution_attempt_id, manifest_object_id) prevents duplicate results'
    )
  );
  all_ready := all_ready AND check_ok;

  check_ok := NOT has_table_privilege('service_role', 'public.account_deletion_storage_execution_results', 'INSERT')
  AND NOT has_table_privilege('service_role', 'public.account_deletion_storage_execution_results', 'UPDATE')
  AND NOT has_table_privilege('service_role', 'public.account_deletion_storage_execution_results', 'DELETE')
  AND NOT has_table_privilege('service_role', 'public.account_deletion_storage_preservation_holds', 'INSERT')
  AND NOT has_table_privilege('service_role', 'public.account_deletion_storage_preservation_holds', 'UPDATE')
  AND NOT has_table_privilege('service_role', 'public.account_deletion_storage_preservation_holds', 'DELETE')
  AND has_table_privilege('service_role', 'public.account_deletion_storage_execution_results', 'SELECT');
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'storage_execution_service_role_mutation_denied',
      'ready', check_ok,
      'detail', 'service_role SELECT-only on results/holds; mutations via narrow RPCs'
    )
  );
  all_ready := all_ready AND check_ok;

  check_ok := to_regprocedure(
    'public.initialize_account_deletion_storage_execution_results(uuid, uuid)'
  ) IS NOT NULL
  AND to_regprocedure(
    'public.create_account_deletion_storage_preservation_hold(uuid, text, text, uuid, uuid, text)'
  ) IS NOT NULL
  AND to_regprocedure(
    'public.release_account_deletion_storage_preservation_hold(uuid)'
  ) IS NOT NULL
  AND to_regprocedure(
    'public.claim_account_deletion_storage_execution_object(uuid, uuid, uuid, integer)'
  ) IS NOT NULL;
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'storage_execution_rpcs_present',
      'ready', check_ok,
      'detail', 'initialize + authenticated hold RPCs + claim installed'
    )
  );
  all_ready := all_ready AND check_ok;

  init_def := pg_catalog.pg_get_functiondef(
    to_regprocedure(
      'public.initialize_account_deletion_storage_execution_results(uuid, uuid)'
    )
  );
  check_ok := init_def ILIKE '%invalid_stage%'
  AND init_def ILIKE '%storage_manifest_not_finalized%'
  AND init_def ILIKE '%account_deletion_storage_manifest%'
  AND init_def NOT ILIKE '%storage.remove%'
  AND init_def NOT ILIKE '%DELETE FROM storage.objects%';
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'storage_execution_initialize_hardened',
      'ready', check_ok,
      'detail', 'initialize derives from finalized manifest at database_completed; no Storage deletion'
    )
  );
  all_ready := all_ready AND check_ok;

  claim_def := pg_catalog.pg_get_functiondef(
    to_regprocedure(
      'public.claim_account_deletion_storage_execution_object(uuid, uuid, uuid, integer)'
    )
  );
  check_ok := claim_def ILIKE '%not_delete_eligible%'
  AND claim_def ILIKE '%preservation_hold_active%'
  AND claim_def ILIKE '%DELETE_PRIVATE%'
  AND claim_def NOT ILIKE '%storage.remove%';
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'storage_execution_claim_hardened',
      'ready', check_ok,
      'detail', 'claim requires DELETE_PRIVATE, no hold, pending/retryable; DB lease only'
    )
  );
  all_ready := all_ready AND check_ok;

  check_ok := NOT pg_catalog.has_function_privilege(
    'service_role',
    'public.create_account_deletion_storage_preservation_hold_inner(uuid, uuid, text, text, uuid, uuid, text)',
    'EXECUTE'
  );
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'storage_execution_hold_spoof_path_sealed',
      'ready', check_ok,
      'detail', 'service_role cannot execute inner hold RPC with caller-supplied owner UUID'
    )
  );
  all_ready := all_ready AND check_ok;

  check_ok := EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.account_deletion_storage_execution_results'::regclass
      AND conname = 'account_deletion_storage_execution_results_delete_work_only_for_delete_private'
  );
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'storage_execution_only_delete_private_pending',
      'ready', check_ok,
      'detail', 'CHECK prevents non-DELETE_PRIVATE delete work states'
    )
  );
  all_ready := all_ready AND check_ok;

  IF current_setting('server_version_num')::integer >= 170000 THEN
    check_ok := NOT has_table_privilege('service_role', 'public.account_deletion_storage_execution_results', 'MAINTAIN')
    AND NOT has_table_privilege('service_role', 'public.account_deletion_storage_preservation_holds', 'MAINTAIN');
    prerequisites := prerequisites || jsonb_build_array(
      jsonb_build_object(
        'id', 'storage_execution_pg17_maintain_revoked',
        'ready', check_ok,
        'detail', 'PG17 MAINTAIN revoked on execution control tables for service_role'
      )
    );
    all_ready := all_ready AND check_ok;
  ELSE
    prerequisites := prerequisites || jsonb_build_array(
      jsonb_build_object(
        'id', 'storage_execution_pg17_maintain_revoked',
        'ready', true,
        'detail', 'MAINTAIN probe skipped (server < PG17)'
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'ready', all_ready,
    'checked_at', to_jsonb(pg_catalog.now()),
    'prerequisites', prerequisites
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- K) Compose schema readiness (before_3b3d → includes executor)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regprocedure(
    'public.verify_account_deletion_schema_execution_ready_before_3b3d()'
  ) IS NULL THEN
    ALTER FUNCTION public.verify_account_deletion_schema_execution_ready()
      RENAME TO verify_account_deletion_schema_execution_ready_before_3b3d;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_account_deletion_schema_execution_ready()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  core jsonb;
  storage_execution jsonb;
  storage_executor jsonb;
  prerequisites jsonb;
  all_ready boolean;
BEGIN
  core := public.verify_account_deletion_schema_execution_ready_before_3b3d();
  storage_execution := public.verify_account_deletion_storage_execution_foundation_ready();
  storage_executor := public.verify_account_deletion_storage_executor_ready();

  prerequisites :=
    coalesce(core->'prerequisites', '[]'::jsonb)
    || coalesce(storage_execution->'prerequisites', '[]'::jsonb)
    || coalesce(storage_executor->'prerequisites', '[]'::jsonb);

  all_ready :=
    coalesce((core->>'ready')::boolean, false)
    AND coalesce((storage_execution->>'ready')::boolean, false)
    AND coalesce((storage_executor->>'ready')::boolean, false);

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
  'Live catalog probe including storage execution foundation (3B.3C) and physical executor DB authority (3B.3D). '
  'Does not enable execution, environment flags, or perform Storage deletion.';

COMMIT;
