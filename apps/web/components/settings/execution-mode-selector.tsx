"use client";

import * as React from "react";
import { useSettingsStore, type ExecutionMode, type ProviderStatus } from "@/stores/settings-store";
import { cn } from "@/lib/utils";

const MODE_OPTIONS: Array<{ value: ExecutionMode; label: string; description: string }> = [
  { value: "native", label: "Native API", description: "Calls the provider directly with your key" },
  { value: "local", label: "Local LLM", description: "Runs on a local Ollama model — no key needed" },
  { value: "manual", label: "Manual input", description: "You copy the prompt and paste the reply back in" },
];

export function ExecutionModeSelector({ status }: { status: ProviderStatus }) {
  const setExecutionMode = useSettingsStore((state) => state.setExecutionMode);
  const [isSaving, setIsSaving] = React.useState(false);
  const groupName = `execution-mode-${status.provider}`;

  async function handleChange(mode: ExecutionMode) {
    setIsSaving(true);
    try {
      await setExecutionMode(status.provider, mode);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <fieldset className="flex flex-col gap-2 border-0 p-0" disabled={isSaving}>
      <legend className="text-sm text-text-secondary">Default execution mode</legend>
      {/* ADR-0019/F-12: this sets the starting mode for newly placed nodes only — each
          chat node keeps its own mode afterwards and can be switched independently,
          even on the same board, without this setting or any other node changing. */}
      <p className="text-xs text-text-muted">Applies to new {status.provider} chat nodes you place from now on.</p>
      <div className="flex flex-col gap-1">
        {MODE_OPTIONS.map((option) => (
          <label
            key={option.value}
            className={cn(
              "flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 transition-colors duration-150",
              "hover:bg-background-muted"
            )}
          >
            <input
              type="radio"
              name={groupName}
              value={option.value}
              checked={status.executionMode === option.value}
              onChange={() => handleChange(option.value)}
              className="mt-1 accent-background-accent"
            />
            <span>
              <span className="block text-sm text-text-primary">{option.label}</span>
              <span className="block text-xs text-text-muted">{option.description}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
