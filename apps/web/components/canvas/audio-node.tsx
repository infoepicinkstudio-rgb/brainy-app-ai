"use client";

import * as React from "react";
import type { NodeProps } from "@xyflow/react";
import { FileAudio, Download } from "lucide-react";
import { useBoardStore, type AudioNodeData } from "@/stores/board-store";
import { NodeChrome } from "@/components/canvas/node-chrome";
import { NodeHeader } from "@/components/canvas/node-header";
import { NodeNotesField } from "@/components/canvas/node-notes-field";
import { NodeExtractionStatus } from "@/components/canvas/node-extraction-status";
import { API_BASE_URL } from "@/lib/api";

// Phase 5 (ADR-0085) — dedicated node for an uploaded audio file. Upload-only, no URL
// variant (an audio *link* has nowhere natural to go but a `link` node, which already
// gets the same lazy extraction via ADR-0087). Modeled on file-node.tsx's non-image
// body (filename + size/download row) for the upload identity, and on video-node.tsx's
// use of the shared extraction pipeline for the transcript half — this card is really
// "file-node's upload chrome" + "video-node's F-14 content", which is exactly why
// neither of those existing node types was reused outright (ADR-0085's own reasoning):
// a file node's body assumes document extraction (pdf-parse/mammoth/xlsx), not a
// transcript pipeline, and a video node's body assumes a thumbnail, which an audio
// file has none of.
//
// Accent: reuses "accent" (purple), the same scale the video card already gives Vimeo
// (node-chrome.tsx's `NodeAccent` — six values, already shared across multiple node
// kinds; no new accent token needed for this type).
function AudioNodeImpl({ id, data, selected, parentId }: NodeProps) {
  const typedData = data as AudioNodeData;
  const updateNodeData = useBoardStore((state) => state.updateNodeData);
  const flushNodeData = useBoardStore((state) => state.flushNodeData);
  const deleteNode = useBoardStore((state) => state.deleteNode);
  const duplicateSelection = useBoardStore((state) => state.duplicateSelection);
  const fileUrl = `${API_BASE_URL}/api/files/${typedData.storedName}`;
  // ADR-0070: the explicit resized size, read from `data` — see node-chrome.tsx's top
  // comment for why this must not be NodeProps' own `width`/`height` (BUG-012).
  const explicitWidth = typedData.cardWidth;
  const explicitHeight = typedData.cardHeight;

  return (
    <NodeChrome
      id={id}
      selected={selected}
      accent="accent"
      header={
        // Same reasoning as file-node.tsx's header: a generic category word up top
        // ("Audio"), the specific filename lives in the body next to size/download —
        // consistent with how every upload-sourced card (not a URL-sourced one) treats
        // its header in this app.
        <NodeHeader icon={FileAudio} label="Audio" onDuplicate={() => duplicateSelection([id])} />
      }
      width={explicitWidth}
      height={explicitHeight}
      onDelete={() => deleteNode(id)}
      hideConnections={Boolean(parentId)}
      // ADR-0075: no `onResizeEnd` — resize is text-only, same as every other non-text
      // card type (file/video/link).
    >
      <div className="flex flex-col gap-1.5 px-2.5 py-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-text-primary">
          <FileAudio className="size-3.5 shrink-0 text-text-secondary" aria-hidden="true" />
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
        <NodeExtractionStatus nodeId={id} status={typedData.extractionStatus} preview={typedData.extractionPreview} />
      </div>

      <NodeNotesField
        value={typedData.notes}
        onChange={(value) => updateNodeData(id, { ...typedData, notes: value })}
        onCommit={() => flushNodeData(id)}
      />
    </NodeChrome>
  );
}

export const AudioNode = React.memo(AudioNodeImpl);

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
