// Minimal toast/notification store (Phase 3 bug-fix round, Istiyak: "IF file type
// doesn't supported then it should not have come to board. And should popout to user
// through popup or toast"). This app had no toast mechanism at all before this —
// several other spots (board-store.ts's connectNodes, page.tsx's upload handlers)
// explicitly called that out in comments as a known gap. Kept deliberately tiny: a
// module-scoped Zustand store holding a short-lived message list, auto-dismissed after
// a few seconds, rendered by a single `<ToastHost>` mounted once on the board canvas
// page (toast-host.tsx) — not a full notification center, undo-stack, or queue-with-
// history. Good enough for "tell the user something didn't work" without inventing a
// whole subsystem for it.

import { create } from "zustand";

export type ToastVariant = "error" | "info";

export interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastState {
  toasts: ToastItem[];
  showToast: (message: string, variant?: ToastVariant) => void;
  dismissToast: (id: string) => void;
}

const TOAST_DURATION_MS = 5000;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  showToast: (message, variant = "error") => {
    const id = crypto.randomUUID();
    set((state) => ({ toasts: [...state.toasts, { id, message, variant }] }));
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }));
    }, TOAST_DURATION_MS);
  },
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));
