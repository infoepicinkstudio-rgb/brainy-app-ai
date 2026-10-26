// Top Nav/Toolbar pass (Istiyak: "mature toolbar design with icons. Full name in
// tooltip on hover... We will do interaction design / motion design in Phase 8 planned
// for later"): a small, dependency-free tooltip — CSS `group-hover` + an opacity fade on
// the existing `duration-fast` token, not a new animation system. No positioning
// library, no portal, no Radix (this repo's "no new dependency unless truly
// unavoidable" rule, agents.md) — `absolute` positioned against the trigger's own
// `relative` wrapper is enough for a toolbar's fixed, known layout, and is the same
// "plain CSS does the job" judgment call profile-menu.tsx's dropdown already made.
// Deliberately NOT the native `title` attribute some existing controls use (the
// bottom-right zoom/undo cluster): those are React Flow's own `<ControlButton>`, which
// doesn't accept arbitrary children for a styled tooltip, so `title` was the pragmatic
// floor there; this toolbar's own buttons are plain `<button>`s with room to do better.
import * as React from "react";
import { cn } from "@/lib/utils";

export type TooltipSide = "right" | "bottom" | "top" | "left";

const SIDE_CLASSNAME: Record<TooltipSide, string> = {
  right: "left-full top-1/2 ml-2 -translate-y-1/2",
  left: "right-full top-1/2 mr-2 -translate-y-1/2",
  bottom: "top-full left-1/2 mt-2 -translate-x-1/2",
  top: "bottom-full left-1/2 mb-2 -translate-x-1/2",
};

export function TooltipTrigger({
  label,
  side = "right",
  children,
  className,
}: {
  /** The full name/action shown on hover — e.g. "Add text note", not just "Text". */
  label: string;
  side?: TooltipSide;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("group/tooltip relative inline-flex", className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute z-30 whitespace-nowrap rounded-md border border-border-default bg-background-surface-raised px-2 py-1 text-xs font-medium text-text-primary opacity-0 shadow-overlay transition-opacity duration-fast ease-out group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100",
          SIDE_CLASSNAME[side]
        )}
      >
        {label}
      </span>
    </span>
  );
}
