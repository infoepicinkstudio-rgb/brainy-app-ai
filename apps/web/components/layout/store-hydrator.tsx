"use client";

import * as React from "react";
import { useSettingsStore } from "@/stores/settings-store";

// Loads the profile once per app load, at the root layout, so every route — not just
// `/` — has it available (the Navbar needs it to decide whether to render at all).
export function StoreHydrator() {
  const loadProfile = useSettingsStore((state) => state.loadProfile);

  React.useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  return null;
}
