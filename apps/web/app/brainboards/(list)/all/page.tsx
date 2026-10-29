"use client";

// TF-02 — Boards List (implementation_plan.md Phase 2 step 2; sidebar/list-row
// redesign per Istiyak's Poppy.ai-reference request). Moved into the "(list)" route
// group so it shares (list)/layout.tsx's sidebar — the URL is unchanged.

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, LayoutGrid, Folder } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { BoardCard, type BoardSummary } from "@/components/boards/board-card";
import { NamePromptDialog } from "@/components/boards/name-prompt-dialog";
import { useFoldersStore } from "@/stores/folders-store";
import { useBoardsRefreshStore } from "@/stores/boards-refresh-store";

// Round 2 #2, 3rd pass (Istiyak: "Can't able to see any Keyboard shortcut across the
// App. It should be Visually available on the actions on Frontend uI. i.e. New Board
// {Ctrl+N}") — a hover tooltip or a dialog buried behind the profile menu doesn't
// satisfy "visually available on the action": this renders the shortcut key directly
// ON the button, always visible, not revealed on hover/interaction the way the
// group-card pills (group-node.tsx) are. Inverted-contrast badge (translucent white
// on the button's own solid accent fill), matching the same light-badge-on-dark-fill
// idea those pills use, just adapted to this button's `variant="primary"` background
// instead of the group header's dark neutral fill.
function NewBoardShortcutBadge() {
  return (
    <kbd className="rounded border border-white/30 bg-white/10 px-1 py-px text-[10px] font-semibold leading-none text-text-on-accent">
      Ctrl+N
    </kbd>
  );
}

export default function BoardsListPage() {
  // useSearchParams() (for the active ?folder= filter) needs a Suspense boundary
  // under next.config.ts's cacheComponents option — same shape as [id]/page.tsx's
  // useParams() Suspense wrapper.
  return (
    <React.Suspense fallback={<main className="flex flex-1" aria-busy="true" />}>
      <BoardsListContent />
    </React.Suspense>
  );
}

function BoardsListContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeFolderId = searchParams.get("folder");

  const folders = useFoldersStore((state) => state.folders);
  const loadFolders = useFoldersStore((state) => state.loadFolders);
  const boardsRefreshToken = useBoardsRefreshStore((state) => state.token);

  const [boards, setBoards] = React.useState<BoardSummary[] | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const [newBoardOpen, setNewBoardOpen] = React.useState(false);
  const [renamingBoard, setRenamingBoard] = React.useState<BoardSummary | null>(null);

  const [reloadToken, setReloadToken] = React.useState(0);
  const load = React.useCallback(() => setReloadToken((n) => n + 1), []);

  React.useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  // Round 2 #2 (Istiyak: "Shortcut to create new board") — Ctrl+N opens the same "New
  // board" dialog as the button above, guarded against an active text field exactly
  // like page.tsx's own canvas-shortcut handler. NOTE (flagged, not silently assumed
  // working): Ctrl+N specifically is a browser-RESERVED shortcut in Chrome/Firefox/
  // Edge ("open a new window") that `event.preventDefault()` cannot reliably block —
  // unlike most other combos this app binds. Istiyak was offered Ctrl+Shift+N (which
  // doesn't have this collision) as the alternative and chose Ctrl+N anyway, so this
  // ships as asked — but if it doesn't actually fire on his machine/browser, that's
  // this known browser limitation, not a bug in this handler, and Ctrl+Shift+N is the
  // one-line fallback.
  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const active = document.activeElement;
      const isEditingSomething =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLElement && active.isContentEditable);
      if (isEditingSomething) return;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "n") {
        event.preventDefault();
        setNewBoardOpen(true);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Fetch-on-mount (and on-demand via `load`) done the react.dev way — see the
  // original comment this carries forward: the fetch and its setState calls happen
  // inside a function defined and invoked directly in the effect body, which is the
  // shape the project's lint config (react-hooks's set-state-in-effect rule) accepts.
  React.useEffect(() => {
    let ignore = false;
    async function fetchBoards() {
      try {
        const { boards: b } = await api.get<{ boards: BoardSummary[] }>("/api/boards");
        if (!ignore) {
          setBoards(b);
          setLoadError(null);
        }
      } catch {
        if (!ignore) {
          setLoadError("Can't reach the Brainy.ai backend. Check that the server is running.");
        }
      }
    }
    fetchBoards();
    return () => {
      ignore = true;
    };
    // boardsRefreshToken: a folder delete in the sidebar (move-or-trash its boards,
    // boards-refresh-store.ts) happens outside this page's own state entirely, so this
    // effect needs to re-run on that signal too, not just this page's local reloadToken.
  }, [reloadToken, boardsRefreshToken]);

  async function handleCreateBoard(title: string) {
    const { board } = await api.post<{ board: BoardSummary }>("/api/boards", {
      title,
      folder_id: activeFolderId ?? null,
    });
    router.push(`/brainboards/${board.id}`);
  }

  async function handleRenameBoard(title: string) {
    if (!renamingBoard) return;
    await api.patch(`/api/boards/${renamingBoard.id}`, { title });
    await load();
  }

  async function handleMoveToFolder(boardId: string, folderId: string | null) {
    setBoards((prev) => prev?.map((b) => (b.id === boardId ? { ...b, folder_id: folderId } : b)) ?? prev);
    await api.patch(`/api/boards/${boardId}`, { folder_id: folderId });
  }

  // Phase 3, F-07: "duplicate an entire board." The server does the actual
  // copy-everything-under-new-ids work in one route (boards.ts) — this just calls it
  // and drops the result straight into local state (same `setBoards` pattern as every
  // other optimistic action on this page) rather than a full `load()` refetch.
  async function handleDuplicateBoard(boardId: string) {
    const { board: created } = await api.post<{ board: BoardSummary }>(`/api/boards/${boardId}/duplicate`);
    setBoards((prev) => (prev ? [created, ...prev] : [created]));
  }

  async function handleDeleteBoard(boardId: string) {
    setBoards((prev) => prev?.filter((b) => b.id !== boardId) ?? prev);
    await api.post(`/api/boards/${boardId}/trash`);
  }

  async function handleToggleFavorite(boardId: string, nextValue: boolean) {
    setBoards((prev) => prev?.map((b) => (b.id === boardId ? { ...b, is_favorite: nextValue } : b)) ?? prev);
    await api.patch(`/api/boards/${boardId}`, { is_favorite: nextValue });
  }

  if (loadError) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-sm text-text-danger">{loadError}</p>
        <Button variant="secondary" size="sm" onClick={load}>
          Try again
        </Button>
      </main>
    );
  }

  if (!boards) {
    return <main className="flex flex-1" aria-busy="true" />;
  }

  const activeFolder = activeFolderId ? folders.find((f) => f.id === activeFolderId) : undefined;
  // Flat list, newest-updated first — folder navigation now lives entirely in the
  // sidebar (clicking a folder there sets ?folder=, "All Boards" clears it), so this
  // page no longer stacks every folder's boards into its own section.
  const visibleBoards = [...boards]
    .filter((b) => (activeFolderId ? b.folder_id === activeFolderId : true))
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  return (
    <main className="flex flex-1 flex-col px-6 py-8">
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex items-center justify-between">
          <div>
            {/* The old "Show all boards" button here duplicated the sidebar's own "All
                Boards" nav link one click away — same redundancy trash/page.tsx's
                comment already called out for its old "Back to boards" link, and the
                same fix applies: remove it rather than polish an interaction that
                doesn't need to exist (Istiyak: "I think we don't need it"). */}
            <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
              {activeFolder ? activeFolder.name : "Your boards"}
            </h1>
          </div>
          <Button size="sm" onClick={() => setNewBoardOpen(true)}>
            <Plus className="size-3.5" aria-hidden="true" />
            New board
            <NewBoardShortcutBadge />
          </Button>
        </div>

        {boards.length === 0 ? (
          <div className="mt-16 flex flex-col items-center gap-3 text-center">
            <span className="flex size-12 items-center justify-center rounded-xl bg-background-accent-muted text-text-accent">
              <LayoutGrid className="size-6" aria-hidden="true" />
            </span>
            <p className="text-sm text-text-secondary">
              No boards yet — create your first one to start dropping research onto a canvas.
            </p>
            <Button size="sm" onClick={() => setNewBoardOpen(true)}>
              <Plus className="size-3.5" aria-hidden="true" />
              New board
              <NewBoardShortcutBadge />
            </Button>
          </div>
        ) : visibleBoards.length === 0 ? (
          // Round 2 #4 (empty-states polish) — was bare text; same icon-chip pattern as
          // the top-level empty state above, Folder-themed since this is specifically
          // an empty FOLDER (not "no boards at all"). Wording left exactly as it was —
          // this pass is the visual treatment, not a rewrite of what it says.
          <div className="mt-16 flex flex-col items-center gap-3 text-center">
            <span className="flex size-12 items-center justify-center rounded-xl bg-background-muted text-text-muted">
              <Folder className="size-6" aria-hidden="true" />
            </span>
            <p className="text-sm text-text-secondary">
              No boards here yet — use a board&apos;s &quot;⋮&quot; menu to move one into this folder.
            </p>
          </div>
        ) : (
          <div className="mt-6 flex flex-col divide-y divide-border-muted rounded-lg border border-border-default bg-background-surface">
            {visibleBoards.map((board, index) => (
              <BoardCard
                key={board.id}
                board={board}
                folders={folders}
                roundedTop={index === 0}
                roundedBottom={index === visibleBoards.length - 1}
                onRename={() => setRenamingBoard(board)}
                onDuplicate={() => handleDuplicateBoard(board.id)}
                onMoveToFolder={(folderId) => handleMoveToFolder(board.id, folderId)}
                onDelete={() => handleDeleteBoard(board.id)}
                onToggleFavorite={() => handleToggleFavorite(board.id, !board.is_favorite)}
              />
            ))}
          </div>
        )}
      </div>

      <NamePromptDialog
        open={newBoardOpen}
        onOpenChange={setNewBoardOpen}
        title="New board"
        label="Board name"
        confirmLabel="Create"
        onConfirm={handleCreateBoard}
      />
      <NamePromptDialog
        open={renamingBoard !== null}
        onOpenChange={(open) => !open && setRenamingBoard(null)}
        title="Rename board"
        label="Board name"
        initialValue={renamingBoard?.title ?? ""}
        confirmLabel="Save"
        onConfirm={handleRenameBoard}
      />
    </main>
  );
}
