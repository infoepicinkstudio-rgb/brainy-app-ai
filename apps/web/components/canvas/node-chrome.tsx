import * as React from "react";
import { cn } from "@/lib/utils";

// Shared card chrome for every node type — one place for the selection ring and base
// surface styling so text/file/link nodes read as one consistent system rather than
// each hand-rolling its own border/shadow treatment.
export function NodeChrome({
  selected,
  children,
  className,
}: {
  selected?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "w-64 overflow-hidden rounded-lg border bg-background-surface shadow-surface transition-shadow duration-fast",
        selected ? "border-border-focus shadow-accent-focus" : "border-border-default",
        className
      )}
    >
      {children}
    </div>
  );
}
