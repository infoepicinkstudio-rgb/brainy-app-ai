// Settings store (architecture.md §3.2) — profile, provider key *presence* (never the
// raw key — that never leaves the backend, architecture.md §6), and the local
// Brand/Voice Profile. One store for this concern, not folded into a giant global store.

import { create } from "zustand";
import { api } from "@/lib/api";

export type Provider = "claude" | "openai" | "gemini";
export type ExecutionMode = "local" | "native" | "manual";

export interface Profile {
  id: string;
  name: string;
  avatar_initials: string;
}

export interface ProviderStatus {
  provider: Provider;
  isConfigured: boolean;
  isEnabled: boolean;
  executionMode: ExecutionMode;
}

export interface BrandProfile {
  id: string;
  label: string;
  content: string;
}

interface SettingsState {
  // Profile
  profile: Profile | null;
  profileLoaded: boolean;
  // Whether the gate should currently show the Boards List vs. the welcome-back
  // screen — cosmetic only (architecture.md TF-01's "Sign Out" never touches the
  // stored profile row; this flag resets to true on reload).
  sessionActive: boolean;
  // True while the welcome-back screen's "Not you?" flow is open — forces the gate to
  // show the blank name input (FirstRunLogin) even though a profile row still exists,
  // so switching identity doesn't require actually deleting that row first. Reset to
  // false as soon as a new name is saved (or the switch is cancelled).
  isSwitchingProfile: boolean;
  // Set when the initial profile load fails (almost always: the backend isn't
  // running). Distinct from a per-action error, since the app-load gate has no
  // "retry" button of its own to attach one to — AppGate shows this instead of
  // hanging on a loading spinner forever (architecture.md §6, testing.md F-25).
  profileLoadError: string | null;

  // Providers
  providers: ProviderStatus[];
  providersLoaded: boolean;

  // Brand/Voice Profile
  brandProfile: BrandProfile | null;
  brandProfileLoaded: boolean;

  loadProfile: () => Promise<void>;
  retryLoadProfile: () => Promise<void>;
  saveProfile: (name: string) => Promise<void>;
  signOut: () => void;
  continueSession: () => void;
  startProfileSwitch: () => void;
  cancelProfileSwitch: () => void;

  loadProviders: () => Promise<void>;
  saveProviderKey: (provider: Provider, apiKey: string) => Promise<void>;
  clearProviderKey: (provider: Provider) => Promise<void>;
  setExecutionMode: (provider: Provider, mode: ExecutionMode) => Promise<void>;

  loadBrandProfile: () => Promise<void>;
  saveBrandProfile: (content: string) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  profile: null,
  profileLoaded: false,
  sessionActive: true,
  isSwitchingProfile: false,
  profileLoadError: null,

  providers: [],
  providersLoaded: false,

  brandProfile: null,
  brandProfileLoaded: false,

  loadProfile: async () => {
    try {
      const { profile } = await api.get<{ profile: Profile | null }>("/api/profile");
      set({ profile, profileLoaded: true, profileLoadError: null });
    } catch {
      // Almost always means the backend isn't running — AppGate shows this instead
      // of hanging on a loading spinner forever.
      set({ profileLoadError: "Can't reach the Brainy.ai backend. Check that the server is running." });
    }
  },

  retryLoadProfile: async () => {
    set({ profileLoadError: null });
    await get().loadProfile();
  },

  saveProfile: async (name: string) => {
    const { profile } = await api.post<{ profile: Profile }>("/api/profile", { name });
    set({ profile, profileLoaded: true, sessionActive: true, isSwitchingProfile: false });
  },

  signOut: () => set({ sessionActive: false }),
  continueSession: () => set({ sessionActive: true }),
  startProfileSwitch: () => set({ isSwitchingProfile: true }),
  cancelProfileSwitch: () => set({ isSwitchingProfile: false }),

  loadProviders: async () => {
    const { providers } = await api.get<{ providers: ProviderStatus[] }>("/api/providers");
    set({ providers, providersLoaded: true });
  },

  saveProviderKey: async (provider, apiKey) => {
    const updated = await api.put<ProviderStatus>(`/api/providers/${provider}`, { apiKey });
    set({ providers: replaceProvider(get().providers, updated) });
  },

  clearProviderKey: async (provider) => {
    const updated = await api.delete<ProviderStatus>(`/api/providers/${provider}`);
    set({ providers: replaceProvider(get().providers, updated) });
  },

  setExecutionMode: async (provider, mode) => {
    const updated = await api.put<ProviderStatus>(`/api/providers/${provider}`, { executionMode: mode });
    set({ providers: replaceProvider(get().providers, updated) });
  },

  loadBrandProfile: async () => {
    const { brandProfile } = await api.get<{ brandProfile: BrandProfile | null }>("/api/brand-profile");
    set({ brandProfile, brandProfileLoaded: true });
  },

  saveBrandProfile: async (content: string) => {
    const { brandProfile } = await api.put<{ brandProfile: BrandProfile }>("/api/brand-profile", { content });
    set({ brandProfile });
  },
}));

function replaceProvider(providers: ProviderStatus[], updated: ProviderStatus): ProviderStatus[] {
  const exists = providers.some((p) => p.provider === updated.provider);
  if (!exists) return [...providers, updated];
  return providers.map((p) => (p.provider === updated.provider ? updated : p));
}
