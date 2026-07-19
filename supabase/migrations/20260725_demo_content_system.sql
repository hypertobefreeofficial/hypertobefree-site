-- HTBF Demo Content System — schema draft for review (Phase 1A)
-- Additive + idempotent intent. DO NOT APPLY AUTOMATICALLY.
--
-- Apply manually in Supabase SQL editor on htbf-staging ONLY after owner review.
-- Production application requires separate approval workflow.
--
-- Rollback: see docs/demo-content/HTBF_DEMO_CONTENT_SYSTEM.md § Rollback analysis.
-- Do not run destructive rollback without deleting demo rows first.

BEGIN;

-- ============================================================
-- 0) Trusted demo-seed operator check (no spoofable session flags)
-- ============================================================
-- Authorization model:
--   • service_role JWT (seed/cleanup scripts only — never exposed to browsers)
--   • postgres / supabase_admin direct SQL sessions (migrations, manual ops)
-- Normal authenticated members CANNOT satisfy htbf_is_demo_seed_operator().
-- We intentionally do NOT use app.demo_seed_operator or other client-settable GUCs.

CREATE OR REPLACE FUNCTION public.htbf_is_demo_seed_operator()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT
    coalesce(
      pg_catalog.current_setting('request.jwt.claim.role', true),
      ''
    ) = 'service_role'
    OR session_user IN ('postgres', 'supabase_admin');
$$;

ALTER FUNCTION public.htbf_is_demo_seed_operator() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.htbf_is_demo_seed_operator() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.htbf_is_demo_seed_operator() FROM anon;
REVOKE ALL ON FUNCTION public.htbf_is_demo_seed_operator() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.htbf_is_demo_seed_operator() TO service_role;

COMMENT ON FUNCTION public.htbf_is_demo_seed_operator() IS
  'True only for service_role JWT or postgres/supabase_admin sessions. Members cannot satisfy this.';

-- ============================================================
-- 1) Central demo seed registry
-- ============================================================

CREATE TABLE IF NOT EXISTS public.demo_seed_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seed_version text NOT NULL,
  environment text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_by text,
  record_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  storage_prefix text NOT NULL,
  CONSTRAINT demo_seed_runs_seed_version_unique UNIQUE (seed_version),
  CONSTRAINT demo_seed_runs_environment_check CHECK (
    environment IN ('staging', 'production')
  ),
  CONSTRAINT demo_seed_runs_status_check CHECK (
    status IN ('pending', 'running', 'completed', 'failed', 'cleaned')
  ),
  CONSTRAINT demo_seed_runs_storage_prefix_check CHECK (
    storage_prefix ~ '^demo/[0-9a-f-]+/'
  )
);

COMMENT ON TABLE public.demo_seed_runs IS
  'Registry of demo seed executions. All staging demo rows reference demo_seed_run_id.';
COMMENT ON COLUMN public.demo_seed_runs.seed_version IS
  'Unique human-readable slug, e.g. 2026-07-staging-v1. Used for operator idempotency checks.';
COMMENT ON COLUMN public.demo_seed_runs.environment IS
  'staging = automated scripts only. production = future curated library (Phase 7+).';
COMMENT ON COLUMN public.demo_seed_runs.storage_prefix IS
  'Supabase Storage prefix for demo media, e.g. demo/{run_id}/.';

CREATE INDEX IF NOT EXISTS demo_seed_runs_environment_status_idx
  ON public.demo_seed_runs (environment, status, created_at DESC);

ALTER TABLE public.demo_seed_runs ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE ON public.demo_seed_runs FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON public.demo_seed_runs FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.demo_seed_runs FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.demo_seed_runs TO service_role;

CREATE OR REPLACE FUNCTION public.demo_seed_runs_guard_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NOT public.htbf_is_demo_seed_operator() THEN
    RAISE EXCEPTION 'demo_seed_runs inserts require service_role or postgres session'
      USING ERRCODE = '42501';
  END IF;

  -- Phase 1: staging automated seed only. Production library deferred to Phase 7.
  IF NEW.environment <> 'staging' THEN
    RAISE EXCEPTION 'production demo seed runs are not enabled in Phase 1'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.demo_seed_runs_guard_insert() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.demo_seed_runs_guard_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.demo_seed_runs_guard_insert() FROM anon;
REVOKE ALL ON FUNCTION public.demo_seed_runs_guard_insert() FROM authenticated;

DROP TRIGGER IF EXISTS demo_seed_runs_guard_insert_trg ON public.demo_seed_runs;
CREATE TRIGGER demo_seed_runs_guard_insert_trg
  BEFORE INSERT ON public.demo_seed_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.demo_seed_runs_guard_insert();

-- ============================================================
-- 2) Content origin constraint helper
-- ============================================================

CREATE OR REPLACE FUNCTION public.htbf_content_origin_is_valid(p_origin text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT p_origin IN ('member', 'staging_demo', 'production_demo_library', 'system');
$$;

ALTER FUNCTION public.htbf_content_origin_is_valid(text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.htbf_content_origin_is_valid(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.htbf_content_origin_is_valid(text) FROM anon;
REVOKE ALL ON FUNCTION public.htbf_content_origin_is_valid(text) FROM authenticated;

-- ============================================================
-- 3) profiles
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS demo_seed_run_id uuid REFERENCES public.demo_seed_runs (id) ON DELETE RESTRICT;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS demo_display_label text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS demo_tour_state jsonb;

COMMENT ON COLUMN public.profiles.is_demo IS
  'True for HTBF-branded demo actor accounts (e.g. HTBF Guide). Never real members.';
COMMENT ON COLUMN public.profiles.demo_tour_state IS
  'Guided experience progress JSON. Updates via update_my_demo_tour_state() only.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_demo_consistency_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_demo_consistency_check
      CHECK (
        (is_demo = false AND demo_seed_run_id IS NULL)
        OR (is_demo = true AND demo_seed_run_id IS NOT NULL)
      );
  END IF;
END $$;

-- ============================================================
-- 4) stories
-- ============================================================

ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS demo_seed_run_id uuid REFERENCES public.demo_seed_runs (id) ON DELETE RESTRICT;

ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS demo_scenario_id text;

ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS content_origin text NOT NULL DEFAULT 'member';

ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS demo_display_label text;

ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS is_ai_generated boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.stories.is_demo IS
  'Demo/sample content flag. Excluded from real community loaders when false filter applied.';
COMMENT ON COLUMN public.stories.content_origin IS
  'member | staging_demo | production_demo_library | system. Separate from creation_mode loadtest.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stories_content_origin_check'
  ) THEN
    ALTER TABLE public.stories
      ADD CONSTRAINT stories_content_origin_check
      CHECK (public.htbf_content_origin_is_valid(content_origin));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stories_demo_origin_consistency_check'
  ) THEN
    ALTER TABLE public.stories
      ADD CONSTRAINT stories_demo_origin_consistency_check
      CHECK (
        (
          is_demo = false
          AND demo_seed_run_id IS NULL
          AND content_origin = 'member'
        )
        OR (
          is_demo = true
          AND demo_seed_run_id IS NOT NULL
          AND content_origin IN (
            'staging_demo',
            'production_demo_library',
            'system'
          )
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS stories_is_demo_false_public_idx
  ON public.stories (created_at DESC, id DESC)
  WHERE is_demo = false AND status = 'approved' AND removed_at IS NULL;

CREATE INDEX IF NOT EXISTS stories_demo_run_scenario_idx
  ON public.stories (demo_seed_run_id, demo_scenario_id)
  WHERE is_demo = true;

-- ============================================================
-- 5) prayer_video_responses
-- ============================================================

ALTER TABLE public.prayer_video_responses
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

ALTER TABLE public.prayer_video_responses
  ADD COLUMN IF NOT EXISTS demo_seed_run_id uuid REFERENCES public.demo_seed_runs (id) ON DELETE RESTRICT;

ALTER TABLE public.prayer_video_responses
  ADD COLUMN IF NOT EXISTS demo_scenario_id text;

ALTER TABLE public.prayer_video_responses
  ADD COLUMN IF NOT EXISTS content_origin text NOT NULL DEFAULT 'member';

ALTER TABLE public.prayer_video_responses
  ADD COLUMN IF NOT EXISTS demo_display_label text;

ALTER TABLE public.prayer_video_responses
  ADD COLUMN IF NOT EXISTS is_ai_generated boolean NOT NULL DEFAULT false;

ALTER TABLE public.prayer_video_responses
  ADD COLUMN IF NOT EXISTS demo_media_transcript text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'prayer_video_responses_content_origin_check'
  ) THEN
    ALTER TABLE public.prayer_video_responses
      ADD CONSTRAINT prayer_video_responses_content_origin_check
      CHECK (public.htbf_content_origin_is_valid(content_origin));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'prayer_video_responses_demo_origin_consistency_check'
  ) THEN
    ALTER TABLE public.prayer_video_responses
      ADD CONSTRAINT prayer_video_responses_demo_origin_consistency_check
      CHECK (
        (
          is_demo = false
          AND demo_seed_run_id IS NULL
          AND content_origin = 'member'
        )
        OR (
          is_demo = true
          AND demo_seed_run_id IS NOT NULL
          AND content_origin IN (
            'staging_demo',
            'production_demo_library',
            'system'
          )
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS prayer_video_responses_is_demo_false_idx
  ON public.prayer_video_responses (story_id, created_at DESC)
  WHERE is_demo = false AND status = 'approved' AND removed_at IS NULL;

CREATE INDEX IF NOT EXISTS prayer_video_responses_demo_run_idx
  ON public.prayer_video_responses (demo_seed_run_id, demo_scenario_id)
  WHERE is_demo = true;

-- ============================================================
-- 6) Child interaction tables
-- ============================================================

ALTER TABLE public.story_reactions
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

ALTER TABLE public.story_reactions
  ADD COLUMN IF NOT EXISTS demo_seed_run_id uuid REFERENCES public.demo_seed_runs (id) ON DELETE RESTRICT;

ALTER TABLE public.content_reports
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

ALTER TABLE public.content_reports
  ADD COLUMN IF NOT EXISTS demo_seed_run_id uuid REFERENCES public.demo_seed_runs (id) ON DELETE RESTRICT;

ALTER TABLE public.saved_content
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

ALTER TABLE public.saved_content
  ADD COLUMN IF NOT EXISTS demo_seed_run_id uuid REFERENCES public.demo_seed_runs (id) ON DELETE RESTRICT;

ALTER TABLE public.prayer_follows
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

ALTER TABLE public.prayer_follows
  ADD COLUMN IF NOT EXISTS demo_seed_run_id uuid REFERENCES public.demo_seed_runs (id) ON DELETE RESTRICT;

ALTER TABLE public.prayer_written_responses
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

ALTER TABLE public.prayer_written_responses
  ADD COLUMN IF NOT EXISTS demo_seed_run_id uuid REFERENCES public.demo_seed_runs (id) ON DELETE RESTRICT;

ALTER TABLE public.story_video_replies
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

ALTER TABLE public.story_video_replies
  ADD COLUMN IF NOT EXISTS demo_seed_run_id uuid REFERENCES public.demo_seed_runs (id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS story_reactions_is_demo_false_idx
  ON public.story_reactions (story_id)
  WHERE is_demo = false;

CREATE INDEX IF NOT EXISTS story_reactions_demo_run_idx
  ON public.story_reactions (demo_seed_run_id)
  WHERE is_demo = true;

-- ============================================================
-- 7) Reject member-supplied demo flags on parent content
-- ============================================================

CREATE OR REPLACE FUNCTION public.htbf_reject_member_demo_flags()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF public.htbf_is_demo_seed_operator() THEN
    RETURN NEW;
  END IF;

  IF NEW.is_demo IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'members cannot set is_demo'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.demo_seed_run_id IS NOT NULL THEN
    RAISE EXCEPTION 'members cannot assign demo_seed_run_id'
      USING ERRCODE = '42501';
  END IF;

  IF TG_TABLE_NAME = 'stories' OR TG_TABLE_NAME = 'prayer_video_responses' THEN
    IF NEW.content_origin IS DISTINCT FROM 'member' THEN
      RAISE EXCEPTION 'members cannot set content_origin'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'profiles' AND NEW.demo_tour_state IS NOT NULL THEN
    RAISE EXCEPTION 'demo_tour_state must be updated through update_my_demo_tour_state()'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.htbf_reject_member_demo_flags() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.htbf_reject_member_demo_flags() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.htbf_reject_member_demo_flags() FROM anon;
REVOKE ALL ON FUNCTION public.htbf_reject_member_demo_flags() FROM authenticated;

DROP TRIGGER IF EXISTS stories_reject_member_demo_flags_trg ON public.stories;
CREATE TRIGGER stories_reject_member_demo_flags_trg
  BEFORE INSERT OR UPDATE OF is_demo, demo_seed_run_id, content_origin, demo_scenario_id, demo_display_label
  ON public.stories
  FOR EACH ROW
  EXECUTE FUNCTION public.htbf_reject_member_demo_flags();

DROP TRIGGER IF EXISTS prayer_video_responses_reject_member_demo_flags_trg ON public.prayer_video_responses;
CREATE TRIGGER prayer_video_responses_reject_member_demo_flags_trg
  BEFORE INSERT OR UPDATE OF is_demo, demo_seed_run_id, content_origin, demo_scenario_id, demo_display_label
  ON public.prayer_video_responses
  FOR EACH ROW
  EXECUTE FUNCTION public.htbf_reject_member_demo_flags();

DROP TRIGGER IF EXISTS profiles_reject_member_demo_flags_trg ON public.profiles;
CREATE TRIGGER profiles_reject_member_demo_flags_trg
  BEFORE INSERT OR UPDATE OF is_demo, demo_seed_run_id, demo_display_label, demo_tour_state
  ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.htbf_reject_member_demo_flags();

-- ============================================================
-- 8) Staging seed path cannot create production_demo_library rows
-- ============================================================

CREATE OR REPLACE FUNCTION public.htbf_guard_staging_demo_seed_content()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_run public.demo_seed_runs;
BEGIN
  IF NOT public.htbf_is_demo_seed_operator() THEN
    RETURN NEW;
  END IF;

  IF NEW.is_demo IS DISTINCT FROM true THEN
    RETURN NEW;
  END IF;

  IF NEW.content_origin = 'production_demo_library' THEN
    RAISE EXCEPTION 'production_demo_library content cannot be created through the staging seed path'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.demo_seed_run_id IS NULL THEN
    RAISE EXCEPTION 'staging demo rows require demo_seed_run_id'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_run
  FROM public.demo_seed_runs
  WHERE id = NEW.demo_seed_run_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'demo_seed_run_id does not reference an existing registry row'
      USING ERRCODE = '23503';
  END IF;

  IF v_run.environment <> 'staging' THEN
    RAISE EXCEPTION 'staging seed content must reference a staging demo_seed_run'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.content_origin IS DISTINCT FROM 'staging_demo' THEN
    RAISE EXCEPTION 'staging seed content must use content_origin = staging_demo'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.htbf_guard_staging_demo_seed_content() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.htbf_guard_staging_demo_seed_content() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.htbf_guard_staging_demo_seed_content() FROM anon;
REVOKE ALL ON FUNCTION public.htbf_guard_staging_demo_seed_content() FROM authenticated;

DROP TRIGGER IF EXISTS stories_guard_staging_demo_seed_trg ON public.stories;
CREATE TRIGGER stories_guard_staging_demo_seed_trg
  BEFORE INSERT OR UPDATE OF is_demo, demo_seed_run_id, content_origin
  ON public.stories
  FOR EACH ROW
  EXECUTE FUNCTION public.htbf_guard_staging_demo_seed_content();

DROP TRIGGER IF EXISTS prayer_video_responses_guard_staging_demo_seed_trg ON public.prayer_video_responses;
CREATE TRIGGER prayer_video_responses_guard_staging_demo_seed_trg
  BEFORE INSERT OR UPDATE OF is_demo, demo_seed_run_id, content_origin
  ON public.prayer_video_responses
  FOR EACH ROW
  EXECUTE FUNCTION public.htbf_guard_staging_demo_seed_content();

DROP TRIGGER IF EXISTS profiles_guard_staging_demo_seed_trg ON public.profiles;
CREATE TRIGGER profiles_guard_staging_demo_seed_trg
  BEFORE INSERT OR UPDATE OF is_demo, demo_seed_run_id
  ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.htbf_guard_staging_demo_seed_content();

-- ============================================================
-- 9) Cross-realm engagement prohibition (Phase 1: DENY all)
-- ============================================================

-- STABLE: argument-only logic, but may raise exceptions (not IMMUTABLE-safe).
CREATE OR REPLACE FUNCTION public.htbf_deny_cross_realm_engagement(
  p_story_is_demo boolean,
  p_actor_is_demo boolean,
  p_context text
)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
BEGIN
  IF coalesce(p_story_is_demo, false)
     AND NOT coalesce(p_actor_is_demo, false) THEN
    RAISE EXCEPTION 'real members cannot interact with demo content via %', p_context
      USING ERRCODE = '42501';
  END IF;

  IF NOT coalesce(p_story_is_demo, false)
     AND coalesce(p_actor_is_demo, false) THEN
    RAISE EXCEPTION 'demo actors cannot interact with genuine content via %', p_context
      USING ERRCODE = '42501';
  END IF;
END;
$$;

ALTER FUNCTION public.htbf_deny_cross_realm_engagement(boolean, boolean, text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.htbf_deny_cross_realm_engagement(boolean, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.htbf_deny_cross_realm_engagement(boolean, boolean, text) FROM anon;
REVOKE ALL ON FUNCTION public.htbf_deny_cross_realm_engagement(boolean, boolean, text) FROM authenticated;

CREATE OR REPLACE FUNCTION public.htbf_derive_story_reaction_demo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_story public.stories;
  v_profile public.profiles;
  v_story_demo boolean := false;
  v_actor_demo boolean := false;
BEGIN
  IF public.htbf_is_demo_seed_operator() THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_story FROM public.stories WHERE id = NEW.story_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'story not found for reaction'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = NEW.user_id;

  v_story_demo := coalesce(v_story.is_demo, false);
  v_actor_demo := coalesce(v_profile.is_demo, false);

  PERFORM public.htbf_deny_cross_realm_engagement(
    v_story_demo,
    v_actor_demo,
    'story_reactions'
  );

  IF v_story_demo OR v_actor_demo THEN
    RAISE EXCEPTION 'demo engagement rows are not creatable by members in Phase 1'
      USING ERRCODE = '42501';
  END IF;

  NEW.is_demo := false;
  NEW.demo_seed_run_id := NULL;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.htbf_derive_story_reaction_demo() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.htbf_derive_story_reaction_demo() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.htbf_derive_story_reaction_demo() FROM anon;
REVOKE ALL ON FUNCTION public.htbf_derive_story_reaction_demo() FROM authenticated;

DROP TRIGGER IF EXISTS story_reactions_derive_demo_trg ON public.story_reactions;
CREATE TRIGGER story_reactions_derive_demo_trg
  BEFORE INSERT ON public.story_reactions
  FOR EACH ROW
  EXECUTE FUNCTION public.htbf_derive_story_reaction_demo();

CREATE OR REPLACE FUNCTION public.htbf_derive_child_demo_from_story()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_story public.stories;
  v_actor uuid;
  v_profile public.profiles;
  v_story_demo boolean := false;
  v_actor_demo boolean := false;
BEGIN
  IF public.htbf_is_demo_seed_operator() THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_story FROM public.stories WHERE id = NEW.story_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'story not found'
      USING ERRCODE = '22023';
  END IF;

  v_actor := CASE TG_TABLE_NAME
    WHEN 'content_reports' THEN NEW.reporter_user_id
    WHEN 'saved_content' THEN NEW.user_id
    WHEN 'prayer_follows' THEN NEW.user_id
    WHEN 'prayer_written_responses' THEN NEW.author_user_id
    WHEN 'story_video_replies' THEN NEW.user_id
    ELSE NULL
  END;

  IF v_actor IS NOT NULL THEN
    SELECT * INTO v_profile FROM public.profiles WHERE id = v_actor;
  END IF;

  v_story_demo := coalesce(v_story.is_demo, false);
  v_actor_demo := coalesce(v_profile.is_demo, false);

  PERFORM public.htbf_deny_cross_realm_engagement(
    v_story_demo,
    v_actor_demo,
    TG_TABLE_NAME
  );

  IF v_story_demo OR v_actor_demo THEN
    RAISE EXCEPTION 'demo engagement rows are not creatable by members in Phase 1'
      USING ERRCODE = '42501';
  END IF;

  NEW.is_demo := false;
  NEW.demo_seed_run_id := NULL;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.htbf_derive_child_demo_from_story() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.htbf_derive_child_demo_from_story() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.htbf_derive_child_demo_from_story() FROM anon;
REVOKE ALL ON FUNCTION public.htbf_derive_child_demo_from_story() FROM authenticated;

DROP TRIGGER IF EXISTS content_reports_derive_demo_trg ON public.content_reports;
CREATE TRIGGER content_reports_derive_demo_trg
  BEFORE INSERT ON public.content_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.htbf_derive_child_demo_from_story();

DROP TRIGGER IF EXISTS saved_content_derive_demo_trg ON public.saved_content;
CREATE TRIGGER saved_content_derive_demo_trg
  BEFORE INSERT ON public.saved_content
  FOR EACH ROW
  EXECUTE FUNCTION public.htbf_derive_child_demo_from_story();

DROP TRIGGER IF EXISTS prayer_follows_derive_demo_trg ON public.prayer_follows;
CREATE TRIGGER prayer_follows_derive_demo_trg
  BEFORE INSERT ON public.prayer_follows
  FOR EACH ROW
  EXECUTE FUNCTION public.htbf_derive_child_demo_from_story();

DROP TRIGGER IF EXISTS prayer_written_responses_derive_demo_trg ON public.prayer_written_responses;
CREATE TRIGGER prayer_written_responses_derive_demo_trg
  BEFORE INSERT ON public.prayer_written_responses
  FOR EACH ROW
  EXECUTE FUNCTION public.htbf_derive_child_demo_from_story();

DROP TRIGGER IF EXISTS story_video_replies_derive_demo_trg ON public.story_video_replies;
CREATE TRIGGER story_video_replies_derive_demo_trg
  BEFORE INSERT ON public.story_video_replies
  FOR EACH ROW
  EXECUTE FUNCTION public.htbf_derive_child_demo_from_story();

CREATE OR REPLACE FUNCTION public.htbf_derive_prayer_video_response_demo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_story public.stories;
  v_profile public.profiles;
  v_story_demo boolean := false;
  v_actor_demo boolean := false;
BEGIN
  IF public.htbf_is_demo_seed_operator() THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_story FROM public.stories WHERE id = NEW.story_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'story not found for video response'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = NEW.user_id;

  v_story_demo := coalesce(v_story.is_demo, false);
  v_actor_demo := coalesce(v_profile.is_demo, false);

  PERFORM public.htbf_deny_cross_realm_engagement(
    v_story_demo,
    v_actor_demo,
    'prayer_video_responses'
  );

  IF v_story_demo OR v_actor_demo THEN
    RAISE EXCEPTION 'demo video responses are not creatable by members in Phase 1'
      USING ERRCODE = '42501';
  END IF;

  NEW.is_demo := false;
  NEW.demo_seed_run_id := NULL;
  NEW.content_origin := 'member';
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.htbf_derive_prayer_video_response_demo() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.htbf_derive_prayer_video_response_demo() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.htbf_derive_prayer_video_response_demo() FROM anon;
REVOKE ALL ON FUNCTION public.htbf_derive_prayer_video_response_demo() FROM authenticated;

DROP TRIGGER IF EXISTS prayer_video_responses_derive_demo_trg ON public.prayer_video_responses;
CREATE TRIGGER prayer_video_responses_derive_demo_trg
  BEFORE INSERT ON public.prayer_video_responses
  FOR EACH ROW
  EXECUTE FUNCTION public.htbf_derive_prayer_video_response_demo();

-- ============================================================
-- 10) Demo FK consistency (is_demo ⇔ demo_seed_run_id)
-- ============================================================

CREATE OR REPLACE FUNCTION public.htbf_require_demo_run_fk()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.is_demo = true AND NEW.demo_seed_run_id IS NULL THEN
    RAISE EXCEPTION 'demo rows require demo_seed_run_id'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.is_demo = false AND NEW.demo_seed_run_id IS NOT NULL THEN
    RAISE EXCEPTION 'non-demo rows cannot reference demo_seed_run_id'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.htbf_require_demo_run_fk() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.htbf_require_demo_run_fk() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.htbf_require_demo_run_fk() FROM anon;
REVOKE ALL ON FUNCTION public.htbf_require_demo_run_fk() FROM authenticated;

DROP TRIGGER IF EXISTS profiles_require_demo_run_trg ON public.profiles;
CREATE TRIGGER profiles_require_demo_run_trg
  BEFORE INSERT OR UPDATE OF is_demo, demo_seed_run_id
  ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.htbf_require_demo_run_fk();

DROP TRIGGER IF EXISTS stories_require_demo_run_trg ON public.stories;
CREATE TRIGGER stories_require_demo_run_trg
  BEFORE INSERT OR UPDATE OF is_demo, demo_seed_run_id
  ON public.stories
  FOR EACH ROW
  EXECUTE FUNCTION public.htbf_require_demo_run_fk();

DROP TRIGGER IF EXISTS prayer_video_responses_require_demo_run_trg ON public.prayer_video_responses;
CREATE TRIGGER prayer_video_responses_require_demo_run_trg
  BEFORE INSERT OR UPDATE OF is_demo, demo_seed_run_id
  ON public.prayer_video_responses
  FOR EACH ROW
  EXECUTE FUNCTION public.htbf_require_demo_run_fk();

DROP TRIGGER IF EXISTS story_reactions_require_demo_run_trg ON public.story_reactions;
CREATE TRIGGER story_reactions_require_demo_run_trg
  BEFORE INSERT OR UPDATE OF is_demo, demo_seed_run_id
  ON public.story_reactions
  FOR EACH ROW
  EXECUTE FUNCTION public.htbf_require_demo_run_fk();

DROP TRIGGER IF EXISTS content_reports_require_demo_run_trg ON public.content_reports;
CREATE TRIGGER content_reports_require_demo_run_trg
  BEFORE INSERT OR UPDATE OF is_demo, demo_seed_run_id
  ON public.content_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.htbf_require_demo_run_fk();

DROP TRIGGER IF EXISTS saved_content_require_demo_run_trg ON public.saved_content;
CREATE TRIGGER saved_content_require_demo_run_trg
  BEFORE INSERT OR UPDATE OF is_demo, demo_seed_run_id
  ON public.saved_content
  FOR EACH ROW
  EXECUTE FUNCTION public.htbf_require_demo_run_fk();

DROP TRIGGER IF EXISTS prayer_follows_require_demo_run_trg ON public.prayer_follows;
CREATE TRIGGER prayer_follows_require_demo_run_trg
  BEFORE INSERT OR UPDATE OF is_demo, demo_seed_run_id
  ON public.prayer_follows
  FOR EACH ROW
  EXECUTE FUNCTION public.htbf_require_demo_run_fk();

DROP TRIGGER IF EXISTS prayer_written_responses_require_demo_run_trg ON public.prayer_written_responses;
CREATE TRIGGER prayer_written_responses_require_demo_run_trg
  BEFORE INSERT OR UPDATE OF is_demo, demo_seed_run_id
  ON public.prayer_written_responses
  FOR EACH ROW
  EXECUTE FUNCTION public.htbf_require_demo_run_fk();

DROP TRIGGER IF EXISTS story_video_replies_require_demo_run_trg ON public.story_video_replies;
CREATE TRIGGER story_video_replies_require_demo_run_trg
  BEFORE INSERT OR UPDATE OF is_demo, demo_seed_run_id
  ON public.story_video_replies
  FOR EACH ROW
  EXECUTE FUNCTION public.htbf_require_demo_run_fk();

-- ============================================================
-- 11) Guided tour state — controlled RPC only
-- ============================================================

CREATE OR REPLACE FUNCTION public.allow_demo_tour_state_write()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT coalesce(
    pg_catalog.current_setting('app.demo_tour_state_write', true),
    ''
  ) = '1';
$$;

ALTER FUNCTION public.allow_demo_tour_state_write() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.allow_demo_tour_state_write() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.allow_demo_tour_state_write() FROM anon;
REVOKE ALL ON FUNCTION public.allow_demo_tour_state_write() FROM authenticated;

CREATE OR REPLACE FUNCTION public.update_my_demo_tour_state(p_patch jsonb)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_profile public.profiles;
  v_current jsonb;
  v_merged jsonb;
  v_how jsonb;
  v_key text;
  v_allowed_keys constant text[] := ARRAY[
    'version',
    'status',
    'current_step',
    'started_at',
    'dismissed_at',
    'completed_at',
    'replay_requested_at'
  ];
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'invalid tour state patch'
      USING ERRCODE = '22023';
  END IF;

  IF NOT (p_patch ? 'how_htbf_works') THEN
    RAISE EXCEPTION 'tour state patch must contain how_htbf_works'
      USING ERRCODE = '22023';
  END IF;

  IF (SELECT count(*) FROM jsonb_object_keys(p_patch)) <> 1 THEN
    RAISE EXCEPTION 'tour state patch may only contain how_htbf_works'
      USING ERRCODE = '22023';
  END IF;

  v_how := p_patch -> 'how_htbf_works';
  IF jsonb_typeof(v_how) <> 'object' THEN
    RAISE EXCEPTION 'how_htbf_works must be an object'
      USING ERRCODE = '22023';
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(v_how)
  LOOP
    IF NOT v_key = ANY (v_allowed_keys) THEN
      RAISE EXCEPTION 'unsupported tour state key: %', v_key
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  SELECT p.demo_tour_state
  INTO v_current
  FROM public.profiles AS p
  WHERE p.id = v_user_id;

  v_merged := coalesce(v_current, '{}'::jsonb) || p_patch;

  PERFORM pg_catalog.set_config('app.demo_tour_state_write', '1', true);

  UPDATE public.profiles AS p
  SET demo_tour_state = v_merged
  WHERE p.id = v_user_id
  RETURNING * INTO v_profile;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found'
      USING ERRCODE = '22023';
  END IF;

  RETURN v_profile;
END;
$$;

ALTER FUNCTION public.update_my_demo_tour_state(jsonb) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.update_my_demo_tour_state(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_my_demo_tour_state(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_my_demo_tour_state(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.protect_demo_tour_state()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.demo_tour_state IS DISTINCT FROM NEW.demo_tour_state
     AND NOT public.allow_demo_tour_state_write()
     AND NOT public.htbf_is_demo_seed_operator() THEN
    RAISE EXCEPTION 'demo_tour_state must be updated through update_my_demo_tour_state()'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.protect_demo_tour_state() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.protect_demo_tour_state() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_demo_tour_state() FROM anon;
REVOKE ALL ON FUNCTION public.protect_demo_tour_state() FROM authenticated;

DROP TRIGGER IF EXISTS profiles_protect_demo_tour_state_trg ON public.profiles;
CREATE TRIGGER profiles_protect_demo_tour_state_trg
  BEFORE UPDATE OF demo_tour_state
  ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_demo_tour_state();

COMMIT;

-- ============================================================
-- Foreign-key delete behavior (demo_seed_run_id)
-- ============================================================
-- All demo_seed_run_id FKs use ON DELETE RESTRICT.
-- Deleting a registry row while child demo content exists is blocked.
-- Do NOT use ON DELETE SET NULL — that would orphan is_demo = true rows.
--
-- Controlled cleanup deletion order (service_role script only):
--   1. story_reactions, content_reports, saved_content, prayer_follows,
--      prayer_written_responses, story_video_replies (child engagement)
--   2. prayer_video_responses
--   3. stories
--   4. profiles (demo actors)
--   5. Supabase Storage objects under demo_seed_runs.storage_prefix
--   6. UPDATE demo_seed_runs SET status = 'cleaned' (or DELETE run row last)
--
-- ============================================================
-- RLS implications (documentation — no policy weakening in this draft)
-- ============================================================
-- 1. Existing authenticated INSERT policies remain unchanged.
-- 2. Triggers enforce demo derivation beneath RLS (defense in depth).
-- 3. Members cannot set is_demo via UPDATE/INSERT — trigger raises 42501.
-- 4. Demo seed/cleanup scripts use service_role JWT only (never browser clients).
-- 5. Server loaders must exclude is_demo = true before any staging seed is allowed.
-- 6. Cross-realm engagement is denied for members in Phase 1 (overlay tour only).
--
-- Cross-interaction policy (Phase 1 — DENY):
--   Reconsider only through an explicit reviewed design. Until then:
--   • Genuine users cannot react/report/save/follow/respond to demo content
--   • Demo users cannot react/report/save/follow/respond to genuine content
--   • Demo responses cannot attach to genuine stories; genuine responses cannot
--     attach to demo stories
--   • Guided tour uses overlay/read-only state; no DB engagement writes
--
-- ============================================================
-- Rollback analysis (manual — do not automate destructively)
-- ============================================================
-- 1. Run staging demo cleanup for all demo_seed_runs.id values (ordered above).
-- 2. DROP TRIGGER ... ON each affected table.
-- 3. DROP FUNCTION htbf_* / demo_seed_runs_guard_insert helpers.
-- 4. ALTER TABLE ... DROP COLUMN demo_* / is_demo / content_origin where added.
-- 5. DROP TABLE demo_seed_runs.
-- Never drop columns on production without confirming zero demo rows and owner sign-off.
-- Existing genuine rows remain valid — defaults: is_demo = false, content_origin = 'member'.
