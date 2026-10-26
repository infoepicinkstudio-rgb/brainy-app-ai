"use client";

import * as React from "react";
import type { NodeProps } from "@xyflow/react";
import { X } from "lucide-react";
import { useBoardStore, type TextNodeData } from "@/stores/board-store";
import { NodeChrome } from "@/components/canvas/node-chrome";

// TF-04 — the first real node type (implementation_plan.md Phase 2 step 5). Content
// autosaves on every change (debounced, board-store.ts) and flushes immediately on
// blur so a hard-refresh right after typing never loses the edit (testing.md F-08).
export function TextNode({ id, data, selected }: NodeProps) {
  const typedData = data as TextNodeData;
  const updateNodeData = useBoardStore((state) => state.updateNodeData);
  const flushNodeData = useBoardStore((state) => state.flushNodeData);
  const deleteNode = useBoardStore((state) => state.deleteNode);

  return (
    <NodeChrome selected={selected}>
      <div className="flex items-center justify-between gap-2 border-b border-border-muted px-3 py-1.5">
        <span className="text-xs font-medium text-text-muted">Text</span>
        <button
          type="button"
          className="nodrag rounded p-0.5 text-text-muted transition-colors hover:bg-background-muted hover:text-text-primary"
          aria-label="Delete text node"
          onClick={() => deleteNode(id)}
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      </div>
      <textarea
        className="nodrag nowheel h-32 w-full resize-none bg-transparent px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus-visible:outline-none"
        placeholder="Write a note…"
        value={typedData.content}
        onChange={(event) => updateNodeData(id, { ...typedData, content: event.target.value })}
        onBlur={() => flushNodeData(id)}
      />
    </NodeChrome>
  );
}
