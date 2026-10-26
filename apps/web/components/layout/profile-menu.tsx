"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDown, Info, Keyboard, LogOut, Settings, type LucideIcon } from "lucide-react";
import { useSettingsStore, type Profile } from "@/stores/settings-store";
import { Avatar } from "@/components/ui/avatar";
import { KeyboardShortcutsDialog } from "@/components/layout/keyboard-shortcuts-dialog";
import { AboutDialog } from "@/components/layout/about-dialog";
import { cn } from "@/lib/utils";

// "box-shadow"/"transform" here name CSS properties for transition-property, not
// design-token values (unlike a color or spacing value), so they're outside what the
// token-enforcement lint rule (ADR-0024/ADR-0031) is for. No disable comment needed:
// the rule only scans JSX className attributes, not string constants referenced via
// className={CONST}.
//
// Profile-dropdown overhaul (Istiyak, ADR-0076 — "the real juice"): the trigger is now
// avatar + name + a chevron, not a bare avatar — Istiyak was open to either "add Name
// aside it or something else," and pairing the name directly in the navbar (not just
// inside the open dropdown) reads as more informative at a glance and gives the trigger
// a real label, not just an icon. cursor-pointer is explicit because Tailwind v4's
// preflight sets button { cursor: default }, not the browser's native pointer.
const TRIGGER_CLASSNAME =
  "flex items-center gap-2 rounded-full py-1 pr-2.5 pl-1 cursor-pointer transition-colors duration-fast ease-out enabled:hover:bg-background-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2";

export function ProfileMenu({ profile }: { profile: Profile }) {
  const signOut = useSettingsStore((state) => state.signOut);
  const router = useRouter();
  const [isOpen, setIsOpen] = React.useState(false);
  const [dialog, setDialog] = React.useState<"shortcuts" | "about" | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className={TRIGGER_CLASSNAME}
      >
        <Avatar initials={profile.avatar_initials} />
        <span className="max-w-32 truncate text-sm font-medium text-text-primary">{profile.name}</span>
        <ChevronDown
          className={cn("size-3.5 shrink-0 text-text-muted transition-transform duration-150", isOpen && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      {isOpen ? (
        <div
          role="menu"
          aria-label="Profile menu"
          className={cn(
            "absolute top-full right-0 z-10 mt-2 w-64 overflow-hidden rounded-lg border border-border-default bg-background-surface-raised py-1.5 shadow-overlay",
            "motion-safe:duration-fast motion-safe:animate-in motion-safe:zoom-in-95 motion-safe:fade-in motion-safe:slide-in-from-top-1"
          )}
        >
          {/* Header: avatar paired with the name again, slightly larger here than the
              trigger's — Istiyak: "Profile name should be slightly improved visually."
              No email/secondary-line field exists on Profile (settings-store.ts) to pair
              it with honestly, so the caption below states what's actually true instead
              of inventing data. */}
          <div className="flex items-center gap-2.5 px-3 py-2.5">
            <Avatar initials={profile.avatar_initials} size="lg" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-text-primary">{profile.name}</p>
              <p className="truncate text-xs text-text-muted">Local profile</p>
            </div>
          </div>
          <div className="mx-2 border-t border-border-muted" />

          <div className="py-1">
            <MenuLink href="/settings" icon={Settings} onNavigate={() => setIsOpen(false)}>
              Settings
            </MenuLink>
            <MenuButton
              icon={Keyboard}
              onClick={() => {
                setDialog("shortcuts");
                setIsOpen(false);
              }}
            >
              Keyboard shortcuts
            </MenuButton>
            <MenuButton
              icon={Info}
              onClick={() => {
                setDialog("about");
                setIsOpen(false);
              }}
            >
              About Brainy.ai
            </MenuButton>
          </div>

          <div className="mx-2 border-t border-border-muted" />

          {/* Sign out gets its own breathing room (pt-1.5, not folded into the same
              py-1 list above) plus a dedicated danger hover treatment — Istiyak: "Sign
              out could be red in hover and should have exit/logoff icon... proper
              separation needed here." Same bg-background-danger-muted/text-text-danger
              pairing node-menu.tsx's own danger MenuItem already established, reused
              rather than inventing a second danger-hover convention in this codebase. */}
          <div className="pt-1.5">
            <MenuButton
              icon={LogOut}
              danger
              onClick={() => {
                signOut();
                setIsOpen(false);
                // sessionActive flipping to false only unmounts the Navbar (it has no
                // route awareness) — it doesn't navigate anywhere on its own, so a user
                // signing out from a route other than "/" (e.g. /brainboards/all) would
                // otherwise be left on that route's bare content with no way back to the
                // login/welcome-back screen. This push is what actually returns them there.
                router.push("/");
              }}
            >
              Sign out
            </MenuButton>
          </div>
        </div>
      ) : null}

      <KeyboardShortcutsDialog open={dialog === "shortcuts"} onOpenChange={(open) => !open && setDialog(null)} />
      <AboutDialog open={dialog === "about"} onOpenChange={(open) => !open && setDialog(null)} />
    </div>
  );
}

// Richer per-item hover (Istiyak: "hover effects on menus can be improved") — a tinted
// accent wash + a small rightward nudge on the icon, instead of the previous flat
// hover:bg-background-muted on every item identically. The icon itself gives each item
// visual rhythm at a glance (Settings/Keyboard/Info), matching how the rest of this
// redesigned app now uses icons generously (board-row-menu.tsx, node-menu.tsx).
const MENU_ITEM_CLASSNAME =
  "group/item flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors duration-150";
const MENU_ITEM_DEFAULT_CLASSNAME = "text-text-primary hover:bg-background-accent-muted hover:text-text-accent";
const MENU_ITEM_DANGER_CLASSNAME = "text-text-danger hover:bg-background-danger-muted";
const MENU_ITEM_ICON_CLASSNAME = "size-4 shrink-0 transition-transform duration-150 group-hover/item:translate-x-0.5";

function MenuLink({
  href,
  icon: Icon,
  onNavigate,
  children,
}: {
  href: string;
  icon: LucideIcon;
  onNavigate: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} role="menuitem" onClick={onNavigate} className={cn(MENU_ITEM_CLASSNAME, MENU_ITEM_DEFAULT_CLASSNAME)}>
      <Icon className={MENU_ITEM_ICON_CLASSNAME} aria-hidden="true" />
      {children}
    </Link>
  );
}

function MenuButton({
  icon: Icon,
  danger,
  onClick,
  children,
}: {
  icon: LucideIcon;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(MENU_ITEM_CLASSNAME, danger ? MENU_ITEM_DANGER_CLASSNAME : MENU_ITEM_DEFAULT_CLASSNAME)}
    >
      <Icon className={MENU_ITEM_ICON_CLASSNAME} aria-hidden="true" />
      {children}
    </button>
  );
}
