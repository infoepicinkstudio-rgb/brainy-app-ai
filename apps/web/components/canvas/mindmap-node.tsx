"use client";

import * as React from "react";
import type { NodeProps } from "@xyflow/react";
import { Network } from "lucide-react";
import { useBoardStore, type MindmapNodeData, type MindmapTreeNode } from "@/stores/board-store";
import { NodeChrome } from "@/components/canvas/node-chrome";
import { NodeHeader } from "@/components/canvas/node-header";

// Phase 6 (F-17/TF-10, ADR-0101) — a Mindmap node is a plain, read-only snapshot of one
// generation (board-store.ts's addMindmapNode doc comment explains why "Regenerate"
// creates a new node rather than editing this one in place). No editable fields at all
// here — unlike every other node type, there's nothing on this card for Istiyak to type
// into; it exists to be looked at, resized, moved, and deleted.
//
// Rendered as a simple indented outline with connector lines (CSS border-left on each
// nested <ul>, a short horizontal tick per item) rather than a radial diagram with
// absolutely-positioned branches — a real radial layout would need its own recursive
// position-computation pass (effectively a small layout engine) for a Should-have
// feature in a solo personal tool; an indented tree reads just as clearly as "this
// response, broken into branches" with a fraction of the implementation risk, and the
// topic chip + bold top-level branches below still make the hierarchy immediately
// legible at a glance.
function MindmapBranch({ node }: { node: MindmapTreeNode }) {
  const children = node.children ?? [];
  return (
    <li className="relative">
      <span className="flex items-start gap-1.5 py-0.5 text-xs text-text-primary">
        <span className="mt-1.5 size-1 shrink-0 rounded-full bg-text-muted" aria-hidden="true" />
        <span className="leading-snug">{node.label}</span>
      </span>
      {children.length > 0 ? (
        <ul className="ml-1 flex flex-col border-l border-border-muted pl-3">
          {children.map((child, index) => (
            <MindmapBranch key={index} node={child} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function MindmapNodeImpl({ id, data, selected, parentId }: NodeProps) {
  const typedData = data as MindmapNodeData;
  const deleteNode = useBoardStore((state) => state.deleteNode);
  const duplicateSelection = useBoardStore((state) => state.duplicateSelection);
  const saveNodeSize = useBoardStore((state) => state.saveNodeSize);

  const explicitWidth = typedData.cardWidth;
  const explicitHeight = typedData.cardHeight;

  return (
    <NodeChrome
      id={id}
      selected={selected}
      accent="info"
      header={<NodeHeader icon={Network} label="Mindmap" onDuplicate={() => duplicateSelection([id])} />}
      width={explicitWidth ?? 288}
      height={explicitHeight ?? 220}
      onDelete={() => deleteNode(id)}
      onResizeEnd={(size) => saveNodeSize(id, size)}
      hideConnections={Boolean(parentId)}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2.5">
        <p className="shrink-0 rounded-md bg-background-accent-muted px-2 py-1 text-xs font-semibold text-text-accent">
          {typedData.topic}
        </p>
        {typedData.tree.length > 0 ? (
          <ul className="flex flex-col">
            {typedData.tree.map((branch, index) => (
              <MindmapBranch key={index} node={branch} />
            ))}
          </ul>
        ) : (
          <p className="text-xs text-text-muted">No branches.</p>
        )}
      </div>
    </NodeChrome>
  );
}

export const MindmapNode = React.memo(MindmapNodeImpl);
