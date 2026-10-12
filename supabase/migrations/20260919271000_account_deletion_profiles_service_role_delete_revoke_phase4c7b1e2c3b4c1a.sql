-- Phase 4C.7B.1E.2C.3B.4C.1a — Revoke service_role direct DELETE on public.profiles.
-- Profile-shell removal remains via finalize_account_deletion_profile_stage (SECURITY DEFINER).
-- ZERO profile-row DML. ZERO Auth DML. Does not enable execution.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION '3B.4C.1a precondition failed: public.profiles missing';
  END IF;

  IF to_regprocedure('public.finalize_account_deletion_profile_stage(uuid, uuid)') IS NULL THEN
    RAISE EXCEPTION '3B.4C.1a precondition failed: finalize_account_deletion_profile_stage missing';
  END IF;

  IF to_regprocedure('public.verify_account_deletion_profile_completion_ready()') IS NULL THEN
    RAISE EXCEPTION '3B.4C.1a precondition failed: verify_account_deletion_profile_completion_ready missing';
  END IF;

  IF to_regprocedure('public.verify_account_deletion_schema_execution_ready()') IS NULL THEN
    RAISE EXCEPTION '3B.4C.1a precondition failed: verify_account_deletion_schema_execution_ready missing';
  END IF;
END;
$$;

REVOKE DELETE ON TABLE public.profiles FROM service_role;

COMMIT;
