"use client";

import * as React from "react";
import type { NodeProps } from "@xyflow/react";
import { Type, Pencil } from "lucide-react";
import { useBoardStore, type TextNodeData } from "@/stores/board-store";
import { NodeChrome } from "@/components/canvas/node-chrome";
import { NodeHeader } from "@/components/canvas/node-header";
import { cn } from "@/lib/utils";

// TF-04 — the first real node type (implementation_plan.md Phase 2 step 5). Content
// autosaves on every change (debounced, board-store.ts) and flushes immediately on
// blur so a hard-refresh right after typing never loses the edit (testing.md F-08).
//
// Node-card-overhaul pass (ADR-0065): deletion is Delete-key or the card's hover-only
// "X" (round 6/ADR-0075 removed the 3-dot menu entirely). Wrapped in React.memo (per
// that pass's instructions) as defensive practice; React Flow's own internal per-node
// wrapper already avoids re-rendering untouched siblings on an edit elsewhere, but
// memoizing the leaf component itself is still the correct baseline.
//
// Round 6 / ADR-0075 — read-only-by-default with an explicit edit affordance (Istiyak:
// "Text card should have edit button like Go TO Link on hover. Rest should have text
// previews and not directly editable field. This will reduce the mistakenly text
// changes on the go"): this is the one real interaction-model change of this round, and
// it's deliberately scoped to the text card only — every other node type's body is
// already non-editable content (a thumbnail, a file preview, a URL), so there was never
// a "stray click changes something" risk there the way a live textarea has. `editing`
// is local component state, seeded ONCE from whether the node started out empty (a
// fresh node needs to be immediately typeable, not one more click away) — never
// re-derived from `content` on every render, since that would flip back to read-only
// mid-keystroke the instant the first character landed.
function TextNodeImpl({ id, data, selected }: NodeProps) {
  const typedData = data as TextNodeData;
  const updateNodeData = useBoardStore((state) => state.updateNodeData);
  const flushNodeData = useBoardStore((state) => state.flushNodeData);
  const deleteNode = useBoardStore((state) => state.deleteNode);
  const saveNodeSize = useBoardStore((state) => state.saveNodeSize);
  // The EXPLICIT resized size (ADR-0070), read from `data`, not from NodeProps' own
  // `width`/`height` — those reflect React Flow's MEASURED size (falling back to a
  // transient near-zero value before the first ResizeObserver tick), not "has this card
  // been resized"; using them directly here self-collapsed every fresh card to ~2px
  // (caught live via Playwright DOM dump, see bugs.md BUG-012). Round 6: text is now the
  // ONLY node type that still passes `onResizeEnd` below, so it's the only type whose
  // resize handle still renders at all (Istiyak: "Apart from text none of the node
  // cards needed resize").
  const explicitWidth = typedData.cardWidth;
  const explicitHeight = typedData.cardHeight;

  const [editing, setEditing] = React.useState(() => !typedData.content);

  // Round 6 (Istiyak: "For Text card first line could be treated like title, a bit
  // bigger, medium in weight like all notetakers behave"): no separate "title" field
  // was added to the data model for this — one more thing to keep in sync, for a node
  // type whose whole point is a single freeform text blob. The first line of the
  // existing `content` is treated as the title purely at RENDER time in the read-only
  // preview; the underlying data/textarea stay one plain string, unchanged.
  const firstNewline = typedData.content.indexOf("\n");
  const titleLine = firstNewline === -1 ? typedData.content : typedData.content.slice(0, firstNewline);
  const restLines = firstNewline === -1 ? "" : typedData.content.slice(firstNewline + 1);

  return (
    <NodeChrome
      selected={selected}
      accent="info"
      header={
        <NodeHeader
          icon={Type}
          label="Text"
          iconBadge
          accent="info"
          onOpen={editing ? undefined : () => setEditing(true)}
          openLabel="Edit"
          actionIcon={Pencil}
        />
      }
      width={explicitWidth}
      height={explicitHeight}
      onDelete={() => deleteNode(id)}
      onResizeEnd={(size) => saveNodeSize(id, size)}
    >
      {editing ? (
        <textarea
          autoFocus
          className={cn(
            "nodrag nowheel scrollbar-thin w-full resize-none bg-transparent px-2.5 py-2 text-xs leading-relaxed text-text-primary placeholder:text-text-muted focus-visible:outline-none",
            explicitHeight ? "flex-1" : "h-24"
          )}
          placeholder="Write a note…"
          value={typedData.content}
          onChange={(event) => updateNodeData(id, { ...typedData, content: event.target.value })}
          onBlur={() => {
            flushNodeData(id);
            setEditing(false);
          }}
        />
      ) : (
        <div
          className={cn(
            "w-full px-2.5 py-2 text-xs leading-relaxed text-text-primary",
            explicitHeight ? "scrollbar-thin flex-1 overflow-y-auto" : "min-h-24"
          )}
        >
          {typedData.content ? (
            <>
              <p className="text-sm font-medium text-text-primary">{titleLine}</p>
              {restLines ? <p className="mt-1 whitespace-pre-wrap">{restLines}</p> : null}
            </>
          ) : (
            <p className="italic text-text-muted">Write a note…</p>
          )}
        </div>
      )}
    </NodeChrome>
  );
}

export const TextNode = React.memo(TextNodeImpl);
