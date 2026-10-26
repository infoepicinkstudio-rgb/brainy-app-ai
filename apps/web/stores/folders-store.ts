// Shared folders state (sidebar redesign). Previously `all/page.tsx` fetched its own
// folders list locally; now the sidebar (Folders nav section) and the Boards List page
// (grouping + each row's "Move to folder" menu) both need the SAME live list — e.g.
// creating a folder from the sidebar's "+" must be visible to the list page without a
// full reload. A tiny Zustand store (same pattern as board-store.ts) is the natural
// fix: one fetch, shared state, no prop-drilling between a route-group layout and its
// sibling page (Next's App Router gives layout/page no direct prop channel for that).
import { create } from "zustand";
import { api } from "@/lib/api";

export interface FolderSummary {
  id: string;
  name: string;
}

// Folder-delete strategy (ADR-0082): "move" reassigns the folder's boards to another
// folder (or null = top level); "delete" sends them all to Trash instead. Mirrors the
// backend's DeleteFolderBody shape in apps/server/src/routes/boards.ts.
export type FolderDeleteAction = "move" | "delete";

interface FoldersState {
  folders: FolderSummary[];
  loaded: boolean;
  loadError: string | null;
  loadFolders: () => Promise<void>;
  createFolder: (name: string) => Promise<void>;
  renameFolder: (id: string, name: string) => Promise<void>;
  deleteFolder: (id: string, action: FolderDeleteAction, targetFolderId?: string | null) => Promise<void>;
}

export const useFoldersStore = create<FoldersState>((set) => ({
  folders: [],
  loaded: false,
  loadError: null,

  loadFolders: async () => {
    try {
      const { folders } = await api.get<{ folders: FolderSummary[] }>("/api/folders");
      set({ folders, loaded: true, loadError: null });
    } catch {
      set({ loaded: true, loadError: "Can't reach the Brainy.ai backend. Check that the server is running." });
    }
  },

  createFolder: async (name: string) => {
    const { folder } = await api.post<{ folder: FolderSummary }>("/api/folders", { name });
    set((state) => ({ folders: [...state.folders, folder] }));
  },

  renameFolder: async (id: string, name: string) => {
    const { folder } = await api.patch<{ folder: FolderSummary }>(`/api/folders/${id}`, { name });
    set((state) => ({ folders: state.folders.map((f) => (f.id === id ? folder : f)) }));
  },

  // Boards affected by the chosen strategy (moved or trashed) aren't this store's
  // concern — it only owns the folders list. Callers that also show a boards list
  // (Boards List / Trash pages) bump useBoardsRefreshStore separately so their own
  // fetch effect re-runs; see boards-refresh-store.ts for why that's a tiny dedicated
  // store rather than lifting the whole boards list in here too.
  deleteFolder: async (id: string, action: FolderDeleteAction, targetFolderId?: string | null) => {
    await api.delete(`/api/folders/${id}`, { action, target_folder_id: targetFolderId ?? null });
    set((state) => ({ folders: state.folders.filter((f) => f.id !== id) }));
  },
}));
