"use client";

import * as React from "react";
import type { NodeProps } from "@xyflow/react";
import { Globe, Pencil } from "lucide-react";
import { useBoardStore, type LinkNodeData } from "@/stores/board-store";
import { NodeChrome } from "@/components/canvas/node-chrome";
import { NodeHeader } from "@/components/canvas/node-header";
import { NodeNotesField } from "@/components/canvas/node-notes-field";
import { parseVideoUrl } from "@/lib/video-platform";
import { cn } from "@/lib/utils";

// TF-13 — generic link/reference node (F-27). Still does no scraping of a page's actual
// article/body content — that stays squarely out of scope (ADR-0053) — but round 2 of
// the node-card-overhaul pass (Istiyak: "why do we need Title input and link input and
// all... see how crisp cards are made") refined that scope to explicitly ALLOW a
// cosmetic title + favicon lookup (ADR-0067), replacing what used to be two permanently
// empty bordered <input> boxes with a header that looks like a real link preview the
// moment a URL resolves — matching the Poppy reference screenshots' compact chip style —
// while still falling back to the raw URL as plain text (never a blank/broken layout)
// when the lightweight fetch fails.
//
// Type-adaptive card (ADR-0065/ADR-0069): once the URL field resolves to a recognizable
// YouTube/Vimeo link, this node converts itself in place to a `video` node
// (board-store.ts's `convertLinkNodeToVideo`) — checked on blur, same moment the
// field's edit commits.
//
// Round 6 / ADR-0075 (Istiyak, with a concrete reference screenshot of Poppy's own blue
// link card — globe icon, external-link icon, no 3-dot menu, a full-width preview image
// below the header): three changes from round 2's version —
// (1) the header's inline title edit is GONE (Istiyak: "link card header should not be
//     editable avoid the complexity") — the header now only ever shows the resolved
//     title (or the URL/"Link" fallback) as plain text, never a click-to-edit field;
// (2) the raw URL now lives in its OWN row below the header, ALWAYS visible as small
//     secondary gray text with its own pencil edit icon beside it (previously this row
//     only showed up before a title had resolved or while editing — Istiyak wants it
//     visible at all times, "can showcase link below in small gray secondary text with
//     edit pencil link");
// (3) when the metadata fetch found an Open Graph/Twitter-Card image, it renders as a
//     full-width preview image above the URL row, at the same visual weight/aspect
//     treatment as the video card's own thumbnail — falling back to the plain favicon-
//     only header treatment when no such image exists, never an empty image box.
function LinkNodeImpl({ id, data, selected }: NodeProps) {
  const typedData = data as LinkNodeData;
  const updateNodeData = useBoardStore((state) => state.updateNodeData);
  const flushNodeData = useBoardStore((state) => state.flushNodeData);
  const deleteNode = useBoardStore((state) => state.deleteNode);
  const convertLinkNodeToVideo = useBoardStore((state) => state.convertLinkNodeToVideo);
  const refreshLinkPreview = useBoardStore((state) => state.refreshLinkPreview);

  // Legacy-data-safe reads — nodes created before ADR-0067 have a URL/title/notes but
  // none of these newer fields, so every read here has a sensible fallback rather than
  // assuming they exist.
  const status = typedData.status ?? "idle";
  const metaForUrl = typedData.metaForUrl ?? "";
  const faviconUrl = typedData.faviconUrl ?? "";

  const [editingUrl, setEditingUrl] = React.useState(!typedData.url);
  // Runs once per card mount: a node that already has a committed URL but no fetched
  // metadata yet (a brand-new paste-created node, or an EXISTING link card from before
  // this round that only ever had {url, title, notes}) gets its title/favicon fetched
  // automatically — Istiyak's two already-existing link cards upgrade to the crisp
  // header on next load with no action needed from him. Gated on a ref so typing in the
  // URL field (which also changes `typedData.url`) doesn't re-trigger this on every
  // keystroke — that path is handled explicitly by handleUrlBlur instead.
  //
  // BUG-014 fix (round 3, Istiyak: "Card nodes not coming out as expected"): a `link`
  // node whose URL already resolves to a YouTube/Vimeo link used to be silently SKIPPED
  // here entirely (the old condition excluded any video URL on the assumption blur would
  // handle it) — but a node loaded from the server on mount never fires a blur event, so
  // any already-saved `link`-type row with a video URL (created before this conversion
  // path existed, or left mid-edit in an earlier session) stayed frozen forever: no
  // title, no favicon, no conversion, just the raw-URL fallback card. Now mount
  // explicitly checks for a recognized video URL FIRST and converts in place, the same
  // call `handleUrlBlur` makes — a stale node self-heals into a real video card the next
  // time its board is opened, no manual re-edit needed.
  const autoFetchedRef = React.useRef(false);
  React.useEffect(() => {
    if (autoFetchedRef.current) return;
    autoFetchedRef.current = true;
    if (!typedData.url) return;
    if (parseVideoUrl(typedData.url)) {
      convertLinkNodeToVideo(id, typedData.url);
      return;
    }
    if (metaForUrl !== typedData.url && status === "idle") {
      refreshLinkPreview(id, typedData.url);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUrlBlur = React.useCallback(() => {
    flushNodeData(id);
    if (!typedData.url) {
      setEditingUrl(true); // nothing to show as a compact chip yet — keep the field open
      return;
    }
    setEditingUrl(false);
    if (parseVideoUrl(typedData.url)) {
      convertLinkNodeToVideo(id, typedData.url);
      return;
    }
    if ((typedData.metaForUrl ?? "") !== typedData.url) {
      refreshLinkPreview(id, typedData.url);
    }
  }, [id, typedData.url, typedData.metaForUrl, flushNodeData, convertLinkNodeToVideo, refreshLinkPreview]);

  let domain = "";
  try {
    domain = typedData.url ? new URL(typedData.url).hostname.replace(/^www\./, "") : "";
  } catch {
    domain = typedData.url;
  }
  const headerLabel = status === "loading" ? "Loading…" : typedData.title || domain || "Link";
  // Round 6: the URL row is now ALWAYS shown (previously hidden once a title resolved).
  // ADR-0070: the explicit resized size, read from `data` — see node-chrome.tsx's top
  // comment for why this must not be NodeProps' own `width`/`height` (BUG-012). Round 6
  // (Istiyak: "none of the node cards needed resize" apart from text) — this is still
  // read for backward compat with a card resized before this round, but `onResizeEnd`
  // is no longer passed to `NodeChrome` below, so no new resize can happen.
  const explicitWidth = typedData.cardWidth;
  const explicitHeight = typedData.cardHeight;
  // Round 6: a full-width preview image (an Open Graph/Twitter-Card image from the same
  // metadata fetch) when one exists, falling back to the compact favicon-only treatment
  // otherwise — see board-store.ts's `previewImageUrl` field and the file-top comment.
  const [previewImageFailed, setPreviewImageFailed] = React.useState<string | undefined>(undefined);
  const showPreviewImage =
    status === "ok" && Boolean(typedData.previewImageUrl) && typedData.previewImageUrl !== previewImageFailed;

  return (
    <NodeChrome
      selected={selected}
      accent="neutral"
      header={
        // Round 6 (Istiyak: "link card header should not be editable avoid the
        // complexity"): no `onLabelCommit` any more — this is plain text now, never a
        // click-to-edit field. `Globe` (matching the reference screenshot's own generic-
        // link icon) is the fallback the moment no favicon has resolved yet/failed.
        <NodeHeader
          icon={Globe}
          label={headerLabel}
          faviconUrl={status === "ok" ? faviconUrl : undefined}
          onOpen={typedData.url ? () => window.open(typedData.url, "_blank", "noopener,noreferrer") : undefined}
          openLabel="Open link"
          spinning={status === "loading"}
        />
      }
      width={explicitWidth}
      height={explicitHeight}
      onDelete={() => deleteNode(id)}
    >
      {showPreviewImage ? (
        <button
          type="button"
          onClick={() => window.open(typedData.url, "_blank", "noopener,noreferrer")}
          aria-label={`Open "${headerLabel}"`}
          className={cn(
            "nodrag relative block h-32 w-full shrink-0 overflow-hidden bg-background-muted",
            "transition-transform duration-fast ease-standard"
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- an external OG/
              Twitter-Card image URL from the lightweight metadata fetch, not a local/
              optimizable asset. */}
          <img
            src={typedData.previewImageUrl}
            alt=""
            className="h-full w-full object-cover"
            onError={() => setPreviewImageFailed(typedData.previewImageUrl)}
          />
        </button>
      ) : null}

      {/* Round 6: always visible (not conditional on status any more) — the raw URL as
          small secondary gray text, with its own pencil icon to switch into editing.
          The header above never becomes an input any more; this row is the ONLY way to
          edit a link card's URL now. */}
      <div className="flex items-center gap-1 px-2.5 py-1.5">
        {editingUrl ? (
          <input
            autoFocus={!typedData.url}
            className="nodrag w-full rounded border border-border-default bg-background-page px-2 py-1 text-xs text-text-primary placeholder:text-text-muted focus-visible:border-border-focus focus-visible:outline-none"
            placeholder="https://…"
            value={typedData.url}
            onChange={(event) => {
              const next = event.target.value;
              updateNodeData(id, { ...typedData, url: next });
              // Convert the instant a recognizable video URL is typed or pasted in,
              // rather than waiting for blur — a card pasted-and-left-focused (no blur
              // event fires) used to sit stuck showing the raw editable input forever
              // (BUG-014). `handleUrlBlur` below still covers the non-video/blur path.
              if (parseVideoUrl(next)) {
                flushNodeData(id);
                setEditingUrl(false);
                convertLinkNodeToVideo(id, next);
              }
            }}
            onBlur={handleUrlBlur}
          />
        ) : (
          <>
            <span className="min-w-0 flex-1 truncate text-xs text-text-secondary" title={typedData.url}>
              {typedData.url || "Add a URL…"}
            </span>
            <button
              type="button"
              onClick={() => setEditingUrl(true)}
              aria-label="Edit link"
              title="Edit link"
              className="nodrag shrink-0 rounded p-0.5 text-text-muted transition-colors duration-fast hover:text-text-secondary"
            >
              <Pencil className="size-3" aria-hidden="true" />
            </button>
          </>
        )}
      </div>

      <NodeNotesField
        value={typedData.notes}
        onChange={(value) => updateNodeData(id, { ...typedData, notes: value })}
        onCommit={() => flushNodeData(id)}
      />
    </NodeChrome>
  );
}

export const LinkNode = React.memo(LinkNodeImpl);
