"use client";

import Link from "next/link";
import { Folder as FolderIcon, LayoutGrid, RotateCcw, Star, Trash2 } from "lucide-react";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BoardRowMenu } from "@/components/boards/board-row-menu";
import type { FolderSummary } from "@/stores/folders-store";

export interface BoardSummary {
  id: string;
  title: string;
  folder_id: string | null;
  is_favorite: boolean;
  updated_at: string;
}

export type { FolderSummary };

// One Boards List row (Poppy.ai-inspired redesign — list rows, not a grid of cards).
// A single "stretched link" (the absolutely-positioned <Link>, ADR-0084) covers the
// entire row's clickable surface edge-to-edge, including its own padding gutters —
// fixes BUG-024, where the row's hover background highlighted the full width but only
// its middle actually showed a pointer cursor, because the old visible <Link> only
// wrapped the icon+title+chip+timestamp cluster, not the row's padding.
//
// Only the favorite star and "⋮" menu get `relative` to paint above the stretched
// link (BUG-026 fix) — those are the only two children with their own onClick that
// must stay independently clickable. Every other child (icon, title/chip, timestamp)
// is left unpositioned on purpose: a plain static element always paints *behind* a
// positioned one regardless of DOM order, so leaving them unpositioned is what lets
// the Link underneath actually receive the hover/click across the title and
// timestamp — giving them `relative` too (as an earlier pass did) promoted them into
// the Link's own stacking layer and, being later in DOM order, silently sat on top of
// it, reintroducing BUG-024's mismatch in reverse (hover/click worked only in the
// gaps the Link wasn't covered in, not over the title itself).
//
// `variant="trash"` reuses this same visual shell for the Trash page (BUG-022,
// Istiyak: Trash "showing different in All board and how it looks in Trash is
// completely different") instead of Trash keeping its own plainer, separate markup —
// it swaps the action set to Restore/Delete-forever only and drops rename/move-to-
// folder/favorite, none of which make sense for an already-deleted board.
export function BoardCard({
  board,
  folders,
  variant = "default",
  roundedTop,
  roundedBottom,
  onRename,
  onMoveToFolder,
  onDelete,
  onToggleFavorite,
  onRestore,
  onDeleteForever,
}: {
  board: BoardSummary;
  folders: FolderSummary[];
  variant?: "default" | "trash";
  // Rounds this row's own top/bottom corners to match the list container's rounded-lg
  // shell (BUG-027, Istiyak: "3 dots menu also got clipped inside"). The container used
  // to get `overflow-hidden` instead so a full-width hover rectangle couldn't poke past
  // its corners, but that also clipped BoardRowMenu's dropdown, which intentionally
  // overflows past its row. Rounding only the first/last row itself keeps the hover
  // rectangle flush with the container's corners without clipping anything that needs
  // to escape a row's bounds.
  roundedTop?: boolean;
  roundedBottom?: boolean;
  onRename?: () => void;
  onMoveToFolder?: (folderId: string | null) => void;
  onDelete?: () => void;
  onToggleFavorite?: () => void;
  onRestore?: () => void;
  onDeleteForever?: () => void;
}) {
  const folderName = board.folder_id ? folders.find((f) => f.id === board.folder_id)?.name : undefined;
  const isTrash = variant === "trash";

  return (
    <div
      className={cn(
        "group relative flex items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-background-muted",
        roundedTop && "rounded-t-lg",
        roundedBottom && "rounded-b-lg"
      )}
    >
      {/* A deleted board has no live canvas route to open, so Trash rows simply don't
          get a stretched link at all rather than one that looks clickable and silently
          no-ops — Restore is the only way back to it. */}
      {!isTrash ? (
        <Link href={`/brainboards/${board.id}`} className="absolute inset-0" aria-label={`Open ${board.title}`} />
      ) : null}

      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-background-accent-muted text-text-accent">
        <LayoutGrid className="size-4" aria-hidden="true" />
      </span>

      {/* Title on its own line, folder label directly below it rather than sharing the
          title's row — the "folder indication isn't properly indicated" complaint was
          first fixed with a filled chip, but that read as too heavy next to the plain
          title (Istiyak: "don't put it like a chip, keep it minimally properly aligned
          below board name"). Plain icon + text, same treatment as the "Updated" text on
          the right, just dropped a weight: no fill/pill, mt-1 for clear breathing room
          off the title above it. Deliberately not `relative` (BUG-026) — see the
          file-level comment above. */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text-primary">{board.title}</p>
        {folderName ? (
          <p className="mt-1 flex max-w-full items-center gap-1 truncate text-xs text-text-muted">
            <FolderIcon className="size-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{folderName}</span>
          </p>
        ) : null}
      </div>

      {/* "Updated", not "Opened" — the boards table only tracks updated_at, no
          dedicated last-opened column, so this is the honest claim rather than a
          tracking feature that doesn't exist yet. */}
      <span className="shrink-0 text-xs text-text-muted">Updated {formatRelativeTime(board.updated_at)}</span>

      {!isTrash && onToggleFavorite ? (
        <button
          type="button"
          onClick={onToggleFavorite}
          aria-pressed={board.is_favorite}
          aria-label={board.is_favorite ? "Remove from favorites" : "Add to favorites"}
          className={cn(
            "relative shrink-0 cursor-pointer rounded-md p-1.5 transition-colors duration-150",
            board.is_favorite
              ? "text-text-warning hover:text-text-warning/80"
              : "text-text-muted hover:bg-background-surface-raised hover:text-text-warning"
          )}
        >
          <Star className={cn("size-4", board.is_favorite && "fill-current")} aria-hidden="true" />
        </button>
      ) : null}

      {isTrash ? (
        <div className="relative flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onRestore}
            className="flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors duration-150 hover:bg-background-surface-raised hover:text-text-primary"
          >
            <RotateCcw className="size-3.5" aria-hidden="true" />
            Restore
          </button>
          <button
            type="button"
            onClick={onDeleteForever}
            className="flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-text-danger transition-colors duration-150 hover:bg-background-danger-muted"
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
            Delete forever
          </button>
        </div>
      ) : (
        <div className="relative shrink-0">
          <BoardRowMenu
            board={board}
            folders={folders}
            onRename={onRename ?? (() => {})}
            onMoveToFolder={onMoveToFolder ?? (() => {})}
            onDelete={onDelete ?? (() => {})}
          />
        </div>
      )}
    </div>
  );
}
