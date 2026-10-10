-- Phase 4C.7B.1E.2C.3B.3E — storage adapter validation + readiness composition fix
-- No request processing, no Storage deletion, no hold/claim/authorize side effects.

BEGIN;

-- ---------------------------------------------------------------------------
-- A) Fix duplicate 3B.3C storage_execution block in full schema readiness
--    before_3b3d already composes storage_execution_foundation_ready (3B.3C).
-- ---------------------------------------------------------------------------

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
  prerequisites jsonb;
  all_ready boolean;
BEGIN
  core := public.verify_account_deletion_schema_execution_ready_before_3b3d();
  storage_executor := public.verify_account_deletion_storage_executor_ready();

  prerequisites :=
    coalesce(core->'prerequisites', '[]'::jsonb)
    || coalesce(storage_executor->'prerequisites', '[]'::jsonb);

  all_ready :=
    coalesce((core->>'ready')::boolean, false)
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
  'Live catalog probe: core + 3B.3C storage execution (via before_3b3d) + 3B.3D executor DB authority. '
  'Does not enable execution flags or perform Storage deletion.';

-- ---------------------------------------------------------------------------
-- B) Adapter-phase readiness (static / DB capability only — no external Storage)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.verify_account_deletion_storage_adapter_ready()
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
  full_schema jsonb;
  storage_execution_count integer;
BEGIN
  check_ok := coalesce((public.verify_account_deletion_storage_executor_ready()->>'ready')::boolean, false);
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'storage_executor_foundation_ready',
      'ready', check_ok,
      'detail', '3B.3D authorize/complete/commit and hold hardening remain ready'
    )
  );
  all_ready := all_ready AND check_ok;

  full_schema := public.verify_account_deletion_schema_execution_ready();
  SELECT count(*)::integer
  INTO storage_execution_count
  FROM jsonb_array_elements(coalesce(full_schema->'prerequisites', '[]'::jsonb)) AS elem
  WHERE elem->>'id' = 'storage_execution_tables_present';

  check_ok := storage_execution_count = 1;
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'schema_readiness_single_storage_execution_block',
      'ready', check_ok,
      'detail', 'full schema readiness includes exactly one storage_execution_tables_present prerequisite'
    )
  );
  all_ready := all_ready AND check_ok;

  check_ok := public.account_deletion_storage_destructive_bucket_allowed('journey-private-media'::text)
  AND NOT public.account_deletion_storage_destructive_bucket_allowed('profile-avatars'::text)
  AND NOT public.account_deletion_storage_destructive_bucket_allowed('story-images'::text)
  AND NOT public.account_deletion_storage_destructive_bucket_allowed('story-videos'::text)
  AND NOT public.account_deletion_storage_destructive_bucket_allowed('story-thumbnails'::text)
  AND NOT public.account_deletion_storage_destructive_bucket_allowed('unknown-bucket'::text);
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'destructive_bucket_allowlist_unchanged',
      'ready', check_ok,
      'detail', 'physical delete authority remains journey-private-media only'
    )
  );
  all_ready := all_ready AND check_ok;

  check_ok := coalesce((full_schema->>'ready')::boolean, false);
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'full_schema_execution_ready_composed',
      'ready', check_ok,
      'detail', 'verify_account_deletion_schema_execution_ready() composes without duplicate 3B.3C block'
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

ALTER FUNCTION public.verify_account_deletion_storage_adapter_ready() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.verify_account_deletion_storage_adapter_ready() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_account_deletion_storage_adapter_ready() FROM authenticated;
REVOKE ALL ON FUNCTION public.verify_account_deletion_storage_adapter_ready() FROM anon;
GRANT EXECUTE ON FUNCTION public.verify_account_deletion_storage_adapter_ready() TO service_role;

COMMENT ON FUNCTION public.verify_account_deletion_storage_adapter_ready() IS
  '3B.3E adapter-phase readiness: executor DB authority, single storage_execution composition, bucket allowlist. '
  'Does not probe external Supabase Storage connectivity or environment execution flags.';

COMMIT;
