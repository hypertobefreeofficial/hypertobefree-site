"use client";

import { useEffect, useState } from "react";
import {
  getCuratedBackgroundFallbackSrc,
  isCuratedPackBackgroundPath,
} from "../../lib/creationCenterCuratedAssets";

type CreatorStudioCuratedBackgroundProps = {
  src: string;
  alt?: string;
  className?: string;
  loading?: "lazy" | "eager";
};

export default function CreatorStudioCuratedBackground({
  src,
  alt = "",
  className,
  loading,
}: CreatorStudioCuratedBackgroundProps) {
  const [resolvedSrc, setResolvedSrc] = useState(src);
  const [usedFallback, setUsedFallback] = useState(false);

  useEffect(() => {
    setResolvedSrc(src);
    setUsedFallback(false);
  }, [src]);

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      loading={loading}
      className={className}
      onError={() => {
        if (usedFallback || !isCuratedPackBackgroundPath(src)) return;

        setResolvedSrc(getCuratedBackgroundFallbackSrc(src));
        setUsedFallback(true);
      }}
    />
  );
}
