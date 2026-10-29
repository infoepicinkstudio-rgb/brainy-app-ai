// The real adapter (Phase 6, F-22). Talks to Google's Generative Language API
// (generateContent) directly via `fetch` + manual SSE parsing — same reasoning as
// claude.ts/openai.ts: one streaming endpoint, no `@google/genai` package dependency
// needed.

import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { provider_credentials } from "../db/schema.js";
import { decrypt } from "../db/crypto.js";
import type { ProviderAdapter, ChatInput, ChatChunk, ModelInfo } from "./types.js";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MAX_TOKENS = 8192;

// Three tiers, matching claude.ts's cheap/balanced/strongest shape (ADR-0052). The
// original stub's `gemini-3-pro` was confirmed DEAD — Google deprecated it in March
// 2026 — which is exactly the kind of drift this whole model catalog is prone to right
// now; if a model-not-found error ever surfaces here, check Google's current Gemini API
// model list and swap the id below, nothing else needs to change. Pricing below IS
// real, fetched from Google's own published per-1M-token rates while building this (Oct
// 2026, "through" dates are Google's own stated validity windows for these promotional
// rates — worth re-checking after they lapse).
const GEMINI_MODELS: ModelInfo[] = [
  { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite (fast, cheap)", inputCostPer1kTokens: 0.0003, outputCostPer1kTokens: 0.0025 },
  { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash (balanced)", inputCostPer1kTokens: 0.00075, outputCostPer1kTokens: 0.00375 },
  { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (strongest)", inputCostPer1kTokens: 0.002, outputCostPer1kTokens: 0.012 },
];

async function getApiKey(): Promise<string | null> {
  const [row] = await db.select().from(provider_credentials).where(eq(provider_credentials.provider, "gemini"));
  if (!row?.api_key) return null;
  try {
    return decrypt(row.api_key);
  } catch {
    // Same reasoning as claude.ts's getApiKey: a corrupted/undecryptable stored key
    // reads as "not configured" to every caller, never a raw crypto error.
    return null;
  }
}

type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };
type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };

// Gemini's own system-instruction field (not a content entry, not resent as history) —
// same "resolved context is fresh every turn, history stays exactly what was said"
// philosophy as claude.ts/openai.ts/ollama.ts, just using Gemini's own idiom for it.
function buildSystemInstruction(input: ChatInput): { parts: GeminiPart[] } | undefined {
  const parts: string[] = [];
  if (input.context.length > 0) {
    parts.push(
      "The following content is connected to this conversation as reference context:\n\n" +
        input.context.map((item) => `--- ${item.label} ---\n${item.content}`).join("\n\n")
    );
  }
  if (input.brandProfile) parts.push(`Brand/Voice Profile (match this voice in your response):\n${input.brandProfile}`);
  if (input.notesForAI) parts.push(`Additional instructions for this node:\n${input.notesForAI}`);
  return parts.length > 0 ? { parts: [{ text: parts.join("\n\n") }] } : undefined;
}

function buildContents(input: ChatInput): GeminiContent[] {
  // Gemini uses "model" where Claude/OpenAI use "assistant" — mapped here only, nothing
  // upstream of this adapter needs to know Gemini's own role vocabulary.
  const contents: GeminiContent[] = input.history.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  // Images (if any) as additional parts — only THIS turn's images, same rule as every
  // other adapter (ChatInput.images' own doc comment). Gemini's inlineData wants a bare
  // base64 string, NOT a data: URI like OpenAI's image_url — different from both other
  // adapters, confirmed against Google's own API docs while building this.
  const userParts: GeminiPart[] = [{ text: input.prompt }];
  if (input.images && input.images.length > 0) {
    for (const img of input.images) {
      userParts.push({ inlineData: { mimeType: img.mediaType, data: img.base64 } });
    }
  }
  contents.push({ role: "user", parts: userParts });
  return contents;
}

async function* streamChat(input: ChatInput): AsyncGenerator<ChatChunk> {
  const apiKey = await getApiKey();
  if (!apiKey) {
    yield { type: "error", message: "No Gemini API key saved — add one in Settings." };
    return;
  }

  const systemInstruction = buildSystemInstruction(input);

  let response: Response;
  try {
    // alt=sse makes this genuine Server-Sent Events (blank-line-delimited "data: "
    // frames) rather than Google's default newline-delimited-JSON-array streaming
    // shape — confirmed against Google's own docs; this is what makes the parsing loop
    // below able to reuse claude.ts's frame-splitting approach.
    response = await fetch(`${API_BASE}/${input.model}:streamGenerateContent?alt=sse`, {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        contents: buildContents(input),
        ...(systemInstruction ? { systemInstruction } : {}),
        generationConfig: { maxOutputTokens: MAX_TOKENS },
      }),
      signal: input.signal,
    });
  } catch {
    yield { type: "error", message: "Couldn't reach Gemini — check your internet connection and try again." };
    return;
  }

  if (!response.ok || !response.body) {
    let detail = "";
    try {
      const body = (await response.json()) as { error?: { message?: string } } | Array<{ error?: { message?: string } }>;
      const errObj = Array.isArray(body) ? body[0] : body;
      detail = errObj?.error?.message ?? "";
    } catch {
      // No JSON body to read — fall through with the generic message below.
    }
    const message =
      response.status === 400 || response.status === 403
        ? "Gemini rejected the API key — check it's correct and active in Settings."
        : response.status === 429
          ? "Gemini's rate limit was hit — wait a moment and try again."
          : response.status === 404
            ? `Gemini doesn't recognize model "${input.model}" — it may have been retired. Check Google's current model list.`
            : `Gemini returned an error${detail ? `: ${detail}` : ` (status ${response.status}).`}`;
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

      // Same SSE frame-splitting approach as claude.ts/openai.ts.
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        const dataLine = frame.split("\n").find((line) => line.startsWith("data:"));
        if (!dataLine) continue;
        let event: {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
          usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
          error?: { message?: string };
        };
        try {
          event = JSON.parse(dataLine.slice(5).trim());
        } catch {
          continue; // a malformed frame is skipped, not fatal to the rest of the stream
        }

        if (event.error) {
          yield { type: "error", message: event.error.message ?? "Gemini returned an error mid-stream." };
          return;
        }

        const text = event.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
        if (text) yield { type: "text", text };

        if (event.usageMetadata) {
          inputTokens = event.usageMetadata.promptTokenCount ?? 0;
          outputTokens = event.usageMetadata.candidatesTokenCount ?? 0;
        }
      }
    }
  } catch {
    yield { type: "error", message: "The connection to Gemini dropped mid-response. Try sending again." };
    return;
  }

  yield { type: "done", usage: { inputTokens, outputTokens } };
}

export const geminiAdapter: ProviderAdapter = {
  id: "gemini",
  isConfigured: async () => (await getApiKey()) !== null,
  listModels: () => GEMINI_MODELS,
  streamChat,
};
