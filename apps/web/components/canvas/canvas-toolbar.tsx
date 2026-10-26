"use client";

// Toolbar makeover (Istiyak: "Toolbar on canvas Needs complete makeover. We need
// toolbar same as poppy have, not like we have at top. we will have a mature toolbar
// design with icons. Full name in tooltip on hover. for now that's sufficient. We will
// do interaction design / motion design in Phase 8 planned for later for the entire
// product."): the old h-12 strip (← Boards / board title / text-labeled buttons) is
// gone — the board's identity now lives in the global Navbar's breadcrumb (ADR-0075/
// ADR-0076) and repeating it here read as redundant. In its place, a floating vertical
// icon-only toolbar on the canvas's left edge — Poppy's own tool-palette position —
// each button a plain square icon with a tooltip (components/ui/tooltip.tsx) carrying
// the full name, nothing more: no entrance animation, no per-button motion design
// beyond the existing hover color-fade every other control in this app already uses
// (Istiyak explicitly deferred real interaction/motion polish to Phase 8).
//
// Deliberately still just three actions (Text/Link/File) — the brief's own words were
// "don't lose the actual node-creation actions themselves," not "add more actions,"
// so this round doesn't invent new toolbar entries beyond carrying these three over.
import * as React from "react";
import { TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface ToolbarAction {
  key: string;
  label: string;
  icon: React.ElementType;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
}

export function CanvasToolbar({ actions }: { actions: ToolbarAction[] }) {
  return (
    <div
      className="pointer-events-auto absolute top-4 left-4 z-10 flex flex-col gap-1 rounded-xl border border-border-default bg-background-surface p-1.5 shadow-md"
      role="toolbar"
      aria-label="Add to board"
      aria-orientation="vertical"
    >
      {actions.map((action) => (
        <TooltipTrigger key={action.key} label={action.label} side="right">
          <button
            type="button"
            onClick={action.onClick}
            disabled={action.disabled}
            aria-label={action.label}
            className={cn(
              "flex size-9 items-center justify-center rounded-lg text-text-secondary transition-colors duration-fast ease-out",
              "enabled:hover:bg-background-accent-muted enabled:hover:text-text-accent",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus",
              "disabled:cursor-not-allowed disabled:opacity-50",
              action.busy && "text-text-accent"
            )}
          >
            <action.icon className="size-4.5" aria-hidden="true" />
          </button>
        </TooltipTrigger>
      ))}
    </div>
  );
}
