import Link from "next/link";
import {
  ChevronRight,
  Compass,
  NotebookPen,
  Play,
  Trash2,
  Video,
  X,
} from "lucide-react";
import styles from "./JourneyDashboard.module.css";

type StoryRow = {
  id: string;
  user_id: string | null;
  name: string | null;
  location: string | null;
  story_type: string | null;
  story_text: string | null;
  video_url: string | null;
  status: string | null;
  prayer_status: string | null;
  answered_text: string | null;
  created_at: string | null;
  edited_at?: string | null;
  removed_at?: string | null;
};

type UploadTotals = {
  total: number;
  approved: number;
  pending: number;
  removed: number;
  videos: number;
};

type JourneyManagementCardProps = {
  controlCenterOpen: boolean;
  onOpenControlCenter: () => void;
  onCloseControlCenter: () => void;
  uploadTotals: UploadTotals;
  myUploads: StoryRow[];
  removedUploads: StoryRow[];
  removingStoryId: string | null;
  clearingRemovedStoryId: string | null;
  clearingAllRemoved: boolean;
  onEditStory: (story: StoryRow) => void;
  onRemoveStory: (story: StoryRow) => void;
  onClearRemovedStory: (story: StoryRow) => void;
  onClearAllRemoved: () => void;
};

export default function JourneyManagementCard({
  controlCenterOpen,
  onOpenControlCenter,
  onCloseControlCenter,
  uploadTotals,
  myUploads,
  removedUploads,
  removingStoryId,
  clearingRemovedStoryId,
  clearingAllRemoved,
  onEditStory,
  onRemoveStory,
  onClearRemovedStory,
  onClearAllRemoved,
}: JourneyManagementCardProps) {
  return (
    <>
      <button
        type="button"
        onClick={onOpenControlCenter}
        className={styles.manageCard}
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
          <Compass className="h-6 w-6" aria-hidden />
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-sm font-black uppercase tracking-[0.18em] text-amber-700">
            Manage Your Journey
          </div>
          <h2 className={styles.sectionTitle}>My uploads</h2>
          <p className={styles.sectionBody}>
            View, edit, and remove your videos, testimonies, praise reports,
            and prayer requests from one place.
          </p>
        </div>

        <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
      </button>

      {controlCenterOpen && (
        <section
          className={`${styles.sectionCard} ${styles.controlCenterPanel}`}
          aria-labelledby="journey-control-center-title"
        >
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-black uppercase tracking-[0.18em] text-amber-700">
                Control Center
              </div>
              <h2
                id="journey-control-center-title"
                className={styles.sectionTitle}
              >
                My Uploads
              </h2>
              <p className={styles.sectionBody}>
                This is where you manage what you have shared on HTBF.
              </p>
            </div>

            <button
              type="button"
              onClick={onCloseControlCenter}
              className="rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-600"
            >
              Close
            </button>
          </div>

          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <MiniUploadStat label="Total" number={uploadTotals.total} />
            <MiniUploadStat label="Approved" number={uploadTotals.approved} />
            <MiniUploadStat label="Pending" number={uploadTotals.pending} />
            <MiniUploadStat label="Removed" number={uploadTotals.removed} />
            <MiniUploadStat label="Videos" number={uploadTotals.videos} />
          </div>

          {removedUploads.length > 0 && (
            <div className="mb-5 flex flex-col gap-3 rounded-[1.5rem] bg-red-50 p-4 ring-1 ring-red-100 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-black text-red-800">
                  Clear removed uploads
                </div>
                <p className="mt-1 text-sm leading-6 text-red-700">
                  Permanently remove items already marked Removed from this
                  control center.
                </p>
              </div>

              <button
                type="button"
                onClick={onClearAllRemoved}
                disabled={clearingAllRemoved}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-red-600 px-4 py-2 text-sm font-black text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                {clearingAllRemoved ? "Clearing..." : "Clear All Removed"}
              </button>
            </div>
          )}

          <div className="space-y-4">
            {myUploads.length === 0 ? (
              <div className="rounded-[1.5rem] bg-slate-50 p-5 text-sm leading-6 text-slate-600 ring-1 ring-slate-200">
                You have not uploaded anything yet.
              </div>
            ) : (
              myUploads.map((story) => (
                <MyUploadCard
                  key={story.id}
                  story={story}
                  removing={removingStoryId === story.id}
                  clearingRemoved={clearingRemovedStoryId === story.id}
                  onEdit={() => onEditStory(story)}
                  onRemove={() => onRemoveStory(story)}
                  onClearRemoved={() => onClearRemovedStory(story)}
                />
              ))
            )}
          </div>
        </section>
      )}
    </>
  );
}

function MiniUploadStat({
  number,
  label,
}: {
  number: string | number;
  label: string;
}) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3 text-center ring-1 ring-slate-100">
      <div className="text-xl font-black text-[#062a57]">{number}</div>
      <div className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
        {label}
      </div>
    </div>
  );
}

function MyUploadCard({
  story,
  removing,
  clearingRemoved,
  onEdit,
  onRemove,
  onClearRemoved,
}: {
  story: StoryRow;
  removing: boolean;
  clearingRemoved: boolean;
  onEdit: () => void;
  onRemove: () => void;
  onClearRemoved: () => void;
}) {
  const isRemoved = story.status === "removed";
  const isApproved = story.status === "approved";
  const hasVideo = Boolean(story.video_url);

  const preview =
    story.story_text?.trim() ||
    story.story_type ||
    "No description added yet.";

  return (
    <article className="rounded-[1.5rem] bg-slate-50 p-4 ring-1 ring-slate-200">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <StoryStatusBadge status={story.status} />

            {hasVideo && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-[11px] font-black text-[#0b63ce] ring-1 ring-blue-100">
                <Video className="h-3 w-3" aria-hidden />
                Video
              </span>
            )}
          </div>

          <div className="mt-2 text-sm font-black text-[#062a57]">
            {story.story_type || "HTBF Upload"}
          </div>

          <div className="mt-1 text-xs font-bold text-slate-500">
            Submitted {formatShortDate(story.created_at)}
            {story.edited_at
              ? ` • Edited ${formatShortDate(story.edited_at)}`
              : ""}
          </div>
        </div>
      </div>

      <p
        className="whitespace-pre-line text-sm font-semibold leading-6 text-slate-700"
        style={{
          overflowWrap: "anywhere",
          wordBreak: "break-word",
        }}
      >
        {preview.length > 220 ? `${preview.slice(0, 220)}...` : preview}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onEdit}
          disabled={isRemoved}
          className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-black text-[#082f63] ring-1 ring-slate-200 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <NotebookPen className="h-4 w-4" aria-hidden />
          Edit
        </button>

        {isApproved && hasVideo && (
          <Link
            href={`/video-feed?story=${story.id}&from=control-center`}
            className="inline-flex items-center gap-2 rounded-full bg-[#0b63ce] px-4 py-2 text-sm font-black text-white hover:bg-[#084f9f]"
          >
            <Play className="h-4 w-4" aria-hidden />
            View
          </Link>
        )}

        {!isRemoved && (
          <button
            type="button"
            onClick={onRemove}
            disabled={removing}
            className="inline-flex items-center gap-2 rounded-full bg-red-50 px-4 py-2 text-sm font-black text-red-700 ring-1 ring-red-100 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            {removing ? "Removing..." : "Remove"}
          </button>
        )}

        {isRemoved && (
          <button
            type="button"
            onClick={onClearRemoved}
            disabled={clearingRemoved}
            className="inline-flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-sm font-black text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            {clearingRemoved ? "Deleting..." : "Delete Forever"}
          </button>
        )}
      </div>
    </article>
  );
}

function StoryStatusBadge({ status }: { status: string | null }) {
  const normalized = status || "pending";

  const style =
    normalized === "approved"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
      : normalized === "removed"
        ? "bg-red-50 text-red-700 ring-red-100"
        : "bg-amber-50 text-amber-700 ring-amber-100";

  const label =
    normalized === "approved"
      ? "Approved"
      : normalized === "removed"
        ? "Removed"
        : "Pending";

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-[11px] font-black ring-1 ${style}`}
    >
      {label}
    </span>
  );
}

function formatShortDate(value: string | null) {
  if (!value) return "";

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}
