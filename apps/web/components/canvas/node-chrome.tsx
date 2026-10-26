import * as React from "react";
import { NodeResizeControl } from "@xyflow/react";
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

// Round 6 / ADR-0075 (Istiyak: "Hover/select is currently showing brand accent color and
// gray shadows which looks contradict from card style... apply slightly contrast shade
// outside the card from card type style only. i.e. youtube card will have its own hover
// style, link will have its own hover style"): hover/selected used to be one universal
// blue ring (`border-border-focus`/`shadow-accent-focus`) regardless of the card's own
// accent — replaced with a ring derived from the SAME `ribbonFg` color each card's header
// already uses, so a YouTube card's selection ring reads red, a link card's reads
// whichever accent it's on, etc. Tailwind v4 auto-generates `ring-*`/`border-*` utilities
// for any color registered in the `--color-*` theme namespace (globals.css's `@theme
// inline` block already registers `ribbon-fg-*`), so this needs no new token group of its
// own — same mechanism as the header tint, a different application point, exactly as
// asked. Applied to the OUTER container (not just the body) so the whole card — ribbon
// peek and body both — reads as one selected unit (ADR-0073's "one container" principle,
// now extended to the multi-select visual state too, not just sizing).
export const RIBBON_RING_SELECTED_CLASSES: Record<NodeAccent, string> = {
  neutral: "ring-ribbon-fg-neutral/50",
  info: "ring-ribbon-fg-info/50",
  danger: "ring-ribbon-fg-danger/50",
  success: "ring-ribbon-fg-success/50",
  warning: "ring-ribbon-fg-warning/50",
  accent: "ring-ribbon-fg-accent/50",
};

export const RIBBON_RING_HOVER_CLASSES: Record<NodeAccent, string> = {
  neutral: "hover:ring-ribbon-fg-neutral/30",
  info: "hover:ring-ribbon-fg-info/30",
  danger: "hover:ring-ribbon-fg-danger/30",
  success: "hover:ring-ribbon-fg-success/30",
  warning: "hover:ring-ribbon-fg-warning/30",
  accent: "hover:ring-ribbon-fg-accent/30",
};

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
  selected,
  accent = "neutral",
  header,
  children,
  className,
  width,
  height,
  onDelete,
  onResizeEnd,
}: {
  selected?: boolean;
  accent?: NodeAccent;
  /** The header row (icon + label + hover open-icon — round 6/ADR-0075 removed the
   * 3-dot menu entirely) — rendered inside the colored ribbon layer, not inside the
   * white body card (ADR-0071). */
  header: React.ReactNode;
  /** Body content only — no header here, NodeChrome owns rendering that. */
  children: React.ReactNode;
  className?: string;
  /** The EXPLICIT resized size (ADR-0070) — undefined until the user first drags the
   * resize handle. See this file's top comment for why this must NOT be NodeProps'
   * own `width`/`height`. */
  width?: number;
  height?: number;
  /** Round 2 follow-up (Istiyak): a hover-only delete affordance — an "X" hidden by
   * default so it can never be clicked by accident, revealed only while the card is
   * hovered/focused. Floats on the OUTER (non-clipping) wrapper, not the inner
   * `overflow-hidden` card itself, so it isn't clipped sitting half outside the
   * card's own corner. Round 3/4 pushed it further outside the top-right corner for
   * clearance from what was then the header's 3-dot menu. Round 6 (ADR-0075) removed
   * that menu entirely — this "X" (plus the header's own hover open-icon) is now the
   * card's ONLY set of hover affordances, alongside the Delete key, so its own styling
   * was also toned down (no border/shadow, no red-on-hover) to read as quiet/minimal
   * rather than a loud alert control, per Istiyak's explicit "styling can be
   * minimalize... border, shadow, red color on X on hover all this can be minimize." */
  onDelete?: () => void;
  /** Fires once, on resize-end (ADR-0070) — not per drag tick. Round 6 (Istiyak:
   * "Apart from text none of the node cards needed resize... remove the resize
   * functionality from all card apart from text"): only `text-node.tsx` still passes
   * this now; file/link/video no longer do, so the resize handle below (gated on
   * `selected && onResizeEnd`) simply never renders for those types — no separate
   * "is this type resizable" flag needed, omitting the prop IS the off-switch. A card
   * resized in an earlier round still renders at its saved `cardWidth`/`cardHeight`
   * (via `width`/`height` below) — existing sizes aren't reset, only further resizing
   * is disabled. */
  onResizeEnd?: (size: { width: number; height: number }) => void;
}) {
  const hasExplicitSize = width !== undefined && height !== undefined;
  return (
    // THE single sized unit. No explicit width/height here = the default `w-56`, height
    // auto (grows to content). An explicit resize sets BOTH dimensions here directly —
    // there is nowhere else in this tree that ever gets its own independent size.
    <div
      className={cn(
        "group relative flex w-56 flex-col overflow-visible rounded-lg p-0.5 ring-2 ring-transparent",
        "transition-all duration-fast ease-standard",
        RIBBON_BG_CLASSES[accent],
        // Round 6 / ADR-0075: the selected/hover ring lives HERE, on the single outer
        // container that already wraps both the ribbon header and the white body — so
        // selecting/hovering a card highlights it as one visual unit (header peek
        // included), not just the body underneath, and its color derives from the
        // card's OWN accent rather than one universal brand-blue ring.
        selected ? RIBBON_RING_SELECTED_CLASSES[accent] : RIBBON_RING_HOVER_CLASSES[accent]
      )}
      style={hasExplicitSize ? { width, height } : undefined}
    >
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
          "relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border-default bg-background-surface shadow-surface",
          // Round 6 / ADR-0075: this used to carry its OWN selected/hover border+shadow
          // color (generic brand-blue) on top of the outer container's. Now the outer
          // container owns the one colored selection/hover ring (see above) and this
          // inner body just gets a plain neutral border plus a mild elevation bump on
          // hover — no second, differently-colored highlight competing with the first.
          "transition-all duration-fast ease-standard hover:shadow-surface-raised",
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
            "bg-background-surface/90 text-text-muted",
            "opacity-0 transition-opacity duration-fast hover:text-text-secondary",
            "group-hover:opacity-100 group-focus-within:opacity-100"
          )}
        >
          <X className="size-3" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
});
