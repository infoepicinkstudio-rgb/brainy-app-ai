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

interface FoldersState {
  folders: FolderSummary[];
  loaded: boolean;
  loadError: string | null;
  loadFolders: () => Promise<void>;
  createFolder: (name: string) => Promise<void>;
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
}));
