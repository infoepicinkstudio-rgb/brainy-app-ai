"use client";

import * as React from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Copy, Folder, Ungroup, X } from "lucide-react";
import { useBoardStore, type GroupNodeData } from "@/stores/board-store";
import {
  RIBBON_SOLID_CLASSES,
  RIBBON_RING_SELECTED_CLASSES,
  RIBBON_RING_HOVER_CLASSES,
} from "@/components/canvas/node-chrome";
import { cn } from "@/lib/utils";

// Grouping (Phase 3). "neutral" is shared with link/image cards (node-chrome.tsx already
// tolerates a few types sharing one accent) — a group is organizational/structural
// rather than one specific content kind, so it doesn't claim one of the five content
// colors; its FOLDER icon and full-width header bar already make it unmistakable at a
// glance regardless of hue.
const GROUP_ACCENT = "neutral" as const;

// Round 2 (Istiyak, with a Poppy reference screenshot: "Group node design Should be
// same like node cards only"): rebuilt to use the exact same chrome language as every
// content card (node-chrome.tsx) — a full-width colored ribbon header spanning the top
// edge, a bordered body below it, the same per-type selection/hover ring, the same
// hover-only delete "X" — replacing the earlier dashed-border frame with a name tag
// floating outside its own top edge. Still NOT built on NodeChrome itself: that
// component's body is OPAQUE and `overflow-hidden`, right for a content card's own
// content, wrong for a group, whose "body" is just the open area its member nodes
// visually sit over — React Flow renders members as independently positioned siblings,
// not literal DOM children of this component, so `overflow-hidden` here would risk
// visually clipping a member that pokes past the group's own edge instead of leaving
// that silently-wrong state visible.
//
// No resize handle here, unlike every content-card type: this node's size is a DERIVED
// fact — the bounding box of whatever was inside it at group-time (computed in
// page.tsx's Ctrl+G handler) — not something meant to be dragged independently of its
// members. Shrinking it by hand would fight every child's `extent: "parent"` clamp in
// confusing ways, so Phase 3 doesn't offer that control.
function GroupNodeImpl({ id, data, selected }: NodeProps) {
  const typedData = data as GroupNodeData;
  const updateNodeData = useBoardStore((state) => state.updateNodeData);
  const flushNodeData = useBoardStore((state) => state.flushNodeData);
  const deleteNode = useBoardStore((state) => state.deleteNode);
  const ungroupNode = useBoardStore((state) => state.ungroupNode);
  const duplicateSelection = useBoardStore((state) => state.duplicateSelection);

  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(typedData.label);

  const startEditing = React.useCallback(() => {
    setDraft(typedData.label); // seed with the CURRENT label at the moment editing starts
    setEditing(true);
  }, [typedData.label]);

  const commit = React.useCallback(() => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== typedData.label) {
      updateNodeData(id, { ...typedData, label: trimmed });
      flushNodeData(id); // same immediate-save-on-blur as every other card's text edits
    } else {
      setDraft(typedData.label);
    }
  }, [draft, flushNodeData, id, typedData, updateNodeData]);

  return (
    <div
      className={cn(
        // Round 8 (Istiyak, with a tight crop: "radius of the body. not main card.
        // Preview area is hard corners. need softer corner with radius like other
        // cards"): traced to the actual DOM shape, not a missing class. In every
        // content card (node-chrome.tsx), the header and the white body are SIBLINGS —
        // the header sits directly on the OUTER ribbon-colored wrapper's own
        // background, un-boxed, and the body is its OWN separate `rounded-lg
        // overflow-hidden` box underneath it. That body is independently rounded on
        // ALL FOUR corners because nothing else shares its container. Round 4-7 instead
        // nested header+body as two flex children INSIDE one shared rounded+clipped
        // wrapper — the body's own top corners were never part of that shared shape's
        // rounded exterior (only the whole block's outermost top/bottom were), so they
        // stayed genuinely square no matter how the header was styled. Fixed by
        // dropping that shared wrapper: the OUTER div itself now carries the solid dark
        // fill directly (the header renders straight onto it, exactly like a content
        // card's header renders straight onto its pale ribbon tint — no box of its
        // own), and the body below is its own fully independent `rounded-lg
        // overflow-hidden` card, genuinely rounded on every corner, the same as a
        // content card's white body/thumbnail.
        "group relative flex h-full w-full flex-col overflow-visible rounded-lg p-0.5",
        "transition-all duration-fast ease-standard",
        RIBBON_SOLID_CLASSES[GROUP_ACCENT],
        selected ? RIBBON_RING_SELECTED_CLASSES[GROUP_ACCENT] : RIBBON_RING_HOVER_CLASSES[GROUP_ACCENT]
      )}
    >
      {/* Connection handles (Istiyak: "Group node Should have connecting nodes too...
          Only group will have node connector to pass the context of entire group
          content node cards"): the group gets its own target/source pair, same
          left/right convention and styling as every content card's — a connection
          to/from the group is meant to carry the whole group's content, not one
          member's, so its members no longer render their own (node-chrome.tsx hides a
          card's handles whenever it has a `parentId` — see its `hideConnections` prop).
          Explicit `z-20` (Istiyak: "Still group is not able connect to other nodes") —
          React Flow centers a Left/Right handle exactly ON the node's own edge
          (`translate(-50%, -50%)`, same geometry as the resize-handle's BUG-015), so
          roughly half its hit-area sits INSIDE the node, where the card below (next)
          would otherwise paint on top of it as a later DOM sibling at the default
          stacking order and win the pointer events a drag needs to even start. */}
      <Handle
        type="target"
        position={Position.Left}
        className={cn(
          "!z-20 !size-3 !border-2 !border-background-surface opacity-50 transition-opacity duration-fast",
          "group-hover:opacity-100",
          RIBBON_SOLID_CLASSES[GROUP_ACCENT]
        )}
      />
      <Handle
        type="source"
        position={Position.Right}
        className={cn(
          "!z-20 !size-3 !border-2 !border-background-surface opacity-50 transition-opacity duration-fast",
          "group-hover:opacity-100",
          RIBBON_SOLID_CLASSES[GROUP_ACCENT]
        )}
      />

      {/* Header — rendered directly on the OUTER wrapper's own solid fill (above), no
          box or rounding of its own, exactly matching how node-header.tsx's content sits
          straight on node-chrome.tsx's ribbon-colored outer wrapper. Structure/sizing
          otherwise still matches NodeHeader exactly: a `justify-between` row with the
          icon+title cluster (`gap-1.5`) on the left and the action-icon cluster
          (`gap-0.5`, same tighter spacing NodeHeader's own open/menu icons use) on the
          right, same `size-3` icon and `text-xs font-medium` label. White text/icon
          (`text-text-on-accent`) for contrast against the dark fill — `RIBBON_FG_CLASSES`
          is a dark tone meant for content cards' pale ribbon tint, wrong here. Folder
          icon (Istiyak: "Should have Folder icon in start as all cards have it"). Rename
          is double-click (Istiyak: "Group node can be renamed by double click on
          title") — single click just selects the card. Deliberately NOT `nodrag` on the
          row itself (Istiyak: "Can able to move group from headers") — only the
          individual interactive buttons/input below are, exactly matching how a content
          card's own header row lets a plain drag move it. */}
      <div
        className={cn("flex w-full min-w-0 shrink-0 items-center justify-between gap-1.5 px-2 pb-1.5 pt-1", "text-text-on-accent")}
      >
          {editing ? (
            <input
              autoFocus
              className="nodrag min-w-0 flex-1 rounded border border-border-focus bg-background-surface px-1 py-0.5 text-xs text-text-primary focus-visible:outline-none"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commit}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commit();
                } else if (event.key === "Escape") {
                  setDraft(typedData.label);
                  setEditing(false);
                }
              }}
            />
          ) : (
            <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium">
              {/* Round 9 (Istiyak, with the Poppy reference: "use filled folder icon on
                  header like given in reference"): lucide-react ships Folder as an
                  outline/stroke icon by default — `fill-current` solidifies it into the
                  same flat silhouette the reference shows, reusing the exact technique
                  node-header.tsx's own `iconBadge` already applies to YouTube's icon
                  elsewhere in this app, just without that badge's extra colored chip
                  (the reference's folder sits plain on the header, no box around it). */}
              <Folder className="size-3 shrink-0 fill-current" aria-hidden="true" />
              <span className="truncate" title={`${typedData.label} — double-click to rename`} onDoubleClick={startEditing}>
                {typedData.label}
              </span>
            </span>
          )}
          <span className="flex shrink-0 items-center gap-0.5">
            {/* Duplication (Phase 3, F-07) — passing just the group's own id is enough:
                board-store.ts's `duplicateSelection`/`buildCloneTemplate` auto-expands
                any selected group id to include its current members, preserves internal
                edges between them, and drops any edge reaching outside the group,
                exactly the same rule a selection-based Ctrl+D or Ctrl+C/Ctrl+V on this
                group would apply — this button just offers it without needing to select
                anything first. */}
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                duplicateSelection([id]);
              }}
              aria-label="Duplicate"
              title="Duplicate"
              // Round 6 (Istiyak, comparing a screenshot directly against the
              // "Documents" card beside it: "Still not matching with the card style of
              // other node cards"): the one real, objective difference between them —
              // not an illusion — was that every content card's header is completely
              // EMPTY on the right at rest (node-menu.tsx's 3-dot trigger is
              // `opacity-0 group-hover:opacity-100`, invisible until you hover the
              // card), while this button sat permanently at `opacity-70`, always
              // visible. Now hidden at rest and revealed on hover/focus, exactly
              // matching NodeMenu's own visibility pattern — hover:bg-white/15, not
              // /10 black like a content card's dark-on-light menu button, since this
              // header's own fill is dark and a light hover wash reads correctly here
              // instead of vanishing against it.
              className="nodrag shrink-0 rounded p-0.5 opacity-0 transition-opacity duration-fast hover:bg-white/15 group-hover:opacity-100 group-focus-within:opacity-100"
            >
              {/* size-3.5, not size-3 (Istiyak: "header height... all to be match
                  exact") — a content card's header row isn't actually sized by its
                  text/label at all, it's sized by node-menu.tsx's own 3-dot trigger
                  icon, the single tallest element in that row at 14px. This action
                  cluster needed to match THAT icon's size, not the label's, for the
                  two header rows to come out the same height. */}
              <Copy className="size-3.5" aria-hidden="true" />
            </button>
            {/* Explicit, unambiguous ungroup affordance — same `ungroupNode` action the
                Ctrl+Shift+G shortcut uses (page.tsx). The hover-delete "X" below ends up
                doing the same thing (board-store.ts's `deleteNode` special-cases a group
                delete into an ungroup, never a cascade-delete of its members) — that one
                just matches every other card's existing delete affordance/Delete-key
                muscle memory, this one removes any doubt about what deleting a group
                actually does. */}
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                ungroupNode(id);
              }}
              aria-label="Ungroup"
              title="Ungroup"
              className="nodrag shrink-0 rounded p-0.5 opacity-0 transition-opacity duration-fast hover:bg-white/15 group-hover:opacity-100 group-focus-within:opacity-100"
            >
              <Ungroup className="size-3.5" aria-hidden="true" />
            </button>
          </span>
        </div>

      {/* Body — its OWN independent `rounded-lg overflow-hidden` box, a true sibling of
          the header above rather than a shared-container partner — this is what gives
          it genuinely rounded corners on every side, matching a content card's white
          body/thumbnail exactly (node-chrome.tsx). Opaque `bg-background-surface`, not
          a translucent wash — a translucent body with nothing but the OUTER dark fill
          directly behind it (no intermediate white layer any more) would recreate round
          3's original "dark bleeds through" bug the instant it's not perfectly flush
          against something light. `shadow-surface` matches a content card's same body
          elevation. The open area the group's members visually sit over — React Flow
          renders them as independently positioned siblings elsewhere in the DOM, never
          literal children of this div, so `overflow-hidden` here only clips THIS div's
          own (empty) contents, never a member that pokes past the group's edge. */}
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg bg-background-surface shadow-surface" />

      {/* Hover-only delete — same floating, quiet affordance as every content card's
          (ADR-0075: no border/shadow, hover goes to a neutral primary-text tone, not
          red — see node-chrome.tsx's own delete button for the full rationale). */}
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          deleteNode(id);
        }}
        aria-label="Delete"
        title="Delete"
        className={cn(
          "nodrag absolute -top-4 -right-4 z-10 flex size-5 items-center justify-center rounded-full",
          "bg-background-surface text-text-secondary",
          "opacity-0 transition-opacity duration-fast hover:text-text-primary",
          "group-hover:opacity-100 group-focus-within:opacity-100"
        )}
      >
        <X className="size-3" aria-hidden="true" />
      </button>
    </div>
  );
}

export const GroupNode = React.memo(GroupNodeImpl);
