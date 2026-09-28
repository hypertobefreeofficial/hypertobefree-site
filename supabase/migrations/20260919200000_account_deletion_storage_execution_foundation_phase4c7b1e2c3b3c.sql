-- Phase 4C.7B.1E.2C.3B.3C — Storage execution result + preservation foundation.
-- DDL/functions/grants/readiness only. No Storage deletion. No orchestrator wiring.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.account_deletion_storage_manifest') IS NULL THEN
    RAISE EXCEPTION '3B.3C precondition failed: account_deletion_storage_manifest missing';
  END IF;
  IF to_regprocedure('public.verify_account_deletion_storage_manifest_capture_ready()') IS NULL THEN
    RAISE EXCEPTION '3B.3C precondition failed: verify_account_deletion_storage_manifest_capture_ready() missing';
  END IF;
  IF to_regprocedure('public.account_deletion_actor_is_owner(uuid)') IS NULL THEN
    RAISE EXCEPTION '3B.3C precondition failed: account_deletion_actor_is_owner(uuid) missing';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- A) Future stage vocabulary (no new advance RPCs in 3B.3C)
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
        'storage_pending'::text,
        'storage'::text,
        'storage_completed'::text,
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

COMMENT ON CONSTRAINT account_deletion_execution_attempts_stage_check
  ON public.account_deletion_execution_attempts IS
  'Forward-only lifecycle including future storage_* stages after database_completed. '
  '3B.3C does not add runnable transitions into storage_* yet.';

-- ---------------------------------------------------------------------------
-- B) Durable execution results (never mutate finalized manifest rows)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.account_deletion_storage_execution_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deletion_request_id uuid NOT NULL
    REFERENCES public.account_deletion_requests (id) ON DELETE RESTRICT,
  execution_attempt_id uuid NOT NULL
    REFERENCES public.account_deletion_execution_attempts (id) ON DELETE RESTRICT,
  manifest_object_id uuid NOT NULL
    REFERENCES public.account_deletion_storage_manifest (id) ON DELETE RESTRICT,
  target_user_id uuid NOT NULL,
  bucket text NOT NULL,
  object_path text NOT NULL,
  disposition_snapshot text NOT NULL,
  preservation_required_snapshot boolean NOT NULL DEFAULT false,
  execution_state text NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz NULL,
  completed_at timestamptz NULL,
  last_error_code text NULL,
  last_error_detail_safe text NULL,
  claim_token uuid NULL,
  claim_lease_expires_at timestamptz NULL,
  claim_backend_pid integer NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_deletion_storage_execution_results_state_check CHECK (
    execution_state = ANY (
      ARRAY[
        'pending'::text,
        'preserved'::text,
        'deferred_profile'::text,
        'blocked'::text,
        'blocked_on_hold'::text,
        'deleting'::text,
        'deleted'::text,
        'missing'::text,
        'failed_retryable'::text,
        'failed_terminal'::text
      ]
    )
  ),
  CONSTRAINT account_deletion_storage_execution_results_disposition_snapshot_check CHECK (
    disposition_snapshot = ANY (
      ARRAY[
        'DELETE_PRIVATE'::text,
        'PRESERVE_PUBLIC'::text,
        'PRESERVE_SHARED'::text,
        'DEFER_PROFILE'::text,
        'BLOCK_UNRESOLVED'::text
      ]
    )
  ),
  CONSTRAINT account_deletion_storage_execution_results_attempt_count_nonnegative CHECK (
    attempt_count >= 0
  ),
  CONSTRAINT account_deletion_storage_execution_results_delete_work_only_for_delete_private CHECK (
    (
      disposition_snapshot = 'DELETE_PRIVATE'::text
      AND execution_state = ANY (
        ARRAY[
          'pending'::text,
          'blocked_on_hold'::text,
          'deleting'::text,
          'deleted'::text,
          'missing'::text,
          'failed_retryable'::text,
          'failed_terminal'::text
        ]
      )
    )
    OR (
      disposition_snapshot <> 'DELETE_PRIVATE'::text
      AND execution_state = ANY (
        ARRAY[
          'preserved'::text,
          'deferred_profile'::text,
          'blocked'::text
        ]
      )
    )
  ),
  CONSTRAINT account_deletion_storage_execution_results_claim_shape CHECK (
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
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS account_deletion_storage_execution_results_attempt_manifest_uidx
  ON public.account_deletion_storage_execution_results (execution_attempt_id, manifest_object_id);

CREATE INDEX IF NOT EXISTS account_deletion_storage_execution_results_request_idx
  ON public.account_deletion_storage_execution_results (deletion_request_id);

CREATE INDEX IF NOT EXISTS account_deletion_storage_execution_results_state_idx
  ON public.account_deletion_storage_execution_results (execution_attempt_id, execution_state);

COMMENT ON TABLE public.account_deletion_storage_execution_results IS
  '3B.3C durable Storage execution control plane keyed to immutable manifest rows. '
  'Finalized manifest dispositions are never rewritten; holds and outcomes live here.';

ALTER TABLE public.account_deletion_storage_execution_results OWNER TO postgres;
ALTER TABLE public.account_deletion_storage_execution_results ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.account_deletion_storage_execution_results FROM PUBLIC;
REVOKE ALL ON TABLE public.account_deletion_storage_execution_results FROM authenticated;
REVOKE ALL ON TABLE public.account_deletion_storage_execution_results FROM anon;
REVOKE ALL ON TABLE public.account_deletion_storage_execution_results FROM service_role;

DO $$
BEGIN
  IF current_setting('server_version_num')::integer >= 170000 THEN
    EXECUTE 'REVOKE MAINTAIN ON TABLE public.account_deletion_storage_execution_results FROM service_role';
  END IF;
EXCEPTION
  WHEN undefined_object THEN NULL;
END;
$$;

GRANT SELECT ON TABLE public.account_deletion_storage_execution_results TO service_role;

-- ---------------------------------------------------------------------------
-- C) Preservation holds
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.account_deletion_storage_preservation_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deletion_request_id uuid NOT NULL
    REFERENCES public.account_deletion_requests (id) ON DELETE RESTRICT,
  execution_attempt_id uuid NULL
    REFERENCES public.account_deletion_execution_attempts (id) ON DELETE RESTRICT,
  manifest_object_id uuid NULL
    REFERENCES public.account_deletion_storage_manifest (id) ON DELETE RESTRICT,
  hold_scope text NOT NULL,
  reason_code text NOT NULL,
  notes_safe text NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  released_at timestamptz NULL,
  released_by uuid NULL,
  CONSTRAINT account_deletion_storage_preservation_holds_scope_check CHECK (
    hold_scope = ANY (
      ARRAY['request'::text, 'attempt'::text, 'manifest_object'::text]
    )
  ),
  CONSTRAINT account_deletion_storage_preservation_holds_reason_code_check CHECK (
    reason_code = ANY (
      ARRAY[
        'legal_hold'::text,
        'litigation_preservation'::text,
        'law_enforcement'::text,
        'safety_abuse'::text,
        'security_investigation'::text,
        'ncmec_reporting'::text,
        'ncii_takedown'::text,
        'operator_review'::text
      ]
    )
  ),
  CONSTRAINT account_deletion_storage_preservation_holds_scope_shape CHECK (
    (
      hold_scope = 'request'::text
      AND execution_attempt_id IS NULL
      AND manifest_object_id IS NULL
    )
    OR (
      hold_scope = 'attempt'::text
      AND execution_attempt_id IS NOT NULL
      AND manifest_object_id IS NULL
    )
    OR (
      hold_scope = 'manifest_object'::text
      AND execution_attempt_id IS NOT NULL
      AND manifest_object_id IS NOT NULL
    )
  ),
  CONSTRAINT account_deletion_storage_preservation_holds_notes_safe_shape CHECK (
    notes_safe IS NULL
    OR (
      length(btrim(notes_safe)) > 0
      AND length(notes_safe) <= 512
      AND notes_safe !~ '[[:cntrl:]]'
    )
  ),
  CONSTRAINT account_deletion_storage_preservation_holds_release_shape CHECK (
    (
      active = true
      AND released_at IS NULL
      AND released_by IS NULL
    )
    OR (
      active = false
      AND released_at IS NOT NULL
      AND released_by IS NOT NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS account_deletion_storage_preservation_holds_request_active_idx
  ON public.account_deletion_storage_preservation_holds (deletion_request_id)
  WHERE active = true;

CREATE INDEX IF NOT EXISTS account_deletion_storage_preservation_holds_attempt_active_idx
  ON public.account_deletion_storage_preservation_holds (execution_attempt_id)
  WHERE active = true AND execution_attempt_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS account_deletion_storage_preservation_holds_object_active_idx
  ON public.account_deletion_storage_preservation_holds (manifest_object_id)
  WHERE active = true AND manifest_object_id IS NOT NULL;

COMMENT ON TABLE public.account_deletion_storage_preservation_holds IS
  'Legal/safety preservation overrides for Storage deletion eligibility. '
  'Never mutates manifest dispositions. Controlled reason codes only.';

ALTER TABLE public.account_deletion_storage_preservation_holds OWNER TO postgres;
ALTER TABLE public.account_deletion_storage_preservation_holds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.account_deletion_storage_preservation_holds FROM PUBLIC;
REVOKE ALL ON TABLE public.account_deletion_storage_preservation_holds FROM authenticated;
REVOKE ALL ON TABLE public.account_deletion_storage_preservation_holds FROM anon;
REVOKE ALL ON TABLE public.account_deletion_storage_preservation_holds FROM service_role;

DO $$
BEGIN
  IF current_setting('server_version_num')::integer >= 170000 THEN
    EXECUTE 'REVOKE MAINTAIN ON TABLE public.account_deletion_storage_preservation_holds FROM service_role';
  END IF;
EXCEPTION
  WHEN undefined_object THEN NULL;
END;
$$;

GRANT SELECT ON TABLE public.account_deletion_storage_preservation_holds TO service_role;

-- ---------------------------------------------------------------------------
-- D) Audit log (IDs/states/codes only)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.account_deletion_storage_execution_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  deletion_request_id uuid NULL,
  execution_attempt_id uuid NULL,
  manifest_object_id uuid NULL,
  result_id uuid NULL,
  hold_id uuid NULL,
  actor_user_id uuid NULL,
  detail_code text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_deletion_storage_execution_audit_event_type_check CHECK (
    event_type = ANY (
      ARRAY[
        'results_initialized'::text,
        'hold_created'::text,
        'hold_released'::text,
        'claim_acquired'::text,
        'claim_expired_reclaimed'::text,
        'execution_state_changed'::text
      ]
    )
  )
);

ALTER TABLE public.account_deletion_storage_execution_audit OWNER TO postgres;
ALTER TABLE public.account_deletion_storage_execution_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.account_deletion_storage_execution_audit FROM PUBLIC;
REVOKE ALL ON TABLE public.account_deletion_storage_execution_audit FROM authenticated;
REVOKE ALL ON TABLE public.account_deletion_storage_execution_audit FROM anon;
REVOKE ALL ON TABLE public.account_deletion_storage_execution_audit FROM service_role;

DO $$
BEGIN
  IF current_setting('server_version_num')::integer >= 170000 THEN
    EXECUTE 'REVOKE MAINTAIN ON TABLE public.account_deletion_storage_execution_audit FROM service_role';
  END IF;
EXCEPTION
  WHEN undefined_object THEN NULL;
END;
$$;

GRANT SELECT ON TABLE public.account_deletion_storage_execution_audit TO service_role;

-- ---------------------------------------------------------------------------
-- E) Internal helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.account_deletion_storage_execution_audit_append(
  p_event_type text,
  p_deletion_request_id uuid,
  p_execution_attempt_id uuid,
  p_manifest_object_id uuid,
  p_result_id uuid,
  p_hold_id uuid,
  p_actor_user_id uuid,
  p_detail_code text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.account_deletion_storage_execution_audit (
    event_type,
    deletion_request_id,
    execution_attempt_id,
    manifest_object_id,
    result_id,
    hold_id,
    actor_user_id,
    detail_code
  ) VALUES (
    p_event_type,
    p_deletion_request_id,
    p_execution_attempt_id,
    p_manifest_object_id,
    p_result_id,
    p_hold_id,
    p_actor_user_id,
    p_detail_code
  );
$$;

ALTER FUNCTION public.account_deletion_storage_execution_audit_append(
  text, uuid, uuid, uuid, uuid, uuid, uuid, text
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_storage_execution_audit_append(
  text, uuid, uuid, uuid, uuid, uuid, uuid, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_deletion_storage_execution_audit_append(
  text, uuid, uuid, uuid, uuid, uuid, uuid, text
) FROM authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_storage_execution_audit_append(
  text, uuid, uuid, uuid, uuid, uuid, uuid, text
) FROM anon;
REVOKE ALL ON FUNCTION public.account_deletion_storage_execution_audit_append(
  text, uuid, uuid, uuid, uuid, uuid, uuid, text
) FROM service_role;

CREATE OR REPLACE FUNCTION public.account_deletion_storage_preservation_hold_active(
  p_deletion_request_id uuid,
  p_execution_attempt_id uuid,
  p_manifest_object_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.account_deletion_storage_preservation_holds AS hold_row
    WHERE hold_row.active = true
      AND hold_row.deletion_request_id = p_deletion_request_id
      AND (
        hold_row.hold_scope = 'request'::text
        OR (
          hold_row.hold_scope = 'attempt'::text
          AND hold_row.execution_attempt_id = p_execution_attempt_id
        )
        OR (
          hold_row.hold_scope = 'manifest_object'::text
          AND hold_row.execution_attempt_id = p_execution_attempt_id
          AND hold_row.manifest_object_id = p_manifest_object_id
        )
      )
  );
$$;

ALTER FUNCTION public.account_deletion_storage_preservation_hold_active(uuid, uuid, uuid)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_storage_preservation_hold_active(uuid, uuid, uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_deletion_storage_preservation_hold_active(uuid, uuid, uuid)
  FROM authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_storage_preservation_hold_active(uuid, uuid, uuid)
  FROM anon;
REVOKE ALL ON FUNCTION public.account_deletion_storage_preservation_hold_active(uuid, uuid, uuid)
  FROM service_role;

CREATE OR REPLACE FUNCTION public.account_deletion_storage_execution_classify_from_manifest(
  p_disposition text,
  p_hold_active boolean
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_disposition = 'DELETE_PRIVATE'::text AND p_hold_active THEN 'blocked_on_hold'::text
    WHEN p_disposition = 'DELETE_PRIVATE'::text THEN 'pending'::text
    WHEN p_disposition = 'PRESERVE_PUBLIC'::text THEN 'preserved'::text
    WHEN p_disposition = 'PRESERVE_SHARED'::text THEN 'preserved'::text
    WHEN p_disposition = 'DEFER_PROFILE'::text THEN 'deferred_profile'::text
    WHEN p_disposition = 'BLOCK_UNRESOLVED'::text THEN 'blocked'::text
    ELSE 'blocked'::text
  END;
$$;

ALTER FUNCTION public.account_deletion_storage_execution_classify_from_manifest(text, boolean)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_storage_execution_classify_from_manifest(text, boolean)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_deletion_storage_execution_classify_from_manifest(text, boolean)
  FROM authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_storage_execution_classify_from_manifest(text, boolean)
  FROM anon;
REVOKE ALL ON FUNCTION public.account_deletion_storage_execution_classify_from_manifest(text, boolean)
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
BEGIN
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
  RETURN updated_count;
END;
$$;

ALTER FUNCTION public.account_deletion_storage_execution_refresh_hold_eligibility(uuid, uuid)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_storage_execution_refresh_hold_eligibility(uuid, uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_deletion_storage_execution_refresh_hold_eligibility(uuid, uuid)
  FROM authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_storage_execution_refresh_hold_eligibility(uuid, uuid)
  FROM anon;
REVOKE ALL ON FUNCTION public.account_deletion_storage_execution_refresh_hold_eligibility(uuid, uuid)
  FROM service_role;

-- ---------------------------------------------------------------------------
-- F) Initialize execution results from finalized manifest
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.initialize_account_deletion_storage_execution_results(
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
  capture_row record;
  manifest_row record;
  inserted_count integer := 0;
  hold_active boolean;
  target_state text;
  new_result_id uuid;
BEGIN
  IF p_request_id IS NULL OR p_attempt_id IS NULL THEN
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
     OR att.target_user_id IS DISTINCT FROM req.user_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'attempt_mismatch');
  END IF;

  IF att.status <> 'active'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'attempt_not_active');
  END IF;

  IF att.stage <> 'database_completed'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_stage');
  END IF;

  IF att.storage_manifest_status IS DISTINCT FROM 'finalized'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'storage_manifest_not_finalized');
  END IF;

  SELECT
    capture.execution_attempt_id,
    capture.status,
    capture.fingerprint
  INTO capture_row
  FROM public.account_deletion_storage_manifest_capture AS capture
  WHERE capture.execution_attempt_id = p_attempt_id
    AND capture.deletion_request_id = p_request_id;

  IF NOT FOUND OR capture_row.status <> 'finalized'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'storage_manifest_not_finalized');
  END IF;

  FOR manifest_row IN
    SELECT
      manifest.id,
      manifest.deletion_request_id,
      manifest.execution_attempt_id,
      manifest.target_user_id,
      manifest.bucket,
      manifest.object_path,
      manifest.disposition,
      manifest.preservation_required
    FROM public.account_deletion_storage_manifest AS manifest
    WHERE manifest.execution_attempt_id = p_attempt_id
      AND manifest.deletion_request_id = p_request_id
    ORDER BY manifest.object_path
  LOOP
    IF manifest_row.execution_attempt_id IS DISTINCT FROM p_attempt_id
       OR manifest_row.deletion_request_id IS DISTINCT FROM p_request_id THEN
      RETURN jsonb_build_object('ok', false, 'code', 'manifest_attempt_mismatch');
    END IF;

    hold_active := public.account_deletion_storage_preservation_hold_active(
      p_request_id,
      p_attempt_id,
      manifest_row.id
    );
    target_state := public.account_deletion_storage_execution_classify_from_manifest(
      manifest_row.disposition,
      hold_active
    );

    INSERT INTO public.account_deletion_storage_execution_results AS result_row (
      deletion_request_id,
      execution_attempt_id,
      manifest_object_id,
      target_user_id,
      bucket,
      object_path,
      disposition_snapshot,
      preservation_required_snapshot,
      execution_state
    ) VALUES (
      manifest_row.deletion_request_id,
      manifest_row.execution_attempt_id,
      manifest_row.id,
      manifest_row.target_user_id,
      manifest_row.bucket,
      manifest_row.object_path,
      manifest_row.disposition,
      manifest_row.preservation_required,
      target_state
    )
    ON CONFLICT (execution_attempt_id, manifest_object_id) DO NOTHING
    RETURNING id INTO new_result_id;

    IF new_result_id IS NOT NULL THEN
      inserted_count := inserted_count + 1;
    END IF;
  END LOOP;

  PERFORM public.account_deletion_storage_execution_audit_append(
    'results_initialized'::text,
    p_request_id,
    p_attempt_id,
    NULL,
    NULL,
    NULL,
    NULL,
    'initialized'
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'initialized',
    'inserted_count', inserted_count,
    'result_count', (
      SELECT count(*)::integer
      FROM public.account_deletion_storage_execution_results AS result_row
      WHERE result_row.execution_attempt_id = p_attempt_id
    )
  );
END;
$$;

ALTER FUNCTION public.initialize_account_deletion_storage_execution_results(uuid, uuid)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.initialize_account_deletion_storage_execution_results(uuid, uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.initialize_account_deletion_storage_execution_results(uuid, uuid)
  FROM authenticated;
REVOKE ALL ON FUNCTION public.initialize_account_deletion_storage_execution_results(uuid, uuid)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.initialize_account_deletion_storage_execution_results(uuid, uuid)
  TO service_role;

-- ---------------------------------------------------------------------------
-- G) Preservation hold RPCs (owner-only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_account_deletion_storage_preservation_hold(
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

  RETURN jsonb_build_object('ok', true, 'code', 'hold_created', 'hold_id', hold_id);
END;
$$;

ALTER FUNCTION public.create_account_deletion_storage_preservation_hold(
  uuid, uuid, text, text, uuid, uuid, text
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_account_deletion_storage_preservation_hold(
  uuid, uuid, text, text, uuid, uuid, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_account_deletion_storage_preservation_hold(
  uuid, uuid, text, text, uuid, uuid, text
) FROM authenticated;
REVOKE ALL ON FUNCTION public.create_account_deletion_storage_preservation_hold(
  uuid, uuid, text, text, uuid, uuid, text
) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_account_deletion_storage_preservation_hold(
  uuid, uuid, text, text, uuid, uuid, text
) TO service_role;

CREATE OR REPLACE FUNCTION public.release_account_deletion_storage_preservation_hold(
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

ALTER FUNCTION public.release_account_deletion_storage_preservation_hold(uuid, uuid)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.release_account_deletion_storage_preservation_hold(uuid, uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_account_deletion_storage_preservation_hold(uuid, uuid)
  FROM authenticated;
REVOKE ALL ON FUNCTION public.release_account_deletion_storage_preservation_hold(uuid, uuid)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.release_account_deletion_storage_preservation_hold(uuid, uuid)
  TO service_role;

-- ---------------------------------------------------------------------------
-- H) Claim / lease foundation (DB-only; no Storage API)
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

  SELECT
    attempt_row.id,
    attempt_row.deletion_request_id,
    attempt_row.status,
    attempt_row.stage
  INTO att
  FROM public.account_deletion_execution_attempts AS attempt_row
  WHERE attempt_row.id = p_attempt_id;

  IF NOT FOUND
     OR att.deletion_request_id IS DISTINCT FROM p_request_id
     OR att.status <> 'active'::text
     OR att.stage <> 'database_completed'::text THEN
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

ALTER FUNCTION public.claim_account_deletion_storage_execution_object(uuid, uuid, uuid, integer)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.claim_account_deletion_storage_execution_object(uuid, uuid, uuid, integer)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_account_deletion_storage_execution_object(uuid, uuid, uuid, integer)
  FROM authenticated;
REVOKE ALL ON FUNCTION public.claim_account_deletion_storage_execution_object(uuid, uuid, uuid, integer)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.claim_account_deletion_storage_execution_object(uuid, uuid, uuid, integer)
  TO service_role;

-- ---------------------------------------------------------------------------
-- I) Fix duplicate foundation prerequisites in capture readiness
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.verify_account_deletion_storage_manifest_capture_ready()
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
  foundation jsonb;
  inner_oid oid;
  wrapper_oid oid;
  wrapper_def text;
  gate_def text;
BEGIN
  foundation := public.verify_account_deletion_storage_manifest_foundation_ready();
  all_ready := coalesce((foundation->>'ready')::boolean, false);

  check_ok := to_regprocedure(
    'public.capture_account_deletion_storage_manifest(uuid, uuid)'
  ) IS NOT NULL
  AND to_regprocedure(
    'public.verify_account_deletion_storage_manifest_ready_for_3b1(uuid, uuid)'
  ) IS NOT NULL
  AND to_regprocedure(
    'public.account_deletion_journey_reference_evidence(uuid, text)'
  ) IS NOT NULL
  AND to_regprocedure(
    'public.account_deletion_storage_manifest_expected_inventory(uuid)'
  ) IS NOT NULL
  AND to_regprocedure(
    'public.account_deletion_storage_manifest_unresolved_media_sources(uuid)'
  ) IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS proc
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = proc.pronamespace
    WHERE nsp.nspname = 'public'
      AND proc.oid = to_regprocedure(
        'public.capture_account_deletion_storage_manifest(uuid, uuid)'
      )
      AND proc.prosecdef = true
      AND pg_catalog.pg_get_userbyid(proc.proowner) = 'postgres'
  )
  AND pg_catalog.has_function_privilege(
    'service_role',
    'public.capture_account_deletion_storage_manifest(uuid, uuid)',
    'EXECUTE'
  )
  AND NOT pg_catalog.has_function_privilege(
    'authenticated',
    'public.capture_account_deletion_storage_manifest(uuid, uuid)',
    'EXECUTE'
  )
  AND NOT pg_catalog.has_function_privilege(
    'service_role',
    'public.account_deletion_storage_manifest_authoritative_write(uuid, uuid, uuid, text, text, text, text, text, text, boolean, text, text, integer, integer, text)',
    'EXECUTE'
  )
  AND NOT pg_catalog.has_function_privilege(
    'service_role',
    'public.account_deletion_storage_manifest_expected_inventory(uuid)',
    'EXECUTE'
  )
  AND NOT pg_catalog.has_function_privilege(
    'service_role',
    'public.account_deletion_journey_reference_evidence(uuid, text)',
    'EXECUTE'
  );
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'storage_manifest_capture_rpc_hardened',
      'ready', check_ok,
      'detail', 'capture + gate + internals present; writer/derivation not service_role-executable'
    )
  );
  all_ready := all_ready AND check_ok;

  check_ok := EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.account_deletion_storage_manifest'::regclass
      AND conname = 'account_deletion_storage_manifest_delete_requires_exclusive_refs'
      AND pg_catalog.pg_get_constraintdef(oid) ILIKE '%reference_fingerprint%'
  )
  AND EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.account_deletion_storage_manifest'::regclass
      AND conname = 'account_deletion_storage_manifest_exclusive_surviving_consistency'
  );
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'storage_manifest_delete_private_fingerprint_required',
      'ready', check_ok,
      'detail', 'DELETE_PRIVATE requires reference_fingerprint; exclusive⇒surviving=0'
    )
  );
  all_ready := all_ready AND check_ok;

  wrapper_oid := to_regprocedure(
    'public.execute_account_deletion_nondestructive_database_stage(uuid, uuid)'
  );
  inner_oid := to_regprocedure(
    'public.execute_account_deletion_nondestructive_database_stage_inner(uuid, uuid)'
  );
  wrapper_def := CASE
    WHEN wrapper_oid IS NULL THEN ''
    ELSE pg_catalog.pg_get_functiondef(wrapper_oid)
  END;
  gate_def := CASE
    WHEN to_regprocedure(
      'public.verify_account_deletion_storage_manifest_ready_for_3b1(uuid, uuid)'
    ) IS NULL THEN ''
    ELSE pg_catalog.pg_get_functiondef(
      to_regprocedure(
        'public.verify_account_deletion_storage_manifest_ready_for_3b1(uuid, uuid)'
      )
    )
  END;

  check_ok := wrapper_oid IS NOT NULL
  AND inner_oid IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS proc
    WHERE proc.oid = wrapper_oid
      AND proc.prosecdef = true
      AND pg_catalog.pg_get_userbyid(proc.proowner) = 'postgres'
      AND COALESCE(
        (
          SELECT option_value
          FROM pg_catalog.pg_options_to_table(proc.proconfig)
          WHERE option_name = 'search_path'
          LIMIT 1
        ),
        '<unset>'
      ) IN ('', '""')
  )
  AND EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS proc
    WHERE proc.oid = inner_oid
      AND proc.prosecdef = true
      AND pg_catalog.pg_get_userbyid(proc.proowner) = 'postgres'
      AND COALESCE(
        (
          SELECT option_value
          FROM pg_catalog.pg_options_to_table(proc.proconfig)
          WHERE option_name = 'search_path'
          LIMIT 1
        ),
        '<unset>'
      ) IN ('', '""')
  )
  AND pg_catalog.has_function_privilege('service_role', wrapper_oid, 'EXECUTE')
  AND NOT pg_catalog.has_function_privilege('service_role', inner_oid, 'EXECUTE')
  AND NOT pg_catalog.has_function_privilege('authenticated', inner_oid, 'EXECUTE')
  AND NOT pg_catalog.has_function_privilege('anon', inner_oid, 'EXECUTE')
  AND NOT EXISTS (
    SELECT 1
    FROM pg_catalog.aclexplode(
      COALESCE(
        (SELECT proc.proacl FROM pg_catalog.pg_proc AS proc WHERE proc.oid = inner_oid),
        pg_catalog.acldefault('f', (SELECT proc.proowner FROM pg_catalog.pg_proc AS proc WHERE proc.oid = inner_oid))
      )
    ) AS acl
    WHERE acl.grantee = 0
      AND acl.privilege_type = 'EXECUTE'
  )
  AND wrapper_def ILIKE '%verify_account_deletion_storage_manifest_ready_for_3b1%'
  AND wrapper_def ILIKE '%execute_account_deletion_nondestructive_database_stage_inner%'
  AND gate_def ILIKE '%account_deletion_storage_manifest_expected_inventory%';
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'storage_manifest_3b1_inner_not_caller_executable',
      'ready', check_ok,
      'detail', 'wrapper gated + service_role-executable; _inner sealed from all callers'
    )
  );
  all_ready := all_ready AND check_ok;

  check_ok := wrapper_def ILIKE '%verify_account_deletion_storage_manifest_ready_for_3b1%';
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'storage_manifest_3b1_gate_wired',
      'ready', check_ok,
      'detail', '3B.1 wrapper invokes storage manifest readiness gate before _inner'
    )
  );
  all_ready := all_ready AND check_ok;

  check_ok := gate_def ILIKE '%account_deletion_storage_manifest_expected_inventory%'
    AND gate_def ILIKE '%storage_manifest_state_drift%';
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'storage_manifest_completeness_recheck_wired',
      'ready', check_ok,
      'detail', '3B.1 gate re-derives expected inventory and refuses on drift'
    )
  );
  all_ready := all_ready AND check_ok;

  check_ok := pg_catalog.pg_get_functiondef(
    to_regprocedure(
      'public.upsert_account_deletion_storage_manifest_object(uuid, uuid, text, text, text, text, text, text, boolean, text, text, integer, integer, text)'
    )
  ) ILIKE '%delete_authority_not_available_in_foundation%';
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'storage_manifest_foundation_upsert_still_bans_delete_private',
      'ready', check_ok,
      'detail', 'foundation upsert still rejects DELETE_PRIVATE'
    )
  );
  all_ready := all_ready AND check_ok;

  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'storage_manifest_foundation_ready_composed',
      'ready', coalesce((foundation->>'ready')::boolean, false),
      'detail', 'foundation readiness enforced without duplicating prerequisite list'
    )
  );

  RETURN jsonb_build_object(
    'ready', all_ready,
    'checked_at', to_jsonb(pg_catalog.now()),
    'prerequisites', prerequisites
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- J) Storage execution foundation readiness
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
    'public.create_account_deletion_storage_preservation_hold(uuid, uuid, text, text, uuid, uuid, text)'
  ) IS NOT NULL
  AND to_regprocedure(
    'public.release_account_deletion_storage_preservation_hold(uuid, uuid)'
  ) IS NOT NULL
  AND to_regprocedure(
    'public.claim_account_deletion_storage_execution_object(uuid, uuid, uuid, integer)'
  ) IS NOT NULL;
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'storage_execution_rpcs_present',
      'ready', check_ok,
      'detail', 'initialize + hold create/release + claim RPCs installed'
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

ALTER FUNCTION public.verify_account_deletion_storage_execution_foundation_ready()
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.verify_account_deletion_storage_execution_foundation_ready()
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_account_deletion_storage_execution_foundation_ready()
  FROM authenticated;
REVOKE ALL ON FUNCTION public.verify_account_deletion_storage_execution_foundation_ready()
  FROM anon;
GRANT EXECUTE ON FUNCTION public.verify_account_deletion_storage_execution_foundation_ready()
  TO service_role;

DO $$
BEGIN
  IF to_regprocedure(
    'public.verify_account_deletion_schema_execution_ready_before_3b3c()'
  ) IS NULL THEN
    ALTER FUNCTION public.verify_account_deletion_schema_execution_ready()
      RENAME TO verify_account_deletion_schema_execution_ready_before_3b3c;
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
  prerequisites jsonb;
  all_ready boolean;
BEGIN
  core := public.verify_account_deletion_schema_execution_ready_before_3b3c();
  storage_execution := public.verify_account_deletion_storage_execution_foundation_ready();

  prerequisites :=
    coalesce(core->'prerequisites', '[]'::jsonb)
    || coalesce(storage_execution->'prerequisites', '[]'::jsonb);

  all_ready :=
    coalesce((core->>'ready')::boolean, false)
    AND coalesce((storage_execution->>'ready')::boolean, false);

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
  'Live catalog probe including storage execution result + preservation foundation (3B.3C). '
  'Does not enable execution or perform Storage deletion.';

COMMIT;
