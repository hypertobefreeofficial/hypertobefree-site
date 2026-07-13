"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Globe2, LayoutGrid, List, RefreshCw, Search, X } from "lucide-react";
import { loadPrayerConnectRequests } from "../../lib/prayer-connect/loadPrayerConnectRequests";
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
import { isMockPrayerMode } from "../../lib/prayer-connect/mockMode";
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
  const [userId, setUserId] = useState<string | null>(null);
  const [userReactions, setUserReactions] = useState<Map<string, Set<string>>>(
    new Map()
  );
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [myRefreshKey, setMyRefreshKey] = useState(0);
  const [searchConfigured, setSearchConfigured] = useState(false);
  const [searchSetupOpen, setSearchSetupOpen] = useState(false);
  const [prefsHydrated, setPrefsHydrated] = useState(false);
  const [visibleCount, setVisibleCount] = useState(12);
  const [resultsLayout, setResultsLayout] = useState<"grid" | "list">("grid");
  const [contentQuery, setContentQuery] = useState("");
  const [debouncedContentQuery, setDebouncedContentQuery] = useState("");
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
    const result = await loadPrayerConnectRequests();
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
    setLoadState("ready");
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    async function loadAccountState() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);
      if (!user) {
        setSavedIds(isMockPrayerMode() ? MOCK_SAVED_STORY_IDS : []);
        setFollowingIds([]);
        setUserReactions(new Map());
        return;
      }

      try {
        const [saved, followed] = await Promise.all([
          loadSavedStoryIds(user.id),
          loadFollowedPrayerIds(user.id),
        ]);
        setSavedIds(saved);
        setFollowingIds(followed.ids);
        setFollowAvailable(followed.available);
      } catch (error) {
        console.error("Could not load prayer account state:", error);
      }
    }

    void loadAccountState();
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

  const discoverFiltered = useMemo(() => {
    const sortForFilter: PrayerConnectSort =
      mediaFilter === "video"
        ? "video"
        : mediaFilter === "photo"
          ? "photo"
          : mediaFilter === "text"
            ? "text"
            : sort;

    return filterAndSortPrayerRequests(requests, {
      center,
      radius,
      category,
      sort: sortForFilter,
      searchMode,
    });
  }, [requests, center, radius, category, sort, searchMode, mediaFilter]);

  const tabRequests = useMemo(() => {
    let items: PrayerConnectRequest[];
    if (activeTab === "following") {
      items = requests.filter((item) => followingIds.includes(item.id));
    } else if (activeTab === "saved") {
      items = requests.filter((item) => savedIds.includes(item.id));
    } else if (activeTab === "answered") {
      items = requests.filter((item) => item.prayerStatus === "answered");
    } else {
      items = discoverFiltered;
    }

    return filterPrayerRequestsByContent(items, debouncedContentQuery);
  }, [
    activeTab,
    requests,
    followingIds,
    savedIds,
    discoverFiltered,
    debouncedContentQuery,
  ]);

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

  const showDiscoverChrome = activeTab === "discover";
  const showSearchSummary = showDiscoverChrome && searchConfigured;
  const showFirstTimeRail = showDiscoverChrome && !searchConfigured;
  const showSearchSetupModal =
    showDiscoverChrome && searchConfigured && searchSetupOpen;

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
  const hasMoreRequests = tabRequests.length > visibleCount;

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
    <main className={styles.page}>
      <div className={styles.prayerViewport}>
        <PrayerExperienceHeader
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onPost={() => setComposerOpen(true)}
          onHowItWorks={() => setHowOpen(true)}
          compact={searchConfigured}
        />

        {activeTab === "my-requests" ? (
          <PrayerMyRequestsPanel
            onOpenPost={() => setComposerOpen(true)}
            refreshKey={myRefreshKey}
          />
        ) : null}

        {activeTab !== "my-requests" ? (
          <section className={styles.prayerDiscover}>
            {showSearchSummary ? (
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

            {showFirstTimeRail ? (
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

            {showDiscoverChrome ? (
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
                          />
                        ))}
                      </div>
                      {hasMoreRequests ? (
                        <div className={styles.loadMoreRow}>
                          <button
                            type="button"
                            className={styles.loadMoreButton}
                            onClick={() =>
                              setVisibleCount((count) => count + 12)
                            }
                          >
                            Show more prayer requests
                            <span className={styles.loadMoreMeta}>
                              {tabRequests.length - visibleCount} more
                            </span>
                          </button>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </div>

              {mapVisible ? (
                <div
                  className={
                    mobileView === "requests" ? styles.hideOnMobile : ""
                  }
                >
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
            setRequests((current) =>
              current.map((item) =>
                item.id === id ? { ...item, responseCount: count } : item
              )
            );
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
            <label className={styles.sheetLabel} htmlFor="sheet-category">
              Category
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
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => setFiltersOpen(false)}
            >
              Apply
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
