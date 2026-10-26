"use client";

// Consolidated per-row "⋮" overflow menu — replaces the three always-visible
// rename/move/delete icon buttons the old BoardCard rendered inline. Same
// click-outside + Escape-to-close shape as components/layout/profile-menu.tsx (the
// established pattern for this app's only other dropdown menu).
import * as React from "react";
import { Check, Folder, FolderX, type LucideIcon, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BoardSummary } from "@/components/boards/board-card";
import type { FolderSummary } from "@/stores/folders-store";

export function BoardRowMenu({
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
  const [isOpen, setIsOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!isOpen) return;
    function handlePointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Board actions"
        className="rounded-md p-1.5 text-text-muted transition-colors duration-150 hover:bg-background-surface-raised hover:text-text-primary"
      >
        <MoreVertical className="size-4" aria-hidden="true" />
      </button>

      {isOpen ? (
        <div
          role="menu"
          aria-label="Board actions"
          className={cn(
            // overflow-hidden (BUG-023): without it, the first/last item's square hover
            // rectangle pokes past this container's rounded corners on hover.
            "absolute top-full right-0 z-10 mt-1 w-56 overflow-hidden rounded-lg border border-border-default bg-background-surface-raised py-1 shadow-surface-raised",
            "motion-safe:duration-fast motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1"
          )}
        >
          <MenuButton
            icon={Pencil}
            onClick={() => {
              onRename();
              setIsOpen(false);
            }}
          >
            Rename
          </MenuButton>

          <div className="my-1 border-t border-border-muted" />
          <div className="px-3 py-1.5 text-xs font-medium text-text-muted">Move to folder</div>
          {/* Icon pairing fixed (ADR-0084, Istiyak: "No Folder icon looks weird"): this used to pair the unselected state with
              FolderInput ("move into a folder") on the "No folder" row too, which reads
              backwards for an option that means the opposite — removing a board from
              its folder. FolderX reads correctly for that one row; every real folder
              below uses the plain Folder icon, matching the one the sidebar itself
              already uses consistently, instead of a second, busier icon. */}
          <MenuButton
            icon={board.folder_id === null ? Check : FolderX}
            onClick={() => {
              onMoveToFolder(null);
              setIsOpen(false);
            }}
          >
            No folder
          </MenuButton>
          {folders.map((folder) => (
            <MenuButton
              key={folder.id}
              icon={board.folder_id === folder.id ? Check : Folder}
              onClick={() => {
                onMoveToFolder(folder.id);
                setIsOpen(false);
              }}
            >
              {folder.name}
            </MenuButton>
          ))}

          <div className="my-1 border-t border-border-muted" />
          <MenuButton
            danger
            icon={Trash2}
            onClick={() => {
              onDelete();
              setIsOpen(false);
            }}
          >
            Move to Trash
          </MenuButton>
        </div>
      ) : null}
    </div>
  );
}

function MenuButton({
  icon: Icon,
  danger,
  onClick,
  children,
}: {
  icon: LucideIcon;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors duration-150 hover:bg-background-muted",
        danger ? "text-text-danger hover:bg-background-danger/10" : "text-text-primary"
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{children}</span>
    </button>
  );
}
