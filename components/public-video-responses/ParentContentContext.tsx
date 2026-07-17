"use client";

import Link from "next/link";
import {
  parentHrefForResponseContext,
  type PublicVideoResponseContext,
} from "../../lib/responses/publicVideoResponseContext";
import { parentContextShort } from "../../lib/responses/publicVideoResponseLabels";
import styles from "./PublicVideoResponses.module.css";

type ParentContentContextProps = {
  parentStoryId: string;
  parentAuthorName: string | null;
  parentCaption: string | null;
  parentThumbnailUrl?: string | null;
  responseContext: PublicVideoResponseContext | string | null;
  compact?: boolean;
};

export default function ParentContentContext({
  parentStoryId,
  parentAuthorName,
  parentCaption,
  parentThumbnailUrl,
  responseContext,
  compact = false,
}: ParentContentContextProps) {
  const href = parentHrefForResponseContext(parentStoryId, responseContext);
  const label = parentContextShort({
    context: responseContext,
    parentAuthorName,
  });
  const excerpt = parentCaption?.trim()
    ? parentCaption.length > 96
      ? `${parentCaption.slice(0, 96).trim()}…`
      : parentCaption
    : null;

  return (
    <Link href={href} className={styles.parentStrip}>
      {parentThumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={parentThumbnailUrl}
          alt=""
          className={styles.parentStripThumb}
        />
      ) : (
        <div className={styles.parentStripThumb} aria-hidden />
      )}
      <div className={styles.parentStripCopy}>
        <div className={styles.parentStripLabel}>{label}</div>
        <p className={styles.parentStripTitle}>
          {compact ? excerpt || "View original post" : excerpt || label}
        </p>
      </div>
    </Link>
  );
}
