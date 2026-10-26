import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Press feedback: scale to 0.96 over 150ms, disabled never scales (better-ui). Naming
// the exact transitioned properties (never transition-all, per the same rule) needs
// bracket syntax here — that's a CSS property list, not a design-token value, so it's
// outside what the token-enforcement lint rule (ADR-0024/ADR-0031) is actually for.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium " +
    "transition-[background-color,color,scale] duration-150 ease-out " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 " +
    "disabled:pointer-events-none disabled:opacity-50 " +
    "enabled:active:scale-96",
  {
    variants: {
      variant: {
        primary: "bg-background-accent text-text-on-accent hover:bg-background-accent/90",
        secondary:
          "border border-border-default bg-background-surface text-text-primary hover:bg-background-muted",
        ghost: "text-text-primary hover:bg-background-muted",
        danger: "bg-background-danger text-text-on-accent hover:bg-background-danger/90",
      },
      size: {
        sm: "h-8 px-3",
        md: "h-9 px-4",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  ref?: React.Ref<HTMLButtonElement>;
}

// React 19: ref is a plain prop, no forwardRef wrapper needed (composition-patterns).
export function Button({ className, variant, size, ref, ...props }: ButtonProps) {
  return <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
