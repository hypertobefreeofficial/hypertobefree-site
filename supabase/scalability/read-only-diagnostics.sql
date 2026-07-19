-- HTBF read-only scalability diagnostics
-- Run manually in Supabase SQL Editor (staging or production read-only role).
-- Do NOT run destructive statements. All queries below are SELECT-only.

-- =============================================================================
-- 1. Database and table sizes
-- =============================================================================

SELECT
  current_database() AS database_name,
  pg_size_pretty(pg_database_size(current_database())) AS database_size;

SELECT
  schemaname,
  relname AS table_name,
  pg_size_pretty(pg_total_relation_size(format('%I.%I', schemaname, relname))) AS total_size,
  pg_size_pretty(pg_relation_size(format('%I.%I', schemaname, relname))) AS table_size,
  pg_size_pretty(pg_total_relation_size(format('%I.%I', schemaname, relname)) - pg_relation_size(format('%I.%I', schemaname, relname))) AS index_size,
  n_live_tup AS estimated_row_count
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(format('%I.%I', schemaname, relname)) DESC
LIMIT 25;

-- =============================================================================
-- 2. Index sizes (largest first)
-- =============================================================================

SELECT
  schemaname,
  relname AS table_name,
  indexrelname AS index_name,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
  idx_scan AS index_scans,
  idx_tup_read AS tuples_read,
  idx_tup_fetch AS tuples_fetched
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC
LIMIT 40;

-- =============================================================================
-- 3. Sequential scans (possible missing indexes)
-- =============================================================================

SELECT
  schemaname,
  relname AS table_name,
  seq_scan,
  seq_tup_read,
  idx_scan,
  n_live_tup,
  CASE
    WHEN seq_scan + idx_scan = 0 THEN NULL
    ELSE round(100.0 * seq_scan / (seq_scan + idx_scan), 2)
  END AS seq_scan_pct
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY seq_tup_read DESC
LIMIT 25;

-- =============================================================================
-- 4. Unused indexes (candidates for review — do not drop without analysis)
-- =============================================================================

SELECT
  schemaname,
  relname AS table_name,
  indexrelname AS index_name,
  idx_scan,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND idx_scan = 0
ORDER BY pg_relation_size(indexrelid) DESC
LIMIT 30;

-- =============================================================================
-- 5. Cache hit ratio (database-wide)
-- =============================================================================

SELECT
  sum(heap_blks_hit) AS heap_hits,
  sum(heap_blks_read) AS heap_reads,
  CASE
    WHEN sum(heap_blks_hit) + sum(heap_blks_read) = 0 THEN NULL
    ELSE round(
      100.0 * sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read)),
      2
    )
  END AS cache_hit_ratio_pct
FROM pg_statio_user_tables;

-- =============================================================================
-- 6. Active connections and limits
-- =============================================================================

SELECT
  count(*) AS total_connections,
  count(*) FILTER (WHERE state = 'active') AS active,
  count(*) FILTER (WHERE state = 'idle') AS idle,
  count(*) FILTER (WHERE wait_event_type IS NOT NULL) AS waiting
FROM pg_stat_activity
WHERE datname = current_database();

SHOW max_connections;

-- Connection breakdown by application / user (if available)
SELECT
  usename,
  application_name,
  state,
  count(*) AS connection_count
FROM pg_stat_activity
WHERE datname = current_database()
GROUP BY 1, 2, 3
ORDER BY connection_count DESC;

-- =============================================================================
-- 7. Long-running queries (snapshot)
-- =============================================================================

SELECT
  pid,
  usename,
  application_name,
  state,
  wait_event_type,
  wait_event,
  now() - query_start AS duration,
  left(query, 200) AS query_preview
FROM pg_stat_activity
WHERE datname = current_database()
  AND state <> 'idle'
  AND pid <> pg_backend_pid()
ORDER BY query_start ASC
LIMIT 20;

-- =============================================================================
-- 8. Lock waits (snapshot)
-- =============================================================================

SELECT
  blocked.pid AS blocked_pid,
  blocked.usename AS blocked_user,
  blocking.pid AS blocking_pid,
  blocking.usename AS blocking_user,
  left(blocked.query, 120) AS blocked_query,
  left(blocking.query, 120) AS blocking_query
FROM pg_stat_activity blocked
JOIN pg_stat_activity blocking
  ON blocking.pid = ANY(pg_catalog.pg_blocking_pids(blocked.pid))
WHERE blocked.datname = current_database();

-- =============================================================================
-- 9. High-traffic table row counts (HTBF core)
-- =============================================================================

SELECT 'stories' AS table_name, count(*) AS row_count FROM public.stories
UNION ALL SELECT 'story_reactions', count(*) FROM public.story_reactions
UNION ALL SELECT 'prayer_video_responses', count(*) FROM public.prayer_video_responses
UNION ALL SELECT 'blocked_users', count(*) FROM public.blocked_users
UNION ALL SELECT 'saved_content', count(*) FROM public.saved_content
UNION ALL SELECT 'prayer_follows', count(*) FROM public.prayer_follows
UNION ALL SELECT 'content_reports', count(*) FROM public.content_reports
UNION ALL SELECT 'profiles', count(*) FROM public.profiles
UNION ALL SELECT 'story_video_replies', count(*) FROM public.story_video_replies
UNION ALL SELECT 'inbox_messages', count(*) FROM public.inbox_messages
ORDER BY row_count DESC;

-- =============================================================================
-- 10. Index definitions on core tables (verify feed/prayer patterns)
-- =============================================================================

SELECT
  t.relname AS table_name,
  i.relname AS index_name,
  pg_get_indexdef(ix.indexrelid) AS index_definition
FROM pg_class t
JOIN pg_index ix ON t.oid = ix.indrelid
JOIN pg_class i ON i.oid = ix.indexrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public'
  AND t.relname IN (
    'stories',
    'story_reactions',
    'prayer_video_responses',
    'blocked_users',
    'saved_content',
    'prayer_follows',
    'content_reports',
    'profiles',
    'story_video_replies',
    'inbox_messages'
  )
ORDER BY t.relname, i.relname;

-- =============================================================================
-- 11. RLS status on core tables
-- =============================================================================

SELECT
  schemaname,
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'stories',
    'story_reactions',
    'prayer_video_responses',
    'blocked_users',
    'saved_content',
    'prayer_follows',
    'content_reports',
    'profiles',
    'story_video_replies',
    'inbox_messages',
    'prayer_hidden_stories',
    'prayer_written_responses'
  )
ORDER BY tablename;

-- =============================================================================
-- 12. Policy listing (review filter columns for index needs)
-- =============================================================================

SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'stories',
    'story_reactions',
    'prayer_video_responses',
    'blocked_users',
    'saved_content',
    'content_reports'
  )
ORDER BY tablename, policyname;

-- =============================================================================
-- 13. Stories feed-shaped query EXPLAIN (read-only plan check)
-- Replace limits for realistic staging volumes.
-- =============================================================================

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, user_id, status, created_at, story_type
FROM public.stories
WHERE status = 'approved'
  AND (removed_at IS NULL)
ORDER BY created_at DESC, id DESC
LIMIT 50;

-- Prayer geo-filter shape (if columns exist)
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, public_lat, public_lng, created_at
FROM public.stories
WHERE status = 'approved'
  AND removed_at IS NULL
  AND story_type ILIKE '%prayer%'
  AND public_lat IS NOT NULL
  AND public_lng IS NOT NULL
ORDER BY created_at DESC
LIMIT 300;

-- =============================================================================
-- 14. pg_stat_statements (if extension enabled — may error if not installed)
-- =============================================================================

-- Uncomment if pg_stat_statements is enabled on your project:
--
-- SELECT
--   calls,
--   round(total_exec_time::numeric, 2) AS total_ms,
--   round(mean_exec_time::numeric, 2) AS mean_ms,
--   rows,
--   left(query, 180) AS query_preview
-- FROM pg_stat_statements
-- ORDER BY total_exec_time DESC
-- LIMIT 25;

-- =============================================================================
-- Notes
-- =============================================================================
-- * Supabase Realtime connection counts are visible in the dashboard, not SQL.
-- * Storage egress / operation metrics are in Storage dashboard.
-- * For slow queries over time, enable Query Performance in Supabase Reports.
