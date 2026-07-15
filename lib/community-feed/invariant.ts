/**
 * COMMUNITY FEED PUBLIC DISTRIBUTION INVARIANT
 *
 * Audited creation flows (Share Your Story, Prayer Connect, Creator Studio,
 * profile/journey uploads via Share Your Story, admin approval) all treat
 * `stories.status = 'approved'` as authorization for public HTBF surfaces,
 * including the Community Feed. User-facing copy confirms this ("live on HTBF",
 * admin approval links to `/feed`). There is no profile-only, room-only, or
 * unlisted flag on `stories` in the current schema.
 *
 * Therefore, for Community Feed aggregation:
 *   status = 'approved' AND removed_at IS NULL  => eligible for public feed
 *   (plus viewer block checks and parent eligibility for video responses)
 *
 * Do NOT infer feed visibility from creation_mode or story_type.
 *
 * If a future flow requires non-feed public approval, add an explicit
 * distribution column and enforce it here — do not broaden silently.
 */
export const COMMUNITY_FEED_APPROVED_IS_PUBLIC = true as const;

export const COMMUNITY_FEED_STORY_PUBLIC_STATUS = "approved" as const;

export const COMMUNITY_FEED_RESPONSE_PUBLIC_STATUS = "approved" as const;
