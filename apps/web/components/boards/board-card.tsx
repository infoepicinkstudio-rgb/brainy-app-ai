"use client";

import * as React from "react";
import Link from "next/link";
import { LayoutGrid, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BoardSummary {
  id: string;
  title: string;
  folder_id: string | null;
  updated_at: string;
}

export interface FolderSummary {
  id: string;
  name: string;
}

// One Boards List card — a Link for the primary "open" action, with rename/move/delete
// as a separate row below it so none of those controls ever fight the Link for a click
// (no stopPropagation gymnastics needed; they're just not nested inside it).
export function BoardCard({
  board,
  folders,
  onRename,
  onMoveToFolder,
  onDelete,
}: {
  board: BoardSummary;
  folders: FolderSummary[];
  onRename: () => void;
  onMoveToFolder: (folderId: string | null) => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-col rounded-lg border border-border-default bg-background-surface shadow-surface transition-shadow duration-fast hover:shadow-surface-raised">
      <Link
        href={`/brainboards/${board.id}`}
        className="flex flex-1 flex-col gap-2 px-4 py-4"
      >
        <span className="flex size-8 items-center justify-center rounded-lg bg-background-accent-muted text-text-accent">
          <LayoutGrid className="size-4" aria-hidden="true" />
        </span>
        <span className="truncate text-sm font-medium text-text-primary">{board.title}</span>
      </Link>
      <div className="flex items-center gap-1 border-t border-border-muted px-2 py-1.5">
        <button
          type="button"
          onClick={onRename}
          aria-label="Rename board"
          className="rounded p-1 text-text-muted transition-colors hover:bg-background-muted hover:text-text-primary"
        >
          <Pencil className="size-3.5" aria-hidden="true" />
        </button>
        <select
          className={cn(
            "h-6 flex-1 rounded border border-transparent bg-transparent text-xs text-text-secondary",
            "transition-colors hover:border-border-default focus-visible:border-border-focus focus-visible:outline-none"
          )}
          value={board.folder_id ?? ""}
          onChange={(event) => onMoveToFolder(event.target.value || null)}
          aria-label="Move to folder"
        >
          <option value="">No folder</option>
          {folders.map((folder) => (
            <option key={folder.id} value={folder.id}>
              {folder.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onDelete}
          aria-label="Move board to Trash"
          className="rounded p-1 text-text-muted transition-colors hover:bg-background-danger/10 hover:text-text-danger"
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
