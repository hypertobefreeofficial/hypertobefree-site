import type { InboxFilter } from "../../../lib/journey/inbox/types";
import { FILTERS } from "../../../lib/journey/inbox/constants";
import styles from "./JourneyInbox.module.css";

type JourneyInboxFiltersProps = {
  activeFilter: InboxFilter;
  onFilterChange: (filter: InboxFilter) => void;
};

export default function JourneyInboxFilters({
  activeFilter,
  onFilterChange,
}: JourneyInboxFiltersProps) {
  return (
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
  );
}
