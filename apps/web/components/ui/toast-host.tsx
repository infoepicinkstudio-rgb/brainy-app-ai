"use client";

import * as React from "react";
import { AlertTriangle, Info, X } from "lucide-react";
import { useToastStore } from "@/stores/toast-store";
import { cn } from "@/lib/utils";

// Renders the toast-store's current queue, fixed at the bottom-center of the viewport.
// Mount this ONCE per page that can trigger a toast (currently just the board canvas
// page, [id]/page.tsx — file upload is the only toast-producing action so far).
export function ToastHost() {
  const toasts = useToastStore((state) => state.toasts);
  const dismissToast = useToastStore((state) => state.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={cn(
            "pointer-events-auto flex max-w-sm items-start gap-2 rounded-lg border px-3 py-2 text-xs shadow-surface-raised",
            toast.variant === "error"
              ? "border-border-danger bg-background-danger-muted text-text-danger"
              : "border-border-default bg-background-surface text-text-primary"
          )}
        >
          {toast.variant === "error" ? (
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          )}
          <span className="flex-1">{toast.message}</span>
          <button
            type="button"
            onClick={() => dismissToast(toast.id)}
            aria-label="Dismiss"
            className="shrink-0 rounded p-0.5 opacity-70 transition-opacity duration-fast hover:opacity-100"
          >
            <X className="size-3" aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
