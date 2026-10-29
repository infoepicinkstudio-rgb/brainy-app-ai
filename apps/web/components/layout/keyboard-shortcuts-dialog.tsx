"use client";

import { Dialog } from "@/components/ui/dialog";

// Round 2 #2 — this was still the literal Phase 1 placeholder ("No canvas/node
// shortcuts exist until later phases") even though real ones have existed since
// Phase 3: undo/redo, group/ungroup, duplicate, copy/paste, and marquee-select were
// all built into `brainboards/[id]/page.tsx`'s own `handleKeyDown` (ADR-0066's
// undo/redo, Phase 3's grouping/duplicate/copy-paste) but never once reflected here —
// a documentation-lag gap, not new functionality. Every entry below traces to that
// one handler (or React Flow's own `deleteKeyCode`/`selectionKeyCode` props on
// `<ReactFlow>`), so this list is accurate as of what the app actually does today,
// not aspirational. `Ctrl` also works via `Cmd` on a Mac (`event.ctrlKey ||
// event.metaKey` in the handler) — not called out per-row below, kept to one label
// per shortcut for a single-platform (Windows) MVP, consistent with ADR-0027.
const SHORTCUTS: Array<{ keys: string; description: string }> = [
  { keys: "Esc", description: "Close a dialog or menu" },
  { keys: "Delete", description: "Delete the selected card(s)" },
];

const SELECTION_SHORTCUTS: Array<{ keys: string; description: string }> = [
  { keys: "Shift + drag", description: "Draw a selection box over multiple cards" },
  { keys: "Ctrl+C", description: "Copy the selected card(s)" },
  { keys: "Ctrl+V", description: "Paste a copied card, or paste a link/text/video from your clipboard" },
  { keys: "Ctrl+D", description: "Duplicate the selected card(s)" },
  { keys: "Ctrl+G", description: "Group the selected cards" },
  { keys: "Ctrl+Shift+G", description: "Ungroup the selected group" },
];

const HISTORY_SHORTCUTS: Array<{ keys: string; description: string }> = [
  { keys: "Ctrl+Z", description: "Undo" },
  { keys: "Ctrl+Shift+Z", description: "Redo" },
];

// Round 2 #2, second pass (Istiyak: "Not this shortcut. i.e. Shortcut to create new
// board. etc..") — app-level shortcuts, not canvas ones. Only on the boards-list page
// ("all/page.tsx"'s own keydown handler), not the canvas, so grouped separately here.
const BOARDS_LIST_SHORTCUTS: Array<{ keys: string; description: string }> = [
  { keys: "Ctrl+N", description: "New board (on the boards list page)" },
];

function ShortcutList({ items }: { items: Array<{ keys: string; description: string }> }) {
  return (
    <ul className="space-y-2">
      {items.map((shortcut) => (
        <li key={shortcut.keys} className="flex items-center justify-between gap-4">
          <span>{shortcut.description}</span>
          <kbd className="shrink-0 rounded border border-border-default bg-background-surface px-1.5 py-0.5 text-xs text-text-secondary">
            {shortcut.keys}
          </kbd>
        </li>
      ))}
    </ul>
  );
}

export function KeyboardShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Keyboard shortcuts">
      <div className="space-y-4">
        <ShortcutList items={SHORTCUTS} />
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">Selection &amp; cards</p>
          <ShortcutList items={SELECTION_SHORTCUTS} />
        </div>
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">History</p>
          <ShortcutList items={HISTORY_SHORTCUTS} />
        </div>
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">Boards list</p>
          <ShortcutList items={BOARDS_LIST_SHORTCUTS} />
        </div>
      </div>
    </Dialog>
  );
}
