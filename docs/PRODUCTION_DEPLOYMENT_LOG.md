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


## Phase 4C.7B.1E.2B.0B — Service-Role Actor Guards + Retention Policy Corrections
Status: Production PASS

Deployment method:
Application-code deployment through GitHub `main` and Vercel Production. No Supabase SQL migration was required.

Production verification:
- Existing approved account deletion request remained `APPROVED — NOT YET DELETED`.
- Permanent account deletion execution remained disabled.
- No permanent-delete execution control was exposed.
- Feed, Prayer, and Journey loaded normally for a non-frozen Production user.
- Service-role normal-user mutation routes now use server-derived actor write-freeze guards.
- Public prayer/testimony retention policy preserves substantive content while modeling author identity detachment.
- Shared `story_video_replies` are no longer planned for whole-row deletion merely because one participant deletes their account.
- Live schema-readiness handling is fail-closed.
- Null-author presentation supportsure anonymized/deleted-user content.

Known future gate:
`story_video_replies` auth-user foreign keys still require future `ON DELETE SET NULL` hardening before Auth-user deletion can ever be enabled.

Execution status:
Permanent account deletion remains disabled. Database deletion executor, Auth-user deletion, profile deletion, and final destructive orchestration are not enabled.

## Phase 4C.7B.1E.2B.2 — story_video_replies Auth-FK Preservation Hardening
Status: Production PASS

Deployment method:
Supabase schema migration was manually applied by the owner through the Supabase Production SQL Editor. Application-code changes were deployed through GitHub `main` and Vercel Production.

Production database verification:
- `story_video_replies.user_id` is nullable.
- `story_video_replies.recipient_user_id` is nullable.
- `story_video_replies_user_id_fkey` now uses `ON DELETE SET NULL`.
- `story_video_replies_recipient_user_id_fkey` now uses `ON DELETE SET NULL`.
- No Auth-user CASCADE FK remains on those participant columns.
- `story_video_replies.story_id` remains `ON DELETE CASCADE`.
- `story_video_replies.parent_reply_id` remains `ON DELETE CASCADE`.
- All 52 existing `story_video_replies` rows were preserved.
- No new NULL participant rows were created by the DDL.
- No orphan Auth references were present.
- RLS remained enable
- Live schema-readiness probe includes the new story-video-reply FK prerequisites.
- Existing approved account deletion request remained unchanged and approved.

Application verification:
- Vercel Production deployment for commit `665bbecb` completed successfully.
- Admin account-deletion request still displays `APPROVED — NOT YET DELETED`.
- Permanent deletion execution remains disabled.
- No Execute/Delete Permanently control is exposed.
- Messages/Journey loaded normally in Production.
- NULL participant esentation is now modeled as `Deleted User`.

Known future gate:
`story_video_replies.parent_reply_id` still uses `ON DELETE CASCADE`. Before any future executor can hard-delete target-only/self reply rows, descendant reply-tree preservation must be proven so a surviving user's descendant reply cannot be cascade-deleted.

Execution status:
Permanent account deletion remains disabled. Database deletion executor, Auth-user deletion, profile deletion, and final destructive orchestration are not enabled.
