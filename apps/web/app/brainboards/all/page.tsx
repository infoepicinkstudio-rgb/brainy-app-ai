// Boards List placeholder (architecture.md §3.4) — the real screen is Phase 2. This
// route exists now only so TF-01's app-load gate has somewhere real to land, proving
// the redirect logic works end to end.
export default function BoardsListPlaceholder() {
  return (
    <main className="flex flex-1 items-center justify-center px-4">
      <div className="text-center">
        <h1 className="text-xl font-semibold text-text-primary">Your boards</h1>
        <p className="mt-2 text-sm text-text-secondary">
          The Boards List arrives in Phase 2 — for now, this confirms you made it past login.
        </p>
      </div>
    </main>
  );
}
