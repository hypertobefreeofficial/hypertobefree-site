"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./FeedScrollHeader.module.css";

const SCROLL_DELTA_THRESHOLD = 24;
const TOP_REVEAL_SCROLL_Y = 8;

type FeedScrollHeaderProps = {
  children: ReactNode;
};

export default function FeedScrollHeader({ children }: FeedScrollHeaderProps) {
  const [hidden, setHidden] = useState(false);
  const lastScrollYRef = useRef(0);
  const tickingRef = useRef(false);

  useEffect(() => {
    lastScrollYRef.current = window.scrollY;

    function updateHeaderVisibility() {
      const currentY = window.scrollY;
      const lastY = lastScrollYRef.current;
      const delta = currentY - lastY;

      if (currentY <= TOP_REVEAL_SCROLL_Y) {
        setHidden(false);
      } else if (delta > SCROLL_DELTA_THRESHOLD) {
        setHidden(true);
      } else if (delta < -SCROLL_DELTA_THRESHOLD) {
        setHidden(false);
      }

      lastScrollYRef.current = currentY;
      tickingRef.current = false;
    }

    function handleScroll() {
      if (tickingRef.current) return;
      tickingRef.current = true;
      window.requestAnimationFrame(updateHeaderVisibility);
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`${styles.header} ${hidden ? styles.headerHidden : ""}`}
      data-feed-scroll-header="true"
    >
      {children}
    </header>
  );
}
