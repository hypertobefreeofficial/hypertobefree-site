# HTBF Production Deployment Log

## Phase 4C.7B.1E.2A — Account Deletion Schema Hardening
Status: Production PASS

Migration:
`20260830100000_account_deletion_schema_hardening_phase4c7b1e2a.sql`

Deployment method:
Applied manually through the Supabase Production SQL Editor.

Production verification:
- `stories.user_id` is nullable.
- `prayer_video_responses.user_id` is nullable.
- `prayer_written_responses.author_user_id` is nullable.
- `prayer_updates.author_user_id` is nullable.
- `inbox_messages.prayer_update_id` is nullable.
- `content_reports.story_id` is nullable.
- The five targeted foreign keys now use `ON DELETE SET NULL`.
- Existing account deletion request data remained intact.
- Production admin/account deletion UI loaded successfully after deployment.
- Approved deletion request remained `APPROVED — NOT YET DELETED`.
- Permanent account deletion execution remained disabled.
- No destructive execution control was exposed in Production.
wn migration-history condition:
This migration was applied manually through the Supabase SQL Editor. The Supabase migration history table may not contain version `20260830100000`, even though the Production schema changes are present and verified.

Operational warning:
Do not assume `supabase_migrations.schema_migrations` fully represents the actual Production schema. Do not use automated Supabase migration push workflows until migration history is deliberately reconciled.

## Phase 4C.7B.1E.2B.0A — Account Deletion Write-Freeze Database Foundation
Status: Production PASS

Migration:
`20260830110000_account_deletion_write_freeze_phase4c7b1e2b0a.sql`

Deployment method:
Applied manually through the Supabase Production SQL Editor.

Production verification:
- `current_user_account_write_blocked()` is installed with the expected SECURITY DEFINER, STABLE, owner, and search-path properties.
- 45 command-specific RESTRICTIVE write-freeze policies are present across the protected public tables and `storage.objects`.
- Write-freeze policies cover INSERT, UPDATE, and DELETE without restricting normal SELECT/read access.
- `verify_account_deletion_schema_execution_ready()` returned `ready: true` against the live Production catalog.
- `account_deletion_requests_submission_guard` is installed and enabled.
- Existing approved account deletion request remained `approved` and was not moved to `deletion_in_progress`.
- Normal non-frozenroduction Feed access continued to work after deployment.
- Permanent account deletion execution remains disabled.

Known limitation:
Service-role API mutation paths are not yet covered by the write-freeze and remain Phase 4C.7B.1E.2B.0B work. Permanent deletion execution must remain disabled until those actor guards are implemented and verified.

Migration-history condition:
This migration was applied manually through the Supabase SQL Editor. Do not assume `supabase_migrations.schema_migrations` reflects the actual Production schema.

Operational warning:
Do not use automated Supabase migration push workflows until migration history is deliberately reconciled.

