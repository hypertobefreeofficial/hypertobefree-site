-- HTBF Journey Inbox — Phase 1 private media boundary
-- Creates a private storage bucket for Journey Inbox / private video messages,
-- restrictive storage policies, and inbox_messages RLS hardening.
-- Apply in dev/staging first. Do NOT apply to production until review.

BEGIN;

-- ============================================================
-- 1) Private storage bucket (NOT public)
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'journey-private-media',
  'journey-private-media',
  false,
  104857600, -- 100 MB
  ARRAY['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v']
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ============================================================
-- 2) Storage policies for journey-private-media
-- ============================================================
-- Documented policies:
--   journey_private_media_insert_own
--     INSERT for authenticated users only; object path must begin with auth.uid().
--     No anonymous uploads.
--   (No SELECT / UPDATE / DELETE policies for anon or authenticated.)
--     Direct object reads are denied for browser clients; playback uses service-role
--     signed URLs issued by HTBF after inbox authorization checks.
--   Service role retains full storage access for signing and future migration jobs.

DROP POLICY IF EXISTS "journey_private_media_insert_own"
  ON storage.objects;

CREATE POLICY "journey_private_media_insert_own"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'journey-private-media'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

-- ============================================================
-- 3) inbox_messages INSERT authorization helper
-- ============================================================

CREATE OR REPLACE FUNCTION public.can_insert_inbox_message(
  p_user_id uuid,
  p_sender_user_id uuid,
  p_parent_message_id uuid,
  p_story_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN public.current_user_is_admin() = true THEN true
    WHEN p_sender_user_id IS DISTINCT FROM auth.uid() THEN false
    WHEN p_user_id = auth.uid() THEN true
    WHEN p_parent_message_id IS NOT NULL THEN EXISTS (
      SELECT 1
      FROM public.inbox_messages parent
      WHERE parent.id = p_parent_message_id
        AND (
          (parent.user_id = auth.uid() AND parent.sender_user_id = p_user_id)
          OR (parent.sender_user_id = auth.uid() AND parent.user_id = p_user_id)
        )
    )
    WHEN p_story_id IS NOT NULL THEN EXISTS (
      SELECT 1
      FROM public.stories story
      WHERE story.id = p_story_id
        AND story.user_id = p_user_id
    )
    ELSE false
  END;
$$;

REVOKE ALL ON FUNCTION public.can_insert_inbox_message(uuid, uuid, uuid, uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_insert_inbox_message(uuid, uuid, uuid, uuid)
  TO authenticated;

-- ============================================================
-- 4) inbox_messages immutable-field protection on UPDATE
-- ============================================================

CREATE OR REPLACE FUNCTION public.protect_inbox_message_immutable_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.current_user_is_admin() = true THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.sender_user_id IS DISTINCT FROM OLD.sender_user_id
       OR NEW.parent_message_id IS DISTINCT FROM OLD.parent_message_id
       OR NEW.thread_id IS DISTINCT FROM OLD.thread_id
       OR NEW.title IS DISTINCT FROM OLD.title
       OR NEW.body IS DISTINCT FROM OLD.body
       OR NEW.category IS DISTINCT FROM OLD.category
       OR NEW.message_type IS DISTINCT FROM OLD.message_type
       OR NEW.story_id IS DISTINCT FROM OLD.story_id
       OR NEW.prayer_request_id IS DISTINCT FROM OLD.prayer_request_id
       OR NEW.video_url IS DISTINCT FROM OLD.video_url
       OR NEW.image_url IS DISTINCT FROM OLD.image_url
       OR NEW.action_url IS DISTINCT FROM OLD.action_url
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION
        'inbox_messages content fields are immutable; only read/hidden_at may change';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inbox_messages_protect_immutable_fields
  ON public.inbox_messages;

CREATE TRIGGER inbox_messages_protect_immutable_fields
  BEFORE UPDATE ON public.inbox_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_inbox_message_immutable_fields();

-- ============================================================
-- 5) inbox_messages RLS
-- ============================================================

ALTER TABLE public.inbox_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inbox_messages_select_own"
  ON public.inbox_messages;
CREATE POLICY "inbox_messages_select_own"
  ON public.inbox_messages
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.current_user_is_admin() = true
  );

DROP POLICY IF EXISTS "inbox_messages_update_own"
  ON public.inbox_messages;
CREATE POLICY "inbox_messages_update_own"
  ON public.inbox_messages
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.current_user_is_admin() = true
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.current_user_is_admin() = true
  );

DROP POLICY IF EXISTS "inbox_messages_insert_participant"
  ON public.inbox_messages;
CREATE POLICY "inbox_messages_insert_participant"
  ON public.inbox_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_insert_inbox_message(
      user_id,
      sender_user_id,
      parent_message_id,
      story_id
    )
  );

DROP POLICY IF EXISTS "inbox_messages_no_user_delete"
  ON public.inbox_messages;
CREATE POLICY "inbox_messages_no_user_delete"
  ON public.inbox_messages
  FOR DELETE
  TO authenticated
  USING (false);

COMMIT;
