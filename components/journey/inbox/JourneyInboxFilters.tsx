import type { InboxFilter } from "../../../lib/journey/inbox/types";
import { FILTERS } from "../../../lib/journey/inbox/constants";
import styles from "./JourneyInbox.module.css";

type JourneyInboxFiltersProps = {
  activeFilter: InboxFilter;
  onFilterChange: (filter: InboxFilter) => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  itemCount: number;
  onMarkVisibleRead: () => void;
  onClearVisible: () => void;
  markingAllRead: boolean;
  canMarkVisibleRead: boolean;
  canClearVisible: boolean;
};

export default function JourneyInboxFilters({
  activeFilter,
  onFilterChange,
  searchQuery,
  onSearchChange,
  itemCount,
  onMarkVisibleRead,
  onClearVisible,
  markingAllRead,
  canMarkVisibleRead,
  canClearVisible,
}: JourneyInboxFiltersProps) {
  return (
    <>
      <div className={styles.searchWrap}>
        <label htmlFor="journey-inbox-search" className="sr-only">
          Search inbox
        </label>
        <input
          id="journey-inbox-search"
          type="search"
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search messages..."
          className={styles.searchInput}
        />
      </div>

      <div className={styles.filters} role="tablist" aria-label="Inbox filters">
        {FILTERS.map((filter) => (
          <button
            key={filter.id}
            type="button"
            role="tab"
            aria-selected={activeFilter === filter.id}
            onClick={() => onFilterChange(filter.id)}
            className={`${styles.filterPill} ${
              activeFilter === filter.id ? styles.filterPillActive : ""
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className={styles.listToolbar}>
        <span className={styles.subtitle}>
          {itemCount} item{itemCount === 1 ? "" : "s"}
        </span>

        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={onMarkVisibleRead}
            disabled={!canMarkVisibleRead || markingAllRead}
            className={`${styles.toolbarButton} ${styles.toolbarButtonPrimary}`}
          >
            {markingAllRead ? "Marking..." : "Mark All Read"}
          </button>

          <button
            type="button"
            onClick={onClearVisible}
            disabled={!canClearVisible}
            className={`${styles.toolbarButton} ${styles.toolbarButtonDanger}`}
          >
            Remove visible messages
          </button>
        </div>
      </div>
    </>
  );
}
