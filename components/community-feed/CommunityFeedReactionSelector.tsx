"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import type { FeedReactionType } from "./types";
import styles from "../FreedomFeed.module.css";

const REACTION_OPTIONS: {
  type: Exclude<FeedReactionType, "praying">;
  label: string;
  emoji: string;
}[] = [
  { type: "amen", label: "Amen", emoji: "🙏" },
  { type: "praise_god", label: "Praise God", emoji: "✨" },
  { type: "encouraged", label: "Encouraged", emoji: "💙" },
];

type CommunityFeedReactionSelectorProps = {
  storyId: string;
  userReactions: FeedReactionType[];
  onToggleReaction: (storyId: string, reactionType: FeedReactionType) => void;
};

function readCssLengthPx(variableName: string) {
  if (typeof window === "undefined") return 0;

  const probe = document.createElement("div");
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  probe.style.height = `var(${variableName})`;
  document.documentElement.appendChild(probe);
  const height = probe.getBoundingClientRect().height;
  probe.remove();

  return height;
}

export default function CommunityFeedReactionSelector({
  storyId,
  userReactions,
  onToggleReaction,
}: CommunityFeedReactionSelectorProps) {
  const [open, setOpen] = useState(false);
  const [isMobileSheet, setIsMobileSheet] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  const activeReaction = REACTION_OPTIONS.find((option) =>
    userReactions.includes(option.type)
  );

  const closeMenu = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  const updateMenuPosition = useCallback(() => {
    if (!open || !triggerRef.current) return;

    if (isMobileSheet) {
      const navElement = document.querySelector(".logged-in-bottom-nav");
      if (navElement) {
        const navRect = navElement.getBoundingClientRect();
        setMenuStyle({
          bottom: `${Math.max(window.innerHeight - navRect.top, 0)}px`,
        });
        return;
      }

      const navHeight =
        readCssLengthPx("--app-mobile-bottom-nav-height") || 76;
      setMenuStyle({ bottom: `${navHeight}px` });
      return;
    }

    const rect = triggerRef.current.getBoundingClientRect();
    setMenuStyle({
      top: `${rect.top - 8}px`,
      left: `${rect.left}px`,
      transform: "translateY(-100%)",
    });
  }, [isMobileSheet, open]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const media = window.matchMedia("(max-width: 1023px)");
    const sync = () => setIsMobileSheet(media.matches);
    sync();
    media.addEventListener("change", sync);

    return () => media.removeEventListener("change", sync);
  }, []);

  useLayoutEffect(() => {
    updateMenuPosition();
  }, [open, isMobileSheet, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;

    updateMenuPosition();

    const previousOverflow = document.body.style.overflow;
    if (isMobileSheet) {
      document.body.style.overflow = "hidden";
    }

    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);

    const firstOption = menuRef.current?.querySelector<HTMLElement>(
      '[role="menuitemradio"]'
    );
    firstOption?.focus();

    function handlePointerDown(event: Event) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      closeMenu();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu();
      }

      if (event.key !== "Tab" || !menuRef.current) return;

      const focusable = Array.from(
        menuRef.current.querySelectorAll<HTMLElement>(
          'button,[href],[tabindex]:not([tabindex="-1"])'
        )
      ).filter((node) => !node.hasAttribute("disabled"));

      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeMenu, isMobileSheet, open, updateMenuPosition]);

  const menu = open ? (
    <>
      {isMobileSheet ? (
        <button
          type="button"
          className={styles.reactionSelectorBackdrop}
          aria-label="Close reaction menu"
          onClick={closeMenu}
        />
      ) : null}
      <div
        id={menuId}
        ref={menuRef}
        className={
          isMobileSheet
            ? styles.reactionSelectorMenuSheet
            : styles.reactionSelectorMenuPopover
        }
        style={menuStyle}
        role="menu"
        aria-label="Choose a reaction"
      >
        {REACTION_OPTIONS.map((option) => {
          const active = userReactions.includes(option.type);
          return (
            <button
              key={option.type}
              type="button"
              role="menuitemradio"
              aria-checked={active}
              className={`${styles.reactionSelectorOption} ${
                active ? styles.reactionSelectorOptionActive : ""
              }`}
              onClick={() => {
                onToggleReaction(storyId, option.type);
                closeMenu();
              }}
            >
              <span aria-hidden>{option.emoji}</span>
              {option.label}
            </button>
          );
        })}
      </div>
    </>
  ) : null;

  return (
    <div
      ref={rootRef}
      className={`${styles.reactionSelectorRoot} ${
        open ? styles.reactionSelectorRootOpen : ""
      }`}
      data-feed-reaction-selector-root="true"
    >
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.primaryActionButton} ${
          activeReaction ? styles.primaryActionButtonActive : ""
        }`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        {activeReaction
          ? `${activeReaction.emoji} ${activeReaction.label}`
          : "React"}
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(menu, document.body)
        : null}
    </div>
  );
}
