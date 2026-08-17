-- HTBF Prayer production-readiness migration (hardened)
-- Review before applying. Run during a low-traffic maintenance window.
-- This migration is transactional and does not run the legacy-location backfill.

BEGIN;

-- ============================================================
-- 1) Privacy-safe searchable coordinates on stories
-- ============================================================
-- These columns store application-adjusted approximate coordinates.
-- numeric(5,2) stores two decimal places (about 1.1 km latitude precision
-- before application-side privacy offsetting). Do not send exact residence
-- coordinates to these columns.

ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS public_lat numeric(5, 2),
  ADD COLUMN IF NOT EXISTS public_lng numeric(5, 2),
  ADD COLUMN IF NOT EXISTS public_location_label text,
  ADD COLUMN IF NOT EXISTS location_visibility text;

-- Abort instead of silently accepting unsafe or malformed existing data.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.stories
    WHERE public_lat IS NOT NULL
      AND (public_lat < -90 OR public_lat > 90)
  ) THEN
    RAISE EXCEPTION
      'stories.public_lat contains values outside -90..90; correct them before applying this migration';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.stories
    WHERE public_lng IS NOT NULL
      AND (public_lng < -180 OR public_lng > 180)
  ) THEN
    RAISE EXCEPTION
      'stories.public_lng contains values outside -180..180; correct them before applying this migration';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.stories
    WHERE (public_lat IS NULL) <> (public_lng IS NULL)
  ) THEN
    RAISE EXCEPTION
      'stories contains incomplete public coordinate pairs; public_lat and public_lng must both be null or both be set';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.stories
    WHERE location_visibility IS NOT NULL
      AND location_visibility NOT IN (
        'none',
        'country',
        'state',
        'city',
        'approximate',
        'map-place'
      )
  ) THEN
    RAISE EXCEPTION
      'stories.location_visibility contains an unsupported value';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.stories
    WHERE location_visibility = 'none'
      AND (
        public_lat IS NOT NULL
        OR public_lng IS NOT NULL
        OR public_location_label IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION
      'stories rows with location_visibility = none must not retain public coordinates or a public location label';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.stories
    WHERE public_location_label IS NOT NULL
      AND char_length(public_location_label) > 160
  ) THEN
    RAISE EXCEPTION
      'stories.public_location_label contains a value longer than 160 characters';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.stories'::regclass
      AND conname = 'stories_public_lat_range_chk'
  ) THEN
    ALTER TABLE public.stories
      ADD CONSTRAINT stories_public_lat_range_chk
      CHECK (public_lat IS NULL OR public_lat BETWEEN -90 AND 90);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.stories'::regclass
      AND conname = 'stories_public_lng_range_chk'
  ) THEN
    ALTER TABLE public.stories
      ADD CONSTRAINT stories_public_lng_range_chk
      CHECK (public_lng IS NULL OR public_lng BETWEEN -180 AND 180);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.stories'::regclass
      AND conname = 'stories_public_coordinate_pair_chk'
  ) THEN
    ALTER TABLE public.stories
      ADD CONSTRAINT stories_public_coordinate_pair_chk
      CHECK ((public_lat IS NULL) = (public_lng IS NULL));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.stories'::regclass
      AND conname = 'stories_location_visibility_chk'
  ) THEN
    ALTER TABLE public.stories
      ADD CONSTRAINT stories_location_visibility_chk
      CHECK (
        location_visibility IS NULL
        OR location_visibility IN (
          'none',
          'country',
          'state',
          'city',
          'approximate',
          'map-place'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.stories'::regclass
      AND conname = 'stories_location_none_is_private_chk'
  ) THEN
    ALTER TABLE public.stories
      ADD CONSTRAINT stories_location_none_is_private_chk
      CHECK (
        location_visibility IS DISTINCT FROM 'none'
        OR (
          public_lat IS NULL
          AND public_lng IS NULL
          AND public_location_label IS NULL
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.stories'::regclass
      AND conname = 'stories_public_location_label_length_chk'
  ) THEN
    ALTER TABLE public.stories
      ADD CONSTRAINT stories_public_location_label_length_chk
      CHECK (
        public_location_label IS NULL
        OR char_length(public_location_label) <= 160
      );
  END IF;
END $$;

COMMENT ON COLUMN public.stories.public_lat IS
  'Application-adjusted approximate latitude for prayer radius search; never exact residential GPS.';
COMMENT ON COLUMN public.stories.public_lng IS
  'Application-adjusted approximate longitude for prayer radius search; never exact residential GPS.';
COMMENT ON COLUMN public.stories.public_location_label IS
  'Public-facing approximate location label such as city, region, or country.';
COMMENT ON COLUMN public.stories.location_visibility IS
  'Poster-selected public location granularity.';

CREATE INDEX IF NOT EXISTS stories_prayer_public_geo_idx
  ON public.stories (public_lat, public_lng)
  WHERE status = 'approved'
    AND removed_at IS NULL
    AND public_lat IS NOT NULL
    AND public_lng IS NOT NULL
    AND location_visibility IS DISTINCT FROM 'none'
    AND lower(coalesce(story_type, '')) LIKE '%prayer%';

-- ============================================================
-- 2) Prayer reaction uniqueness
-- ============================================================
-- Deduplicate only the prayer-specific reaction types. This avoids changing
-- unrelated legacy like/reaction behavior elsewhere in HTBF.
-- ctid is used only inside this transaction to retain one equivalent row.

DO $$
DECLARE
  deleted_count bigint;
BEGIN
  WITH ranked AS (
    SELECT
      ctid,
      row_number() OVER (
        PARTITION BY story_id, user_id, reaction_type
        ORDER BY ctid
      ) AS duplicate_rank
    FROM public.story_reactions
    WHERE reaction_type IN ('praying', 'encouraged')
      AND user_id IS NOT NULL
  )
  DELETE FROM public.story_reactions sr
  USING ranked r
  WHERE sr.ctid = r.ctid
    AND r.duplicate_rank > 1;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  IF deleted_count > 0 THEN
    RAISE NOTICE
      'Removed % duplicate prayer reaction row(s) before creating the unique index',
      deleted_count;
  END IF;
END $$;

-- If the earlier all-reaction constraint already exists, it is stronger than
-- this partial index. Otherwise, create the prayer-specific protection.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.story_reactions'::regclass
      AND conname = 'story_reactions_story_user_type_unique'
  ) THEN
    EXECUTE $sql$
      CREATE UNIQUE INDEX IF NOT EXISTS story_reactions_prayer_user_type_unique_idx
      ON public.story_reactions (story_id, user_id, reaction_type)
      WHERE reaction_type IN ('praying', 'encouraged')
        AND user_id IS NOT NULL
    $sql$;
  END IF;
END $$;

-- ============================================================
-- 3) Prayer follows
-- ============================================================

CREATE TABLE IF NOT EXISTS public.prayer_follows (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  story_id uuid NOT NULL REFERENCES public.stories (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, story_id)
);

CREATE INDEX IF NOT EXISTS prayer_follows_story_id_idx
  ON public.prayer_follows (story_id);

ALTER TABLE public.prayer_follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prayer_follows_select_own"
  ON public.prayer_follows;
CREATE POLICY "prayer_follows_select_own"
  ON public.prayer_follows
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "prayer_follows_insert_own"
  ON public.prayer_follows;
CREATE POLICY "prayer_follows_insert_own"
  ON public.prayer_follows
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND EXISTS (
      SELECT 1
      FROM public.stories s
      WHERE s.id = story_id
        AND s.status = 'approved'
        AND s.removed_at IS NULL
        AND lower(coalesce(s.story_type, '')) LIKE '%prayer%'
        AND coalesce(to_jsonb(s)->>'prayer_status', 'active') IN ('active', 'answered')
    )
  );

DROP POLICY IF EXISTS "prayer_follows_delete_own"
  ON public.prayer_follows;
CREATE POLICY "prayer_follows_delete_own"
  ON public.prayer_follows
  FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- RLS and grants are separate controls. Grant only the operations and columns
-- required by the client.
REVOKE ALL ON TABLE public.prayer_follows FROM anon, authenticated;
GRANT SELECT, DELETE ON TABLE public.prayer_follows TO authenticated;
GRANT INSERT (user_id, story_id)
  ON TABLE public.prayer_follows
  TO authenticated;

-- ============================================================
-- 4) Written prayers / encouragement notes
-- ============================================================

CREATE TABLE IF NOT EXISTS public.prayer_written_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES public.stories (id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  body text NOT NULL
    CHECK (char_length(trim(body)) BETWEEN 1 AND 2000),
  status text NOT NULL DEFAULT 'visible'
    CHECK (status IN ('visible', 'hidden', 'removed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  hidden_at timestamptz
);

-- If the table was created by an earlier partial run, add the newer timestamp.
ALTER TABLE public.prayer_written_responses
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS prayer_written_responses_story_id_idx
  ON public.prayer_written_responses (story_id, created_at DESC);

CREATE INDEX IF NOT EXISTS prayer_written_responses_author_user_id_idx
  ON public.prayer_written_responses (author_user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.set_prayer_written_response_timestamps()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();

  IF NEW.status IN ('hidden', 'removed')
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.hidden_at := coalesce(NEW.hidden_at, now());
  ELSIF NEW.status = 'visible' THEN
    NEW.hidden_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL
  ON FUNCTION public.set_prayer_written_response_timestamps()
  FROM PUBLIC;

DROP TRIGGER IF EXISTS prayer_written_responses_set_timestamps
  ON public.prayer_written_responses;
CREATE TRIGGER prayer_written_responses_set_timestamps
  BEFORE UPDATE ON public.prayer_written_responses
  FOR EACH ROW
  EXECUTE FUNCTION public.set_prayer_written_response_timestamps();

ALTER TABLE public.prayer_written_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prayer_written_responses_select_visible"
  ON public.prayer_written_responses;
DROP POLICY IF EXISTS "prayer_written_responses_select_visible_or_own"
  ON public.prayer_written_responses;
CREATE POLICY "prayer_written_responses_select_visible_or_own"
  ON public.prayer_written_responses
  FOR SELECT
  TO authenticated, anon
  USING (
    (SELECT auth.uid()) = author_user_id
    OR (
      status = 'visible'
      AND EXISTS (
        SELECT 1
        FROM public.stories s
        WHERE s.id = story_id
          AND s.status = 'approved'
          AND s.removed_at IS NULL
          AND lower(coalesce(s.story_type, '')) LIKE '%prayer%'
          AND coalesce(to_jsonb(s)->>'prayer_status', 'active') IN ('active', 'answered')
      )
    )
  );

DROP POLICY IF EXISTS "prayer_written_responses_insert_own"
  ON public.prayer_written_responses;
CREATE POLICY "prayer_written_responses_insert_own"
  ON public.prayer_written_responses
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = author_user_id
    AND EXISTS (
      SELECT 1
      FROM public.stories s
      WHERE s.id = story_id
        AND s.status = 'approved'
        AND s.removed_at IS NULL
        AND lower(coalesce(s.story_type, '')) LIKE '%prayer%'
        AND coalesce(to_jsonb(s)->>'prayer_status', 'active') = 'active'
    )
  );

DROP POLICY IF EXISTS "prayer_written_responses_delete_own"
  ON public.prayer_written_responses;
CREATE POLICY "prayer_written_responses_delete_own"
  ON public.prayer_written_responses
  FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = author_user_id);

REVOKE ALL
  ON TABLE public.prayer_written_responses
  FROM anon, authenticated;
GRANT SELECT
  ON TABLE public.prayer_written_responses
  TO anon, authenticated;
GRANT DELETE
  ON TABLE public.prayer_written_responses
  TO authenticated;
GRANT INSERT (story_id, author_user_id, body)
  ON TABLE public.prayer_written_responses
  TO authenticated;

COMMIT;

-- ============================================================
-- IMPORTANT APPLICATION-SIDE REQUIREMENTS
-- ============================================================
-- 1. This migration cannot prove that a coordinate was privacy-jittered before
--    it reached Postgres. Keep coordinate creation in a trusted server path.
-- 2. The exact stories column that controls "allow written prayers" was not
--    provided. The insert policy therefore enforces approved, active, public
--    prayer eligibility, but the server endpoint must also enforce that
--    per-request interaction setting before inserting.
-- 3. Sensitive-information detection and moderation must run in a trusted
--    server/API/Edge Function path. A client-only warning is not sufficient.
-- 4. Existing prayer rows still need a separate reviewed, rerunnable backfill.
