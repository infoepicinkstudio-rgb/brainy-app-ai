"use client";

import * as React from "react";
import type { NodeProps } from "@xyflow/react";
import { X, Link2, ExternalLink } from "lucide-react";
import { useBoardStore, type LinkNodeData } from "@/stores/board-store";
import { NodeChrome } from "@/components/canvas/node-chrome";

// TF-13 — generic link/reference node (F-27, ADR-0053). Deliberately does no scraping
// or automated fetching of any kind — just the raw URL, an editable title, and a
// free-text area for manually pasting the page's content. Consistent with how
// Instagram link nodes already work (F-10), generalized beyond video platforms.
export function LinkNode({ id, data, selected }: NodeProps) {
  const typedData = data as LinkNodeData;
  const updateNodeData = useBoardStore((state) => state.updateNodeData);
  const flushNodeData = useBoardStore((state) => state.flushNodeData);
  const deleteNode = useBoardStore((state) => state.deleteNode);

  return (
    <NodeChrome selected={selected}>
      <div className="flex items-center justify-between gap-2 border-b border-border-muted px-3 py-1.5">
        <span className="flex items-center gap-1.5 text-xs font-medium text-text-muted">
          <Link2 className="size-3" aria-hidden="true" />
          Link
        </span>
        <button
          type="button"
          className="nodrag rounded p-0.5 text-text-muted transition-colors hover:bg-background-muted hover:text-text-primary"
          aria-label="Delete link node"
          onClick={() => deleteNode(id)}
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      </div>

      <div className="space-y-1.5 px-3 py-2">
        <input
          className="nodrag w-full rounded border border-border-default bg-background-page px-2 py-1 text-xs text-text-primary placeholder:text-text-muted focus-visible:border-border-focus focus-visible:outline-none"
          placeholder="https://…"
          value={typedData.url}
          onChange={(event) => updateNodeData(id, { ...typedData, url: event.target.value })}
          onBlur={() => flushNodeData(id)}
        />
        <input
          className="nodrag w-full rounded border border-border-default bg-background-page px-2 py-1 text-xs text-text-primary placeholder:text-text-muted focus-visible:border-border-focus focus-visible:outline-none"
          placeholder="Title"
          value={typedData.title}
          onChange={(event) => updateNodeData(id, { ...typedData, title: event.target.value })}
          onBlur={() => flushNodeData(id)}
        />
      </div>

      <textarea
        className="nodrag nowheel h-20 w-full resize-none border-t border-border-muted bg-transparent px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus-visible:outline-none"
        placeholder="Paste the page's content here (optional)…"
        value={typedData.notes}
        onChange={(event) => updateNodeData(id, { ...typedData, notes: event.target.value })}
        onBlur={() => flushNodeData(id)}
      />

      {typedData.url ? (
        <a
          href={typedData.url}
          target="_blank"
          rel="noopener noreferrer"
          className="nodrag flex items-center gap-1.5 border-t border-border-muted px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-background-muted hover:text-text-primary"
        >
          <ExternalLink className="size-3" aria-hidden="true" />
          Open link
        </a>
      ) : null}
    </NodeChrome>
  );
}
