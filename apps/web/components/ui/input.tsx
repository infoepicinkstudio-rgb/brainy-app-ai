import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  ref?: React.Ref<HTMLInputElement>;
}

export function Input({ className, ref, ...props }: InputProps) {
  return (
    <input
      ref={ref}
      className={cn(
        "flex h-9 w-full rounded-md border border-border-default bg-background-surface-raised px-3 text-sm text-text-primary",
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
