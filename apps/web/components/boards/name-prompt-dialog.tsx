"use client";

import * as React from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Shared "enter a name" prompt — New board, New folder, and Rename all need exactly
// this shape, so it's one component instead of three near-identical dialogs.
export function NamePromptDialog({
  open,
  onOpenChange,
  title,
  label,
  initialValue = "",
  confirmLabel = "Create",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  label: string;
  initialValue?: string;
  confirmLabel?: string;
  onConfirm: (value: string) => Promise<void> | void;
}) {
  const [value, setValue] = React.useState(initialValue);
  const [isSaving, setIsSaving] = React.useState(false);
  // All three call sites (New board / New folder / Rename) stay mounted at once
  // (just closed), so a hardcoded id here would collide across instances —
  // duplicate DOM ids, which breaks the label's htmlFor association. useId()
  // keeps each instance's input/label pairing unique.
  const inputId = React.useId();

  // Reset the field when the dialog transitions to open, computed during render
  // (react.dev "Adjusting state when a prop changes") rather than in an effect —
  // this is the pattern the project's lint config (react-hooks's set-state-in-effect
  // rule) actually accepts for "state derived from a changing prop".
  const [prevOpen, setPrevOpen] = React.useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setValue(initialValue);
  }

  async function handleConfirm() {
    const trimmed = value.trim();
    if (!trimmed) return;
    setIsSaving(true);
    try {
      await onConfirm(trimmed);
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" disabled={isSaving || !value.trim()} onClick={handleConfirm}>
            {isSaving ? "Saving…" : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        <Label htmlFor={inputId}>{label}</Label>
        <Input
          id={inputId}
          value={value}
          autoFocus
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") handleConfirm();
          }}
        />
      </div>
    </Dialog>
  );
}
