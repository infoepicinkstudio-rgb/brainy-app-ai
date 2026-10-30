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
    // Phase 7 (ADR-0034's open item, implementation_plan.md checklist item 4,
    // error-handling-conventions.md: "Cost-incurring or data-mutating actions...
    // disable their control for the duration of the in-flight request — no
    // double-submits") — the Save/Create button's own `disabled={isSaving}` below
    // only guards the mouse-click path. The Input's onKeyDown below calls this same
    // function directly on every Enter keydown, completely bypassing that button —
    // a fast double-press, or a held key's OS key-repeat, fires this before the
    // first call's `setIsSaving(true)` has been committed and re-rendered, so BOTH
    // calls see `isSaving === false` and both proceed to call `onConfirm` (e.g. New
    // board's handler in app/brainboards/(list)/all/page.tsx), creating two boards
    // from one rapid Enter. Verified as a real race (not just theoretical) by
    // simulating this exact call pattern — two back-to-back calls before either
    // await resolves — which fires the mock onConfirm twice without this guard and
    // once with it. This one-line check at the top closes it for every caller, both
    // the keyboard and mouse paths, without needing a second copy of the guard.
    if (isSaving) return;
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
