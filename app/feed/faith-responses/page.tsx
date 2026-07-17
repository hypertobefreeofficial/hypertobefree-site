"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import FaithResponsesViewer, {
  type FaithResponsesViewerModel,
} from "../../../components/public-video-responses/FaithResponsesViewer";
import { loadFaithResponsesViewerModel } from "../../../lib/responses/loadFaithResponsesViewerModel";
import { loadFaithResponsesFixtureModel } from "../../../lib/responses/faithResponsesFixtureModel";
import {
  clearFaithResponsesReturnState,
  storeFaithResponsesReturnState,
} from "../../../lib/responses/faithResponsesNavigation";

function FaithResponsesPageContent() {
  const searchParams = useSearchParams();
  const parentStoryId = searchParams.get("story")?.trim() ?? "";
  const initialResponseId = searchParams.get("response")?.trim() || null;
  const returnScrollY = Number(searchParams.get("returnScrollY") ?? "");
  const returnAnchor = searchParams.get("returnAnchor")?.trim();
  const useFixture =
    process.env.NODE_ENV !== "production" &&
    searchParams.get("fixture") === "1";

  const [model, setModel] = useState<FaithResponsesViewerModel | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (
      Number.isFinite(returnScrollY) &&
      typeof window !== "undefined"
    ) {
      storeFaithResponsesReturnState({
        scrollY: returnScrollY,
        anchorId: returnAnchor || undefined,
      });
    } else {
      clearFaithResponsesReturnState();
    }
  }, [returnAnchor, returnScrollY]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!parentStoryId) {
        setModel(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      const loaded = useFixture
        ? loadFaithResponsesFixtureModel(parentStoryId, initialResponseId)
        : await loadFaithResponsesViewerModel(
            parentStoryId,
            initialResponseId
          );
      if (!cancelled) {
        setModel(loaded);
        setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [initialResponseId, parentStoryId, useFixture]);

  if (!parentStoryId) {
    return (
      <main className="min-h-screen bg-[#f8fafc] p-6 text-slate-900">
        <p>Missing parent post context.</p>
      </main>
    );
  }

  if (loading) {
    return (
      <main
        className="min-h-screen bg-[#0b1f3f] p-6 text-white"
        aria-live="polite"
      >
        Loading Faith Responses…
      </main>
    );
  }

  if (!model) {
    return (
      <main className="min-h-screen bg-[#f8fafc] p-6 text-slate-900">
        <p>Could not load responses for this post.</p>
      </main>
    );
  }

  return <FaithResponsesViewer model={model} />;
}

export default function FaithResponsesPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#0b1f3f] p-6 text-white">
          Loading Faith Responses…
        </main>
      }
    >
      <FaithResponsesPageContent />
    </Suspense>
  );
}
