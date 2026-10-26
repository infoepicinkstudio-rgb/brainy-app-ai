"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// Shared collapsed-by-default "optional notes" field — round 2 of the node-card-overhaul
// pass (Istiyak: "why do we need Title input and link input and all... see how crisp
// cards are made"). The link card's permanently-open multi-line "Paste the page's
// content here (optional)…" textarea was the single biggest offender in his screenshot —
// a tall empty box eating card height on every link, whether or not the user ever uses
// it. This stays a genuinely manual free-text field (ADR-0053: no scraping of article
// content, still true — ADR-0067 only widens the scope to a cosmetic title/favicon
// lookup, never this field), just collapsed to one unobtrusive line until the user
// actually focuses it or it already holds content, instead of always being fully open.
export function NodeNotesField({
  value,
  onChange,
  onCommit,
  placeholder = "Add notes for AI to use…",
  bordered = true,
}: {
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  placeholder?: string;
  /** Whether to draw the top divider border — omit when this is the card's only/first content block. */
  bordered?: boolean;
}) {
  const [focused, setFocused] = React.useState(false);
  const expanded = focused || value.length > 0;

  return (
    <textarea
      className={cn(
        "nodrag nowheel scrollbar-thin w-full resize-none bg-transparent px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-muted",
        "transition-all duration-fast ease-standard focus-visible:outline-none",
        bordered && "border-t border-border-muted",
        expanded ? "h-16" : "h-7"
      )}
      placeholder={placeholder}
      value={value}
      onFocus={() => setFocused(true)}
      onChange={(event) => onChange(event.target.value)}
      onBlur={() => {
        setFocused(false);
        onCommit();
      }}
    />
  );
}
