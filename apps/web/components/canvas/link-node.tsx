"use client";

import * as React from "react";
import type { NodeProps } from "@xyflow/react";
import { Link2, Pencil } from "lucide-react";
import { useBoardStore, type LinkNodeData } from "@/stores/board-store";
import { NodeChrome } from "@/components/canvas/node-chrome";
import { NodeHeader } from "@/components/canvas/node-header";
import { NodeNotesField } from "@/components/canvas/node-notes-field";
import { parseVideoUrl } from "@/lib/video-platform";

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
// ADR-0075 (restored — Istiyak: "Link card header editable which we denied also came
// back"): the header's title is plain, non-editable text — the "complexity" an
// inline-editable header title plus a separately-editable URL both invited is exactly
// what this ADR avoids. There's still exactly one editable field (the URL itself),
// surfaced through the compact row below the header — see `showCompactUrlRow`.
function LinkNodeImpl({ id, data, selected, parentId }: NodeProps) {
  const typedData = data as LinkNodeData;
  const updateNodeData = useBoardStore((state) => state.updateNodeData);
  const flushNodeData = useBoardStore((state) => state.flushNodeData);
  const deleteNode = useBoardStore((state) => state.deleteNode);
  const duplicateSelection = useBoardStore((state) => state.duplicateSelection);
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

  // Round 2 (Istiyak: "on link edit i still need to press enter to get back that to
  // preview. On canvas click that still don't go automatically to preview mode"): Enter
  // already worked (it explicitly blurs the input, routing through `handleUrlBlur`
  // above) — only a canvas click didn't. page.tsx's `onPaneClick` already blurs
  // `document.activeElement` on every pane click, which SHOULD fire this same input's
  // native blur — but that only fires if this input is still literally
  // `document.activeElement` at the moment React Flow's own pointer handling finishes
  // with the event, which isn't guaranteed (a canvas/pan library doing its own
  // preventDefault-heavy pointer handling is exactly the kind of thing that can eat a
  // native focus transition before React's synthetic blur ever dispatches). Rather than
  // chase that timing through a library this app doesn't own, this listens for ANY
  // pointerdown outside the URL row directly — a standard "click outside closes it"
  // pattern that doesn't depend on native blur firing at all, so it closes correctly
  // whether the outside click lands on open canvas, a different card, or anywhere else.
  // Capture phase (`true`) so this still sees the event even if something upstream
  // later calls `stopPropagation`. Only attached while actually editing, so there's no
  // listener sitting on `document` the rest of the time.
  const urlRowRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!editingUrl) return;
    const handlePointerDownOutside = (event: PointerEvent) => {
      if (urlRowRef.current && event.target instanceof Node && !urlRowRef.current.contains(event.target)) {
        handleUrlBlur();
      }
    };
    document.addEventListener("pointerdown", handlePointerDownOutside, true);
    return () => document.removeEventListener("pointerdown", handlePointerDownOutside, true);
  }, [editingUrl, handleUrlBlur]);

  let domain = "";
  try {
    domain = typedData.url ? new URL(typedData.url).hostname.replace(/^www\./, "") : "";
  } catch {
    domain = typedData.url;
  }
  const headerLabel = status === "loading" ? "Loading…" : typedData.title || domain || "Link";
  // ADR-0075 (restored — Istiyak: "Link card header editable which we denied also
  // came back"): the header's title is now always plain text, never inline-editable
  // (no `onLabelCommit`), and the 3-dot menu that used to carry a standalone "Edit
  // link" item is gone entirely. That item's only job — reopening this row's own URL
  // input — is folded back into this row directly: it now stays visible (with its own
  // hover-only pencil, below) for every link that has a URL, not only ones that failed
  // to resolve, so editing the URL is still reachable without a menu to put it in.
  const showCompactUrlRow = editingUrl || Boolean(typedData.url);
  // ADR-0070: the explicit resized size, read from `data` — see node-chrome.tsx's top
  // comment for why this must not be NodeProps' own `width`/`height` (BUG-012).
  const explicitWidth = typedData.cardWidth;
  const explicitHeight = typedData.cardHeight;

  return (
    <NodeChrome
      id={id}
      selected={selected}
      // Istiyak (Phase 3 testing): "All documents and link cards looks the same shade."
      // The real fix is ADR-0075's per-filetype document colors (file-node.tsx), which
      // had drifted back to one flat "warning" amber for every document — that flat
      // scheme is what actually made pdf/docx/xlsx cards indistinguishable from each
      // OTHER, not this card's own color. Link stays "neutral" (gray) per ADR-0075's own
      // explicit call: it deliberately shares its shade with an image-type file card
      // (both "neutral"), and ADR-0075 already bumped neutral one step darker
      // (gray.100 → gray.200, semantic.json) for more contrast against the page
      // background — "success" (green) belongs to Excel now that per-filetype color is
      // restored, so reusing it here would just trade one collision for another.
      accent="neutral"
      header={
        <NodeHeader
          icon={Link2}
          label={headerLabel}
          faviconUrl={status === "ok" ? faviconUrl : undefined}
          onOpen={typedData.url ? () => window.open(typedData.url, "_blank", "noopener,noreferrer") : undefined}
          openLabel="Open link"
          onDuplicate={() => duplicateSelection([id])}
          spinning={status === "loading"}
        />
      }
      width={explicitWidth}
      height={explicitHeight}
      onDelete={() => deleteNode(id)}
      hideConnections={Boolean(parentId)}
      // ADR-0075: no `onResizeEnd` — resize is text-only. See file-node.tsx's comment on
      // this same change for the full reasoning.
    >
      {showCompactUrlRow ? (
        <div ref={urlRowRef} className="flex items-center gap-1.5 px-2.5 py-1.5">
          {/* Istiyak (Phase 3 testing): "in start should have a link icon" — a small
              leading glyph so this row reads as a URL at a glance, in both its editable
              and resolved-but-not-yet-"ok" states, rather than looking like a bare line
              of text. */}
          <Link2 className="size-3 shrink-0 text-text-muted" aria-hidden="true" />
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
              // BUG (Phase 3 testing, Istiyak: "after edit if... press enter it stays as
              // input"): there was no key handling at all here — Enter on a bare <input>
              // with no enclosing <form> does nothing by itself, so it never reached
              // `handleUrlBlur`. Explicitly blurring on Enter routes it through the exact
              // same commit path a real blur already uses, rather than duplicating that
              // logic here. Escape reverts to the last-saved URL without committing,
              // matching every other inline-editable field in this app (NodeHeader's
              // label rename, the group frame's rename).
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                } else if (event.key === "Escape") {
                  updateNodeData(id, { ...typedData, url: typedData.metaForUrl || typedData.url });
                  setEditingUrl(false);
                }
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingUrl(true)}
              className="nodrag group/url flex min-w-0 flex-1 items-center gap-1 rounded text-left text-xs text-text-secondary hover:text-text-primary"
              title={typedData.url}
            >
              <span className="truncate">{status === "error" ? typedData.url : domain}</span>
              <Pencil
                className="size-3 shrink-0 opacity-0 transition-opacity group-hover/url:opacity-100"
                aria-hidden="true"
              />
            </button>
          )}
        </div>
      ) : null}

      <NodeNotesField
        value={typedData.notes}
        onChange={(value) => updateNodeData(id, { ...typedData, notes: value })}
        onCommit={() => flushNodeData(id)}
      />
    </NodeChrome>
  );
}

export const LinkNode = React.memo(LinkNodeImpl);
