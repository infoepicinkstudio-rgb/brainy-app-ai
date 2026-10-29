// The real adapter (Phase 6, F-22). Talks to OpenAI's Chat Completions API directly via
// `fetch` + manual SSE parsing — same reasoning as claude.ts: one streaming endpoint,
// Node's built-in `fetch` already speaks SSE as a plain readable stream, no
// `openai` package dependency needed.

import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { provider_credentials } from "../db/schema.js";
import { decrypt } from "../db/crypto.js";
import type { ProviderAdapter, ChatInput, ChatChunk, ModelInfo } from "./types.js";

const API_URL = "https://api.openai.com/v1/chat/completions";
const MAX_TOKENS = 8192;

// Three tiers, matching claude.ts's cheap/balanced/strongest shape (ADR-0052). Model IDs
// confirmed live against OpenAI's own model-docs index while building this (Oct 2026) —
// `gemini-3-pro`-style staleness is a real risk in this catalog (OpenAI deprecated the
// entire gpt-5.1 line already), so if a 404 "model not found" error ever surfaces here,
// check OpenAI's current model list and swap the id below; nothing else needs to change.
// NOTE (flagged to Istiyak, not guessed): per-token pricing for this generation wasn't
// confidently verifiable from available sources at build time (conflicting numbers,
// one figure sourced from what looked like an unrelated "Cyber models" catalog section)
// — so cost fields are deliberately omitted rather than risking a wrong number feeding
// F-29's spend tracker. Cost tracking silently skips these messages until real rates are
// confirmed and added (ADR-0052's own documented behavior for a provider with no rates).
const OPENAI_MODELS: ModelInfo[] = [
  { id: "gpt-5.6-luna", label: "GPT-5.6 Luna (fast, cheap)" },
  { id: "gpt-5.6-terra", label: "GPT-5.6 Terra (balanced)" },
  { id: "gpt-5.6-sol", label: "GPT-5.6 Sol (strongest)" },
];

async function getApiKey(): Promise<string | null> {
  const [row] = await db.select().from(provider_credentials).where(eq(provider_credentials.provider, "openai"));
  if (!row?.api_key) return null;
  try {
    return decrypt(row.api_key);
  } catch {
    // Same reasoning as claude.ts's getApiKey: a corrupted/undecryptable stored key
    // reads as "not configured" to every caller, never a raw crypto error.
    return null;
  }
}

type OpenAIContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
type OpenAIMessage = { role: "system" | "user" | "assistant"; content: string | OpenAIContentPart[] };

// System-message pattern (same choice ollama.ts made, for the same reason): connected
// context/brand-profile/notes are resent fresh as a system message each turn, never
// folded into stored history — keeps `chat_messages` holding exactly what was said.
function buildMessages(input: ChatInput): OpenAIMessage[] {
  const systemParts: string[] = [];
  if (input.context.length > 0) {
    systemParts.push(
      "The following content is connected to this conversation as reference context:\n\n" +
        input.context.map((item) => `--- ${item.label} ---\n${item.content}`).join("\n\n")
    );
  }
  if (input.brandProfile) systemParts.push(`Brand/Voice Profile (match this voice in your response):\n${input.brandProfile}`);
  if (input.notesForAI) systemParts.push(`Additional instructions for this node:\n${input.notesForAI}`);

  const messages: OpenAIMessage[] = [];
  if (systemParts.length > 0) messages.push({ role: "system", content: systemParts.join("\n\n") });
  messages.push(...input.history);

  // Images (if any) as content parts alongside the text — only THIS turn's images, same
  // rule as claude.ts/ollama.ts (ChatInput.images' own doc comment explains why history
  // never carries image bytes). OpenAI's Chat Completions API wants a data: URI here,
  // not a bare base64 string like Gemini's inlineData.
  const userContent: string | OpenAIContentPart[] =
    input.images && input.images.length > 0
      ? [
          { type: "text" as const, text: input.prompt },
          ...input.images.map((img) => ({
            type: "image_url" as const,
            image_url: { url: `data:${img.mediaType};base64,${img.base64}` },
          })),
        ]
      : input.prompt;
  messages.push({ role: "user", content: userContent });

  return messages;
}

async function* streamChat(input: ChatInput): AsyncGenerator<ChatChunk> {
  const apiKey = await getApiKey();
  if (!apiKey) {
    yield { type: "error", message: "No OpenAI API key saved — add one in Settings." };
    return;
  }

  let response: Response;
  try {
    response = await fetch(API_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: input.model,
        max_tokens: MAX_TOKENS,
        stream: true,
        stream_options: { include_usage: true },
        messages: buildMessages(input),
      }),
      signal: input.signal,
    });
  } catch {
    yield { type: "error", message: "Couldn't reach OpenAI — check your internet connection and try again." };
    return;
  }

  if (!response.ok || !response.body) {
    let detail = "";
    try {
      const body = (await response.json()) as { error?: { message?: string; code?: string } };
      detail = body?.error?.message ?? "";
    } catch {
      // No JSON body to read — fall through with the generic message below.
    }
    const message =
      response.status === 401
        ? "OpenAI rejected the API key — check it's correct and active in Settings."
        : response.status === 429
          ? "OpenAI's rate limit was hit — wait a moment and try again."
          : response.status === 404
            ? `OpenAI doesn't recognize model "${input.model}" — it may have been retired. Check OpenAI's current model list.`
            : `OpenAI returned an error${detail ? `: ${detail}` : ` (status ${response.status}).`}`;
    yield { type: "error", message };
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Same SSE frame-splitting approach as claude.ts: frames separated by a blank
      // line, a trailing partial frame held for the next read.
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        const dataLine = frame.split("\n").find((line) => line.startsWith("data:"));
        if (!dataLine) continue;
        const raw = dataLine.slice(5).trim();
        if (raw === "[DONE]") continue; // OpenAI's own stream terminator, not a JSON event

        let event: {
          choices?: Array<{ delta?: { content?: string }; finish_reason?: string }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        try {
          event = JSON.parse(raw);
        } catch {
          continue; // a malformed frame is skipped, not fatal to the rest of the stream
        }

        const delta = event.choices?.[0]?.delta?.content;
        if (delta) yield { type: "text", text: delta };

        // The final chunk (stream_options.include_usage) carries real usage and an
        // empty choices array — captured here rather than guessed from token counts.
        if (event.usage) {
          inputTokens = event.usage.prompt_tokens ?? 0;
          outputTokens = event.usage.completion_tokens ?? 0;
        }
      }
    }
  } catch {
    yield { type: "error", message: "The connection to OpenAI dropped mid-response. Try sending again." };
    return;
  }

  yield { type: "done", usage: { inputTokens, outputTokens } };
}

export const openaiAdapter: ProviderAdapter = {
  id: "openai",
  isConfigured: async () => (await getApiKey()) !== null,
  listModels: () => OPENAI_MODELS,
  streamChat,
};
