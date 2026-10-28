// Stub — see openai.ts's top comment for the exact reasoning; same shape, same honest
// isConfigured()/clean-error contract, just for Gemini.

import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { provider_credentials } from "../db/schema.js";
import type { ProviderAdapter, ChatChunk, ModelInfo } from "./types.js";

const GEMINI_MODELS: ModelInfo[] = [{ id: "gemini-3-pro", label: "Gemini 3 Pro" }];

async function* streamChat(): AsyncGenerator<ChatChunk> {
  yield { type: "error", message: "Gemini chat isn't built yet — this node type is reserved for a future phase." };
}

export const geminiAdapter: ProviderAdapter = {
  id: "gemini",
  isConfigured: async () => {
    const [row] = await db.select().from(provider_credentials).where(eq(provider_credentials.provider, "gemini"));
    return Boolean(row?.api_key);
  },
  listModels: () => GEMINI_MODELS,
  streamChat,
};
