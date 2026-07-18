export function canManageOtherUserContent(
  viewerUserId: string | null | undefined,
  authorUserId: string | null | undefined
) {
  return Boolean(authorUserId && viewerUserId !== authorUserId);
}
