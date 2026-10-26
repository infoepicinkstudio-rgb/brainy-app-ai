import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Nav polish pass (Istiyak: "contrast is very low... check visually we can improve the
// avatar"): the previous bg-background-accent-muted + text-text-accent combo paired a
// near-white accent-tint circle (accent.50) with mid-indigo text (accent.600) — the
// circle itself barely registered against the white navbar it sits on, independent of
// the initials' own text contrast. Switched to a solid accent fill + on-accent (white)
// text, matching the same bg-background-accent/text-text-on-accent pairing the navbar's
// own logo mark already uses (navbar.tsx) — reads as a clear, deliberate badge against
// any surface, not just technically-passing text contrast inside a washed-out circle.
const avatarVariants = cva(
  "inline-flex shrink-0 items-center justify-center rounded-full bg-background-accent font-semibold text-text-on-accent",
  {
    variants: {
      size: {
        sm: "size-8 text-xs",
        lg: "size-14 text-lg",
      },
    },
    defaultVariants: { size: "sm" },
  }
);

export interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof avatarVariants> {
  initials: string;
}

export function Avatar({ initials, size, className, ...props }: AvatarProps) {
  return (
    <span className={cn(avatarVariants({ size }), className)} aria-hidden="true" {...props}>
      {initials}
    </span>
  );
}
