import * as React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  ref?: React.Ref<HTMLTextAreaElement>;
}

export function Textarea({ className, ref, ...props }: TextareaProps) {
  return (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-32 w-full rounded-md border border-border-default bg-background-surface-raised px-3 py-2 text-sm text-text-primary",
        "placeholder:text-text-muted",
        "transition-colors duration-150",
        "focus-visible:border-border-focus focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}
