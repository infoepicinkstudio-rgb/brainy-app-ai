"use client";

import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { formatRelativeTime } from "@/lib/format";
import { BoardRowMenu } from "@/components/boards/board-row-menu";
import type { FolderSummary } from "@/stores/folders-store";

export interface BoardSummary {
  id: string;
  title: string;
  folder_id: string | null;
  updated_at: string;
}

export type { FolderSummary };

// One Boards List row (Poppy.ai-inspired redesign — list rows, not a grid of cards).
// The whole row (icon, title, folder chip, timestamp) is one Link for the primary
// "open" action; the "⋮" overflow menu is a separate sibling so it never fights the
// Link for a click (same no-stopPropagation reasoning the previous card version used).
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
  const folderName = board.folder_id ? folders.find((f) => f.id === board.folder_id)?.name : undefined;

  return (
    <div className="group flex items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-background-muted">
      <Link href={`/brainboards/${board.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-background-accent-muted text-text-accent">
          <LayoutGrid className="size-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">{board.title}</span>
        {folderName ? (
          <span className="shrink-0 truncate rounded-full bg-background-muted px-2 py-0.5 text-xs font-medium text-text-secondary">
            {folderName}
          </span>
        ) : null}
        {/* "Updated", not "Opened" — the boards table (apps/server/src/db/schema.ts)
            only tracks updated_at, no dedicated last-opened column, so this is the
            honest claim rather than a tracking feature that doesn't exist yet. */}
        <span className="shrink-0 text-xs text-text-muted">Updated {formatRelativeTime(board.updated_at)}</span>
      </Link>
      <BoardRowMenu board={board} folders={folders} onRename={onRename} onMoveToFolder={onMoveToFolder} onDelete={onDelete} />
    </div>
  );
}
