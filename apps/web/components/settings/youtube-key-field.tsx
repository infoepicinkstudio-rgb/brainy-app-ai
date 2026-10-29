"use client";

// Phase 6 (F-15/TF-09, ADR-0100) — the Outliers panel's own key field. Deliberately a
// near-duplicate of provider-key-field.tsx rather than that component made generic over
// "provider or youtube": that file is typed to `Provider = "claude"|"openai"|"gemini"`
// end to end (settings-store.ts's `ProviderStatus`/`saveProviderKey`/etc.), and YouTube
// has no `executionMode` concept to thread through at all — see db/schema.ts's own
// comment on `youtube_credentials` for the same reasoning applied one layer down.
// Small enough (single key, no execution-mode row) that the duplication is cheaper than
// a shared abstraction neither call site would use the same way.

import * as React from "react";
import { useSettingsStore } from "@/stores/settings-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function YoutubeKeyField() {
  const isConfigured = useSettingsStore((state) => state.youtubeConfigured);
  const saveYoutubeKey = useSettingsStore((state) => state.saveYoutubeKey);
  const clearYoutubeKey = useSettingsStore((state) => state.clearYoutubeKey);

  const [isReplacing, setIsReplacing] = React.useState(false);
  const [draftKey, setDraftKey] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const showInput = !isConfigured || isReplacing;

  async function handleSave() {
    if (!draftKey.trim()) {
      setError("Enter a key, or cancel.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await saveYoutubeKey(draftKey.trim());
      setDraftKey("");
      setIsReplacing(false);
    } catch {
      setError("Couldn't save this key. Check the Brainy.ai server is running and try again.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleClear() {
    setIsSaving(true);
    setError(null);
    try {
      await clearYoutubeKey();
    } catch {
      setError("Couldn't clear this key. Check the Brainy.ai server is running and try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 py-4">
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor="youtube-data-api-key">YouTube Data API key</Label>
        {!showInput ? (
          <span className="flex items-center gap-1.5 text-sm text-text-success">
            <span className="size-1.5 rounded-full bg-text-success" aria-hidden="true" />
            Key saved
          </span>
        ) : null}
      </div>

      {showInput ? (
        <div className="flex gap-2">
          <Input
            id="youtube-data-api-key"
            type="password"
            value={draftKey}
            onChange={(event) => {
              setDraftKey(event.target.value);
              if (error) setError(null);
            }}
            placeholder="AIza…"
            autoComplete="off"
            aria-describedby={error ? "youtube-data-api-key-error" : undefined}
          />
          <Button variant="secondary" size="sm" onClick={handleSave} disabled={isSaving} className="shrink-0">
            {isSaving ? "Saving…" : "Save key"}
          </Button>
          {isReplacing ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setIsReplacing(false);
                setDraftKey("");
                setError(null);
              }}
              className="shrink-0"
            >
              Cancel
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setIsReplacing(true)}>
            Change key
          </Button>
          <Button variant="ghost" size="sm" onClick={handleClear} disabled={isSaving}>
            {isSaving ? "Clearing…" : "Clear key"}
          </Button>
        </div>
      )}

      {error ? (
        <p id="youtube-data-api-key-error" className="text-sm text-text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
