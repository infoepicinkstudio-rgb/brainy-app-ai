// The provider-adapter interface — architecture.md §4.2, built for real in Phase 4.
// Every AI provider (Claude, OpenAI, Gemini) implements this SAME shape; only Claude is
// wired up to a real API in this phase (ADR-0018), OpenAI/Gemini are stubs that satisfy
// the interface so the tools panel's reserved slots are real, not decorative, and so
// Phase 6 (F-22) adds real implementations without touching anything that calls through
// this interface.

export type ProviderId = "claude" | "openai" | "gemini";

export interface ModelInfo {
  id: string;
  /** Human-readable label for the model selector UI (chat-node.tsx). */
  label: string;
  /** Estimated published per-token rates in USD, for F-29's cost tracking. Both
   * optional — a stub provider with no real pricing yet (or a model whose rate isn't
   * worth hand-maintaining) just omits them, and cost tracking silently skips that
   * message rather than inventing a number. */
  inputCostPer1kTokens?: number;
  outputCostPer1kTokens?: number;
}

/** One connected node's resolved content, assembled server-side (context-assembly.ts)
 * before being handed to an adapter — the adapter itself never queries the DB. */
export interface ContextItem {
  // "video"/"audio" added for Phase 5 (ADR-0085/ADR-0086) — video and audio nodes now
  // resolve a lazily-extracted transcript the same way file/link nodes already resolve
  // their own content (context-assembly.ts's `resolveMediaNode`).
  nodeType: "text" | "file" | "link" | "chat" | "video" | "audio";
  /** A short human label for where this content came from (file name, link domain,
   * "Connected text node") — adapters that build a labeled prompt use this; adapters
   * that don't can ignore it. */
  label: string;
  content: string;
}

export interface ChatInput {
  /** Which specific model within this adapter's provider (e.g. a Claude node's chosen
   * Haiku/Sonnet/Opus) — per-node, never board-wide (ADR-0052). */
  model: string;
  /** The user's own prompt for this turn. */
  prompt: string;
  /** Prior turns in this node's own conversation (chat_messages), oldest first — NOT
   * re-assembled context, just the running dialogue so far. Deliberately plain text
   * only, even for a turn that originally had an image attached (routes/chat.ts folds
   * that into a text placeholder) — resending every prior image's bytes on every
   * later turn would be real, avoidable per-message cost for no real benefit once the
   * conversation has moved on. */
  history: { role: "user" | "assistant"; content: string }[];
  /** Resolved content from every node connected to this chat node (architecture.md
   * §4.3), already resolved to plain text — the adapter just needs to fold it into
   * the prompt it sends, never resolve it itself. */
  context: ContextItem[];
  /** The node's own free-text "notes for AI" field (F-16), if set. */
  notesForAI?: string;
  /** The local Brand/Voice Profile's content, only when this specific node opted in
   * (F-21) — already resolved to plain text by the caller. */
  brandProfile?: string;
  /** Images attached to THIS turn only (Istiyak: "Image upload in chat") — already
   * read off disk and base64-encoded by the caller (routes/chat.ts, reusing
   * lib/uploads.ts's content-addressed storage). An adapter that can't do vision
   * (OpenAI/Gemini stubs) just ignores this. */
  images?: { mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp"; base64: string }[];
  /** Whether to request real web search for this turn (Istiyak: "websearch... on/off").
   * An adapter without hosted search just ignores this. */
  webSearchEnabled?: boolean;
  /** Whether to surface the model's own reasoning as separate `thinking` chunks
   * (Istiyak: "thinking on/off"). See claude.ts's own comment on why this is a
   * DISPLAY toggle, not a request parameter, for Claude's current model generation. */
  thinkingEnabled?: boolean;
}

export type ChatChunk =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | { type: "search_query"; query: string }
  | { type: "search_results"; results: { url: string; title: string }[] }
  | {
      type: "done";
      usage?: { inputTokens: number; outputTokens: number; webSearches?: number };
    }
  | { type: "error"; message: string };

export interface ProviderAdapter {
  id: ProviderId;
  /** Has an API key been saved for this provider (provider_credentials)? Reflects real
   * key presence for every provider, including the OpenAI/Gemini stubs below — a saved
   * key is real regardless of whether `streamChat` can act on it yet, and lying here
   * would make the tools panel show a provider as usable when it isn't. */
  isConfigured(): Promise<boolean>;
  /** The model choices this provider exposes (Haiku/Sonnet/Opus for Claude, etc.) — a
   * static list for MVP, not a live API call, so the model selector never depends on
   * network access just to populate itself. */
  listModels(): ModelInfo[];
  /** Flat USD cost per web-search use (F-29), when this adapter supports hosted web
   * search — undefined for an adapter that doesn't, so routes/chat.ts's cost estimate
   * can fold this in without needing to know which provider it's talking to. */
  webSearchCostPerUse?: number;
  /** Streams a chat completion. MUST be an async generator (not a Promise<AsyncIterable>)
   * so a thrown error inside it propagates as a normal exception to the caller's `for
   * await` loop, rather than needing a separate rejected-promise path. */
  streamChat(input: ChatInput): AsyncGenerator<ChatChunk>;
}
