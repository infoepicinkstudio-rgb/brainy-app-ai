"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useSettingsStore } from "@/stores/settings-store";
import { FirstRunLogin } from "@/components/login/first-run-login";
import { WelcomeBack } from "@/components/login/welcome-back";
import { Button } from "@/components/ui/button";

// TF-01 — the app-load gate: no profile yet, or the welcome-back screen's "Not you?"
// switch is open -> first-run login (blank name input); a profile exists but the
// session isn't active (after a cosmetic Sign Out) -> welcome-back screen; a profile
// exists and the session is active -> straight into the Boards List (Boards List
// itself is Phase 2 — /brainboards/all is a placeholder route for now).
// The profile itself is loaded once at the root layout (StoreHydrator), not here, so
// every route has it, not just this one.
export default function AppGate() {
  const router = useRouter();
  const profile = useSettingsStore((state) => state.profile);
  const profileLoaded = useSettingsStore((state) => state.profileLoaded);
  const profileLoadError = useSettingsStore((state) => state.profileLoadError);
  const retryLoadProfile = useSettingsStore((state) => state.retryLoadProfile);
  const sessionActive = useSettingsStore((state) => state.sessionActive);
  const isSwitchingProfile = useSettingsStore((state) => state.isSwitchingProfile);

  React.useEffect(() => {
    if (profileLoaded && profile && sessionActive && !isSwitchingProfile) {
      router.replace("/brainboards/all");
    }
  }, [profileLoaded, profile, sessionActive, isSwitchingProfile, router]);

  if (profileLoadError) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-sm text-text-danger">{profileLoadError}</p>
        <Button variant="secondary" size="sm" onClick={() => retryLoadProfile()}>
          Try again
        </Button>
      </main>
    );
  }

  if (!profileLoaded) {
    return <main className="flex flex-1" aria-busy="true" />;
  }

  if (!profile || isSwitchingProfile) {
    return (
      <main className="flex flex-1 flex-col">
        <FirstRunLogin />
      </main>
    );
  }

  if (!sessionActive) {
    return (
      <main className="flex flex-1 flex-col">
        <WelcomeBack profile={profile} />
      </main>
    );
  }

  // Signed in and already redirecting — render nothing rather than a flash of content.
  return <main className="flex flex-1" aria-busy="true" />;
}
