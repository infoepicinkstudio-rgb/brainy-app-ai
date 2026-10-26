"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, KeyRound, MessageSquareText } from "lucide-react";
import { useSettingsStore } from "@/stores/settings-store";
import { ProviderKeyField } from "@/components/settings/provider-key-field";
import { ExecutionModeSelector } from "@/components/settings/execution-mode-selector";
import { ToolsPanelStub } from "@/components/settings/tools-panel-stub";
import { BrandProfileEditor } from "@/components/settings/brand-profile-editor";

export default function SettingsPage() {
  const providers = useSettingsStore((state) => state.providers);
  const providersLoaded = useSettingsStore((state) => state.providersLoaded);
  const loadProviders = useSettingsStore((state) => state.loadProviders);
  const brandProfile = useSettingsStore((state) => state.brandProfile);
  const brandProfileLoaded = useSettingsStore((state) => state.brandProfileLoaded);
  const loadBrandProfile = useSettingsStore((state) => state.loadBrandProfile);

  React.useEffect(() => {
    loadProviders();
    loadBrandProfile();
  }, [loadProviders, loadBrandProfile]);

  return (
    <main className="flex flex-1 justify-center px-4 py-10">
      <div className="w-full max-w-xl">
        <Link
          href="/brainboards/all"
          className="duration-fast inline-flex items-center gap-1.5 text-sm text-text-secondary transition-colors hover:text-text-primary"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Back to boards
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-text-primary">Settings</h1>

        <section className="mt-6 rounded-xl border border-border-muted bg-background-surface p-6 shadow-surface">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-background-accent-muted text-text-accent">
              <KeyRound className="size-4" strokeWidth={2.25} aria-hidden="true" />
            </span>
            <h2 className="text-base font-semibold text-text-primary">Providers</h2>
          </div>
          <p className="mt-2 text-sm text-text-secondary">
            Add an API key to enable that provider&apos;s chat node. Your keys stay on this computer,
            encrypted, and are never sent anywhere but that provider.
          </p>

          {!providersLoaded ? (
            <p className="mt-4 text-sm text-text-muted">Loading…</p>
          ) : (
            <div className="mt-4 divide-y divide-border-muted rounded-lg border border-border-muted">
              {providers.map((status) => (
                <div key={status.provider} className="px-4 py-1">
                  <ProviderKeyField status={status} />
                  <ExecutionModeSelector status={status} />
                </div>
              ))}
            </div>
          )}

          {providersLoaded ? (
            <div className="mt-4">
              <ToolsPanelStub providers={providers} />
            </div>
          ) : null}
        </section>

        <section className="mt-6 rounded-xl border border-border-muted bg-background-surface p-6 shadow-surface">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-background-accent-muted text-text-accent">
              <MessageSquareText className="size-4" strokeWidth={2.25} aria-hidden="true" />
            </span>
            <h2 className="text-base font-semibold text-text-primary">Brand/Voice Profile</h2>
          </div>
          {!brandProfileLoaded ? (
            <p className="mt-4 text-sm text-text-muted">Loading…</p>
          ) : (
            <div className="mt-4">
              <BrandProfileEditor brandProfile={brandProfile} />
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
