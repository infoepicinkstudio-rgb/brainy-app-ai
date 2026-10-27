"use client";

import * as React from "react";
import type { NodeProps } from "@xyflow/react";
import { Pencil, Type } from "lucide-react";
import { useBoardStore, type TextNodeData } from "@/stores/board-store";
import { NodeChrome } from "@/components/canvas/node-chrome";
import { NodeHeader } from "@/components/canvas/node-header";
import { cn } from "@/lib/utils";

// TF-04 — the first real node type (implementation_plan.md Phase 2 step 5). Content
// autosaves on every change (debounced, board-store.ts) and flushes immediately on
// blur so a hard-refresh right after typing never loses the edit (testing.md F-08).
//
// Node-card-overhaul pass (ADR-0065): deletion is now Delete-key or the chrome's own
// hover-only "X" ONLY — the old standalone always-visible button is gone (bugs.md
// BUG-009).
//
// ADR-0075 (restored — Istiyak, Phase 3 close-out testing: "Text cards not read only.
// Also first line to be treated as Title is also gone"): this card is read-only by
// default, not a permanently-open textarea. `editing` is seeded ONCE, from whether the
// card started genuinely empty (a brand-new card the user just dropped — starting it in
// edit mode lets them type immediately without a separate click first; anything with
// existing content opens already in its read-only preview). The preview treats the
// FIRST LINE of `content` as the card's title (bigger, `font-medium`, same convention
// every other card's header label uses) and the remaining lines as plain body text —
// this is a presentational split only, never written back into two separate fields;
// `content` itself stays one plain string. The header's hover-only "Edit" affordance
// (reusing NodeHeader's generic action-icon slot with a `Pencil` icon instead of its
// `ExternalLink` default) re-enters edit mode; blurring the textarea returns to the
// read-only preview, the same "edit → blur → settle" shape every other card's inline
// text editing already uses.
function TextNodeImpl({ id, data, selected, parentId }: NodeProps) {
  const typedData = data as TextNodeData;
  const updateNodeData = useBoardStore((state) => state.updateNodeData);
  const flushNodeData = useBoardStore((state) => state.flushNodeData);
  const deleteNode = useBoardStore((state) => state.deleteNode);
  const duplicateSelection = useBoardStore((state) => state.duplicateSelection);
  const saveNodeSize = useBoardStore((state) => state.saveNodeSize);
  // The EXPLICIT resized size (ADR-0070), read from `data`, not from NodeProps' own
  // `width`/`height` — those reflect React Flow's MEASURED size (falling back to a
  // transient near-zero value before the first ResizeObserver tick), not "has this card
  // been resized"; using them directly here self-collapsed every fresh card to ~2px
  // (caught live via Playwright DOM dump, see bugs.md BUG-012).
  const explicitWidth = typedData.cardWidth;
  const explicitHeight = typedData.cardHeight;

  // Seeded ONCE on mount from the card's starting content, never re-derived from live
  // `typedData.content` afterward — re-seeding on every keystroke would fight the user
  // right out of the edit they're actively making.
  const [editing, setEditing] = React.useState(() => typedData.content.trim() === "");

  const commitEdit = React.useCallback(() => {
    flushNodeData(id);
    setEditing(false);
  }, [flushNodeData, id]);

  // Same fix as link-node.tsx's URL field (Istiyak: "on canvas click that still don't
  // go automatically to preview mode" — reported there first, but this card shares the
  // identical edit→blur→read-only shape, so it was just as exposed to the same
  // native-blur-timing gap against React Flow's own pointer handling). A plain
  // `onBlur` on the textarea stays as the normal path; this additionally closes the
  // edit on ANY pointerdown outside the textarea itself, which doesn't depend on
  // native focus/blur semantics firing correctly at all.
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  React.useEffect(() => {
    if (!editing) return;
    const handlePointerDownOutside = (event: PointerEvent) => {
      if (textareaRef.current && event.target instanceof Node && !textareaRef.current.contains(event.target)) {
        commitEdit();
      }
    };
    document.addEventListener("pointerdown", handlePointerDownOutside, true);
    return () => document.removeEventListener("pointerdown", handlePointerDownOutside, true);
  }, [editing, commitEdit]);

  const newlineIndex = typedData.content.indexOf("\n");
  const titleLine = newlineIndex === -1 ? typedData.content : typedData.content.slice(0, newlineIndex);
  const bodyLines = newlineIndex === -1 ? "" : typedData.content.slice(newlineIndex + 1);

  return (
    <NodeChrome
      id={id}
      selected={selected}
      accent="info"
      header={
        <NodeHeader
          icon={Type}
          label="Text"
          onDuplicate={() => duplicateSelection([id])}
          onOpen={() => setEditing(true)}
          openLabel="Edit"
          actionIcon={Pencil}
          iconBadge
          accent="info"
        />
      }
      width={explicitWidth}
      height={explicitHeight}
      onDelete={() => deleteNode(id)}
      onResizeEnd={(size) => saveNodeSize(id, size)}
      hideConnections={Boolean(parentId)}
    >
      {editing ? (
        <textarea
          ref={textareaRef}
          autoFocus
          className={cn(
            "nodrag nowheel scrollbar-thin w-full resize-none bg-transparent px-2.5 py-2 text-xs leading-relaxed text-text-primary placeholder:text-text-muted focus-visible:outline-none",
            explicitHeight ? "flex-1" : "h-24"
          )}
          placeholder="Write a note…"
          value={typedData.content}
          onChange={(event) => updateNodeData(id, { ...typedData, content: event.target.value })}
          onBlur={commitEdit}
        />
      ) : (
        <div
          className={cn(
            "nowheel scrollbar-thin w-full overflow-y-auto px-2.5 py-2 text-xs leading-relaxed text-text-primary",
            explicitHeight ? "flex-1" : "h-24"
          )}
        >
          {titleLine ? <div className="font-medium">{titleLine}</div> : null}
          {bodyLines ? <div className="whitespace-pre-wrap text-text-secondary">{bodyLines}</div> : null}
          {!titleLine && !bodyLines ? <span className="text-text-muted">Write a note…</span> : null}
        </div>
      )}
    </NodeChrome>
  );
}

export const TextNode = React.memo(TextNodeImpl);
