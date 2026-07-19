"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Globe2,
  LayoutGrid,
  List,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { loadPrayerConnectRequests, PRAYER_CONNECT_MAX_ACCUMULATED } from "../../lib/prayer-connect/loadPrayerConnectRequests";
import { geocodePlaceQuery } from "../../lib/prayer-connect/geocodePlace";
import { supabase } from "../../lib/supabaseClient";
import type {
  PrayerConnectCategoryFilter,
  PrayerConnectRadiusMiles,
  PrayerConnectRequest,
  PrayerConnectSearchCenter,
  PrayerConnectSearchMode,
  PrayerConnectSort,
} from "../../lib/prayer-connect/types";
import {
  PRAYER_CONNECT_CATEGORIES,
  PRAYER_CONNECT_SORTS,
  filterAndSortPrayerRequests,
  filterPrayerRequestsByContent,
} from "../../lib/prayer-connect/utils";
import {
  loadFollowedPrayerIds,
  loadSavedStoryIds,
  loadUserPrayerReactions,
  toggleFollowedPrayer,
  toggleSavedStory,
} from "../../lib/prayer-connect/persistence";
import { blockUser, loadBlockedUserIds } from "../../lib/prayer-connect/blocking";
import {
  hidePrayer,
  loadHiddenPrayerIds,
  migrateLegacyHiddenPrayers,
  readHiddenPrayerCache,
} from "../../lib/prayer-connect/hiddenPrayers";
import { isMockPrayerMode } from "../../lib/prayer-connect/mockMode";
import PrayerConfirmDialog from "./PrayerConfirmDialog";
import PrayerReportModal, {
  type PrayerReportContentType,
} from "./PrayerReportModal";
import { type PrayerActionItem } from "./PrayerActionMenu";
import {
  Ban,
  Bell,
  Bookmark,
  EyeOff,
  Flag,
  Link2,
  Pencil,
  Share2,
  UserRound,
} from "lucide-react";
import { MOCK_SAVED_STORY_IDS } from "../../lib/prayer-connect/mockPrayerData";
import {
  buildSearchSummary,
  clearLocalPrayerSearch,
  DEFAULT_PRAYER_SEARCH,
  loadPrayerSearchPreferences,
  savePrayerSearchPreferences,
  type PrayerSearchPreferences,
} from "../../lib/prayer-connect/searchPreferences";
import PrayerConnectCard from "./PrayerConnectCard";
import PrayerConnectDetail from "./PrayerConnectDetail";
import PrayerExperienceHeader from "./PrayerExperienceHeader";
import PrayerMapPanel from "./PrayerMapPanel";
import PrayerMyRequestsPanel from "./PrayerMyRequestsPanel";
import PrayerPostComposer from "./PrayerPostComposer";
import PrayerSearchRail from "./PrayerSearchRail";
import PrayerSearchSetup from "./PrayerSearchSetup";
import PrayerSearchSummaryBar from "./PrayerSearchSummaryBar";
import PrayerSpotlight from "./PrayerSpotlight";
import { type PrayerViewTab } from "./PrayerSectionNav";
import { useIsMobile } from "./useIsMobile";
import PrayerMobileHeader from "./PrayerMobileHeader";
import PrayerMobileMenu from "./PrayerMobileMenu";
import PrayerHiddenPanel from "./PrayerHiddenPanel";
import PrayerMobileOverflowMenu from "./PrayerMobileOverflowMenu";
import PrayerMobileControls from "./PrayerMobileControls";
import PrayerMobileCardGrid from "./PrayerMobileCardGrid";
import styles from "./PrayerConnect.module.css";

function parseTab(value: string | null): PrayerViewTab {
  if (
    value === "following" ||
    value === "my-requests" ||
    value === "saved" ||
    value === "answered"
  ) {
    return value;
  }
  return "discover";
}

export default function PrayerConnectExperience() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<PrayerViewTab>("discover");
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading"
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [requests, setRequests] = useState<PrayerConnectRequest[]>([]);
  const [searchMode, setSearchMode] =
    useState<PrayerConnectSearchMode>("near-me");
  const [radius, setRadius] = useState<PrayerConnectRadiusMiles>(25);
  const [category, setCategory] =
    useState<PrayerConnectCategoryFilter>("all");
  const [sort, setSort] = useState<PrayerConnectSort>("needs-prayer");
  const [mediaFilter, setMediaFilter] = useState<"all" | "video" | "photo" | "text">(
    "all"
  );
  const [placeQuery, setPlaceQuery] = useState("");
  const [center, setCenter] = useState<PrayerConnectSearchCenter | null>(null);
  const [pendingMapCenter, setPendingMapCenter] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"requests" | "map">("requests");
  const [howOpen, setHowOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const [followAvailable, setFollowAvailable] = useState(true);
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [blockedUserIds, setBlockedUserIds] = useState<string[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [cardReportTarget, setCardReportTarget] = useState<{
    contentType: PrayerReportContentType;
    reportedUserId: string | null;
    storyId: string;
    subjectLabel: string;
  } | null>(null);
  const [cardBlockUserId, setCardBlockUserId] = useState<string | null>(null);
  const [cardBlocking, setCardBlocking] = useState(false);
  const [cardBlockError, setCardBlockError] = useState<string | null>(null);
  const [userReactions, setUserReactions] = useState<Map<string, Set<string>>>(
    new Map()
  );
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [myRefreshKey, setMyRefreshKey] = useState(0);
  const [searchConfigured, setSearchConfigured] = useState(false);
  const [searchSetupOpen, setSearchSetupOpen] = useState(false);
  const [prefsHydrated, setPrefsHydrated] = useState(false);
  const [visibleCount, setVisibleCount] = useState(12);
  const [prayerNextCursor, setPrayerNextCursor] = useState<string | null>(null);
  const [prayerHasMore, setPrayerHasMore] = useState(false);
  const [loadingMorePrayers, setLoadingMorePrayers] = useState(false);
  const [resultsLayout, setResultsLayout] = useState<"grid" | "list">("grid");
  const [contentQuery, setContentQuery] = useState("");
  const [debouncedContentQuery, setDebouncedContentQuery] = useState("");
  const isMobile = useIsMobile();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [hiddenPanelOpen, setHiddenPanelOpen] = useState(false);
  const [mobileOverflowOpen, setMobileOverflowOpen] = useState(false);
  const [mobileSearchActive, setMobileSearchActive] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const savedScroll = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("htbf-prayer-results-layout");
    if (stored === "grid" || stored === "list") {
      setResultsLayout(stored);
    }
  }, []);

  useEffect(() => {
    setActiveTab(parseTab(searchParams.get("tab")));
  }, [searchParams]);

  // Debounce content search so filtering only runs after the user pauses.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedContentQuery(contentQuery);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [contentQuery]);

  const persistSearchPreferences = useCallback(
    async (configured = true) => {
      const prefs: PrayerSearchPreferences = {
        ...DEFAULT_PRAYER_SEARCH,
        configured,
        searchMode,
        center,
        radius,
        category,
        sort,
        mediaFilter,
        mobileView,
        placeQuery,
      };
      setSearchConfigured(configured);
      await savePrayerSearchPreferences(userId, prefs);
    },
    [
      userId,
      searchMode,
      center,
      radius,
      category,
      sort,
      mediaFilter,
      mobileView,
      placeQuery,
    ]
  );

  useEffect(() => {
    async function hydrateSearch() {
      const loaded = await loadPrayerSearchPreferences(userId);
      if (loaded.prefs.configured) {
        setSearchMode(loaded.prefs.searchMode);
        setCenter(loaded.prefs.center);
        setRadius(loaded.prefs.radius);
        setCategory(loaded.prefs.category);
        setSort(loaded.prefs.sort);
        setMediaFilter(loaded.prefs.mediaFilter);
        setMobileView(loaded.prefs.mobileView);
        setPlaceQuery(loaded.prefs.placeQuery);
        setSearchConfigured(true);
        setSearchSetupOpen(false);
      } else {
        setSearchMode("anywhere");
        setCenter(null);
        setRadius("anywhere");
        setSearchConfigured(false);
        setSearchSetupOpen(false);
      }
      setPrefsHydrated(true);
    }
    void hydrateSearch();
  }, [userId]);

  useEffect(() => {
    const storyId = searchParams.get("story");
    if (storyId && requests.length > 0) {
      setSelectedId(storyId);
    }
  }, [searchParams, requests]);

  useEffect(() => {
    if (!prefsHydrated || !searchConfigured || searchSetupOpen) return;
    const timer = window.setTimeout(() => {
      void persistSearchPreferences(true);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [
    prefsHydrated,
    searchConfigured,
    searchSetupOpen,
    persistSearchPreferences,
  ]);

  function resetSearch() {
    clearLocalPrayerSearch();
    setSearchMode("anywhere");
    setCenter(null);
    setRadius("anywhere");
    setCategory("all");
    setSort("needs-prayer");
    setMediaFilter("all");
    setMobileView("requests");
    setPlaceQuery("");
    setPendingMapCenter(null);
    setGeoError(null);
    setSearchConfigured(false);
    setSearchSetupOpen(false);
    void savePrayerSearchPreferences(userId, DEFAULT_PRAYER_SEARCH);
  }

  function completeSearchSetup() {
    setSearchConfigured(true);
    setSearchSetupOpen(false);
    void persistSearchPreferences(true);
  }

  const searchSummary = useMemo(
    () => buildSearchSummary({
      ...DEFAULT_PRAYER_SEARCH,
      configured: searchConfigured,
      searchMode,
      center,
      radius,
      category,
      sort,
      mediaFilter,
      mobileView,
      placeQuery,
    }),
    [
      searchConfigured,
      searchMode,
      center,
      radius,
      category,
      sort,
      mediaFilter,
      mobileView,
      placeQuery,
    ]
  );

  const sortLabel =
    PRAYER_CONNECT_SORTS.find((item) => item.id === sort)?.label || "Most recent";
  const mediaLabel =
    mediaFilter === "all"
      ? "All media"
      : mediaFilter === "video"
        ? "Video"
        : mediaFilter === "photo"
          ? "Photo"
          : "Text";

  const refresh = useCallback(async () => {
    setLoadState("loading");
    setErrorMessage(null);
    setVisibleCount(12);
    const result = await loadPrayerConnectRequests({
      viewerUserId: userId,
    });
    if (result.ok === false) {
      setLoadState("error");
      // Never surface Supabase keys, env-var names, or raw errors to users.
      // Log the technical detail internally and show a calm message instead.
      if (process.env.NODE_ENV !== "production") {
        console.error("Prayer load failed:", result.reason, result.message);
      }
      setErrorMessage(
        result.reason === "offline"
          ? "You appear to be offline. Reconnect to load prayer requests."
          : "We couldn't load prayer requests right now. Please try again in a moment."
      );
      return;
    }
    setRequests(result.requests);
    setPrayerNextCursor(result.nextCursor);
    setPrayerHasMore(result.hasMore);
    setLoadState("ready");
  }, [userId]);

  const loadMorePrayersFromServer = useCallback(async () => {
    if (!prayerHasMore || !prayerNextCursor || loadingMorePrayers) return false;
    if (requests.length >= PRAYER_CONNECT_MAX_ACCUMULATED) return false;

    setLoadingMorePrayers(true);
    try {
      const result = await loadPrayerConnectRequests({
        viewerUserId: userId,
        cursor: prayerNextCursor,
      });
      if (result.ok === false) return false;
      setRequests((current) => [...current, ...result.requests]);
      setPrayerNextCursor(result.nextCursor);
      setPrayerHasMore(result.hasMore);
      return true;
    } finally {
      setLoadingMorePrayers(false);
    }
  }, [
    loadingMorePrayers,
    prayerHasMore,
    prayerNextCursor,
    requests.length,
    userId,
  ]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrapPrayerExperience() {
      setLoadState("loading");
      setErrorMessage(null);
      setVisibleCount(12);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;

      const nextUserId = user?.id ?? null;
      setUserId(nextUserId);

      if (!user) {
        setHiddenIds([]);
        setSavedIds(isMockPrayerMode() ? MOCK_SAVED_STORY_IDS : []);
        setFollowingIds([]);
        setBlockedUserIds([]);
        setUserReactions(new Map());
      } else {
        setHiddenIds(readHiddenPrayerCache(user.id));
        try {
          await migrateLegacyHiddenPrayers(user.id);
          const [saved, followed, blocked, hidden] = await Promise.all([
            loadSavedStoryIds(user.id),
            loadFollowedPrayerIds(user.id),
            loadBlockedUserIds(user.id),
            loadHiddenPrayerIds(user.id),
          ]);
          if (cancelled) return;
          setSavedIds(saved);
          setFollowingIds(followed.ids);
          setFollowAvailable(followed.available);
          setBlockedUserIds(blocked);
          setHiddenIds(hidden.ids);
        } catch (error) {
          console.error("Could not load prayer account state:", error);
        }
      }

      const result = await loadPrayerConnectRequests({
        viewerUserId: nextUserId,
      });
      if (cancelled) return;

      if (result.ok === false) {
        setLoadState("error");
        if (process.env.NODE_ENV !== "production") {
          console.error("Prayer load failed:", result.reason, result.message);
        }
        setErrorMessage(
          result.reason === "offline"
            ? "You appear to be offline. Reconnect to load prayer requests."
            : "We couldn't load prayer requests right now. Please try again in a moment."
        );
        return;
      }

      setRequests(result.requests);
      setPrayerNextCursor(result.nextCursor);
      setPrayerHasMore(result.hasMore);
      setLoadState("ready");
    }

    void bootstrapPrayerExperience();

    return () => {
      cancelled = true;
    };
  }, [myRefreshKey]);

  useEffect(() => {
    async function loadReactions() {
      if (!userId || requests.length === 0) {
        setUserReactions(new Map());
        return;
      }
      try {
        const map = await loadUserPrayerReactions(
          userId,
          requests.map((item) => item.id)
        );
        setUserReactions(map);
      } catch (error) {
        console.error("Could not load prayer reactions:", error);
      }
    }
    void loadReactions();
  }, [userId, requests]);

  // Private per-user filtering: hidden prayers and blocked authors never appear
  // in any prayer view. This does not affect anyone else's experience.
  const unhiddenRequests = useMemo(() => {
    if (hiddenIds.length === 0 && blockedUserIds.length === 0) return requests;
    const hiddenSet = new Set(hiddenIds);
    const blockedSet = new Set(blockedUserIds);
    return requests.filter(
      (item) =>
        !hiddenSet.has(item.id) &&
        !(item.userId && blockedSet.has(item.userId))
    );
  }, [requests, hiddenIds, blockedUserIds]);

  const discoverFiltered = useMemo(() => {
    const sortForFilter: PrayerConnectSort =
      mediaFilter === "video"
        ? "video"
        : mediaFilter === "photo"
          ? "photo"
          : mediaFilter === "text"
            ? "text"
            : sort;

    return filterAndSortPrayerRequests(unhiddenRequests, {
      center,
      radius,
      category,
      sort: sortForFilter,
      searchMode,
    });
  }, [unhiddenRequests, center, radius, category, sort, searchMode, mediaFilter]);

  const tabRequests = useMemo(() => {
    let items: PrayerConnectRequest[];
    if (activeTab === "following") {
      items = unhiddenRequests.filter((item) =>
        followingIds.includes(item.id)
      );
    } else if (activeTab === "saved") {
      items = unhiddenRequests.filter((item) => savedIds.includes(item.id));
    } else if (activeTab === "answered") {
      items = unhiddenRequests.filter(
        (item) => item.prayerStatus === "answered"
      );
    } else {
      items = discoverFiltered;
    }

    return filterPrayerRequestsByContent(items, debouncedContentQuery);
  }, [
    activeTab,
    unhiddenRequests,
    followingIds,
    savedIds,
    discoverFiltered,
    debouncedContentQuery,
  ]);

  async function handleHidePrayer(id: string) {
    if (!userId) {
      setAuthMessage("Please sign in to hide prayers across your devices.");
      return;
    }
    try {
      const next = await hidePrayer(userId, id);
      setHiddenIds(next);
      setAuthMessage(
        "Prayer hidden. Open Hidden prayers in the menu to restore it."
      );
      await refresh();
    } catch (error) {
      console.error("Hide prayer failed:", error);
      setAuthMessage(
        error instanceof Error ? error.message : "Could not hide this prayer."
      );
    }
  }

  function handleBlockedUser(blockedUserId: string) {
    setBlockedUserIds((current) =>
      current.includes(blockedUserId) ? current : [...current, blockedUserId]
    );
  }

  async function confirmCardBlock() {
    if (!cardBlockUserId || cardBlocking) return;
    if (!userId) {
      setCardBlockError("Please sign in to block someone.");
      return;
    }
    setCardBlocking(true);
    setCardBlockError(null);
    try {
      await blockUser(userId, cardBlockUserId);
      handleBlockedUser(cardBlockUserId);
      setCardBlockUserId(null);
      setCardBlocking(false);
    } catch (error) {
      console.error("Block user failed:", error);
      setCardBlockError(
        error instanceof Error ? error.message : "Could not block this user."
      );
      setCardBlocking(false);
    }
  }

  async function copyPrayerLink(id: string) {
    const url = `${window.location.origin}/prayer?story=${id}`;
    try {
      await navigator.clipboard.writeText(url);
      setAuthMessage("Prayer link copied.");
    } catch {
      setAuthMessage(url);
    }
  }

  async function sharePrayer(request: PrayerConnectRequest) {
    const url = `${window.location.origin}/prayer?story=${request.id}`;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: request.title, url });
        return;
      } catch {
        // fall through to clipboard on cancel/failure
      }
    }
    await copyPrayerLink(request.id);
  }

  function buildCardMenuItems(
    request: PrayerConnectRequest
  ): PrayerActionItem[] {
    const isOwner = Boolean(request.userId) && request.userId === userId;
    if (isOwner) {
      return [
        {
          id: "edit",
          label: "Edit prayer",
          icon: Pencil,
          onSelect: () => router.push("/prayer?tab=my-requests"),
        },
        {
          id: "update",
          label: "Post an update",
          icon: Bell,
          onSelect: () => router.push("/prayer?tab=my-requests"),
        },
      ];
    }
    const isSaved = savedIds.includes(request.id);
    return [
      {
        id: "save",
        label: isSaved ? "Remove from Saved" : "Save prayer",
        icon: Bookmark,
        onSelect: () => void toggleSave(request.id),
      },
      {
        id: "share",
        label: "Share prayer",
        icon: Share2,
        onSelect: () => void sharePrayer(request),
      },
      {
        id: "copy",
        label: "Copy prayer link",
        icon: Link2,
        onSelect: () => void copyPrayerLink(request.id),
      },
      {
        id: "profile",
        label: "View profile",
        icon: UserRound,
        disabled: !request.userId || request.isAnonymous,
        onSelect: () => request.userId && router.push(`/profile/${request.userId}`),
      },
      {
        id: "hide",
        label: "Hide this prayer",
        icon: EyeOff,
        onSelect: () => handleHidePrayer(request.id),
      },
      {
        id: "report",
        label: "Report to Admin",
        icon: Flag,
        onSelect: () =>
          setCardReportTarget({
            contentType: "prayer_request",
            reportedUserId: request.userId,
            storyId: request.id,
            subjectLabel: "this prayer",
          }),
      },
      {
        id: "block",
        label: "Block user",
        icon: Ban,
        danger: true,
        disabled: !request.userId,
        onSelect: () => setCardBlockUserId(request.userId),
      },
    ];
  }

  const selected = useMemo(
    () =>
      tabRequests.find((item) => item.id === selectedId) ??
      requests.find((item) => item.id === selectedId) ??
      null,
    [tabRequests, requests, selectedId]
  );

  function openRequest(id: string) {
    savedScroll.current =
      typeof window !== "undefined"
        ? window.scrollY
        : scrollRef.current?.scrollTop ?? 0;
    setSelectedId(id);
    const params = new URLSearchParams(searchParams.toString());
    params.set("story", id);
    router.replace(`/prayer?${params.toString()}`, { scroll: false });
  }

  function closeRequest() {
    setSelectedId(null);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("story");
    const next = params.toString();
    router.replace(next ? `/prayer?${next}` : "/prayer", { scroll: false });
    requestAnimationFrame(() => {
      if (typeof window !== "undefined") {
        window.scrollTo({ top: savedScroll.current });
      } else if (scrollRef.current) {
        scrollRef.current.scrollTop = savedScroll.current;
      }
    });
  }

  async function toggleSave(id: string) {
    setAuthMessage(null);
    if (!userId) {
      setAuthMessage("Sign in to save prayer requests across your devices.");
      return;
    }
    const currentlySaved = savedIds.includes(id);
    try {
      const next = await toggleSavedStory(userId, id, currentlySaved);
      setSavedIds((current) =>
        next
          ? current.includes(id)
            ? current
            : [...current, id]
          : current.filter((item) => item !== id)
      );
    } catch (error) {
      setAuthMessage(
        error instanceof Error ? error.message : "Could not update saved prayer."
      );
    }
  }

  async function toggleFollow(id: string) {
    setAuthMessage(null);
    if (!userId) {
      setAuthMessage("Sign in to follow prayer requests across your devices.");
      return;
    }
    if (!followAvailable) {
      setAuthMessage(
        "Following isn't available right now. Please try again later."
      );
      return;
    }
    const currentlyFollowing = followingIds.includes(id);
    try {
      const next = await toggleFollowedPrayer(userId, id, currentlyFollowing);
      setFollowingIds((current) =>
        next
          ? current.includes(id)
            ? current
            : [...current, id]
          : current.filter((item) => item !== id)
      );
    } catch (error) {
      setAuthMessage(
        error instanceof Error ? error.message : "Could not update follow."
      );
    }
  }

  async function useNearMe() {
    setGeoError(null);
    setSearchMode("near-me");

    if (!navigator.geolocation) {
      setGeoError(
        "Location is unavailable on this device. Try ZIP code, city, or Choose on Map."
      );
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCenter({
          lat: Math.round(position.coords.latitude * 100) / 100,
          lng: Math.round(position.coords.longitude * 100) / 100,
          label: "Near your current area",
        });
        if (radius === "anywhere") setRadius(25);
        completeSearchSetup();
      },
      () => {
        setGeoError(
          "Location permission was denied. Try ZIP code, city, or Choose on Map."
        );
      },
      { enableHighAccuracy: false, timeout: 12000 }
    );
  }

  async function searchPlace() {
    setGeoError(null);
    setSearchMode("place");
    const result = await geocodePlaceQuery(placeQuery);
    if (!result) {
      setGeoError(
        "Could not find that place. Try a city, state, ZIP, or country."
      );
      return;
    }
    setCenter({
      lat: result.lat,
      lng: result.lng,
      label: result.label,
    });
    if (radius === "anywhere") setRadius(25);
    completeSearchSetup();
  }

  function chooseAnywhere() {
    setSearchMode("anywhere");
    setCenter(null);
    setRadius("anywhere");
    setPendingMapCenter(null);
    setGeoError(null);
    completeSearchSetup();
  }

  function applyMapSearch() {
    if (!pendingMapCenter) return;
    setSearchMode("map");
    setCenter({
      ...pendingMapCenter,
      label: "Selected map area",
    });
    if (radius === "anywhere") setRadius(25);
    completeSearchSetup();
  }

  function bumpRadius() {
    const order: PrayerConnectRadiusMiles[] = [5, 10, 25, 50, 100, "anywhere"];
    const index = order.indexOf(radius);
    setRadius(order[Math.min(order.length - 1, index + 1)]);
  }

  function changeResultsLayout(layout: "grid" | "list") {
    setResultsLayout(layout);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("htbf-prayer-results-layout", layout);
    }
  }

  function openMapView() {
    setActiveTab("discover");
    setSearchMode((mode) => (mode === "anywhere" ? "map" : mode));
    setMobileView("map");
  }

  const showDiscoverChrome = activeTab === "discover";
  const showSearchSummary = showDiscoverChrome && searchConfigured;
  const showFirstTimeRail = showDiscoverChrome && !searchConfigured;
  const showSearchSetupModal =
    searchSetupOpen && (isMobile || (showDiscoverChrome && searchConfigured));

  // First visit keeps the map prominent while a location is chosen.
  // Returning users default to a full-width grid; the map is opt-in.
  const isFirstVisit = showDiscoverChrome && !searchConfigured;
  const mapVisible =
    showDiscoverChrome && (isFirstVisit || mobileView === "map");
  const fullWidthResults = !mapVisible;

  useEffect(() => {
    setVisibleCount(12);
  }, [
    activeTab,
    mobileView,
    sort,
    category,
    mediaFilter,
    center,
    radius,
    searchMode,
    debouncedContentQuery,
    resultsLayout,
  ]);

  const visibleRequests = tabRequests.slice(0, visibleCount);
  const hasMoreRequests =
    tabRequests.length > visibleCount ||
    (prayerHasMore && requests.length < PRAYER_CONNECT_MAX_ACCUMULATED);

  function revealMorePrayerRequests() {
    if (tabRequests.length > visibleCount) {
      setVisibleCount((count) => count + 12);
      return;
    }
    if (prayerHasMore) {
      void loadMorePrayersFromServer().then((loaded) => {
        if (loaded) {
          setVisibleCount((count) => count + 12);
        }
      });
    }
  }

  const spotlightRequest = useMemo(() => {
    if (!showDiscoverChrome || discoverFiltered.length === 0) return null;
    const urgent = discoverFiltered.find((item) => item.isUrgent);
    if (urgent) return urgent;
    return [...discoverFiltered].sort((a, b) => a.prayingCount - b.prayingCount)[0];
  }, [showDiscoverChrome, discoverFiltered]);

  const activeContentQuery = debouncedContentQuery.trim();
  const contentSearching = contentQuery.trim() !== activeContentQuery;
  const nearbyCountLabel =
    loadState === "loading"
      ? "Searching nearby requests…"
      : contentSearching
        ? "Searching prayers…"
        : activeContentQuery
          ? `${tabRequests.length} result${
              tabRequests.length === 1 ? "" : "s"
            } for “${activeContentQuery}”`
          : `${tabRequests.length} request${
              tabRequests.length === 1 ? "" : "s"
            } nearby`;

  const mobileLocationLabel = searchConfigured
    ? `${searchSummary.location}${
        typeof radius === "number" ? ` · ${radius} mi` : ""
      }`
    : "Choose your area";

  const searchSetupProps = {
    searchMode,
    radius,
    category,
    sort,
    mediaFilter,
    placeQuery,
    center,
    geoError,
    authMessage,
    onSearchModeChange: setSearchMode,
    onPlaceQueryChange: setPlaceQuery,
    onRadiusChange: setRadius,
    onCategoryChange: setCategory,
    onSortChange: setSort,
    onMediaFilterChange: setMediaFilter,
    onNearMe: () => void useNearMe(),
    onSearchPlace: () => void searchPlace(),
    onChooseAnywhere: chooseAnywhere,
    onOpenMap: () => {
      setSearchMode("map");
      setMobileView("map");
    },
    onSave: completeSearchSetup,
  };

  return (
    <>
    <div className={styles.prayerViewport}>
        {isMobile ? (
          <>
            <PrayerMobileHeader
              onOpenMenu={() => setMobileMenuOpen(true)}
              onToggleSearch={() => setMobileSearchActive((value) => !value)}
              onOpenOverflow={() => setMobileOverflowOpen(true)}
              searchActive={mobileSearchActive}
            />
            {isMobile && showDiscoverChrome && mobileView === "map" ? null : (
            <PrayerMobileControls
              activeTab={activeTab}
              onSelectTab={setActiveTab}
              showDiscoverControls={activeTab !== "my-requests"}
              locationLabel={mobileLocationLabel}
              onOpenLocation={() => setSearchSetupOpen(true)}
              searchActive={mobileSearchActive && activeTab !== "my-requests"}
              contentQuery={contentQuery}
              onContentQueryChange={setContentQuery}
              onClearSearch={() => {
                setContentQuery("");
                setDebouncedContentQuery("");
              }}
              resultCountLabel={nearbyCountLabel}
            />
            )}
          </>
        ) : (
          <PrayerExperienceHeader
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onPost={() => setComposerOpen(true)}
            onHowItWorks={() => setHowOpen(true)}
            onOpenHidden={userId ? () => setHiddenPanelOpen(true) : undefined}
            compact={searchConfigured}
          />
        )}

        {activeTab === "my-requests" ? (
          <PrayerMyRequestsPanel
            onOpenPost={() => setComposerOpen(true)}
            refreshKey={myRefreshKey}
          />
        ) : null}

        {activeTab !== "my-requests" ? (
          <section className={styles.prayerDiscover}>
            {!isMobile && showSearchSummary ? (
              <PrayerSearchSummaryBar
                locationLine={searchSummary.location}
                filterLine={`${searchSummary.radius} · ${sortLabel} · ${mediaLabel}`}
                viewMode={mobileView}
                onViewMap={() => setMobileView("map")}
                onReturnToRequests={() => setMobileView("requests")}
                onChangeLocation={() => setSearchSetupOpen(true)}
                onRadius={() => setSearchSetupOpen(true)}
                onFilters={() => setFiltersOpen(true)}
                onReset={resetSearch}
              />
            ) : null}

            {!isMobile && showFirstTimeRail ? (
              <PrayerSearchRail
                searchMode={searchMode}
                radius={radius}
                placeQuery={placeQuery}
                geoError={geoError}
                onSearchModeChange={setSearchMode}
                onPlaceQueryChange={setPlaceQuery}
                onRadiusChange={setRadius}
                onNearMe={() => void useNearMe()}
                onSearchPlace={() => void searchPlace()}
                onChooseAnywhere={chooseAnywhere}
                onOpenMap={() => {
                  setSearchMode("map");
                  setMobileView("map");
                }}
                onSave={completeSearchSetup}
              />
            ) : null}

            {!isMobile && showDiscoverChrome ? (
              <div className={styles.mobileToggle}>
                <button
                  type="button"
                  className={`${styles.mobileToggleButton} ${
                    mobileView === "requests" ? styles.mobileToggleButtonActive : ""
                  }`}
                  onClick={() => setMobileView("requests")}
                >
                  Requests
                </button>
                <button
                  type="button"
                  className={`${styles.mobileToggleButton} ${
                    mobileView === "map" ? styles.mobileToggleButtonActive : ""
                  }`}
                  onClick={() => setMobileView("map")}
                >
                  Map
                </button>
                <button
                  type="button"
                  className={styles.mobileToggleButton}
                  onClick={() => setFiltersOpen(true)}
                >
                  Filters
                </button>
              </div>
            ) : null}

            <div
              className={`${styles.workspace} ${
                fullWidthResults ? styles.workspaceSingle : ""
              }`}
            >
              <div
                className={`${styles.resultsColumn} ${
                  mapVisible && mobileView === "map" ? styles.hideOnMobile : ""
                }`}
              >
                {!isMobile ? (
                <div className={styles.resultsToolbar}>
                  <div className={styles.resultsHeading}>
                    <h2 className={styles.resultsTitle}>Prayer requests</h2>
                    <p
                      className={styles.resultsSubtitle}
                      role="status"
                      aria-live="polite"
                    >
                      {nearbyCountLabel}
                    </p>
                  </div>

                  <div className={styles.resultsToolbarControls}>
                    <label className={styles.resultsSearchLabel} htmlFor="prayer-content-search">
                      Search prayers by need, topic, keyword, or location
                    </label>
                    <div className={styles.resultsSearchField}>
                      <Search className="h-4 w-4" aria-hidden />
                      <input
                        id="prayer-content-search"
                        className={styles.resultsSearchInput}
                        type="search"
                        value={contentQuery}
                        placeholder="Search prayers by need, topic, keyword, or location"
                        onChange={(event) => setContentQuery(event.target.value)}
                      />
                      {contentQuery ? (
                        <button
                          type="button"
                          className={styles.resultsSearchClear}
                          aria-label="Clear search"
                          onClick={() => {
                            setContentQuery("");
                            setDebouncedContentQuery("");
                          }}
                        >
                          <X className="h-4 w-4" aria-hidden />
                        </button>
                      ) : null}
                    </div>

                    <div className={styles.resultsLayoutToggle} role="group" aria-label="Results layout">
                      <button
                        type="button"
                        className={`${styles.resultsLayoutButton} ${
                          resultsLayout === "grid" ? styles.resultsLayoutButtonActive : ""
                        }`}
                        aria-pressed={resultsLayout === "grid"}
                        onClick={() => {
                          setResultsLayout("grid");
                          window.localStorage.setItem("htbf-prayer-results-layout", "grid");
                        }}
                      >
                        <LayoutGrid className="h-4 w-4" aria-hidden />
                        Grid
                      </button>
                      <button
                        type="button"
                        className={`${styles.resultsLayoutButton} ${
                          resultsLayout === "list" ? styles.resultsLayoutButtonActive : ""
                        }`}
                        aria-pressed={resultsLayout === "list"}
                        onClick={() => {
                          setResultsLayout("list");
                          window.localStorage.setItem("htbf-prayer-results-layout", "list");
                        }}
                      >
                        <List className="h-4 w-4" aria-hidden />
                        List
                      </button>
                    </div>

                    <label className={styles.resultsSortLabel} htmlFor="prayer-sort">
                      Sort
                    </label>
                    <select
                      id="prayer-sort"
                      className={styles.resultsSortSelect}
                      value={sort}
                      onChange={(event) =>
                        setSort(event.target.value as PrayerConnectSort)
                      }
                    >
                      {PRAYER_CONNECT_SORTS.filter(
                        (item) => !["video", "photo", "text"].includes(item.id)
                      ).map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                ) : null}

                <div className={styles.resultsScroll} ref={scrollRef}>
                  {loadState === "loading" ? (
                    <div className={styles.skeletonGrid} aria-busy="true">
                      {Array.from({ length: 6 }).map((_, index) => (
                        <div key={index} className={styles.skeletonCard} />
                      ))}
                    </div>
                  ) : null}

                  {loadState === "error" ? (
                    <div className={styles.emptyState}>
                      <h2>Could not load prayer requests</h2>
                      <p>{errorMessage}</p>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() => void refresh()}
                      >
                        <RefreshCw className="h-4 w-4" aria-hidden />
                        Retry
                      </button>
                    </div>
                  ) : null}

                  {loadState === "ready" && tabRequests.length === 0 ? (
                    <div className={styles.emptyState}>
                      <div className={styles.emptyIllustration} aria-hidden>
                        <Globe2 className="h-8 w-8" />
                      </div>
                      <h2>
                        {activeContentQuery
                          ? `No prayer requests matched “${activeContentQuery}”.`
                          : activeTab === "following"
                          ? "You are not following any prayer requests yet"
                          : activeTab === "saved"
                            ? "No saved prayer requests yet"
                            : activeTab === "answered"
                              ? "No answered prayers in this view yet"
                              : "No prayer requests match this area yet."}
                      </h2>
                      <p>
                        {activeContentQuery
                          ? "Try another word, clear the search, or broaden your location filters."
                          : activeTab === "discover"
                          ? "Try expanding your radius, exploring the map, choosing another area, or posting a prayer request."
                          : "Browse Discover to find someone to pray for."}
                      </p>
                      <div className={styles.emptyActions}>
                        {activeTab === "discover" ? (
                          <>
                            {activeContentQuery ? (
                              <button
                                type="button"
                                className={styles.secondaryButton}
                                onClick={() => {
                                  setContentQuery("");
                                  setDebouncedContentQuery("");
                                }}
                              >
                                Clear Search
                              </button>
                            ) : null}
                            {typeof radius === "number" ? (
                              <button
                                type="button"
                                className={styles.primaryButton}
                                onClick={bumpRadius}
                              >
                                Expand Search Area
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className={styles.secondaryButton}
                              onClick={chooseAnywhere}
                            >
                              Search Anywhere
                            </button>
                            <button
                              type="button"
                              className={styles.secondaryButton}
                              onClick={() => setMobileView("map")}
                            >
                              Explore Map
                            </button>
                            <button
                              type="button"
                              className={styles.secondaryButton}
                              onClick={() => setComposerOpen(true)}
                            >
                              Post a Prayer Request
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className={styles.primaryButton}
                            onClick={() => setActiveTab("discover")}
                          >
                            Go to Discover
                          </button>
                        )}
                      </div>
                    </div>
                  ) : null}

                  {loadState === "ready" && tabRequests.length > 0 ? (
                    isMobile ? (
                      <PrayerMobileCardGrid
                        requests={visibleRequests}
                        layout={resultsLayout}
                        selectedId={selectedId}
                        savedIds={savedIds}
                        onOpen={(id) => openRequest(id)}
                        onToggleSave={(id) => void toggleSave(id)}
                        buildMenuItems={buildCardMenuItems}
                        hasMore={hasMoreRequests}
                        remainingCount={tabRequests.length - visibleCount}
                        onLoadMore={revealMorePrayerRequests}
                      />
                    ) : (
                    <>
                      <div
                        className={`${
                          fullWidthResults ? styles.cardGridWide : styles.cardGrid
                        } ${
                          resultsLayout === "list" ? styles.cardList : ""
                        } ${
                          fullWidthResults &&
                          tabRequests.length <= 3 &&
                          resultsLayout === "grid"
                            ? styles.cardGridFew
                            : ""
                        }`}
                      >
                        {visibleRequests.map((request) => (
                          <PrayerConnectCard
                            key={request.id}
                            request={request}
                            selected={selectedId === request.id}
                            saved={savedIds.includes(request.id)}
                            onOpen={() => openRequest(request.id)}
                            onToggleSave={() => void toggleSave(request.id)}
                            menuItems={buildCardMenuItems(request)}
                          />
                        ))}
                      </div>
                      {hasMoreRequests ? (
                        <div className={styles.loadMoreRow}>
                          <button
                            type="button"
                            className={styles.loadMoreButton}
                            onClick={revealMorePrayerRequests}
                            disabled={loadingMorePrayers}
                          >
                            Show more prayer requests
                            <span className={styles.loadMoreMeta}>
                              {tabRequests.length - visibleCount} more
                            </span>
                          </button>
                        </div>
                      ) : null}
                    </>
                    )
                  ) : null}
                </div>
              </div>

              {mapVisible ? (
                <div
                  className={`${
                    mobileView === "requests" ? styles.hideOnMobile : ""
                  } ${
                    isMobile && mobileView === "map"
                      ? styles.mobileMapWrap
                      : ""
                  }`}
                >
                  {isMobile && mobileView === "map" ? (
                    <button
                      type="button"
                      className={styles.mobileMapReturn}
                      onClick={() => setMobileView("requests")}
                    >
                      <ArrowLeft className="h-4 w-4" aria-hidden />
                      Return to Requests
                    </button>
                  ) : null}
                  <PrayerMapPanel
                    requests={discoverFiltered}
                    center={center}
                    radiusMiles={radius}
                    pendingMapCenter={pendingMapCenter}
                    onSelect={(request) => openRequest(request.id)}
                    onMapIdle={setPendingMapCenter}
                    onSearchThisArea={applyMapSearch}
                    onRecenter={() => {
                      if (center) {
                        setPendingMapCenter({ lat: center.lat, lng: center.lng });
                      }
                    }}
                    onExpand={() => setMobileView("map")}
                    spotlight={
                      spotlightRequest ? (
                        <PrayerSpotlight
                          request={spotlightRequest}
                          onOpen={() => openRequest(spotlightRequest.id)}
                        />
                      ) : null
                    }
                  />
                </div>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>

      {isMobile ? (
        <>
          <button
            type="button"
            className={styles.mobilePostFab}
            aria-label="Post a prayer request"
            onClick={() => setComposerOpen(true)}
          >
            <Plus className="h-6 w-6" aria-hidden />
          </button>

          <PrayerMobileMenu
            open={mobileMenuOpen}
            onClose={() => setMobileMenuOpen(false)}
            activeTab={activeTab}
            mapActive={mobileView === "map" && activeTab === "discover"}
            onSelectTab={(tab) => {
              setActiveTab(tab);
              setMobileView("requests");
            }}
            onOpenMap={openMapView}
            onPost={() => setComposerOpen(true)}
            onOpenHidden={userId ? () => setHiddenPanelOpen(true) : undefined}
          />

          <PrayerMobileOverflowMenu
            open={mobileOverflowOpen}
            onClose={() => setMobileOverflowOpen(false)}
            resultsLayout={resultsLayout}
            onFilter={() => setFiltersOpen(true)}
            onSort={() => setFiltersOpen(true)}
            onSaveSearchArea={() => completeSearchSetup()}
            onViewMap={openMapView}
            onLayoutChange={changeResultsLayout}
            onHowItWorks={() => setHowOpen(true)}
          />
        </>
      ) : null}

      {showSearchSetupModal ? (
        <div
          className={styles.modalOverlay}
          onClick={() => setSearchSetupOpen(false)}
        >
          <div
            className={styles.searchSetupModalWrap}
            onClick={(event) => event.stopPropagation()}
          >
            <PrayerSearchSetup
              variant="modal"
              {...searchSetupProps}
              onClose={() => setSearchSetupOpen(false)}
            />
          </div>
        </div>
      ) : null}

      {selected ? (
        <PrayerConnectDetail
          request={selected}
          userId={userId}
          saved={savedIds.includes(selected.id)}
          following={followingIds.includes(selected.id)}
          followAvailable={followAvailable}
          userPrayed={userReactions.get(selected.id)?.has("praying") ?? false}
          userEncouraged={
            userReactions.get(selected.id)?.has("encouraged") ?? false
          }
          onClose={closeRequest}
          onToggleSave={() => void toggleSave(selected.id)}
          onToggleFollow={() => void toggleFollow(selected.id)}
          onPrayed={(id) => {
            setRequests((current) =>
              current.map((item) =>
                item.id === id
                  ? { ...item, prayingCount: item.prayingCount + 1 }
                  : item
              )
            );
            setUserReactions((current) => {
              const next = new Map(current);
              const set = new Set(next.get(id) ?? []);
              set.add("praying");
              next.set(id, set);
              return next;
            });
          }}
          onResponseCountChange={(id, count) => {
            setRequests((current) => {
              // Only produce a new array/object when the count actually
              // changes, so the detail view's request prop stays stable and
              // the Video Prayers section never re-loads in a loop.
              const target = current.find((item) => item.id === id);
              if (!target || target.responseCount === count) return current;
              return current.map((item) =>
                item.id === id ? { ...item, responseCount: count } : item
              );
            });
          }}
          onEncouraged={(id) => {
            setRequests((current) =>
              current.map((item) =>
                item.id === id
                  ? {
                      ...item,
                      encouragementCount: item.encouragementCount + 1,
                    }
                  : item
              )
            );
            setUserReactions((current) => {
              const next = new Map(current);
              const set = new Set(next.get(id) ?? []);
              set.add("encouraged");
              next.set(id, set);
              return next;
            });
          }}
          onHidePrayer={handleHidePrayer}
          onBlockedUser={handleBlockedUser}
        />
      ) : null}

      <PrayerPostComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        onPublished={() => {
          setComposerOpen(false);
          setMyRefreshKey((value) => value + 1);
          void refresh();
          setActiveTab("my-requests");
        }}
      />

      <PrayerReportModal
        open={Boolean(cardReportTarget)}
        target={
          cardReportTarget
            ? { ...cardReportTarget, responseId: null }
            : null
        }
        onClose={() => setCardReportTarget(null)}
        onBlock={
          cardReportTarget?.reportedUserId
            ? () => setCardBlockUserId(cardReportTarget.reportedUserId)
            : undefined
        }
        onHide={
          cardReportTarget
            ? () => handleHidePrayer(cardReportTarget.storyId)
            : undefined
        }
      />

      <PrayerConfirmDialog
        open={Boolean(cardBlockUserId)}
        danger
        loading={cardBlocking}
        errorMessage={cardBlockError}
        title="Block this person?"
        body="You won't see their prayers or responses, and they won't be able to send you new private prayers. You can unblock anyone from account settings."
        confirmLabel="Block user"
        onCancel={() => {
          if (cardBlocking) return;
          setCardBlockUserId(null);
          setCardBlockError(null);
        }}
        onConfirm={() => void confirmCardBlock()}
      />

      <PrayerHiddenPanel
        open={hiddenPanelOpen}
        onClose={() => setHiddenPanelOpen(false)}
        userId={userId}
        hiddenIds={hiddenIds}
        onRestored={(_storyId, nextHiddenIds) => setHiddenIds(nextHiddenIds)}
        onRefreshFeed={() => void refresh()}
      />

      {howOpen ? (
        <div className={styles.modalOverlay} onClick={() => setHowOpen(false)}>
          <div
            className={styles.modalCard}
            role="dialog"
            aria-modal="true"
            aria-labelledby="how-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="how-title">How Prayer works</h2>
            <ol className={styles.howList}>
              <li>Choose a place or browse anywhere in the world.</li>
              <li>Browse visual prayer-request cards near that area.</li>
              <li>Open a request and tap I Prayed — no writing required.</li>
              <li>Follow or save requests you want to return to.</li>
              <li>Post your own request with privacy-safe location options.</li>
            </ol>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => setHowOpen(false)}
            >
              Got it
            </button>
          </div>
        </div>
      ) : null}

      {filtersOpen ? (
        <div
          className={styles.modalOverlay}
          onClick={() => setFiltersOpen(false)}
        >
          <div
            className={styles.sheet}
            role="dialog"
            aria-modal="true"
            aria-label="Filters"
            onClick={(event) => event.stopPropagation()}
          >
            <h2>Filters</h2>
            <p
              className={styles.sheetCount}
              role="status"
              aria-live="polite"
            >
              {nearbyCountLabel}
            </p>
            <label className={styles.sheetLabel} htmlFor="sheet-category">
              Prayer type
            </label>
            <select
              id="sheet-category"
              className={styles.select}
              value={category}
              onChange={(event) =>
                setCategory(event.target.value as PrayerConnectCategoryFilter)
              }
            >
              {PRAYER_CONNECT_CATEGORIES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
            <label className={styles.sheetLabel} htmlFor="sheet-sort">
              Sort
            </label>
            <select
              id="sheet-sort"
              className={styles.select}
              value={sort}
              onChange={(event) =>
                setSort(event.target.value as PrayerConnectSort)
              }
            >
              {PRAYER_CONNECT_SORTS.filter(
                (item) => !["video", "photo", "text"].includes(item.id)
              ).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
            <label className={styles.sheetLabel} htmlFor="sheet-media">
              Media type
            </label>
            <select
              id="sheet-media"
              className={styles.select}
              value={mediaFilter}
              onChange={(event) =>
                setMediaFilter(
                  event.target.value as "all" | "video" | "photo" | "text"
                )
              }
            >
              <option value="all">All media</option>
              <option value="video">Video</option>
              <option value="photo">Photo</option>
              <option value="text">Text</option>
            </select>
            <div className={styles.sheetActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => {
                  setCategory("all");
                  setSort("needs-prayer");
                  setMediaFilter("all");
                }}
              >
                Clear all
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => setFiltersOpen(false)}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
