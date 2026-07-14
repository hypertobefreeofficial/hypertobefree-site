-- HTBF Prayer — security hardening (audit-field protection)
-- Additive + idempotent. Apply manually in Supabase SQL editor.
--
-- Prevents authenticated users from tampering with server-managed audit columns
-- on prayer_video_responses. Service-role API routes (auth.uid() IS NULL) are
-- unaffected.

BEGIN;

CREATE OR REPLACE FUNCTION public.protect_prayer_video_response_audit_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  -- Service-role / backend updates have no end-user JWT subject.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.removed_at IS DISTINCT FROM OLD.removed_at
       OR NEW.removed_by_user_id IS DISTINCT FROM OLD.removed_by_user_id
       OR NEW.removal_source IS DISTINCT FROM OLD.removal_source
       OR NEW.removal_reason IS DISTINCT FROM OLD.removal_reason
       OR NEW.duration_verification_status IS DISTINCT FROM OLD.duration_verification_status
       OR NEW.duration_seconds IS DISTINCT FROM OLD.duration_seconds
       OR NEW.duration_verified_at IS DISTINCT FROM OLD.duration_verified_at
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.moderated_at IS DISTINCT FROM OLD.moderated_at
       OR NEW.moderated_by IS DISTINCT FROM OLD.moderated_by THEN
      RAISE EXCEPTION
        'prayer_video_responses audit and moderation fields are server-managed';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prayer_video_responses_protect_audit_fields
  ON public.prayer_video_responses;

CREATE TRIGGER prayer_video_responses_protect_audit_fields
  BEFORE UPDATE ON public.prayer_video_responses
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_prayer_video_response_audit_fields();

COMMIT;
