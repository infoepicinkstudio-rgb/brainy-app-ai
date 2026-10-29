"use client";

// Boards List sidebar (Poppy.ai-inspired redesign, scoped to the (list) route group —
// see (list)/layout.tsx's comment for why it does NOT reach /brainboards/[id]).
// Deliberately excludes Poppy.ai's SaaS-business chrome this app has no equivalent
// for (Starred, Templates, Shared with me, credits, Refer & Earn, Hiring/Buy Stuff) —
// only "All Boards", "Trash", and "Folders" map to real Brainy.ai features.

import * as React from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  FolderPlus,
  LayoutGrid,
  type LucideIcon,
  Folder as FolderIcon,
  Pencil,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useFoldersStore, type FolderSummary } from "@/stores/folders-store";
import { useBoardsRefreshStore } from "@/stores/boards-refresh-store";
import { NamePromptDialog } from "@/components/boards/name-prompt-dialog";
import { FolderDeleteDialog } from "@/components/boards/folder-delete-dialog";

export function BoardsSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeFolderId = searchParams.get("folder");

  const folders = useFoldersStore((state) => state.folders);
  const loadFolders = useFoldersStore((state) => state.loadFolders);
  const createFolder = useFoldersStore((state) => state.createFolder);
  const renameFolder = useFoldersStore((state) => state.renameFolder);
  const deleteFolder = useFoldersStore((state) => state.deleteFolder);
  const requestBoardsRefresh = useBoardsRefreshStore((state) => state.requestRefresh);

  const [newFolderOpen, setNewFolderOpen] = React.useState(false);
  const [renamingFolder, setRenamingFolder] = React.useState<FolderSummary | null>(null);
  const [deletingFolder, setDeletingFolder] = React.useState<FolderSummary | null>(null);

  // Same shape as board-store.ts's loadBoard call in [id]/page.tsx — an external
  // store action invoked directly in the effect body, not wrapped in a local
  // useCallback the effect merely calls (that's the shape the project's lint config
  // flags as a cascading-render risk; this one is already an accepted precedent).
  React.useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  const isAllBoardsActive = pathname === "/brainboards/all" && !activeFolderId;
  const isTrashActive = pathname === "/brainboards/trash";

  async function handleDeleteFolder(action: "move" | "delete", targetFolderId: string | null) {
    if (!deletingFolder) return;
    const wasActive = activeFolderId === deletingFolder.id;
    await deleteFolder(deletingFolder.id, action, targetFolderId);
    // Both list pages' own fetch effects pick this up (boards-refresh-store.ts) — the
    // boards that were inside this folder just moved or got trashed, and neither page
    // owns the folder-delete action itself to refetch on its own.
    requestBoardsRefresh();
    // The folder that was just deleted can no longer be the active filter.
    if (wasActive) router.push("/brainboards/all");
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col gap-1 overflow-y-auto border-r border-border-muted bg-background-surface px-3 py-4">
      <SidebarLink href="/brainboards/all" icon={LayoutGrid} active={isAllBoardsActive}>
        All Boards
      </SidebarLink>
      <SidebarLink href="/brainboards/trash" icon={Trash2} active={isTrashActive}>
        Trash
      </SidebarLink>

      <div className="mt-6 flex items-center justify-between px-3">
        {/* Small-caps section-header treatment (Istiyak: "small capital label kind of
            design language") — standard sidebar section label, distinct from the nav
            links above it instead of reading like one more of them. */}
        <span className="text-xs font-semibold tracking-wide text-text-muted uppercase">Folders</span>
        <button
          type="button"
          onClick={() => setNewFolderOpen(true)}
          aria-label="New folder"
          title="New folder"
          className="cursor-pointer rounded-md p-1.5 text-text-muted transition-colors duration-150 hover:bg-background-accent-muted hover:text-text-accent"
        >
          <FolderPlus className="size-4" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-1 flex flex-col gap-1">
        {folders.length === 0 ? (
          // Round 2 #4 (empty-states polish) — was bare text with zero guidance. A
          // full icon-chip treatment (the Boards List/Trash pattern) is too heavy for
          // this 240px-wide sidebar section, so this is a compact dashed hint box
          // instead, pointing at the "+" button directly above it rather than
          // duplicating a second "create" affordance an inch away from the first.
          <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-border-default px-3 py-4 text-center">
            <FolderIcon className="size-4 text-text-muted" aria-hidden="true" />
            <p className="text-xs text-text-muted">No folders yet — use the + above to add one.</p>
          </div>
        ) : (
          folders.map((folder) => (
            <FolderRow
              key={folder.id}
              folder={folder}
              active={pathname === "/brainboards/all" && activeFolderId === folder.id}
              onRename={() => setRenamingFolder(folder)}
              onDelete={() => setDeletingFolder(folder)}
            />
          ))
        )}
      </div>

      <NamePromptDialog
        open={newFolderOpen}
        onOpenChange={setNewFolderOpen}
        title="New folder"
        label="Folder name"
        confirmLabel="Create"
        onConfirm={createFolder}
      />
      <NamePromptDialog
        open={renamingFolder !== null}
        onOpenChange={(open) => !open && setRenamingFolder(null)}
        title="Rename folder"
        label="Folder name"
        initialValue={renamingFolder?.name ?? ""}
        confirmLabel="Save"
        onConfirm={(name) => {
          if (renamingFolder) return renameFolder(renamingFolder.id, name);
        }}
      />
      <FolderDeleteDialog
        open={deletingFolder !== null}
        onOpenChange={(open) => !open && setDeletingFolder(null)}
        folder={deletingFolder}
        otherFolders={folders.filter((f) => f.id !== deletingFolder?.id)}
        onConfirm={handleDeleteFolder}
      />
    </aside>
  );
}

function SidebarLink({
  href,
  icon: Icon,
  active,
  children,
}: {
  href: string;
  icon: LucideIcon;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150",
        active
          ? "bg-background-accent-muted text-text-accent"
          : "text-text-secondary hover:bg-background-muted hover:text-text-primary"
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{children}</span>
    </Link>
  );
}

// Folder rename/delete didn't exist at all before this round (Istiyak: "Rename option
// not available. Delete option... not available"). A hover-reveal pencil/trash pair
// beside the link, rather than a full "⋮" dropdown like board-row-menu.tsx's, since a
// one-line sidebar item with exactly two actions doesn't need a whole menu's worth of
// chrome — this is the lighter of the two options the brief left open, chosen because
// it keeps every folder row's height and layout identical to "All Boards"/"Trash"
// above it.
function FolderRow({
  folder,
  active,
  onRename,
  onDelete,
}: {
  folder: FolderSummary;
  active: boolean;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group/row relative flex items-center">
      <Link
        href={`/brainboards/all?folder=${folder.id}`}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex flex-1 items-center gap-2.5 rounded-md py-2 pr-14 pl-3 text-sm font-medium transition-colors duration-150",
          active
            ? "bg-background-accent-muted text-text-accent"
            : "text-text-secondary hover:bg-background-muted hover:text-text-primary"
        )}
      >
        <FolderIcon className="size-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{folder.name}</span>
      </Link>
      <div className="absolute right-1 flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-focus-within/row:opacity-100 group-hover/row:opacity-100">
        <button
          type="button"
          onClick={onRename}
          aria-label={`Rename "${folder.name}"`}
          title="Rename folder"
          className="cursor-pointer rounded p-1 text-text-muted transition-colors duration-150 hover:bg-background-surface-raised hover:text-text-primary"
        >
          <Pencil className="size-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete "${folder.name}"`}
          title="Delete folder"
          className="cursor-pointer rounded p-1 text-text-muted transition-colors duration-150 hover:bg-background-danger-muted hover:text-text-danger"
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
