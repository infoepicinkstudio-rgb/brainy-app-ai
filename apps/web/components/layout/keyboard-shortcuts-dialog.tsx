"use client";

import { Dialog } from "@/components/ui/dialog";

// Placeholder content (implementation_plan.md Phase 1: "placeholder content acceptable
// — finalize once real shortcuts exist"). No canvas/node shortcuts exist until later
// phases, so this only covers what's actually true today.
const SHORTCUTS: Array<{ keys: string; description: string }> = [
  { keys: "Esc", description: "Close a dialog or menu" },
];

export function KeyboardShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Keyboard shortcuts">
      {SHORTCUTS.length > 0 ? (
        <ul className="space-y-2">
          {SHORTCUTS.map((shortcut) => (
            <li key={shortcut.keys} className="flex items-center justify-between gap-4">
              <span>{shortcut.description}</span>
              <kbd className="rounded border border-border-default bg-background-surface px-1.5 py-0.5 text-xs text-text-secondary">
                {shortcut.keys}
              </kbd>
            </li>
          ))}
        </ul>
      ) : (
        <p>No shortcuts yet — they will appear here as the canvas and its tools get built.</p>
      )}
      <p className="mt-4 text-text-muted">More shortcuts arrive as the Brainboard canvas is built.</p>
    </Dialog>
  );
}
