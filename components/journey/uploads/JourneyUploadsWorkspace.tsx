"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Film,
  HeartHandshake,
  LayoutGrid,
  LayoutList,
  Layers3,
  Sparkles,
  Trash2,
  Video,
} from "lucide-react";
import type {
  EncouragementImpact,
  JourneyUpload,
  ReactionRow,
  UploadSort,
  UploadStatusFilter,
  UploadTypeFilter,
  UploadViewMode,
} from "../../../lib/journey/uploads/types";
import {
  buildReactionTotalsByStory,
  buildUploadTimeline,
  filterUploads,
  formatUploadDate,
  formatUploadDateTime,
  getContentTypeLabel,
  getMostRespondedUpload,
  getPublicViewHref,
  getTopResponseContentType,
  getUploadPreview,
  getUploadStatus,
  getUploadTitle,
  sortUploads,
} from "../../../lib/journey/uploads/utils";
import JourneyUploadActionsMenu, {
  ViewActionButton,
} from "./JourneyUploadActionsMenu";
import {
  JourneyUploadDialog,
  JourneyUploadEditDialog,
} from "./JourneyUploadDialogs";
import styles from "./JourneyUploads.module.css";

const PAGE_SIZE = 20;

const STATUS_FILTERS: { id: UploadStatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "approved", label: "Approved" },
  { id: "pending", label: "Pending" },
  { id: "removed", label: "Removed" },
  { id: "videos", label: "Videos" },
];

const TYPE_FILTERS: { id: UploadTypeFilter; label: string }[] = [
  { id: "all", label: "All types" },
  { id: "testimony", label: "Testimonies" },
  { id: "prayer", label: "Prayer Requests" },
  { id: "praise", label: "Praise Reports" },
  { id: "story", label: "Stories" },
  { id: "other", label: "Other" },
  { id: "answered", label: "Answered Prayers" },
  { id: "edited", label: "Recently Edited" },
  { id: "text", label: "Text Only" },
];

type JourneyUploadsWorkspaceProps = {
  open: boolean;
  onClose: () => void;
  uploads: JourneyUpload[];
  reactions: ReactionRow[];
  encouragementImpact: EncouragementImpact;
  removingStoryId: string | null;
  clearingRemovedStoryId: string | null;
  clearingAllRemoved: boolean;
  editingStory: JourneyUpload | null;
  editStoryText: string;
  savingStoryEdit: boolean;
  onEditTextChange: (value: string) => void;
  onStartEdit: (upload: JourneyUpload) => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onRequestRemove: (upload: JourneyUpload) => void;
  onRequestDeleteForever: (upload: JourneyUpload) => void;
  onRequestDeleteAllRemoved: () => void;
  removeRequest: JourneyUpload | null;
  deleteRequest: JourneyUpload | null;
  deleteAllRequestOpen: boolean;
  onCancelRemove: () => void;
  onCancelDelete: () => void;
  onCancelDeleteAll: () => void;
  onConfirmRemove: () => void;
  onConfirmDelete: () => void;
  onConfirmDeleteAll: () => void;
};

export default function JourneyUploadsWorkspace({
  open,
  onClose,
  uploads,
  reactions,
  encouragementImpact,
  removingStoryId,
  clearingRemovedStoryId,
  clearingAllRemoved,
  editingStory,
  editStoryText,
  savingStoryEdit,
  onEditTextChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onRequestRemove,
  onRequestDeleteForever,
  onRequestDeleteAllRemoved,
  removeRequest,
  deleteRequest,
  deleteAllRequestOpen,
  onCancelRemove,
  onCancelDelete,
  onCancelDeleteAll,
  onConfirmRemove,
  onConfirmDelete,
  onConfirmDeleteAll,
}: JourneyUploadsWorkspaceProps) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<UploadStatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<UploadTypeFilter>("all");
  const [sort, setSort] = useState<UploadSort>("newest");
  const [viewMode, setViewMode] = useState<UploadViewMode>("list");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);

  const approvedIds = useMemo(
    () =>
      uploads
        .filter((upload) => getUploadStatus(upload) === "approved")
        .map((upload) => upload.id),
    [uploads]
  );

  const reactionTotals = useMemo(
    () => buildReactionTotalsByStory(reactions, approvedIds),
    [reactions, approvedIds]
  );

  const filtered = useMemo(
    () => filterUploads(uploads, statusFilter, typeFilter, query),
    [uploads, statusFilter, typeFilter, query]
  );

  const sorted = useMemo(
    () => sortUploads(filtered, sort, reactionTotals),
    [filtered, sort, reactionTotals]
  );

  const visible = useMemo(
    () => sorted.slice(0, visibleCount),
    [sorted, visibleCount]
  );

  const selectedUpload = useMemo(
    () => uploads.find((upload) => upload.id === selectedId) ?? null,
    [uploads, selectedId]
  );

  const timeline = useMemo(() => buildUploadTimeline(uploads), [uploads]);

  const mostResponded = useMemo(
    () => getMostRespondedUpload(uploads, reactionTotals),
    [uploads, reactionTotals]
  );

  const topType = useMemo(
    () => getTopResponseContentType(uploads, reactionTotals),
    [uploads, reactionTotals]
  );

  const totals = useMemo(
    () => ({
      total: uploads.length,
      approved: uploads.filter((u) => getUploadStatus(u) === "approved").length,
      pending: uploads.filter((u) => getUploadStatus(u) === "pending").length,
      removed: uploads.filter((u) => getUploadStatus(u) === "removed").length,
      videos: uploads.filter((u) => Boolean(u.video_url)).length,
    }),
    [uploads]
  );

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [statusFilter, typeFilter, query, sort]);

  useEffect(() => {
    if (!open) {
      setMobilePreviewOpen(false);
      return;
    }

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  const emptyMessage = getEmptyMessage({
    total: uploads.length,
    filtered: sorted.length,
    statusFilter,
    typeFilter,
    query,
  });

  function openPreview(upload: JourneyUpload) {
    setSelectedId(upload.id);
    if (window.matchMedia("(max-width: 1099px)").matches) {
      setMobilePreviewOpen(true);
    }
  }

  const previewNode = selectedUpload ? (
    <UploadPreview
      upload={selectedUpload}
      reactionTotals={reactionTotals.get(selectedUpload.id)}
      onClose={() => {
        setMobilePreviewOpen(false);
        setSelectedId(null);
      }}
      onEdit={() => onStartEdit(selectedUpload)}
      onRemove={() => onRequestRemove(selectedUpload)}
      onDeleteForever={() => onRequestDeleteForever(selectedUpload)}
      removing={removingStoryId === selectedUpload.id}
      deleting={clearingRemovedStoryId === selectedUpload.id}
      showBack={mobilePreviewOpen}
    />
  ) : null;

  return (
    <div className={styles.workspace} role="dialog" aria-modal="true" aria-label="My Uploads">
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.titleBlock}>
            <button type="button" className={styles.backButton} onClick={onClose}>
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back to Journey
            </button>
            <div className={styles.eyebrow} style={{ marginTop: "0.75rem" }}>
              Manage My Uploads
            </div>
            <h1 className={styles.title}>My Uploads</h1>
            <p className={styles.subtitle}>
              Manage the stories, prayers, and testimonies you have shared on
              HTBF.
            </p>
          </div>

          <div className={styles.headerActions}>
            <label htmlFor="uploads-search" className="sr-only">
              Search uploads
            </label>
            <input
              id="uploads-search"
              className={styles.searchInput}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search uploads..."
            />
            <label htmlFor="uploads-sort" className="sr-only">
              Sort uploads
            </label>
            <select
              id="uploads-sort"
              className={styles.selectInput}
              value={sort}
              onChange={(event) => setSort(event.target.value as UploadSort)}
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="edited">Recently Edited</option>
              <option value="responses">Most Responses</option>
              <option value="status">Status</option>
              <option value="type">Content Type</option>
            </select>
            <Link href="/share-your-story" className={styles.primaryButton}>
              + Share Something
            </Link>
          </div>
        </header>

        <div className={styles.scrollArea}>
          <section className={styles.overviewGrid} aria-label="Upload overview">
            <StatCard
              icon={<Layers3 className="h-5 w-5" />}
              tone="#eff6ff"
              color="#0b63ce"
              label="Total Uploads"
              value={totals.total}
              hint="All shared content"
            />
            <StatCard
              icon={<CheckCircle2 className="h-5 w-5" />}
              tone="#ecfdf5"
              color="#047857"
              label="Approved"
              value={totals.approved}
              hint="Visible to public"
            />
            <StatCard
              icon={<Clock3 className="h-5 w-5" />}
              tone="#fff7ed"
              color="#c2410c"
              label="Pending"
              value={totals.pending}
              hint="Awaiting review"
            />
            <StatCard
              icon={<Trash2 className="h-5 w-5" />}
              tone="#fff1f2"
              color="#be123c"
              label="Removed"
              value={totals.removed}
              hint="Hidden from public"
            />
            <StatCard
              icon={<Video className="h-5 w-5" />}
              tone="#f5f3ff"
              color="#6d28d9"
              label="Videos"
              value={totals.videos}
              hint="With videos"
            />
            <StatCard
              icon={<HeartHandshake className="h-5 w-5" />}
              tone="#eff6ff"
              color="#0b63ce"
              label="Total Responses"
              value={encouragementImpact.total}
              hint="Community reactions"
            />
          </section>

          <section className={styles.pulseCard} aria-labelledby="impact-pulse-title">
            <div className={styles.eyebrow}>Impact Pulse</div>
            <h2 id="impact-pulse-title" className={styles.title} style={{ fontSize: "1.2rem" }}>
              See how the community is responding to what you have shared.
            </h2>
            <div className={styles.pulseGrid}>
              <div>
                <div className={styles.statLabel}>Response mix</div>
                <div className={styles.pulseMetric}>
                  <span className={styles.chip}>Amen {encouragementImpact.amen}</span>
                  <span className={styles.chip}>
                    Praise God {encouragementImpact.praiseGod}
                  </span>
                  <span className={styles.chip}>
                    Encouraged {encouragementImpact.encouraged}
                  </span>
                  <span className={styles.chip}>
                    Praying {encouragementImpact.praying}
                  </span>
                </div>
              </div>
              <div>
                <div className={styles.statLabel}>Most responded-to</div>
                <p className={styles.subtitle} style={{ marginTop: "0.35rem" }}>
                  {mostResponded?.upload
                    ? `${getUploadTitle(mostResponded.upload)} · ${mostResponded.count} responses`
                    : "Responses will appear as the community engages."}
                </p>
              </div>
              <div>
                <div className={styles.statLabel}>Strongest content type</div>
                <p className={styles.subtitle} style={{ marginTop: "0.35rem" }}>
                  {topType
                    ? `${topType.label} · ${topType.count} responses`
                    : "Not enough response data yet."}
                </p>
              </div>
            </div>
          </section>

          <div className={styles.filtersRow} role="tablist" aria-label="Status filters">
            {STATUS_FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                role="tab"
                aria-selected={statusFilter === filter.id}
                className={`${styles.filterPill} ${
                  statusFilter === filter.id ? styles.filterPillActive : ""
                }`}
                onClick={() => setStatusFilter(filter.id)}
              >
                {filter.label}
                {filter.id === "all"
                  ? ` ${totals.total}`
                  : filter.id === "approved"
                    ? ` ${totals.approved}`
                    : filter.id === "pending"
                      ? ` ${totals.pending}`
                      : filter.id === "removed"
                        ? ` ${totals.removed}`
                        : ` ${totals.videos}`}
              </button>
            ))}
          </div>

          <div className={styles.filtersRow} role="tablist" aria-label="Content type filters">
            {TYPE_FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                role="tab"
                aria-selected={typeFilter === filter.id}
                className={`${styles.filterPill} ${
                  typeFilter === filter.id ? styles.filterPillActive : ""
                }`}
                onClick={() => setTypeFilter(filter.id)}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <div className={styles.toolbar}>
            <div className={styles.toolbarLeft}>
              <span className={styles.cellMuted}>
                Showing {Math.min(visible.length, sorted.length)} of {sorted.length}{" "}
                uploads
              </span>
            </div>
            <div className={styles.toolbarRight}>
              <button
                type="button"
                className={`${styles.secondaryButton} ${
                  viewMode === "list" ? styles.filterPillActive : ""
                }`}
                aria-pressed={viewMode === "list"}
                onClick={() => setViewMode("list")}
              >
                <LayoutList className="h-4 w-4" aria-hidden />
                Compact List
              </button>
              <button
                type="button"
                className={`${styles.secondaryButton} ${
                  viewMode === "grid" ? styles.filterPillActive : ""
                }`}
                aria-pressed={viewMode === "grid"}
                onClick={() => setViewMode("grid")}
              >
                <LayoutGrid className="h-4 w-4" aria-hidden />
                Visual Grid
              </button>
            </div>
          </div>

          {statusFilter === "removed" && totals.removed > 0 ? (
            <section className={styles.dangerPanel}>
              <h2 className={styles.modalTitle}>Permanently delete removed uploads</h2>
              <p className={styles.modalBody}>
                These uploads are already hidden from public view. Permanently
                deleting them cannot be undone.
              </p>
              <button
                type="button"
                className={styles.quietDanger}
                style={{ marginTop: "0.75rem", background: "#be123c", color: "#fff" }}
                onClick={onRequestDeleteAllRemoved}
                disabled={clearingAllRemoved}
              >
                {clearingAllRemoved ? "Deleting..." : "Delete All Forever"}
              </button>
            </section>
          ) : null}

          <div
            className={`${styles.libraryLayout} ${
              selectedUpload && !mobilePreviewOpen ? styles.libraryLayoutWithPreview : ""
            }`}
          >
            <section className={styles.library} aria-label="Content library">
              {sorted.length === 0 ? (
                <div className={styles.emptyState}>
                  <Sparkles className="mx-auto mb-3 h-7 w-7 text-[#0b63ce]" aria-hidden />
                  <h2 className={styles.emptyTitle}>{emptyMessage.title}</h2>
                  <p className={styles.emptyBody}>{emptyMessage.body}</p>
                  {uploads.length === 0 ? (
                    <Link
                      href="/share-your-story"
                      className={styles.primaryButton}
                      style={{ marginTop: "1rem" }}
                    >
                      Share Something
                    </Link>
                  ) : null}
                </div>
              ) : viewMode === "list" ? (
                <>
                  <div className={`${styles.tableHeader} ${styles.tableHeaderList}`}>
                    <span>Upload</span>
                    <span>Type</span>
                    <span>Status</span>
                    <span>Submitted</span>
                    <span>Responses</span>
                    <span>Actions</span>
                  </div>
                  {visible.map((upload) => (
                    <UploadRow
                      key={upload.id}
                      upload={upload}
                      selected={selectedId === upload.id}
                      responseCount={reactionTotals.get(upload.id)?.total ?? 0}
                      removing={removingStoryId === upload.id}
                      deleting={clearingRemovedStoryId === upload.id}
                      onSelect={() => openPreview(upload)}
                      onEdit={() => onStartEdit(upload)}
                      onRemove={() => onRequestRemove(upload)}
                      onDeleteForever={() => onRequestDeleteForever(upload)}
                    />
                  ))}
                </>
              ) : (
                <div className={styles.grid}>
                  {visible.map((upload) => (
                    <UploadCard
                      key={upload.id}
                      upload={upload}
                      selected={selectedId === upload.id}
                      responseCount={reactionTotals.get(upload.id)?.total ?? 0}
                      removing={removingStoryId === upload.id}
                      deleting={clearingRemovedStoryId === upload.id}
                      onSelect={() => openPreview(upload)}
                      onEdit={() => onStartEdit(upload)}
                      onRemove={() => onRequestRemove(upload)}
                      onDeleteForever={() => onRequestDeleteForever(upload)}
                    />
                  ))}
                </div>
              )}

              {visibleCount < sorted.length ? (
                <div className={styles.loadMoreWrap}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                  >
                    Load More
                  </button>
                </div>
              ) : null}
            </section>

            {!mobilePreviewOpen && selectedUpload ? (
              <aside className="hidden min-[1100px]:block">{previewNode}</aside>
            ) : null}
          </div>

          <section className={`${styles.panel} ${styles.timeline}`} aria-labelledby="sharing-journey-title">
            <div className={styles.eyebrow}>Your Sharing Journey</div>
            <h2 id="sharing-journey-title" className={styles.title} style={{ fontSize: "1.2rem" }}>
              A timeline of what you have shared
            </h2>
            <div className={styles.pulseMetric} style={{ marginTop: "0.75rem" }}>
              <span className={styles.chip}>
                First {formatUploadDate(timeline.firstUploadAt)}
              </span>
              <span className={styles.chip}>
                Latest {formatUploadDate(timeline.latestUploadAt)}
              </span>
              <span className={styles.chip}>
                Approved {timeline.approvedCount}
              </span>
              <span className={styles.chip}>
                Answered {timeline.answeredCount}
              </span>
              <span className={styles.chip}>
                Responses {encouragementImpact.total}
              </span>
            </div>
            {timeline.months.length === 0 ? (
              <p className={styles.modalBody}>Your sharing timeline will grow as you upload.</p>
            ) : (
              <div className={styles.timelineTrack}>
                {timeline.months.map((month) => {
                  const max = Math.max(...timeline.months.map((item) => item.count), 1);
                  return (
                    <div key={month.key} className={styles.timelineItem}>
                      <span className={styles.cellMuted}>{month.label}</span>
                      <div className={styles.timelineBar} aria-hidden>
                        <div
                          className={styles.timelineFill}
                          style={{ width: `${(month.count / max) * 100}%` }}
                        />
                      </div>
                      <span className={styles.cellMuted}>{month.count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>

      {mobilePreviewOpen && selectedUpload ? (
        <div className={styles.previewMobile}>{previewNode}</div>
      ) : null}

      {editingStory ? (
        <JourneyUploadEditDialog
          storyType={getContentTypeLabel(editingStory)}
          statusLabel={statusLabel(getUploadStatus(editingStory))}
          value={editStoryText}
          loading={savingStoryEdit}
          onChange={onEditTextChange}
          onCancel={onCancelEdit}
          onSave={onSaveEdit}
        />
      ) : null}

      {removeRequest ? (
        <JourneyUploadDialog
          title="Remove this upload from public view?"
          body="It will no longer appear in public feeds, search, video areas, or the Testimony Map. You may permanently delete it later from Removed uploads."
          primaryLabel={
            removingStoryId === removeRequest.id
              ? "Removing..."
              : "Remove from Public View"
          }
          primaryDanger
          loading={removingStoryId === removeRequest.id}
          onCancel={onCancelRemove}
          onConfirm={onConfirmRemove}
        />
      ) : null}

      {deleteRequest ? (
        <JourneyUploadDialog
          title="Delete this upload forever?"
          body="This permanently deletes the removed upload from your uploads list and cannot be undone."
          primaryLabel={
            clearingRemovedStoryId === deleteRequest.id
              ? "Deleting..."
              : "Delete Forever"
          }
          primaryDanger
          loading={clearingRemovedStoryId === deleteRequest.id}
          onCancel={onCancelDelete}
          onConfirm={onConfirmDelete}
        />
      ) : null}

      {deleteAllRequestOpen ? (
        <JourneyUploadDialog
          title="Delete all removed uploads forever?"
          body="Every upload already removed from public view will be permanently deleted. This cannot be undone."
          primaryLabel={clearingAllRemoved ? "Deleting..." : "Delete All Forever"}
          primaryDanger
          loading={clearingAllRemoved}
          onCancel={onCancelDeleteAll}
          onConfirm={onConfirmDeleteAll}
        />
      ) : null}
    </div>
  );
}

function StatCard({
  icon,
  tone,
  color,
  label,
  value,
  hint,
}: {
  icon: ReactNode;
  tone: string;
  color: string;
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <article className={styles.statCard}>
      <div className={styles.statIcon} style={{ background: tone, color }}>
        {icon}
      </div>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue}>{value}</div>
      <div className={styles.statHint}>{hint}</div>
    </article>
  );
}

function UploadRow({
  upload,
  selected,
  responseCount,
  removing,
  deleting,
  onSelect,
  onEdit,
  onRemove,
  onDeleteForever,
}: {
  upload: JourneyUpload;
  selected: boolean;
  responseCount: number;
  removing: boolean;
  deleting: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onDeleteForever: () => void;
}) {
  const status = getUploadStatus(upload);

  return (
    <div
      className={`${styles.row} ${styles.rowList} ${selected ? styles.rowSelected : ""}`}
      role="button"
      tabIndex={0}
      aria-current={selected ? "true" : undefined}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <div className={styles.uploadMain}>
        <UploadThumb upload={upload} />
        <div className={styles.uploadCopy}>
          <div className={styles.uploadTitle}>{getUploadTitle(upload)}</div>
          <div className={styles.uploadPreview}>{getUploadPreview(upload)}</div>
          <div className={`${styles.mobileCardMeta} min-[1024px]:hidden`}>
            <StatusBadge status={status} />
            <span className={styles.cellMuted}>{formatUploadDate(upload.created_at)}</span>
            {upload.video_url ? <span className={styles.chip}>Video</span> : null}
            <span className={styles.chip}>{responseCount} responses</span>
          </div>
        </div>
      </div>
      <div className={`${styles.cellMuted} hidden min-[1024px]:block`}>
        {getContentTypeLabel(upload)}
      </div>
      <div className="hidden min-[1024px]:block">
        <StatusBadge status={status} />
      </div>
      <div className={`${styles.cellMuted} hidden min-[1024px]:block`}>
        {formatUploadDate(upload.created_at)}
        {upload.edited_at ? (
          <div>Edited {formatUploadDate(upload.edited_at)}</div>
        ) : null}
      </div>
      <div className={`${styles.cellMuted} hidden min-[1024px]:block`}>
        {responseCount}
      </div>
      <div className={styles.actionsCell} onClick={(event) => event.stopPropagation()}>
        <ViewActionButton onClick={onSelect} />
        <JourneyUploadActionsMenu
          upload={upload}
          removing={removing}
          deleting={deleting}
          onViewDetails={onSelect}
          onEdit={onEdit}
          onRemove={onRemove}
          onDeleteForever={onDeleteForever}
        />
      </div>
    </div>
  );
}

function UploadCard({
  upload,
  selected,
  responseCount,
  removing,
  deleting,
  onSelect,
  onEdit,
  onRemove,
  onDeleteForever,
}: {
  upload: JourneyUpload;
  selected: boolean;
  responseCount: number;
  removing: boolean;
  deleting: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onDeleteForever: () => void;
}) {
  const status = getUploadStatus(upload);

  return (
    <article
      className={`${styles.card} ${selected ? styles.cardSelected : ""}`}
      role="button"
      tabIndex={0}
      aria-current={selected ? "true" : undefined}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <div className={styles.uploadMain}>
        <UploadThumb upload={upload} />
        <div className={styles.uploadCopy}>
          <div className={styles.uploadTitle}>{getUploadTitle(upload)}</div>
          <div className={styles.uploadPreview}>{getUploadPreview(upload, 90)}</div>
        </div>
      </div>
      <div className={styles.mobileCardMeta}>
        <StatusBadge status={status} />
        <span className={styles.chip}>{getContentTypeLabel(upload)}</span>
        <span className={styles.cellMuted}>{formatUploadDate(upload.created_at)}</span>
        <span className={styles.chip}>{responseCount} responses</span>
        {upload.video_url ? <span className={styles.chip}>Video</span> : null}
        <div onClick={(event) => event.stopPropagation()}>
          <JourneyUploadActionsMenu
            upload={upload}
            removing={removing}
            deleting={deleting}
            onViewDetails={onSelect}
            onEdit={onEdit}
            onRemove={onRemove}
            onDeleteForever={onDeleteForever}
          />
        </div>
      </div>
    </article>
  );
}

function UploadThumb({ upload }: { upload: JourneyUpload }) {
  if (upload.video_url) {
    return (
      <div className={styles.thumb} aria-hidden>
        <Film className="h-5 w-5" />
      </div>
    );
  }

  return (
    <div className={styles.typeIcon} aria-hidden>
      <Sparkles className="h-5 w-5" />
    </div>
  );
}

function UploadPreview({
  upload,
  reactionTotals,
  onClose,
  onEdit,
  onRemove,
  onDeleteForever,
  removing,
  deleting,
  showBack,
}: {
  upload: JourneyUpload;
  reactionTotals?: { total: number; amen: number; praiseGod: number; encouraged: number; praying: number };
  onClose: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onDeleteForever: () => void;
  removing: boolean;
  deleting: boolean;
  showBack: boolean;
}) {
  const status = getUploadStatus(upload);
  const publicHref = getPublicViewHref(upload);
  const [playVideo, setPlayVideo] = useState(false);

  return (
    <div className={styles.previewPanel}>
      {showBack ? (
        <button type="button" className={styles.backButton} onClick={onClose}>
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to My Uploads
        </button>
      ) : null}

      <div className={styles.eyebrow} style={{ marginTop: showBack ? "0.85rem" : 0 }}>
        Upload preview
      </div>
      <h2 className={styles.previewTitle}>{getUploadTitle(upload)}</h2>
      <div className={styles.mobileCardMeta}>
        <StatusBadge status={status} />
        <span className={styles.chip}>{getContentTypeLabel(upload)}</span>
        <span className={styles.cellMuted}>
          Submitted {formatUploadDateTime(upload.created_at)}
        </span>
        {upload.edited_at ? (
          <span className={styles.cellMuted}>
            Edited {formatUploadDateTime(upload.edited_at)}
          </span>
        ) : null}
      </div>

      <p className={styles.previewBody}>{upload.story_text || "No description added yet."}</p>

      {upload.answered_text ? (
        <div className={styles.pulseCard} style={{ marginTop: "0.85rem", boxShadow: "none" }}>
          <div className={styles.statLabel}>Answered prayer</div>
          <p className={styles.previewBody} style={{ marginTop: "0.35rem" }}>
            {upload.answered_text}
          </p>
        </div>
      ) : null}

      {upload.video_url ? (
        <div className={styles.videoFrame}>
          {playVideo ? (
            <video src={upload.video_url} controls playsInline preload="metadata" />
          ) : (
            <button
              type="button"
              className={styles.primaryButton}
              style={{ margin: "1rem" }}
              onClick={() => setPlayVideo(true)}
            >
              Play video
            </button>
          )}
        </div>
      ) : null}

      {reactionTotals ? (
        <div className={styles.pulseMetric} style={{ marginTop: "0.85rem" }}>
          <span className={styles.chip}>{reactionTotals.total} responses</span>
          <span className={styles.chip}>Amen {reactionTotals.amen}</span>
          <span className={styles.chip}>Praise God {reactionTotals.praiseGod}</span>
          <span className={styles.chip}>Encouraged {reactionTotals.encouraged}</span>
          <span className={styles.chip}>Praying {reactionTotals.praying}</span>
        </div>
      ) : null}

      <div className={styles.mobileCardMeta} style={{ marginTop: "1rem" }}>
        {publicHref ? (
          <a href={publicHref} className={styles.primaryButton}>
            View Public Post
          </a>
        ) : null}
        {status !== "removed" ? (
          <>
            <button type="button" className={styles.secondaryButton} onClick={onEdit}>
              Edit Upload
            </button>
            <button
              type="button"
              className={styles.quietDanger}
              onClick={onRemove}
              disabled={removing}
            >
              {removing ? "Removing..." : "Remove from Public View"}
            </button>
          </>
        ) : (
          <button
            type="button"
            className={styles.quietDanger}
            style={{ background: "#be123c", color: "#fff" }}
            onClick={onDeleteForever}
            disabled={deleting}
          >
            {deleting ? "Deleting..." : "Delete Forever"}
          </button>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: "approved" | "pending" | "removed" }) {
  const className =
    status === "approved"
      ? styles.statusApproved
      : status === "removed"
        ? styles.statusRemoved
        : styles.statusPending;

  return <span className={`${styles.statusBadge} ${className}`}>{statusLabel(status)}</span>;
}

function statusLabel(status: "approved" | "pending" | "removed") {
  if (status === "approved") return "Approved";
  if (status === "removed") return "Removed";
  return "Pending";
}

function getEmptyMessage({
  total,
  filtered,
  statusFilter,
  typeFilter,
  query,
}: {
  total: number;
  filtered: number;
  statusFilter: UploadStatusFilter;
  typeFilter: UploadTypeFilter;
  query: string;
}) {
  if (total === 0) {
    return {
      title: "You have not uploaded anything yet",
      body: "Share a testimony, praise report, prayer request, or video to begin your uploads library.",
    };
  }

  if (query.trim()) {
    return {
      title: "No uploads match your search",
      body: "Try a different keyword from your story text, type, status, or location.",
    };
  }

  if (statusFilter === "approved") {
    return {
      title: "No approved uploads",
      body: "Approved uploads will appear here once your content is visible to the community.",
    };
  }

  if (statusFilter === "pending") {
    return {
      title: "No pending uploads",
      body: "Uploads awaiting review will appear in this filter.",
    };
  }

  if (statusFilter === "removed") {
    return {
      title: "No removed uploads",
      body: "Uploads you remove from public view will appear here before permanent deletion.",
    };
  }

  if (statusFilter === "videos" || typeFilter === "text") {
    return {
      title: "No matching media uploads",
      body: "Try another filter to browse your library.",
    };
  }

  if (filtered === 0) {
    return {
      title: "No uploads in this filter",
      body: "Adjust your filters to see more of your shared content.",
    };
  }

  return {
    title: "No uploads to show",
    body: "Your uploads library is ready when you share again.",
  };
}
