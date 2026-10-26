"use client";

import * as React from "react";
import type { NodeProps } from "@xyflow/react";
import { SquarePlay, Video, Play, AlertTriangle } from "lucide-react";
import { useBoardStore, type VideoNodeData } from "@/stores/board-store";
import { NodeChrome } from "@/components/canvas/node-chrome";
import { NodeHeader } from "@/components/canvas/node-header";
import { NodeNotesField } from "@/components/canvas/node-notes-field";
import { cn } from "@/lib/utils";

// Video link node — the Phase 5 metadata/thumbnail slice pulled forward into the
// node-card-overhaul pass (ADR-0065). Explicitly NO in-app playback (feature.md F-10 /
// implementation_plan.md Phase 5): the thumbnail's play glyph is purely decorative —
// clicking anywhere on the card's media area opens the real video in a new tab, exactly
// like the header's own "Open original" menu action, never an embedded player.
//
// `data.status` reflects the backend oEmbed fetch kicked off the moment this node was
// created (board-store.ts's `addVideoNodeFromUrl` / `convertLinkNodeToVideo`): "loading"
// while in flight, "ok" once title/thumbnail resolve, "error" for an invalid/private/
// unreachable video — each gets its own clear visual state, never a blank or broken card.
function VideoNodeImpl({ id, data, selected }: NodeProps) {
  const typedData = data as VideoNodeData;
  const updateNodeData = useBoardStore((state) => state.updateNodeData);
  const flushNodeData = useBoardStore((state) => state.flushNodeData);
  const deleteNode = useBoardStore((state) => state.deleteNode);

  const openOriginal = React.useCallback(() => {
    window.open(typedData.url, "_blank", "noopener,noreferrer");
  }, [typedData.url]);

  const isYoutube = typedData.platform !== "vimeo";
  const platformLabel = isYoutube ? "YouTube" : "Vimeo";
  const headerLabel =
    typedData.status === "loading" ? "Loading…" : typedData.title || typedData.authorName || `${platformLabel} video`;
  // Round 2 / ADR-0071: YouTube keeps the existing red (danger); Vimeo gets the app's
  // indigo/purple "accent" scale instead — maps onto the reference's distinct
  // "general/other video = purple" category better than sharing YouTube's red, and
  // keeps the two platforms visually distinguishable at a glance.
  const accent = isYoutube ? "danger" : "accent";
  // Round 5 (Istiyak: "Youtube should have youtube solid icon not the view file icon"):
  // `Clapperboard` read as a generic "video file" glyph, not as YouTube. There is no
  // literal YouTube brand icon in this lucide-react version (checked directly —
  // confirmed absent), so `SquarePlay` (a rounded rect + play triangle) is used as an
  // honest, non-trademark silhouette stand-in, rendered in `iconBadge`'s solid red chip
  // — the same "solid icon" treatment the reference gives YouTube and Text's "T" block.
  // Vimeo keeps a plain (non-badged) `Video` glyph in its own purple `ribbonFg` color,
  // so the two platforms stay visually distinct rather than sharing one badge style.
  const Icon = isYoutube ? SquarePlay : Video;
  // ADR-0070: the explicit resized size, read from `data` — see node-chrome.tsx's top
  // comment for why this must not be NodeProps' own `width`/`height` (BUG-012).
  const explicitWidth = typedData.cardWidth;
  const explicitHeight = typedData.cardHeight;

  return (
    <NodeChrome
      selected={selected}
      accent={accent}
      header={
        <NodeHeader
          icon={Icon}
          label={headerLabel}
          onOpen={openOriginal}
          openLabel="Open original"
          spinning={typedData.status === "loading"}
          iconBadge={isYoutube}
          accent={accent}
        />
      }
      width={explicitWidth}
      height={explicitHeight}
      onDelete={() => deleteNode(id)}
      // Round 6 (Istiyak: "Apart from text none of the node cards needed resize") — no
      // longer passed here; `width`/`height` above still honor a size persisted by an
      // earlier round, for any video card resized before this change.
    >
      <button
        type="button"
        onClick={openOriginal}
        aria-label={`Open "${headerLabel}" on ${platformLabel}`}
        className={cn(
          "nodrag group/thumb relative block w-full overflow-hidden bg-background-muted",
          // Round 4 / BUG-016: this used to stay a fixed h-32 even on a resized card —
          // the card's own outer box grew (once the chrome-level drift bug was fixed),
          // but the thumbnail itself never did, which read as "resize doesn't touch the
          // thumbnail." `flex-1 min-h-0` makes it the one element in the body that
          // actually absorbs any extra resized height (the notes field below keeps its
          // own fixed collapsed/expanded height either way).
          explicitHeight ? "min-h-0 flex-1" : "h-32 shrink-0"
        )}
      >
        {typedData.status === "ok" && typedData.thumbnailUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- an external
                thumbnail URL from the platform's oEmbed response, not a local/optimizable asset */}
            <img
              src={typedData.thumbnailUrl}
              alt={typedData.title || "Video thumbnail"}
              className="h-full w-full object-cover transition-transform duration-fast ease-standard group-hover/thumb:scale-105"
            />
            <span className="absolute inset-0 flex items-center justify-center bg-black/10 opacity-0 transition-opacity duration-fast group-hover/thumb:opacity-100">
              <span className="flex size-8 items-center justify-center rounded-full bg-black/60 text-white">
                <Play className="size-4 fill-current" aria-hidden="true" />
              </span>
            </span>
            {typedData.authorName ? (
              <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-xs font-medium leading-none text-white">
                {typedData.authorName}
              </span>
            ) : null}
          </>
        ) : typedData.status === "error" ? (
          <span className="flex h-full flex-col items-center justify-center gap-1 px-2 text-center">
            <AlertTriangle className="size-4 text-text-danger" aria-hidden="true" />
            <span className="text-xs text-text-muted">Couldn&apos;t load a preview — the link still opens.</span>
          </span>
        ) : (
          <span className="block h-full w-full animate-pulse bg-background-muted" />
        )}
      </button>

      <NodeNotesField
        value={typedData.notes}
        onChange={(value) => updateNodeData(id, { ...typedData, notes: value })}
        onCommit={() => flushNodeData(id)}
      />
    </NodeChrome>
  );
}

export const VideoNode = React.memo(VideoNodeImpl);
