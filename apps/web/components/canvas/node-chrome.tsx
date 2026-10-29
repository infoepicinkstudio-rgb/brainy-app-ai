import * as React from "react";
import { Handle, NodeResizeControl, Position, useUpdateNodeInternals } from "@xyflow/react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// Shared card chrome for every node type — one place for sizing, the selection ring,
// and hover elevation so text/file/link/video nodes read as one consistent system
// rather than each hand-rolling its own border/shadow treatment.
//
// Node-card-overhaul pass (ADR-0065): width dropped from w-64/256px to w-56/224px and
// corners tightened from rounded-lg/12px to rounded-md/8px — Istiyak's "cards look very
// big" traced mostly to this flat oversized footprint plus an unconstrained `fitView`
// (tuned separately in the board canvas page), not to any one node type's own content.
// `hover:shadow-surface-raised` + a hover border tint are NEW — the previous card had
// zero hover feedback at all ("no mouse hovers reflect... very lazy look and feel"),
// and `shadow-surface` (shadow.sm) alone is close to imperceptible at this card size
// (confirmed against its very low alpha values in primitives.json), so a hover state
// that only deepened the same faint shadow wouldn't have read as "interactive" either —
// it needed a real elevation jump (sm → md) plus a border-color shift, not a bigger
// number in the same token.
//
// Round 2 / ADR-0071: `warning` (document/file) and `accent` (Vimeo) added to the
// palette, and the header moved from "the colored top section of one bordered box" to a
// genuinely separate "ribbon" layer sitting behind/above the white body card (Istiyak
// called this out specifically from a zoomed reference crop — see ADR-0071). `accent`
// here reuses the SAME indigo/purple primitive scale the rest of the app already uses
// for its primary-action color (`background.accent` etc.) — a mild semantic overlap
// (now also "this is a Vimeo card") accepted as a reasonable tradeoff rather than adding
// a dedicated purple scale for one card type in a single-user app.
//
// BUG-016 / ADR-0073 (round 4, Istiyak: "Real chunk here. Design got worse" — the
// ribbon and the white body visibly drifted apart as two independently-sized boxes, the
// resize handle floated fully detached from the card, and resizing only grew the header,
// never the thumbnail/body underneath). Root cause: the ribbon used to be an absolutely
// positioned layer sized via `-inset-x` against an OUTER wrapper that had NO explicit
// width of its own — a plain block element, which per ordinary CSS fills whatever width
// its own parent (React Flow's `.react-flow__node` wrapper) happens to have. The BODY,
// meanwhile, carried its OWN independent `style={{ width, height }}` sourced from
// `data.cardWidth/cardHeight`. Two different elements, two different sources of truth
// for "how wide is this card" — kept in sync only at the END of a resize (`onResizeEnd`
// writes `data.cardWidth/cardHeight`), never DURING one. But `NodeResizeControl` drives
// LIVE visual feedback by calling React Flow's own `triggerNodeChanges` continuously
// while dragging, which updates `node.width/height` on the RF node object directly —
// that's a separate, immediate write path the outer wrapper (plain block, fills its RF
// parent) tracks instantly, while the body's own inline style does not update until
// drop. Mid-drag, the two were structurally guaranteed to disagree; the resize handle
// (anchored to the outer wrapper, which tracks RF's live width) visually floated away
// from the body (still showing its last-saved width) — exactly Istiyak's screenshot.
//
// Fix: collapsed to a SINGLE sized container. The outer `<div>` now carries `w-56` (or
// the explicit resized `style={{ width, height }}`) directly and IS the ribbon itself
// (`bg-ribbon-*` lives on this same element) — there is no second, independently-styled
// ribbon box any more. The header row and the white body are both ordinary in-flow flex
// children of that one container (`flex flex-col`): the header sized to its own content
// (`shrink-0`), the body filling whatever space is left (`flex-1 min-h-0`). Because the
// body's size is now DERIVED from the single shared container (flexbox fill), not an
// independently-tracked pixel value, it is structurally incapable of drifting from the
// ribbon or lagging during a live drag — whatever width/height the container has (set by
// us, or live-updated by React Flow's own resize machinery), the body fills it in the
// same render, every time. The small colored "peek" around the body on every side is now
// just `p-0.5` padding on this one container showing its own background color through —
// not a second box's offset margin to keep in sync with anything.
export type NodeAccent = "neutral" | "info" | "danger" | "success" | "warning" | "accent";

// Round 5 / ADR-0074 (Istiyak: "Color we have set to solid While in reference we have
// light theme"): the header background is now a pale tint (`ribbonBg`, each accent's
// `.100` shade) with a darker same-hue text/icon color (`ribbonFg`, `.700`) for contrast
// — replacing the old solid `.600` fill + white text. `ribbonSolid` (the former fill
// color) is kept separately, now used only for the small filled icon "badge" chip a few
// types get (see node-header.tsx's `iconBadge`), not for the header background itself.
export const RIBBON_BG_CLASSES: Record<NodeAccent, string> = {
  neutral: "bg-ribbon-bg-neutral",
  info: "bg-ribbon-bg-info",
  danger: "bg-ribbon-bg-danger",
  success: "bg-ribbon-bg-success",
  warning: "bg-ribbon-bg-warning",
  accent: "bg-ribbon-bg-accent",
};

export const RIBBON_FG_CLASSES: Record<NodeAccent, string> = {
  neutral: "text-ribbon-fg-neutral",
  info: "text-ribbon-fg-info",
  danger: "text-ribbon-fg-danger",
  success: "text-ribbon-fg-success",
  warning: "text-ribbon-fg-warning",
  accent: "text-ribbon-fg-accent",
};

export const RIBBON_SOLID_CLASSES: Record<NodeAccent, string> = {
  neutral: "bg-ribbon-solid-neutral",
  info: "bg-ribbon-solid-info",
  danger: "bg-ribbon-solid-danger",
  success: "bg-ribbon-solid-success",
  warning: "bg-ribbon-solid-warning",
  accent: "bg-ribbon-solid-accent",
};

// Round 5 follow-up (Istiyak: "Reached to certain stage but still not completely
// adapted" — the dots were barely visible against the canvas, especially the cooler
// accents). This used to be a `Record<NodeAccent, string>` of `border-ribbon-solid-*`
// Tailwind classes; moved to a plain function returning the raw CSS var instead (used as
// an inline `style.borderColor` on each Handle below) rather than risk a brand-new
// `border-*` utility family this codebase had never actually exercised before — bg-*/
// ring-*/text-* against these same tokens are all proven elsewhere in this file, but
// border-* wasn't, and an inline style is the one way to rule out any such Tailwind
// generation gap entirely rather than debug it blind without a way to render the page
// here. Same six token names as every other `RIBBON_*` map in this file, just read as a
// border color instead of a background/text/ring color.
export function ribbonSolidVar(accent: NodeAccent): string {
  return `var(--color-ribbon-solid-${accent})`;
}

// ADR-0075 (round 6, Istiyak: "Hover/select is currently showing brand accent color and
// gray shadows which looks contradict from card style... youtube card will have its own
// hover style, link will have its own hover style"): restored here after drifting back
// to a universal brand-blue ring (Phase 3 testing, Istiyak: "Card style specific
// hover/selected work what we did is gone. Now generic selection/shadow is coming. No
// full card is getting selected."). The ring derives its color from the same
// `ribbon-fg-*` CSS variables the header tint already uses — Tailwind v4 auto-generates
// `ring-*` utilities for any color already registered in the `--color-*` theme
// namespace (globals.css's `@theme inline` block), so this needs no new token group.
// Round 2 (Istiyak: "Selection/hover ring is slightly harsh. make it subtle a bit."):
// selected dropped from a full-strength 2px ring to a 1px ring at 70% opacity; the hover
// ring (shown on an UNselected card) eased further still, to a faint 25%.
export const RIBBON_RING_SELECTED_CLASSES: Record<NodeAccent, string> = {
  neutral: "ring-1 ring-ribbon-fg-neutral/70",
  info: "ring-1 ring-ribbon-fg-info/70",
  danger: "ring-1 ring-ribbon-fg-danger/70",
  success: "ring-1 ring-ribbon-fg-success/70",
  warning: "ring-1 ring-ribbon-fg-warning/70",
  accent: "ring-1 ring-ribbon-fg-accent/70",
};

export const RIBBON_RING_HOVER_CLASSES: Record<NodeAccent, string> = {
  neutral: "hover:ring-1 hover:ring-ribbon-fg-neutral/25",
  info: "hover:ring-1 hover:ring-ribbon-fg-info/25",
  danger: "hover:ring-1 hover:ring-ribbon-fg-danger/25",
  success: "hover:ring-1 hover:ring-ribbon-fg-success/25",
  warning: "hover:ring-1 hover:ring-ribbon-fg-warning/25",
  accent: "hover:ring-1 hover:ring-ribbon-fg-accent/25",
};

// Round 5 (new) — Istiyak, reference screenshot (several cards converging on one chat
// node with color-matched dots + gradient lines): "give all the node connect dots the
// [same] individual card types['] ... youtube card nodes dots should look like that
// cards dot. Same goes with other types." The handle dots below already read `accent`
// straight from THIS card's own `NodeChrome` prop — but canvas-edge.tsx's gradient line
// only ever sees two node IDs (an edge has no view of either node's own JSX), so it
// needs this same "what accent is this node" logic available from OUTSIDE any one node
// file. Mirrors each node type's own accent branch exactly:
// - text/mindmap-node.tsx: fixed "info"
// - chat/audio-node.tsx: fixed "accent"
// - video-node.tsx: upload or non-YouTube (Vimeo) → "accent", YouTube → "danger"
// - file-node.tsx: per fileKind (FILE_KIND_ACCENT there) — duplicated below rather than
//   imported, since file-node.tsx itself imports FROM this file; importing back from it
//   would invert that dependency. Keep the two maps in sync by hand if file-node.tsx's
//   own FILE_KIND_ACCENT ever changes.
// - link-node.tsx / group frame: fixed "neutral"
const FILE_KIND_ACCENT_FOR_EDGES: Record<string, NodeAccent> = {
  pdf: "danger",
  docx: "info",
  xlsx: "success",
  image: "neutral",
  other: "warning",
};

export function getNodeAccent(node: { type?: string; data?: unknown } | null | undefined): NodeAccent {
  if (!node) return "neutral";
  const data = (node.data ?? {}) as Record<string, unknown>;
  switch (node.type) {
    case "text":
    case "mindmap":
      return "info";
    case "chat":
    case "audio":
      return "accent";
    case "video": {
      const isUpload = data.source === "upload";
      const isYoutube = data.platform !== "vimeo";
      return !isUpload && isYoutube ? "danger" : "accent";
    }
    case "file": {
      const fileKind = (data.fileKind as string | undefined) ?? (data.isImage ? "image" : "other");
      return FILE_KIND_ACCENT_FOR_EDGES[fileKind] ?? "warning";
    }
    default:
      // Covers "link", the group frame type (RF_GROUP_TYPE — importing the literal
      // string here would pull board-store.ts into this file's dependency graph for one
      // constant; "groupFrame" falls through to the same "neutral" default it already
      // resolves to), and any future node type that hasn't set its own case yet.
      return "neutral";
  }
}

// Round 2 (ADR-0070): resizable cards. No new DB column — the resized size is mirrored
// into the node's existing `data` JSON blob (`cardWidth`/`cardHeight`, board-store.ts).
// `width`/`height` here are explicitly NOT React Flow's own `NodeProps.width/height` —
// those reflect MEASURED size (a transient near-zero value before the first
// ResizeObserver tick), and using them directly self-collapsed every fresh card to ~2px
// (bugs.md BUG-012, caught live). Each node-type file instead reads `data.cardWidth`/
// `cardHeight` itself (the only authoritative "has this been resized" signal) and passes
// THAT down as `width`/`height`, genuinely undefined until the user first resizes. A
// SINGLE bottom-right `NodeResizeControl` handle is used (not the full 8-handle
// `NodeResizer`) — deliberately: the brief asked for "dragging the bottom-right corner"
// specifically, a bottom-right-only drag never moves the node's `x`/`y` (unlike a
// top/left handle), which keeps the undo entry and the persisted shape simple
// (width/height only, no position coupling), and it can't collide with the hover-only
// delete "X" (now top-right) or the header's 3-dot menu.
//
// BUG-015 (round 3, Istiyak: "Resize is not working"): the mechanism itself was never
// broken (confirmed live — drag/reload/undo all worked when the handle was grabbed
// precisely), but React Flow's own base CSS gives `.react-flow__resize-control.handle`
// `translate: -50% -50%`, centering the handle exactly ON the corner point — so HALF of
// even our enlarged 10px box sat outside the card's visible edge, in empty canvas space
// that's indistinguishable from "nothing here." A real mouse aiming at the card's own
// visible corner would land mostly on the card body itself (triggering a node-DRAG
// instead) rather than the handle. Fixed by sizing the handle up further (10px → 14px)
// so more of its always-centered hit area actually overlaps the visible card edge.
const MIN_CARD_WIDTH = 180;
const MIN_CARD_HEIGHT = 90;

export const NodeChrome = React.memo(function NodeChrome({
  id,
  selected,
  accent = "neutral",
  header,
  children,
  className,
  width,
  height,
  onDelete,
  onResizeEnd,
  hideConnections,
}: {
  /** The React Flow node id — needed ONLY to tell React Flow to recompute this node's
   * connection points when `hideConnections` flips (see that prop's own doc comment for
   * why this is required, not cosmetic). */
  id: string;
  selected?: boolean;
  accent?: NodeAccent;
  /** The header row (icon + label + hover-only action icons, no menu — ADR-0075) —
   * rendered inside the colored ribbon layer, not inside the white body card
   * (ADR-0071). */
  header: React.ReactNode;
  /** Body content only — no header here, NodeChrome owns rendering that. */
  children: React.ReactNode;
  className?: string;
  /** The EXPLICIT resized size (ADR-0070) — undefined until the user first drags the
   * resize handle. See this file's top comment for why this must NOT be NodeProps'
   * own `width`/`height`. */
  width?: number;
  height?: number;
  /** Round 2 follow-up (Istiyak): a second, hover-only delete affordance alongside the
   * Delete key — an "X" hidden by default so it can never be clicked by accident,
   * revealed only while the card is hovered/focused. Floats on the OUTER
   * (non-clipping) wrapper, not the inner `overflow-hidden` card itself, so it isn't
   * clipped sitting half outside the card's own corner. Round 3 (Istiyak: "can be
   * outside the header top right corner on hover" — top-left-inside-the-header read
   * as squeezed into the bar itself) moved to float OUTSIDE the card's top-RIGHT
   * corner instead, overlapping the ribbon's outer edge rather than sitting inside it.
   * Round 4 (Istiyak: "still clash[es]" with the header's own hover icons, back when a
   * 3-dot menu lived there) pushed further out again, `-top-2/-right-2` →
   * `-top-4/-right-4`, for real clearance between the two hit areas (confirmed live:
   * ~6px horizontal / ~4px vertical gap between the two hit boxes, not touching).
   * ADR-0075 later deleted that menu outright, but the clearance is kept — the
   * header's remaining hover icons (Duplicate/Open) sit well clear of this corner. */
  onDelete?: () => void;
  /** Fires once, on resize-end (ADR-0070) — not per drag tick. */
  onResizeEnd?: (size: { width: number; height: number }) => void;
  /** Phase 3 grouping follow-up (Istiyak: "Once Node Card covered under grouped then
   * they should not have a node connectors. Only group will have node connector to
   * pass the context of entire group content node cards"): pass `true` once this card
   * has a `parentId` (i.e. it's a member of a group) to hide its own target/source
   * handles. The group frame (group-node.tsx) always renders its own pair instead — a
   * connection to/from the group is meant to carry the whole group's content, not one
   * member's, so a member card having its own handles alongside the group's would be
   * ambiguous about which one a dragged edge is even for. */
  hideConnections?: boolean;
}) {
  const hasExplicitSize = width !== undefined && height !== undefined;
  // BUG (Istiyak: "Once group ungrouped then child nodes lost it functionality to
  // connect nodes with other node card"): this card's two connection handles are
  // CONDITIONALLY rendered below — mounted only when `!hideConnections`, unmounted
  // entirely while it's a group member. React Flow keeps its own internal cache of
  // each node's measured handle positions ("node internals"), built the first time a
  // node renders; it does NOT automatically notice a node's handle SET changing later
  // (handles added or removed, as opposed to a handle just moving) — that cache has to
  // be told explicitly via `useUpdateNodeInternals`, a documented React Flow
  // requirement for exactly this "conditionally-rendered handles" pattern. Without this,
  // ungrouping correctly re-adds the handles to the DOM (visually present, even
  // clickable-looking) but React Flow's own drag-to-connect hit-testing and edge
  // rendering keep using the STALE "this node has zero handles" entry from while it was
  // grouped — so a new connection attempt silently fails. Firing on every
  // `hideConnections` change covers both directions (ungrouping AND grouping a node
  // that already had a live connection).
  const updateNodeInternals = useUpdateNodeInternals();
  React.useEffect(() => {
    updateNodeInternals(id);
  }, [id, hideConnections, updateNodeInternals]);
  return (
    // THE single sized unit. No explicit width/height here = the default `w-56`, height
    // auto (grows to content). An explicit resize sets BOTH dimensions here directly —
    // there is nowhere else in this tree that ever gets its own independent size.
    <div
      className={cn(
        "group relative flex w-56 flex-col overflow-visible rounded-lg p-0.5",
        "transition-all duration-fast ease-standard",
        RIBBON_BG_CLASSES[accent],
        // ADR-0075: the ring lives on this OUTER container (ribbon + body together) so
        // hovering/selecting highlights the whole card as one unit, not just the body —
        // "whole node card should look like selected" (Istiyak). Selected wins over the
        // hover ring rather than stacking with it.
        selected ? RIBBON_RING_SELECTED_CLASSES[accent] : RIBBON_RING_HOVER_CLASSES[accent]
      )}
      style={hasExplicitSize ? { width, height } : undefined}
    >
      {/* Connection handles (Phase 3, TF-06) — "Colored connector/handle dot from the
          reference deliberately deferred" (ADR-0071) until drag-to-connect actually
          existed; it does now. One target (left) + one source (right) per card, the
          same left-to-right convention React Flow's own examples use, colored from the
          card's own accent so a board with several node types still reads which handle
          belongs to which card once two are close together.
          Round 5, 4th follow-up (Istiyak: "Chevron is unnecessary. Node dots can be
          smaller and outside the card"): the bracket decoration from the last two
          rounds is gone outright (not hidden behind a flag — removed, along with the
          now-unused `useNodeConnections` check that gated it). The `!z-20` fix (dot
          painting above ordinary card content instead of being covered by it) and the
          inline `style.borderColor` fix (bulletproof regardless of Tailwind's `border-*`
          generation) both stay — those solved real visibility bugs, confirmed working in
          the screenshot that prompted this round. Only the SIZE moved again: 18px → 13px
          and the ring 3px → 2px (a thinner ring reads right at this smaller scale; 3px
          at 13px would leave almost no visible "hole"). Offset bumped slightly past the
          prior 65/35 split to 70/30 (-0.7 × 13px ≈ -9px) so it reads clearly outside the
          edge even at the smaller size, not just smaller AND more ambiguous about being
          on-or-off the card. Hidden entirely once this card has a parent
          (`hideConnections`) — see that prop's own doc comment above. */}
      {!hideConnections ? (
        <>
          <Handle
            type="target"
            position={Position.Left}
            style={{ transform: "translate(-70%, -50%)", borderColor: ribbonSolidVar(accent) }}
            className="!z-20 !size-[13px] !border-2 !bg-background-surface !shadow-surface-raised"
          />
          <Handle
            type="source"
            position={Position.Right}
            style={{ transform: "translate(70%, -50%)", borderColor: ribbonSolidVar(accent) }}
            className="!z-20 !size-[13px] !border-2 !bg-background-surface !shadow-surface-raised"
          />
        </>
      ) : null}
      {/* Header row — an ordinary in-flow flex child sized to its own content
          (`shrink-0`), sitting directly on the container's own colored background.
          Never absolutely positioned, never sized separately from the body below it.
          Text/icon color comes from `ribbonFg` (a darker same-hue tone) — readable
          against the new pale `ribbonBg` background, replacing the old white-on-solid. */}
      <div className={cn("flex shrink-0 items-center gap-1.5 px-2 pb-1.5 pt-1", RIBBON_FG_CLASSES[accent])}>
        {header}
      </div>
      {/* Body — the OTHER in-flow flex child of the same container, filling whatever
          space is left (`flex-1 min-h-0`) rather than carrying its own width/height.
          This is the fix for BUG-016: the body's size is DERIVED from the shared
          container on every render (live drag included), so it cannot lag behind or
          disagree with it the way a separately-styled sibling box could.
          Round 5 (Istiyak: corner radius "looks clipped from the edges"): this used to
          be `rounded-md` (8px) nested inside the outer's `rounded-lg` (12px) minus its
          2px padding — the mathematically correct nested radius there is 10px, so an
          8px inner corner was slightly TIGHTER than the outer curve actually allows,
          leaving a small uneven notch of the background color visible right at the
          corner. Matching the outer's own `rounded-lg` here removes that mismatch. */}
      <div
        className={cn(
          // Round 7 (Istiyak: "inner body area is having a gray border which don't suits
          // well"): ADR-0075 had dropped this body's own selected/hover COLOR but still
          // left it a permanent neutral `border-border-default` at all times — visible as
          // a flat gray line hugging the body's edge on every card, selected or not,
          // which is exactly what read as "doesn't suit well." The outer container above
          // already draws the card's one true edge (its own ring, colored on
          // selected/hover, and the pale ribbon's own background peeking through the
          // `p-0.5` gap the rest of the time) — this body never needed a second, always-on
          // border of its own; `shadow-surface` alone is enough to lift it off the ribbon
          // behind it.
          "relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg bg-background-surface shadow-surface",
          "transition-shadow duration-fast ease-standard",
          "hover:shadow-surface-raised",
          hasExplicitSize && "scrollbar-thin overflow-y-auto",
          className
        )}
      >
        {children}
      </div>
      {selected && onResizeEnd ? (
        <NodeResizeControl
          position="bottom-right"
          minWidth={MIN_CARD_WIDTH}
          minHeight={MIN_CARD_HEIGHT}
          onResizeEnd={(_event, params) => onResizeEnd({ width: params.width, height: params.height })}
          className="!size-3.5 !rounded-sm !border-2 !border-border-focus !bg-background-surface !shadow-surface-raised"
        />
      ) : null}
      {onDelete ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          aria-label="Delete"
          title="Delete"
          className={cn(
            "nodrag absolute -top-4 -right-4 z-10 flex size-5 items-center justify-center rounded-full",
            // ADR-0075 (restored): this used to carry a `border` + `shadow-surface-raised`
            // and turn red (`text-text-danger`) on hover — a "loud" treatment that read as
            // its own competing accent against each card's own ribbon color. Flattened to a
            // quiet, borderless, shadowless neutral chip that only deepens from secondary
            // to primary text color on hover — still clearly a button, never a second
            // "accent" fighting the card's own.
            "bg-background-surface text-text-secondary",
            "opacity-0 transition-opacity duration-fast hover:text-text-primary",
            "group-hover:opacity-100 group-focus-within:opacity-100"
          )}
        >
          <X className="size-3" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
});
