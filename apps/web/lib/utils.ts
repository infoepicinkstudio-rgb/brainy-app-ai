import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Standard shadcn/ui helper — merges Tailwind classes safely (later classes win
// over earlier conflicting ones). Used by every component in components/ui.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
