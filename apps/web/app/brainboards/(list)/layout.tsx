"use client";

// Shared layout for the Boards List + Trash pages ONLY (Istiyak's explicit scoping
// answer: the new sidebar must NOT appear on /brainboards/[id]'s canvas page). A
// Next.js route group — the "(list)" folder name doesn't affect the URL — keeps
// /brainboards/all and /brainboards/trash exactly where they were while giving them a
// layout [id]/page.tsx (a sibling OUTSIDE this group) never inherits.
import * as React from "react";
import { BoardsSidebar } from "@/components/boards/boards-sidebar";

export default function BoardsListLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1">
      {/* BoardsSidebar reads useSearchParams() (for the active ?folder= filter), which
          next.config.ts's cacheComponents option requires a Suspense boundary around —
          same reasoning as [id]/page.tsx's useParams() comment. */}
      <React.Suspense
        fallback={
          <aside className="w-60 shrink-0 border-r border-border-muted bg-background-surface" aria-busy="true" />
        }
      >
        <BoardsSidebar />
      </React.Suspense>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
    </div>
  );
}
