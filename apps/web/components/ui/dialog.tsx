"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// Built on the native <dialog> element: focus trapping, Escape-to-close and backdrop
// click are all free and genuinely accessible, so no extra dependency is needed for
// something this app only uses for two lightweight reference modals in Phase 1.

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function Dialog({ open, onOpenChange, title, description, children, footer }: DialogProps) {
  const ref = React.useRef<HTMLDialogElement>(null);

  React.useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Native "close" fires for Escape and the backdrop's built-in dismissal — keep the
  // controlling state in sync either way, not just for our own Close button.
  const handleClose = React.useCallback(() => onOpenChange(false), [onOpenChange]);

  return (
    <dialog
      ref={ref}
      onClose={handleClose}
      onCancel={handleClose}
      className={cn(
        "m-auto w-full max-w-md rounded-lg border border-border-muted bg-background-surface-raised p-0 text-text-primary shadow-overlay",
        "backdrop:bg-black/30",
        "overscroll-contain",
        "motion-safe:open:duration-fast motion-safe:open:animate-in motion-safe:open:zoom-in-95 motion-safe:open:fade-in"
      )}
    >
      <div className="flex items-start justify-between gap-4 border-b border-border-muted px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-text-primary">{title}</h2>
          {description ? <p className="mt-1 text-sm text-text-secondary">{description}</p> : null}
        </div>
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close dialog"
          className="rounded-md p-1 text-text-muted transition-colors hover:bg-background-muted hover:text-text-primary"
        >
          <CloseIcon />
        </button>
      </div>
      <div className="max-h-96 overflow-y-auto overscroll-contain px-5 py-4 text-sm text-text-secondary">
        {children}
      </div>
      {footer ? <div className="flex justify-end gap-2 border-t border-border-muted px-5 py-4">{footer}</div> : null}
    </dialog>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M4 4L12 12M12 4L4 12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
