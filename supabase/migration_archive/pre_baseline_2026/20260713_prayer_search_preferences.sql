-- HTBF Prayer search preferences (user-owned discovery defaults)
-- Apply separately from the hardened prayer migration.
-- Stores non-precise discovery settings only — never raw GPS traces.
--
-- REVIEW NOTES:
-- - One row per user via PRIMARY KEY (user_id)
-- - ON DELETE CASCADE removes prefs when auth user is deleted
-- - RLS limits all access to auth.uid() = user_id
-- - anon has no grants
-- - preferences JSON is private to the owning user
-- - Validation trigger constrains lat/lng, radius, and search mode

BEGIN;

CREATE TABLE IF NOT EXISTS public.prayer_search_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  preferences jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.validate_prayer_search_preferences()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  mode text;
  lat numeric;
  lng numeric;
BEGIN
  IF NEW.preferences IS NULL OR jsonb_typeof(NEW.preferences) <> 'object' THEN
    RAISE EXCEPTION 'preferences must be a JSON object';
  END IF;

  mode := NEW.preferences->>'searchMode';
  IF mode IS NOT NULL AND mode NOT IN ('near-me', 'place', 'map', 'anywhere') THEN
    RAISE EXCEPTION 'invalid searchMode: %', mode;
  END IF;

  IF NEW.preferences ? 'radius' THEN
    IF jsonb_typeof(NEW.preferences->'radius') = 'number' THEN
      IF (NEW.preferences->'radius')::numeric NOT IN (5, 10, 25, 50, 100) THEN
        RAISE EXCEPTION 'invalid numeric radius';
      END IF;
    ELSIF NEW.preferences->>'radius' = 'anywhere' THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'invalid radius value';
    END IF;
  END IF;

  IF NEW.preferences ? 'center' AND NEW.preferences->'center' IS NOT NULL THEN
    lat := NULLIF(NEW.preferences->'center'->>'lat', '')::numeric;
    lng := NULLIF(NEW.preferences->'center'->>'lng', '')::numeric;

    IF lat IS NULL OR lng IS NULL THEN
      RAISE EXCEPTION 'center requires numeric lat and lng';
    END IF;

    IF lat < -90 OR lat > 90 THEN
      RAISE EXCEPTION 'center.lat out of range';
    END IF;

    IF lng < -180 OR lng > 180 THEN
      RAISE EXCEPTION 'center.lng out of range';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prayer_search_preferences_validate
  ON public.prayer_search_preferences;
CREATE TRIGGER prayer_search_preferences_validate
  BEFORE INSERT OR UPDATE ON public.prayer_search_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_prayer_search_preferences();

ALTER TABLE public.prayer_search_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prayer_search_preferences_select_own"
  ON public.prayer_search_preferences;
CREATE POLICY "prayer_search_preferences_select_own"
  ON public.prayer_search_preferences
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "prayer_search_preferences_insert_own"
  ON public.prayer_search_preferences;
CREATE POLICY "prayer_search_preferences_insert_own"
  ON public.prayer_search_preferences
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "prayer_search_preferences_update_own"
  ON public.prayer_search_preferences;
CREATE POLICY "prayer_search_preferences_update_own"
  ON public.prayer_search_preferences
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "prayer_search_preferences_delete_own"
  ON public.prayer_search_preferences;
CREATE POLICY "prayer_search_preferences_delete_own"
  ON public.prayer_search_preferences
  FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE public.prayer_search_preferences FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.prayer_search_preferences TO authenticated;

COMMIT;
