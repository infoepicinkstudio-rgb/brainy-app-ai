"use client";

import { Dialog } from "@/components/ui/dialog";

const APP_VERSION = "0.1.0";

export function AboutDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="About Brainy.ai">
      <p className="text-text-primary">Brainy.ai</p>
      <p className="mt-1">Version {APP_VERSION} — Phase 1, App Shell</p>
      <p className="mt-4">
        A personal, local-first research space. Everything you add stays on this computer.
      </p>
    </Dialog>
  );
}
