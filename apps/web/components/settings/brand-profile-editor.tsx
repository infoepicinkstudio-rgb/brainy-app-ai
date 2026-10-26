"use client";

import * as React from "react";
import { useSettingsStore, type BrandProfile } from "@/stores/settings-store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export function BrandProfileEditor({ brandProfile }: { brandProfile: BrandProfile | null }) {
  const saveBrandProfile = useSettingsStore((state) => state.saveBrandProfile);
  const [content, setContent] = React.useState(brandProfile?.content ?? "");
  const [isSaving, setIsSaving] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState<number | null>(null);

  const isDirty = content !== (brandProfile?.content ?? "");

  async function handleSave() {
    setIsSaving(true);
    try {
      await saveBrandProfile(content);
      setSavedAt(Date.now());
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Visually hidden: the Settings page section header right above this card
          already shows "Brand/Voice Profile" as the visible title, so a second
          identical line here would just repeat it. The label stays in the DOM so the
          textarea keeps a real accessible name for screen readers. */}
      <Label htmlFor="brand-profile" className="sr-only">
        Brand/Voice Profile
      </Label>
      <p className="text-sm text-text-secondary">
        Describe your tone and writing style. Opt a chat node into using it from that node, any time —
        this does not apply automatically.
      </p>
      <Textarea
        id="brand-profile"
        value={content}
        onChange={(event) => {
          setContent(event.target.value);
          setSavedAt(null);
        }}
        placeholder="Direct, plain language. No jargon. Short sentences. Confident but not salesy."
      />
      <div className="flex items-center gap-3">
        <Button variant="secondary" size="sm" onClick={handleSave} disabled={isSaving || !isDirty} className="self-start">
          {isSaving ? "Saving…" : "Save"}
        </Button>
        {!isDirty && savedAt ? <span className="text-sm text-text-success">Saved</span> : null}
      </div>
    </div>
  );
}
