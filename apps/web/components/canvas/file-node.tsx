"use client";

import * as React from "react";
import type { NodeProps } from "@xyflow/react";
import { FileText, FileSpreadsheet, Image as ImageIcon, AlertTriangle, Download, type LucideIcon } from "lucide-react";
import { useBoardStore, type FileNodeData } from "@/stores/board-store";
import { NodeChrome, type NodeAccent } from "@/components/canvas/node-chrome";
import { NodeHeader } from "@/components/canvas/node-header";
import { NodeNotesField } from "@/components/canvas/node-notes-field";
import { API_BASE_URL } from "@/lib/api";
import { cn } from "@/lib/utils";

// TF-12 — file/document node (F-26, ADR-0053). Extraction already ran server-side at
// upload time (board-store.ts's addFileNode), so this just renders whatever status came
// back: "ok" (extracted — pdf-parse/mammoth/xlsx), "unsupported" (file type we don't
// parse), "failed" (corrupt/password-protected — a graceful state, not a crash), or
// "not_applicable" (an image — visual reference only, no extraction attempted by
// design, matching the F-16 manual-notes pattern instead).
//
// Node-card-overhaul pass (ADR-0065): "Open file" moved from a standalone footer link
// into the body's own "Download <size>" row (below) — there is no header menu at all
// (ADR-0075); deletion is Delete-key or NodeChrome's own hover-only "X".
//
// Round 2 (ADR-0069) gave each fileKind its own icon. Accent COLOR went through two
// reversals since: ADR-0071 unified every non-image document to one flat "warning"
// amber; ADR-0075 (Istiyak, explicit: "Document type should have exact file type
// feel... Excel is uploaded but its not giving a feel of excel") restored the familiar
// Office-suite per-kind colors — PDF red, Word blue, Excel green — matching a widely
// recognized visual language for file types generally, not any one brand's specific
// logo/mark. Restored again here after the live code had drifted back to ADR-0071's
// flat scheme (Phase 3 testing, Istiyak: "All documents and link cards looks the same
// shade" — this flat amber reading the same as every other document was exactly why).
// Images keep their own thumbnail as the primary visual identity (neutral ribbon).
const FILE_KIND_ICON: Record<FileNodeData["fileKind"], LucideIcon> = {
  pdf: FileText,
  docx: FileText,
  xlsx: FileSpreadsheet,
  image: ImageIcon,
  other: FileText,
};

const FILE_KIND_ACCENT: Record<FileNodeData["fileKind"], NodeAccent> = {
  pdf: "danger",
  docx: "info",
  xlsx: "success",
  image: "neutral",
  other: "warning",
};

function FileNodeImpl({ id, data, selected, parentId }: NodeProps) {
  const typedData = data as FileNodeData;
  const updateNodeData = useBoardStore((state) => state.updateNodeData);
  const flushNodeData = useBoardStore((state) => state.flushNodeData);
  const deleteNode = useBoardStore((state) => state.deleteNode);
  const duplicateSelection = useBoardStore((state) => state.duplicateSelection);
  const fileUrl = `${API_BASE_URL}/api/files/${typedData.storedName}`;
  // Legacy nodes created before ADR-0069 (fileKind didn't exist yet) fall back to a
  // sensible guess from isImage rather than rendering with no icon/color at all.
  const fileKind: FileNodeData["fileKind"] = typedData.fileKind ?? (typedData.isImage ? "image" : "other");
  // ADR-0070: the explicit resized size, read from `data` — see node-chrome.tsx's top
  // comment for why this must not be NodeProps' own `width`/`height` (BUG-012).
  const explicitWidth = typedData.cardWidth;
  const explicitHeight = typedData.cardHeight;

  return (
    <NodeChrome
      id={id}
      selected={selected}
      accent={FILE_KIND_ACCENT[fileKind]}
      header={
        // Round 4 (Istiyak, re-matching the reference cards closely): the header shows
        // a generic CATEGORY word ("Documents") here, same as the text card's plain
        // "Text" — the specific filename lives in the body instead (it's already there,
        // next to the size/download row below). Only the link and video cards show a
        // specific title up top, since for those the header IS the one identifying
        // detail; a file card's identity is really "this is a document," with which one
        // answered by its body.
        <NodeHeader
          icon={FILE_KIND_ICON[fileKind]}
          label="Documents"
          // Istiyak (Phase 3 testing): the header's "go to" icon should be a LINK-card
          // thing only. Omitting `onOpen` here loses nothing — the body already has its
          // own "Download <size>" row (below) for documents, and an image file's
          // thumbnail is already visible inline, so there was no unique capability only
          // that button offered. Deletion lives exclusively in NodeChrome's own
          // hover-only "X" (ADR-0075) — never passed to the header itself.
          onDuplicate={() => duplicateSelection([id])}
        />
      }
      width={explicitWidth}
      height={explicitHeight}
      onDelete={() => deleteNode(id)}
      hideConnections={Boolean(parentId)}
      // ADR-0075 (Istiyak: "Apart from text none of the node cards needed resize"): no
      // `onResizeEnd` here — NodeChrome only renders the resize handle when selected AND
      // this prop is provided, so omitting it is the off-switch. A card resized before
      // this restriction still renders at its saved cardWidth/cardHeight above; it just
      // can't be resized further. Restored after drifting back to resizable-everywhere
      // (Phase 3 testing, Istiyak: "Resizer came back to all card types. Which we
      // decided to remove.").
    >
      {typedData.isImage ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- a locally-served,
              content-hash-addressed file, not an external/optimizable image source */}
          <img
            src={fileUrl}
            alt={typedData.fileName}
            // Round 4 / BUG-016: grows with a resize (`flex-1 min-h-0`) instead of
            // staying pinned at a fixed height while the card around it grows — same fix
            // as the video card's thumbnail.
            className={cn("w-full object-cover", explicitHeight ? "min-h-0 flex-1" : "h-28 shrink-0")}
          />
          <NodeNotesField
            value={typedData.notes}
            onChange={(value) => updateNodeData(id, { ...typedData, notes: value })}
            onCommit={() => flushNodeData(id)}
            placeholder="Add a note about this image…"
            bordered={false}
          />
        </>
      ) : (
        <div className={cn("flex flex-col gap-1.5 px-2.5 py-2", explicitHeight && "scrollbar-thin flex-1 overflow-y-auto")}>
          {/* Round 4: the filename moved down here (the header now shows the generic
              "Documents" category word instead) — a small file-type icon + the actual
              name, matching the reference's body layout exactly, with size + download
              as their own row right below it. */}
          <div className="flex items-center gap-1.5 text-xs font-medium text-text-primary">
            <FileIconFor fileKind={fileKind} />
            <span className="truncate">{typedData.fileName}</span>
          </div>
          <a
            href={fileUrl}
            download={typedData.fileName}
            className="nodrag flex w-fit items-center gap-1.5 rounded text-xs text-text-secondary hover:text-text-primary"
            title={`Download ${typedData.fileName}`}
          >
            <span>{formatFileSize(typedData.bytes)}</span>
            <Download className="size-3" aria-hidden="true" />
          </a>
          <ExtractionStatus status={typedData.extractionStatus} preview={typedData.extractionPreview} />
        </div>
      )}
    </NodeChrome>
  );
}

export const FileNode = React.memo(FileNodeImpl);

function FileIconFor({ fileKind }: { fileKind: FileNodeData["fileKind"] }) {
  const Icon = FILE_KIND_ICON[fileKind];
  return <Icon className="size-3.5 shrink-0 text-text-secondary" aria-hidden="true" />;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unitIndex]}`;
}

function ExtractionStatus({
  status,
  preview,
}: {
  status: FileNodeData["extractionStatus"];
  preview: string | null;
}) {
  if (status === "ok") {
    return <p className="line-clamp-3 text-xs text-text-secondary">{preview || "Text extracted."}</p>;
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
