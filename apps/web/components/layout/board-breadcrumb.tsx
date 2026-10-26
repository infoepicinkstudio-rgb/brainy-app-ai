"use client";

// Top Nav / Breadcrumb pass (Istiyak): once inside a board, the global Navbar's left
// slot swaps the "Brainy.ai" wordmark for this breadcrumb instead — repeating the brand
// name in both the global bar and the canvas's own CanvasShell sub-header (its "←
// Boards"/title row, apps/web/app/brainboards/[id]/page.tsx) read as redundant, and the
// board already gets its own identity here. CanvasShell's own toolbar is untouched —
// nothing in the brief asked for removing it, and it's the node-creation controls'
// home, not just a second breadcrumb.
//
// Trail (Istiyak, round 7: "breadcrumb is wrongly shows 'Boards | Board Name' but
// actually should show 'Folder Name | boards | board name'"): folder segment (only if
// the board is actually inside one) -> "Boards" as real clickable text, not just an
// icon (links to the Boards List) -> board name (last segment — not a navigation link,
// since it's "where you already are"; instead it's the inline-rename target). The
// previous version led with an icon-only Home link and put the folder segment AFTER
// it; both the ordering (folder first) and the icon-vs-text choice for the "Boards"
// crumb change here, per Istiyak's literal wording above.
import * as React from "react";
import Link from "next/link";
import { ChevronRight, Pencil } from "lucide-react";
import { useBoardStore } from "@/stores/board-store";
import { useFoldersStore } from "@/stores/folders-store";
import { cn } from "@/lib/utils";

const CRUMB_LINK_CLASSNAME =
  "flex items-center gap-1 rounded-md px-1 py-0.5 text-sm text-text-secondary transition-colors duration-150 hover:text-text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus";

export function BoardBreadcrumb() {
  const boardTitle = useBoardStore((state) => state.boardTitle);
  const boardFolderId = useBoardStore((state) => state.boardFolderId);
  const renameBoard = useBoardStore((state) => state.renameBoard);
  const folders = useFoldersStore((state) => state.folders);
  const loadFolders = useFoldersStore((state) => state.loadFolders);
  const foldersLoaded = useFoldersStore((state) => state.loaded);

  // The Boards List page also calls this, but a board can be opened directly (a
  // bookmark, a fresh tab) without ever visiting it first — this store is the only
  // thing that knows the folder's NAME (board-store only has its id), so the
  // breadcrumb needs its own load, guarded by the store's own `loaded` flag so two
  // mounted consumers don't double-fetch.
  React.useEffect(() => {
    if (!foldersLoaded) loadFolders();
  }, [foldersLoaded, loadFolders]);

  const folderName = boardFolderId ? folders.find((f) => f.id === boardFolderId)?.name : undefined;

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1">
      {folderName ? (
        <>
          <Link
            href={`/brainboards/all?folder=${boardFolderId}`}
            className={cn(CRUMB_LINK_CLASSNAME, "max-w-40 truncate")}
          >
            {folderName}
          </Link>
          <ChevronRight className="size-3.5 shrink-0 text-text-muted" aria-hidden="true" />
        </>
      ) : null}

      <Link href="/brainboards/all" className={CRUMB_LINK_CLASSNAME}>
        Boards
      </Link>

      <ChevronRight className="size-3.5 shrink-0 text-text-muted" aria-hidden="true" />

      <BoardNameCrumb title={boardTitle ?? ""} onRename={renameBoard} />
    </nav>
  );
}

function BoardNameCrumb({ title, onRename }: { title: string; onRename: (title: string) => Promise<void> }) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [value, setValue] = React.useState(title);
  const [isSaving, setIsSaving] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Keep the field in sync with the real title whenever it changes elsewhere (e.g. a
  // revert after a failed rename) and we're not mid-edit — computed during render per
  // the same "state derived from a changing prop/value" pattern name-prompt-dialog.tsx
  // already uses, not an effect.
  const [prevTitle, setPrevTitle] = React.useState(title);
  if (title !== prevTitle) {
    setPrevTitle(title);
    if (!isEditing) setValue(title);
  }

  function startEditing() {
    setValue(title);
    setIsEditing(true);
  }

  async function commit() {
    const trimmed = value.trim();
    setIsEditing(false);
    if (!trimmed || trimmed === title) {
      setValue(title);
      return;
    }
    setIsSaving(true);
    try {
      await onRename(trimmed);
    } finally {
      setIsSaving(false);
    }
  }

  React.useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            setValue(title);
            setIsEditing(false);
          }
        }}
        aria-label="Board name"
        className="max-w-56 min-w-0 rounded-md border border-border-focus bg-background-surface px-1.5 py-0.5 text-sm font-medium text-text-primary focus-visible:outline-none"
      />
    );
  }

  // A <button> can't validly contain another interactive element (the pencil button),
  // so the double-click target is a plain div, not a button — the pencil is the only
  // real <button> here, each independently reachable/clickable.
  return (
    <div
      onDoubleClick={isSaving ? undefined : startEditing}
      title="Double-click to rename"
      className={cn(
        "group/crumb flex min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 transition-colors duration-150 hover:bg-background-muted",
        isSaving && "opacity-60"
      )}
    >
      <span className="min-w-0 truncate text-sm font-medium text-text-primary">
        {isSaving ? "Saving…" : title}
      </span>
      <button
        type="button"
        aria-label="Rename board"
        disabled={isSaving}
        onClick={startEditing}
        className="shrink-0 rounded p-0.5 text-text-muted opacity-0 transition-opacity duration-150 group-hover/crumb:opacity-100 hover:text-text-accent focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:outline-none"
      >
        <Pencil className="size-3" aria-hidden="true" />
      </button>
    </div>
  );
}
