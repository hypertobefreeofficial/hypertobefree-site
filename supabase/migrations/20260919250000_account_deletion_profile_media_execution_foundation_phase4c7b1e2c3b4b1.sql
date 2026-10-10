-- Phase 4C.7B.1E.2C.3B.4B.1 — Profile-media DB authority and reference safety.
-- Control-plane foundation only: no Storage provider call, profile DELETE, Auth action,
-- profile_completed transition, or application/orchestrator wiring.

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.prepare_account_deletion_profile_stage(uuid, uuid)') IS NULL THEN
    RAISE EXCEPTION '3B.4B.1 precondition failed: profile stage foundation missing';
  END IF;
  IF to_regprocedure('public.account_deletion_storage_preservation_hold_active(uuid, uuid, uuid)') IS NULL THEN
    RAISE EXCEPTION '3B.4B.1 precondition failed: preservation hold authority missing';
  END IF;
  IF to_regprocedure('public.verify_account_deletion_storage_stage_runner_ready()') IS NULL THEN
    RAISE EXCEPTION '3B.4B.1 precondition failed: storage runner readiness missing';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- A) Canonical profile-avatar references
-- ---------------------------------------------------------------------------

CREATE TABLE public.account_deletion_profile_avatar_approved_origins (
  origin text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_deletion_profile_avatar_approved_origins_shape CHECK (
    origin = lower(origin)
    AND origin ~ '^https://[a-z0-9-]+\.supabase\.co$'
  )
);

COMMENT ON TABLE public.account_deletion_profile_avatar_approved_origins IS
  'Operator-attested exact Supabase origin allowed to mint local profile-avatar authority. '
  'Must contain exactly one origin populated by postgres-controlled deployment configuration; '
  'environment identity verification is an external deployment gate and empty keeps readiness false.';

ALTER TABLE public.account_deletion_profile_avatar_approved_origins OWNER TO postgres;
ALTER TABLE public.account_deletion_profile_avatar_approved_origins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.account_deletion_profile_avatar_approved_origins FROM PUBLIC;
REVOKE ALL ON TABLE public.account_deletion_profile_avatar_approved_origins FROM authenticated;
REVOKE ALL ON TABLE public.account_deletion_profile_avatar_approved_origins FROM anon;
REVOKE ALL ON TABLE public.account_deletion_profile_avatar_approved_origins FROM service_role;

-- profiles.avatar_url is user-controlled through ordinary authenticated RLS.
-- This parser therefore grants local authority only to an exact approved full
-- HTTPS public URL. Raw object paths are deliberately rejected here.
CREATE OR REPLACE FUNCTION public.account_deletion_profile_avatar_reference_parse_profile_value(
  p_value text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  trimmed text;
  object_path text;
  authority text;
  normalized_origin text;
  path_and_query text;
  public_marker constant text := '/storage/v1/object/public/profile-avatars/';
BEGIN
  IF p_value IS NULL OR btrim(p_value) = ''::text THEN
    RETURN jsonb_build_object('kind', 'none');
  END IF;

  trimmed := btrim(p_value);

  IF trimmed ~ '[[:cntrl:]]' OR position(E'\\' IN trimmed) > 0 THEN
    RETURN jsonb_build_object(
      'kind', 'malformed_internal',
      'code', 'profile_avatar_reference_unsafe_characters'
    );
  END IF;

  IF lower(trimmed) LIKE 'https://%' OR lower(trimmed) LIKE 'http://%' THEN
    IF lower(trimmed) NOT LIKE 'https://%' THEN
      IF position('profile-avatars' IN lower(trimmed)) > 0
         OR position('/storage/v1/object/' IN lower(trimmed)) > 0 THEN
        RETURN jsonb_build_object(
          'kind', 'malformed_internal',
          'code', 'profile_avatar_reference_https_required'
        );
      END IF;
      RETURN jsonb_build_object('kind', 'external');
    END IF;

    path_and_query := substring(trimmed FROM length('https://') + 1);
    IF position('/' IN path_and_query) = 0 THEN
      IF position('profile-avatars' IN lower(trimmed)) > 0
         OR position('/storage/v1/object/' IN lower(trimmed)) > 0 THEN
        RETURN jsonb_build_object(
          'kind', 'malformed_internal',
          'code', 'profile_avatar_reference_invalid_public_url'
        );
      END IF;
      RETURN jsonb_build_object('kind', 'external');
    END IF;

    authority := split_part(path_and_query, '/'::text, 1);
    path_and_query := substring(path_and_query FROM length(authority) + 1);

    IF authority !~* '^[a-z0-9-]+\.supabase\.co$' THEN
      IF position('profile-avatars' IN lower(trimmed)) > 0
         OR position('/storage/v1/object/' IN lower(trimmed)) > 0 THEN
        RETURN jsonb_build_object(
          'kind', 'malformed_internal',
          'code', 'profile_avatar_reference_unrecognized_internal_url'
        );
      END IF;
      RETURN jsonb_build_object('kind', 'external');
    END IF;

    normalized_origin := 'https://'::text || lower(authority);
    IF NOT EXISTS (
      SELECT 1
      FROM public.account_deletion_profile_avatar_approved_origins AS approved
      WHERE approved.origin = normalized_origin
    ) THEN
      RETURN jsonb_build_object(
        'kind', 'foreign_supabase',
        'code', 'profile_avatar_reference_foreign_supabase_origin'
      );
    END IF;

    IF left(path_and_query, length(public_marker)) <> public_marker THEN
      RETURN jsonb_build_object(
        'kind', 'malformed_internal',
        'code', 'profile_avatar_reference_invalid_public_url'
      );
    END IF;

    object_path := substring(path_and_query FROM length(public_marker) + 1);
    object_path := split_part(split_part(object_path, '?'::text, 1), '#'::text, 1);
  ELSE
    RETURN jsonb_build_object(
      'kind', 'malformed_internal',
      'code', 'profile_avatar_reference_untrusted_raw_value'
    );
  END IF;

  IF object_path IS NULL
     OR object_path = ''::text
     OR object_path <> btrim(object_path)
     OR left(object_path, 1) = '/'::text
     OR right(object_path, 1) = '/'::text
     OR position(E'\\' IN object_path) > 0
     OR position('%' IN object_path) > 0
     OR position('?' IN object_path) > 0
     OR position('#' IN object_path) > 0
     OR position('//' IN object_path) > 0
     OR object_path ~ '(^|/)\.\.?(/|$)'
     OR object_path ~ '[[:cntrl:]]' THEN
    RETURN jsonb_build_object(
      'kind', 'malformed_internal',
      'code', 'profile_avatar_object_path_not_canonical'
    );
  END IF;

  IF object_path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/avatar\.(png|webp|jpg|jpeg)$' THEN
    RETURN jsonb_build_object(
      'kind', 'malformed_internal',
      'code', 'profile_avatar_object_path_contract_mismatch'
    );
  END IF;

  RETURN jsonb_build_object(
    'kind', 'internal',
    'bucket', 'profile-avatars',
    'object_path', object_path,
    'owner_user_id', split_part(object_path, '/'::text, 1)
  );
END;
$$;

ALTER FUNCTION public.account_deletion_profile_avatar_reference_parse_profile_value(text)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_profile_avatar_reference_parse_profile_value(text)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_deletion_profile_avatar_reference_parse_profile_value(text)
  FROM authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_profile_avatar_reference_parse_profile_value(text)
  FROM anon;
REVOKE ALL ON FUNCTION public.account_deletion_profile_avatar_reference_parse_profile_value(text)
  FROM service_role;

-- This helper validates an already-authoritative DB-derived raw object path.
-- It does not establish that arbitrary profile text is trusted.
CREATE OR REPLACE FUNCTION public.account_deletion_profile_avatar_object_path_canonical(
  p_object_path text,
  p_target_user_id uuid
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT
    p_object_path IS NOT NULL
    AND p_target_user_id IS NOT NULL
    AND p_object_path
      ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/avatar\.(png|webp|jpg|jpeg)$'
    AND split_part(p_object_path, '/'::text, 1) = p_target_user_id::text;
$$;

ALTER FUNCTION public.account_deletion_profile_avatar_object_path_canonical(text, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_profile_avatar_object_path_canonical(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_deletion_profile_avatar_object_path_canonical(text, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_profile_avatar_object_path_canonical(text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.account_deletion_profile_avatar_object_path_canonical(text, uuid) FROM service_role;

-- Override only the profile-avatar branch used by manifest capture. Other bucket
-- behavior remains byte-for-byte equivalent to the shipped helper.
CREATE OR REPLACE FUNCTION public.account_deletion_parse_storage_object_path(
  p_bucket text,
  p_value text
)
RETURNS text
LANGUAGE plpgsql
STABLE
STRICT
SET search_path = ''
AS $$
DECLARE
  trimmed text;
  after_bucket text;
  avatar_reference jsonb;
BEGIN
  IF p_bucket = 'profile-avatars'::text THEN
    avatar_reference :=
      public.account_deletion_profile_avatar_reference_parse_profile_value(p_value);
    IF avatar_reference->>'kind' = 'internal'::text THEN
      RETURN avatar_reference->>'object_path';
    END IF;
    RETURN NULL;
  END IF;

  trimmed := btrim(p_value);
  IF trimmed = '' OR lower(trimmed) LIKE 'http://%' OR lower(trimmed) LIKE 'https://%' THEN
    RETURN NULL;
  END IF;

  IF position(p_bucket || '/' IN trimmed) > 0 THEN
    after_bucket := split_part(trimmed, p_bucket || '/', 2);
    after_bucket := split_part(after_bucket, '?', 1);
    after_bucket := split_part(after_bucket, '#', 1);
    after_bucket := btrim(after_bucket);
    IF after_bucket = '' OR left(after_bucket, 1) = '/' THEN
      RETURN NULL;
    END IF;
    RETURN after_bucket;
  END IF;

  IF left(trimmed, 1) = '/' THEN
    RETURN NULL;
  END IF;

  IF position('/' IN trimmed) > 0 THEN
    RETURN split_part(split_part(trimmed, '?', 1), '#', 1);
  END IF;

  RETURN NULL;
END;
$$;

ALTER FUNCTION public.account_deletion_parse_storage_object_path(text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_parse_storage_object_path(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_deletion_parse_storage_object_path(text, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_parse_storage_object_path(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.account_deletion_parse_storage_object_path(text, text) FROM service_role;

ALTER FUNCTION public.account_deletion_storage_manifest_unresolved_media_sources(uuid)
  RENAME TO account_deletion_storage_manifest_unresolved_media_sources_before_3b4b1;

CREATE OR REPLACE FUNCTION public.account_deletion_storage_manifest_unresolved_media_sources(
  p_target_user_id uuid
)
RETURNS TABLE (
  source_table text,
  source_column text,
  source_row_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  avatar_reference jsonb;
  target_avatar_url text;
BEGIN
  IF p_target_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Preserve every shipped unresolved-source rule except its profile-avatar
  -- branch, which is replaced below with the four-way canonical classifier.
  RETURN QUERY
  SELECT old.source_table, old.source_column, old.source_row_id
  FROM public.account_deletion_storage_manifest_unresolved_media_sources_before_3b4b1(
    p_target_user_id
  ) AS old
  WHERE NOT (
    old.source_table = 'profiles'::text
    AND old.source_column = 'avatar_url'::text
  );

  SELECT profile_row.avatar_url
  INTO target_avatar_url
  FROM public.profiles AS profile_row
  WHERE profile_row.id = p_target_user_id;

  IF NOT FOUND OR target_avatar_url IS NULL OR btrim(target_avatar_url) = ''::text THEN
    RETURN;
  END IF;

  avatar_reference :=
    public.account_deletion_profile_avatar_reference_parse_profile_value(target_avatar_url);

  IF avatar_reference->>'kind' = 'malformed_internal'::text
     OR (
       avatar_reference->>'kind' = 'internal'::text
       AND (
         avatar_reference->>'owner_user_id' IS DISTINCT FROM p_target_user_id::text
         OR NOT public.account_deletion_profile_avatar_object_path_canonical(
           avatar_reference->>'object_path',
           p_target_user_id
         )
       )
     ) THEN
    RETURN QUERY SELECT 'profiles'::text, 'avatar_url'::text, p_target_user_id;
  END IF;
END;
$$;

ALTER FUNCTION public.account_deletion_storage_manifest_unresolved_media_sources(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_storage_manifest_unresolved_media_sources(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_deletion_storage_manifest_unresolved_media_sources(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_storage_manifest_unresolved_media_sources(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.account_deletion_storage_manifest_unresolved_media_sources(uuid) FROM service_role;

REVOKE ALL ON FUNCTION public.account_deletion_storage_manifest_unresolved_media_sources_before_3b4b1(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_deletion_storage_manifest_unresolved_media_sources_before_3b4b1(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_storage_manifest_unresolved_media_sources_before_3b4b1(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.account_deletion_storage_manifest_unresolved_media_sources_before_3b4b1(uuid) FROM service_role;

ALTER TABLE public.account_deletion_storage_manifest
  ADD CONSTRAINT account_deletion_storage_manifest_profile_avatar_target_path CHECK (
    media_category <> 'profile_avatar'::text
    OR public.account_deletion_profile_avatar_object_path_canonical(
      object_path,
      target_user_id
    )
  );

-- ---------------------------------------------------------------------------
-- B) Live profile reference safety and write guard
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.account_deletion_profile_avatar_surviving_reference_count(
  p_object_path text
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT count(*)::integer
  FROM public.profiles AS profile_row
  CROSS JOIN LATERAL (
    SELECT public.account_deletion_profile_avatar_reference_parse_profile_value(
      profile_row.avatar_url
    ) AS parsed
  ) AS reference
  WHERE profile_row.avatar_url IS NOT NULL
    AND (
      reference.parsed->>'kind' = 'malformed_internal'::text
      OR (
        reference.parsed->>'kind' = 'internal'::text
        AND reference.parsed->>'object_path' = p_object_path
      )
    );
$$;

ALTER FUNCTION public.account_deletion_profile_avatar_surviving_reference_count(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_profile_avatar_surviving_reference_count(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_deletion_profile_avatar_surviving_reference_count(text) FROM authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_profile_avatar_surviving_reference_count(text) FROM anon;
REVOKE ALL ON FUNCTION public.account_deletion_profile_avatar_surviving_reference_count(text) FROM service_role;

CREATE OR REPLACE FUNCTION public.trg_account_deletion_profile_avatar_reference_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  avatar_reference jsonb;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.id IS NOT DISTINCT FROM OLD.id
     AND NEW.avatar_url IS NOT DISTINCT FROM OLD.avatar_url THEN
    RETURN NEW;
  END IF;

  IF NEW.avatar_url IS NULL OR btrim(NEW.avatar_url) = ''::text THEN
    RETURN NEW;
  END IF;

  avatar_reference :=
    public.account_deletion_profile_avatar_reference_parse_profile_value(NEW.avatar_url);

  IF avatar_reference->>'kind' = 'malformed_internal'::text THEN
    RAISE EXCEPTION 'Profile avatar reference is malformed or unsafe'
      USING ERRCODE = '23514';
  END IF;

  IF avatar_reference->>'kind' = 'internal'::text
     AND avatar_reference->>'owner_user_id' IS DISTINCT FROM NEW.id::text THEN
    RAISE EXCEPTION 'Profile avatar reference owner does not match profile'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.account_deletion_requests AS request_row
    WHERE request_row.status = 'deletion_in_progress'::text
      AND coalesce(request_row.user_id, request_row.target_user_id_snapshot)
        IS NOT DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'Profile avatar cannot be attached during account deletion'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.trg_account_deletion_profile_avatar_reference_guard() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.trg_account_deletion_profile_avatar_reference_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_account_deletion_profile_avatar_reference_guard() FROM authenticated;
REVOKE ALL ON FUNCTION public.trg_account_deletion_profile_avatar_reference_guard() FROM anon;
REVOKE ALL ON FUNCTION public.trg_account_deletion_profile_avatar_reference_guard() FROM service_role;

DROP TRIGGER IF EXISTS account_deletion_profile_avatar_reference_guard ON public.profiles;
CREATE TRIGGER account_deletion_profile_avatar_reference_guard
  BEFORE INSERT OR UPDATE OF id, avatar_url ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_account_deletion_profile_avatar_reference_guard();

-- ---------------------------------------------------------------------------
-- C) DEFER_PROFILE execution-state contract + audit vocabulary
-- ---------------------------------------------------------------------------

ALTER TABLE public.account_deletion_storage_execution_results
  DROP CONSTRAINT IF EXISTS account_deletion_storage_execution_results_delete_work_only_for_delete_private;

ALTER TABLE public.account_deletion_storage_execution_results
  ADD CONSTRAINT account_deletion_storage_execution_results_disposition_state_coherence CHECK (
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
      disposition_snapshot = ANY (
        ARRAY['PRESERVE_PUBLIC'::text, 'PRESERVE_SHARED'::text]
      )
      AND execution_state = 'preserved'::text
    )
    OR (
      disposition_snapshot = 'DEFER_PROFILE'::text
      AND execution_state = ANY (
        ARRAY[
          'deferred_profile'::text,
          'deleting'::text,
          'deleted'::text,
          'missing'::text,
          'failed_retryable'::text,
          'failed_terminal'::text
        ]
      )
    )
    OR (
      disposition_snapshot = 'BLOCK_UNRESOLVED'::text
      AND execution_state = 'blocked'::text
    )
  );

-- The deployed 3B.3C foundation probe named the historical coherence
-- constraint directly. Replace only that stale prerequisite while retaining
-- every other prior foundation check unchanged.
ALTER FUNCTION public.verify_account_deletion_storage_execution_foundation_ready()
  RENAME TO verify_ad_storage_execution_foundation_ready_pre_3b4b1;

CREATE OR REPLACE FUNCTION public.verify_account_deletion_storage_execution_foundation_ready()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  prior jsonb;
  prerequisites jsonb;
  coherence_definition text;
  normalized_definition text;
  expected_definition constant text :=
    'checkdisposition_snapshot=''delete_private''::textandexecution_state=anyarray['
    || '''pending''::text,''blocked_on_hold''::text,''deleting''::text,'
    || '''deleted''::text,''missing''::text,''failed_retryable''::text,'
    || '''failed_terminal''::text]ordisposition_snapshot=anyarray['
    || '''preserve_public''::text,''preserve_shared''::text]'
    || 'andexecution_state=''preserved''::textor'
    || 'disposition_snapshot=''defer_profile''::textandexecution_state=anyarray['
    || '''deferred_profile''::text,''deleting''::text,''deleted''::text,'
    || '''missing''::text,''failed_retryable''::text,''failed_terminal''::text]'
    || 'ordisposition_snapshot=''block_unresolved''::text'
    || 'andexecution_state=''blocked''::text';
  coherence_ready boolean;
  all_ready boolean;
BEGIN
  prior := public.verify_ad_storage_execution_foundation_ready_pre_3b4b1();

  SELECT pg_catalog.pg_get_constraintdef(constraint_row.oid)
  INTO coherence_definition
  FROM pg_catalog.pg_constraint AS constraint_row
  WHERE constraint_row.conrelid =
      'public.account_deletion_storage_execution_results'::regclass
    AND constraint_row.conname =
      'account_deletion_storage_execution_results_disposition_state_coherence';

  normalized_definition := pg_catalog.regexp_replace(
    lower(coalesce(coherence_definition, ''::text)),
    '[[:space:]()]',
    ''::text,
    'g'
  );
  coherence_ready := normalized_definition = expected_definition;

  SELECT coalesce(
    jsonb_agg(
      CASE
        WHEN prerequisite->>'id' =
          'storage_execution_only_delete_private_pending'::text THEN
          jsonb_build_object(
            'id', 'storage_execution_only_delete_private_pending',
            'ready', coherence_ready,
            'detail',
              'CHECK enforces exact ordinary DELETE_PRIVATE and DEFER_PROFILE state contracts'
          )
        ELSE prerequisite
      END
      ORDER BY ordinal
    ),
    '[]'::jsonb
  )
  INTO prerequisites
  FROM jsonb_array_elements(
    coalesce(prior->'prerequisites', '[]'::jsonb)
  ) WITH ORDINALITY AS listed(prerequisite, ordinal);

  SELECT coalesce(
    bool_and(coalesce((prerequisite->>'ready')::boolean, false)),
    false
  )
  INTO all_ready
  FROM jsonb_array_elements(prerequisites) AS listed(prerequisite);

  RETURN jsonb_build_object(
    'ready', all_ready,
    'checked_at', to_jsonb(pg_catalog.now()),
    'prerequisites', prerequisites
  );
END;
$$;

ALTER FUNCTION public.verify_ad_storage_execution_foundation_ready_pre_3b4b1()
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.verify_ad_storage_execution_foundation_ready_pre_3b4b1()
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_ad_storage_execution_foundation_ready_pre_3b4b1()
  FROM authenticated;
REVOKE ALL ON FUNCTION public.verify_ad_storage_execution_foundation_ready_pre_3b4b1()
  FROM anon;
REVOKE ALL ON FUNCTION public.verify_ad_storage_execution_foundation_ready_pre_3b4b1()
  FROM service_role;

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
        'profile_media_completed'::text
      ]
    )
  );

-- ---------------------------------------------------------------------------
-- D) Hold serialization for profile-media precommit claims
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.account_deletion_profile_media_invalidate_precommit_claims(
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
    execution_state = 'deferred_profile'::text,
    claim_token = NULL,
    claim_lease_expires_at = NULL,
    claim_backend_pid = NULL,
    delete_commit_token = NULL,
    delete_committed_at = NULL,
    delete_commit_expires_at = NULL,
    last_error_code = NULL,
    last_error_detail_safe = NULL,
    updated_at = now()
  WHERE result_row.deletion_request_id = p_request_id
    AND result_row.execution_attempt_id = p_attempt_id
    AND result_row.disposition_snapshot = 'DEFER_PROFILE'::text
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

ALTER FUNCTION public.account_deletion_profile_media_invalidate_precommit_claims(uuid, uuid, uuid)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_profile_media_invalidate_precommit_claims(uuid, uuid, uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_deletion_profile_media_invalidate_precommit_claims(uuid, uuid, uuid)
  FROM authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_profile_media_invalidate_precommit_claims(uuid, uuid, uuid)
  FROM anon;
REVOKE ALL ON FUNCTION public.account_deletion_profile_media_invalidate_precommit_claims(uuid, uuid, uuid)
  FROM service_role;

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

  PERFORM 1
  FROM public.account_deletion_requests AS request_row
  WHERE request_row.id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'request_not_found');
  END IF;

  IF p_hold_scope = 'request'::text THEN
    -- One-active-attempt invariant makes this normally one row. Stable ordering
    -- keeps broad-hold locking deterministic for historical attempts.
    PERFORM 1
    FROM public.account_deletion_execution_attempts AS attempt_row
    WHERE attempt_row.deletion_request_id = p_request_id
    ORDER BY attempt_row.id
    FOR UPDATE;
  ELSIF p_hold_scope = 'attempt'::text OR p_hold_scope = 'manifest_object'::text THEN
    SELECT attempt_row.id, attempt_row.deletion_request_id
    INTO att
    FROM public.account_deletion_execution_attempts AS attempt_row
    WHERE attempt_row.id = p_execution_attempt_id
    FOR UPDATE;

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
      AND result_row.disposition_snapshot = ANY (
        ARRAY['DELETE_PRIVATE'::text, 'DEFER_PROFILE'::text]
      )
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
    WHERE attempt_row.deletion_request_id = p_request_id;

    PERFORM public.account_deletion_profile_media_invalidate_precommit_claims(
      p_request_id,
      attempt_row.id,
      NULL
    )
    FROM public.account_deletion_execution_attempts AS attempt_row
    WHERE attempt_row.deletion_request_id = p_request_id;
  ELSE
    PERFORM public.account_deletion_storage_execution_refresh_hold_eligibility(
      p_request_id,
      p_execution_attempt_id
    );
    PERFORM public.account_deletion_profile_media_invalidate_precommit_claims(
      p_request_id,
      p_execution_attempt_id,
      p_manifest_object_id
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
    CASE
      WHEN committed_conflict_count > 0 THEN 'hold_created_with_committed_conflicts'::text
      ELSE p_reason_code
    END
  );

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

-- Request-wide creation above refreshes every attempt for the request. Keep
-- release symmetric so ordinary DELETE_PRIVATE rows cannot remain stranded in
-- blocked_on_hold after the final broad hold is released.
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

  UPDATE public.account_deletion_storage_preservation_holds AS hold
  SET
    active = false,
    released_at = now(),
    released_by = p_released_by
  WHERE hold.id = p_hold_id
    AND hold.active = true
  RETURNING
    hold.id,
    hold.deletion_request_id,
    hold.execution_attempt_id,
    hold.active
  INTO hold_row;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'hold_already_released');
  END IF;

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
    WHERE attempt_row.deletion_request_id = hold_row.deletion_request_id;
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

-- ---------------------------------------------------------------------------
-- E) Profile-media claim
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_account_deletion_profile_media_execution_result(
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
  req record;
  att record;
  result_row record;
  manifest_row record;
  resolved_target uuid;
  new_token uuid;
  lease_until timestamptz;
  reclaimed boolean := false;
BEGIN
  IF p_request_id IS NULL OR p_attempt_id IS NULL OR p_result_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_arguments');
  END IF;
  IF p_lease_seconds IS NULL OR p_lease_seconds < 30 OR p_lease_seconds > 3600 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_lease');
  END IF;

  SELECT request_row.id, request_row.status, request_row.user_id,
         request_row.target_user_id_snapshot
  INTO req
  FROM public.account_deletion_requests AS request_row
  WHERE request_row.id = p_request_id
  FOR UPDATE;

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
  WHERE attempt_row.id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND
     OR att.deletion_request_id IS DISTINCT FROM p_request_id
     OR att.target_user_id IS DISTINCT FROM resolved_target
     OR att.status <> 'active'::text
     OR att.stage <> 'profile'::text
     OR att.storage_manifest_status IS DISTINCT FROM 'finalized'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'attempt_mismatch');
  END IF;

  SELECT result.*
  INTO result_row
  FROM public.account_deletion_storage_execution_results AS result
  WHERE result.id = p_result_id
  FOR UPDATE;

  IF NOT FOUND
     OR result_row.deletion_request_id IS DISTINCT FROM p_request_id
     OR result_row.execution_attempt_id IS DISTINCT FROM p_attempt_id
     OR result_row.target_user_id IS DISTINCT FROM resolved_target THEN
    RETURN jsonb_build_object('ok', false, 'code', 'result_mismatch');
  END IF;

  SELECT manifest.*
  INTO manifest_row
  FROM public.account_deletion_storage_manifest AS manifest
  WHERE manifest.id = result_row.manifest_object_id;

  IF NOT FOUND
     OR manifest_row.deletion_request_id IS DISTINCT FROM p_request_id
     OR manifest_row.execution_attempt_id IS DISTINCT FROM p_attempt_id
     OR manifest_row.target_user_id IS DISTINCT FROM resolved_target
     OR manifest_row.disposition <> 'DEFER_PROFILE'::text
     OR manifest_row.media_category <> 'profile_avatar'::text
     OR manifest_row.bucket <> 'profile-avatars'::text
     OR result_row.disposition_snapshot <> 'DEFER_PROFILE'::text
     OR result_row.bucket IS DISTINCT FROM manifest_row.bucket
     OR result_row.object_path IS DISTINCT FROM manifest_row.object_path THEN
    RETURN jsonb_build_object('ok', false, 'code', 'profile_media_authority_mismatch');
  END IF;

  IF NOT public.account_deletion_profile_avatar_object_path_canonical(
    result_row.object_path,
    resolved_target
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'profile_media_path_not_authorized');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles AS profile_row
    WHERE profile_row.id = resolved_target
      AND profile_row.avatar_url IS NULL
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'profile_media_target_not_scrubbed');
  END IF;

  IF public.account_deletion_profile_avatar_surviving_reference_count(
    result_row.object_path
  ) <> 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'profile_media_reference_active');
  END IF;

  IF public.account_deletion_storage_preservation_hold_active(
    p_request_id,
    p_attempt_id,
    result_row.manifest_object_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'preservation_hold_active');
  END IF;

  IF result_row.execution_state = 'deleting'::text
     AND result_row.claim_lease_expires_at IS NOT NULL
     AND result_row.claim_lease_expires_at <= now() THEN
    IF result_row.delete_commit_token IS NOT NULL
       AND result_row.delete_commit_expires_at IS NOT NULL
       AND result_row.delete_commit_expires_at > now() THEN
      RETURN jsonb_build_object('ok', false, 'code', 'delete_already_committed');
    END IF;

    UPDATE public.account_deletion_storage_execution_results AS expired_row
    SET
      execution_state = 'failed_retryable'::text,
      claim_token = NULL,
      claim_lease_expires_at = NULL,
      claim_backend_pid = NULL,
      delete_commit_token = NULL,
      delete_committed_at = NULL,
      delete_commit_expires_at = NULL,
      last_error_code = 'profile_media_claim_lease_expired'::text,
      updated_at = now()
    WHERE expired_row.id = p_result_id;
    reclaimed := true;
    result_row.execution_state := 'failed_retryable'::text;
  END IF;

  IF result_row.execution_state NOT IN (
    'deferred_profile'::text,
    'failed_retryable'::text
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'not_claimable',
      'execution_state', result_row.execution_state
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
    last_error_code = NULL,
    last_error_detail_safe = NULL,
    updated_at = now()
  WHERE claim_row.id = p_result_id
    AND claim_row.execution_state IN (
      'deferred_profile'::text,
      'failed_retryable'::text
    );

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'claim_conflict');
  END IF;

  IF reclaimed THEN
    PERFORM public.account_deletion_storage_execution_audit_append(
      'profile_media_claim_reclaimed'::text,
      p_request_id,
      p_attempt_id,
      result_row.manifest_object_id,
      p_result_id,
      NULL,
      NULL,
      'claim_lease_expired'
    );
  END IF;

  PERFORM public.account_deletion_storage_execution_audit_append(
    'profile_media_claimed'::text,
    p_request_id,
    p_attempt_id,
    result_row.manifest_object_id,
    p_result_id,
    NULL,
    NULL,
    'claimed'
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'claimed',
    'result_id', p_result_id,
    'claim_token', new_token,
    'claim_lease_expires_at', lease_until,
    'reclaimed', reclaimed
  );
END;
$$;

ALTER FUNCTION public.claim_account_deletion_profile_media_execution_result(uuid, uuid, uuid, integer)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.claim_account_deletion_profile_media_execution_result(uuid, uuid, uuid, integer)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_account_deletion_profile_media_execution_result(uuid, uuid, uuid, integer)
  FROM authenticated;
REVOKE ALL ON FUNCTION public.claim_account_deletion_profile_media_execution_result(uuid, uuid, uuid, integer)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.claim_account_deletion_profile_media_execution_result(uuid, uuid, uuid, integer)
  TO service_role;

-- ---------------------------------------------------------------------------
-- F) Profile-media delete authorization (DB commitment, no provider call)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.authorize_account_deletion_profile_media_delete(
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
  resolved_target uuid;
  new_commit_token uuid;
  commit_until timestamptz;
BEGIN
  IF p_request_id IS NULL OR p_attempt_id IS NULL
     OR p_result_id IS NULL OR p_claim_token IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_arguments');
  END IF;

  SELECT request_row.id, request_row.status, request_row.user_id,
         request_row.target_user_id_snapshot
  INTO req
  FROM public.account_deletion_requests AS request_row
  WHERE request_row.id = p_request_id
  FOR UPDATE;

  IF NOT FOUND OR req.status <> 'deletion_in_progress'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'request_not_in_progress');
  END IF;
  resolved_target := coalesce(req.user_id, req.target_user_id_snapshot);

  SELECT attempt_row.id, attempt_row.deletion_request_id,
         attempt_row.target_user_id, attempt_row.status, attempt_row.stage,
         attempt_row.storage_manifest_status
  INTO att
  FROM public.account_deletion_execution_attempts AS attempt_row
  WHERE attempt_row.id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND
     OR resolved_target IS NULL
     OR att.deletion_request_id IS DISTINCT FROM p_request_id
     OR att.target_user_id IS DISTINCT FROM resolved_target
     OR att.status <> 'active'::text
     OR att.stage <> 'profile'::text
     OR att.storage_manifest_status IS DISTINCT FROM 'finalized'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'attempt_mismatch');
  END IF;

  SELECT result.*
  INTO result_row
  FROM public.account_deletion_storage_execution_results AS result
  WHERE result.id = p_result_id
  FOR UPDATE;

  IF NOT FOUND
     OR result_row.deletion_request_id IS DISTINCT FROM p_request_id
     OR result_row.execution_attempt_id IS DISTINCT FROM p_attempt_id
     OR result_row.target_user_id IS DISTINCT FROM resolved_target THEN
    RETURN jsonb_build_object('ok', false, 'code', 'result_mismatch');
  END IF;

  SELECT manifest.*
  INTO manifest_row
  FROM public.account_deletion_storage_manifest AS manifest
  WHERE manifest.id = result_row.manifest_object_id;

  IF NOT FOUND
     OR manifest_row.deletion_request_id IS DISTINCT FROM p_request_id
     OR manifest_row.execution_attempt_id IS DISTINCT FROM p_attempt_id
     OR manifest_row.target_user_id IS DISTINCT FROM resolved_target
     OR manifest_row.disposition <> 'DEFER_PROFILE'::text
     OR manifest_row.media_category <> 'profile_avatar'::text
     OR manifest_row.bucket <> 'profile-avatars'::text
     OR result_row.disposition_snapshot <> 'DEFER_PROFILE'::text
     OR result_row.bucket IS DISTINCT FROM manifest_row.bucket
     OR result_row.object_path IS DISTINCT FROM manifest_row.object_path THEN
    RETURN jsonb_build_object('ok', false, 'code', 'profile_media_authority_mismatch');
  END IF;

  IF NOT public.account_deletion_profile_avatar_object_path_canonical(
    result_row.object_path,
    resolved_target
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'profile_media_path_not_authorized');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles AS profile_row
    WHERE profile_row.id = resolved_target
      AND profile_row.avatar_url IS NULL
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'profile_media_target_not_scrubbed');
  END IF;

  IF public.account_deletion_profile_avatar_surviving_reference_count(
    result_row.object_path
  ) <> 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'profile_media_reference_active');
  END IF;

  IF result_row.delete_commit_token IS NOT NULL
     AND result_row.delete_commit_expires_at IS NOT NULL
     AND result_row.delete_commit_expires_at > now()
     AND result_row.claim_token IS NOT DISTINCT FROM p_claim_token THEN
    RETURN jsonb_build_object(
      'ok', true,
      'code', 'already_authorized',
      'result_id', p_result_id,
      'delete_commit_token', result_row.delete_commit_token,
      'delete_commit_expires_at', result_row.delete_commit_expires_at,
      'bucket', result_row.bucket,
      'object_path', result_row.object_path
    );
  END IF;

  IF public.account_deletion_storage_preservation_hold_active(
    p_request_id,
    p_attempt_id,
    result_row.manifest_object_id
  ) THEN
    IF result_row.execution_state = 'deleting'::text
       AND result_row.delete_commit_token IS NULL THEN
      UPDATE public.account_deletion_storage_execution_results AS held_row
      SET
        execution_state = 'deferred_profile'::text,
        claim_token = NULL,
        claim_lease_expires_at = NULL,
        claim_backend_pid = NULL,
        updated_at = now()
      WHERE held_row.id = p_result_id;
    END IF;
    RETURN jsonb_build_object('ok', false, 'code', 'preservation_hold_active');
  END IF;

  IF result_row.execution_state <> 'deleting'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_deleting');
  END IF;
  IF result_row.claim_token IS DISTINCT FROM p_claim_token THEN
    RETURN jsonb_build_object('ok', false, 'code', 'claim_token_mismatch');
  END IF;
  IF result_row.claim_lease_expires_at IS NULL
     OR result_row.claim_lease_expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'claim_lease_expired');
  END IF;

  IF result_row.delete_commit_token IS NOT NULL
     AND result_row.delete_commit_expires_at IS NOT NULL
     AND result_row.delete_commit_expires_at > now() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'claim_token_mismatch');
  END IF;

  new_commit_token := gen_random_uuid();
  commit_until := now() + make_interval(mins => 15);

  UPDATE public.account_deletion_storage_execution_results AS commit_row
  SET
    delete_commit_token = new_commit_token,
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
    'profile_media_delete_authorized'::text,
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
    'result_id', p_result_id,
    'delete_commit_token', new_commit_token,
    'delete_commit_expires_at', commit_until,
    'bucket', result_row.bucket,
    'object_path', result_row.object_path
  );
END;
$$;

ALTER FUNCTION public.authorize_account_deletion_profile_media_delete(uuid, uuid, uuid, uuid)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.authorize_account_deletion_profile_media_delete(uuid, uuid, uuid, uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.authorize_account_deletion_profile_media_delete(uuid, uuid, uuid, uuid)
  FROM authenticated;
REVOKE ALL ON FUNCTION public.authorize_account_deletion_profile_media_delete(uuid, uuid, uuid, uuid)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.authorize_account_deletion_profile_media_delete(uuid, uuid, uuid, uuid)
  TO service_role;

-- ---------------------------------------------------------------------------
-- G) Profile-media completion
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.complete_account_deletion_profile_media_execution_result(
  p_request_id uuid,
  p_attempt_id uuid,
  p_result_id uuid,
  p_delete_commit_token uuid,
  p_outcome text,
  p_error_code text DEFAULT NULL
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
  resolved_target uuid;
  next_state text;
  bounded_error_code text;
  max_auto_attempts constant integer := 20;
BEGIN
  IF p_request_id IS NULL OR p_attempt_id IS NULL
     OR p_result_id IS NULL OR p_outcome IS NULL THEN
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

  IF p_error_code IS NOT NULL
     AND p_error_code <> ALL (
       ARRAY[
         'storage_existence_check_failed'::text,
         'storage_network_error'::text,
         'storage_provider_unavailable'::text,
         'storage_permission_error'::text,
         'storage_delete_failed'::text,
         'storage_postdelete_verification_failed'::text,
         'max_automatic_attempts_exceeded'::text
       ]
     ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_error_code');
  END IF;

  SELECT request_row.id, request_row.status, request_row.user_id,
         request_row.target_user_id_snapshot
  INTO req
  FROM public.account_deletion_requests AS request_row
  WHERE request_row.id = p_request_id
  FOR UPDATE;

  IF NOT FOUND OR req.status <> 'deletion_in_progress'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'request_not_in_progress');
  END IF;
  resolved_target := coalesce(req.user_id, req.target_user_id_snapshot);

  SELECT attempt_row.id, attempt_row.deletion_request_id,
         attempt_row.target_user_id, attempt_row.status, attempt_row.stage,
         attempt_row.storage_manifest_status
  INTO att
  FROM public.account_deletion_execution_attempts AS attempt_row
  WHERE attempt_row.id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND
     OR resolved_target IS NULL
     OR att.deletion_request_id IS DISTINCT FROM p_request_id
     OR att.target_user_id IS DISTINCT FROM resolved_target
     OR att.status <> 'active'::text
     OR att.stage <> 'profile'::text
     OR att.storage_manifest_status IS DISTINCT FROM 'finalized'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'attempt_mismatch');
  END IF;

  SELECT result.*
  INTO result_row
  FROM public.account_deletion_storage_execution_results AS result
  WHERE result.id = p_result_id
  FOR UPDATE;

  IF NOT FOUND
     OR result_row.deletion_request_id IS DISTINCT FROM p_request_id
     OR result_row.execution_attempt_id IS DISTINCT FROM p_attempt_id
     OR result_row.target_user_id IS DISTINCT FROM resolved_target THEN
    RETURN jsonb_build_object('ok', false, 'code', 'result_mismatch');
  END IF;

  SELECT manifest.*
  INTO manifest_row
  FROM public.account_deletion_storage_manifest AS manifest
  WHERE manifest.id = result_row.manifest_object_id;

  IF NOT FOUND
     OR manifest_row.deletion_request_id IS DISTINCT FROM p_request_id
     OR manifest_row.execution_attempt_id IS DISTINCT FROM p_attempt_id
     OR manifest_row.target_user_id IS DISTINCT FROM resolved_target
     OR manifest_row.disposition <> 'DEFER_PROFILE'::text
     OR manifest_row.media_category <> 'profile_avatar'::text
     OR manifest_row.bucket <> 'profile-avatars'::text
     OR result_row.disposition_snapshot <> 'DEFER_PROFILE'::text
     OR result_row.bucket IS DISTINCT FROM manifest_row.bucket
     OR result_row.object_path IS DISTINCT FROM manifest_row.object_path THEN
    RETURN jsonb_build_object('ok', false, 'code', 'profile_media_authority_mismatch');
  END IF;

  IF result_row.execution_state IN (
    'deleted'::text,
    'missing'::text,
    'failed_terminal'::text
  ) THEN
    RETURN jsonb_build_object(
      'ok', true,
      'code', 'already_terminal',
      'execution_state', result_row.execution_state
    );
  END IF;

  IF result_row.execution_state <> 'deleting'::text
     OR result_row.delete_commit_token IS NULL
     OR p_delete_commit_token IS NULL
     OR result_row.delete_commit_token IS DISTINCT FROM p_delete_commit_token THEN
    RETURN jsonb_build_object('ok', false, 'code', 'delete_commit_token_mismatch');
  END IF;

  IF result_row.delete_commit_expires_at IS NULL
     OR result_row.delete_commit_expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'delete_commit_expired');
  END IF;

  next_state := p_outcome;
  bounded_error_code := p_error_code;
  IF p_outcome = 'failed_retryable'::text
     AND result_row.attempt_count >= max_auto_attempts THEN
    next_state := 'failed_terminal'::text;
    bounded_error_code := 'max_automatic_attempts_exceeded'::text;
  END IF;

  UPDATE public.account_deletion_storage_execution_results AS done_row
  SET
    execution_state = next_state,
    completed_at = CASE
      WHEN next_state IN (
        'deleted'::text,
        'missing'::text,
        'failed_terminal'::text
      ) THEN now()
      ELSE done_row.completed_at
    END,
    claim_token = NULL,
    claim_lease_expires_at = NULL,
    claim_backend_pid = NULL,
    delete_commit_token = NULL,
    delete_committed_at = NULL,
    delete_commit_expires_at = NULL,
    last_error_code = CASE
      WHEN next_state IN ('failed_retryable'::text, 'failed_terminal'::text)
        THEN bounded_error_code
      ELSE NULL
    END,
    last_error_detail_safe = NULL,
    updated_at = now()
  WHERE done_row.id = p_result_id;

  PERFORM public.account_deletion_storage_execution_audit_append(
    'profile_media_completed'::text,
    p_request_id,
    p_attempt_id,
    result_row.manifest_object_id,
    p_result_id,
    NULL,
    NULL,
    next_state
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'completed',
    'execution_state', next_state
  );
END;
$$;

ALTER FUNCTION public.complete_account_deletion_profile_media_execution_result(
  uuid, uuid, uuid, uuid, text, text
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.complete_account_deletion_profile_media_execution_result(
  uuid, uuid, uuid, uuid, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_account_deletion_profile_media_execution_result(
  uuid, uuid, uuid, uuid, text, text
) FROM authenticated;
REVOKE ALL ON FUNCTION public.complete_account_deletion_profile_media_execution_result(
  uuid, uuid, uuid, uuid, text, text
) FROM anon;
GRANT EXECUTE ON FUNCTION public.complete_account_deletion_profile_media_execution_result(
  uuid, uuid, uuid, uuid, text, text
) TO service_role;

-- ---------------------------------------------------------------------------
-- H) Bounded progress and future-completion predicate
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.account_deletion_profile_media_progress_snapshot(
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
  req record;
  att record;
  capture_row record;
  resolved_target uuid;
  total_count integer := 0;
  result_count integer := 0;
  deferred_count integer := 0;
  deleting_count integer := 0;
  deleted_count integer := 0;
  missing_count integer := 0;
  retryable_count integer := 0;
  terminal_failure_count integer := 0;
  active_hold_count integer := 0;
  mismatch_count integer := 0;
  actionable_count integer := 0;
  completion_blocked boolean := true;
BEGIN
  IF p_request_id IS NULL OR p_attempt_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_arguments');
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

  SELECT count(*)::integer
  INTO total_count
  FROM public.account_deletion_storage_manifest AS manifest
  WHERE manifest.deletion_request_id = p_request_id
    AND manifest.execution_attempt_id = p_attempt_id
    AND manifest.target_user_id = resolved_target
    AND manifest.disposition = 'DEFER_PROFILE'::text
    AND manifest.media_category = 'profile_avatar'::text
    AND manifest.bucket = 'profile-avatars'::text;

  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE result.execution_state = 'deferred_profile'::text)::integer,
    count(*) FILTER (WHERE result.execution_state = 'deleting'::text)::integer,
    count(*) FILTER (WHERE result.execution_state = 'deleted'::text)::integer,
    count(*) FILTER (WHERE result.execution_state = 'missing'::text)::integer,
    count(*) FILTER (WHERE result.execution_state = 'failed_retryable'::text)::integer,
    count(*) FILTER (WHERE result.execution_state = 'failed_terminal'::text)::integer
  INTO
    result_count,
    deferred_count,
    deleting_count,
    deleted_count,
    missing_count,
    retryable_count,
    terminal_failure_count
  FROM public.account_deletion_storage_execution_results AS result
  JOIN public.account_deletion_storage_manifest AS manifest
    ON manifest.id = result.manifest_object_id
  WHERE result.deletion_request_id = p_request_id
    AND result.execution_attempt_id = p_attempt_id
    AND result.target_user_id = resolved_target
    AND result.disposition_snapshot = 'DEFER_PROFILE'::text
    AND manifest.disposition = 'DEFER_PROFILE'::text
    AND manifest.media_category = 'profile_avatar'::text
    AND manifest.bucket = 'profile-avatars'::text
    AND manifest.target_user_id = resolved_target
    AND result.bucket = manifest.bucket
    AND result.object_path = manifest.object_path
    AND result.target_user_id = manifest.target_user_id;

  SELECT count(*)::integer
  INTO mismatch_count
  FROM public.account_deletion_storage_execution_results AS result
  WHERE result.deletion_request_id = p_request_id
    AND result.execution_attempt_id = p_attempt_id
    AND result.disposition_snapshot = 'DEFER_PROFILE'::text
    AND NOT EXISTS (
      SELECT 1
      FROM public.account_deletion_storage_manifest AS manifest
      WHERE manifest.id = result.manifest_object_id
        AND manifest.deletion_request_id = result.deletion_request_id
        AND manifest.execution_attempt_id = result.execution_attempt_id
        AND manifest.target_user_id = resolved_target
        AND manifest.target_user_id = result.target_user_id
        AND manifest.disposition = 'DEFER_PROFILE'::text
        AND manifest.media_category = 'profile_avatar'::text
        AND manifest.bucket = 'profile-avatars'::text
        AND manifest.bucket = result.bucket
        AND manifest.object_path = result.object_path
    );

  SELECT mismatch_count + count(*)::integer
  INTO mismatch_count
  FROM public.account_deletion_storage_manifest AS manifest
  WHERE manifest.deletion_request_id = p_request_id
    AND manifest.execution_attempt_id = p_attempt_id
    AND manifest.disposition = 'DEFER_PROFILE'::text
    AND (
      manifest.target_user_id IS DISTINCT FROM resolved_target
      OR manifest.media_category <> 'profile_avatar'::text
      OR manifest.bucket <> 'profile-avatars'::text
      OR NOT public.account_deletion_profile_avatar_object_path_canonical(
        manifest.object_path,
        resolved_target
      )
    );

  SELECT count(*)::integer
  INTO active_hold_count
  FROM public.account_deletion_storage_manifest AS manifest
  WHERE manifest.deletion_request_id = p_request_id
    AND manifest.execution_attempt_id = p_attempt_id
    AND manifest.target_user_id = resolved_target
    AND manifest.disposition = 'DEFER_PROFILE'::text
    AND manifest.media_category = 'profile_avatar'::text
    AND manifest.bucket = 'profile-avatars'::text
    AND public.account_deletion_storage_preservation_hold_active(
      p_request_id,
      p_attempt_id,
      manifest.id
    );

  SELECT count(*)::integer
  INTO actionable_count
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
    AND manifest.disposition = 'DEFER_PROFILE'::text
    AND manifest.media_category = 'profile_avatar'::text
    AND manifest.bucket = 'profile-avatars'::text
    AND manifest.target_user_id = resolved_target
    AND NOT public.account_deletion_storage_preservation_hold_active(
      p_request_id,
      p_attempt_id,
      manifest.id
    );

  completion_blocked :=
    total_count <> result_count
    OR mismatch_count <> 0
    OR active_hold_count <> 0
    OR result_count <> deleted_count + missing_count;

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'profile_media_snapshot',
    'stage', att.stage,
    'total', total_count,
    'result_count', result_count,
    'deferred_profile', deferred_count,
    'deleting', deleting_count,
    'deleted', deleted_count,
    'missing', missing_count,
    'failed_retryable', retryable_count,
    'failed_terminal', terminal_failure_count,
    'active_hold_count', active_hold_count,
    'actionable_count', actionable_count,
    'mismatch_count', mismatch_count,
    'completion_blocked', completion_blocked
  );
END;
$$;

ALTER FUNCTION public.account_deletion_profile_media_progress_snapshot(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_profile_media_progress_snapshot(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_deletion_profile_media_progress_snapshot(uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_profile_media_progress_snapshot(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.account_deletion_profile_media_progress_snapshot(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.account_deletion_profile_media_completion_blocked(
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
  media_snapshot jsonb;
  cleanup_snapshot jsonb;
  cleanup_ok boolean;
  execution_context_clear boolean;
BEGIN
  media_snapshot := public.account_deletion_profile_media_progress_snapshot(
    p_request_id,
    p_attempt_id
  );
  IF coalesce((media_snapshot->>'ok')::boolean, false) = false THEN
    RETURN media_snapshot;
  END IF;

  cleanup_snapshot := public.account_deletion_profile_cleanup_snapshot(
    p_request_id,
    p_attempt_id
  );
  IF coalesce((cleanup_snapshot->>'ok')::boolean, false) = false THEN
    RETURN cleanup_snapshot;
  END IF;

  execution_context_clear := NOT EXISTS (
    SELECT 1
    FROM public.account_deletion_database_execution_context AS context_row
    WHERE context_row.deletion_request_id = p_request_id
      AND context_row.attempt_id = p_attempt_id
  );

  cleanup_ok :=
    coalesce((cleanup_snapshot->>'profile_row_exists')::boolean, false)
    AND coalesce((cleanup_snapshot->>'avatar_url_severed')::boolean, false)
    AND coalesce((cleanup_snapshot->>'identity_scrubbed')::boolean, false)
    AND coalesce((cleanup_snapshot->>'private_inbox_remaining')::integer, -1) = 0
    AND coalesce((cleanup_snapshot->>'story_reactions_remaining')::integer, -1) = 0
    AND coalesce((cleanup_snapshot->>'saved_content_remaining')::integer, -1) = 0
    AND coalesce((cleanup_snapshot->>'prayer_follows_remaining')::integer, -1) = 0
    AND coalesce((cleanup_snapshot->>'prayer_search_preferences_remaining')::integer, -1) = 0
    AND coalesce((cleanup_snapshot->>'blocked_users_remaining')::integer, -1) = 0
    AND execution_context_clear;

  IF coalesce((media_snapshot->>'completion_blocked')::boolean, true)
     OR NOT cleanup_ok THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'profile_media_completion_blocked',
      'media', media_snapshot,
      'profile_cleanup_ready', cleanup_ok
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'profile_media_complete',
    'media', media_snapshot,
    'profile_cleanup_ready', true
  );
END;
$$;

ALTER FUNCTION public.account_deletion_profile_media_completion_blocked(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_profile_media_completion_blocked(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_deletion_profile_media_completion_blocked(uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_profile_media_completion_blocked(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.account_deletion_profile_media_completion_blocked(uuid, uuid) FROM service_role;

-- ---------------------------------------------------------------------------
-- I) Live readiness + schema composition
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.verify_account_deletion_profile_media_ready()
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
  result_coherence text;
  claim_def text;
  authorize_def text;
  complete_def text;
  hold_def text;
  parser_def text;
  guard_def text;
  progress_def text;
  predicate_def text;
  profile_ready jsonb;
  storage_ready jsonb;
  approved_origin text;
  approved_origin_count integer := 0;
  approved_parse jsonb;
  uppercase_parse jsonb;
  foreign_parse jsonb;
  probe_target constant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid;
  foreign_probe_origin constant text :=
    'https://account-deletion-foreign-probe.supabase.co';
BEGIN
  check_ok :=
    to_regprocedure('public.claim_account_deletion_profile_media_execution_result(uuid, uuid, uuid, integer)') IS NOT NULL
    AND to_regprocedure('public.authorize_account_deletion_profile_media_delete(uuid, uuid, uuid, uuid)') IS NOT NULL
    AND to_regprocedure('public.complete_account_deletion_profile_media_execution_result(uuid, uuid, uuid, uuid, text, text)') IS NOT NULL
    AND to_regprocedure('public.account_deletion_profile_media_progress_snapshot(uuid, uuid)') IS NOT NULL
    AND to_regprocedure('public.account_deletion_profile_media_completion_blocked(uuid, uuid)') IS NOT NULL;
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'profile_media_rpcs_present',
    'ready', check_ok,
    'detail', 'profile-media claim, authorize, completion, progress, and predicate installed'
  ));
  all_ready := all_ready AND check_ok;

  SELECT pg_get_constraintdef(constraint_row.oid)
  INTO result_coherence
  FROM pg_catalog.pg_constraint AS constraint_row
  WHERE constraint_row.conrelid = 'public.account_deletion_storage_execution_results'::regclass
    AND constraint_row.conname = 'account_deletion_storage_execution_results_disposition_state_coherence';

  check_ok := result_coherence ILIKE '%DEFER_PROFILE%'
    AND result_coherence ILIKE '%deferred_profile%'
    AND result_coherence ILIKE '%failed_retryable%'
    AND result_coherence NOT ILIKE '%DEFER_PROFILE%pending%';
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'profile_media_result_state_contract',
    'ready', check_ok,
    'detail', 'DEFER_PROFILE uses profile-specific deferred/delete states and never ordinary pending'
  ));
  all_ready := all_ready AND check_ok;

  SELECT pg_catalog.pg_get_functiondef(
    to_regprocedure('public.claim_account_deletion_profile_media_execution_result(uuid, uuid, uuid, integer)')
  ) INTO claim_def;
  SELECT pg_catalog.pg_get_functiondef(
    to_regprocedure('public.authorize_account_deletion_profile_media_delete(uuid, uuid, uuid, uuid)')
  ) INTO authorize_def;
  SELECT pg_catalog.pg_get_functiondef(
    to_regprocedure('public.complete_account_deletion_profile_media_execution_result(uuid, uuid, uuid, uuid, text, text)')
  ) INTO complete_def;
  SELECT pg_catalog.pg_get_functiondef(
    to_regprocedure('public.create_account_deletion_storage_preservation_hold_inner(uuid, uuid, text, text, uuid, uuid, text)')
  ) INTO hold_def;
  SELECT pg_catalog.pg_get_functiondef(
    to_regprocedure(
      'public.account_deletion_profile_avatar_reference_parse_profile_value(text)'
    )
  ) INTO parser_def;
  SELECT pg_catalog.pg_get_functiondef(
    to_regprocedure('public.trg_account_deletion_profile_avatar_reference_guard()')
  ) INTO guard_def;
  SELECT pg_catalog.pg_get_functiondef(
    to_regprocedure('public.account_deletion_profile_media_progress_snapshot(uuid, uuid)')
  ) INTO progress_def;
  SELECT pg_catalog.pg_get_functiondef(
    to_regprocedure('public.account_deletion_profile_media_completion_blocked(uuid, uuid)')
  ) INTO predicate_def;

  check_ok := claim_def ILIKE '%stage <> ''profile''%'
    AND claim_def ILIKE '%DEFER_PROFILE%'
    AND claim_def ILIKE '%profile_avatar%'
    AND claim_def ILIKE '%profile-avatars%'
    AND claim_def ILIKE '%FOR UPDATE%'
    AND claim_def ILIKE '%account_deletion_profile_avatar_surviving_reference_count%'
    AND authorize_def ILIKE '%stage <> ''profile''%'
    AND authorize_def ILIKE '%DEFER_PROFILE%'
    AND authorize_def ILIKE '%profile_avatar%'
    AND authorize_def ILIKE '%profile-avatars%'
    AND authorize_def ILIKE '%FOR UPDATE%'
    AND authorize_def ILIKE '%account_deletion_profile_avatar_surviving_reference_count%'
    AND complete_def ILIKE '%stage <> ''profile''%'
    AND complete_def ILIKE '%delete_commit_token_mismatch%';
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'profile_media_authority_hardened',
    'ready', check_ok,
    'detail', 'stage, binding, category, path, reference, lock, and token guards installed'
  ));
  all_ready := all_ready AND check_ok;

  check_ok := hold_def ILIKE '%FOR UPDATE%'
    AND hold_def ILIKE '%account_deletion_profile_media_invalidate_precommit_claims%'
    AND hold_def ILIKE '%DEFER_PROFILE%';
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'profile_media_hold_serialization',
    'ready', check_ok,
    'detail', 'hold creation serializes on attempts and invalidates only precommit profile claims'
  ));
  all_ready := all_ready AND check_ok;

  SELECT min(origin), count(*)::integer
  INTO approved_origin, approved_origin_count
  FROM public.account_deletion_profile_avatar_approved_origins;

  check_ok :=
    approved_origin_count = 1
    AND approved_origin IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.account_deletion_profile_avatar_approved_origins AS approved
      WHERE approved.origin = foreign_probe_origin
    )
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class AS relation
      WHERE relation.oid =
        'public.account_deletion_profile_avatar_approved_origins'::regclass
        AND relation.relrowsecurity
        AND pg_catalog.pg_get_userbyid(relation.relowner) = 'postgres'::name
    )
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS proc
      WHERE proc.oid = to_regprocedure(
        'public.account_deletion_profile_avatar_reference_parse_profile_value(text)'
      )
        AND proc.prosecdef
        AND proc.provolatile = 's'
        AND pg_catalog.pg_get_userbyid(proc.proowner) = 'postgres'::name
        AND proc.proconfig @> ARRAY['search_path=""']::text[]
    )
    AND NOT pg_catalog.has_table_privilege(
      'service_role',
      'public.account_deletion_profile_avatar_approved_origins',
      'SELECT,INSERT,UPDATE,DELETE'
    )
    AND NOT pg_catalog.has_table_privilege(
      'authenticated',
      'public.account_deletion_profile_avatar_approved_origins',
      'SELECT,INSERT,UPDATE,DELETE'
    )
    AND NOT pg_catalog.has_table_privilege(
      'anon',
      'public.account_deletion_profile_avatar_approved_origins',
      'SELECT,INSERT,UPDATE,DELETE'
    );
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'profile_media_operator_attested_origin_configured',
    'ready', check_ok,
    'detail', 'exactly one sealed operator-attested origin is configured; environment identity verification is an external deployment gate'
  ));
  all_ready := all_ready AND check_ok;

  IF approved_origin IS NOT NULL THEN
    approved_parse :=
      public.account_deletion_profile_avatar_reference_parse_profile_value(
      approved_origin
      || '/storage/v1/object/public/profile-avatars/'
      || probe_target::text
      || '/avatar.png?download=1#profile'
    );
    uppercase_parse :=
      public.account_deletion_profile_avatar_reference_parse_profile_value(
      upper(approved_origin)
      || '/storage/v1/object/public/profile-avatars/'
      || probe_target::text
      || '/avatar.webp'
    );
  ELSE
    approved_parse := '{}'::jsonb;
    uppercase_parse := '{}'::jsonb;
  END IF;
  foreign_parse :=
    public.account_deletion_profile_avatar_reference_parse_profile_value(
    foreign_probe_origin
    || '/storage/v1/object/public/profile-avatars/'
    || probe_target::text
    || '/avatar.png'
  );

  check_ok :=
    approved_parse->>'kind' = 'internal'::text
    AND approved_parse->>'bucket' = 'profile-avatars'::text
    AND approved_parse->>'object_path' =
      probe_target::text || '/avatar.png'
    AND uppercase_parse->>'kind' = 'internal'::text
    AND foreign_parse->>'kind' <> 'internal'::text
    AND public.account_deletion_profile_avatar_reference_parse_profile_value(
      'https://account-deletion-foreign-probe.supabase.co.evil.example'
      || '/storage/v1/object/public/profile-avatars/'
      || probe_target::text
      || '/avatar.png'
    )->>'kind' <> 'internal'::text
    AND public.account_deletion_profile_avatar_reference_parse_profile_value(
      'https://user@' || substring(approved_origin FROM length('https://') + 1)
      || '/storage/v1/object/public/profile-avatars/'
      || probe_target::text
      || '/avatar.png'
    )->>'kind' <> 'internal'::text
    AND public.account_deletion_profile_avatar_reference_parse_profile_value(
      approved_origin || ':444'
      || '/storage/v1/object/public/profile-avatars/'
      || probe_target::text
      || '/avatar.png'
    )->>'kind' <> 'internal'::text
    AND public.account_deletion_profile_avatar_reference_parse_profile_value(
      probe_target::text || '/avatar.jpeg'
    )->>'kind' = 'malformed_internal'::text
    AND public.account_deletion_profile_avatar_object_path_canonical(
      probe_target::text || '/avatar.jpeg',
      probe_target
    )
    AND NOT public.account_deletion_profile_avatar_object_path_canonical(
      probe_target::text || '/avatar.jpeg',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid
    )
    AND public.account_deletion_profile_avatar_reference_parse_profile_value(
      approved_origin
      || '/storage/v1/object/public/profile-avatars/'
      || probe_target::text
      || '/%61vatar.png'
    )->>'kind' = 'malformed_internal'::text
    AND public.account_deletion_profile_avatar_reference_parse_profile_value(
      'https://cdn.example.test/avatar.png'
    )->>'kind' = 'external'::text;
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'profile_media_parser_behavior',
    'ready', coalesce(check_ok, false),
    'detail', 'user-controlled approved, foreign, deceptive, encoded, raw, owner, and external parsing plus authoritative raw-path validation verified'
  ));
  all_ready := all_ready AND coalesce(check_ok, false);

  check_ok := EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS trigger_row
    JOIN pg_catalog.pg_proc AS trigger_proc
      ON trigger_proc.oid = trigger_row.tgfoid
    JOIN pg_catalog.pg_attribute AS id_column
      ON id_column.attrelid = trigger_row.tgrelid
     AND id_column.attname = 'id'::name
     AND NOT id_column.attisdropped
    JOIN pg_catalog.pg_attribute AS avatar_column
      ON avatar_column.attrelid = trigger_row.tgrelid
     AND avatar_column.attname = 'avatar_url'::name
     AND NOT avatar_column.attisdropped
    WHERE trigger_row.tgrelid = 'public.profiles'::regclass
      AND trigger_row.tgname = 'account_deletion_profile_avatar_reference_guard'
      AND NOT trigger_row.tgisinternal
      AND trigger_row.tgenabled = 'O'::"char"
      AND trigger_row.tgfoid = to_regprocedure(
        'public.trg_account_deletion_profile_avatar_reference_guard()'
      )
      -- ROW + BEFORE + INSERT + UPDATE, with no DELETE/TRUNCATE bits.
      AND trigger_row.tgtype = 23
      AND cardinality(trigger_row.tgattr::smallint[]) = 2
      AND id_column.attnum = ANY (trigger_row.tgattr::smallint[])
      AND avatar_column.attnum = ANY (trigger_row.tgattr::smallint[])
      AND trigger_proc.prosecdef
      AND pg_catalog.pg_get_userbyid(trigger_proc.proowner) = 'postgres'::name
      AND trigger_proc.proconfig @> ARRAY['search_path=""']::text[]
  )
  AND to_regprocedure(
    'public.account_deletion_profile_avatar_reference_parse_profile_value(text)'
  ) IS NOT NULL
  AND to_regprocedure('public.account_deletion_profile_avatar_surviving_reference_count(text)') IS NOT NULL
  AND parser_def ILIKE '%/storage/v1/object/public/profile-avatars/%'
  AND parser_def ILIKE '%account_deletion_profile_avatar_approved_origins%'
  AND parser_def ILIKE '%foreign_supabase%'
  AND parser_def ILIKE '%malformed_internal%'
  AND parser_def ILIKE '%external%'
  AND parser_def ILIKE '%owner_user_id%'
  AND guard_def ILIKE '%owner_user_id%NEW.id%'
  AND guard_def ILIKE '%deletion_in_progress%';
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'profile_media_reference_safety',
    'ready', check_ok,
    'detail', 'profile-value parser, authoritative path validator, all-profile reference check, and exact enabled avatar write guard installed'
  ));
  all_ready := all_ready AND check_ok;

  check_ok :=
    predicate_def ILIKE '%account_deletion_profile_media_progress_snapshot%'
    AND predicate_def ILIKE '%account_deletion_profile_cleanup_snapshot%'
    AND predicate_def ILIKE '%profile_row_exists%'
    AND predicate_def ILIKE '%avatar_url_severed%'
    AND predicate_def ILIKE '%account_deletion_database_execution_context%'
    AND progress_def ILIKE '%request_not_in_progress%'
    AND progress_def ILIKE '%storage_manifest_not_finalized%'
    AND progress_def ILIKE '%att.status <> ''active''%'
    AND progress_def ILIKE '%att.stage <> ''profile''%'
    AND progress_def ILIKE '%failed_terminal%'
    AND progress_def ILIKE '%active_hold_count%'
    AND progress_def ILIKE '%mismatch_count%'
    AND progress_def ILIKE '%deleted_count + missing_count%';
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'profile_media_completion_predicate',
    'ready', check_ok,
    'detail', 'completion requires deleted/missing media, no hold/mismatch, and the scrubbed profile invariant'
  ));
  all_ready := all_ready AND check_ok;

  check_ok :=
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_attribute AS column_row
      WHERE column_row.attrelid =
        'public.account_deletion_storage_execution_results'::regclass
        AND column_row.attname = 'delete_commit_token'::name
        AND NOT column_row.attisdropped
    )
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.pg_attribute AS column_row
      WHERE column_row.attrelid =
        'public.account_deletion_storage_execution_results'::regclass
        AND column_row.attname = 'delete_commit_expires_at'::name
        AND NOT column_row.attisdropped
    )
    AND authorize_def ILIKE '%gen_random_uuid%'
    AND authorize_def ILIKE '%delete_commit_token%'
    AND complete_def ILIKE '%delete_commit_token_mismatch%';
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'profile_media_commit_token_authority',
    'ready', check_ok,
    'detail', 'DB-generated delete commit token columns and completion authority are present'
  ));
  all_ready := all_ready AND check_ok;

  check_ok := (
    SELECT bool_and(
      proc.prosecdef
      AND pg_catalog.pg_get_userbyid(proc.proowner) = 'postgres'::name
      AND proc.proconfig @> ARRAY['search_path=""']::text[]
    )
    FROM pg_catalog.pg_proc AS proc
    WHERE proc.oid = ANY (
      ARRAY[
        to_regprocedure('public.claim_account_deletion_profile_media_execution_result(uuid, uuid, uuid, integer)'),
        to_regprocedure('public.authorize_account_deletion_profile_media_delete(uuid, uuid, uuid, uuid)'),
        to_regprocedure('public.complete_account_deletion_profile_media_execution_result(uuid, uuid, uuid, uuid, text, text)'),
        to_regprocedure('public.account_deletion_profile_media_progress_snapshot(uuid, uuid)')
      ]::oid[]
    )
  );
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'profile_media_rpc_hardening',
    'ready', coalesce(check_ok, false),
    'detail', 'service RPCs are SECURITY DEFINER, postgres-owned, and search_path-hardened'
  ));
  all_ready := all_ready AND coalesce(check_ok, false);

  SELECT bool_and(
    pg_catalog.has_function_privilege('service_role', function_name, 'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('authenticated', function_name, 'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('anon', function_name, 'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('public', function_name, 'EXECUTE')
  )
  INTO check_ok
  FROM unnest(
    ARRAY[
      'public.claim_account_deletion_profile_media_execution_result(uuid, uuid, uuid, integer)'::text,
      'public.authorize_account_deletion_profile_media_delete(uuid, uuid, uuid, uuid)'::text,
      'public.complete_account_deletion_profile_media_execution_result(uuid, uuid, uuid, uuid, text, text)'::text,
      'public.account_deletion_profile_media_progress_snapshot(uuid, uuid)'::text
    ]
  ) AS rpc(function_name);
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'profile_media_service_role_only',
    'ready', check_ok,
    'detail', 'mutation RPC execution is service_role-only'
  ));
  all_ready := all_ready AND check_ok;

  SELECT bool_and(
    NOT pg_catalog.has_function_privilege('service_role', function_name, 'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('authenticated', function_name, 'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('anon', function_name, 'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('public', function_name, 'EXECUTE')
  )
  INTO check_ok
  FROM unnest(
    ARRAY[
      'public.account_deletion_profile_avatar_reference_parse_profile_value(text)'::text,
      'public.account_deletion_profile_avatar_object_path_canonical(text, uuid)'::text,
      'public.account_deletion_profile_avatar_surviving_reference_count(text)'::text,
      'public.account_deletion_profile_media_invalidate_precommit_claims(uuid, uuid, uuid)'::text,
      'public.account_deletion_profile_media_completion_blocked(uuid, uuid)'::text
    ]
  ) AS helper(function_name);
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'profile_media_internal_helpers_sealed',
    'ready', check_ok,
    'detail', 'reference, invalidation, and completion helpers are not caller-executable'
  ));
  all_ready := all_ready AND check_ok;

  check_ok :=
    public.account_deletion_storage_destructive_bucket_allowed('journey-private-media'::text)
    AND NOT public.account_deletion_storage_destructive_bucket_allowed('profile-avatars'::text);
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'ordinary_storage_authority_remains_journey_only',
    'ready', check_ok,
    'detail', 'ordinary destructive Storage authority still rejects profile-avatars'
  ));
  all_ready := all_ready AND check_ok;

  storage_ready := public.verify_account_deletion_storage_stage_runner_ready();
  profile_ready := public.verify_account_deletion_profile_stage_ready();
  check_ok := coalesce((storage_ready->>'ready')::boolean, false)
    AND coalesce((profile_ready->>'ready')::boolean, false);
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'profile_media_prior_stages_ready',
    'ready', check_ok,
    'detail', 'ordinary Storage runner and 3B.4A profile stage remain ready'
  ));
  all_ready := all_ready AND check_ok;

  RETURN jsonb_build_object(
    'ready', all_ready,
    'checked_at', to_jsonb(pg_catalog.now()),
    'prerequisites', prerequisites
  );
END;
$$;

ALTER FUNCTION public.verify_account_deletion_profile_media_ready() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.verify_account_deletion_profile_media_ready() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_account_deletion_profile_media_ready() FROM authenticated;
REVOKE ALL ON FUNCTION public.verify_account_deletion_profile_media_ready() FROM anon;
GRANT EXECUTE ON FUNCTION public.verify_account_deletion_profile_media_ready() TO service_role;

ALTER FUNCTION public.verify_account_deletion_schema_execution_ready()
  RENAME TO verify_account_deletion_schema_execution_ready_before_3b4b1;

CREATE OR REPLACE FUNCTION public.verify_account_deletion_schema_execution_ready()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  prior jsonb;
  profile_media jsonb;
  prerequisites jsonb;
  all_ready boolean;
  profile_media_count integer;
BEGIN
  prior := public.verify_account_deletion_schema_execution_ready_before_3b4b1();
  profile_media := public.verify_account_deletion_profile_media_ready();
  prerequisites :=
    coalesce(prior->'prerequisites', '[]'::jsonb)
    || coalesce(profile_media->'prerequisites', '[]'::jsonb);

  SELECT count(*)::integer
  INTO profile_media_count
  FROM jsonb_array_elements(prerequisites) AS elem
  WHERE elem->>'id' = 'profile_media_rpcs_present';

  all_ready :=
    coalesce((prior->>'ready')::boolean, false)
    AND coalesce((profile_media->>'ready')::boolean, false)
    AND profile_media_count = 1;

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

COMMENT ON FUNCTION public.verify_account_deletion_profile_media_ready() IS
  '3B.4B.1 live catalog probe for unwired profile-media DB authority. '
  'Configured origin is operator-attested; environment identity verification is an external deployment gate. '
  'No Storage provider action.';
COMMENT ON FUNCTION public.claim_account_deletion_profile_media_execution_result(uuid, uuid, uuid, integer) IS
  '3B.4B.1 DB-only claim for DEFER_PROFILE/profile_avatar at attempt.stage=profile.';
COMMENT ON FUNCTION public.authorize_account_deletion_profile_media_delete(uuid, uuid, uuid, uuid) IS
  '3B.4B.1 DB-only commit-token authority. Future trusted executor may use returned DB-derived path.';
COMMENT ON FUNCTION public.complete_account_deletion_profile_media_execution_result(uuid, uuid, uuid, uuid, text, text) IS
  '3B.4B.1 DB-only terminal/retry state recorder; no provider call.';

COMMIT;
