-- Read-only verification for HTBF Scalability Phase 1 index rollout.
-- Run in staging/production SQL editor BEFORE applying 20260724_scalability_indexes.sql.
-- Safe to run repeatedly; performs no writes.

SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'stories_feed_approved_created_idx',
    'stories_prayer_approved_created_idx',
    'prayer_video_responses_story_approved_idx',
    'prayer_video_responses_public_idx',
    'story_reactions_story_id_idx',
    'story_reactions_feed_encouragement_unique_idx',
    'story_reactions_prayer_user_type_unique_idx',
    'blocked_users_blocker_idx',
    'blocked_users_blocked_idx',
    'stories_admin_pending_created_idx',
    'content_reports_open_created_idx',
    'content_reports_admin_created_idx',
    'prayer_follows_story_id_idx'
  )
ORDER BY tablename, indexname;

-- Confirm required columns exist before rollout.
SELECT
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'stories' AND column_name IN ('status', 'removed_at', 'created_at', 'id', 'story_type'))
    OR (table_name = 'prayer_video_responses' AND column_name IN ('story_id', 'status', 'removed_at', 'created_at'))
    OR (table_name = 'story_reactions' AND column_name = 'story_id')
    OR (table_name = 'blocked_users' AND column_name IN ('blocker_user_id', 'blocked_user_id'))
    OR (table_name = 'content_reports' AND column_name IN ('status', 'created_at', 'id'))
  )
ORDER BY table_name, column_name;

-- Locking note (manual review):
-- CREATE INDEX CONCURRENTLY cannot run inside a migration transaction block.
-- For populated production tables, prefer CONCURRENTLY during a maintenance window
-- and monitor pg_stat_progress_create_index.
