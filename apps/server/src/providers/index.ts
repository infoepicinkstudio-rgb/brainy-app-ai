// Registry — the one place that maps a provider id to its adapter instance. Every
// caller (chat.ts's SSE route, anything that needs `isConfigured`/`listModels`) goes
// through `getAdapter`, never importing claude.ts/openai.ts/gemini.ts directly — this
// is what makes F-22 (enabling OpenAI/Gemini for real in Phase 6) a change to those two
// files alone, nothing that calls this registry needs to change at all.

import type { ProviderAdapter, ProviderId } from "./types.js";
import { claudeAdapter } from "./claude.js";
import { openaiAdapter } from "./openai.js";
import { geminiAdapter } from "./gemini.js";

const ADAPTERS: Record<ProviderId, ProviderAdapter> = {
  claude: claudeAdapter,
  openai: openaiAdapter,
  gemini: geminiAdapter,
};

export function getAdapter(provider: ProviderId): ProviderAdapter {
  return ADAPTERS[provider];
}

export function listAdapters(): ProviderAdapter[] {
  return Object.values(ADAPTERS);
}

export type { ProviderAdapter, ProviderId, ChatInput, ChatChunk, ModelInfo, ContextItem } from "./types.js";
