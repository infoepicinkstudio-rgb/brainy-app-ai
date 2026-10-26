"use client";

// Boards List sidebar (Poppy.ai-inspired redesign, scoped to the (list) route group —
// see (list)/layout.tsx's comment for why it does NOT reach /brainboards/[id]).
// Deliberately excludes Poppy.ai's SaaS-business chrome this app has no equivalent
// for (Starred, Templates, Shared with me, credits, Refer & Earn, Hiring/Buy Stuff) —
// only "All Boards", "Trash", and "Folders" map to real Brainy.ai features.

import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { FolderPlus, LayoutGrid, type LucideIcon, Folder as FolderIcon, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFoldersStore } from "@/stores/folders-store";
import { NamePromptDialog } from "@/components/boards/name-prompt-dialog";

export function BoardsSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeFolderId = searchParams.get("folder");

  const folders = useFoldersStore((state) => state.folders);
  const loadFolders = useFoldersStore((state) => state.loadFolders);
  const createFolder = useFoldersStore((state) => state.createFolder);
  const [newFolderOpen, setNewFolderOpen] = React.useState(false);

  // Same shape as board-store.ts's loadBoard call in [id]/page.tsx — an external
  // store action invoked directly in the effect body, not wrapped in a local
  // useCallback the effect merely calls (that's the shape the project's lint config
  // flags as a cascading-render risk; this one is already an accepted precedent).
  React.useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  const isAllBoardsActive = pathname === "/brainboards/all" && !activeFolderId;
  const isTrashActive = pathname === "/brainboards/trash";

  return (
    <aside className="flex w-60 shrink-0 flex-col gap-1 overflow-y-auto border-r border-border-muted bg-background-surface px-3 py-4">
      <SidebarLink href="/brainboards/all" icon={LayoutGrid} active={isAllBoardsActive}>
        All Boards
      </SidebarLink>
      <SidebarLink href="/brainboards/trash" icon={Trash2} active={isTrashActive}>
        Trash
      </SidebarLink>

      <div className="mt-6 flex items-center justify-between px-3">
        <span className="text-sm font-medium text-text-secondary">Folders</span>
        <button
          type="button"
          onClick={() => setNewFolderOpen(true)}
          aria-label="New folder"
          className="rounded p-1 text-text-muted transition-colors duration-150 hover:bg-background-muted hover:text-text-primary"
        >
          <FolderPlus className="size-3.5" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-1 flex flex-col gap-1">
        {folders.length === 0 ? (
          <p className="px-3 py-1 text-sm text-text-muted">No folders yet.</p>
        ) : (
          folders.map((folder) => (
            <SidebarLink
              key={folder.id}
              href={`/brainboards/all?folder=${folder.id}`}
              icon={FolderIcon}
              active={pathname === "/brainboards/all" && activeFolderId === folder.id}
            >
              {folder.name}
            </SidebarLink>
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
