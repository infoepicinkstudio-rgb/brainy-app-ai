"use client";

import * as React from "react";
import type { NodeProps } from "@xyflow/react";
import { SquarePlay, Video, Play, AlertTriangle, FileVideo, Download } from "lucide-react";
import { useBoardStore, type VideoNodeData } from "@/stores/board-store";
import { NodeChrome } from "@/components/canvas/node-chrome";
import { NodeHeader } from "@/components/canvas/node-header";
import { NodeNotesField } from "@/components/canvas/node-notes-field";
import { NodeExtractionStatus } from "@/components/canvas/node-extraction-status";
import { API_BASE_URL } from "@/lib/api";
import { cn } from "@/lib/utils";

// Video node — two sources as of ADR-0086. URL-sourced (the original, pulled forward
// from Phase 5's metadata/thumbnail slice into the node-card-overhaul pass, ADR-0065):
// explicitly NO in-app playback (feature.md F-10) — the thumbnail's play glyph is purely
// decorative, clicking anywhere on the media area opens the real video in a new tab,
// same as the header's own "Open original" action, never an embedded player.
// Upload-sourced (new, ADR-0086): a local video file with no oEmbed metadata at all —
// renders like file-node.tsx's/audio-node.tsx's upload body (filename + size/download)
// instead of a thumbnail, since there's no thumbnail to fetch. Both sources share the
// same lazy transcript pipeline (F-14) below the media/file area.
//
// `data.source` is `"url" | "upload" | undefined` — undefined is a LEGACY node created
// before ADR-0086 (every node from before this phase), which only ever had URL fields,
// so it's treated exactly like `"url"` rather than requiring a data migration.
//
// `data.status` (URL-sourced only) reflects the backend oEmbed fetch kicked off the
// moment this node was created (board-store.ts's `addVideoNodeFromUrl` /
// `convertLinkNodeToVideo`): "loading" while in flight, "ok" once title/thumbnail
// resolve, "error" for an invalid/private/unreachable video.
function VideoNodeImpl({ id, data, selected, parentId }: NodeProps) {
  const typedData = data as VideoNodeData;
  const updateNodeData = useBoardStore((state) => state.updateNodeData);
  const flushNodeData = useBoardStore((state) => state.flushNodeData);
  const deleteNode = useBoardStore((state) => state.deleteNode);
  const duplicateSelection = useBoardStore((state) => state.duplicateSelection);
  const isUpload = typedData.source === "upload";

  const openOriginal = React.useCallback(() => {
    window.open(typedData.url, "_blank", "noopener,noreferrer");
  }, [typedData.url]);

  // URL-source-only presentation (isYoutube/platformLabel/accent/Icon below are
  // meaningless for an upload — `platform` is simply absent there — so none of this
  // runs for isUpload; see the upload-specific header/body built separately below).
  const isYoutube = typedData.platform !== "vimeo";
  const platformLabel = isYoutube ? "YouTube" : "Vimeo";
  const urlHeaderLabel =
    typedData.status === "loading" ? "Loading…" : typedData.title || typedData.authorName || `${platformLabel} video`;
  // Round 2 / ADR-0071: YouTube keeps the existing red (danger); Vimeo gets the app's
  // indigo/purple "accent" scale instead — maps onto the reference's distinct
  // "general/other video = purple" category better than sharing YouTube's red, and
  // keeps the two platforms visually distinguishable at a glance. An uploaded video
  // (ADR-0086) shares that same purple "accent" scale — it's visually a third
  // "general/other video" case, same as Vimeo, just sourced from a local file instead
  // of a link.
  const accent = isUpload ? "accent" : isYoutube ? "danger" : "accent";
  // Round 5 (Istiyak: "Youtube should have youtube solid icon not the view file icon"):
  // `Clapperboard` read as a generic "video file" glyph, not as YouTube. There is no
  // literal YouTube brand icon in this lucide-react version (checked directly —
  // confirmed absent), so `SquarePlay` (a rounded rect + play triangle) is used as an
  // honest, non-trademark silhouette stand-in, rendered in `iconBadge`'s solid red chip
  // — the same "solid icon" treatment the reference gives YouTube and Text's "T" block.
  // Vimeo keeps a plain (non-badged) `Video` glyph in its own purple `ribbonFg` color,
  // so the two platforms stay visually distinct rather than sharing one badge style.
  // An upload gets its own plain (non-badged) `FileVideo` glyph — distinct from both,
  // since it isn't a platform link at all.
  const Icon = isUpload ? FileVideo : isYoutube ? SquarePlay : Video;
  // ADR-0070: the explicit resized size, read from `data` — see node-chrome.tsx's top
  // comment for why this must not be NodeProps' own `width`/`height` (BUG-012).
  const explicitWidth = typedData.cardWidth;
  const explicitHeight = typedData.cardHeight;
  const fileUrl = isUpload ? `${API_BASE_URL}/api/files/${typedData.storedName}` : "";

  return (
    <NodeChrome
      id={id}
      selected={selected}
      accent={accent}
      header={
        isUpload ? (
          // Same "generic category word up top, filename in the body" convention as
          // file-node.tsx/audio-node.tsx for every upload-sourced card — a video
          // upload has no oEmbed title to show here the way a URL-sourced one does.
          <NodeHeader icon={Icon} label="Video" onDuplicate={() => duplicateSelection([id])} />
        ) : (
          <NodeHeader
            icon={Icon}
            label={urlHeaderLabel}
            onOpen={openOriginal}
            openLabel="Open original"
            onDuplicate={() => duplicateSelection([id])}
            spinning={typedData.status === "loading"}
            iconBadge={isYoutube}
            accent={accent}
          />
        )
      }
      width={explicitWidth}
      height={explicitHeight}
      onDelete={() => deleteNode(id)}
      hideConnections={Boolean(parentId)}
      // ADR-0075: no `onResizeEnd` — resize is text-only. See file-node.tsx's comment on
      // this same change for the full reasoning.
    >
      {isUpload ? (
        <div className="flex flex-col gap-1.5 px-2.5 py-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-text-primary">
            <FileVideo className="size-3.5 shrink-0 text-text-secondary" aria-hidden="true" />
            <span className="truncate">{typedData.fileName}</span>
          </div>
          <a
            href={fileUrl}
            download={typedData.fileName}
            className="nodrag flex w-fit items-center gap-1.5 rounded text-xs text-text-secondary hover:text-text-primary"
            title={`Download ${typedData.fileName}`}
          >
            <span>{formatFileSize(typedData.bytes ?? 0)}</span>
            <Download className="size-3" aria-hidden="true" />
          </a>
        </div>
      ) : (
        <button
          type="button"
          onClick={openOriginal}
          aria-label={`Open "${urlHeaderLabel}" on ${platformLabel}`}
          className={cn(
            "nodrag group/thumb relative block w-full overflow-hidden bg-background-muted",
            // Round 4 / BUG-016: this used to stay a fixed h-32 even on a resized card —
            // the card's own outer box grew (once the chrome-level drift bug was fixed),
            // but the thumbnail itself never did, which read as "resize doesn't touch
            // the thumbnail." `flex-1 min-h-0` makes it the one element in the body
            // that actually absorbs any extra resized height (the notes field below
            // keeps its own fixed collapsed/expanded height either way).
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
              {/* ADR-0093 (Istiyak: "let's do shimmer on thumbnail preview only so it
                  will be much valid experience") — the transcript pipeline (yt-dlp ->
                  ffmpeg -> whisper) can run for many minutes with the thumbnail already
                  fully loaded, so overlaying the shimmer directly on this big, already-
                  visible image reads as a much more obvious "still working" signal than
                  the small skeleton bars tucked under the text below ever could. Kept
                  at partial opacity (not a full opaque cover) so the thumbnail stays
                  recognizable underneath — useful once several cards are extracting at
                  once (ADR-0092's batch-paste scenario) and still need to be tellable
                  apart at a glance. */}
              {typedData.extractionStatus === "pending" ? (
                <span className="shimmer-bar pointer-events-none absolute inset-0 opacity-70" aria-hidden="true" />
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
      )}

      {/* Shared across both sources (F-14/ADR-0086) — the lazy transcript pipeline
          doesn't care whether the video came from a URL or an upload. */}
      <div className="px-2.5 py-1.5">
        {/* ADR-0093 — bars suppressed only for the URL-sourced, has-a-thumbnail case
            above (the shimmer now lives on the thumbnail itself); an upload-sourced
            video (no thumbnail at all, see the `isUpload` branch) still needs its own
            visible progress signal, so it keeps the default bars. */}
        <NodeExtractionStatus
          nodeId={id}
          status={typedData.extractionStatus}
          preview={typedData.extractionPreview}
          showSkeletonBars={isUpload || typedData.status !== "ok"}
        />
      </div>

      <NodeNotesField
        value={typedData.notes}
        onChange={(value) => updateNodeData(id, { ...typedData, notes: value })}
        onCommit={() => flushNodeData(id)}
      />
    </NodeChrome>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unitIndex]}`;
}

export const VideoNode = React.memo(VideoNodeImpl);
