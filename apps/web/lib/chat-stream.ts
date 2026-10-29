// SSE client for the chat node's send/stream loop (TF-07/TF-08), plus the small REST
// helpers around it (sessions, image upload) that the card redesign needed. `lib/api.ts`'s
// `request()` wrapper always calls `response.json()` on the WHOLE body — fine for every
// other endpoint, but the chat route's success path (routes/chat.ts) hands back a live
// `text/event-stream`, not a single JSON document, so this needed its own raw `fetch`
// that reads the response body as a stream rather than buffering and parsing it once.
// `EventSource` was considered and rejected: it can only ever send a GET, and this route
// needs a POST body (the prompt, attachments, toggles) — a documented EventSource
// limitation, not an oversight.

import { API_BASE_URL, api, ApiError, manualAssembleRequest, generateMindmapRequest } from "@/lib/api";
import type { MindmapTreeNode } from "@/stores/board-store";

export type ChatStreamEvent =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | { type: "search_query"; query: string }
  | { type: "search_results"; results: { url: string; title: string }[] }
  // Phase 5 (ADR-0044/ADR-0085/ADR-0086/ADR-0087) — emitted by chat.ts mid-`assembleContext`
  // when a connected video/audio/link node's content isn't cached yet and the lazy
  // pipeline is about to run for it. Purely informational (never terminates the
  // stream) — chat-node.tsx shows it as an in-progress line, and once a `done`/`error`
  // eventually arrives, triggers a `refreshNodesData([nodeId])` so that node's own card
  // picks up its new transcript/status without a full board reload.
  | { type: "extracting"; nodeId: string; label: string }
  | { type: "done" }
  | { type: "error"; message: string };

export interface ChatAttachment {
  storedName: string;
  mimeType: string;
  originalName: string;
}

export interface ChatSession {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export async function listChatSessions(boardId: string, nodeId: string): Promise<ChatSession[]> {
  const { sessions } = await api.get<{ sessions: ChatSession[] }>(`/api/boards/${boardId}/nodes/${nodeId}/sessions`);
  return sessions;
}

export async function createChatSession(boardId: string, nodeId: string): Promise<ChatSession> {
  const { session } = await api.post<{ session: ChatSession }>(`/api/boards/${boardId}/nodes/${nodeId}/sessions`, {});
  return session;
}

// Manual Input bridge (F-12/F-20, Phase 6) ---------------------------------------
// Two plain REST calls, deliberately NOT streamed — there's no model response to
// stream, just (1) build the text Istiyak would paste elsewhere, and (2) save
// whatever he pastes back as an ordinary turn.

/** Preview-only — runs the same context-assembly pipeline every other execution
 * mode uses (so a connected video/link can still trigger extraction on a cache
 * miss) and returns the plain-text prompt to show in a copy box. Never writes to
 * `chat_messages`. */
export async function assembleManualPrompt(boardId: string, nodeId: string, prompt: string): Promise<string> {
  const { assembledPrompt } = await manualAssembleRequest<{ assembledPrompt: string }>(
    `/api/boards/${boardId}/nodes/${nodeId}/manual-assemble`,
    { prompt }
  );
  return assembledPrompt;
}

export interface ManualTurnMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

/** Commits a completed manual turn — the prompt that was sent externally, plus the
 * reply pasted back in. Saved as an ordinary user/assistant pair (routes/chat.ts's
 * `/manual-turn`), same shape `chat-history` already returns, so the two messages
 * this resolves to can be appended straight onto the existing `messages` list. */
export async function saveManualTurn(
  boardId: string,
  nodeId: string,
  prompt: string,
  response: string,
  sessionId?: string
): Promise<{ userMessage: ManualTurnMessage; assistantMessage: ManualTurnMessage }> {
  return api.post<{ userMessage: ManualTurnMessage; assistantMessage: ManualTurnMessage }>(
    `/api/boards/${boardId}/nodes/${nodeId}/manual-turn`,
    { prompt, response, sessionId }
  );
}

// Mindmap generation (F-17/TF-10, ADR-0101) -------------------------------------
// One plain POST, no SSE — see routes/chat.ts's own comment on `/generate-mindmap`
// for why this is a one-shot structuring call, not a conversation turn.

export interface GeneratedMindmap {
  topic: string;
  children: MindmapTreeNode[];
}

export async function generateMindmap(boardId: string, nodeId: string, content: string): Promise<GeneratedMindmap> {
  return generateMindmapRequest<GeneratedMindmap>(`/api/boards/${boardId}/nodes/${nodeId}/generate-mindmap`, { content });
}

/** Uploads one image ahead of sending — returned `ChatAttachment` is what gets passed
 * back in `streamChat`'s own `attachments` option. Bypasses `lib/api.ts`'s `request()`
 * the same way its own `uploadFile` does: no `Content-Type: application/json`, and
 * `fetch` sets the multipart boundary header itself from a `FormData` body. */
export async function uploadChatImage(boardId: string, nodeId: string, file: File): Promise<ChatAttachment> {
  const formData = new FormData();
  formData.append("image", file);
  const response = await fetch(`${API_BASE_URL}/api/boards/${boardId}/nodes/${nodeId}/chat-images`, {
    method: "POST",
    body: formData,
  });
  if (!response.ok) {
    let message = `Image upload failed (${response.status}).`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // No JSON body — keep the generic message.
    }
    throw new ApiError(message, response.status);
  }
  return (await response.json()) as ChatAttachment;
}

export interface StreamChatOptions {
  sessionId?: string;
  attachments?: ChatAttachment[];
  webSearchEnabled?: boolean;
  thinkingEnabled?: boolean;
  signal?: AbortSignal;
}

/**
 * Streams one send to a chat node. Mirrors the backend's `ChatChunk` contract
 * (providers/types.ts) one layer up: this never throws either — every failure mode
 * (network error, non-2xx response before streaming started, a mid-stream `error`
 * event, or the connection dropping before a `done`/`error` ever arrived) surfaces as a
 * single `{type: "error", message}` yield, so the chat node component has exactly one
 * error path to render regardless of which stage failed.
 */
export async function* streamChat(
  boardId: string,
  nodeId: string,
  prompt: string,
  options: StreamChatOptions = {}
): AsyncGenerator<ChatStreamEvent> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/boards/${boardId}/nodes/${nodeId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        sessionId: options.sessionId,
        attachments: options.attachments,
        webSearchEnabled: options.webSearchEnabled,
        thinkingEnabled: options.thinkingEnabled,
      }),
      signal: options.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return; // caller cancelled — no error to show
    yield { type: "error", message: "Can't reach the Brainy.ai backend. Check that the server is running." };
    return;
  }

  // The route returns an ordinary JSON error response (400/404) for every failure that
  // happens BEFORE `reply.hijack()` runs (node not found, no prompt, no model, an inert
  // execution mode, no key saved, an unreadable attachment) — those never reach the SSE
  // stage at all, so they're read as plain JSON here rather than parsed as SSE frames.
  if (!response.ok) {
    let message = `Chat request failed (${response.status}).`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // No JSON body — keep the generic message.
    }
    yield { type: "error", message };
    return;
  }

  if (!response.body) {
    yield { type: "error", message: "The server didn't return a streamable response." };
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by a blank line (`\n\n`) — matches `writeSseEvent`'s
      // own `data: ${json}\n\n` framing on the server exactly.
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const line = frame.split("\n").find((l) => l.startsWith("data: "));
        if (line) {
          const parsed = JSON.parse(line.slice("data: ".length)) as ChatStreamEvent;
          yield parsed;
          if (parsed.type === "done" || parsed.type === "error") return;
        }
        boundary = buffer.indexOf("\n\n");
      }
    }
    // Stream ended (connection closed) without ever sending a `done` or `error` frame —
    // treat as a failure rather than silently stopping, so the chat node can show a
    // retry affordance (F-25) instead of leaving the last partial response looking final.
    yield { type: "error", message: "The connection was lost before the response finished." };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return;
    yield { type: "error", message: "The connection was lost before the response finished." };
  }
}
