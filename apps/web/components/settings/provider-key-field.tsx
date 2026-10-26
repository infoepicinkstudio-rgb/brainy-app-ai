"use client";

import * as React from "react";
import { useSettingsStore, type Provider, type ProviderStatus } from "@/stores/settings-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PROVIDER_LABELS: Record<Provider, string> = {
  claude: "Claude",
  openai: "OpenAI",
  gemini: "Gemini",
};

// Realistic example of each provider's actual key format (better-writing: a placeholder
// shows an example, never an instruction like "Paste your key here").
const PROVIDER_KEY_PLACEHOLDERS: Record<Provider, string> = {
  claude: "sk-ant-...",
  openai: "sk-...",
  gemini: "AIza...",
};

export function ProviderKeyField({ status }: { status: ProviderStatus }) {
  const saveProviderKey = useSettingsStore((state) => state.saveProviderKey);
  const clearProviderKey = useSettingsStore((state) => state.clearProviderKey);

  const [isReplacing, setIsReplacing] = React.useState(false);
  const [draftKey, setDraftKey] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const showInput = !status.isConfigured || isReplacing;

  async function handleSave() {
    if (!draftKey.trim()) {
      setError("Enter a key, or cancel.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await saveProviderKey(status.provider, draftKey.trim());
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
      await clearProviderKey(status.provider);
    } catch {
      setError("Couldn't clear this key. Check the Brainy.ai server is running and try again.");
    } finally {
      setIsSaving(false);
    }
  }

  const fieldId = `provider-key-${status.provider}`;

  return (
    <div className="flex flex-col gap-2 py-4">
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor={fieldId}>{PROVIDER_LABELS[status.provider]} API key</Label>
        {!showInput ? <ConfiguredStatus /> : null}
      </div>

      {showInput ? (
        <div className="flex gap-2">
          <Input
            id={fieldId}
            type="password"
            value={draftKey}
            onChange={(event) => {
              setDraftKey(event.target.value);
              if (error) setError(null);
            }}
            placeholder={PROVIDER_KEY_PLACEHOLDERS[status.provider]}
            autoComplete="off"
            aria-describedby={error ? `${fieldId}-error` : undefined}
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
        <p id={`${fieldId}-error`} className="text-sm text-text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function ConfiguredStatus() {
  return (
    <span className="flex items-center gap-1.5 text-sm text-text-success">
      <span className="size-1.5 rounded-full bg-text-success" aria-hidden="true" />
      Key saved
    </span>
  );
}
