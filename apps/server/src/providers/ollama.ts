// Local LLM execution mode (Istiyak: build this instead of Manual Input, since it's the
// only path that gives real, automatic, in-app AI synthesis at zero marginal cost per
// message — a model runs on Istiyak's own machine via Ollama (free, https://ollama.com),
// and this backend talks to it over localhost instead of a billed cloud API).
//
// Deliberately NOT registered in providers/index.ts's `ADAPTERS` map, and doesn't
// implement the full `ProviderAdapter` shape (no `id: ProviderId` — "claude" | "openai" |
// "gemini" has no "ollama" slot, and adding one would wrongly conflate "which provider
// this node displays as" with "which backend actually executes it"). A chat node keeps
// whichever provider icon/model list it was placed with; `executionMode === "local"`
// just means routes/chat.ts calls THIS adapter directly instead of `getAdapter(provider)`,
// regardless of the node's own `provider` field. See routes/chat.ts's own comment at the
// call site for the full routing logic.

import type { ChatInput, ChatChunk, ModelInfo } from "./types.js";

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";

/** Real-time status check — unlike the cloud adapters' `isConfigured()` (a stored API
 * key, checked once), "is Local LLM usable" can change from one moment to the next
 * (Ollama not installed, installed but not running, running but no model pulled yet),
 * so this is a live probe against Ollama's own `/api/tags`, not a cached flag. Used by
 * both the chat route (to give an honest error instead of a confusing one) and the
 * `GET /api/providers/local-models` route (so the frontend's model picker can show
 * Ollama's REAL installed models instead of a static list that would drift out of sync
 * with whatever the user has actually pulled). A short timeout and a caught exception
 * both read as "not available" — Ollama simply not running is the overwhelmingly common
 * case, not an error worth logging. */
export async function getLocalStatus(): Promise<{ available: boolean; models: ModelInfo[] }> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(2000) });
    if (!response.ok) return { available: false, models: [] };
    const body = (await response.json()) as { models?: Array<{ name: string }> };
    const models = (body.models ?? []).map((m) => ({ id: m.name, label: m.name }));
    return { available: models.length > 0, models };
  } catch {
    return { available: false, models: [] };
  }
}

type OllamaMessage = { role: "system" | "user" | "assistant"; content: string; images?: string[] };

/** Live capability probe for ONE model, via Ollama's own `/api/show` (ADR-0089) —
 * returns `null` on anything uncertain (older Ollama without a `capabilities` field,
 * not running, network hiccup) rather than `false`, so the caller can fail OPEN
 * (attempt to send the image anyway) instead of blocking on a check we can't actually
 * verify. Only a confirmed, named list of capabilities that excludes "vision" should
 * produce the "this model can't see images" error — anything else is a guess. */
async function getModelCapabilities(model: string): Promise<string[] | null> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/show`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model }),
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { capabilities?: string[] };
    return body.capabilities ?? null;
  } catch {
    return null;
  }
}

// A system message rather than Claude's own "prefix the final user turn" approach
// (claude.ts's `buildMessages`) — more idiomatic for the kind of open-weight model
// Ollama typically serves, and it means connected-node context isn't re-sent inside
// every user turn's own content, just once as the system message each request.
function buildOllamaMessages(input: ChatInput): OllamaMessage[] {
  const systemParts: string[] = [];
  if (input.context.length > 0) {
    systemParts.push(
      "The following content is connected to this conversation as reference context:\n\n" +
        input.context.map((item) => `--- ${item.label} ---\n${item.content}`).join("\n\n")
    );
  }
  if (input.brandProfile) systemParts.push(`Brand/Voice Profile (match this voice in your response):\n${input.brandProfile}`);
  if (input.notesForAI) systemParts.push(`Additional instructions for this node:\n${input.notesForAI}`);

  const messages: OllamaMessage[] = [];
  if (systemParts.length > 0) messages.push({ role: "system", content: systemParts.join("\n\n") });
  messages.push(...input.history);

  // Images (ADR-0089, reverses this file's earlier "Ollama doesn't standardize this"
  // assumption — checked against Ollama's own API docs, not just inherited): Ollama DOES
  // standardize multimodal input across every vision model it serves (llava, qwen3-vl,
  // qwen2.5-vl, gemma4, …) via one `images` field per message — a plain array of
  // base64 strings (no `data:` URI prefix), attached the same way regardless of which
  // vision model is actually installed; Ollama itself handles the per-model formatting
  // server-side. NOTE: llama3.2-vision (`mllama` architecture) is NOT in this list —
  // Ollama's v0.30.0 engine change (moved model loading onto llama.cpp) dropped mllama
  // support, and as of this writing it hasn't come back, so a freshly pulled
  // llama3.2-vision fails to load entirely ("unknown model architecture: 'mllama'") on
  // any current Ollama install. Don't suggest it as the example vision model anywhere
  // in this file or in user-facing copy until that's confirmed fixed upstream.
  // Only THIS turn's images are attached (same rule as claude.ts — see
  // ChatInput.images' own doc comment for why history never carries image bytes).
  const userMessage: OllamaMessage = { role: "user", content: input.prompt };
  if (input.images && input.images.length > 0) {
    userMessage.images = input.images.map((img) => img.base64);
  }
  messages.push(userMessage);
  return messages;
}

async function* streamChat(input: ChatInput): AsyncGenerator<ChatChunk> {
  // Checked BEFORE spending a full round-trip on a request that would otherwise just
  // silently ignore the image bytes (ADR-0089) — this exact silent-failure shape (text
  // model gets an image, says nothing about not seeing it, answer looks wrong rather
  // than clearly blocked) is what prompted this whole fix in the first place, so a
  // confirmed non-vision model gets a clear, actionable error instead of another one.
  if (input.images && input.images.length > 0) {
    const capabilities = await getModelCapabilities(input.model);
    if (capabilities && !capabilities.includes("vision")) {
      yield {
        type: "error",
        message: `"${input.model}" can't see images — it's a text-only model. Pull a vision model (e.g. "ollama pull qwen3-vl" or "ollama pull llava") and switch to it in the model picker, then try again.`,
      };
      return;
    }
  }

  let response: Response;
  try {
    response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: input.model, messages: buildOllamaMessages(input), stream: true }),
    });
  } catch {
    yield {
      type: "error",
      message: "Couldn't reach Ollama — make sure it's installed and running (ollama.com), and that you've pulled a model.",
    };
    return;
  }

  if (!response.ok || !response.body) {
    let detail = "";
    try {
      const body = (await response.json()) as { error?: string };
      detail = body?.error ?? "";
    } catch {
      // No JSON body to read — fall through with the generic message below.
    }
    yield {
      type: "error",
      message: `Ollama returned an error${detail ? `: ${detail}` : "."} Check that "${input.model}" is actually pulled (ollama list).`,
    };
    return;
  }

  // Ollama's native streaming format is newline-delimited JSON (one complete object per
  // line), NOT Server-Sent Events like Anthropic's API — no "data: " prefix, no blank-line
  // frame separator, so this parses differently from claude.ts's own SSE loop even
  // though both ultimately yield the same ChatChunk shape.
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let promptEvalCount = 0;
  let evalCount = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? ""; // a trailing partial line is held for the next read

      for (const line of lines) {
        if (!line.trim()) continue;
        let event: { message?: { content?: string }; done?: boolean; prompt_eval_count?: number; eval_count?: number; error?: string };
        try {
          event = JSON.parse(line);
        } catch {
          continue; // a malformed line is skipped, not fatal to the rest of the stream
        }
        if (event.error) {
          yield { type: "error", message: `Ollama error: ${event.error}` };
          return;
        }
        if (event.message?.content) {
          yield { type: "text", text: event.message.content };
        }
        if (event.done) {
          promptEvalCount = event.prompt_eval_count ?? 0;
          evalCount = event.eval_count ?? 0;
        }
      }
    }
  } catch {
    yield { type: "error", message: "The connection to Ollama dropped mid-response. Try sending again." };
    return;
  }

  // Real token counts from Ollama's own final event — genuinely useful to show (how
  // much a local turn actually cost in compute terms), even though `estimated_cost`
  // stays null for every Local LLM message (F-29: "Local LLM... running total does NOT
  // increase" — this adapter's `listModels()` returns no per-token rates on purpose,
  // which is what makes routes/chat.ts's cost calc skip it automatically).
  yield { type: "done", usage: { inputTokens: promptEvalCount, outputTokens: evalCount } };
}

/** Deliberately NOT a `ProviderAdapter` (see this file's top comment) — just the same
 * shape minus `id`, so routes/chat.ts's `executionMode === "local" ? ollamaAdapter :
 * getAdapter(provider)` ternary produces a clean union TypeScript can call through
 * uniformly (including the optional `webSearchCostPerUse`, which this adapter has
 * nothing to set — Ollama has no hosted search), rather than two incompatible shapes. */
interface LocalAdapter {
  isConfigured(): Promise<boolean>;
  listModels(): ModelInfo[];
  webSearchCostPerUse?: number;
  streamChat(input: ChatInput): AsyncGenerator<ChatChunk>;
}

export const ollamaAdapter: LocalAdapter = {
  isConfigured: async () => (await getLocalStatus()).available,
  listModels: (): ModelInfo[] => [], // see getLocalStatus() — the real, live list
  streamChat,
};
