"use client";

import * as React from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { FolderDeleteAction } from "@/stores/folders-store";
import type { FolderSummary } from "@/stores/folders-store";

// Real strategy choice for what happens to a folder's boards when the folder itself is
// deleted (ADR-0082) — never a silent orphan-or-cascade default. Same Dialog component
// Trash's permanent-delete confirm already uses (components/ui/dialog.tsx), so this
// reads as the same "are you sure" shape the app already has, not a new pattern.
export function FolderDeleteDialog({
  open,
  onOpenChange,
  folder,
  otherFolders,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folder: FolderSummary | null;
  otherFolders: FolderSummary[];
  onConfirm: (action: FolderDeleteAction, targetFolderId: string | null) => Promise<void> | void;
}) {
  const [action, setAction] = React.useState<FolderDeleteAction>("move");
  const [targetFolderId, setTargetFolderId] = React.useState<string | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  // Reset to the safe default (move, top level) each time a different folder's dialog
  // opens — same render-time "state derived from a changing prop" shape used elsewhere
  // in this app (name-prompt-dialog.tsx, board-breadcrumb.tsx) rather than an effect.
  const [prevFolderId, setPrevFolderId] = React.useState(folder?.id ?? null);
  if ((folder?.id ?? null) !== prevFolderId) {
    setPrevFolderId(folder?.id ?? null);
    setAction("move");
    setTargetFolderId(null);
  }

  async function handleConfirm() {
    setIsDeleting(true);
    try {
      await onConfirm(action, action === "move" ? targetFolderId : null);
      onOpenChange(false);
    } finally {
      setIsDeleting(false);
    }
  }

  if (!folder) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Delete "${folder.name}"?`}
      description="The folder itself can't hold what happens to its boards — choose one:"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" disabled={isDeleting} onClick={handleConfirm}>
            {isDeleting ? "Deleting…" : "Delete folder"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-border-default p-3 transition-colors duration-150 hover:bg-background-muted has-checked:border-border-focus has-checked:bg-background-accent-muted">
          <input
            type="radio"
            name="folder-delete-action"
            checked={action === "move"}
            onChange={() => setAction("move")}
            className="mt-0.5 text-text-accent accent-current"
          />
          <span>
            <span className="block text-sm font-medium text-text-primary">Move its boards</span>
            <span className="mt-1 block text-xs text-text-secondary">
              Boards in &quot;{folder.name}&quot; move to another folder, or to no folder — nothing is deleted.
            </span>
            {action === "move" ? (
              <span className="mt-2 block">
                <Label htmlFor="folder-delete-target" className="sr-only">
                  Move boards to
                </Label>
                <select
                  id="folder-delete-target"
                  value={targetFolderId ?? ""}
                  onChange={(event) => setTargetFolderId(event.target.value || null)}
                  className="h-8 w-full rounded-md border border-border-default bg-background-surface px-2 text-sm text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:outline-none"
                >
                  <option value="">No folder</option>
                  {otherFolders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </span>
            ) : null}
          </span>
        </label>

        <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-border-default p-3 transition-colors duration-150 hover:bg-background-danger-muted has-checked:border-border-danger has-checked:bg-background-danger-muted">
          <input
            type="radio"
            name="folder-delete-action"
            checked={action === "delete"}
            onChange={() => setAction("delete")}
            className="mt-0.5 text-text-danger accent-current"
          />
          <span>
            <span className="block text-sm font-medium text-text-danger">Delete its boards too</span>
            <span className="mt-1 block text-xs text-text-secondary">
              Every board in &quot;{folder.name}&quot; goes to Trash along with the folder — same as deleting each one
              individually, and just as recoverable from there.
            </span>
          </span>
        </label>
      </div>
    </Dialog>
  );
}
