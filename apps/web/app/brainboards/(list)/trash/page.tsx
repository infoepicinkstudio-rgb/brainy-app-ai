"use client";

// Trash view (TF-02, testing.md F-05) — soft-deleted boards, with Restore and
// permanent delete. Moved into the "(list)" route group so it shares the sidebar;
// the URL (/brainboards/trash) is unchanged. The old "Back to boards" link is
// removed here — the sidebar's "All Boards" nav item now does that same job, so
// keeping both would just be two links to the same place.
//
// Now reuses BoardCard (variant="trash") instead of its own separate, plainer inline
// markup (ADR-0084 — Istiyak: "Board tiles showing different in All board and how it
// looks in Trash is completely different"). Same icon avatar, folder chip and
// timestamp as the Boards List; BoardCard's trash variant swaps the action set to
// Restore/Delete-forever only and drops the stretched open-link, rename, move-to-
// folder and favorite — none of which make sense for an already-deleted board.

import * as React from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { BoardCard, type BoardSummary } from "@/components/boards/board-card";
import { useFoldersStore } from "@/stores/folders-store";
import { useBoardsRefreshStore } from "@/stores/boards-refresh-store";

export default function TrashPage() {
  const folders = useFoldersStore((state) => state.folders);
  const loadFolders = useFoldersStore((state) => state.loadFolders);
  const boardsRefreshToken = useBoardsRefreshStore((state) => state.token);

  const [boards, setBoards] = React.useState<BoardSummary[] | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [confirmDeleteBoard, setConfirmDeleteBoard] = React.useState<BoardSummary | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const [reloadToken, setReloadToken] = React.useState(0);
  const load = React.useCallback(() => setReloadToken((n) => n + 1), []);

  React.useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  // Same shape as the Boards List page's fetch effect — see the comment there for
  // why this isn't an extracted useCallback the effect just invokes. boardsRefreshToken:
  // a folder delete with the "delete its boards too" strategy (ADR-0082) can trash
  // boards from the sidebar while this page is the one mounted, so this needs to react
  // to that cross-component signal too, not just its own local reloadToken.
  React.useEffect(() => {
    let ignore = false;
    async function fetchTrashedBoards() {
      try {
        const { boards: b } = await api.get<{ boards: BoardSummary[] }>("/api/boards/trash");
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
    fetchTrashedBoards();
    return () => {
      ignore = true;
    };
  }, [reloadToken, boardsRefreshToken]);

  async function handleRestore(boardId: string) {
    setBoards((prev) => prev?.filter((b) => b.id !== boardId) ?? prev);
    await api.post(`/api/boards/${boardId}/restore`);
  }

  async function handlePermanentDelete() {
    if (!confirmDeleteBoard) return;
    setIsDeleting(true);
    try {
      await api.delete(`/api/boards/${confirmDeleteBoard.id}`);
      setBoards((prev) => prev?.filter((b) => b.id !== confirmDeleteBoard.id) ?? prev);
      setConfirmDeleteBoard(null);
    } finally {
      setIsDeleting(false);
    }
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

  return (
    <main className="flex flex-1 flex-col px-6 py-8">
      <div className="mx-auto w-full max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">Trash</h1>

        {boards.length === 0 ? (
          <p className="mt-8 text-sm text-text-secondary">Trash is empty.</p>
        ) : (
          <div className="mt-6 flex flex-col divide-y divide-border-muted rounded-lg border border-border-default bg-background-surface">
            {boards.map((board, index) => (
              <BoardCard
                key={board.id}
                board={board}
                folders={folders}
                variant="trash"
                roundedTop={index === 0}
                roundedBottom={index === boards.length - 1}
                onRestore={() => handleRestore(board.id)}
                onDeleteForever={() => setConfirmDeleteBoard(board)}
              />
            ))}
          </div>
        )}
      </div>

      <Dialog
        open={confirmDeleteBoard !== null}
        onOpenChange={(open) => !open && setConfirmDeleteBoard(null)}
        title="Delete this board permanently?"
        description={`"${confirmDeleteBoard?.title}" and everything on it will be gone for good — this can't be undone.`}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setConfirmDeleteBoard(null)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" disabled={isDeleting} onClick={handlePermanentDelete}>
              {isDeleting ? "Deleting…" : "Delete forever"}
            </Button>
          </>
        }
      >
        This removes the board and everything on it — nodes, connections, and chat history.
      </Dialog>
    </main>
  );
}
