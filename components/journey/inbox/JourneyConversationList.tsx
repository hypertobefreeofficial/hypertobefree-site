import JourneyConversationRow from "./JourneyConversationRow";
import type { InboxListItem } from "../../../lib/journey/inbox/types";
import type { InboxTimeGroup } from "../../../lib/journey/inbox/types";
import { getInboxItemKey } from "../../../lib/journey/inbox/utils";
import styles from "./JourneyInbox.module.css";

type JourneyConversationListProps = {
  groups: InboxTimeGroup[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
};

export default function JourneyConversationList({
  groups,
  selectedKey,
  onSelect,
}: JourneyConversationListProps) {
  return (
    <div className={styles.conversationList} role="list">
      {groups.map((group) => (
        <section key={group.id} aria-label={group.label}>
          <div className={styles.groupLabel}>{group.label}</div>

          {group.items.map((item: InboxListItem) => {
            const key = getInboxItemKey(item);

            return (
              <JourneyConversationRow
                key={key}
                item={item}
                selected={selectedKey === key}
                onSelect={() => onSelect(key)}
              />
            );
          })}
        </section>
      ))}
    </div>
  );
}
