export function formatFeedRelativeTime(
  createdAt: string | null | undefined
): string | null {
  if (!createdAt) return null;

  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return null;

  const diffMs = Date.now() - created.getTime();
  const minutes = Math.floor(diffMs / 60000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;

  return created.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
