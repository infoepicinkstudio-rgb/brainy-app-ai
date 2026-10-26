import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const avatarVariants = cva(
  "inline-flex shrink-0 items-center justify-center rounded-full bg-background-accent-muted font-semibold text-text-accent",
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
