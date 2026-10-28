"use client";

import * as React from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { useBoardStore } from "@/stores/board-store";
import { cn } from "@/lib/utils";

// Shared "extracted content" status block for video/audio/link nodes (F-14,
// ADR-0044/ADR-0085/ADR-0086/ADR-0087/ADR-0091/ADR-0094) — the server-side pipeline's
// client-visible state, plus the manual "Re-extract" override. For video/audio and most
// media URLs that's yt-dlp/ffmpeg/whisper (an actual transcript); for an ordinary
// article link it's now ADR-0094's Readability-based page scrape instead (plain article
// text, not a transcript) — wording here stays deliberately generic ("content", not
// "transcript") since this one component covers both. ADR-0044's caching strategy
// (extract once, cache forever) still holds regardless of which path produced it;
// ADR-0091 changed WHEN the first extraction fires — eagerly, the moment a node's
// source is known, rather than waiting on a connected chat node's first reference — so
// `status === undefined` below should now be rare in practice (a node whose source
// genuinely isn't set yet, e.g. an empty link card still awaiting its URL) rather than
// the common case it used to be.
//
// Deliberately separate from file-node.tsx's own `ExtractionStatus` (document
// pdf/docx/xlsx extraction — synchronous at UPLOAD time, no "pending" state, no
// re-extract action) even though the two render similarly — they're different
// pipelines with a different state machine, and conflating them would make a later
// change to one risk silently breaking the other.
//
// Small, low-stakes call made while building this (not its own ADR — flagged here and
// in the Phase 5 status handoff instead): the same button does double duty as "Extract
// now" when nothing has ever been extracted (status undefined) and "Re-extract" once
// something has (ok/failed) — both hit the exact same `/re-extract` route
// (`force: true`, bypasses the cache check either way), so there's no real behavioral
// difference, just a label that matches what the user is actually about to do.
export function NodeExtractionStatus({
  nodeId,
  status,
  preview,
  // `link` nodes (F-27/ADR-0087) stay quiet until extraction has actually been
  // attempted — before ADR-0094, most non-media links would just fail, so there was no
  // "Not yet referenced" nudge inviting a force-run against what was usually a dead
  // end; now most of those same links actually succeed via the article-scrape fallback,
  // but the UX reasoning holds either way — there's still nothing useful to nudge about
  // until a real attempt (now near-instant via ADR-0091's eager trigger) has run.
  quietOnUnextracted = false,
  // ADR-0093 (Istiyak: "let's do shimmer on thumbnail preview only so it will be much
  // valid experience") — video-node.tsx now shows the shimmer directly on its own big
  // thumbnail image instead, which is the more prominent, more honest-feeling surface
  // for "this is actively working" than two thin bars tucked under the text. Set false
  // by that one caller only; audio/link nodes have no large preview image to shimmer
  // instead, so they keep the skeleton bars here as their only visible progress signal.
  showSkeletonBars = true,
}: {
  nodeId: string;
  status: "pending" | "ok" | "failed" | undefined;
  preview: string | null | undefined;
  quietOnUnextracted?: boolean;
  showSkeletonBars?: boolean;
}) {
  const reExtractNode = useBoardStore((state) => state.reExtractNode);
  const [reExtracting, setReExtracting] = React.useState(false);

  const handleReExtract = React.useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      setReExtracting(true);
      reExtractNode(nodeId).finally(() => setReExtracting(false));
    },
    [nodeId, reExtractNode]
  );

  const button = status !== "pending" ? (
    <button
      type="button"
      onClick={handleReExtract}
      disabled={reExtracting}
      className="nodrag flex shrink-0 items-center gap-1 rounded text-xs text-text-muted hover:text-text-primary disabled:opacity-50"
      title={status === "ok" || status === "failed" ? "Re-extract this content" : "Extract content now"}
    >
      <RotateCw className={cn("size-3", reExtracting && "animate-spin")} aria-hidden="true" />
      {reExtracting ? "Extracting…" : status === "ok" || status === "failed" ? "Re-extract" : "Extract now"}
    </button>
  ) : null;

  if (status === "ok") {
    return (
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-3 text-xs text-text-secondary">{preview || "Content extracted."}</p>
        {button}
      </div>
    );
  }
  if (status === "failed") {
    return (
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1 text-xs text-text-danger">
          <AlertTriangle className="size-3 shrink-0" aria-hidden="true" />
          Couldn&apos;t extract content from this.
        </p>
        {button}
      </div>
    );
  }
  if (status === "pending") {
    // ADR-0091 (Istiyak: "Add shining skeleton shimmer style animation... I am not
    // able to see where i have reached or done") — a long video's whisper pass can run
    // for many minutes with no real step-by-step progress to report (see globals.css's
    // `.shimmer-bar` comment for why), so this shows a constantly sweeping skeleton
    // instead of a static line of text that's easy to mistake for frozen.
    return (
      <div className="flex flex-col gap-1.5">
        <p className="text-xs text-text-muted">Extracting content…</p>
        {showSkeletonBars ? (
          <>
            <div className="shimmer-bar h-2 w-full rounded-full" aria-hidden="true" />
            <div className="shimmer-bar h-2 w-2/3 rounded-full" aria-hidden="true" />
          </>
        ) : null}
      </div>
    );
  }
  // status undefined — nothing has triggered extraction yet. Rare since ADR-0091: the
  // node's own creation path (or, for a link card, its URL field committing) already
  // fires extraction eagerly, so this now mostly means the source genuinely isn't set
  // yet (an empty link card) rather than a lazy wait on a chat reference.
  if (quietOnUnextracted) return null;
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="text-xs text-text-muted">Not yet referenced in a chat.</p>
      {button}
    </div>
  );
}
