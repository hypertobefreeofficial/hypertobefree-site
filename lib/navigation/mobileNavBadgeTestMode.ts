export type MobileNavBadgeTestOverride = {
  prayerCount?: number;
  inboxCount?: number;
  isLoading?: boolean;
  /** Skips auth, fetch, and realtime — for deterministic Playwright UI tests */
  static?: boolean;
};

export type MobileNavBadgeDiagnostics = {
  authLookups: number;
  channelCreates: number;
  channelRemoves: number;
  fetchCalls: number;
  activeChannelName: string | null;
  providerMounts: number;
};

declare global {
  interface Window {
    __HTBF_MOBILE_NAV_BADGE_TEST__?: MobileNavBadgeTestOverride;
    __HTBF_MOBILE_NAV_BADGE_DIAG__?: MobileNavBadgeDiagnostics;
  }
}

export function readMobileNavBadgeTestOverride():
  | MobileNavBadgeTestOverride
  | undefined {
  if (typeof window === "undefined") return undefined;
  return window.__HTBF_MOBILE_NAV_BADGE_TEST__;
}

export function isStaticMobileNavBadgeTestOverride(
  override: MobileNavBadgeTestOverride | undefined
): boolean {
  return Boolean(override?.static);
}

export function getMobileNavBadgeDiagnostics(): MobileNavBadgeDiagnostics {
  if (typeof window === "undefined") {
    return {
      authLookups: 0,
      channelCreates: 0,
      channelRemoves: 0,
      fetchCalls: 0,
      activeChannelName: null,
      providerMounts: 0,
    };
  }

  if (!window.__HTBF_MOBILE_NAV_BADGE_DIAG__) {
    window.__HTBF_MOBILE_NAV_BADGE_DIAG__ = {
      authLookups: 0,
      channelCreates: 0,
      channelRemoves: 0,
      fetchCalls: 0,
      activeChannelName: null,
      providerMounts: 0,
    };
  }

  return window.__HTBF_MOBILE_NAV_BADGE_DIAG__;
}

export function recordMobileNavBadgeProviderMount() {
  getMobileNavBadgeDiagnostics().providerMounts += 1;
}

export function recordMobileNavBadgeAuthLookup() {
  getMobileNavBadgeDiagnostics().authLookups += 1;
}

export function recordMobileNavBadgeChannelCreate(channelName: string) {
  const diagnostics = getMobileNavBadgeDiagnostics();
  diagnostics.channelCreates += 1;
  diagnostics.activeChannelName = channelName;
}

export function recordMobileNavBadgeChannelRemove() {
  const diagnostics = getMobileNavBadgeDiagnostics();
  diagnostics.channelRemoves += 1;
  diagnostics.activeChannelName = null;
}

export function recordMobileNavBadgeFetchCall() {
  getMobileNavBadgeDiagnostics().fetchCalls += 1;
}
