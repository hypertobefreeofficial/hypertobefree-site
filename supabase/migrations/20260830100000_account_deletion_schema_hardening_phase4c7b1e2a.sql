-- Phase 4C.7B.1E.2A: Account deletion schema hardening
-- Local migration only — do not apply to Production automatically.
--
-- Scope: structural FK/nullability changes only.
-- NO DELETE / TRUNCATE / DROP TABLE / DROP COLUMN / auth.users mutation.
--
-- Rollout:
--   1) Apply via Supabase CLI (`supabase db push`) or SQL editor in target env.
--   2) Ensure supabase_migrations.schema_migrations records this version.
--   3) Run target-environment schema verification before enabling executor (1E.2B+).
--
-- story_video_replies.story_id ON DELETE CASCADE is intentionally NOT changed here.
-- Phase 1E.1 lifecycle policy structurally prevents parent story HARD_DELETE when:
--   - story is live-public or tombstone/removed (ANONYMIZE only)
--   - never-published story has storyVideoReplyCount > 0 (BLOCK_UNRESOLVED)
-- Per-party detach semantics require a separate schema/executor phase.
--
-- Rollback considerations (manual, no down migration):
--   Before any account-deletion execution: reverting NOT NULL + CASCADE FKs is feasible
--   if no NULL author/user_id values exist yet.
--   After anonymization execution introduces NULL author fields: reverting to NOT NULL
--   may fail or require data reconstruction — treat as forward-only post-execution.

BEGIN;

-- ---------------------------------------------------------------------------
-- A) stories.user_id — nullable for tombstone/live-public anonymization
--    Current: uuid NOT NULL, no auth.users FK
-- ---------------------------------------------------------------------------
ALTER TABLE public.stories
  ALTER COLUMN user_id DROP NOT NULL;

-- ---------------------------------------------------------------------------
-- B) prayer_video_responses.user_id — survive author auth deletion
--    Constraint: prayer_video_responses_user_id_fkey
--    Current: uuid NOT NULL → auth.users(id) ON DELETE CASCADE
-- ---------------------------------------------------------------------------
ALTER TABLE public.prayer_video_responses
  DROP CONSTRAINT IF EXISTS prayer_video_responses_user_id_fkey;

ALTER TABLE public.prayer_video_responses
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.prayer_video_responses
  ADD CONSTRAINT prayer_video_responses_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- C) prayer_written_responses.author_user_id — survive author auth deletion
--    Constraint: prayer_written_responses_author_user_id_fkey
--    Current: uuid NOT NULL → auth.users(id) ON DELETE CASCADE
-- ---------------------------------------------------------------------------
ALTER TABLE public.prayer_written_responses
  DROP CONSTRAINT IF EXISTS prayer_written_responses_author_user_id_fkey;

ALTER TABLE public.prayer_written_responses
  ALTER COLUMN author_user_id DROP NOT NULL;

ALTER TABLE public.prayer_written_responses
  ADD CONSTRAINT prayer_written_responses_author_user_id_fkey
  FOREIGN KEY (author_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- D) prayer_updates.author_user_id — survive author auth deletion
--    Constraint: prayer_updates_author_user_id_fkey
--    Current: uuid NOT NULL → auth.users(id) ON DELETE CASCADE
-- ---------------------------------------------------------------------------
ALTER TABLE public.prayer_updates
  DROP CONSTRAINT IF EXISTS prayer_updates_author_user_id_fkey;

ALTER TABLE public.prayer_updates
  ALTER COLUMN author_user_id DROP NOT NULL;

ALTER TABLE public.prayer_updates
  ADD CONSTRAINT prayer_updates_author_user_id_fkey
  FOREIGN KEY (author_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- E) inbox_messages.prayer_update_id — surviving inbox rows must not cascade
--    Constraint: inbox_messages_prayer_update_id_fkey
--    Current: uuid NULLABLE → prayer_updates(id) ON DELETE CASCADE
-- ---------------------------------------------------------------------------
ALTER TABLE public.inbox_messages
  DROP CONSTRAINT IF EXISTS inbox_messages_prayer_update_id_fkey;

ALTER TABLE public.inbox_messages
  ADD CONSTRAINT inbox_messages_prayer_update_id_fkey
  FOREIGN KEY (prayer_update_id) REFERENCES public.prayer_updates(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- F) content_reports.story_id — moderation reports must survive story delete
--    Constraint: content_reports_story_id_fkey
--    Current: uuid NULLABLE → stories(id) ON DELETE CASCADE
-- ---------------------------------------------------------------------------
ALTER TABLE public.content_reports
  DROP CONSTRAINT IF EXISTS content_reports_story_id_fkey;

ALTER TABLE public.content_reports
  ADD CONSTRAINT content_reports_story_id_fkey
  FOREIGN KEY (story_id) REFERENCES public.stories(id) ON DELETE SET NULL;

COMMIT;
