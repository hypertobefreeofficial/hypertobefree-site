-- HTBF Prayer migration preflight (read-only)
-- Run this before the hardened migration. It changes no data.
-- to_jsonb(row) keeps the checks safe even if the new story columns do not
-- exist yet; missing keys evaluate as NULL.

-- 1) Existing coordinate/visibility data, if those columns already exist
WITH story_values AS (
  SELECT
    NULLIF(to_jsonb(s)->>'public_lat', '')::numeric AS public_lat,
    NULLIF(to_jsonb(s)->>'public_lng', '')::numeric AS public_lng,
    NULLIF(to_jsonb(s)->>'public_location_label', '') AS public_location_label,
    NULLIF(to_jsonb(s)->>'location_visibility', '') AS location_visibility
  FROM public.stories s
)
SELECT
  count(*) FILTER (
    WHERE public_lat IS NOT NULL
      AND (public_lat < -90 OR public_lat > 90)
  ) AS invalid_latitudes,
  count(*) FILTER (
    WHERE public_lng IS NOT NULL
      AND (public_lng < -180 OR public_lng > 180)
  ) AS invalid_longitudes,
  count(*) FILTER (
    WHERE (public_lat IS NULL) <> (public_lng IS NULL)
  ) AS incomplete_coordinate_pairs,
  count(*) FILTER (
    WHERE location_visibility IS NOT NULL
      AND location_visibility NOT IN (
        'none', 'country', 'state', 'city', 'approximate', 'map-place'
      )
  ) AS invalid_visibility_values,
  count(*) FILTER (
    WHERE location_visibility = 'none'
      AND (
        public_lat IS NOT NULL
        OR public_lng IS NOT NULL
        OR public_location_label IS NOT NULL
      )
  ) AS none_visibility_with_public_data
FROM story_values;

-- 2) Duplicate authenticated prayer reactions that will be deduplicated
SELECT
  story_id,
  user_id,
  reaction_type,
  count(*) AS duplicate_count
FROM public.story_reactions
WHERE reaction_type IN ('praying', 'encouraged')
  AND user_id IS NOT NULL
GROUP BY story_id, user_id, reaction_type
HAVING count(*) > 1
ORDER BY duplicate_count DESC, story_id;

-- 3) Null-user prayer reactions are not covered by authenticated uniqueness
SELECT
  reaction_type,
  count(*) AS null_user_rows
FROM public.story_reactions
WHERE reaction_type IN ('praying', 'encouraged')
  AND user_id IS NULL
GROUP BY reaction_type
ORDER BY reaction_type;

-- 4) Existing prayer requests that will still need coordinate backfill
SELECT
  count(*) AS prayer_rows_needing_backfill
FROM public.stories s
WHERE s.status = 'approved'
  AND s.removed_at IS NULL
  AND lower(coalesce(s.story_type, '')) LIKE '%prayer%'
  AND coalesce(to_jsonb(s)->>'location_visibility', 'none') <> 'none'
  AND (
    NULLIF(to_jsonb(s)->>'public_lat', '') IS NULL
    OR NULLIF(to_jsonb(s)->>'public_lng', '') IS NULL
  );
