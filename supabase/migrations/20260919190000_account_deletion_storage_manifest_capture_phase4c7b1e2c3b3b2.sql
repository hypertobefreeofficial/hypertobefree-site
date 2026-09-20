-- Phase 4C.7B.1E.2C.3B.3B.2 — Authoritative storage inventory capture + 3B.1 gate
-- DDL/functions/grants/readiness only. ZERO Production-data mutation on apply.
-- Does NOT delete Storage objects, call remove(), clear profiles, delete Auth,
-- or advance past database_completed.
--
-- AUTHORITY: Foundation upsert STILL rejects DELETE_PRIVATE.
-- Only capture_account_deletion_storage_manifest (DB-derived) may mint it.
-- 3B.1 refuses before identity mutation without a finalized, integrity-checked
-- manifest and a full authoritative expected-inventory recheck.
-- _inner is not caller-executable after RENAME (explicit REVOKE).

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.account_deletion_storage_manifest') IS NULL THEN
    RAISE EXCEPTION '3B.3B.2 precondition failed: storage manifest foundation missing';
  END IF;
  IF to_regprocedure('public.execute_account_deletion_nondestructive_database_stage(uuid, uuid)') IS NULL THEN
    RAISE EXCEPTION '3B.3B.2 precondition failed: 3B.1 RPC missing';
  END IF;
  IF to_regprocedure('public.account_deletion_sha256(text)') IS NULL THEN
    RAISE EXCEPTION '3B.3B.2 precondition failed: account_deletion_sha256 missing';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- A) Strengthen DELETE_PRIVATE invariants (closes prior medium gaps)
-- ---------------------------------------------------------------------------

ALTER TABLE public.account_deletion_storage_manifest
  DROP CONSTRAINT IF EXISTS account_deletion_storage_manifest_delete_requires_exclusive_refs;

ALTER TABLE public.account_deletion_storage_manifest
  ADD CONSTRAINT account_deletion_storage_manifest_delete_requires_exclusive_refs CHECK (
    disposition <> 'DELETE_PRIVATE'::text
    OR (
      reference_state = 'exclusive'::text
      AND surviving_reference_count = 0
      AND total_reference_count >= 1
      AND reference_fingerprint IS NOT NULL
      AND length(btrim(reference_fingerprint)) > 0
    )
  );

ALTER TABLE public.account_deletion_storage_manifest
  DROP CONSTRAINT IF EXISTS account_deletion_storage_manifest_exclusive_surviving_consistency;

ALTER TABLE public.account_deletion_storage_manifest
  ADD CONSTRAINT account_deletion_storage_manifest_exclusive_surviving_consistency CHECK (
    reference_state <> 'exclusive'::text
    OR surviving_reference_count = 0
  );

COMMENT ON CONSTRAINT account_deletion_storage_manifest_delete_requires_exclusive_refs
  ON public.account_deletion_storage_manifest IS
  'DELETE_PRIVATE requires exclusive refs, zero survivors, total>=1, and non-empty reference_fingerprint.';

-- ---------------------------------------------------------------------------
-- B) Path parse helper (bucket-relative; rejects http / ambiguous)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.account_deletion_parse_storage_object_path(
  p_bucket text,
  p_value text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
DECLARE
  trimmed text;
  after_bucket text;
BEGIN
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

COMMENT ON FUNCTION public.account_deletion_parse_storage_object_path(text, text) IS
  'Extracts bucket-relative object path from DB media references. HTTP URLs return NULL (ambiguous).';

-- ---------------------------------------------------------------------------
-- C) Journey reference inventory (pre-3B.1 survivor predicate)
-- ---------------------------------------------------------------------------
-- Surviving foreign reference (survives target deletion / 3B.1 sender SET NULL):
--   inbox media SLOT whose path resolves to the object
--   AND sender_user_id = target
--   AND user_id IS DISTINCT FROM target
-- Fingerprint entries: [id, user_id, sender_user_id, media_slot, object_path, thread_id]

CREATE OR REPLACE FUNCTION public.account_deletion_journey_reference_evidence(
  p_target_user_id uuid,
  p_object_path text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  total_count integer := 0;
  surviving_count integer := 0;
  target_owned_count integer := 0;
  ref_state text;
  fingerprint text;
  canonical jsonb;
BEGIN
  IF p_target_user_id IS NULL OR p_object_path IS NULL OR btrim(p_object_path) = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_arguments');
  END IF;

  WITH slots AS (
    SELECT
      msg.id,
      msg.user_id,
      msg.sender_user_id,
      msg.thread_id,
      'video_url'::text AS media_slot
    FROM public.inbox_messages AS msg
    WHERE public.account_deletion_parse_storage_object_path(
      'journey-private-media', coalesce(msg.video_url, '')
    ) = p_object_path
    UNION ALL
    SELECT
      msg.id,
      msg.user_id,
      msg.sender_user_id,
      msg.thread_id,
      'image_url'::text AS media_slot
    FROM public.inbox_messages AS msg
    WHERE public.account_deletion_parse_storage_object_path(
      'journey-private-media', coalesce(msg.image_url, '')
    ) = p_object_path
  )
  SELECT
    count(*)::integer,
    count(*) FILTER (
      WHERE slots.sender_user_id = p_target_user_id
        AND slots.user_id IS DISTINCT FROM p_target_user_id
    )::integer,
    count(*) FILTER (
      WHERE slots.user_id = p_target_user_id
    )::integer
  INTO total_count, surviving_count, target_owned_count
  FROM slots;

  WITH slots AS (
    SELECT
      msg.id,
      msg.user_id,
      msg.sender_user_id,
      msg.thread_id,
      'video_url'::text AS media_slot
    FROM public.inbox_messages AS msg
    WHERE public.account_deletion_parse_storage_object_path(
      'journey-private-media', coalesce(msg.video_url, '')
    ) = p_object_path
    UNION ALL
    SELECT
      msg.id,
      msg.user_id,
      msg.sender_user_id,
      msg.thread_id,
      'image_url'::text AS media_slot
    FROM public.inbox_messages AS msg
    WHERE public.account_deletion_parse_storage_object_path(
      'journey-private-media', coalesce(msg.image_url, '')
    ) = p_object_path
  )
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_array(
        slots.id,
        slots.user_id,
        slots.sender_user_id,
        slots.media_slot,
        p_object_path,
        coalesce(slots.thread_id, '')
      )
      ORDER BY slots.id, slots.media_slot
    ),
    '[]'::jsonb
  )
  INTO canonical
  FROM slots;

  fingerprint := encode(public.account_deletion_sha256(canonical::text), 'hex');

  IF surviving_count > 0 THEN
    ref_state := 'shared';
  ELSIF target_owned_count >= 1 AND surviving_count = 0 AND total_count >= 1 THEN
    ref_state := 'exclusive';
  ELSE
    ref_state := 'unresolved';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'reference_state', ref_state,
    'total_reference_count', total_count,
    'surviving_reference_count', surviving_count,
    'target_owned_count', target_owned_count,
    'ambiguous_count', 0,
    'reference_fingerprint', fingerprint
  );
END;
$$;

ALTER FUNCTION public.account_deletion_journey_reference_evidence(uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_journey_reference_evidence(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_deletion_journey_reference_evidence(uuid, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_journey_reference_evidence(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.account_deletion_journey_reference_evidence(uuid, text) FROM service_role;

COMMENT ON FUNCTION public.account_deletion_journey_reference_evidence(uuid, text) IS
  'Pre-3B.1 Journey ref inventory by media slot. Surviving foreign = sender=target AND user_id<>target. '
  'Fingerprint = SHA-256 over jsonb_agg([id,user_id,sender_user_id,slot,path,thread_id] ORDER BY id,slot).';

-- ---------------------------------------------------------------------------
-- C2) Unresolved media sources (fail-closed; never invent Storage paths)
-- ---------------------------------------------------------------------------

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
BEGIN
  IF p_target_user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    'profiles'::text,
    'avatar_url'::text,
    profile_row.id
  FROM public.profiles AS profile_row
  WHERE profile_row.id = p_target_user_id
    AND profile_row.avatar_url IS NOT NULL
    AND btrim(profile_row.avatar_url) <> ''
    AND public.account_deletion_parse_storage_object_path(
      'profile-avatars', profile_row.avatar_url
    ) IS NULL;

  RETURN QUERY
  SELECT 'stories'::text, 'image_url'::text, story_row.id
  FROM public.stories AS story_row
  WHERE story_row.user_id = p_target_user_id
    AND story_row.image_url IS NOT NULL
    AND btrim(story_row.image_url) <> ''
    AND public.account_deletion_parse_storage_object_path(
      'story-images', story_row.image_url
    ) IS NULL
  UNION ALL
  SELECT 'stories'::text, 'video_url'::text, story_row.id
  FROM public.stories AS story_row
  WHERE story_row.user_id = p_target_user_id
    AND story_row.video_url IS NOT NULL
    AND btrim(story_row.video_url) <> ''
    AND public.account_deletion_parse_storage_object_path(
      'story-videos', story_row.video_url
    ) IS NULL
  UNION ALL
  SELECT 'stories'::text, 'thumbnail_url'::text, story_row.id
  FROM public.stories AS story_row
  WHERE story_row.user_id = p_target_user_id
    AND story_row.thumbnail_url IS NOT NULL
    AND btrim(story_row.thumbnail_url) <> ''
    AND public.account_deletion_parse_storage_object_path(
      'story-thumbnails', story_row.thumbnail_url
    ) IS NULL;

  RETURN QUERY
  SELECT 'prayer_video_responses'::text, 'video_url'::text, prayer_row.id
  FROM public.prayer_video_responses AS prayer_row
  WHERE prayer_row.user_id = p_target_user_id
    AND prayer_row.video_url IS NOT NULL
    AND btrim(prayer_row.video_url) <> ''
    AND public.account_deletion_parse_storage_object_path(
      'story-videos', prayer_row.video_url
    ) IS NULL
  UNION ALL
  SELECT 'prayer_video_responses'::text, 'thumbnail_url'::text, prayer_row.id
  FROM public.prayer_video_responses AS prayer_row
  WHERE prayer_row.user_id = p_target_user_id
    AND prayer_row.thumbnail_url IS NOT NULL
    AND btrim(prayer_row.thumbnail_url) <> ''
    AND public.account_deletion_parse_storage_object_path(
      'story-thumbnails', prayer_row.thumbnail_url
    ) IS NULL;

  RETURN QUERY
  SELECT 'inbox_messages'::text, 'video_url'::text, msg.id
  FROM public.inbox_messages AS msg
  WHERE (msg.user_id = p_target_user_id OR msg.sender_user_id = p_target_user_id)
    AND msg.video_url IS NOT NULL
    AND btrim(msg.video_url) <> ''
    AND (
      position('journey-private-media/' IN msg.video_url) > 0
      OR msg.video_url ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/'
      OR lower(btrim(msg.video_url)) LIKE 'http%'
    )
    AND public.account_deletion_parse_storage_object_path(
      'journey-private-media', msg.video_url
    ) IS NULL
  UNION ALL
  SELECT 'inbox_messages'::text, 'image_url'::text, msg.id
  FROM public.inbox_messages AS msg
  WHERE (msg.user_id = p_target_user_id OR msg.sender_user_id = p_target_user_id)
    AND msg.image_url IS NOT NULL
    AND btrim(msg.image_url) <> ''
    AND (
      position('journey-private-media/' IN msg.image_url) > 0
      OR msg.image_url ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/'
      OR lower(btrim(msg.image_url)) LIKE 'http%'
    )
    AND public.account_deletion_parse_storage_object_path(
      'journey-private-media', msg.image_url
    ) IS NULL;
END;
$$;

ALTER FUNCTION public.account_deletion_storage_manifest_unresolved_media_sources(uuid)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_storage_manifest_unresolved_media_sources(uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_deletion_storage_manifest_unresolved_media_sources(uuid)
  FROM authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_storage_manifest_unresolved_media_sources(uuid)
  FROM anon;
REVOKE ALL ON FUNCTION public.account_deletion_storage_manifest_unresolved_media_sources(uuid)
  FROM service_role;

-- ---------------------------------------------------------------------------
-- C3) Shared authoritative expected inventory (capture + gate)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.account_deletion_storage_manifest_expected_inventory(
  p_target_user_id uuid
)
RETURNS TABLE (
  bucket text,
  object_path text,
  media_category text,
  ownership_basis text,
  disposition text,
  disposition_reason text,
  preservation_required boolean,
  preservation_reason_code text,
  reference_state text,
  total_reference_count integer,
  surviving_reference_count integer,
  reference_fingerprint text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  evidence jsonb;
  object_exists boolean;
  path_owner text;
  ref_state text;
  disposition_v text;
  reason_v text;
  preserve_v boolean;
  preserve_code text;
  basis_v text;
  category_v text;
  rec record;
BEGIN
  IF p_target_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Profile avatar
  FOR rec IN
    SELECT public.account_deletion_parse_storage_object_path(
      'profile-avatars', profile_row.avatar_url
    ) AS parsed
    FROM public.profiles AS profile_row
    WHERE profile_row.id = p_target_user_id
      AND profile_row.avatar_url IS NOT NULL
      AND btrim(profile_row.avatar_url) <> ''
  LOOP
    IF rec.parsed IS NULL THEN
      CONTINUE; -- unresolved helper owns fail-closed
    END IF;
    bucket := 'profile-avatars';
    object_path := rec.parsed;
    media_category := 'profile_avatar';
    ownership_basis := 'profiles.avatar_url';
    disposition := 'DEFER_PROFILE';
    disposition_reason := 'profile avatar deferred until profile phase';
    preservation_required := false;
    preservation_reason_code := NULL;
    reference_state := 'unresolved';
    total_reference_count := 0;
    surviving_reference_count := 0;
    reference_fingerprint := NULL;
    RETURN NEXT;
  END LOOP;

  -- Stories (incl. Creator Studio via creation_mode)
  FOR rec IN
    SELECT
      'story-images'::text AS bkt,
      CASE
        WHEN story_row.creation_mode = 'creator-studio'::text THEN 'creator_studio_media'
        ELSE 'story_image'
      END AS cat,
      public.account_deletion_parse_storage_object_path(
        'story-images', story_row.image_url
      ) AS parsed,
      'stories.image_url'::text AS basis
    FROM public.stories AS story_row
    WHERE story_row.user_id = p_target_user_id
      AND story_row.image_url IS NOT NULL
      AND btrim(story_row.image_url) <> ''
    UNION ALL
    SELECT
      'story-videos',
      'story_video',
      public.account_deletion_parse_storage_object_path(
        'story-videos', story_row.video_url
      ),
      'stories.video_url'
    FROM public.stories AS story_row
    WHERE story_row.user_id = p_target_user_id
      AND story_row.video_url IS NOT NULL
      AND btrim(story_row.video_url) <> ''
    UNION ALL
    SELECT
      'story-thumbnails',
      'story_thumbnail',
      public.account_deletion_parse_storage_object_path(
        'story-thumbnails', story_row.thumbnail_url
      ),
      'stories.thumbnail_url'
    FROM public.stories AS story_row
    WHERE story_row.user_id = p_target_user_id
      AND story_row.thumbnail_url IS NOT NULL
      AND btrim(story_row.thumbnail_url) <> ''
  LOOP
    IF rec.parsed IS NULL THEN
      CONTINUE;
    END IF;
    bucket := rec.bkt;
    object_path := rec.parsed;
    IF split_part(rec.parsed, '/', 1)
         ~* '^(prayer-videos|prayer-video-replies|prayer-public-responses)$'
       OR rec.parsed ~* '^(prayer-videos|prayer-video-replies|prayer-public-responses)/' THEN
      media_category := 'journey_legacy_media';
      ownership_basis := rec.basis || '.legacy';
      disposition := 'PRESERVE_SHARED';
      disposition_reason := 'legacy public media preserved';
      preservation_required := true;
      preservation_reason_code := 'legacy_public_media';
      reference_state := 'shared';
      total_reference_count := 1;
      surviving_reference_count := 1;
      reference_fingerprint := NULL;
    ELSE
      media_category := rec.cat;
      ownership_basis := rec.basis;
      disposition := 'PRESERVE_PUBLIC';
      disposition_reason := 'public story media preserved';
      preservation_required := true;
      preservation_reason_code := 'public_content_preservation';
      reference_state := 'unresolved';
      total_reference_count := 0;
      surviving_reference_count := 0;
      reference_fingerprint := NULL;
    END IF;
    RETURN NEXT;
  END LOOP;

  -- Prayer video responses
  FOR rec IN
    SELECT
      'story-videos'::text AS bkt,
      'prayer_video'::text AS cat,
      public.account_deletion_parse_storage_object_path(
        'story-videos', prayer_row.video_url
      ) AS parsed,
      'prayer_video_responses.video_url'::text AS basis
    FROM public.prayer_video_responses AS prayer_row
    WHERE prayer_row.user_id = p_target_user_id
      AND prayer_row.video_url IS NOT NULL
      AND btrim(prayer_row.video_url) <> ''
    UNION ALL
    SELECT
      'story-thumbnails',
      'prayer_thumbnail',
      public.account_deletion_parse_storage_object_path(
        'story-thumbnails', prayer_row.thumbnail_url
      ),
      'prayer_video_responses.thumbnail_url'
    FROM public.prayer_video_responses AS prayer_row
    WHERE prayer_row.user_id = p_target_user_id
      AND prayer_row.thumbnail_url IS NOT NULL
      AND btrim(prayer_row.thumbnail_url) <> ''
  LOOP
    IF rec.parsed IS NULL THEN
      CONTINUE;
    END IF;
    bucket := rec.bkt;
    object_path := rec.parsed;
    media_category := rec.cat;
    ownership_basis := rec.basis;
    disposition := 'PRESERVE_PUBLIC';
    disposition_reason := 'public prayer media preserved';
    preservation_required := true;
    preservation_reason_code := 'public_content_preservation';
    reference_state := 'unresolved';
    total_reference_count := 0;
    surviving_reference_count := 0;
    reference_fingerprint := NULL;
    RETURN NEXT;
  END LOOP;

  -- Journey: inventory EACH media slot independently; dedupe by path
  FOR rec IN
    SELECT DISTINCT parsed_path
    FROM (
      SELECT public.account_deletion_parse_storage_object_path(
        'journey-private-media', msg.video_url
      ) AS parsed_path
      FROM public.inbox_messages AS msg
      WHERE (msg.user_id = p_target_user_id OR msg.sender_user_id = p_target_user_id)
        AND msg.video_url IS NOT NULL
        AND btrim(msg.video_url) <> ''
        AND (
          position('journey-private-media/' IN msg.video_url) > 0
          OR msg.video_url ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/'
        )
      UNION
      SELECT public.account_deletion_parse_storage_object_path(
        'journey-private-media', msg.image_url
      )
      FROM public.inbox_messages AS msg
      WHERE (msg.user_id = p_target_user_id OR msg.sender_user_id = p_target_user_id)
        AND msg.image_url IS NOT NULL
        AND btrim(msg.image_url) <> ''
        AND (
          position('journey-private-media/' IN msg.image_url) > 0
          OR msg.image_url ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/'
        )
    ) AS paths
    WHERE parsed_path IS NOT NULL
  LOOP
    evidence := public.account_deletion_journey_reference_evidence(
      p_target_user_id, rec.parsed_path
    );
    IF coalesce((evidence->>'ok')::boolean, false) = false THEN
      CONTINUE;
    END IF;

    path_owner := split_part(rec.parsed_path, '/', 1);
    ref_state := evidence->>'reference_state';
    object_exists := false;
    IF to_regclass('storage.objects') IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1
        FROM storage.objects AS obj
        WHERE obj.bucket_id = 'journey-private-media'::text
          AND obj.name = rec.parsed_path
      )
      INTO object_exists;
    END IF;

    IF path_owner IS DISTINCT FROM p_target_user_id::text THEN
      disposition_v := 'PRESERVE_SHARED';
      reason_v := 'foreign physical object preserved (target is not path owner)';
      preserve_v := true;
      preserve_code := 'shared_journey_media';
      basis_v := 'inbox_messages.foreign_uploader_path';
      category_v := 'journey_private_media';
      IF (evidence->>'surviving_reference_count')::integer > 0 THEN
        ref_state := 'shared';
      END IF;
    ELSIF ref_state = 'exclusive'::text
       AND (evidence->>'surviving_reference_count')::integer = 0
       AND (evidence->>'total_reference_count')::integer >= 1
       AND (evidence->>'target_owned_count')::integer >= 1
       AND object_exists THEN
      disposition_v := 'DELETE_PRIVATE';
      reason_v := 'exclusive journey object; zero surviving foreign refs; storage object exists';
      preserve_v := false;
      preserve_code := NULL;
      basis_v := 'inbox_messages.exclusive_target_owned';
      category_v := 'journey_private_media';
    ELSIF ref_state = 'shared'::text
       OR (evidence->>'surviving_reference_count')::integer > 0 THEN
      disposition_v := 'PRESERVE_SHARED';
      reason_v := 'surviving foreign inbox reference requires preserve';
      preserve_v := true;
      preserve_code := 'shared_journey_media';
      basis_v := 'inbox_messages.surviving_foreign_ref';
      category_v := 'journey_private_media';
      ref_state := 'shared';
    ELSIF ref_state = 'exclusive'::text AND NOT object_exists THEN
      disposition_v := 'BLOCK_UNRESOLVED';
      reason_v := 'exclusive journey refs lack exact storage.objects row';
      preserve_v := false;
      preserve_code := NULL;
      basis_v := 'inbox_messages.missing_storage_object';
      category_v := 'journey_private_media';
      ref_state := 'unresolved';
    ELSE
      disposition_v := 'BLOCK_UNRESOLVED';
      reason_v := 'journey reference state unresolved; refuse destructive authority';
      preserve_v := false;
      preserve_code := NULL;
      basis_v := 'inbox_messages.unresolved_refs';
      category_v := 'journey_private_media';
      ref_state := 'unresolved';
    END IF;

    bucket := 'journey-private-media';
    object_path := rec.parsed_path;
    media_category := category_v;
    ownership_basis := basis_v;
    disposition := disposition_v;
    disposition_reason := reason_v;
    preservation_required := preserve_v;
    preservation_reason_code := preserve_code;
    reference_state := ref_state;
    total_reference_count := (evidence->>'total_reference_count')::integer;
    surviving_reference_count := CASE
      WHEN disposition_v = 'DELETE_PRIVATE'::text THEN 0
      ELSE (evidence->>'surviving_reference_count')::integer
    END;
    reference_fingerprint := evidence->>'reference_fingerprint';
    RETURN NEXT;
  END LOOP;

  -- Target-prefix storage.objects completeness (exact first segment via 'uuid/%')
  IF to_regclass('storage.objects') IS NOT NULL THEN
    FOR rec IN
      SELECT
        obj.bucket_id AS bkt,
        obj.name AS path
      FROM storage.objects AS obj
      WHERE obj.bucket_id = ANY (
        ARRAY[
          'profile-avatars'::text,
          'story-images'::text,
          'story-thumbnails'::text,
          'story-videos'::text,
          'journey-private-media'::text
        ]
      )
      AND obj.name LIKE p_target_user_id::text || '/%'
      AND split_part(obj.name, '/', 1) = p_target_user_id::text
    LOOP
      -- Skip if already emitted for this bucket+path in this function call via
      -- a prior RETURN NEXT — callers/comparators use DISTINCT ON keys.
      -- Emit orphan BLOCK only when no DB-classified row would cover it;
      -- capture upserts ON CONFLICT so duplicate orphan+db is fine; gate
      -- compares DISTINCT keys. Prefer not double-emitting: check against
      -- whether a journey/story/etc already classified this key by probing
      -- whether any prior category would match — simplest: always emit and
      -- let capture ON CONFLICT prefer first write; for gate use DISTINCT.
      -- To avoid overwriting DELETE/PRESERVE with BLOCK on conflict, only
      -- emit orphans not already returned. Track via EXISTS on a subquery of
      -- the same derivation is hard mid-function; emit orphans with a check
      -- that no inbox/story/profile/prayer parse equals this path.
      IF EXISTS (
        SELECT 1
        FROM public.profiles AS profile_row
        WHERE profile_row.id = p_target_user_id
          AND public.account_deletion_parse_storage_object_path(
            'profile-avatars', coalesce(profile_row.avatar_url, '')
          ) = rec.path
          AND rec.bkt = 'profile-avatars'::text
      ) OR EXISTS (
        SELECT 1
        FROM public.stories AS story_row
        WHERE story_row.user_id = p_target_user_id
          AND (
            (
              rec.bkt = 'story-images'::text
              AND public.account_deletion_parse_storage_object_path(
                'story-images', coalesce(story_row.image_url, '')
              ) = rec.path
            )
            OR (
              rec.bkt = 'story-videos'::text
              AND public.account_deletion_parse_storage_object_path(
                'story-videos', coalesce(story_row.video_url, '')
              ) = rec.path
            )
            OR (
              rec.bkt = 'story-thumbnails'::text
              AND public.account_deletion_parse_storage_object_path(
                'story-thumbnails', coalesce(story_row.thumbnail_url, '')
              ) = rec.path
            )
          )
      ) OR EXISTS (
        SELECT 1
        FROM public.prayer_video_responses AS prayer_row
        WHERE prayer_row.user_id = p_target_user_id
          AND (
            (
              rec.bkt = 'story-videos'::text
              AND public.account_deletion_parse_storage_object_path(
                'story-videos', coalesce(prayer_row.video_url, '')
              ) = rec.path
            )
            OR (
              rec.bkt = 'story-thumbnails'::text
              AND public.account_deletion_parse_storage_object_path(
                'story-thumbnails', coalesce(prayer_row.thumbnail_url, '')
              ) = rec.path
            )
          )
      ) OR EXISTS (
        SELECT 1
        FROM public.inbox_messages AS msg
        WHERE (msg.user_id = p_target_user_id OR msg.sender_user_id = p_target_user_id)
          AND rec.bkt = 'journey-private-media'::text
          AND (
            public.account_deletion_parse_storage_object_path(
              'journey-private-media', coalesce(msg.video_url, '')
            ) = rec.path
            OR public.account_deletion_parse_storage_object_path(
              'journey-private-media', coalesce(msg.image_url, '')
            ) = rec.path
          )
      ) THEN
        CONTINUE;
      END IF;

      bucket := rec.bkt;
      object_path := rec.path;
      media_category := CASE
        WHEN rec.bkt = 'journey-private-media'::text THEN 'journey_private_media'
        ELSE 'unknown_legacy'
      END;
      ownership_basis := 'storage.objects.prefix_orphan';
      disposition := 'BLOCK_UNRESOLVED';
      disposition_reason := 'prefix object lacks authoritative DB reference inventory';
      preservation_required := false;
      preservation_reason_code := NULL;
      reference_state := 'unresolved';
      total_reference_count := 0;
      surviving_reference_count := 0;
      reference_fingerprint := NULL;
      RETURN NEXT;
    END LOOP;
  END IF;
END;
$$;

ALTER FUNCTION public.account_deletion_storage_manifest_expected_inventory(uuid)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_storage_manifest_expected_inventory(uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_deletion_storage_manifest_expected_inventory(uuid)
  FROM authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_storage_manifest_expected_inventory(uuid)
  FROM anon;
REVOKE ALL ON FUNCTION public.account_deletion_storage_manifest_expected_inventory(uuid)
  FROM service_role;

COMMENT ON FUNCTION public.account_deletion_storage_manifest_expected_inventory(uuid) IS
  'Postgres-only shared derivation of current authoritative storage inventory. '
  'Used by capture and 3B.1 gate. Never caller-executable. No manifest writes.';

-- ---------------------------------------------------------------------------
-- D) Internal authoritative writer (may mint DELETE_PRIVATE)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.account_deletion_storage_manifest_authoritative_write(
  p_request_id uuid,
  p_attempt_id uuid,
  p_target_user_id uuid,
  p_bucket text,
  p_object_path text,
  p_media_category text,
  p_ownership_basis text,
  p_disposition text,
  p_disposition_reason text,
  p_preservation_required boolean,
  p_preservation_reason_code text,
  p_reference_state text,
  p_total_reference_count integer,
  p_surviving_reference_count integer,
  p_reference_fingerprint text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  capture_status text;
  initial_status text;
  upserted_id uuid;
  object_exists boolean;
BEGIN
  IF p_disposition = 'DELETE_PRIVATE'::text THEN
    IF p_media_category <> 'journey_private_media'::text THEN
      RETURN jsonb_build_object('ok', false, 'code', 'delete_private_category_forbidden');
    END IF;
    IF p_bucket <> 'journey-private-media'::text THEN
      RETURN jsonb_build_object('ok', false, 'code', 'delete_private_bucket_forbidden');
    END IF;
    IF split_part(p_object_path, '/', 1) IS DISTINCT FROM p_target_user_id::text THEN
      RETURN jsonb_build_object('ok', false, 'code', 'delete_private_foreign_path');
    END IF;
    IF p_reference_state IS DISTINCT FROM 'exclusive'::text
       OR coalesce(p_surviving_reference_count, -1) <> 0
       OR coalesce(p_total_reference_count, 0) < 1
       OR p_reference_fingerprint IS NULL
       OR length(btrim(p_reference_fingerprint)) = 0
       OR coalesce(p_preservation_required, true) = true THEN
      RETURN jsonb_build_object('ok', false, 'code', 'delete_private_evidence_incomplete');
    END IF;
    object_exists := false;
    IF to_regclass('storage.objects') IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1
        FROM storage.objects AS obj
        WHERE obj.bucket_id = 'journey-private-media'::text
          AND obj.name = p_object_path
      )
      INTO object_exists;
    END IF;
    IF NOT object_exists THEN
      RETURN jsonb_build_object('ok', false, 'code', 'delete_private_missing_storage_object');
    END IF;
  END IF;

  IF NOT public.account_deletion_storage_manifest_validate_object_path(p_bucket, p_object_path) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_object_path');
  END IF;

  SELECT capture.status
  INTO capture_status
  FROM public.account_deletion_storage_manifest_capture AS capture
  WHERE capture.execution_attempt_id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'manifest_not_initialized');
  END IF;

  IF capture_status <> 'open'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'manifest_finalized');
  END IF;

  initial_status := public.account_deletion_storage_manifest_initial_status(p_disposition);
  IF initial_status IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_disposition');
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
    p_target_user_id,
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
    coalesce(nullif(btrim(p_reference_state), ''), 'unresolved'),
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

  UPDATE public.account_deletion_storage_manifest_capture AS capture
  SET
    object_count = (
      SELECT count(*)::integer
      FROM public.account_deletion_storage_manifest AS manifest_row
      WHERE manifest_row.execution_attempt_id = p_attempt_id
    ),
    updated_at = now()
  WHERE capture.execution_attempt_id = p_attempt_id
    AND capture.status = 'open'::text;

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'upserted',
    'id', upserted_id,
    'disposition', p_disposition
  );
END;
$$;

ALTER FUNCTION public.account_deletion_storage_manifest_authoritative_write(
  uuid, uuid, uuid, text, text, text, text, text, text, boolean, text, text, integer, integer, text
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_storage_manifest_authoritative_write(
  uuid, uuid, uuid, text, text, text, text, text, text, boolean, text, text, integer, integer, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_deletion_storage_manifest_authoritative_write(
  uuid, uuid, uuid, text, text, text, text, text, text, boolean, text, text, integer, integer, text
) FROM authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_storage_manifest_authoritative_write(
  uuid, uuid, uuid, text, text, text, text, text, text, boolean, text, text, integer, integer, text
) FROM anon;
REVOKE ALL ON FUNCTION public.account_deletion_storage_manifest_authoritative_write(
  uuid, uuid, uuid, text, text, text, text, text, text, boolean, text, text, integer, integer, text
) FROM service_role;

COMMENT ON FUNCTION public.account_deletion_storage_manifest_authoritative_write IS
  'Internal writer used only by capture RPC. May mint DELETE_PRIVATE from DB-proven evidence. '
  'Requires exact storage.objects row for DELETE_PRIVATE. Not executable by service_role.';

-- ---------------------------------------------------------------------------
-- E) Authoritative capture + finalize (consumes shared expected inventory)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.capture_account_deletion_storage_manifest(
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
  init_payload jsonb;
  finalize_payload jsonb;
  write_payload jsonb;
  blocked_count integer := 0;
  delete_count integer := 0;
  unresolved_count integer := 0;
  row_rec record;
  unresolved_rec record;
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

  PERFORM pg_advisory_xact_lock(
    public.hashtextextended('account_deletion:' || resolved_target::text, 0::bigint)
  );

  SELECT
    attempt_row.id,
    attempt_row.deletion_request_id,
    attempt_row.target_user_id,
    attempt_row.status,
    attempt_row.stage,
    attempt_row.storage_manifest_status,
    attempt_row.storage_manifest_fingerprint
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

  init_payload := public.initialize_account_deletion_storage_manifest(p_request_id, p_attempt_id);
  IF coalesce((init_payload->>'ok')::boolean, false) = false THEN
    RETURN init_payload;
  END IF;

  IF init_payload->>'code' = 'already_finalized'::text THEN
    RETURN jsonb_build_object(
      'ok', true,
      'code', 'already_finalized',
      'request_id', p_request_id,
      'attempt_id', p_attempt_id,
      'target_user_id', resolved_target,
      'fingerprint', init_payload->>'fingerprint',
      'object_count', (init_payload->>'object_count')::integer,
      'blocked_count', 0,
      'delete_private_count', 0,
      'has_block_unresolved', false
    );
  END IF;

  -- Fail closed on unparseable media — leave capture open / not finalized.
  SELECT count(*)::integer
  INTO unresolved_count
  FROM public.account_deletion_storage_manifest_unresolved_media_sources(resolved_target);

  IF unresolved_count > 0 THEN
    SELECT source_table, source_column, source_row_id
    INTO unresolved_rec
    FROM public.account_deletion_storage_manifest_unresolved_media_sources(resolved_target)
    LIMIT 1;

    RETURN jsonb_build_object(
      'ok', false,
      'code', 'storage_manifest_unresolved_media_reference',
      'request_id', p_request_id,
      'attempt_id', p_attempt_id,
      'target_user_id', resolved_target,
      'unresolved_count', unresolved_count,
      'source_table', unresolved_rec.source_table,
      'source_column', unresolved_rec.source_column,
      'source_row_id', unresolved_rec.source_row_id
    );
  END IF;

  FOR row_rec IN
    SELECT *
    FROM public.account_deletion_storage_manifest_expected_inventory(resolved_target)
  LOOP
    write_payload := public.account_deletion_storage_manifest_authoritative_write(
      p_request_id,
      p_attempt_id,
      resolved_target,
      row_rec.bucket,
      row_rec.object_path,
      row_rec.media_category,
      row_rec.ownership_basis,
      row_rec.disposition,
      row_rec.disposition_reason,
      row_rec.preservation_required,
      row_rec.preservation_reason_code,
      row_rec.reference_state,
      row_rec.total_reference_count,
      row_rec.surviving_reference_count,
      row_rec.reference_fingerprint
    );
    IF coalesce((write_payload->>'ok')::boolean, false) = false THEN
      RETURN write_payload;
    END IF;
  END LOOP;

  finalize_payload := public.finalize_account_deletion_storage_manifest(
    p_request_id, p_attempt_id
  );
  IF coalesce((finalize_payload->>'ok')::boolean, false) = false THEN
    RETURN finalize_payload;
  END IF;

  SELECT count(*)::integer
  INTO blocked_count
  FROM public.account_deletion_storage_manifest AS manifest_row
  WHERE manifest_row.execution_attempt_id = p_attempt_id
    AND manifest_row.disposition = 'BLOCK_UNRESOLVED'::text;

  SELECT count(*)::integer
  INTO delete_count
  FROM public.account_deletion_storage_manifest AS manifest_row
  WHERE manifest_row.execution_attempt_id = p_attempt_id
    AND manifest_row.disposition = 'DELETE_PRIVATE'::text;

  RETURN jsonb_build_object(
    'ok', true,
    'code', coalesce(finalize_payload->>'code', 'captured'),
    'request_id', p_request_id,
    'attempt_id', p_attempt_id,
    'target_user_id', resolved_target,
    'object_count', (finalize_payload->>'object_count')::integer,
    'fingerprint', finalize_payload->>'fingerprint',
    'blocked_count', blocked_count,
    'delete_private_count', delete_count,
    'has_block_unresolved', blocked_count > 0
  );
END;
$$;

ALTER FUNCTION public.capture_account_deletion_storage_manifest(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.capture_account_deletion_storage_manifest(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.capture_account_deletion_storage_manifest(uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.capture_account_deletion_storage_manifest(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.capture_account_deletion_storage_manifest(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.capture_account_deletion_storage_manifest(uuid, uuid) IS
  'Authoritative inventory-time capture via shared expected-inventory derivation. '
  'Fails closed on unparseable media. Only path that may mint DELETE_PRIVATE.';

-- ---------------------------------------------------------------------------
-- F) 3B.1 hard gate — full authoritative inventory recheck (no mutation)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.verify_account_deletion_storage_manifest_ready_for_3b1(
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
  computed_fingerprint text;
  object_count integer;
  blocked_count integer;
  unresolved_count integer;
  expected_count integer;
  mismatch_count integer;
BEGIN
  IF p_request_id IS NULL OR p_attempt_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_arguments');
  END IF;

  SELECT
    attempt_row.id,
    attempt_row.deletion_request_id,
    attempt_row.target_user_id,
    attempt_row.storage_manifest_status,
    attempt_row.storage_manifest_fingerprint,
    attempt_row.storage_objects_expected
  INTO att
  FROM public.account_deletion_execution_attempts AS attempt_row
  WHERE attempt_row.id = p_attempt_id;

  IF NOT FOUND OR att.deletion_request_id IS DISTINCT FROM p_request_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'storage_manifest_not_finalized');
  END IF;

  SELECT
    capture.execution_attempt_id,
    capture.deletion_request_id,
    capture.target_user_id,
    capture.status,
    capture.fingerprint,
    capture.object_count,
    capture.finalized_at
  INTO capture_row
  FROM public.account_deletion_storage_manifest_capture AS capture
  WHERE capture.execution_attempt_id = p_attempt_id;

  IF NOT FOUND OR capture_row.status IS DISTINCT FROM 'finalized'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'storage_manifest_not_finalized');
  END IF;

  IF att.storage_manifest_status IS DISTINCT FROM 'finalized'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'storage_manifest_not_finalized');
  END IF;

  IF capture_row.deletion_request_id IS DISTINCT FROM p_request_id
     OR capture_row.target_user_id IS DISTINCT FROM att.target_user_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'storage_manifest_state_drift');
  END IF;

  computed_fingerprint := public.compute_account_deletion_storage_manifest_fingerprint(
    p_attempt_id
  );

  SELECT count(*)::integer
  INTO object_count
  FROM public.account_deletion_storage_manifest AS manifest_row
  WHERE manifest_row.execution_attempt_id = p_attempt_id;

  IF capture_row.fingerprint IS DISTINCT FROM computed_fingerprint
     OR att.storage_manifest_fingerprint IS DISTINCT FROM capture_row.fingerprint
     OR capture_row.object_count IS DISTINCT FROM object_count
     OR att.storage_objects_expected IS DISTINCT FROM object_count THEN
    RETURN jsonb_build_object('ok', false, 'code', 'storage_manifest_integrity_failed');
  END IF;

  SELECT count(*)::integer
  INTO blocked_count
  FROM public.account_deletion_storage_manifest AS manifest_row
  WHERE manifest_row.execution_attempt_id = p_attempt_id
    AND manifest_row.disposition = 'BLOCK_UNRESOLVED'::text;

  IF blocked_count > 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'storage_manifest_blocked',
      'blocked_count', blocked_count
    );
  END IF;

  -- Fail if current DB has unparseable media that capture would refuse
  SELECT count(*)::integer
  INTO unresolved_count
  FROM public.account_deletion_storage_manifest_unresolved_media_sources(
    att.target_user_id
  );
  IF unresolved_count > 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'storage_manifest_state_drift',
      'detail', 'unresolved_media_appeared'
    );
  END IF;

  -- Full authoritative inventory re-derivation vs frozen manifest
  SELECT count(*)::integer
  INTO expected_count
  FROM (
    SELECT DISTINCT ON (inv.bucket, inv.object_path)
      inv.bucket,
      inv.object_path
    FROM public.account_deletion_storage_manifest_expected_inventory(
      att.target_user_id
    ) AS inv
    ORDER BY inv.bucket, inv.object_path
  ) AS expected_keys;

  IF expected_count IS DISTINCT FROM object_count THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'storage_manifest_state_drift',
      'detail', 'inventory_key_count_mismatch',
      'expected_count', expected_count,
      'frozen_count', object_count
    );
  END IF;

  SELECT count(*)::integer
  INTO mismatch_count
  FROM public.account_deletion_storage_manifest AS frozen
  WHERE frozen.execution_attempt_id = p_attempt_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.account_deletion_storage_manifest_expected_inventory(
        att.target_user_id
      ) AS inv
      WHERE inv.bucket = frozen.bucket
        AND inv.object_path = frozen.object_path
        AND inv.media_category = frozen.media_category
        AND inv.disposition = frozen.disposition
        AND inv.preservation_required IS NOT DISTINCT FROM frozen.preservation_required
        AND inv.reference_state IS NOT DISTINCT FROM frozen.reference_state
        AND inv.total_reference_count IS NOT DISTINCT FROM frozen.total_reference_count
        AND inv.surviving_reference_count
              IS NOT DISTINCT FROM frozen.surviving_reference_count
        AND inv.reference_fingerprint
              IS NOT DISTINCT FROM frozen.reference_fingerprint
    );

  IF mismatch_count > 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'storage_manifest_state_drift',
      'detail', 'frozen_vs_expected_mismatch',
      'mismatch_count', mismatch_count
    );
  END IF;

  SELECT count(*)::integer
  INTO mismatch_count
  FROM (
    SELECT DISTINCT ON (inv.bucket, inv.object_path)
      inv.bucket,
      inv.object_path,
      inv.media_category,
      inv.disposition,
      inv.preservation_required,
      inv.reference_state,
      inv.total_reference_count,
      inv.surviving_reference_count,
      inv.reference_fingerprint
    FROM public.account_deletion_storage_manifest_expected_inventory(
      att.target_user_id
    ) AS inv
    ORDER BY inv.bucket, inv.object_path
  ) AS expected
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.account_deletion_storage_manifest AS frozen
    WHERE frozen.execution_attempt_id = p_attempt_id
      AND frozen.bucket = expected.bucket
      AND frozen.object_path = expected.object_path
      AND frozen.media_category = expected.media_category
      AND frozen.disposition = expected.disposition
      AND frozen.preservation_required
            IS NOT DISTINCT FROM expected.preservation_required
      AND frozen.reference_state IS NOT DISTINCT FROM expected.reference_state
      AND frozen.total_reference_count
            IS NOT DISTINCT FROM expected.total_reference_count
      AND frozen.surviving_reference_count
            IS NOT DISTINCT FROM expected.surviving_reference_count
      AND frozen.reference_fingerprint
            IS NOT DISTINCT FROM expected.reference_fingerprint
  );

  IF mismatch_count > 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'storage_manifest_state_drift',
      'detail', 'expected_vs_frozen_mismatch',
      'mismatch_count', mismatch_count
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'manifest_ready_for_3b1',
    'fingerprint', capture_row.fingerprint,
    'object_count', object_count
  );
END;
$$;

ALTER FUNCTION public.verify_account_deletion_storage_manifest_ready_for_3b1(uuid, uuid)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.verify_account_deletion_storage_manifest_ready_for_3b1(uuid, uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_account_deletion_storage_manifest_ready_for_3b1(uuid, uuid)
  FROM authenticated;
REVOKE ALL ON FUNCTION public.verify_account_deletion_storage_manifest_ready_for_3b1(uuid, uuid)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.verify_account_deletion_storage_manifest_ready_for_3b1(uuid, uuid)
  TO service_role;

COMMENT ON FUNCTION public.verify_account_deletion_storage_manifest_ready_for_3b1(uuid, uuid) IS
  '3B.1 pre-mutation gate: finalized integrity + full expected-inventory recheck. '
  'Does not mutate identity, Storage, or the frozen manifest.';

-- Wrap 3B.1 so gate runs before any identity mutation.
DO $$
BEGIN
  IF to_regprocedure(
    'public.execute_account_deletion_nondestructive_database_stage_inner(uuid, uuid)'
  ) IS NULL THEN
    ALTER FUNCTION public.execute_account_deletion_nondestructive_database_stage(uuid, uuid)
      RENAME TO execute_account_deletion_nondestructive_database_stage_inner;
  END IF;
END;
$$;

-- CRITICAL: privileges survive RENAME — seal _inner immediately.
REVOKE ALL ON FUNCTION
  public.execute_account_deletion_nondestructive_database_stage_inner(uuid, uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION
  public.execute_account_deletion_nondestructive_database_stage_inner(uuid, uuid)
  FROM service_role;
REVOKE ALL ON FUNCTION
  public.execute_account_deletion_nondestructive_database_stage_inner(uuid, uuid)
  FROM authenticated;
REVOKE ALL ON FUNCTION
  public.execute_account_deletion_nondestructive_database_stage_inner(uuid, uuid)
  FROM anon;

CREATE OR REPLACE FUNCTION public.execute_account_deletion_nondestructive_database_stage(
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
  gate jsonb;
BEGIN
  -- Wrapper preserves readiness markers expected by
  -- verify_account_deletion_nondestructive_database_stage_ready():
  -- account_deletion_database_execution_context
  -- account_deletion_story_freeze_scope
  -- Identity mutations remain inside
  -- execute_account_deletion_nondestructive_database_stage_inner.
  --
  -- Allowed stage transitions for this wrapper:
  --   database_completed → inner only (idempotent; no new identity mutation)
  --   any other active pre-completed stage → gate THEN inner
  -- Gate is never skipped for active pre-database_completed calls.

  IF p_request_id IS NULL OR p_attempt_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_arguments');
  END IF;

  SELECT
    attempt_row.stage,
    attempt_row.status,
    attempt_row.deletion_request_id
  INTO att
  FROM public.account_deletion_execution_attempts AS attempt_row
  WHERE attempt_row.id = p_attempt_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'attempt_mismatch');
  END IF;

  -- Idempotent completed path: skip gate, delegate (no new mutations).
  IF att.stage = 'database_completed'::text THEN
    RETURN public.execute_account_deletion_nondestructive_database_stage_inner(
      p_request_id,
      p_attempt_id
    );
  END IF;

  -- Every active pre-database_completed path must pass the manifest gate.
  gate := public.verify_account_deletion_storage_manifest_ready_for_3b1(
    p_request_id,
    p_attempt_id
  );
  IF coalesce((gate->>'ok')::boolean, false) = false THEN
    RETURN gate;
  END IF;

  RETURN public.execute_account_deletion_nondestructive_database_stage_inner(
    p_request_id,
    p_attempt_id
  );
END;
$$;

ALTER FUNCTION public.execute_account_deletion_nondestructive_database_stage(uuid, uuid)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.execute_account_deletion_nondestructive_database_stage(uuid, uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.execute_account_deletion_nondestructive_database_stage(uuid, uuid)
  FROM authenticated;
REVOKE ALL ON FUNCTION public.execute_account_deletion_nondestructive_database_stage(uuid, uuid)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.execute_account_deletion_nondestructive_database_stage(uuid, uuid)
  TO service_role;

-- Re-seal _inner after CREATE OR REPLACE of wrapper (defensive).
REVOKE ALL ON FUNCTION
  public.execute_account_deletion_nondestructive_database_stage_inner(uuid, uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION
  public.execute_account_deletion_nondestructive_database_stage_inner(uuid, uuid)
  FROM service_role;
REVOKE ALL ON FUNCTION
  public.execute_account_deletion_nondestructive_database_stage_inner(uuid, uuid)
  FROM authenticated;
REVOKE ALL ON FUNCTION
  public.execute_account_deletion_nondestructive_database_stage_inner(uuid, uuid)
  FROM anon;

COMMENT ON FUNCTION public.execute_account_deletion_nondestructive_database_stage(uuid, uuid) IS
  '3B.1 nondestructive DB stage wrapped with full storage-manifest readiness gate. '
  'Inner executor is not caller-executable. Refuses before identity mutation on drift.';

COMMENT ON FUNCTION public.execute_account_deletion_nondestructive_database_stage_inner(uuid, uuid) IS
  'Internal 3B.1 identity-mutation executor. Postgres-owner only via wrapper. '
  'Not executable by PUBLIC/service_role/authenticated/anon.';

-- ---------------------------------------------------------------------------
-- G) Capture readiness + compose
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
  prerequisites := prerequisites || coalesce(foundation->'prerequisites', '[]'::jsonb);

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
  AND pg_catalog.has_function_privilege(
    'service_role',
    wrapper_oid,
    'EXECUTE'
  )
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

  RETURN jsonb_build_object(
    'ready', all_ready,
    'checked_at', to_jsonb(pg_catalog.now()),
    'prerequisites', prerequisites
  );
END;
$$;

ALTER FUNCTION public.verify_account_deletion_storage_manifest_capture_ready()
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.verify_account_deletion_storage_manifest_capture_ready()
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_account_deletion_storage_manifest_capture_ready()
  FROM authenticated;
REVOKE ALL ON FUNCTION public.verify_account_deletion_storage_manifest_capture_ready()
  FROM anon;
GRANT EXECUTE ON FUNCTION public.verify_account_deletion_storage_manifest_capture_ready()
  TO service_role;

DO $$
BEGIN
  IF to_regprocedure(
    'public.verify_account_deletion_schema_execution_ready_before_3b3b2()'
  ) IS NULL THEN
    ALTER FUNCTION public.verify_account_deletion_schema_execution_ready()
      RENAME TO verify_account_deletion_schema_execution_ready_before_3b3b2;
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
  capture jsonb;
  prerequisites jsonb;
  all_ready boolean;
BEGIN
  core := public.verify_account_deletion_schema_execution_ready_before_3b3b2();
  capture := public.verify_account_deletion_storage_manifest_capture_ready();

  prerequisites :=
    coalesce(core->'prerequisites', '[]'::jsonb)
    || coalesce(capture->'prerequisites', '[]'::jsonb);

  all_ready :=
    coalesce((core->>'ready')::boolean, false)
    AND coalesce((capture->>'ready')::boolean, false);

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
  'Live catalog probe including authoritative storage manifest capture + sealed 3B.1 gate. '
  'Does not enable execution or Storage deletion.';

COMMIT;
