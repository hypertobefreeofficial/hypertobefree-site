-- Phase 4C.7B.1B: Account deletion lifecycle + audit retention
-- Local migration only — do not apply to Production automatically.
--
-- Rollout note (zero-downtime):
--   1) Apply THIS migration before deploying the 4C.7B.1B application code.
--   2) Transitional CHECK intentionally retains legacy status "completed" so the
--      prior Production admin bundle can still call Mark Completed during overlap.
--   3) After Production is fully on the new code, run a follow-up cleanup migration
--      to DROP "completed" from the CHECK list (optional; not included here).

BEGIN;

-- 1) Preserve historical truth for legacy administrative closures.
UPDATE public.account_deletion_requests
SET status = 'legacy_completed'
WHERE status = 'completed';

-- 2) Lifecycle / audit columns for future execution.
ALTER TABLE public.account_deletion_requests
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS execution_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS execution_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS failure_code text,
  ADD COLUMN IF NOT EXISTS failure_metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS target_user_id_snapshot uuid,
  ADD COLUMN IF NOT EXISTS target_username_snapshot text;

-- 3) Minimal identity snapshot for audit after auth deletion.
UPDATE public.account_deletion_requests
SET target_user_id_snapshot = user_id
WHERE target_user_id_snapshot IS NULL
  AND user_id IS NOT NULL;

-- 4) Retain request history when auth.users row is eventually deleted.
ALTER TABLE public.account_deletion_requests
  DROP CONSTRAINT IF EXISTS account_deletion_requests_user_id_fkey;

ALTER TABLE public.account_deletion_requests
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.account_deletion_requests
  ADD CONSTRAINT account_deletion_requests_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.account_deletion_requests
  DROP CONSTRAINT IF EXISTS account_deletion_requests_approved_by_fkey;

ALTER TABLE public.account_deletion_requests
  ADD CONSTRAINT account_deletion_requests_approved_by_fkey
  FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 5) Transitional lifecycle statuses.
--    "completed" remains temporarily so pre-4C.7B.1B Production admin code can
--    still close requests during the deploy overlap window.
ALTER TABLE public.account_deletion_requests
  DROP CONSTRAINT IF EXISTS account_deletion_requests_status_check;

ALTER TABLE public.account_deletion_requests
  ADD CONSTRAINT account_deletion_requests_status_check
  CHECK (
    status = ANY (
      ARRAY[
        'submitted'::text,
        'reviewing'::text,
        'approved'::text,
        'deletion_in_progress'::text,
        'deleted'::text,
        'failed'::text,
        'rejected'::text,
        'cancelled'::text,
        'legacy_completed'::text,
        'completed'::text
      ]
    )
  );

-- 6) Admin authorization consistency — use current_user_is_admin().
DROP POLICY IF EXISTS "Admin can manage deletion requests" ON public.account_deletion_requests;

CREATE POLICY "Admins can manage deletion requests"
  ON public.account_deletion_requests
  TO authenticated
  USING (public.current_user_is_admin() = true)
  WITH CHECK (public.current_user_is_admin() = true);

-- 7) User cancellation while request is still open for review.
DROP POLICY IF EXISTS "Users can cancel their own deletion request" ON public.account_deletion_requests;

CREATE POLICY "Users can cancel their own deletion request"
  ON public.account_deletion_requests
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    AND status = ANY (ARRAY['submitted'::text, 'reviewing'::text])
  )
  WITH CHECK (
    auth.uid() = user_id
    AND status = 'cancelled'::text
  );

-- 8) Fail-closed: user cancellation may only flip status/cancelled_at.
CREATE OR REPLACE FUNCTION public.enforce_account_deletion_user_cancellation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF public.current_user_is_admin() = true THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.user_id IS NOT NULL
     AND OLD.user_id = auth.uid()
     AND OLD.status = ANY (ARRAY['submitted'::text, 'reviewing'::text])
     AND NEW.status = 'cancelled'::text THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.email IS DISTINCT FROM OLD.email
       OR NEW.reason IS DISTINCT FROM OLD.reason
       OR NEW.admin_notes IS DISTINCT FROM OLD.admin_notes
       OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
       OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
       OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
       OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
       OR NEW.execution_started_at IS DISTINCT FROM OLD.execution_started_at
       OR NEW.execution_completed_at IS DISTINCT FROM OLD.execution_completed_at
       OR NEW.failure_code IS DISTINCT FROM OLD.failure_code
       OR NEW.failure_metadata IS DISTINCT FROM OLD.failure_metadata
       OR NEW.rejected_at IS DISTINCT FROM OLD.rejected_at
       OR NEW.target_user_id_snapshot IS DISTINCT FROM OLD.target_user_id_snapshot
       OR NEW.target_username_snapshot IS DISTINCT FROM OLD.target_username_snapshot
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'account_deletion_requests user cancellation may only set status and cancelled_at'
        USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS account_deletion_requests_user_cancellation_guard
  ON public.account_deletion_requests;

CREATE TRIGGER account_deletion_requests_user_cancellation_guard
  BEFORE UPDATE ON public.account_deletion_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_account_deletion_user_cancellation();

COMMIT;
