"use client";

// TF-02 — Boards List (implementation_plan.md Phase 2 step 2). The Phase 1 placeholder
// that lived at this path is fully replaced now that the real thing exists.

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, FolderPlus, Trash2, LayoutGrid } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { BoardCard, type BoardSummary, type FolderSummary } from "@/components/boards/board-card";
import { NamePromptDialog } from "@/components/boards/name-prompt-dialog";

export default function BoardsListPage() {
  const router = useRouter();
  const [boards, setBoards] = React.useState<BoardSummary[] | null>(null);
  const [folders, setFolders] = React.useState<FolderSummary[]>([]);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const [newBoardOpen, setNewBoardOpen] = React.useState(false);
  const [newFolderOpen, setNewFolderOpen] = React.useState(false);
  const [renamingBoard, setRenamingBoard] = React.useState<BoardSummary | null>(null);

  const [reloadToken, setReloadToken] = React.useState(0);
  const load = React.useCallback(() => setReloadToken((n) => n + 1), []);

  // Fetch-on-mount (and on-demand via `load`) done the react.dev way — the fetch
  // and its setState calls happen inside a function defined and invoked directly
  // in the effect body, not via an extracted useCallback the effect just invokes.
  // The latter is what the project's lint config (react-hooks's set-state-in-effect
  // rule) flags as a cascading-render risk; this shape is the one it accepts.
  React.useEffect(() => {
    let ignore = false;
    async function fetchBoardsAndFolders() {
      try {
        const [{ boards: b }, { folders: f }] = await Promise.all([
          api.get<{ boards: BoardSummary[] }>("/api/boards"),
          api.get<{ folders: FolderSummary[] }>("/api/folders"),
        ]);
        if (!ignore) {
          setBoards(b);
          setFolders(f);
          setLoadError(null);
        }
      } catch {
        if (!ignore) {
          setLoadError("Can't reach the Brainy.ai backend. Check that the server is running.");
        }
      }
    }
    fetchBoardsAndFolders();
    return () => {
      ignore = true;
    };
  }, [reloadToken]);

  async function handleCreateBoard(title: string) {
    const { board } = await api.post<{ board: BoardSummary }>("/api/boards", { title });
    router.push(`/brainboards/${board.id}`);
  }

  async function handleCreateFolder(name: string) {
    await api.post("/api/folders", { name });
    await load();
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

  async function handleDeleteBoard(boardId: string) {
    setBoards((prev) => prev?.filter((b) => b.id !== boardId) ?? prev);
    await api.post(`/api/boards/${boardId}/trash`);
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

  const unfiledBoards = boards.filter((b) => !b.folder_id);
  const boardsByFolder = new Map<string, BoardSummary[]>();
  for (const board of boards) {
    if (!board.folder_id) continue;
    const list = boardsByFolder.get(board.folder_id) ?? [];
    list.push(board);
    boardsByFolder.set(board.folder_id, list);
  }

  return (
    <main className="flex flex-1 flex-col px-6 py-8">
      <div className="mx-auto w-full max-w-5xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">Your boards</h1>
          <div className="flex items-center gap-2">
            <Link
              href="/brainboards/trash"
              className="duration-fast flex items-center gap-1.5 text-sm text-text-secondary transition-colors hover:text-text-primary"
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              Trash
            </Link>
            <Button variant="secondary" size="sm" onClick={() => setNewFolderOpen(true)}>
              <FolderPlus className="size-3.5" aria-hidden="true" />
              New folder
            </Button>
            <Button size="sm" onClick={() => setNewBoardOpen(true)}>
              <Plus className="size-3.5" aria-hidden="true" />
              New board
            </Button>
          </div>
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
            </Button>
          </div>
        ) : (
          <div className="mt-6 space-y-8">
            {folders.map((folder) => {
              const folderBoards = boardsByFolder.get(folder.id) ?? [];
              if (folderBoards.length === 0) return null;
              return (
                <section key={folder.id}>
                  <h2 className="mb-3 text-sm font-medium text-text-secondary">{folder.name}</h2>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {folderBoards.map((board) => (
                      <BoardCard
                        key={board.id}
                        board={board}
                        folders={folders}
                        onRename={() => setRenamingBoard(board)}
                        onMoveToFolder={(folderId) => handleMoveToFolder(board.id, folderId)}
                        onDelete={() => handleDeleteBoard(board.id)}
                      />
                    ))}
                  </div>
                </section>
              );
            })}

            {unfiledBoards.length > 0 ? (
              <section>
                {folders.length > 0 ? <h2 className="mb-3 text-sm font-medium text-text-secondary">No folder</h2> : null}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {unfiledBoards.map((board) => (
                    <BoardCard
                      key={board.id}
                      board={board}
                      folders={folders}
                      onRename={() => setRenamingBoard(board)}
                      onMoveToFolder={(folderId) => handleMoveToFolder(board.id, folderId)}
                      onDelete={() => handleDeleteBoard(board.id)}
                    />
                  ))}
                </div>
              </section>
            ) : null}
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
        open={newFolderOpen}
        onOpenChange={setNewFolderOpen}
        title="New folder"
        label="Folder name"
        confirmLabel="Create"
        onConfirm={handleCreateFolder}
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
