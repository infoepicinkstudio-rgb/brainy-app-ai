// Stub (ADR-0018, F-22 deferred to Phase 6): satisfies the full ProviderAdapter
// interface so this provider's tools-panel slot is real, not decorative — a user CAN
// save an OpenAI key (the Settings route has existed since Phase 1) and place an OpenAI
// chat node, since `isConfigured()` here reports real key presence, same as Claude's.
// What they get on actually sending a message is a clean, honest "not built yet" error
// through the normal error-state UI (F-25) — never a crash, never a silent hang, and
// never a lie about whether the key is saved.

import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { provider_credentials } from "../db/schema.js";
import type { ProviderAdapter, ChatChunk, ModelInfo } from "./types.js";

const OPENAI_MODELS: ModelInfo[] = [{ id: "gpt-5", label: "GPT-5" }];

async function* streamChat(): AsyncGenerator<ChatChunk> {
  yield { type: "error", message: "OpenAI chat isn't built yet — this node type is reserved for a future phase." };
}

export const openaiAdapter: ProviderAdapter = {
  id: "openai",
  isConfigured: async () => {
    const [row] = await db.select().from(provider_credentials).where(eq(provider_credentials.provider, "openai"));
    return Boolean(row?.api_key);
  },
  listModels: () => OPENAI_MODELS,
  streamChat,
};
