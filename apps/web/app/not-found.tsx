import Link from "next/link";
import { Brain } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Next.js's own built-in fallback for an unmatched route ships its own inline CSS,
// including a `prefers-color-scheme: dark` media query that paints the page black on
// a system/browser set to dark mode — completely outside this app's own styling,
// which is deliberately single-light-theme-only (ADR-0027) with no dark-mode CSS
// anywhere else in the codebase. Defining this file replaces that built-in fallback
// with our own, so every route in the app — including a 404 — renders with the same
// token-driven light theme and Navbar, with no dark-mode CSS existing anywhere for a
// client-side back-navigation to carry over into the next page.
export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
      <span className="flex size-12 items-center justify-center rounded-xl bg-background-accent-muted text-text-accent">
        <Brain className="size-6" strokeWidth={2.25} aria-hidden="true" />
      </span>
      <h1 className="mt-1 text-xl font-semibold tracking-tight text-text-primary">Page not found</h1>
      <p className="max-w-80 text-sm text-text-secondary">
        The page you&apos;re looking for doesn&apos;t exist, or it hasn&apos;t been built yet.
      </p>
      <Link href="/" className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "mt-2")}>
        Back to Brainy.ai
      </Link>
    </main>
  );
}
