"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSettingsStore, type Profile } from "@/stores/settings-store";
import { Avatar } from "@/components/ui/avatar";
import { KeyboardShortcutsDialog } from "@/components/layout/keyboard-shortcuts-dialog";
import { AboutDialog } from "@/components/layout/about-dialog";
import { cn } from "@/lib/utils";

// "scale"/"box-shadow" here name CSS properties for transition-property, not
// design-token values (unlike a color or spacing value), so they're outside what the
// token-enforcement lint rule (ADR-0024/ADR-0031) is for. No disable comment needed:
// the rule only scans JSX className attributes, not string constants referenced via
// className={CONST}.
//
// cursor-pointer is explicit because Tailwind v4's preflight sets button { cursor:
// default }, not the browser's native pointer — without this the only affordance a
// <button> gives on hover is nothing at all. hover:scale-105 + hover:ring-* give an
// actual visible hover state (previously there was none — only the active-state
// scale-96 on click), separate in color from the focus-visible ring so hover and
// keyboard-focus read as distinct states.
const AVATAR_BUTTON_CLASSNAME =
  "rounded-full cursor-pointer transition-[scale,box-shadow] duration-fast ease-out enabled:hover:scale-105 enabled:hover:ring-2 enabled:hover:ring-border-muted enabled:hover:ring-offset-2 enabled:active:scale-96 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2";

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
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className={AVATAR_BUTTON_CLASSNAME}
      >
        <Avatar initials={profile.avatar_initials} />
      </button>

      {isOpen ? (
        <div
          role="menu"
          aria-label="Profile menu"
          className={cn(
            "absolute top-full right-0 z-10 mt-2 w-56 rounded-lg border border-border-default bg-background-surface-raised py-1 shadow-surface-raised",
            "motion-safe:duration-fast motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1"
          )}
        >
          <div className="px-3 py-2">
            <p className="truncate text-sm font-medium text-text-primary">{profile.name}</p>
          </div>
          <div className="my-1 border-t border-border-muted" />
          <MenuLink href="/settings" onNavigate={() => setIsOpen(false)}>
            Settings
          </MenuLink>
          <MenuButton
            onClick={() => {
              setDialog("shortcuts");
              setIsOpen(false);
            }}
          >
            Keyboard shortcuts
          </MenuButton>
          <MenuButton
            onClick={() => {
              setDialog("about");
              setIsOpen(false);
            }}
          >
            About Brainy.ai
          </MenuButton>
          <div className="my-1 border-t border-border-muted" />
          <MenuButton
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
      ) : null}

      <KeyboardShortcutsDialog open={dialog === "shortcuts"} onOpenChange={(open) => !open && setDialog(null)} />
      <AboutDialog open={dialog === "about"} onOpenChange={(open) => !open && setDialog(null)} />
    </div>
  );
}

function MenuLink({
  href,
  onNavigate,
  children,
}: {
  href: string;
  onNavigate: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onNavigate}
      className="block px-3 py-2 text-sm text-text-primary transition-colors duration-150 hover:bg-background-muted"
    >
      {children}
    </Link>
  );
}

function MenuButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="block w-full px-3 py-2 text-left text-sm text-text-primary transition-colors duration-150 hover:bg-background-muted"
    >
      {children}
    </button>
  );
}
