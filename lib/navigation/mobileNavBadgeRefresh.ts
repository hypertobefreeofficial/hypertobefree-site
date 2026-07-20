export function shouldApplyMobileNavFetchResult(options: {
  generation: number;
  activeGeneration: number;
  userId: string;
  activeUserId: string | null;
}): boolean {
  return (
    options.generation === options.activeGeneration &&
    options.activeUserId === options.userId
  );
}

export function createMobileNavRefreshDebouncer(
  debounceMs: number,
  onFire: () => void
) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let fireCount = 0;

  return {
    schedule() {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      timeoutId = setTimeout(() => {
        timeoutId = null;
        fireCount += 1;
        onFire();
      }, debounceMs);
    },
    cancel() {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    },
    getFireCount() {
      return fireCount;
    },
    getPendingTimeoutId() {
      return timeoutId;
    },
  };
}
