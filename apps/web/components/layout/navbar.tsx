"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brain } from "lucide-react";
import { useSettingsStore } from "@/stores/settings-store";
import { ProfileMenu } from "@/components/layout/profile-menu";
import { BoardBreadcrumb } from "@/components/layout/board-breadcrumb";

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
// Top Nav polish pass (Istiyak, ADR-0075) softened shadow-nav's own value (see
// primitives.json) to tone down how heavy that separator reads, without going back to
// a bare hairline — the reasoning above for why a hairline alone wasn't enough is
// unchanged, only the shadow's harshness.
//
// Bracket syntax here (the 15px wordmark size) is a CSS property/value pair, not a
// design-token value, so it's outside what the token-enforcement lint rule
// (ADR-0024/ADR-0031) is for — same reasoning as profile-menu.tsx's
// AVATAR_BUTTON_CLASSNAME. Pulling it into a constant keeps the rule scanning JSX
// className attributes only, not these string literals.
//
// Top Nav polish pass (Istiyak: "Brand logo is not a button... we don't want that [the
// hover scale]. I will update Logo later at the end"): the wordmark link no longer
// carries ANY press/hover transform feedback (the old group-hover:scale-105 on the icon
// box and active:scale-96 on the link itself are both gone) — it's still a real link to
// /brainboards/all, just without button-like motion. The icon mark itself is
// deliberately untouched otherwise, since Istiyak's redesigning it separately later.
const WORDMARK_LINK_CLASSNAME =
  "flex items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2";
const WORDMARK_TEXT_CLASSNAME = "text-[15px] font-semibold tracking-tight text-text-primary";

// Matches /brainboards/<id> (an actual board's canvas) but not /brainboards/all or
// /brainboards/trash (the (list) route group's own two pages) — those keep the
// wordmark. A board's own id is a uuid in practice, but matching any single non-"all"/
// "trash" segment here (rather than a uuid regex) is deliberately loose: it's a view
// decision only (which thing to render in one slot), not a route guard, so a false
// positive here costs nothing and a stricter pattern buys nothing.
const BOARD_CANVAS_PATTERN = /^\/brainboards\/(?!all$|trash$)[^/]+$/;

export function Navbar() {
  const profile = useSettingsStore((state) => state.profile);
  const sessionActive = useSettingsStore((state) => state.sessionActive);

  if (!profile || !sessionActive) return null;

  return (
    // Round 1 bug #7 (Istiyak: profile menu's dropdown was hiding BEHIND the Outliers
    // panel, the reverse of how the bug list first described it). Root cause: this
    // header and the Outliers panel (outliers-panel.tsx) both used z-20, and the
    // header's own position:sticky + z-index make it a stacking context of its own —
    // so the profile dropdown's z-10 (profile-menu.tsx) only ever competes against
    // its OWN header siblings, never directly against the Outliers panel. With the
    // header and the panel tied at z-20, the tie is broken by DOM order, and the
    // Outliers panel (rendered later, inside <main>, per app/layout.tsx's
    // <body><Navbar/>{children}</body> structure) wins — dragging the whole header,
    // dropdown included, underneath it. Bumped to z-30, decisively above every other
    // z-index in this app (z-20 is the next highest, on the Outliers panel and
    // group-node's own handle overrides) so the navbar — global chrome, including
    // whatever's open inside it — always sits above any in-page panel. The native
    // <dialog>-based modals (ui/dialog.tsx) are unaffected either way: the browser's
    // top layer always renders above this regardless of z-index.
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border-muted bg-background-surface px-5 shadow-nav">
      {/* usePathname() (in NavbarBrand below) is a dynamic client hook — next.config.ts's
          cacheComponents option requires a Suspense boundary around anything that reads
          it, same reasoning as the per-route Suspense wrappers around useParams()/
          useSearchParams() in brainboards/[id]/page.tsx and (list)/all/page.tsx. The
          wordmark is used as the fallback (not a blank slot) so there's no flash of
          empty space while this resolves. */}
      <React.Suspense fallback={<Wordmark />}>
        <NavbarBrand />
      </React.Suspense>
      <ProfileMenu profile={profile} />
    </header>
  );
}

function NavbarBrand() {
  const pathname = usePathname();
  const isBoardCanvas = BOARD_CANVAS_PATTERN.test(pathname ?? "");
  return isBoardCanvas ? <BoardBreadcrumb /> : <Wordmark />;
}

function Wordmark() {
  return (
    <Link href="/brainboards/all" className={WORDMARK_LINK_CLASSNAME}>
      <span className="flex size-8 items-center justify-center rounded-lg bg-background-accent text-text-on-accent shadow-accent-focus">
        <Brain className="size-4.5" strokeWidth={2.25} aria-hidden="true" />
      </span>
      <span className={WORDMARK_TEXT_CLASSNAME}>Brainy.ai</span>
    </Link>
  );
}
