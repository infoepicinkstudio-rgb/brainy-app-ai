"use client";

import { useSettingsStore, type Profile } from "@/stores/settings-store";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";

// Shown after the cosmetic Sign Out (navbar dropdown) — the profile row is never
// deleted, so Continue just re-confirms it rather than asking for a name again. "Not
// you?" is the escape hatch for when that assumption is wrong: it flips
// isSwitchingProfile, which sends AppGate to the blank-name FirstRunLogin screen
// instead (profile.ts's POST upserts, so saving there renames the same single row —
// there's no real multi-profile support, just a way to change the one name).
export function WelcomeBack({ profile }: { profile: Profile }) {
  const continueSession = useSettingsStore((state) => state.continueSession);
  const startProfileSwitch = useSettingsStore((state) => state.startProfileSwitch);

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="motion-safe:duration-slow flex w-full max-w-sm flex-col items-center rounded-xl border border-border-muted bg-background-surface p-8 text-center shadow-surface-raised motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2">
        <Avatar initials={profile.avatar_initials} size="lg" className="shadow-accent-focus" />
        <h1 className="mt-4 text-xl font-semibold tracking-tight text-text-primary">
          Welcome back, {profile.name}
        </h1>
        <p className="mt-1 text-sm text-text-secondary">Your boards are right where you left them.</p>
        <Button onClick={continueSession} className="mt-6 w-full">
          Continue
        </Button>
        <button
          type="button"
          onClick={startProfileSwitch}
          className="duration-fast mt-3 text-sm text-text-secondary transition-colors hover:text-text-primary"
        >
          Not {profile.name}? Use a different name
        </button>
      </div>
    </div>
  );
}
