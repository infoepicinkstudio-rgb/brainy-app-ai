"use client";

// Trash view (TF-02, testing.md F-05) — soft-deleted boards, with Restore and
// permanent delete. A separate route rather than a toggle on the main Boards List so
// the common case (browsing live boards) never has to filter deleted ones out.

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, RotateCcw, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import type { BoardSummary } from "@/components/boards/board-card";

export default function TrashPage() {
  const [boards, setBoards] = React.useState<BoardSummary[] | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [confirmDeleteBoard, setConfirmDeleteBoard] = React.useState<BoardSummary | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const [reloadToken, setReloadToken] = React.useState(0);
  const load = React.useCallback(() => setReloadToken((n) => n + 1), []);

  // Same shape as the Boards List page's fetch effect — see the comment there for
  // why this isn't an extracted useCallback the effect just invokes.
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
  }, [reloadToken]);

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
        <Link
          href="/brainboards/all"
          className="duration-fast inline-flex items-center gap-1.5 text-sm text-text-secondary transition-colors hover:text-text-primary"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Back to boards
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-text-primary">Trash</h1>

        {boards.length === 0 ? (
          <p className="mt-8 text-sm text-text-secondary">Trash is empty.</p>
        ) : (
          <div className="mt-6 divide-y divide-border-muted rounded-lg border border-border-muted">
            {boards.map((board) => (
              <div key={board.id} className="flex items-center justify-between px-4 py-3">
                <span className="truncate text-sm text-text-primary">{board.title}</span>
                <div className="flex items-center gap-1.5">
                  <Button variant="ghost" size="sm" onClick={() => handleRestore(board.id)}>
                    <RotateCcw className="size-3.5" aria-hidden="true" />
                    Restore
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteBoard(board)}>
                    <Trash2 className="size-3.5 text-text-danger" aria-hidden="true" />
                    Delete forever
                  </Button>
                </div>
              </div>
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
