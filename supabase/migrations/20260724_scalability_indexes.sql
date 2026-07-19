-- HTBF Scalability Phase 1 — additive index recommendations (DO NOT auto-apply).
-- Review with EXPLAIN ANALYZE on staging before production rollout.
-- Each index below documents: supported query, benefit, write/storage cost, duplicates.

-- ---------------------------------------------------------------------------
-- 1) Community Feed approved stories (dominant Feed source query)
-- Query: aggregateFeedItems / loadCommunityFeedItems
--   SELECT ... FROM stories
--   WHERE status = 'approved' AND removed_at IS NULL
--   ORDER BY created_at DESC, id DESC
-- Benefit: avoids sequential scans as approved story volume grows; supports keyset pagination.
-- Write cost: one index row per approved non-removed story insert/update touching indexed columns.
-- Storage: moderate (partial index — only eligible public rows).
-- Existing equivalent: none confirmed for this predicate + sort order.
-- Partial index preferred because Feed excludes non-approved and removed rows.
CREATE INDEX IF NOT EXISTS stories_feed_approved_created_idx
  ON public.stories (created_at DESC, id DESC)
  WHERE status = 'approved'
    AND removed_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2) Prayer discovery (non-geo list head)
-- Query: loadPrayerConnectRequests base select
--   WHERE status = 'approved' AND removed_at IS NULL AND story_type ILIKE '%prayer%'
--   ORDER BY created_at DESC, id DESC
-- Benefit: faster Prayer Connect initial page + cursor pagination.
-- Write cost: low–moderate (partial index on prayer-approved rows only).
-- Storage: moderate.
-- Existing equivalent: stories_prayer_public_geo_idx covers geo/radius only, not created_at sort.
CREATE INDEX IF NOT EXISTS stories_prayer_approved_created_idx
  ON public.stories (created_at DESC, id DESC)
  WHERE status = 'approved'
    AND removed_at IS NULL
    AND lower(coalesce(story_type, '')) LIKE '%prayer%';

-- ---------------------------------------------------------------------------
-- 3) Approved video responses by parent story (Feed enrichment)
-- Query: loadParentApprovedVideoResponses
--   WHERE story_id IN (...) AND status = 'approved' [AND removed_at IS NULL]
-- Benefit: faster parent-context response rails during Feed enrichment.
-- Write cost: one index row per approved response; updates on status/removal touch index.
-- Storage: moderate.
-- Existing equivalent: prayer_video_responses_public_idx covers story_id lookups;
-- this index adds created_at ordering for response rails sorted by recency.
CREATE INDEX IF NOT EXISTS prayer_video_responses_story_approved_idx
  ON public.prayer_video_responses (story_id, created_at DESC)
  WHERE status = 'approved'
    AND removed_at IS NULL;

-- ---------------------------------------------------------------------------
-- 4) Reaction lookup by story (Feed / video-feed reaction patches)
-- Query: patchFeedReactionCountsForStories / patchVideoFeedReactionCountsForStory
--   SELECT ... FROM story_reactions WHERE story_id IN (...)
-- Benefit: faster targeted reaction count refresh instead of scanning all reactions.
-- Write cost: one index row per reaction insert/delete.
-- Storage: moderate at high reaction volume.
-- Existing equivalent: story_reactions_feed_encouragement_unique_idx is UNIQUE partial, not a lookup index.
CREATE INDEX IF NOT EXISTS story_reactions_story_id_idx
  ON public.story_reactions (story_id);

-- ---------------------------------------------------------------------------
-- 5) Blocked-user filtering (bidirectional block checks)
-- Query: loadPrayerConnectRequests / Feed safety — blocked_users by blocker or blocked user
-- Benefit: faster per-viewer block set resolution.
-- Write cost: low (sparse relative to stories).
-- Storage: low.
-- Existing equivalent: none confirmed in migrations.
CREATE INDEX IF NOT EXISTS blocked_users_blocker_idx
  ON public.blocked_users (blocker_user_id);

CREATE INDEX IF NOT EXISTS blocked_users_blocked_idx
  ON public.blocked_users (blocked_user_id);

-- ---------------------------------------------------------------------------
-- 6) Saved content lookup (Prayer saved tab)
-- Query: loadSavedStoryIds — saved_content filtered by user
-- Benefit: faster saved-tab hydration.
-- Write cost: low.
-- Storage: low.
-- Existing equivalent: unknown — table pre-dates scalability audit; verify before duplicate.
-- NOTE: Skip if saved_content_user_id_idx already exists in production.
-- CREATE INDEX IF NOT EXISTS saved_content_user_id_idx
--   ON public.saved_content (user_id);

-- ---------------------------------------------------------------------------
-- 7) Prayer follows lookup (following tab)
-- Query: loadFollowedPrayerIds — prayer_follows by user
-- Benefit: faster following-tab hydration at scale.
-- Write cost: n/a if skipped.
-- Storage: n/a if skipped.
-- Existing equivalent: PRIMARY KEY (user_id, story_id) already indexes user_id as leading column.
-- SKIPPED — would duplicate the existing primary key index.

-- ---------------------------------------------------------------------------
-- 8) Moderation queues
-- Query: admin loadStories pending filter / content_reports queue
-- Benefit: faster admin head pages for pending review workloads.
-- Write cost: moderate on status transitions.
-- Storage: moderate.
-- Existing equivalent: none for stories(status, created_at) partial pending.
CREATE INDEX IF NOT EXISTS stories_admin_pending_created_idx
  ON public.stories (created_at DESC, id DESC)
  WHERE status IN ('submitted', 'pending');

-- Admin paginates all reports by created_at DESC, id DESC.
CREATE INDEX IF NOT EXISTS content_reports_admin_created_idx
  ON public.content_reports (created_at DESC, id DESC);

-- Open/reviewing queue filter in admin UI.
CREATE INDEX IF NOT EXISTS content_reports_open_created_idx
  ON public.content_reports (created_at DESC, id DESC)
  WHERE status IN ('open', 'reviewing');
