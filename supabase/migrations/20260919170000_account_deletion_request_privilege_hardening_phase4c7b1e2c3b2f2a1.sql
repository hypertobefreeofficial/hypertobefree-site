-- Phase 4C.7B.1E.2C.3B.2F.2A.1 — Request-table privilege hardening
-- Grants/functions/readiness only. ZERO request-row DML. Does not call acquisition,
-- cancellation, or 3B.1. Does not change RLS or authenticated/anon table grants.
-- Does not enable HTBF_ACCOUNT_DELETION_EXECUTION_ENABLED.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.account_deletion_requests') IS NULL THEN
    RAISE EXCEPTION '2C.3B.2F.2A.1 precondition failed: account_deletion_requests missing';
  END IF;

  IF to_regprocedure('public.verify_account_deletion_schema_execution_ready()') IS NULL THEN
    RAISE EXCEPTION '2C.3B.2F.2A.1 precondition failed: verify_account_deletion_schema_execution_ready() missing';
  END IF;
END;
$$;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.account_deletion_requests
  FROM service_role;

GRANT SELECT
  ON TABLE public.account_deletion_requests
  TO service_role;

DO $$
BEGIN
  IF current_setting('server_version_num')::integer >= 170000 THEN
    EXECUTE 'REVOKE MAINTAIN ON TABLE public.account_deletion_requests FROM service_role';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- A) service_role request-table privilege probe (read-only catalog checks)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.verify_account_deletion_request_table_privileges_ready()
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
  privilege text;
  pg17_plus boolean;
BEGIN
  pg17_plus := current_setting('server_version_num')::integer >= 170000;
  check_ok := pg_catalog.has_table_privilege(
    'service_role',
    'public.account_deletion_requests',
    'SELECT'
  );
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'service_role_request_table_select',
      'ready', check_ok,
      'detail', 'service_role retains SELECT on account_deletion_requests'
    )
  );
  all_ready := all_ready AND check_ok;

  FOREACH privilege IN ARRAY ARRAY[
    'INSERT',
    'UPDATE',
    'DELETE',
    'TRUNCATE',
    'REFERENCES',
    'TRIGGER'
  ]
  LOOP
    check_ok := NOT pg_catalog.has_table_privilege(
      'service_role',
      'public.account_deletion_requests',
      privilege
    );
    prerequisites := prerequisites || jsonb_build_array(
      jsonb_build_object(
        'id', 'service_role_request_table_' || pg_catalog.lower(privilege) || '_revoked',
        'ready', check_ok,
        'detail', 'service_role must not hold ' || privilege || ' on account_deletion_requests'
      )
    );
    all_ready := all_ready AND check_ok;
  END LOOP;

  IF pg17_plus THEN
    check_ok := NOT pg_catalog.has_table_privilege(
      'service_role',
      'public.account_deletion_requests',
      'MAINTAIN'
    );
    prerequisites := prerequisites || jsonb_build_array(
      jsonb_build_object(
        'id', 'service_role_request_table_maintain_revoked',
        'ready', check_ok,
        'detail', 'service_role must not hold MAINTAIN on account_deletion_requests (PostgreSQL 17+)'
      )
    );
    all_ready := all_ready AND check_ok;
  ELSE
    prerequisites := prerequisites || jsonb_build_array(
      jsonb_build_object(
        'id', 'service_role_request_table_maintain_revoked',
        'ready', true,
        'detail', 'MAINTAIN privilege not applicable before PostgreSQL 17'
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

ALTER FUNCTION public.verify_account_deletion_request_table_privileges_ready() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.verify_account_deletion_request_table_privileges_ready() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_account_deletion_request_table_privileges_ready() FROM authenticated;
REVOKE ALL ON FUNCTION public.verify_account_deletion_request_table_privileges_ready() FROM anon;
GRANT EXECUTE ON FUNCTION public.verify_account_deletion_request_table_privileges_ready() TO service_role;

-- ---------------------------------------------------------------------------
-- B) Compose schema execution readiness with request-table privilege probe
-- ---------------------------------------------------------------------------

ALTER FUNCTION public.verify_account_deletion_schema_execution_ready()
  RENAME TO verify_account_deletion_schema_execution_ready_before_3b2f2a1;

CREATE OR REPLACE FUNCTION public.verify_account_deletion_schema_execution_ready()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  core jsonb;
  privilege_probe jsonb;
  prerequisites jsonb;
  all_ready boolean;
BEGIN
  core := public.verify_account_deletion_schema_execution_ready_before_3b2f2a1();
  privilege_probe := public.verify_account_deletion_request_table_privileges_ready();

  prerequisites :=
    coalesce(core->'prerequisites', '[]'::jsonb)
    || coalesce(privilege_probe->'prerequisites', '[]'::jsonb);

  all_ready :=
    coalesce((core->>'ready')::boolean, false)
    AND coalesce((privilege_probe->>'ready')::boolean, false);

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
  'Live catalog probe for account-deletion execution readiness including service_role '
  'SELECT-only posture on account_deletion_requests (including MAINTAIN revoked on PostgreSQL 17+). Composes '
  'verify_account_deletion_schema_execution_ready_before_3b2f2a1() with '
  'verify_account_deletion_request_table_privileges_ready(). Does not enable execution.';

COMMIT;
