// The real adapter (ADR-0018: only Claude is actually wired up for MVP). Talks to
// Anthropic's Messages API directly via `fetch` + manual SSE parsing rather than
// pulling in the `@anthropic-ai/sdk` package — this is one streaming endpoint, Node's
// built-in `fetch` already speaks SSE as a plain readable stream, and avoiding the
// dependency means no `npm install` step before this can run.

import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { provider_credentials } from "../db/schema.js";
import { decrypt } from "../db/crypto.js";
import type { ProviderAdapter, ChatInput, ChatChunk, ModelInfo } from "./types.js";

const API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOKENS = 8192;

// Hosted web search (Istiyak: "websearch... on/off") — GA, no beta header, works with
// streaming (confirmed against Anthropic's own docs while building this). $10/1,000
// searches, billed per use regardless of result count, in ADDITION to token cost — see
// the cost-estimate comment near the bottom of this file for how that's folded in.
// max_uses caps how many searches Claude can run FOR ONE TURN, not a global limit — 3 is
// a conservative default so one ambiguous prompt can't silently rack up several dollars
// of searches; raise it later if that turns out too stingy in practice.
const WEB_SEARCH_TOOL = { type: "web_search_20250305", name: "web_search", max_uses: 3 };
const WEB_SEARCH_COST_PER_USE = 0.01;

// Extended thinking (Istiyak: "thinking on/off") — deliberately NOT a request
// parameter here. Confirmed against Anthropic's own docs: Claude's 5.5-generation
// models (claude-sonnet-5-5 etc., what every CLAUDE_MODELS entry below actually is)
// think adaptively ALREADY, with no `thinking` field sent at all — sending
// `thinking: {"type": "enabled", ...}` (the manual-mode shape older model generations
// used) is REJECTED with a 400 on these models; the only accepted way to request LESS
// thinking is `{"type": "between_tools"}`, which isn't what a "thinking ON" toggle
// should do. So this toggle controls DISPLAY, not the model's behavior: Claude is
// already producing `thinking` content blocks on its own when it judges a prompt needs
// them; this adapter always receives them but only forwards them to the caller (as
// "thinking" chunks) when `input.thinkingEnabled` is true, and silently drops them
// otherwise. No extra request field, no extra cost beyond the thinking tokens Claude
// already spends either way, and no risk of a 400 from a parameter this model
// generation doesn't accept.

// Three tiers, matching the "cheap/fast model for a quick summary node, a stronger one
// for heavy synthesis" requirement (ADR-0052) — real, current Anthropic Messages API
// model identifiers, not placeholders. Sonnet is the pre-selected default (F-12: "never
// requires a choice before it's usable") — the balanced middle tier, not the cheapest
// or the strongest, so a freshly placed node is immediately reasonable for most prompts
// without the user having to think about cost/quality tradeoffs first.
const CLAUDE_MODELS: ModelInfo[] = [
  { id: "claude-haiku-5-5", label: "Haiku (fast, cheap)", inputCostPer1kTokens: 0.001, outputCostPer1kTokens: 0.005 },
  { id: "claude-sonnet-5-5", label: "Sonnet (balanced)", inputCostPer1kTokens: 0.003, outputCostPer1kTokens: 0.015 },
  { id: "claude-opus-5-5", label: "Opus (strongest)", inputCostPer1kTokens: 0.015, outputCostPer1kTokens: 0.075 },
];

async function getApiKey(): Promise<string | null> {
  const [row] = await db.select().from(provider_credentials).where(eq(provider_credentials.provider, "claude"));
  if (!row?.api_key) return null;
  try {
    return decrypt(row.api_key);
  } catch {
    // A corrupted/undecryptable stored key reads the same as "not configured" to every
    // caller — crypto.ts's own comment documents this exact failure mode (a rotated
    // .local-key file leaves old ciphertext undecryptable); never throw a raw crypto
    // error up into a chat request.
    return null;
  }
}

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };
type AnthropicMessage = { role: "user" | "assistant"; content: string | AnthropicContentBlock[] };

// Builds the message list Anthropic's API expects: prior turns, then the final user
// turn with the resolved context/notes/brand-profile folded in as a prefix — keeping
// history messages themselves exactly as the user/assistant actually said them (not
// re-padded with context on every turn) is what makes the running conversation read
// naturally rather than repeating the same connected-node content every message.
function buildMessages(input: ChatInput): AnthropicMessage[] {
  const parts: string[] = [];
  if (input.context.length > 0) {
    parts.push(
      "The following content is connected to this conversation as reference context:\n\n" +
        input.context.map((item) => `--- ${item.label} ---\n${item.content}`).join("\n\n")
    );
  }
  if (input.brandProfile) {
    parts.push(`Brand/Voice Profile (match this voice in your response):\n${input.brandProfile}`);
  }
  if (input.notesForAI) {
    parts.push(`Additional instructions for this node:\n${input.notesForAI}`);
  }
  parts.push(input.prompt);
  const promptText = parts.join("\n\n");

  // Images (if any) go in as their own content blocks, ahead of the text block — the
  // order Anthropic's own vision examples use. Only this turn's own images: see
  // ChatInput.images' doc comment for why history never carries image bytes.
  const finalContent: string | AnthropicContentBlock[] =
    input.images && input.images.length > 0
      ? [
          ...input.images.map((img) => ({
            type: "image" as const,
            source: { type: "base64" as const, media_type: img.mediaType, data: img.base64 },
          })),
          { type: "text" as const, text: promptText },
        ]
      : promptText;

  return [...input.history, { role: "user", content: finalContent }];
}

async function* streamChat(input: ChatInput): AsyncGenerator<ChatChunk> {
  const apiKey = await getApiKey();
  if (!apiKey) {
    yield { type: "error", message: "No Claude API key saved — add one in Settings." };
    return;
  }

  let response: Response;
  try {
    response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: input.model,
        max_tokens: MAX_TOKENS,
        stream: true,
        messages: buildMessages(input),
        ...(input.webSearchEnabled ? { tools: [WEB_SEARCH_TOOL] } : {}),
      }),
      signal: input.signal,
    });
  } catch {
    yield { type: "error", message: "Couldn't reach Claude — check your internet connection and try again." };
    return;
  }

  if (!response.ok || !response.body) {
    let detail = "";
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      detail = body?.error?.message ?? "";
    } catch {
      // No JSON body to read — fall through with the generic message below.
    }
    const message =
      response.status === 401
        ? "Claude rejected the API key — check it's correct and active in Settings."
        : response.status === 429
          ? "Claude's rate limit was hit — wait a moment and try again."
          : `Claude returned an error${detail ? `: ${detail}` : ` (status ${response.status}).`}`;
    yield { type: "error", message };
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let webSearches = 0;

  // Tracks each open content block by its stream index — needed because web search's
  // query arrives as fragments (`input_json_delta`/`partial_json`) that only become a
  // real query once the block closes, and because a `thinking` block's deltas need a
  // different ChatChunk type than a `text` block's, keyed by the SAME per-index
  // bookkeeping. Cleared per block on `content_block_stop`.
  const openBlocks = new Map<number, { kind: "text" | "thinking" | "web_search"; partialJson: string }>();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by a blank line; a frame may arrive split across
      // multiple chunks, so only fully-received frames (everything before the last
      // "\n\n") are processed each pass — the remainder stays in `buffer` for the next
      // read.
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        const dataLine = frame.split("\n").find((line) => line.startsWith("data:"));
        if (!dataLine) continue;
        let event: Record<string, unknown>;
        try {
          event = JSON.parse(dataLine.slice(5).trim());
        } catch {
          continue; // a malformed frame is skipped, not fatal to the rest of the stream
        }

        if (event.type === "message_start") {
          const usage = (event.message as { usage?: { input_tokens?: number } } | undefined)?.usage;
          inputTokens = usage?.input_tokens ?? 0;
        } else if (event.type === "content_block_start") {
          const index = event.index as number;
          const block = event.content_block as { type?: string; name?: string; content?: unknown } | undefined;
          if (block?.type === "thinking") {
            openBlocks.set(index, { kind: "thinking", partialJson: "" });
          } else if (block?.type === "server_tool_use" && block.name === "web_search") {
            openBlocks.set(index, { kind: "web_search", partialJson: "" });
            webSearches += 1;
          } else if (block?.type === "web_search_tool_result") {
            // The result content arrives whole in this start event, not via deltas.
            // `content` is an array of `web_search_result` objects on success, or a
            // single `web_search_tool_result_error` object on failure (e.g. the
            // max_uses cap above was hit) — surfaced as an empty result list rather
            // than treated as a fatal error, since the turn can still finish without
            // search results.
            const content = block.content;
            const results = Array.isArray(content)
              ? (content as Array<{ url?: string; title?: string }>)
                  .filter((r) => r.url)
                  .map((r) => ({ url: r.url!, title: r.title ?? r.url! }))
              : [];
            yield { type: "search_results", results };
          }
        } else if (event.type === "content_block_delta") {
          const index = event.index as number;
          const delta = event.delta as
            | { type?: string; text?: string; thinking?: string; partial_json?: string }
            | undefined;
          if (delta?.type === "text_delta" && delta.text) {
            yield { type: "text", text: delta.text };
          } else if (delta?.type === "thinking_delta" && delta.thinking) {
            // Always received from Claude (these 5.5-generation models think
            // adaptively by default — see this file's top-of-file comment); only
            // forwarded to the caller when the node's own toggle asked to see it.
            if (input.thinkingEnabled) yield { type: "thinking", text: delta.thinking };
          } else if (delta?.type === "input_json_delta" && delta.partial_json) {
            const open = openBlocks.get(index);
            if (open) open.partialJson += delta.partial_json;
          }
        } else if (event.type === "content_block_stop") {
          const index = event.index as number;
          const open = openBlocks.get(index);
          if (open?.kind === "web_search" && open.partialJson) {
            try {
              const parsed = JSON.parse(open.partialJson) as { query?: string };
              if (parsed.query) yield { type: "search_query", query: parsed.query };
            } catch {
              // Query JSON never finished cleanly — not worth failing the whole
              // response over a missing "Searching: ..." label.
            }
          }
          openBlocks.delete(index);
        } else if (event.type === "message_delta") {
          const usage = (event.usage as { output_tokens?: number } | undefined) ?? undefined;
          if (usage?.output_tokens !== undefined) outputTokens = usage.output_tokens;
        } else if (event.type === "error") {
          const err = event.error as { message?: string } | undefined;
          yield { type: "error", message: err?.message ?? "Claude returned an error mid-stream." };
          return;
        }
      }
    }
  } catch {
    yield { type: "error", message: "The connection to Claude dropped mid-response. Try sending again." };
    return;
  }

  yield { type: "done", usage: { inputTokens, outputTokens, webSearches: webSearches || undefined } };
}

export const claudeAdapter: ProviderAdapter = {
  id: "claude",
  isConfigured: async () => (await getApiKey()) !== null,
  listModels: () => CLAUDE_MODELS,
  webSearchCostPerUse: WEB_SEARCH_COST_PER_USE,
  streamChat,
};
