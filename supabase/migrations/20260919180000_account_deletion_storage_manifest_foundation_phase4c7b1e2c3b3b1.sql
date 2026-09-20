-- Phase 4C.7B.1E.2C.3B.3B.1 — Durable storage manifest foundation (hardened)
-- DDL/functions/grants/readiness only. ZERO Production-data mutation on apply.
-- Does NOT delete Storage objects, call remove(), clear profiles, delete Auth,
-- wire post-database_completed orchestration, or enable execution.
--
-- AUTHORITY RULE: Foundation lifecycle RPCs MUST NOT mint disposition=DELETE_PRIVATE.
-- DELETE_PRIVATE remains in the vocabulary for 3B.3B.2, which will mint it only from
-- authoritative pre-3B.1 DB ownership + Journey surviving-reference evidence.
-- Path-prefix == target_user_id is a defense-in-depth CHECK for any future DELETE_PRIVATE
-- row; for journey-private-media, prefix alone is NEVER sufficient (shared refs required).
--
-- FUTURE EXECUTION STATE (3B.3C): This table is an immutable classification snapshot.
-- Full-row freeze after finalization is intentional. Do NOT add a generic post-finalize
-- UPDATE path here. 3B.3C should add a separate execution-result table keyed to
-- manifest row id (preferred), or a narrowly controlled mutation of execution-state
-- columns only while classification columns remain immutable.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.account_deletion_requests') IS NULL THEN
    RAISE EXCEPTION '2C.3B.3B.1 precondition failed: account_deletion_requests missing';
  END IF;

  IF to_regclass('public.account_deletion_execution_attempts') IS NULL THEN
    RAISE EXCEPTION '2C.3B.3B.1 precondition failed: account_deletion_execution_attempts missing';
  END IF;

  IF to_regprocedure('public.verify_account_deletion_schema_execution_ready()') IS NULL THEN
    RAISE EXCEPTION '2C.3B.3B.1 precondition failed: verify_account_deletion_schema_execution_ready() missing';
  END IF;

  IF to_regprocedure('public.digest(text, text)') IS NULL
     AND to_regprocedure('public.digest(bytea, text)') IS NULL THEN
    RAISE EXCEPTION '2C.3B.3B.1 precondition failed: pgcrypto digest() missing';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- A) Capture header — open vs finalized (not inferred from row count)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.account_deletion_storage_manifest_capture (
  execution_attempt_id uuid PRIMARY KEY
    REFERENCES public.account_deletion_execution_attempts (id) ON DELETE RESTRICT,
  deletion_request_id uuid NOT NULL
    REFERENCES public.account_deletion_requests (id) ON DELETE RESTRICT,
  target_user_id uuid NOT NULL,
  status text NOT NULL,
  object_count integer NOT NULL DEFAULT 0,
  fingerprint text NULL,
  finalized_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_deletion_storage_manifest_capture_status_check CHECK (
    status = ANY (ARRAY['open'::text, 'finalized'::text])
  ),
  CONSTRAINT account_deletion_storage_manifest_capture_object_count_nonnegative CHECK (
    object_count >= 0
  ),
  CONSTRAINT account_deletion_storage_manifest_capture_finalized_shape CHECK (
    (
      status = 'open'::text
      AND fingerprint IS NULL
      AND finalized_at IS NULL
    )
    OR (
      status = 'finalized'::text
      AND fingerprint IS NOT NULL
      AND finalized_at IS NOT NULL
    )
  )
);

COMMENT ON TABLE public.account_deletion_storage_manifest_capture IS
  'Per-attempt storage manifest capture header. open = mutable classification build; '
  'finalized = immutable ownership/policy snapshot with injective jsonb fingerprint. '
  'Inventory completion is explicit finalize, never inferred from object_count=0 alone.';

CREATE INDEX IF NOT EXISTS account_deletion_storage_manifest_capture_request_idx
  ON public.account_deletion_storage_manifest_capture (deletion_request_id);

ALTER TABLE public.account_deletion_storage_manifest_capture OWNER TO postgres;
ALTER TABLE public.account_deletion_storage_manifest_capture ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.account_deletion_storage_manifest_capture FROM PUBLIC;
REVOKE ALL ON TABLE public.account_deletion_storage_manifest_capture FROM authenticated;
REVOKE ALL ON TABLE public.account_deletion_storage_manifest_capture FROM anon;
REVOKE ALL ON TABLE public.account_deletion_storage_manifest_capture FROM service_role;

GRANT SELECT ON TABLE public.account_deletion_storage_manifest_capture TO service_role;

DO $$
BEGIN
  IF current_setting('server_version_num')::integer >= 170000 THEN
    EXECUTE 'REVOKE MAINTAIN ON TABLE public.account_deletion_storage_manifest_capture FROM service_role';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- B) Per-object immutable ownership/policy snapshot rows
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.account_deletion_storage_manifest (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deletion_request_id uuid NOT NULL
    REFERENCES public.account_deletion_requests (id) ON DELETE RESTRICT,
  execution_attempt_id uuid NOT NULL
    REFERENCES public.account_deletion_execution_attempts (id) ON DELETE RESTRICT,
  target_user_id uuid NOT NULL,
  bucket text NOT NULL,
  object_path text NOT NULL,
  media_category text NOT NULL,
  ownership_basis text NOT NULL,
  disposition text NOT NULL,
  disposition_reason text NOT NULL,
  preservation_required boolean NOT NULL DEFAULT false,
  preservation_reason_code text NULL,
  reference_state text NOT NULL DEFAULT 'unresolved'::text,
  total_reference_count integer NOT NULL DEFAULT 0,
  surviving_reference_count integer NOT NULL DEFAULT 0,
  reference_fingerprint text NULL,
  status text NOT NULL,
  retry_count integer NOT NULL DEFAULT 0,
  last_error_code text NULL,
  last_error_detail_safe text NULL,
  first_attempted_at timestamptz NULL,
  completed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_deletion_storage_manifest_bucket_check CHECK (
    bucket = ANY (
      ARRAY[
        'profile-avatars'::text,
        'story-images'::text,
        'story-thumbnails'::text,
        'story-videos'::text,
        'journey-private-media'::text
      ]
    )
  ),
  CONSTRAINT account_deletion_storage_manifest_media_category_check CHECK (
    media_category = ANY (
      ARRAY[
        'profile_avatar'::text,
        'story_image'::text,
        'story_video'::text,
        'story_thumbnail'::text,
        'prayer_video'::text,
        'prayer_thumbnail'::text,
        'journey_private_media'::text,
        'journey_legacy_media'::text,
        'creator_studio_media'::text,
        'unknown_legacy'::text
      ]
    )
  ),
  CONSTRAINT account_deletion_storage_manifest_disposition_check CHECK (
    disposition = ANY (
      ARRAY[
        'DELETE_PRIVATE'::text,
        'PRESERVE_PUBLIC'::text,
        'PRESERVE_SHARED'::text,
        'DEFER_PROFILE'::text,
        'BLOCK_UNRESOLVED'::text
      ]
    )
  ),
  CONSTRAINT account_deletion_storage_manifest_status_check CHECK (
    status = ANY (
      ARRAY[
        'pending'::text,
        'preserved'::text,
        'deleted'::text,
        'missing'::text,
        'failed'::text,
        'blocked'::text
      ]
    )
  ),
  CONSTRAINT account_deletion_storage_manifest_reference_state_check CHECK (
    reference_state = ANY (
      ARRAY['exclusive'::text, 'shared'::text, 'unresolved'::text]
    )
  ),
  CONSTRAINT account_deletion_storage_manifest_retry_count_nonnegative CHECK (
    retry_count >= 0
  ),
  CONSTRAINT account_deletion_storage_manifest_ref_counts_nonnegative CHECK (
    total_reference_count >= 0
    AND surviving_reference_count >= 0
    AND surviving_reference_count <= total_reference_count
  ),
  CONSTRAINT account_deletion_storage_manifest_path_nonempty CHECK (
    length(btrim(object_path)) > 0
    AND length(object_path) <= 1024
    AND object_path !~ '^/'
    AND object_path !~ '/$'
    AND object_path !~ '\.\.'
    AND object_path !~ '//'
    AND object_path !~ '[[:cntrl:]]'
  ),
  CONSTRAINT account_deletion_storage_manifest_ownership_basis_nonempty CHECK (
    length(btrim(ownership_basis)) > 0
  ),
  CONSTRAINT account_deletion_storage_manifest_disposition_reason_nonempty CHECK (
    length(btrim(disposition_reason)) > 0
  ),
  CONSTRAINT account_deletion_storage_manifest_preservation_shape CHECK (
    (
      preservation_required = false
      AND preservation_reason_code IS NULL
    )
    OR (
      preservation_required = true
      AND preservation_reason_code IS NOT NULL
      AND length(btrim(preservation_reason_code)) > 0
    )
  ),
  CONSTRAINT account_deletion_storage_manifest_preservation_blocks_delete CHECK (
    preservation_required = false
    OR disposition <> 'DELETE_PRIVATE'::text
  ),
  CONSTRAINT account_deletion_storage_manifest_disposition_status_coherence CHECK (
    (
      disposition = 'DELETE_PRIVATE'::text
      AND status = ANY (
        ARRAY['pending'::text, 'deleted'::text, 'missing'::text, 'failed'::text, 'blocked'::text]
      )
    )
    OR (
      disposition = ANY (ARRAY['PRESERVE_PUBLIC'::text, 'PRESERVE_SHARED'::text])
      AND status = 'preserved'::text
    )
    OR (
      disposition = 'DEFER_PROFILE'::text
      AND status = ANY (ARRAY['pending'::text, 'blocked'::text])
    )
    OR (
      disposition = 'BLOCK_UNRESOLVED'::text
      AND status = 'blocked'::text
    )
  ),
  CONSTRAINT account_deletion_storage_manifest_no_public_delete CHECK (
    NOT (
      disposition = 'DELETE_PRIVATE'::text
      AND media_category = ANY (
        ARRAY[
          'story_image'::text,
          'story_video'::text,
          'story_thumbnail'::text,
          'prayer_video'::text,
          'prayer_thumbnail'::text,
          'creator_studio_media'::text
        ]
      )
    )
  ),
  CONSTRAINT account_deletion_storage_manifest_avatar_defer CHECK (
    (
      media_category <> 'profile_avatar'::text
      OR disposition = 'DEFER_PROFILE'::text
    )
    AND (
      disposition <> 'DEFER_PROFILE'::text
      OR media_category = 'profile_avatar'::text
    )
  ),
  CONSTRAINT account_deletion_storage_manifest_unknown_blocks CHECK (
    media_category <> 'unknown_legacy'::text
    OR disposition = 'BLOCK_UNRESOLVED'::text
  ),
  CONSTRAINT account_deletion_storage_manifest_legacy_journey_no_delete CHECK (
    media_category <> 'journey_legacy_media'::text
    OR disposition = ANY (ARRAY['PRESERVE_SHARED'::text, 'BLOCK_UNRESOLVED'::text])
  ),
  -- Defense-in-depth for any future DELETE_PRIVATE row (3B.3B.2+). Foundation RPCs
  -- cannot mint DELETE_PRIVATE. Journey shared refs still require surviving_reference
  -- evidence in 3B.3B.2 beyond path-prefix equality.
  CONSTRAINT account_deletion_storage_manifest_delete_requires_target_prefix CHECK (
    disposition <> 'DELETE_PRIVATE'::text
    OR split_part(object_path, '/'::text, 1) = target_user_id::text
  ),
  CONSTRAINT account_deletion_storage_manifest_delete_requires_exclusive_refs CHECK (
    disposition <> 'DELETE_PRIVATE'::text
    OR (
      reference_state = 'exclusive'::text
      AND surviving_reference_count = 0
      AND total_reference_count >= 1
    )
  ),
  CONSTRAINT account_deletion_storage_manifest_shared_no_delete CHECK (
    reference_state <> 'shared'::text
    OR disposition <> 'DELETE_PRIVATE'::text
  ),
  CONSTRAINT account_deletion_storage_manifest_unresolved_no_delete CHECK (
    reference_state <> 'unresolved'::text
    OR disposition <> 'DELETE_PRIVATE'::text
  ),
  CONSTRAINT account_deletion_storage_manifest_surviving_refs_no_delete CHECK (
    surviving_reference_count = 0
    OR disposition <> 'DELETE_PRIVATE'::text
  ),
  CONSTRAINT account_deletion_storage_manifest_bucket_category_coherence CHECK (
    (
      media_category = 'profile_avatar'::text
      AND bucket = 'profile-avatars'::text
    )
    OR (
      media_category = 'story_image'::text
      AND bucket = 'story-images'::text
    )
    OR (
      media_category = 'story_video'::text
      AND bucket = 'story-videos'::text
    )
    OR (
      media_category = 'story_thumbnail'::text
      AND bucket = 'story-thumbnails'::text
    )
    OR (
      media_category = 'prayer_video'::text
      AND bucket = 'story-videos'::text
    )
    OR (
      media_category = 'prayer_thumbnail'::text
      AND bucket = 'story-thumbnails'::text
    )
    OR (
      media_category = 'journey_private_media'::text
      AND bucket = 'journey-private-media'::text
    )
    OR (
      media_category = 'journey_legacy_media'::text
      AND bucket = 'story-videos'::text
    )
    OR (
      media_category = 'creator_studio_media'::text
      AND bucket = 'story-images'::text
    )
    OR (
      media_category = 'unknown_legacy'::text
    )
  )
);

COMMENT ON TABLE public.account_deletion_storage_manifest IS
  'Immutable classification snapshot per storage object for one execution attempt. '
  'Disposition is policy; status/retry columns exist for vocabulary compatibility but '
  'are frozen after capture finalization. Future Storage execution results belong in a '
  'separate 3B.3C table keyed to this row — do not weaken full-row freeze here. '
  'Foundation RPCs cannot mint DELETE_PRIVATE.';

COMMENT ON COLUMN public.account_deletion_storage_manifest.reference_state IS
  'exclusive|shared|unresolved. Populated authoritatively by 3B.3B.2. shared/unresolved '
  'and surviving_reference_count>0 cannot DELETE_PRIVATE (DB CHECKs).';

CREATE UNIQUE INDEX IF NOT EXISTS account_deletion_storage_manifest_attempt_object_uidx
  ON public.account_deletion_storage_manifest (execution_attempt_id, bucket, object_path);

CREATE INDEX IF NOT EXISTS account_deletion_storage_manifest_request_idx
  ON public.account_deletion_storage_manifest (deletion_request_id);

CREATE INDEX IF NOT EXISTS account_deletion_storage_manifest_target_idx
  ON public.account_deletion_storage_manifest (target_user_id);

ALTER TABLE public.account_deletion_storage_manifest OWNER TO postgres;
ALTER TABLE public.account_deletion_storage_manifest ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.account_deletion_storage_manifest FROM PUBLIC;
REVOKE ALL ON TABLE public.account_deletion_storage_manifest FROM authenticated;
REVOKE ALL ON TABLE public.account_deletion_storage_manifest FROM anon;
REVOKE ALL ON TABLE public.account_deletion_storage_manifest FROM service_role;

GRANT SELECT ON TABLE public.account_deletion_storage_manifest TO service_role;

DO $$
BEGIN
  IF current_setting('server_version_num')::integer >= 170000 THEN
    EXECUTE 'REVOKE MAINTAIN ON TABLE public.account_deletion_storage_manifest FROM service_role';
  END IF;
END;
$$;

ALTER TABLE public.account_deletion_execution_attempts
  ADD COLUMN IF NOT EXISTS storage_manifest_status text NULL;

ALTER TABLE public.account_deletion_execution_attempts
  ADD COLUMN IF NOT EXISTS storage_manifest_fingerprint text NULL;

ALTER TABLE public.account_deletion_execution_attempts
  ADD COLUMN IF NOT EXISTS storage_manifest_finalized_at timestamptz NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conname = 'account_deletion_execution_attempts_storage_manifest_status_check'
      AND conrelid = 'public.account_deletion_execution_attempts'::regclass
  ) THEN
    ALTER TABLE public.account_deletion_execution_attempts
      ADD CONSTRAINT account_deletion_execution_attempts_storage_manifest_status_check
      CHECK (
        storage_manifest_status IS NULL
        OR storage_manifest_status = ANY (ARRAY['open'::text, 'finalized'::text])
      );
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- C) Path validation + injective jsonb fingerprint
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.account_deletion_storage_manifest_validate_object_path(
  p_bucket text,
  p_object_path text
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
DECLARE
  normalized text;
  segment text;
  lowered text;
BEGIN
  IF p_bucket IS NULL OR p_object_path IS NULL THEN
    RETURN false;
  END IF;

  IF p_bucket <> ALL (
    ARRAY[
      'profile-avatars'::text,
      'story-images'::text,
      'story-thumbnails'::text,
      'story-videos'::text,
      'journey-private-media'::text
    ]
  ) THEN
    RETURN false;
  END IF;

  normalized := btrim(p_object_path);
  IF normalized = '' OR normalized <> p_object_path THEN
    RETURN false;
  END IF;

  IF char_length(normalized) > 1024 THEN
    RETURN false;
  END IF;

  IF left(normalized, 1) = '/' OR right(normalized, 1) = '/' THEN
    RETURN false;
  END IF;

  IF position(E'\\' IN normalized) > 0 THEN
    RETURN false;
  END IF;

  IF normalized ~ '[[:cntrl:]]' THEN
    RETURN false;
  END IF;

  IF position('..' IN normalized) > 0 OR position('//' IN normalized) > 0 THEN
    RETURN false;
  END IF;

  IF position('?' IN normalized) > 0 OR position('#' IN normalized) > 0 THEN
    RETURN false;
  END IF;

  IF position(':' IN normalized) > 0 THEN
    RETURN false;
  END IF;

  lowered := lower(normalized);
  IF position('%2e' IN lowered) > 0
     OR position('%2f' IN lowered) > 0
     OR position('%5c' IN lowered) > 0 THEN
    RETURN false;
  END IF;

  IF lower(normalized) LIKE 'http://%' OR lower(normalized) LIKE 'https://%' THEN
    RETURN false;
  END IF;

  IF position(p_bucket || '/' IN normalized) = 1 THEN
    RETURN false;
  END IF;

  FOREACH segment IN ARRAY string_to_array(normalized, '/')
  LOOP
    IF segment IS NULL OR segment = '' OR segment = '.' OR segment = '..' THEN
      RETURN false;
    END IF;
  END LOOP;

  RETURN true;
END;
$$;

ALTER FUNCTION public.account_deletion_storage_manifest_validate_object_path(text, text)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_storage_manifest_validate_object_path(text, text)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_deletion_storage_manifest_validate_object_path(text, text)
  FROM authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_storage_manifest_validate_object_path(text, text)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.account_deletion_storage_manifest_validate_object_path(text, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.account_deletion_storage_manifest_initial_status(
  p_disposition text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
  SELECT CASE p_disposition
    WHEN 'DELETE_PRIVATE' THEN 'pending'
    WHEN 'PRESERVE_PUBLIC' THEN 'preserved'
    WHEN 'PRESERVE_SHARED' THEN 'preserved'
    WHEN 'DEFER_PROFILE' THEN 'pending'
    WHEN 'BLOCK_UNRESOLVED' THEN 'blocked'
    ELSE NULL
  END;
$$;

ALTER FUNCTION public.account_deletion_storage_manifest_initial_status(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_storage_manifest_initial_status(text) FROM PUBLIC;

-- Injective fingerprint: jsonb array of fixed-position row arrays, then SHA-256 of
-- jsonb::text. Empty manifest hashes canonical [] (not accidental digest('')).
CREATE OR REPLACE FUNCTION public.compute_account_deletion_storage_manifest_fingerprint(
  p_attempt_id uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  canonical jsonb;
BEGIN
  SELECT coalesce(
    jsonb_agg(row_json ORDER BY sort_bucket, sort_path, row_json),
    '[]'::jsonb
  )
  INTO canonical
  FROM (
    SELECT
      manifest_row.bucket AS sort_bucket,
      manifest_row.object_path AS sort_path,
      jsonb_build_array(
        manifest_row.bucket,
        manifest_row.object_path,
        manifest_row.media_category,
        manifest_row.disposition,
        manifest_row.ownership_basis,
        manifest_row.preservation_required,
        manifest_row.preservation_reason_code,
        manifest_row.reference_state,
        manifest_row.total_reference_count,
        manifest_row.surviving_reference_count,
        manifest_row.reference_fingerprint
      ) AS row_json
    FROM public.account_deletion_storage_manifest AS manifest_row
    WHERE manifest_row.execution_attempt_id = p_attempt_id
  ) AS ordered_rows;

  RETURN encode(public.digest(canonical::text, 'sha256'), 'hex');
END;
$$;

ALTER FUNCTION public.compute_account_deletion_storage_manifest_fingerprint(uuid)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.compute_account_deletion_storage_manifest_fingerprint(uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.compute_account_deletion_storage_manifest_fingerprint(uuid)
  FROM authenticated;
REVOKE ALL ON FUNCTION public.compute_account_deletion_storage_manifest_fingerprint(uuid)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.compute_account_deletion_storage_manifest_fingerprint(uuid)
  TO service_role;

COMMENT ON FUNCTION public.compute_account_deletion_storage_manifest_fingerprint(uuid) IS
  'Injective SHA-256 over jsonb_agg(jsonb_build_array(...)) ordered by bucket/path. '
  'Empty manifest uses canonical []::jsonb text. Delimiters inside strings cannot collide fields.';

-- ---------------------------------------------------------------------------
-- D) Immutability trigger after capture finalization (intentional full freeze)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_account_deletion_storage_manifest_freeze()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  capture_status text;
BEGIN
  SELECT capture_row.status
  INTO capture_status
  FROM public.account_deletion_storage_manifest_capture AS capture_row
  WHERE capture_row.execution_attempt_id = coalesce(NEW.execution_attempt_id, OLD.execution_attempt_id);

  IF capture_status = 'finalized'::text THEN
    -- Intentional: classification AND execution-status columns are frozen.
    -- 3B.3C must record Storage outcomes in a separate execution-result table.
    RAISE EXCEPTION 'storage_manifest_finalized'
      USING ERRCODE = 'P0001';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.trg_account_deletion_storage_manifest_freeze() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.trg_account_deletion_storage_manifest_freeze() FROM PUBLIC;

DROP TRIGGER IF EXISTS account_deletion_storage_manifest_freeze
  ON public.account_deletion_storage_manifest;

CREATE TRIGGER account_deletion_storage_manifest_freeze
  BEFORE INSERT OR UPDATE OR DELETE ON public.account_deletion_storage_manifest
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_account_deletion_storage_manifest_freeze();

CREATE OR REPLACE FUNCTION public.trg_account_deletion_storage_manifest_capture_touch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'finalized'::text THEN
    RAISE EXCEPTION 'storage_manifest_capture_finalized'
      USING ERRCODE = 'P0001';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.trg_account_deletion_storage_manifest_capture_touch() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.trg_account_deletion_storage_manifest_capture_touch() FROM PUBLIC;

DROP TRIGGER IF EXISTS account_deletion_storage_manifest_capture_touch
  ON public.account_deletion_storage_manifest_capture;

CREATE TRIGGER account_deletion_storage_manifest_capture_touch
  BEFORE UPDATE ON public.account_deletion_storage_manifest_capture
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_account_deletion_storage_manifest_capture_touch();

-- ---------------------------------------------------------------------------
-- E) Narrow lifecycle RPCs (inventory + deletion_in_progress only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.initialize_account_deletion_storage_manifest(
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
  existing record;
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
    RETURN jsonb_build_object('ok', false, 'code', 'request_not_found');
  END IF;

  IF req.status <> 'deletion_in_progress'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'request_not_in_progress');
  END IF;

  resolved_target := coalesce(req.user_id, req.target_user_id_snapshot);
  IF resolved_target IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invariant_failed');
  END IF;

  SELECT
    attempt_row.id,
    attempt_row.deletion_request_id,
    attempt_row.target_user_id,
    attempt_row.status,
    attempt_row.stage,
    attempt_row.storage_manifest_status,
    attempt_row.storage_manifest_fingerprint,
    attempt_row.storage_manifest_finalized_at
  INTO att
  FROM public.account_deletion_execution_attempts AS attempt_row
  WHERE attempt_row.id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'attempt_not_found');
  END IF;

  IF att.deletion_request_id IS DISTINCT FROM p_request_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'attempt_request_mismatch');
  END IF;

  IF att.target_user_id IS DISTINCT FROM resolved_target THEN
    RETURN jsonb_build_object('ok', false, 'code', 'target_mismatch');
  END IF;

  IF att.status <> 'active'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'attempt_not_active');
  END IF;

  IF att.stage <> 'inventory'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_stage');
  END IF;

  SELECT
    capture_row.execution_attempt_id,
    capture_row.status,
    capture_row.fingerprint,
    capture_row.object_count,
    capture_row.finalized_at,
    capture_row.target_user_id,
    capture_row.deletion_request_id
  INTO existing
  FROM public.account_deletion_storage_manifest_capture AS capture_row
  WHERE capture_row.execution_attempt_id = p_attempt_id
  FOR UPDATE;

  IF FOUND THEN
    IF existing.deletion_request_id IS DISTINCT FROM p_request_id
       OR existing.target_user_id IS DISTINCT FROM resolved_target THEN
      RETURN jsonb_build_object('ok', false, 'code', 'manifest_state_drift');
    END IF;

    IF existing.status = 'finalized'::text THEN
      IF att.storage_manifest_status IS DISTINCT FROM 'finalized'::text
         OR att.storage_manifest_fingerprint IS DISTINCT FROM existing.fingerprint THEN
        RETURN jsonb_build_object('ok', false, 'code', 'manifest_state_drift');
      END IF;

      RETURN jsonb_build_object(
        'ok', true,
        'code', 'already_finalized',
        'request_id', p_request_id,
        'attempt_id', p_attempt_id,
        'target_user_id', resolved_target,
        'capture_status', existing.status,
        'object_count', existing.object_count,
        'fingerprint', existing.fingerprint
      );
    END IF;

    IF att.storage_manifest_status IS DISTINCT FROM 'open'::text THEN
      RETURN jsonb_build_object('ok', false, 'code', 'manifest_state_drift');
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'code', 'already_initialized',
      'request_id', p_request_id,
      'attempt_id', p_attempt_id,
      'target_user_id', resolved_target,
      'capture_status', existing.status,
      'object_count', existing.object_count
    );
  END IF;

  BEGIN
    INSERT INTO public.account_deletion_storage_manifest_capture (
      execution_attempt_id,
      deletion_request_id,
      target_user_id,
      status,
      object_count
    ) VALUES (
      p_attempt_id,
      p_request_id,
      resolved_target,
      'open'::text,
      0
    );
  EXCEPTION
    WHEN unique_violation THEN
      SELECT
        capture_row.status,
        capture_row.object_count,
        capture_row.fingerprint,
        capture_row.target_user_id,
        capture_row.deletion_request_id
      INTO existing
      FROM public.account_deletion_storage_manifest_capture AS capture_row
      WHERE capture_row.execution_attempt_id = p_attempt_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'code', 'invariant_failed');
      END IF;

      IF existing.deletion_request_id IS DISTINCT FROM p_request_id
         OR existing.target_user_id IS DISTINCT FROM resolved_target THEN
        RETURN jsonb_build_object('ok', false, 'code', 'manifest_state_drift');
      END IF;

      RETURN jsonb_build_object(
        'ok', true,
        'code', 'already_initialized',
        'request_id', p_request_id,
        'attempt_id', p_attempt_id,
        'target_user_id', resolved_target,
        'capture_status', existing.status,
        'object_count', existing.object_count
      );
  END;

  UPDATE public.account_deletion_execution_attempts AS attempt_row
  SET
    storage_manifest_status = 'open'::text,
    storage_manifest_fingerprint = NULL,
    storage_manifest_finalized_at = NULL,
    updated_at = now()
  WHERE attempt_row.id = p_attempt_id;

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'initialized',
    'request_id', p_request_id,
    'attempt_id', p_attempt_id,
    'target_user_id', resolved_target,
    'capture_status', 'open',
    'object_count', 0
  );
END;
$$;

ALTER FUNCTION public.initialize_account_deletion_storage_manifest(uuid, uuid)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.initialize_account_deletion_storage_manifest(uuid, uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.initialize_account_deletion_storage_manifest(uuid, uuid)
  FROM authenticated;
REVOKE ALL ON FUNCTION public.initialize_account_deletion_storage_manifest(uuid, uuid)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.initialize_account_deletion_storage_manifest(uuid, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.upsert_account_deletion_storage_manifest_object(
  p_request_id uuid,
  p_attempt_id uuid,
  p_bucket text,
  p_object_path text,
  p_media_category text,
  p_ownership_basis text,
  p_disposition text,
  p_disposition_reason text,
  p_preservation_required boolean DEFAULT false,
  p_preservation_reason_code text DEFAULT NULL,
  p_reference_state text DEFAULT 'unresolved',
  p_total_reference_count integer DEFAULT 0,
  p_surviving_reference_count integer DEFAULT 0,
  p_reference_fingerprint text DEFAULT NULL
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
  resolved_target uuid;
  initial_status text;
  upserted_id uuid;
  v_object_count integer;
  ref_state text;
BEGIN
  IF p_request_id IS NULL
     OR p_attempt_id IS NULL
     OR p_bucket IS NULL
     OR p_object_path IS NULL
     OR p_media_category IS NULL
     OR p_ownership_basis IS NULL
     OR p_disposition IS NULL
     OR p_disposition_reason IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_arguments');
  END IF;

  -- Foundation must not mint destructive Storage delete authority.
  IF p_disposition = 'DELETE_PRIVATE'::text THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'delete_authority_not_available_in_foundation'
    );
  END IF;

  IF NOT public.account_deletion_storage_manifest_validate_object_path(p_bucket, p_object_path) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_object_path');
  END IF;

  IF coalesce(p_preservation_required, false) = true
     AND (
       p_preservation_reason_code IS NULL
       OR length(btrim(p_preservation_reason_code)) = 0
     ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'preservation_reason_required');
  END IF;

  ref_state := coalesce(nullif(btrim(p_reference_state), ''), 'unresolved');
  IF ref_state <> ALL (ARRAY['exclusive'::text, 'shared'::text, 'unresolved'::text]) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_reference_state');
  END IF;

  initial_status := public.account_deletion_storage_manifest_initial_status(p_disposition);
  IF initial_status IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_disposition');
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
    RETURN jsonb_build_object('ok', false, 'code', 'request_not_found');
  END IF;

  IF req.status <> 'deletion_in_progress'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'request_not_in_progress');
  END IF;

  resolved_target := coalesce(req.user_id, req.target_user_id_snapshot);
  IF resolved_target IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invariant_failed');
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
  WHERE attempt_row.id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'attempt_not_found');
  END IF;

  IF att.deletion_request_id IS DISTINCT FROM p_request_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'attempt_request_mismatch');
  END IF;

  IF att.target_user_id IS DISTINCT FROM resolved_target THEN
    RETURN jsonb_build_object('ok', false, 'code', 'target_mismatch');
  END IF;

  IF att.status <> 'active'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'attempt_not_active');
  END IF;

  IF att.stage <> 'inventory'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_stage');
  END IF;

  SELECT
    capture.execution_attempt_id,
    capture.status,
    capture.target_user_id,
    capture.deletion_request_id
  INTO capture_row
  FROM public.account_deletion_storage_manifest_capture AS capture
  WHERE capture.execution_attempt_id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'manifest_not_initialized');
  END IF;

  IF capture_row.status <> 'open'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'manifest_finalized');
  END IF;

  IF capture_row.target_user_id IS DISTINCT FROM resolved_target
     OR capture_row.deletion_request_id IS DISTINCT FROM p_request_id
     OR att.storage_manifest_status IS DISTINCT FROM 'open'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'manifest_state_drift');
  END IF;

  INSERT INTO public.account_deletion_storage_manifest (
    deletion_request_id,
    execution_attempt_id,
    target_user_id,
    bucket,
    object_path,
    media_category,
    ownership_basis,
    disposition,
    disposition_reason,
    preservation_required,
    preservation_reason_code,
    reference_state,
    total_reference_count,
    surviving_reference_count,
    reference_fingerprint,
    status
  ) VALUES (
    p_request_id,
    p_attempt_id,
    resolved_target,
    p_bucket,
    p_object_path,
    p_media_category,
    btrim(p_ownership_basis),
    p_disposition,
    btrim(p_disposition_reason),
    coalesce(p_preservation_required, false),
    CASE
      WHEN coalesce(p_preservation_required, false) THEN btrim(p_preservation_reason_code)
      ELSE NULL
    END,
    ref_state,
    coalesce(p_total_reference_count, 0),
    coalesce(p_surviving_reference_count, 0),
    nullif(btrim(coalesce(p_reference_fingerprint, '')), ''),
    initial_status
  )
  ON CONFLICT (execution_attempt_id, bucket, object_path)
  DO UPDATE SET
    media_category = EXCLUDED.media_category,
    ownership_basis = EXCLUDED.ownership_basis,
    disposition = EXCLUDED.disposition,
    disposition_reason = EXCLUDED.disposition_reason,
    preservation_required = EXCLUDED.preservation_required,
    preservation_reason_code = EXCLUDED.preservation_reason_code,
    reference_state = EXCLUDED.reference_state,
    total_reference_count = EXCLUDED.total_reference_count,
    surviving_reference_count = EXCLUDED.surviving_reference_count,
    reference_fingerprint = EXCLUDED.reference_fingerprint,
    status = EXCLUDED.status,
    retry_count = 0,
    last_error_code = NULL,
    last_error_detail_safe = NULL,
    first_attempted_at = NULL,
    completed_at = NULL,
    updated_at = now()
  RETURNING id INTO upserted_id;

  IF upserted_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invariant_failed');
  END IF;

  SELECT count(*)::integer
  INTO v_object_count
  FROM public.account_deletion_storage_manifest AS manifest_row
  WHERE manifest_row.execution_attempt_id = p_attempt_id;

  UPDATE public.account_deletion_storage_manifest_capture AS capture
  SET
    object_count = v_object_count,
    updated_at = now()
  WHERE capture.execution_attempt_id = p_attempt_id
    AND capture.status = 'open'::text;

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'upserted',
    'request_id', p_request_id,
    'attempt_id', p_attempt_id,
    'target_user_id', resolved_target,
    'manifest_row_id', upserted_id,
    'disposition', p_disposition,
    'status', initial_status
  );
EXCEPTION
  WHEN check_violation THEN
    RETURN jsonb_build_object('ok', false, 'code', 'policy_invariant_violation');
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'code', 'duplicate_object');
END;
$$;

ALTER FUNCTION public.upsert_account_deletion_storage_manifest_object(
  uuid, uuid, text, text, text, text, text, text, boolean, text, text, integer, integer, text
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.upsert_account_deletion_storage_manifest_object(
  uuid, uuid, text, text, text, text, text, text, boolean, text, text, integer, integer, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_account_deletion_storage_manifest_object(
  uuid, uuid, text, text, text, text, text, text, boolean, text, text, integer, integer, text
) FROM authenticated;
REVOKE ALL ON FUNCTION public.upsert_account_deletion_storage_manifest_object(
  uuid, uuid, text, text, text, text, text, text, boolean, text, text, integer, integer, text
) FROM anon;
GRANT EXECUTE ON FUNCTION public.upsert_account_deletion_storage_manifest_object(
  uuid, uuid, text, text, text, text, text, text, boolean, text, text, integer, integer, text
) TO service_role;

COMMENT ON FUNCTION public.upsert_account_deletion_storage_manifest_object(
  uuid, uuid, text, text, text, text, text, text, boolean, text, text, integer, integer, text
) IS
  'Foundation classification upsert. Rejects DELETE_PRIVATE '
  '(delete_authority_not_available_in_foundation). 3B.3B.2 mints DELETE_PRIVATE only '
  'from authoritative pre-detach DB evidence. No Storage I/O.';

CREATE OR REPLACE FUNCTION public.finalize_account_deletion_storage_manifest(
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
  resolved_target uuid;
  computed_fingerprint text;
  v_object_count integer;
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
    RETURN jsonb_build_object('ok', false, 'code', 'request_not_found');
  END IF;

  IF req.status <> 'deletion_in_progress'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'request_not_in_progress');
  END IF;

  resolved_target := coalesce(req.user_id, req.target_user_id_snapshot);
  IF resolved_target IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invariant_failed');
  END IF;

  SELECT
    attempt_row.id,
    attempt_row.deletion_request_id,
    attempt_row.target_user_id,
    attempt_row.status,
    attempt_row.stage,
    attempt_row.storage_manifest_status,
    attempt_row.storage_manifest_fingerprint,
    attempt_row.storage_manifest_finalized_at,
    attempt_row.storage_objects_expected
  INTO att
  FROM public.account_deletion_execution_attempts AS attempt_row
  WHERE attempt_row.id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'attempt_not_found');
  END IF;

  IF att.deletion_request_id IS DISTINCT FROM p_request_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'attempt_request_mismatch');
  END IF;

  IF att.target_user_id IS DISTINCT FROM resolved_target THEN
    RETURN jsonb_build_object('ok', false, 'code', 'target_mismatch');
  END IF;

  IF att.status <> 'active'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'attempt_not_active');
  END IF;

  IF att.stage <> 'inventory'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_stage');
  END IF;

  SELECT
    capture.execution_attempt_id,
    capture.status,
    capture.fingerprint,
    capture.object_count,
    capture.target_user_id,
    capture.deletion_request_id,
    capture.finalized_at
  INTO capture_row
  FROM public.account_deletion_storage_manifest_capture AS capture
  WHERE capture.execution_attempt_id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'manifest_not_initialized');
  END IF;

  IF capture_row.target_user_id IS DISTINCT FROM resolved_target
     OR capture_row.deletion_request_id IS DISTINCT FROM p_request_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'manifest_state_drift');
  END IF;

  computed_fingerprint := public.compute_account_deletion_storage_manifest_fingerprint(p_attempt_id);

  SELECT count(*)::integer
  INTO v_object_count
  FROM public.account_deletion_storage_manifest AS manifest_row
  WHERE manifest_row.execution_attempt_id = p_attempt_id;

  IF capture_row.status = 'finalized'::text THEN
    IF att.storage_manifest_status IS DISTINCT FROM 'finalized'::text
       OR att.storage_manifest_fingerprint IS DISTINCT FROM capture_row.fingerprint
       OR capture_row.fingerprint IS DISTINCT FROM computed_fingerprint
       OR capture_row.object_count IS DISTINCT FROM v_object_count
       OR att.storage_objects_expected IS DISTINCT FROM v_object_count THEN
      RETURN jsonb_build_object('ok', false, 'code', 'manifest_state_drift');
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'code', 'already_finalized',
      'request_id', p_request_id,
      'attempt_id', p_attempt_id,
      'target_user_id', resolved_target,
      'capture_status', 'finalized',
      'object_count', v_object_count,
      'fingerprint', capture_row.fingerprint,
      'finalized_at', capture_row.finalized_at
    );
  END IF;

  IF att.storage_manifest_status IS DISTINCT FROM 'open'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'manifest_state_drift');
  END IF;

  UPDATE public.account_deletion_storage_manifest_capture AS capture
  SET
    status = 'finalized'::text,
    fingerprint = computed_fingerprint,
    object_count = v_object_count,
    finalized_at = now(),
    updated_at = now()
  WHERE capture.execution_attempt_id = p_attempt_id
    AND capture.status = 'open'::text;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invariant_failed');
  END IF;

  UPDATE public.account_deletion_execution_attempts AS attempt_row
  SET
    storage_manifest_status = 'finalized'::text,
    storage_manifest_fingerprint = computed_fingerprint,
    storage_manifest_finalized_at = now(),
    storage_objects_expected = v_object_count,
    updated_at = now()
  WHERE attempt_row.id = p_attempt_id;

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'finalized',
    'request_id', p_request_id,
    'attempt_id', p_attempt_id,
    'target_user_id', resolved_target,
    'capture_status', 'finalized',
    'object_count', v_object_count,
    'fingerprint', computed_fingerprint
  );
END;
$$;

ALTER FUNCTION public.finalize_account_deletion_storage_manifest(uuid, uuid)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.finalize_account_deletion_storage_manifest(uuid, uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_account_deletion_storage_manifest(uuid, uuid)
  FROM authenticated;
REVOKE ALL ON FUNCTION public.finalize_account_deletion_storage_manifest(uuid, uuid)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.finalize_account_deletion_storage_manifest(uuid, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.get_account_deletion_storage_manifest_summary(
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
  att record;
  capture_row record;
  disposition_counts jsonb;
BEGIN
  IF p_request_id IS NULL OR p_attempt_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_arguments');
  END IF;

  SELECT
    attempt_row.id,
    attempt_row.deletion_request_id,
    attempt_row.target_user_id,
    attempt_row.storage_manifest_status,
    attempt_row.storage_manifest_fingerprint
  INTO att
  FROM public.account_deletion_execution_attempts AS attempt_row
  WHERE attempt_row.id = p_attempt_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'attempt_not_found');
  END IF;

  IF att.deletion_request_id IS DISTINCT FROM p_request_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'attempt_request_mismatch');
  END IF;

  SELECT
    capture.status,
    capture.object_count,
    capture.fingerprint,
    capture.finalized_at,
    capture.target_user_id,
    capture.deletion_request_id
  INTO capture_row
  FROM public.account_deletion_storage_manifest_capture AS capture
  WHERE capture.execution_attempt_id = p_attempt_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'code', 'absent',
      'request_id', p_request_id,
      'attempt_id', p_attempt_id,
      'capture_status', NULL
    );
  END IF;

  IF capture_row.deletion_request_id IS DISTINCT FROM p_request_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'manifest_state_drift');
  END IF;

  IF capture_row.status = 'finalized'::text
     AND (
       att.storage_manifest_status IS DISTINCT FROM 'finalized'::text
       OR att.storage_manifest_fingerprint IS DISTINCT FROM capture_row.fingerprint
     ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'manifest_state_drift');
  END IF;

  SELECT coalesce(jsonb_object_agg(disposition, cnt), '{}'::jsonb)
  INTO disposition_counts
  FROM (
    SELECT
      manifest_row.disposition,
      count(*)::integer AS cnt
    FROM public.account_deletion_storage_manifest AS manifest_row
    WHERE manifest_row.execution_attempt_id = p_attempt_id
    GROUP BY manifest_row.disposition
  ) AS counts;

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'summary',
    'request_id', p_request_id,
    'attempt_id', p_attempt_id,
    'target_user_id', capture_row.target_user_id,
    'capture_status', capture_row.status,
    'object_count', capture_row.object_count,
    'fingerprint', capture_row.fingerprint,
    'finalized_at', capture_row.finalized_at,
    'disposition_counts', disposition_counts
  );
END;
$$;

ALTER FUNCTION public.get_account_deletion_storage_manifest_summary(uuid, uuid)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_account_deletion_storage_manifest_summary(uuid, uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_account_deletion_storage_manifest_summary(uuid, uuid)
  FROM authenticated;
REVOKE ALL ON FUNCTION public.get_account_deletion_storage_manifest_summary(uuid, uuid)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.get_account_deletion_storage_manifest_summary(uuid, uuid)
  TO service_role;

COMMENT ON FUNCTION public.get_account_deletion_storage_manifest_summary(uuid, uuid) IS
  'Read-only summary (counts/fingerprint/status). No raw object paths. Allowed beyond inventory.';

-- ---------------------------------------------------------------------------
-- F) Readiness probe + compose
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.verify_account_deletion_storage_manifest_foundation_ready()
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
  pg17_plus boolean;
BEGIN
  pg17_plus := current_setting('server_version_num')::integer >= 170000;

  check_ok := to_regclass('public.account_deletion_storage_manifest') IS NOT NULL
    AND to_regclass('public.account_deletion_storage_manifest_capture') IS NOT NULL;
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'storage_manifest_tables_present',
      'ready', check_ok,
      'detail', 'manifest(+capture) tables present'
    )
  );
  all_ready := all_ready AND check_ok;

  check_ok := EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.account_deletion_storage_manifest'::regclass
      AND conname = 'account_deletion_storage_manifest_delete_requires_target_prefix'
  )
  AND EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.account_deletion_storage_manifest'::regclass
      AND conname = 'account_deletion_storage_manifest_delete_requires_exclusive_refs'
  )
  AND EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.account_deletion_storage_manifest'::regclass
      AND conname = 'account_deletion_storage_manifest_no_public_delete'
  )
  AND EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.account_deletion_storage_manifest'::regclass
      AND conname = 'account_deletion_storage_manifest_avatar_defer'
  );
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'storage_manifest_policy_checks_present',
      'ready', check_ok,
      'detail', 'key DELETE/preserve CHECK constraints present'
    )
  );
  all_ready := all_ready AND check_ok;

  check_ok := EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS trig
    JOIN pg_catalog.pg_class AS rel ON rel.oid = trig.tgrelid
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'account_deletion_storage_manifest'
      AND trig.tgname = 'account_deletion_storage_manifest_freeze'
      AND NOT trig.tgisinternal
  )
  AND to_regprocedure('public.trg_account_deletion_storage_manifest_freeze()') IS NOT NULL;
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'storage_manifest_freeze_trigger',
      'ready', check_ok,
      'detail', 'finalized full-row freeze trigger present'
    )
  );
  all_ready := all_ready AND check_ok;

  check_ok := EXISTS (
    SELECT 1
    FROM pg_catalog.pg_index AS idx
    JOIN pg_catalog.pg_class AS rel ON rel.oid = idx.indrelid
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'account_deletion_storage_manifest'
      AND idx.indisunique
      AND pg_catalog.pg_get_indexdef(idx.indexrelid)
        LIKE '%execution_attempt_id%bucket%object_path%'
  );
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'storage_manifest_unique_attempt_object',
      'ready', check_ok,
      'detail', 'unique (attempt, bucket, object_path) present'
    )
  );
  all_ready := all_ready AND check_ok;

  check_ok :=
    NOT pg_catalog.has_table_privilege('authenticated', 'public.account_deletion_storage_manifest', 'SELECT')
    AND NOT pg_catalog.has_table_privilege('authenticated', 'public.account_deletion_storage_manifest', 'INSERT')
    AND NOT pg_catalog.has_table_privilege('authenticated', 'public.account_deletion_storage_manifest', 'UPDATE')
    AND NOT pg_catalog.has_table_privilege('authenticated', 'public.account_deletion_storage_manifest', 'DELETE')
    AND NOT pg_catalog.has_table_privilege('anon', 'public.account_deletion_storage_manifest', 'SELECT')
    AND NOT pg_catalog.has_table_privilege('anon', 'public.account_deletion_storage_manifest', 'INSERT')
    AND NOT pg_catalog.has_table_privilege('anon', 'public.account_deletion_storage_manifest', 'UPDATE')
    AND NOT pg_catalog.has_table_privilege('anon', 'public.account_deletion_storage_manifest', 'DELETE')
    AND NOT pg_catalog.has_table_privilege('authenticated', 'public.account_deletion_storage_manifest_capture', 'SELECT')
    AND NOT pg_catalog.has_table_privilege('anon', 'public.account_deletion_storage_manifest_capture', 'SELECT');
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'storage_manifest_denied_to_end_users',
      'ready', check_ok,
      'detail', 'authenticated/anon have no manifest table privileges'
    )
  );
  all_ready := all_ready AND check_ok;

  check_ok :=
    pg_catalog.has_table_privilege('service_role', 'public.account_deletion_storage_manifest', 'SELECT')
    AND NOT pg_catalog.has_table_privilege('service_role', 'public.account_deletion_storage_manifest', 'INSERT')
    AND NOT pg_catalog.has_table_privilege('service_role', 'public.account_deletion_storage_manifest', 'UPDATE')
    AND NOT pg_catalog.has_table_privilege('service_role', 'public.account_deletion_storage_manifest', 'DELETE')
    AND NOT pg_catalog.has_table_privilege('service_role', 'public.account_deletion_storage_manifest', 'TRUNCATE')
    AND pg_catalog.has_table_privilege('service_role', 'public.account_deletion_storage_manifest_capture', 'SELECT')
    AND NOT pg_catalog.has_table_privilege('service_role', 'public.account_deletion_storage_manifest_capture', 'INSERT')
    AND NOT pg_catalog.has_table_privilege('service_role', 'public.account_deletion_storage_manifest_capture', 'UPDATE')
    AND NOT pg_catalog.has_table_privilege('service_role', 'public.account_deletion_storage_manifest_capture', 'DELETE');
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'storage_manifest_service_role_select_only',
      'ready', check_ok,
      'detail', 'service_role SELECT-only; mutations via RPCs'
    )
  );
  all_ready := all_ready AND check_ok;

  IF pg17_plus THEN
    check_ok :=
      NOT pg_catalog.has_table_privilege(
        'service_role', 'public.account_deletion_storage_manifest', 'MAINTAIN'
      )
      AND NOT pg_catalog.has_table_privilege(
        'service_role', 'public.account_deletion_storage_manifest_capture', 'MAINTAIN'
      );
    prerequisites := prerequisites || jsonb_build_array(
      jsonb_build_object(
        'id', 'storage_manifest_service_role_maintain_revoked',
        'ready', check_ok,
        'detail', 'service_role MAINTAIN revoked (PostgreSQL 17+)'
      )
    );
    all_ready := all_ready AND check_ok;
  ELSE
    prerequisites := prerequisites || jsonb_build_array(
      jsonb_build_object(
        'id', 'storage_manifest_service_role_maintain_revoked',
        'ready', true,
        'detail', 'MAINTAIN privilege not applicable before PostgreSQL 17'
      )
    );
  END IF;

  check_ok :=
    to_regprocedure('public.initialize_account_deletion_storage_manifest(uuid, uuid)') IS NOT NULL
    AND to_regprocedure(
      'public.upsert_account_deletion_storage_manifest_object(uuid, uuid, text, text, text, text, text, text, boolean, text, text, integer, integer, text)'
    ) IS NOT NULL
    AND to_regprocedure('public.finalize_account_deletion_storage_manifest(uuid, uuid)') IS NOT NULL
    AND to_regprocedure('public.get_account_deletion_storage_manifest_summary(uuid, uuid)') IS NOT NULL
    AND to_regprocedure('public.compute_account_deletion_storage_manifest_fingerprint(uuid)') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS proc
      JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = proc.pronamespace
      WHERE nsp.nspname = 'public'
        AND proc.oid = to_regprocedure('public.initialize_account_deletion_storage_manifest(uuid, uuid)')
        AND proc.prosecdef = true
        AND pg_catalog.pg_get_userbyid(proc.proowner) = 'postgres'
    )
    AND pg_catalog.has_function_privilege(
      'service_role',
      'public.initialize_account_deletion_storage_manifest(uuid, uuid)',
      'EXECUTE'
    )
    AND NOT pg_catalog.has_function_privilege(
      'authenticated',
      'public.initialize_account_deletion_storage_manifest(uuid, uuid)',
      'EXECUTE'
    )
    AND NOT pg_catalog.has_function_privilege(
      'anon',
      'public.initialize_account_deletion_storage_manifest(uuid, uuid)',
      'EXECUTE'
    );
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'storage_manifest_lifecycle_rpcs',
      'ready', check_ok,
      'detail', 'initialize/upsert/finalize/summary/fingerprint RPCs hardened'
    )
  );
  all_ready := all_ready AND check_ok;

  check_ok := EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute AS attr
    WHERE attr.attrelid = 'public.account_deletion_execution_attempts'::regclass
      AND attr.attname = 'storage_manifest_fingerprint'
      AND attr.attisdropped = false
  )
  AND EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute AS attr
    WHERE attr.attrelid = 'public.account_deletion_storage_manifest'::regclass
      AND attr.attname = 'reference_state'
      AND attr.attisdropped = false
  );
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'storage_manifest_reference_and_attempt_columns',
      'ready', check_ok,
      'detail', 'attempt fingerprint + reference_state columns present'
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

ALTER FUNCTION public.verify_account_deletion_storage_manifest_foundation_ready()
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.verify_account_deletion_storage_manifest_foundation_ready()
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_account_deletion_storage_manifest_foundation_ready()
  FROM authenticated;
REVOKE ALL ON FUNCTION public.verify_account_deletion_storage_manifest_foundation_ready()
  FROM anon;
GRANT EXECUTE ON FUNCTION public.verify_account_deletion_storage_manifest_foundation_ready()
  TO service_role;

DO $$
BEGIN
  IF to_regprocedure('public.verify_account_deletion_schema_execution_ready_before_3b3b1()') IS NULL THEN
    ALTER FUNCTION public.verify_account_deletion_schema_execution_ready()
      RENAME TO verify_account_deletion_schema_execution_ready_before_3b3b1;
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
  storage_manifest jsonb;
  prerequisites jsonb;
  all_ready boolean;
BEGIN
  core := public.verify_account_deletion_schema_execution_ready_before_3b3b1();
  storage_manifest := public.verify_account_deletion_storage_manifest_foundation_ready();

  prerequisites :=
    coalesce(core->'prerequisites', '[]'::jsonb)
    || coalesce(storage_manifest->'prerequisites', '[]'::jsonb);

  all_ready :=
    coalesce((core->>'ready')::boolean, false)
    AND coalesce((storage_manifest->>'ready')::boolean, false);

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
  'Live catalog probe including hardened durable storage manifest foundation. '
  'Does not enable execution or mint Storage delete authority.';

COMMIT;
