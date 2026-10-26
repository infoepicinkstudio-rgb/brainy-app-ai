"use client";

import * as React from "react";
import { Brain } from "lucide-react";
import { useSettingsStore } from "@/stores/settings-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function FirstRunLogin() {
  const saveProfile = useSettingsStore((state) => state.saveProfile);
  // Only set when this screen was reached via "Not you?" on the welcome-back screen —
  // true first-run has no profile yet, so there's nothing to go back to.
  const isSwitchingProfile = useSettingsStore((state) => state.isSwitchingProfile);
  const cancelProfileSwitch = useSettingsStore((state) => state.cancelProfileSwitch);
  const [name, setName] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a name to continue.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await saveProfile(trimmed);
    } catch {
      setError("Couldn't save your name. Check that the Brainy.ai server is running and try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="motion-safe:duration-slow w-full max-w-sm motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2">
        <div className="flex flex-col items-center text-center">
          <span className="flex size-12 items-center justify-center rounded-xl bg-background-accent text-text-on-accent shadow-accent-focus">
            <Brain className="size-6" strokeWidth={2.25} aria-hidden="true" />
          </span>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-text-primary">Welcome to Brainy.ai</h1>
          <p className="mt-2 max-w-88 text-sm text-text-secondary">
            Your own research space, stored only on this computer. No account, no password — just a
            name for your profile.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="mt-7 space-y-4 rounded-xl border border-border-muted bg-background-surface p-6 shadow-surface-raised"
        >
          <div className="space-y-2">
            <Label htmlFor="name">Your name</Label>
            <Input
              id="name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (error) setError(null);
              }}
              placeholder="Ada Lovelace"
              autoFocus
              autoComplete="name"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "name-error" : undefined}
            />
            {error ? (
              <p id="name-error" className="text-sm text-text-danger">
                {error}
              </p>
            ) : null}
          </div>

          <Button type="submit" disabled={isSaving} className="w-full">
            {isSaving ? "Saving…" : "Continue"}
          </Button>

          {isSwitchingProfile ? (
            <button
              type="button"
              onClick={cancelProfileSwitch}
              className="duration-fast block w-full text-center text-sm text-text-secondary transition-colors hover:text-text-primary"
            >
              Cancel
            </button>
          ) : null}
        </form>
      </div>
    </div>
  );
}
