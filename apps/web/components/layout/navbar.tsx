"use client";

import Link from "next/link";
import { Brain } from "lucide-react";
import { useSettingsStore } from "@/stores/settings-store";
import { ProfileMenu } from "@/components/layout/profile-menu";

// Mounted once at the root layout (architecture.md §3.2) so every future route —
// Boards List, Canvas — gets it automatically. It renders nothing on the login /
// welcome-back screens, where there's no session to show a profile menu for.
//
// better-ui: "shadows for elevation, borders for structure" — read literally, not as
// an either/or. A 1px border alone (the pre-fix version) reads as a flat strip with a
// hairline under it, which is exactly what didn't land — and the card-level shadow
// tokens (shadow-surface / shadow-surface-raised) turned out too faint at full window
// width to register as elevation either: that subtle a shadow needs a bounded object
// with visible edges (a card) to read against, and a window-wide bar has none. shadow-nav
// is its own token (deliberately stronger than the card shadows, tuned specifically for
// this one full-bleed horizontal separator) plus a hairline border-muted for a crisp
// structural edge — together they read as a distinct raised layer the way
// Linear/Notion/Vercel's own app shells do, not a flat strip with a line under it.
// Bracket syntax here ("transition-[scale]", the 15px wordmark size) is a CSS
// property/value pair, not a design-token value, so it's outside what the
// token-enforcement lint rule (ADR-0024/ADR-0031) is for — same reasoning as
// profile-menu.tsx's AVATAR_BUTTON_CLASSNAME. Pulling it into a constant keeps the
// rule scanning JSX className attributes only, not these string literals.
const WORDMARK_LINK_CLASSNAME =
  "group flex items-center gap-2 rounded-md transition-[scale] duration-fast ease-out enabled:active:scale-96 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2";
const WORDMARK_TEXT_CLASSNAME = "text-[15px] font-semibold tracking-tight text-text-primary";

export function Navbar() {
  const profile = useSettingsStore((state) => state.profile);
  const sessionActive = useSettingsStore((state) => state.sessionActive);

  if (!profile || !sessionActive) return null;

  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between border-b border-border-muted bg-background-surface px-5 shadow-nav">
      <Link href="/brainboards/all" className={WORDMARK_LINK_CLASSNAME}>
        <span className="duration-fast flex size-8 items-center justify-center rounded-lg bg-background-accent text-text-on-accent shadow-accent-focus transition-transform ease-out group-hover:scale-105">
          <Brain className="size-4.5" strokeWidth={2.25} aria-hidden="true" />
        </span>
        <span className={WORDMARK_TEXT_CLASSNAME}>Brainy.ai</span>
      </Link>
      <ProfileMenu profile={profile} />
    </header>
  );
}
