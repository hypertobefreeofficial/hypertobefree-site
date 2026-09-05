-- Phase 4C.7B.1E.2B.3a: story_video_replies parent_reply_id FK preservation hardening
-- Local migration only — apply manually via Supabase Production SQL Editor.
-- NO DELETE / UPDATE / TRUNCATE / INSERT — DDL only.
--
-- Manual deployment does not update supabase_migrations.schema_migrations.
-- Validate using live catalog probe verify_account_deletion_schema_execution_ready().
--
-- story_video_replies.user_id / recipient_user_id / story_id FKs intentionally unchanged.
-- Reply HARD_DELETE executor policy remains scheduled for 2B.3c — this phase is schema-only.

BEGIN;

-- ---------------------------------------------------------------------------
-- Fail-closed precondition: verify expected Production baseline before DDL
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  parent_fk_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS rel
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'story_video_replies'
  ) THEN
    RAISE EXCEPTION '2B.3a precondition A failed: public.story_video_replies does not exist';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns AS c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'story_video_replies'
      AND c.column_name = 'parent_reply_id'
      AND c.is_nullable = 'YES'
  ) THEN
    RAISE EXCEPTION '2B.3a precondition B failed: parent_reply_id must be nullable';
  END IF;

  SELECT count(*) INTO parent_fk_count
  FROM pg_catalog.pg_constraint AS con
  JOIN pg_catalog.pg_class AS rel ON rel.oid = con.conrelid
  JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = rel.relnamespace
  JOIN pg_catalog.pg_attribute AS src_attr
    ON src_attr.attrelid = rel.oid AND src_attr.attnum = ANY (con.conkey)
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'story_video_replies'
    AND con.contype = 'f'
    AND src_attr.attname = 'parent_reply_id';

  IF parent_fk_count <> 1 THEN
    RAISE EXCEPTION '2B.3a precondition C/H failed: expected exactly one FK on parent_reply_id, found %', parent_fk_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS con
    JOIN pg_catalog.pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    JOIN pg_catalog.pg_class AS frel ON frel.oid = con.confrelid
    JOIN pg_catalog.pg_namespace AS fnsp ON fnsp.oid = frel.relnamespace
    JOIN pg_catalog.pg_attribute AS src_attr
      ON src_attr.attrelid = rel.oid AND src_attr.attnum = con.conkey[1]
    JOIN pg_catalog.pg_attribute AS dst_attr
      ON dst_attr.attrelid = frel.oid AND dst_attr.attnum = con.confkey[1]
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'story_video_replies'
      AND con.contype = 'f'
      AND con.conname = 'story_video_replies_parent_reply_id_fkey'
      AND cardinality(con.conkey) = 1
      AND cardinality(con.confkey) = 1
      AND src_attr.attname = 'parent_reply_id'
      AND fnsp.nspname = 'public'
      AND frel.relname = 'story_video_replies'
      AND dst_attr.attname = 'id'
      AND con.confdeltype = 'c'
      AND con.confupdtype = 'a'
  ) THEN
    RAISE EXCEPTION '2B.3a precondition D-G failed: story_video_replies_parent_reply_id_fkey must be single-column CASCADE to public.story_video_replies(id) with NO ACTION update';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- parent_reply_id — SET NULL self-FK so parent row delete cannot cascade descendants
-- ---------------------------------------------------------------------------
ALTER TABLE public.story_video_replies
  DROP CONSTRAINT story_video_replies_parent_reply_id_fkey;

ALTER TABLE public.story_video_replies
  ADD CONSTRAINT story_video_replies_parent_reply_id_fkey
  FOREIGN KEY (parent_reply_id)
  REFERENCES public.story_video_replies(id)
  ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Extend live catalog schema-readiness probe (preserves all prior checks)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.verify_account_deletion_schema_execution_ready()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  prerequisites jsonb := '[]'::jsonb;
  all_ready boolean := true;
  write_block_tables text[] := ARRAY[
    'stories',
    'profiles',
    'prayer_written_responses',
    'prayer_updates',
    'inbox_messages',
    'story_reactions',
    'story_video_replies',
    'saved_content',
    'prayer_follows',
    'prayer_search_preferences',
    'blocked_users',
    'content_reports',
    'account_deletion_requests',
    'prayer_video_responses'
  ];
  table_name text;
  policy_key text;
  check_ok boolean;
  missing_rls_policies text[] := ARRAY[]::text[];
  missing_rls_expression_policies text[] := ARRAY[]::text[];
BEGIN
  -- 1) stories.user_id nullable
  check_ok := coalesce((
    SELECT c.is_nullable = 'YES'
    FROM information_schema.columns AS c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'stories'
      AND c.column_name = 'user_id'
  ), false);
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'stories_user_id_nullable',
    'satisfied', check_ok,
    'detail', CASE
      WHEN check_ok THEN 'stories.user_id is nullable'
      ELSE 'stories.user_id must be nullable'
    END
  ));
  all_ready := all_ready AND check_ok;

  -- 1b) stories.user_id must not reference auth.users
  check_ok := NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS con
    JOIN pg_catalog.pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'stories'
      AND con.contype = 'f'
      AND pg_catalog.pg_get_constraintdef(con.oid) LIKE '%FOREIGN KEY (user_id)%auth.users%'
  );
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'stories_user_id_no_auth_fk',
    'satisfied', check_ok,
    'detail', CASE
      WHEN check_ok THEN 'stories.user_id has no auth.users FK'
      ELSE 'stories.user_id must not reference auth.users'
    END
  ));
  all_ready := all_ready AND check_ok;

  -- 2) prayer_video_responses.user_id nullable + SET NULL FK
  check_ok := coalesce((
    SELECT c.is_nullable = 'YES'
    FROM information_schema.columns AS c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'prayer_video_responses'
      AND c.column_name = 'user_id'
  ), false) AND EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS con
    JOIN pg_catalog.pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'prayer_video_responses'
      AND con.conname = 'prayer_video_responses_user_id_fkey'
      AND con.confdeltype = 'n'
  );
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'prayer_video_responses_user_id_set_null',
    'satisfied', check_ok,
    'detail', 'prayer_video_responses.user_id nullable with ON DELETE SET NULL FK'
  ));
  all_ready := all_ready AND check_ok;

  -- 3) prayer_written_responses.author_user_id nullable + SET NULL FK
  check_ok := coalesce((
    SELECT c.is_nullable = 'YES'
    FROM information_schema.columns AS c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'prayer_written_responses'
      AND c.column_name = 'author_user_id'
  ), false) AND EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS con
    JOIN pg_catalog.pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'prayer_written_responses'
      AND con.conname = 'prayer_written_responses_author_user_id_fkey'
      AND con.confdeltype = 'n'
  );
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'prayer_written_responses_author_set_null',
    'satisfied', check_ok,
    'detail', 'prayer_written_responses.author_user_id nullable with ON DELETE SET NULL FK'
  ));
  all_ready := all_ready AND check_ok;

  -- 4) prayer_updates.author_user_id nullable + SET NULL FK
  check_ok := coalesce((
    SELECT c.is_nullable = 'YES'
    FROM information_schema.columns AS c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'prayer_updates'
      AND c.column_name = 'author_user_id'
  ), false) AND EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS con
    JOIN pg_catalog.pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'prayer_updates'
      AND con.conname = 'prayer_updates_author_user_id_fkey'
      AND con.confdeltype = 'n'
  );
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'prayer_updates_author_set_null',
    'satisfied', check_ok,
    'detail', 'prayer_updates.author_user_id nullable with ON DELETE SET NULL FK'
  ));
  all_ready := all_ready AND check_ok;

  -- 5) inbox_messages.prayer_update_id SET NULL FK
  check_ok := EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS con
    JOIN pg_catalog.pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'inbox_messages'
      AND con.conname = 'inbox_messages_prayer_update_id_fkey'
      AND con.confdeltype = 'n'
  );
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'inbox_messages_prayer_update_id_set_null',
    'satisfied', check_ok,
    'detail', 'inbox_messages.prayer_update_id FK uses ON DELETE SET NULL'
  ));
  all_ready := all_ready AND check_ok;

  -- 6) content_reports.story_id SET NULL FK
  check_ok := EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS con
    JOIN pg_catalog.pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'content_reports'
      AND con.conname = 'content_reports_story_id_fkey'
      AND con.confdeltype = 'n'
  );
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'content_reports_story_id_set_null',
    'satisfied', check_ok,
    'detail', 'content_reports.story_id FK uses ON DELETE SET NULL'
  ));
  all_ready := all_ready AND check_ok;

  -- 6a) story_video_replies.user_id nullable + SET NULL auth FK (catalog-aligned)
  check_ok := coalesce((
    SELECT c.is_nullable = 'YES'
    FROM information_schema.columns AS c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'story_video_replies'
      AND c.column_name = 'user_id'
  ), false) AND EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS con
    JOIN pg_catalog.pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    JOIN pg_catalog.pg_class AS frel ON frel.oid = con.confrelid
    JOIN pg_catalog.pg_namespace AS fnsp ON fnsp.oid = frel.relnamespace
    JOIN pg_catalog.pg_attribute AS src_attr
      ON src_attr.attrelid = rel.oid AND src_attr.attnum = con.conkey[1]
    JOIN pg_catalog.pg_attribute AS dst_attr
      ON dst_attr.attrelid = frel.oid AND dst_attr.attnum = con.confkey[1]
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'story_video_replies'
      AND con.contype = 'f'
      AND cardinality(con.conkey) = 1
      AND cardinality(con.confkey) = 1
      AND src_attr.attname = 'user_id'
      AND fnsp.nspname = 'auth'
      AND frel.relname = 'users'
      AND dst_attr.attname = 'id'
      AND con.confdeltype = 'n'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS con
    JOIN pg_catalog.pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    JOIN pg_catalog.pg_attribute AS src_attr
      ON src_attr.attrelid = rel.oid AND src_attr.attnum = ANY (con.conkey)
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'story_video_replies'
      AND con.contype = 'f'
      AND src_attr.attname = 'user_id'
      AND con.confdeltype = 'c'
  );
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'story_video_replies_user_id_set_null',
    'satisfied', check_ok,
    'detail', 'story_video_replies.user_id nullable with catalog-verified ON DELETE SET NULL auth.users(id) FK'
  ));
  all_ready := all_ready AND check_ok;

  -- 6b) story_video_replies.recipient_user_id nullable + SET NULL auth FK (catalog-aligned)
  check_ok := coalesce((
    SELECT c.is_nullable = 'YES'
    FROM information_schema.columns AS c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'story_video_replies'
      AND c.column_name = 'recipient_user_id'
  ), false) AND EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS con
    JOIN pg_catalog.pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    JOIN pg_catalog.pg_class AS frel ON frel.oid = con.confrelid
    JOIN pg_catalog.pg_namespace AS fnsp ON fnsp.oid = frel.relnamespace
    JOIN pg_catalog.pg_attribute AS src_attr
      ON src_attr.attrelid = rel.oid AND src_attr.attnum = con.conkey[1]
    JOIN pg_catalog.pg_attribute AS dst_attr
      ON dst_attr.attrelid = frel.oid AND dst_attr.attnum = con.confkey[1]
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'story_video_replies'
      AND con.contype = 'f'
      AND cardinality(con.conkey) = 1
      AND cardinality(con.confkey) = 1
      AND src_attr.attname = 'recipient_user_id'
      AND fnsp.nspname = 'auth'
      AND frel.relname = 'users'
      AND dst_attr.attname = 'id'
      AND con.confdeltype = 'n'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS con
    JOIN pg_catalog.pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    JOIN pg_catalog.pg_attribute AS src_attr
      ON src_attr.attrelid = rel.oid AND src_attr.attnum = ANY (con.conkey)
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'story_video_replies'
      AND con.contype = 'f'
      AND src_attr.attname = 'recipient_user_id'
      AND con.confdeltype = 'c'
  );
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'story_video_replies_recipient_user_id_set_null',
    'satisfied', check_ok,
    'detail', 'story_video_replies.recipient_user_id nullable with catalog-verified ON DELETE SET NULL auth.users(id) FK'
  ));
  all_ready := all_ready AND check_ok;

  -- 6c) story_video_replies.parent_reply_id nullable + SET NULL self FK (catalog-aligned)
  check_ok := coalesce((
    SELECT c.is_nullable = 'YES'
    FROM information_schema.columns AS c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'story_video_replies'
      AND c.column_name = 'parent_reply_id'
  ), false) AND EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS con
    JOIN pg_catalog.pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    JOIN pg_catalog.pg_class AS frel ON frel.oid = con.confrelid
    JOIN pg_catalog.pg_namespace AS fnsp ON fnsp.oid = frel.relnamespace
    JOIN pg_catalog.pg_attribute AS src_attr
      ON src_attr.attrelid = rel.oid AND src_attr.attnum = con.conkey[1]
    JOIN pg_catalog.pg_attribute AS dst_attr
      ON dst_attr.attrelid = frel.oid AND dst_attr.attnum = con.confkey[1]
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'story_video_replies'
      AND con.contype = 'f'
      AND cardinality(con.conkey) = 1
      AND cardinality(con.confkey) = 1
      AND src_attr.attname = 'parent_reply_id'
      AND fnsp.nspname = 'public'
      AND frel.relname = 'story_video_replies'
      AND dst_attr.attname = 'id'
      AND con.confdeltype = 'n'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS con
    JOIN pg_catalog.pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    JOIN pg_catalog.pg_attribute AS src_attr
      ON src_attr.attrelid = rel.oid AND src_attr.attnum = ANY (con.conkey)
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'story_video_replies'
      AND con.contype = 'f'
      AND src_attr.attname = 'parent_reply_id'
      AND con.confdeltype = 'c'
  ) AND (
    SELECT count(*)
    FROM pg_catalog.pg_constraint AS con
    JOIN pg_catalog.pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    JOIN pg_catalog.pg_attribute AS src_attr
      ON src_attr.attrelid = rel.oid AND src_attr.attnum = ANY (con.conkey)
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'story_video_replies'
      AND con.contype = 'f'
      AND src_attr.attname = 'parent_reply_id'
  ) = 1;
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'story_video_replies_parent_reply_id_set_null',
    'satisfied', check_ok,
    'detail', 'story_video_replies.parent_reply_id nullable with catalog-verified ON DELETE SET NULL self-FK to story_video_replies(id)'
  ));
  all_ready := all_ready AND check_ok;

  -- 7) write-freeze helper exists with expected security properties
  check_ok := EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS proc
    JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = proc.pronamespace
    WHERE nsp.nspname = 'public'
      AND proc.proname = 'current_user_account_write_blocked'
      AND pg_catalog.pg_get_function_identity_arguments(proc.oid) = ''
      AND pg_catalog.format_type(proc.prorettype, NULL) = 'boolean'
      AND proc.prosecdef = true
      AND proc.provolatile = 's'
      AND EXISTS (
        SELECT 1
        FROM unnest(coalesce(proc.proconfig, ARRAY[]::text[])) AS cfg
        WHERE cfg LIKE 'search_path=%'
      )
  );
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'current_user_account_write_blocked_present',
    'satisfied', check_ok,
    'detail', 'public.current_user_account_write_blocked() exists as STABLE SECURITY DEFINER boolean helper with search_path set'
  ));
  all_ready := all_ready AND check_ok;

  -- 8) RESTRICTIVE command-specific write-freeze RLS on required public tables
  FOREACH table_name IN ARRAY write_block_tables
  LOOP
    policy_key := table_name || ':insert';
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policies AS pol
      WHERE pol.schemaname = 'public'
        AND pol.tablename = table_name
        AND pol.policyname = 'account_deletion_write_block_insert'
        AND pol.permissive = 'RESTRICTIVE'
        AND pol.cmd = 'INSERT'
    ) THEN
      missing_rls_policies := array_append(missing_rls_policies, policy_key);
    ELSIF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policies AS pol
      WHERE pol.schemaname = 'public'
        AND pol.tablename = table_name
        AND pol.policyname = 'account_deletion_write_block_insert'
        AND pol.permissive = 'RESTRICTIVE'
        AND pol.cmd = 'INSERT'
        AND coalesce(pol.with_check, '') ILIKE '%current_user_account_write_blocked%'
    ) THEN
      missing_rls_expression_policies := array_append(missing_rls_expression_policies, policy_key);
    END IF;

    policy_key := table_name || ':update';
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policies AS pol
      WHERE pol.schemaname = 'public'
        AND pol.tablename = table_name
        AND pol.policyname = 'account_deletion_write_block_update'
        AND pol.permissive = 'RESTRICTIVE'
        AND pol.cmd = 'UPDATE'
    ) THEN
      missing_rls_policies := array_append(missing_rls_policies, policy_key);
    ELSIF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policies AS pol
      WHERE pol.schemaname = 'public'
        AND pol.tablename = table_name
        AND pol.policyname = 'account_deletion_write_block_update'
        AND pol.permissive = 'RESTRICTIVE'
        AND pol.cmd = 'UPDATE'
        AND coalesce(pol.qual, '') ILIKE '%current_user_account_write_blocked%'
        AND coalesce(pol.with_check, '') ILIKE '%current_user_account_write_blocked%'
    ) THEN
      missing_rls_expression_policies := array_append(missing_rls_expression_policies, policy_key);
    END IF;

    policy_key := table_name || ':delete';
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policies AS pol
      WHERE pol.schemaname = 'public'
        AND pol.tablename = table_name
        AND pol.policyname = 'account_deletion_write_block_delete'
        AND pol.permissive = 'RESTRICTIVE'
        AND pol.cmd = 'DELETE'
    ) THEN
      missing_rls_policies := array_append(missing_rls_policies, policy_key);
    ELSIF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policies AS pol
      WHERE pol.schemaname = 'public'
        AND pol.tablename = table_name
        AND pol.policyname = 'account_deletion_write_block_delete'
        AND pol.permissive = 'RESTRICTIVE'
        AND pol.cmd = 'DELETE'
        AND coalesce(pol.qual, '') ILIKE '%current_user_account_write_blocked%'
    ) THEN
      missing_rls_expression_policies := array_append(missing_rls_expression_policies, policy_key);
    END IF;
  END LOOP;

  check_ok := cardinality(missing_rls_policies) = 0
    AND cardinality(missing_rls_expression_policies) = 0;
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'write_freeze_public_rls_present',
    'satisfied', check_ok,
    'detail', CASE
      WHEN check_ok THEN
        'RESTRICTIVE account_deletion_write_block_insert/update/delete policies reference current_user_account_write_blocked on required public tables'
      WHEN cardinality(missing_rls_policies) > 0 THEN
        'Missing write-freeze RLS policies: ' || array_to_string(missing_rls_policies, ', ')
      ELSE
        'Write-freeze RLS present but missing helper expression on: '
          || array_to_string(missing_rls_expression_policies, ', ')
    END
  ));
  all_ready := all_ready AND check_ok;

  -- 9) Storage command-specific write-freeze RLS with helper expression
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies AS pol
    WHERE pol.schemaname = 'storage'
      AND pol.tablename = 'objects'
      AND pol.policyname = 'account_deletion_storage_write_block_insert'
      AND pol.permissive = 'RESTRICTIVE'
      AND pol.cmd = 'INSERT'
  ) THEN
    missing_rls_policies := array_append(missing_rls_policies, 'storage.objects:insert');
  ELSIF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies AS pol
    WHERE pol.schemaname = 'storage'
      AND pol.tablename = 'objects'
      AND pol.policyname = 'account_deletion_storage_write_block_insert'
      AND pol.permissive = 'RESTRICTIVE'
      AND pol.cmd = 'INSERT'
      AND coalesce(pol.with_check, '') ILIKE '%current_user_account_write_blocked%'
  ) THEN
    missing_rls_expression_policies := array_append(
      missing_rls_expression_policies,
      'storage.objects:insert'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies AS pol
    WHERE pol.schemaname = 'storage'
      AND pol.tablename = 'objects'
      AND pol.policyname = 'account_deletion_storage_write_block_update'
      AND pol.permissive = 'RESTRICTIVE'
      AND pol.cmd = 'UPDATE'
  ) THEN
    missing_rls_policies := array_append(missing_rls_policies, 'storage.objects:update');
  ELSIF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies AS pol
    WHERE pol.schemaname = 'storage'
      AND pol.tablename = 'objects'
      AND pol.policyname = 'account_deletion_storage_write_block_update'
      AND pol.permissive = 'RESTRICTIVE'
      AND pol.cmd = 'UPDATE'
      AND coalesce(pol.qual, '') ILIKE '%current_user_account_write_blocked%'
      AND coalesce(pol.with_check, '') ILIKE '%current_user_account_write_blocked%'
  ) THEN
    missing_rls_expression_policies := array_append(
      missing_rls_expression_policies,
      'storage.objects:update'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies AS pol
    WHERE pol.schemaname = 'storage'
      AND pol.tablename = 'objects'
      AND pol.policyname = 'account_deletion_storage_write_block_delete'
      AND pol.permissive = 'RESTRICTIVE'
      AND pol.cmd = 'DELETE'
  ) THEN
    missing_rls_policies := array_append(missing_rls_policies, 'storage.objects:delete');
  ELSIF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies AS pol
    WHERE pol.schemaname = 'storage'
      AND pol.tablename = 'objects'
      AND pol.policyname = 'account_deletion_storage_write_block_delete'
      AND pol.permissive = 'RESTRICTIVE'
      AND pol.cmd = 'DELETE'
      AND coalesce(pol.qual, '') ILIKE '%current_user_account_write_blocked%'
  ) THEN
    missing_rls_expression_policies := array_append(
      missing_rls_expression_policies,
      'storage.objects:delete'
    );
  END IF;

  check_ok := NOT (
    'storage.objects:insert' = ANY(missing_rls_policies)
    OR 'storage.objects:update' = ANY(missing_rls_policies)
    OR 'storage.objects:delete' = ANY(missing_rls_policies)
    OR 'storage.objects:insert' = ANY(missing_rls_expression_policies)
    OR 'storage.objects:update' = ANY(missing_rls_expression_policies)
    OR 'storage.objects:delete' = ANY(missing_rls_expression_policies)
  );
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'write_freeze_storage_rls_present',
    'satisfied', check_ok,
    'detail', CASE
      WHEN check_ok THEN
        'RESTRICTIVE account_deletion_storage_write_block_insert/update/delete reference current_user_account_write_blocked on storage.objects'
      WHEN 'storage.objects:insert' = ANY(missing_rls_policies)
        OR 'storage.objects:update' = ANY(missing_rls_policies)
        OR 'storage.objects:delete' = ANY(missing_rls_policies) THEN
        'Missing write-freeze storage RLS policies on storage.objects'
      ELSE
        'Write-freeze storage RLS present but missing helper expression on storage.objects'
    END
  ));
  all_ready := all_ready AND check_ok;

  RETURN jsonb_build_object(
    'ready', all_ready,
    'checked_at', to_jsonb(now()),
    'prerequisites', prerequisites
  );
END;
$$;;

ALTER FUNCTION public.verify_account_deletion_schema_execution_ready() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.verify_account_deletion_schema_execution_ready() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_account_deletion_schema_execution_ready() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.verify_account_deletion_schema_execution_ready() TO service_role;

COMMENT ON FUNCTION public.verify_account_deletion_schema_execution_ready() IS
  'Read-only live catalog probe for account-deletion schema + write-freeze foundation readiness. '
  'Includes story_video_replies auth-user FK SET NULL (Phase 4C.7B.1E.2B.2) and parent_reply_id SET NULL (Phase 4C.7B.1E.2B.3a). '
  'Does not consult supabase_migrations.schema_migrations. Fail-closed. '
  'EXECUTE restricted to service_role for server-side readiness verification only.';

COMMIT;
