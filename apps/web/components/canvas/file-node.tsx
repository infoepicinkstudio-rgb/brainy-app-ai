"use client";

import * as React from "react";
import type { NodeProps } from "@xyflow/react";
import { X, FileText, AlertTriangle, ExternalLink } from "lucide-react";
import { useBoardStore, type FileNodeData } from "@/stores/board-store";
import { NodeChrome } from "@/components/canvas/node-chrome";
import { API_BASE_URL } from "@/lib/api";
import { cn } from "@/lib/utils";

// TF-12 — file/document node (F-26, ADR-0053). Extraction already ran server-side at
// upload time (board-store.ts's addFileNode), so this just renders whatever status came
// back: "ok" (extracted — pdf-parse/mammoth/xlsx), "unsupported" (file type we don't
// parse), "failed" (corrupt/password-protected — a graceful state, not a crash), or
// "not_applicable" (an image — visual reference only, no extraction attempted by
// design, matching the F-16 manual-notes pattern instead).
export function FileNode({ id, data, selected }: NodeProps) {
  const typedData = data as FileNodeData;
  const updateNodeData = useBoardStore((state) => state.updateNodeData);
  const flushNodeData = useBoardStore((state) => state.flushNodeData);
  const deleteNode = useBoardStore((state) => state.deleteNode);
  const fileUrl = `${API_BASE_URL}/api/files/${typedData.storedName}`;

  return (
    <NodeChrome selected={selected}>
      <div className="flex items-center justify-between gap-2 border-b border-border-muted px-3 py-1.5">
        <span className="truncate text-xs font-medium text-text-muted" title={typedData.fileName}>
          {typedData.fileName}
        </span>
        <button
          type="button"
          className="nodrag shrink-0 rounded p-0.5 text-text-muted transition-colors hover:bg-background-muted hover:text-text-primary"
          aria-label="Delete file node"
          onClick={() => deleteNode(id)}
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      </div>

      {typedData.isImage ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- a locally-served,
              content-hash-addressed file, not an external/optimizable image source */}
          <img src={fileUrl} alt={typedData.fileName} className="max-h-40 w-full object-cover" />
          <textarea
            className="nodrag nowheel h-16 w-full resize-none bg-transparent px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus-visible:outline-none"
            placeholder="Add a note about this image…"
            value={typedData.notes}
            onChange={(event) => updateNodeData(id, { ...typedData, notes: event.target.value })}
            onBlur={() => flushNodeData(id)}
          />
        </>
      ) : (
        <div className="flex items-start gap-2 px-3 py-2.5">
          <FileText className="mt-0.5 size-4 shrink-0 text-text-muted" aria-hidden="true" />
          <ExtractionStatus status={typedData.extractionStatus} preview={typedData.extractionPreview} />
        </div>
      )}

      <a
        href={fileUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="nodrag flex items-center gap-1.5 border-t border-border-muted px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-background-muted hover:text-text-primary"
      >
        <ExternalLink className="size-3" aria-hidden="true" />
        Open file
      </a>
    </NodeChrome>
  );
}

function ExtractionStatus({
  status,
  preview,
}: {
  status: FileNodeData["extractionStatus"];
  preview: string | null;
}) {
  if (status === "ok") {
    return (
      <p className="line-clamp-3 text-xs text-text-secondary">
        {preview || "Text extracted."}
      </p>
    );
  }
  if (status === "unsupported") {
    return <p className="text-xs text-text-muted">This file type isn&apos;t supported for text extraction.</p>;
  }
  if (status === "failed") {
    return (
      <p className={cn("flex items-center gap-1 text-xs text-text-danger")}>
        <AlertTriangle className="size-3 shrink-0" aria-hidden="true" />
        Couldn&apos;t read this file — it may be corrupted or password-protected.
      </p>
    );
  }
  return <p className="text-xs text-text-muted">Extracting…</p>;
}
