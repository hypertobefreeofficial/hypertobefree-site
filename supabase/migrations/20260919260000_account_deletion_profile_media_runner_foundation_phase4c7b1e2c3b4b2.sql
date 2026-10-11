-- Phase 4C.7B.1E.2C.3B.4B.2.1 — Profile-media actionable result-ID selector (read-only).
-- No claim/authorize/complete, no Storage provider action, no TypeScript runner wiring.

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.verify_account_deletion_profile_media_ready()') IS NULL THEN
    RAISE EXCEPTION '3B.4B.2.1 precondition failed: profile-media foundation missing';
  END IF;
  IF to_regprocedure('public.account_deletion_profile_media_progress_snapshot(uuid, uuid)') IS NULL THEN
    RAISE EXCEPTION '3B.4B.2.1 precondition failed: profile-media progress snapshot missing';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- A) Bounded actionable result-ID selector (IDs only; not deletion authority)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.select_account_deletion_profile_media_actionable_result_ids(
  p_request_id uuid,
  p_attempt_id uuid,
  p_limit integer DEFAULT 5
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  req record;
  att record;
  capture_row record;
  resolved_target uuid;
  effective_limit integer;
  result_ids uuid[];
BEGIN
  IF p_request_id IS NULL OR p_attempt_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_arguments');
  END IF;

  effective_limit := coalesce(p_limit, 5);
  IF effective_limit < 1 THEN
    effective_limit := 1;
  ELSIF effective_limit > 5 THEN
    effective_limit := 5;
  END IF;

  SELECT request_row.id, request_row.status, request_row.user_id,
         request_row.target_user_id_snapshot
  INTO req
  FROM public.account_deletion_requests AS request_row
  WHERE request_row.id = p_request_id;

  IF NOT FOUND OR req.status <> 'deletion_in_progress'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'request_not_in_progress');
  END IF;

  resolved_target := coalesce(req.user_id, req.target_user_id_snapshot);
  IF resolved_target IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'target_unresolved');
  END IF;

  SELECT attempt_row.id, attempt_row.deletion_request_id,
         attempt_row.target_user_id, attempt_row.status, attempt_row.stage,
         attempt_row.storage_manifest_status
  INTO att
  FROM public.account_deletion_execution_attempts AS attempt_row
  WHERE attempt_row.id = p_attempt_id;

  IF NOT FOUND
     OR att.deletion_request_id IS DISTINCT FROM p_request_id
     OR att.target_user_id IS DISTINCT FROM resolved_target
     OR att.status <> 'active'::text
     OR att.stage <> 'profile'::text
     OR att.storage_manifest_status IS DISTINCT FROM 'finalized'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'attempt_mismatch');
  END IF;

  SELECT capture.execution_attempt_id, capture.deletion_request_id,
         capture.target_user_id, capture.status
  INTO capture_row
  FROM public.account_deletion_storage_manifest_capture AS capture
  WHERE capture.execution_attempt_id = p_attempt_id;

  IF NOT FOUND
     OR capture_row.deletion_request_id IS DISTINCT FROM p_request_id
     OR capture_row.target_user_id IS DISTINCT FROM resolved_target
     OR capture_row.status IS DISTINCT FROM 'finalized'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'storage_manifest_not_finalized');
  END IF;

  SELECT coalesce(
    array_agg(picked.id ORDER BY picked.created_at ASC, picked.manifest_object_id ASC, picked.id ASC),
    ARRAY[]::uuid[]
  )
  INTO result_ids
  FROM (
    SELECT result.id, result.created_at, result.manifest_object_id
    FROM public.account_deletion_storage_execution_results AS result
    JOIN public.account_deletion_storage_manifest AS manifest
      ON manifest.id = result.manifest_object_id
    WHERE result.deletion_request_id = p_request_id
      AND result.execution_attempt_id = p_attempt_id
      AND result.target_user_id = resolved_target
      AND result.disposition_snapshot = 'DEFER_PROFILE'::text
      AND result.execution_state IN (
        'deferred_profile'::text,
        'failed_retryable'::text
      )
      AND manifest.deletion_request_id = p_request_id
      AND manifest.execution_attempt_id = p_attempt_id
      AND manifest.target_user_id = resolved_target
      AND manifest.disposition = 'DEFER_PROFILE'::text
      AND manifest.media_category = 'profile_avatar'::text
      AND manifest.bucket = 'profile-avatars'::text
      AND result.bucket = manifest.bucket
      AND result.object_path = manifest.object_path
      AND result.target_user_id = manifest.target_user_id
      AND NOT public.account_deletion_storage_preservation_hold_active(
        p_request_id,
        p_attempt_id,
        manifest.id
      )
    ORDER BY result.created_at ASC, result.manifest_object_id ASC, result.id ASC
    LIMIT effective_limit
  ) AS picked;

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'selected',
    'result_ids', to_jsonb(result_ids),
    'selected_count', coalesce(array_length(result_ids, 1), 0)
  );
END;
$$;

ALTER FUNCTION public.select_account_deletion_profile_media_actionable_result_ids(
  uuid, uuid, integer
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.select_account_deletion_profile_media_actionable_result_ids(
  uuid, uuid, integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.select_account_deletion_profile_media_actionable_result_ids(
  uuid, uuid, integer
) FROM authenticated;
REVOKE ALL ON FUNCTION public.select_account_deletion_profile_media_actionable_result_ids(
  uuid, uuid, integer
) FROM anon;
GRANT EXECUTE ON FUNCTION public.select_account_deletion_profile_media_actionable_result_ids(
  uuid, uuid, integer
) TO service_role;

COMMENT ON FUNCTION public.select_account_deletion_profile_media_actionable_result_ids(uuid, uuid, integer) IS
  '3B.4B.2.1 read-only batch hint: returns up to five DEFER_PROFILE profile_avatar result UUIDs only. '
  'Claim/authorize remain authoritative; no row mutation or provider action.';

-- ---------------------------------------------------------------------------
-- B) Runner catalog readiness (DB only; does not prove TypeScript wiring)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.verify_account_deletion_profile_media_runner_ready()
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
  profile_media jsonb;
  selector_oid oid;
  selector_def text;
  runner_def text;
BEGIN
  profile_media := public.verify_account_deletion_profile_media_ready();
  check_ok := coalesce((profile_media->>'ready')::boolean, false);
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'profile_media_foundation_ready',
    'ready', check_ok,
    'detail', '3B.4B.1 profile-media authority remains ready'
  ));
  all_ready := all_ready AND check_ok;

  selector_oid := to_regprocedure(
    'public.select_account_deletion_profile_media_actionable_result_ids(uuid, uuid, integer)'
  );
  check_ok := selector_oid IS NOT NULL;
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'profile_media_runner_selector_present',
    'ready', check_ok,
    'detail', 'select_account_deletion_profile_media_actionable_result_ids installed'
  ));
  all_ready := all_ready AND check_ok;

  IF selector_oid IS NOT NULL THEN
    selector_def := pg_catalog.pg_get_functiondef(selector_oid);
    check_ok :=
      EXISTS (
        SELECT 1
        FROM pg_catalog.pg_proc AS proc
        WHERE proc.oid = selector_oid
          AND proc.prosecdef
          AND proc.provolatile = 's'
          AND pg_catalog.pg_get_userbyid(proc.proowner) = 'postgres'::name
          AND proc.proconfig @> ARRAY['search_path=""']::text[]
      )
      AND selector_def ILIKE '%DEFER_PROFILE%'
      AND selector_def ILIKE '%profile_avatar%'
      AND selector_def ILIKE '%profile-avatars%'
      AND selector_def ILIKE '%deferred_profile%'
      AND selector_def ILIKE '%failed_retryable%'
      AND selector_def ILIKE '%account_deletion_storage_preservation_hold_active%'
      AND selector_def ILIKE '%effective_limit > 5%'
      AND selector_def ILIKE '%result_ids%'
      AND selector_def NOT ILIKE '%FOR UPDATE%'
      AND selector_def NOT ILIKE '%claim_account_deletion_profile_media_execution_result%'
      AND selector_def NOT ILIKE '%authorize_account_deletion_profile_media_delete%'
      AND selector_def NOT ILIKE '%complete_account_deletion_profile_media_execution_result%'
      AND selector_def NOT ILIKE '%account_deletion_profile_avatar_surviving_reference_count%'
      AND selector_def NOT ILIKE '%execution_state = ''deleting''%';
    prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
      'id', 'profile_media_runner_selector_hardened',
      'ready', check_ok,
      'detail', 'read-only selector: DEFER_PROFILE filters, hold exclusion, cap 5, IDs-only contract'
    ));
    all_ready := all_ready AND check_ok;

    check_ok :=
      pg_catalog.has_function_privilege(
        'service_role',
        selector_oid,
        'EXECUTE'
      )
      AND NOT pg_catalog.has_function_privilege(
        'authenticated',
        selector_oid,
        'EXECUTE'
      )
      AND NOT pg_catalog.has_function_privilege(
        'anon',
        selector_oid,
        'EXECUTE'
      );
    prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
      'id', 'profile_media_runner_selector_grants_service_role_only',
      'ready', check_ok,
      'detail', 'selector EXECUTE limited to service_role'
    ));
    all_ready := all_ready AND check_ok;
  END IF;

  runner_def := pg_catalog.pg_get_functiondef(
    to_regprocedure('public.verify_account_deletion_profile_media_runner_ready()')
  );
  check_ok := runner_def ILIKE '%verify_account_deletion_profile_media_ready%';
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'profile_media_runner_readiness_composes_foundation',
    'ready', check_ok,
    'detail', 'runner readiness composes 3B.4B.1 profile-media ready probe'
  ));
  all_ready := all_ready AND check_ok;

  RETURN jsonb_build_object(
    'ready', all_ready,
    'checked_at', to_jsonb(pg_catalog.now()),
    'prerequisites', prerequisites
  );
END;
$$;

ALTER FUNCTION public.verify_account_deletion_profile_media_runner_ready() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.verify_account_deletion_profile_media_runner_ready() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_account_deletion_profile_media_runner_ready() FROM authenticated;
REVOKE ALL ON FUNCTION public.verify_account_deletion_profile_media_runner_ready() FROM anon;
GRANT EXECUTE ON FUNCTION public.verify_account_deletion_profile_media_runner_ready() TO service_role;

COMMENT ON FUNCTION public.verify_account_deletion_profile_media_runner_ready() IS
  '3B.4B.2.1 catalog probe for read-only profile-media selector. Does not prove TypeScript runner wiring.';

-- ---------------------------------------------------------------------------
-- C) Full schema execution readiness composition
-- ---------------------------------------------------------------------------

ALTER FUNCTION public.verify_account_deletion_schema_execution_ready()
  RENAME TO verify_account_deletion_schema_execution_ready_before_3b4b2;

CREATE OR REPLACE FUNCTION public.verify_account_deletion_schema_execution_ready()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  prior jsonb;
  profile_media_runner jsonb;
  prerequisites jsonb;
  all_ready boolean;
  runner_count integer;
BEGIN
  prior := public.verify_account_deletion_schema_execution_ready_before_3b4b2();
  profile_media_runner := public.verify_account_deletion_profile_media_runner_ready();
  prerequisites :=
    coalesce(prior->'prerequisites', '[]'::jsonb)
    || coalesce(profile_media_runner->'prerequisites', '[]'::jsonb);

  SELECT count(*)::integer
  INTO runner_count
  FROM jsonb_array_elements(prerequisites) AS elem
  WHERE elem->>'id' = 'profile_media_runner_selector_present';

  all_ready :=
    coalesce((prior->>'ready')::boolean, false)
    AND coalesce((profile_media_runner->>'ready')::boolean, false)
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

COMMIT;
