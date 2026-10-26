// Tiny cross-component "please refetch your boards list" signal (ADR-0082). The
// Boards List sidebar can now change what boards look like from outside whichever
// page happens to be mounted — deleting a folder moves or trashes every board inside
// it — but the sidebar lives in (list)/layout.tsx while the boards list itself is
// local state in (list)/all/page.tsx or (list)/trash/page.tsx, and Next's App Router
// gives a route-group layout and its sibling page no direct prop channel for that.
// Lifting the full boards array into a shared store (the same shape as folders-store.ts)
// would be a much bigger change than this narrow need calls for, so this is just a
// bumped counter the already-existing fetch effect on each list page can add to its
// dependency array, exactly like the `reloadToken` state those effects already use for
// their own local "please refetch" case.
import { create } from "zustand";

interface BoardsRefreshState {
  token: number;
  requestRefresh: () => void;
}

export const useBoardsRefreshStore = create<BoardsRefreshState>((set) => ({
  token: 0,
  requestRefresh: () => set((state) => ({ token: state.token + 1 })),
}));
