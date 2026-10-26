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
// into the header's 3-dot menu; deletion is Delete-key, that menu, or (round 2,
// ADR-0068) the hover-only "X".
//
// Round 2 (ADR-0069): icon varies by `fileKind` (set server-side at upload time,
// files.ts) so a PDF/Word/Excel/image/other file is visually distinguishable at a
// glance. ADR-0071 (round 2) then unified the ribbon COLOR to one consistent "document"
// orange across every non-image kind, favoring a newer reference screenshot over the
// original per-kind-color ask. Round 6 (ADR-0075) REVERSES that call, per Istiyak's
// explicit new instruction: "Document type should have exact file type feel... Excel is
// uploaded but its not giving a feel of excel." Per-kind color is restored — PDF=red,
// Word(docx)=blue, Excel(xlsx)=green, matching the familiar Office-suite color
// convention (a widely recognized visual language for these file types generally, not
// any one brand's specific logo/mark) — image and other/unrecognized files stay neutral
// gray, since there's no equivalent "type color" convention for either.
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
  other: "neutral",
};

function FileNodeImpl({ id, data, selected }: NodeProps) {
  const typedData = data as FileNodeData;
  const updateNodeData = useBoardStore((state) => state.updateNodeData);
  const flushNodeData = useBoardStore((state) => state.flushNodeData);
  const deleteNode = useBoardStore((state) => state.deleteNode);
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
          onOpen={() => window.open(fileUrl, "_blank", "noopener,noreferrer")}
          openLabel="Open file"
        />
      }
      width={explicitWidth}
      height={explicitHeight}
      onDelete={() => deleteNode(id)}
      // Round 6 (Istiyak: "Apart from text none of the node cards needed resize") — no
      // longer passed here, so `NodeChrome` never renders a resize handle for this type.
      // `width`/`height` above still honor a size persisted by an earlier round, for any
      // file card resized before this change.
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
