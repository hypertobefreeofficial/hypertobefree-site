-- Phase 4C.7B.1E.2C.3B.4C.1 — Profile shell DELETE + profile_completed (DB authority only).
-- No Auth deletion, no Storage provider action, no orchestrator wiring.

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.verify_account_deletion_profile_media_runner_ready()') IS NULL THEN
    RAISE EXCEPTION '3B.4C.1 precondition failed: profile-media runner foundation missing';
  END IF;
  IF to_regprocedure('public.account_deletion_profile_media_completion_blocked(uuid, uuid)') IS NULL THEN
    RAISE EXCEPTION '3B.4C.1 precondition failed: profile-media completion predicate missing';
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
        'profile_shell_deleted'::text
      ]
    )
  );

-- ---------------------------------------------------------------------------
-- B) Finalize profile stage (service_role only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.finalize_account_deletion_profile_stage(
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
  scrubbed_email text;
  scrubbed_username text;
  media_gate jsonb;
  rows_affected jsonb;
  row_count integer;
  profile_exists boolean;
  audit_evidence_ok boolean;
  checked_at timestamptz := pg_catalog.now();
BEGIN
  IF p_request_id IS NULL OR p_attempt_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_arguments');
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
    RETURN jsonb_build_object('ok', false, 'code', 'request_not_in_progress');
  END IF;

  IF req.status <> 'deletion_in_progress'::text THEN
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
    attempt_row.storage_manifest_status,
    attempt_row.profile_rows_affected
  INTO att
  FROM public.account_deletion_execution_attempts AS attempt_row
  WHERE attempt_row.id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'attempt_mismatch');
  END IF;

  IF att.deletion_request_id IS DISTINCT FROM p_request_id
     OR att.target_user_id IS DISTINCT FROM resolved_target
     OR att.status <> 'active'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'attempt_mismatch');
  END IF;

  IF att.stage IN (
    'auth_pending'::text,
    'auth'::text,
    'finalize'::text,
    'completed'::text
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'irreversible_stage');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS profile_row
    WHERE profile_row.id = resolved_target
  ) INTO profile_exists;

  IF att.stage = 'profile_completed'::text THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.account_deletion_storage_execution_audit AS audit_row
      WHERE audit_row.deletion_request_id = p_request_id
        AND audit_row.execution_attempt_id = p_attempt_id
        AND audit_row.event_type = 'profile_shell_deleted'::text
    ) INTO audit_evidence_ok;

    IF profile_exists THEN
      RETURN jsonb_build_object('ok', false, 'code', 'inconsistent_state');
    END IF;

    IF NOT coalesce(att.profile_rows_affected, '{}'::jsonb) @> '{"profile_shell_deleted": 1}'::jsonb
       OR NOT audit_evidence_ok THEN
      RETURN jsonb_build_object('ok', false, 'code', 'inconsistent_state');
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'code', 'already_finalized',
      'request_id', p_request_id,
      'attempt_id', p_attempt_id,
      'target_user_id', resolved_target,
      'stage', 'profile_completed'::text,
      'profile_rows_affected', coalesce(att.profile_rows_affected, '{}'::jsonb),
      'checked_at', checked_at
    );
  END IF;

  IF att.stage <> 'profile'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_stage');
  END IF;

  IF att.storage_manifest_status IS DISTINCT FROM 'finalized'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'storage_manifest_not_finalized');
  END IF;

  IF NOT profile_exists THEN
    RETURN jsonb_build_object('ok', false, 'code', 'inconsistent_state');
  END IF;

  scrubbed_email := public.account_deletion_scrubbed_profile_email(resolved_target);
  scrubbed_username := public.account_deletion_scrubbed_profile_username(resolved_target);

  PERFORM profile_row.id
  FROM public.profiles AS profile_row
  WHERE profile_row.id = resolved_target
  FOR UPDATE;

  PERFORM result_row.id
  FROM public.account_deletion_storage_execution_results AS result_row
  WHERE result_row.deletion_request_id = p_request_id
    AND result_row.execution_attempt_id = p_attempt_id
    AND result_row.disposition_snapshot = 'DEFER_PROFILE'::text
  ORDER BY result_row.id
  FOR UPDATE;

  media_gate := public.account_deletion_profile_media_completion_blocked(
    p_request_id,
    p_attempt_id
  );

  IF coalesce((media_gate->>'ok')::boolean, false) = false THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'profile_media_not_complete',
      'detail', media_gate
    );
  END IF;

  IF media_gate->>'code' IS DISTINCT FROM 'profile_media_complete'::text THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'profile_media_not_complete',
      'detail', media_gate
    );
  END IF;

  DELETE FROM public.profiles AS profile_row
  WHERE profile_row.id = resolved_target
    AND profile_row.avatar_url IS NULL
    AND profile_row.email = scrubbed_email
    AND profile_row.username = scrubbed_username
    AND profile_row.display_name IS NULL
    AND profile_row.real_name IS NULL
    AND profile_row.location IS NULL
    AND profile_row.bio IS NULL
    AND profile_row.deletion_requested_at IS NULL
    AND profile_row.journey_focus = 'encouragement'::text
    AND profile_row.show_location = false
    AND profile_row.show_real_name = false
    AND profile_row.allow_prayer_notifications = false
    AND profile_row.allow_story_notifications = false
    AND profile_row.notify_replies = false
    AND profile_row.notify_prayers = false
    AND profile_row.notify_praise = false
    AND profile_row.notify_journey_updates = false
    AND profile_row.notify_email_updates = false
    AND profile_row.allow_video_responses = false
    AND profile_row.allow_prayer_messages = false
    AND profile_row.allow_journey_messages = false;

  GET DIAGNOSTICS row_count = ROW_COUNT;
  IF row_count <> 1 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'profile_delete_invariant_failed');
  END IF;

  PERFORM public.account_deletion_storage_execution_audit_append(
    'profile_shell_deleted'::text,
    p_request_id,
    p_attempt_id,
    NULL,
    NULL,
    NULL,
    NULL,
    'profile_completed'
  );

  rows_affected :=
    coalesce(att.profile_rows_affected, '{}'::jsonb)
    || jsonb_build_object('profile_shell_deleted', 1);

  UPDATE public.account_deletion_execution_attempts AS attempt_row
  SET
    stage = 'profile_completed'::text,
    profile_rows_affected = rows_affected,
    last_error_code = NULL,
    last_error_detail_safe = NULL,
    updated_at = pg_catalog.now()
  WHERE attempt_row.id = p_attempt_id
    AND attempt_row.deletion_request_id = p_request_id
    AND attempt_row.status = 'active'::text
    AND attempt_row.stage = 'profile'::text;

  GET DIAGNOSTICS row_count = ROW_COUNT;
  IF row_count <> 1 THEN
    RAISE EXCEPTION 'invariant_failed'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'finalized',
    'request_id', p_request_id,
    'attempt_id', p_attempt_id,
    'target_user_id', resolved_target,
    'stage', 'profile_completed'::text,
    'profile_rows_affected', rows_affected,
    'checked_at', checked_at
  );

EXCEPTION
  WHEN SQLSTATE 'P0001' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invariant_failed');
END;
$$;

ALTER FUNCTION public.finalize_account_deletion_profile_stage(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.finalize_account_deletion_profile_stage(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_account_deletion_profile_stage(uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.finalize_account_deletion_profile_stage(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.finalize_account_deletion_profile_stage(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.finalize_account_deletion_profile_stage(uuid, uuid) IS
  '3B.4C.1 atomic profile-shell DELETE and attempt.stage=profile_completed after profile-media completion. '
  'Lock order: request FOR UPDATE, advisory target lock, attempt FOR UPDATE, profile FOR UPDATE, '
  'DEFER_PROFILE results ORDER BY id FOR UPDATE. '
  'Profile-media claim/authorize/complete also take request->attempt->result FOR UPDATE, so they block '
  'while this RPC holds the request lock between completion_blocked and commit. '
  'No execution-context row; completion predicate runs while profile shell exists. '
  'Idempotent already_finalized requires strict prior evidence (profile_rows_affected + audit).';

-- ---------------------------------------------------------------------------
-- C) Profile completion readiness
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.verify_account_deletion_profile_completion_ready()
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
  finalize_oid oid;
  finalize_def text;
  audit_check text;
  stage_check text;
BEGIN
  finalize_oid := to_regprocedure(
    'public.finalize_account_deletion_profile_stage(uuid, uuid)'
  );

  check_ok := finalize_oid IS NOT NULL;
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'profile_completion_rpc_present',
    'ready', check_ok,
    'detail', 'finalize_account_deletion_profile_stage installed'
  ));
  all_ready := all_ready AND check_ok;

  IF finalize_oid IS NOT NULL THEN
    finalize_def := pg_catalog.pg_get_functiondef(finalize_oid);
    check_ok := finalize_def ILIKE '%SECURITY DEFINER%'
      AND (
        finalize_def ILIKE '%SET search_path = ''''%'
        OR finalize_def ILIKE '%SET search_path TO ''''%'
      )
      AND finalize_def ILIKE '%account_deletion_profile_media_completion_blocked%'
      AND finalize_def ILIKE '%FOR UPDATE%'
      AND finalize_def ILIKE '%DELETE FROM public.profiles%'
      AND finalize_def ILIKE '%profile_shell_deleted%'
      AND finalize_def ILIKE '%already_finalized%'
      AND finalize_def ILIKE '%inconsistent_state%'
      AND finalize_def NOT ILIKE '%account_deletion_database_execution_context%'
      AND EXISTS (
        SELECT 1
        FROM pg_catalog.pg_proc AS proc_row
        WHERE proc_row.oid = finalize_oid
          AND pg_catalog.pg_get_userbyid(proc_row.proowner) = 'postgres'
      );
    prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
      'id', 'profile_completion_rpc_hardening',
      'ready', check_ok,
      'detail', 'finalize is postgres-owned SD with completion gate, row locks, strict idempotency, no execution context'
    ));
    all_ready := all_ready AND check_ok;

    check_ok := NOT pg_catalog.has_function_privilege(
      'public',
      'public.finalize_account_deletion_profile_stage(uuid, uuid)',
      'EXECUTE'
    )
    AND NOT pg_catalog.has_function_privilege(
      'authenticated',
      'public.finalize_account_deletion_profile_stage(uuid, uuid)',
      'EXECUTE'
    )
    AND NOT pg_catalog.has_function_privilege(
      'anon',
      'public.finalize_account_deletion_profile_stage(uuid, uuid)',
      'EXECUTE'
    )
    AND pg_catalog.has_function_privilege(
      'service_role',
      'public.finalize_account_deletion_profile_stage(uuid, uuid)',
      'EXECUTE'
    );
    prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
      'id', 'profile_completion_grants_service_role_only',
      'ready', check_ok,
      'detail', 'finalize executable only by service_role'
    ));
    all_ready := all_ready AND check_ok;
  END IF;

  check_ok := NOT pg_catalog.has_table_privilege('service_role', 'public.profiles', 'DELETE');
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'profile_completion_no_broad_profiles_delete_grant',
    'ready', check_ok,
    'detail', 'service_role lacks direct DELETE on public.profiles'
  ));
  all_ready := all_ready AND check_ok;

  SELECT pg_catalog.pg_get_constraintdef(con.oid)
  INTO audit_check
  FROM pg_catalog.pg_constraint AS con
  WHERE con.conname = 'account_deletion_storage_execution_audit_event_type_check'
    AND con.conrelid = 'public.account_deletion_storage_execution_audit'::regclass;

  check_ok := audit_check ~ '''profile_shell_deleted''::text';
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'profile_completion_audit_vocabulary',
    'ready', check_ok,
    'detail', 'audit CHECK includes profile_shell_deleted'
  ));
  all_ready := all_ready AND check_ok;

  SELECT pg_catalog.pg_get_constraintdef(con.oid)
  INTO stage_check
  FROM pg_catalog.pg_constraint AS con
  WHERE con.conname = 'account_deletion_execution_attempts_stage_check'
    AND con.conrelid = 'public.account_deletion_execution_attempts'::regclass;

  check_ok := stage_check ~ '''profile_completed''::text';
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'profile_completion_stage_vocabulary',
    'ready', check_ok,
    'detail', 'attempt stage CHECK includes profile_completed'
  ));
  all_ready := all_ready AND check_ok;

  check_ok := to_regprocedure(
    'public.account_deletion_profile_media_completion_blocked(uuid, uuid)'
  ) IS NOT NULL
  AND to_regprocedure('public.account_deletion_profile_cleanup_snapshot(uuid, uuid)') IS NOT NULL;
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'profile_completion_predecessor_predicates',
    'ready', check_ok,
    'detail', 'profile-media completion and cleanup snapshot helpers present'
  ));
  all_ready := all_ready AND check_ok;

  RETURN jsonb_build_object(
    'ready', all_ready,
    'checked_at', to_jsonb(pg_catalog.now()),
    'prerequisites', prerequisites
  );
END;
$$;

ALTER FUNCTION public.verify_account_deletion_profile_completion_ready() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.verify_account_deletion_profile_completion_ready() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_account_deletion_profile_completion_ready() FROM authenticated;
REVOKE ALL ON FUNCTION public.verify_account_deletion_profile_completion_ready() FROM anon;
GRANT EXECUTE ON FUNCTION public.verify_account_deletion_profile_completion_ready() TO service_role;

-- ---------------------------------------------------------------------------
-- D) Full schema execution readiness composition
-- ---------------------------------------------------------------------------

ALTER FUNCTION public.verify_account_deletion_schema_execution_ready()
  RENAME TO verify_account_deletion_schema_execution_ready_before_3b4c;

CREATE OR REPLACE FUNCTION public.verify_account_deletion_schema_execution_ready()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  prior jsonb;
  profile_completion jsonb;
  prerequisites jsonb;
  all_ready boolean;
  completion_count integer;
BEGIN
  prior := public.verify_account_deletion_schema_execution_ready_before_3b4c();
  profile_completion := public.verify_account_deletion_profile_completion_ready();
  prerequisites :=
    coalesce(prior->'prerequisites', '[]'::jsonb)
    || coalesce(profile_completion->'prerequisites', '[]'::jsonb);

  SELECT count(*)::integer
  INTO completion_count
  FROM jsonb_array_elements(prerequisites) AS elem
  WHERE elem->>'id' = 'profile_completion_rpc_present';

  all_ready :=
    coalesce((prior->>'ready')::boolean, false)
    AND coalesce((profile_completion->>'ready')::boolean, false)
    AND completion_count = 1;

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

COMMENT ON FUNCTION public.verify_account_deletion_profile_completion_ready() IS
  '3B.4C.1 live catalog probe for profile-shell finalizer authority. No orchestrator wiring.';

COMMIT;
