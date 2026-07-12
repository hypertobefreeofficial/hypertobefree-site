"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  CircleHelp,
  Compass,
  Globe2,
  MapPin,
  Navigation,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
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
  RADIUS_OPTIONS,
  filterAndSortPrayerRequests,
} from "../../lib/prayer-connect/utils";
import {
  loadFollowedPrayerIds,
  loadSavedStoryIds,
  loadUserPrayerReactions,
  toggleFollowedPrayer,
  toggleSavedStory,
} from "../../lib/prayer-connect/persistence";
import PrayerConnectCard from "./PrayerConnectCard";
import PrayerConnectDetail from "./PrayerConnectDetail";
import PrayerMyRequestsPanel from "./PrayerMyRequestsPanel";
import PrayerPostComposer from "./PrayerPostComposer";
import PrayerSectionNav, { type PrayerViewTab } from "./PrayerSectionNav";
import styles from "./PrayerConnect.module.css";

const PrayerConnectMap = dynamic(() => import("./PrayerConnectMap"), {
  ssr: false,
  loading: () => <div className={styles.mapSkeleton}>Loading map…</div>,
});

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
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const savedScroll = useRef(0);

  useEffect(() => {
    setActiveTab(parseTab(searchParams.get("tab")));
  }, [searchParams]);

  const refresh = useCallback(async () => {
    setLoadState("loading");
    setErrorMessage(null);
    const result = await loadPrayerConnectRequests();
    if (result.ok === false) {
      setLoadState("error");
      setErrorMessage(result.message);
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
        setSavedIds([]);
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
    if (activeTab === "following") {
      return requests.filter((item) => followingIds.includes(item.id));
    }
    if (activeTab === "saved") {
      return requests.filter((item) => savedIds.includes(item.id));
    }
    if (activeTab === "answered") {
      return requests.filter((item) => item.prayerStatus === "answered");
    }
    return discoverFiltered;
  }, [
    activeTab,
    requests,
    followingIds,
    savedIds,
    discoverFiltered,
  ]);

  const selected = useMemo(
    () =>
      tabRequests.find((item) => item.id === selectedId) ??
      requests.find((item) => item.id === selectedId) ??
      null,
    [tabRequests, requests, selectedId]
  );

  function openRequest(id: string) {
    savedScroll.current = scrollRef.current?.scrollTop ?? 0;
    setSelectedId(id);
  }

  function closeRequest() {
    setSelectedId(null);
    requestAnimationFrame(() => {
      if (scrollRef.current) {
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
        "Following requires the Prayer migration (prayer_follows). Apply it in Supabase to enable sync."
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
  }

  function chooseAnywhere() {
    setSearchMode("anywhere");
    setCenter(null);
    setRadius("anywhere");
    setPendingMapCenter(null);
    setGeoError(null);
  }

  function applyMapSearch() {
    if (!pendingMapCenter) return;
    setSearchMode("map");
    setCenter({
      ...pendingMapCenter,
      label: "Selected map area",
    });
    if (radius === "anywhere") setRadius(25);
  }

  function bumpRadius() {
    const order: PrayerConnectRadiusMiles[] = [5, 10, 25, 50, 100, "anywhere"];
    const index = order.indexOf(radius);
    setRadius(order[Math.min(order.length - 1, index + 1)]);
  }

  const showDiscoverChrome = activeTab === "discover";

  return (
    <main className={styles.page}>
      <header className={styles.topBar}>
        <div className={styles.topBarInner}>
          <Link href="/journey" className={styles.brandLink}>
            HTBF
          </Link>
          <div className={styles.topBarActions}>
            <Link
              href="/notifications?category=prayer"
              className={styles.iconButton}
              aria-label="Prayer notifications"
            >
              <Bell className="h-4 w-4" aria-hidden />
            </Link>
            <div className={styles.topBarLabel}>Prayer</div>
          </div>
        </div>
        <div
          className={styles.shell}
          style={{ paddingTop: 0, paddingBottom: "0.75rem" }}
        >
          <PrayerSectionNav active={activeTab} onChange={setActiveTab} />
        </div>
      </header>

      <div className={styles.shell}>
        <section className={styles.hero}>
          <div>
            <h1 className={styles.title}>Prayer</h1>
            <p className={styles.subtitle}>
              Find someone to pray for. Share what you are facing. Pray without
              borders.
            </p>
          </div>
          <div className={styles.heroActions}>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => setComposerOpen(true)}
            >
              <Plus className="h-4 w-4" aria-hidden />
              Post a Prayer Request
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => setHowOpen(true)}
            >
              <CircleHelp className="h-4 w-4" aria-hidden />
              How It Works
            </button>
          </div>
        </section>

        {activeTab === "my-requests" ? (
          <PrayerMyRequestsPanel
            onOpenPost={() => setComposerOpen(true)}
            refreshKey={myRefreshKey}
          />
        ) : null}

        {activeTab !== "my-requests" ? (
          <>
            {showDiscoverChrome ? (
              <section className={styles.searchPanel} aria-label="Location search">
                <div className={styles.searchTabs} role="tablist">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={searchMode === "near-me"}
                    className={`${styles.searchTab} ${
                      searchMode === "near-me" ? styles.searchTabActive : ""
                    }`}
                    onClick={() => void useNearMe()}
                  >
                    <Navigation className="h-4 w-4" aria-hidden />
                    Near Me
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={searchMode === "place"}
                    className={`${styles.searchTab} ${
                      searchMode === "place" ? styles.searchTabActive : ""
                    }`}
                    onClick={() => setSearchMode("place")}
                  >
                    <Search className="h-4 w-4" aria-hidden />
                    ZIP / City
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={searchMode === "map"}
                    className={`${styles.searchTab} ${
                      searchMode === "map" ? styles.searchTabActive : ""
                    }`}
                    onClick={() => {
                      setSearchMode("map");
                      setMobileView("map");
                    }}
                  >
                    <MapPin className="h-4 w-4" aria-hidden />
                    On Map
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={searchMode === "anywhere"}
                    className={`${styles.searchTab} ${
                      searchMode === "anywhere" ? styles.searchTabActive : ""
                    }`}
                    onClick={chooseAnywhere}
                  >
                    <Globe2 className="h-4 w-4" aria-hidden />
                    Anywhere
                  </button>
                </div>

                <div className={styles.placeRow}>
                  <label htmlFor="prayer-place" className="sr-only">
                    ZIP code, city, state, or country
                  </label>
                  <input
                    id="prayer-place"
                    className={styles.placeInput}
                    value={placeQuery}
                    onChange={(event) => setPlaceQuery(event.target.value)}
                    placeholder="Search ZIP, city, state, or country"
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void searchPlace();
                    }}
                  />
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => void useNearMe()}
                  >
                    Use My Location
                  </button>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={() => void searchPlace()}
                  >
                    Search
                  </button>
                </div>

                <div className={styles.radiusRow}>
                  <span className={styles.controlLabel}>Radius</span>
                  <div className={styles.pillRow}>
                    {RADIUS_OPTIONS.map((option) => (
                      <button
                        key={String(option.id)}
                        type="button"
                        className={`${styles.pill} ${
                          radius === option.id ? styles.pillActive : ""
                        }`}
                        onClick={() => setRadius(option.id)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={styles.filterSelectRow}>
                  <select
                    className={styles.select}
                    value={category}
                    aria-label="Category"
                    onChange={(event) =>
                      setCategory(
                        event.target.value as PrayerConnectCategoryFilter
                      )
                    }
                  >
                    {PRAYER_CONNECT_CATEGORIES.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  <select
                    className={styles.select}
                    value={sort}
                    aria-label="Sort"
                    onChange={(event) =>
                      setSort(event.target.value as PrayerConnectSort)
                    }
                  >
                    {PRAYER_CONNECT_SORTS.filter(
                      (item) =>
                        !["video", "photo", "text"].includes(item.id)
                    ).map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  <select
                    className={styles.select}
                    value={mediaFilter}
                    aria-label="Content type"
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
                </div>

                {center ? (
                  <p className={styles.centerLabel}>
                    <Compass className="h-4 w-4" aria-hidden />
                    Searching near {center.label}
                  </p>
                ) : (
                  <p className={styles.centerLabel}>
                    <Globe2 className="h-4 w-4" aria-hidden />
                    Browsing prayer requests anywhere in the world
                  </p>
                )}

                {geoError ? (
                  <p className={styles.errorText} role="alert">
                    {geoError}
                  </p>
                ) : null}

                {authMessage ? (
                  <p className={styles.errorText} role="status">
                    {authMessage}
                  </p>
                ) : null}

                <div className={styles.privacyNote}>
                  HTBF uses approximate public locations only. Exact home
                  addresses and residential coordinates are never shown.
                </div>
              </section>
            ) : null}

            {showDiscoverChrome ? (
              <div className={styles.mobileToggle}>
                <button
                  type="button"
                  className={`${styles.pill} ${
                    mobileView === "requests" ? styles.pillActive : ""
                  }`}
                  onClick={() => setMobileView("requests")}
                >
                  Requests
                </button>
                <button
                  type="button"
                  className={`${styles.pill} ${
                    mobileView === "map" ? styles.pillActive : ""
                  }`}
                  onClick={() => setMobileView("map")}
                >
                  Map
                </button>
                <button
                  type="button"
                  className={styles.pill}
                  onClick={() => setFiltersOpen(true)}
                >
                  Filters
                </button>
              </div>
            ) : null}

            <div
              className={`${styles.workspace} ${
                !showDiscoverChrome ? styles.workspaceSingle : ""
              }`}
            >
              <div
                className={`${styles.resultsColumn} ${
                  showDiscoverChrome && mobileView === "map"
                    ? styles.hideOnMobile
                    : ""
                }`}
              >
                <div className={styles.resultsToolbar}>
                  <span className={styles.resultCount}>
                    {loadState === "loading"
                      ? "Searching…"
                      : activeTab === "discover" && typeof radius === "number"
                        ? `${tabRequests.length} prayer requests within ${radius} miles`
                        : `${tabRequests.length} prayer request${
                            tabRequests.length === 1 ? "" : "s"
                          }`}
                  </span>
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
                      <h2>
                        {activeTab === "following"
                          ? "You are not following any prayer requests yet"
                          : activeTab === "saved"
                            ? "No saved prayer requests yet"
                            : activeTab === "answered"
                              ? "No answered prayers in this view yet"
                              : `No prayer requests were found${
                                  typeof radius === "number"
                                    ? ` within ${radius} miles`
                                    : ""
                                }.`}
                      </h2>
                      <p>
                        {activeTab === "discover"
                          ? "Try expanding your radius, selecting another area, or posting a prayer request."
                          : "Browse Discover to find someone to pray for."}
                      </p>
                      <div className={styles.emptyActions}>
                        {activeTab === "discover" && typeof radius === "number" ? (
                          <button
                            type="button"
                            className={styles.primaryButton}
                            onClick={bumpRadius}
                          >
                            Expand Radius
                          </button>
                        ) : null}
                        {activeTab === "discover" ? (
                          <button
                            type="button"
                            className={styles.secondaryButton}
                            onClick={chooseAnywhere}
                          >
                            Choose Another Area
                          </button>
                        ) : (
                          <button
                            type="button"
                            className={styles.primaryButton}
                            onClick={() => setActiveTab("discover")}
                          >
                            Go to Discover
                          </button>
                        )}
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          onClick={() => setComposerOpen(true)}
                        >
                          Post a Prayer Request
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {loadState === "ready" && tabRequests.length > 0 ? (
                    <div className={styles.cardGrid}>
                      {tabRequests.map((request) => (
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
                  ) : null}
                </div>
              </div>

              {showDiscoverChrome ? (
                <div
                  className={`${styles.mapColumn} ${
                    mobileView === "requests" ? styles.hideOnMobile : ""
                  }`}
                >
                  <div className={styles.mapToolbar}>
                    <span>Map</span>
                    {pendingMapCenter &&
                    (!center ||
                      pendingMapCenter.lat !== center.lat ||
                      pendingMapCenter.lng !== center.lng) ? (
                      <button
                        type="button"
                        className={styles.primaryButton}
                        onClick={applyMapSearch}
                      >
                        Search This Area
                      </button>
                    ) : null}
                  </div>
                  <PrayerConnectMap
                    requests={discoverFiltered}
                    center={center}
                    radiusMiles={radius}
                    onSelect={(request) => openRequest(request.id)}
                    onMapIdle={setPendingMapCenter}
                  />
                  <div className={styles.mapLegend}>
                    <span>Prayer requests</span>
                    <span>Answered</span>
                  </div>
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </div>

      <button
        type="button"
        className={styles.stickyPost}
        onClick={() => setComposerOpen(true)}
      >
        <Plus className="h-4 w-4" aria-hidden />
        Post a Prayer Request
      </button>

      {selected ? (
        <PrayerConnectDetail
          request={selected}
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
              {PRAYER_CONNECT_SORTS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
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
