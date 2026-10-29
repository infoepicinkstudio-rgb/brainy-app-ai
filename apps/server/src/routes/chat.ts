// Chat node send/stream (TF-07/TF-08, architecture.md §4.2/§4.3) — Phase 4's core loop:
// resolve connected-node context, call the node's configured provider/model, stream the
// response back over SSE, persist both turns to chat_messages with cost-tracking
// columns (F-29) on the assistant row.
//
// Istiyak follow-up pass: multiple conversation sessions per node (chat_sessions),
// image attachments (vision), real web search, and surfaced extended-thinking content —
// see providers/claude.ts's own top-of-file comments for how the latter two actually
// talk to Anthropic's API.

import type { FastifyInstance, FastifyReply } from "fastify";
import { eq, asc, desc, and, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { nodes, chat_messages, chat_sessions } from "../db/schema.js";
import { getAdapter, listAdapters, type ProviderId } from "../providers/index.js";
import { ollamaAdapter, getLocalStatus } from "../providers/ollama.js";
import { assembleContext } from "../lib/context-assembly.js";
import { saveUpload, readStoredFile } from "../lib/uploads.js";

const PROVIDERS: ProviderId[] = ["claude", "openai", "gemini"];
function isProviderId(value: unknown): value is ProviderId {
  return typeof value === "string" && (PROVIDERS as readonly string[]).includes(value);
}

interface ChatNodeData {
  provider?: string;
  model?: string;
  executionMode?: string;
}

interface AttachmentRef {
  storedName: string;
  mimeType: string;
  originalName: string;
}

const SUPPORTED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

// The sentinel id the frontend uses for "every chat_messages row saved before
// chat_sessions existed" (session_id IS NULL in the DB) — never a real chat_sessions.id
// (those are UUIDs), so every `=== LEGACY_SESSION_ID` check below is unambiguous.
const LEGACY_SESSION_ID = "legacy";

// SSE responses go around Fastify's normal send pipeline (`reply.hijack()`), which also
// means they skip @fastify/cors' own onSend hook — so the one CORS header the browser
// actually checks on a streamed response is set by hand here, matching index.ts's own
// cors registration exactly (same env var, same fallback) rather than silently relying
// on a plugin that isn't in effect for a hijacked response.
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? "http://localhost:3000";

function writeSseHeaders(reply: FastifyReply) {
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": FRONTEND_ORIGIN,
  });
}

function writeSseEvent(reply: FastifyReply, data: unknown) {
  reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
}

// Manual Input's plain-text form of exactly what every adapter's own `buildMessages`
// sends ahead of the user's prompt — claude.ts/openai.ts/ollama.ts independently
// converged on the identical context/brand-profile/notes layering, so this is that
// same layering once, for the ONE caller (manual-assemble, below) that needs the
// plain-text shape rather than a provider's own message format.
function buildAssembledPromptText(
  context: { label: string; content: string }[],
  brandProfile: string | undefined,
  notesForAI: string | undefined,
  prompt: string
): string {
  const parts: string[] = [];
  if (context.length > 0) {
    parts.push(
      "The following content is connected to this conversation as reference context:\n\n" +
        context.map((item) => `--- ${item.label} ---\n${item.content}`).join("\n\n")
    );
  }
  if (brandProfile) parts.push(`Brand/Voice Profile (match this voice in your response):\n${brandProfile}`);
  if (notesForAI) parts.push(`Additional instructions for this node:\n${notesForAI}`);
  parts.push(prompt);
  return parts.join("\n\n");
}

// Mindmap generation (F-17/TF-10, ADR-0101) ---------------------------------------
// One more call to the SAME adapter/model already configured on the chat node
// (Istiyak's own choice over a client-side heuristic parse) — reuses `streamChat`
// exactly as the real send route does, just collecting every `text` chunk into one
// string instead of forwarding it over SSE, since there's no live UI to stream into
// for a one-shot structuring call.
interface MindmapTreeNode {
  label: string;
  children?: MindmapTreeNode[];
}
interface MindmapResult {
  topic: string;
  children: MindmapTreeNode[];
}

const MINDMAP_SYSTEM_PROMPT = `You turn a piece of writing into a mindmap. Read the content below and restructure it as a short hierarchical outline: one central topic, a handful of main branches, and (only where it genuinely helps) one level of sub-branches under those. Keep every label short — a few words, not a sentence. Reply with ONLY valid JSON, no commentary, no markdown code fence, matching exactly this shape:
{"topic": "string", "children": [{"label": "string", "children": [{"label": "string"}]}]}
"children" arrays may be empty or omitted on leaf nodes. If the content below is too short, too thin, or too unstructured to meaningfully break into branches (e.g. a one-line answer, or a refusal), reply with exactly this JSON instead: {"error": "not enough structure to map"}`;

/** Strips a markdown code fence around the JSON, when a model wraps its output in one
 * despite being told not to (a common enough quirk across providers that handling it
 * here is cheaper than a second round-trip asking the model to retry without one). */
function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  return fenced ? fenced[1].trim() : trimmed;
}

/** Validates the parsed JSON actually matches MindmapResult's shape (not just "is an
 * object") before this is ever trusted as something to render a tree from — a model
 * that returns well-formed but wrong-shaped JSON (e.g. a flat array, or the wrong key
 * names) should hit the same "couldn't structure this" error path as genuinely broken
 * JSON, not a runtime crash three layers away in the frontend's tree renderer. */
function isValidMindmapTree(value: unknown): value is MindmapTreeNode {
  if (typeof value !== "object" || value === null) return false;
  const node = value as Record<string, unknown>;
  if (typeof node.label !== "string" || !node.label.trim()) return false;
  if (node.children === undefined) return true;
  return Array.isArray(node.children) && node.children.every(isValidMindmapTree);
}
function isValidMindmapResult(value: unknown): value is MindmapResult {
  if (typeof value !== "object" || value === null) return false;
  const result = value as Record<string, unknown>;
  return (
    typeof result.topic === "string" &&
    Boolean(result.topic.trim()) &&
    Array.isArray(result.children) &&
    result.children.every(isValidMindmapTree)
  );
}

export async function chatRoutes(app: FastifyInstance) {
  // Sessions -----------------------------------------------------------------

  app.get<{ Params: { boardId: string; nodeId: string } }>(
    "/api/boards/:boardId/nodes/:nodeId/sessions",
    async (request, reply) => {
      const [node] = await db.select().from(nodes).where(eq(nodes.id, request.params.nodeId));
      if (!node || node.type !== "chat") return reply.code(404).send({ error: "Chat node not found." });

      const sessions = await db
        .select()
        .from(chat_sessions)
        .where(eq(chat_sessions.node_id, node.id))
        .orderBy(desc(chat_sessions.updated_at));

      const result: Array<{ id: string; title: string | null; created_at: string; updated_at: string }> = sessions.map(
        (s) => ({ id: s.id, title: s.title, created_at: s.created_at, updated_at: s.updated_at })
      );

      // Any chat_messages row saved before this table existed has session_id === null —
      // rather than lose that history, surface it as one synthetic "Earlier
      // conversation" entry with the LEGACY_SESSION_ID sentinel. Disappears on its own
      // once no such rows remain; nothing to migrate.
      const legacyMessages = await db
        .select()
        .from(chat_messages)
        .where(and(eq(chat_messages.node_id, node.id), isNull(chat_messages.session_id)))
        .orderBy(asc(chat_messages.created_at));
      if (legacyMessages.length > 0) {
        result.push({
          id: LEGACY_SESSION_ID,
          title: "Earlier conversation",
          created_at: legacyMessages[0].created_at,
          updated_at: legacyMessages[legacyMessages.length - 1].created_at,
        });
      }

      return { sessions: result };
    }
  );

  app.post<{ Params: { boardId: string; nodeId: string } }>(
    "/api/boards/:boardId/nodes/:nodeId/sessions",
    async (request, reply) => {
      const [node] = await db.select().from(nodes).where(eq(nodes.id, request.params.nodeId));
      if (!node || node.type !== "chat") return reply.code(404).send({ error: "Chat node not found." });
      const [session] = await db.insert(chat_sessions).values({ node_id: node.id }).returning();
      return { session };
    }
  );

  // Image attachments ----------------------------------------------------------

  app.post<{ Params: { boardId: string; nodeId: string } }>(
    "/api/boards/:boardId/nodes/:nodeId/chat-images",
    async (request, reply) => {
      const file = await request.file();
      if (!file) return reply.code(400).send({ error: "No image was uploaded." });
      // Drains the multipart stream before any early return, same requirement
      // files.ts's own upload route documents (@fastify/multipart needs every part
      // read out).
      const buffer = await file.toBuffer();

      if (!SUPPORTED_IMAGE_MIME_TYPES.has(file.mimetype)) {
        return reply.code(415).send({ error: "Only JPEG, PNG, GIF, or WEBP images are supported." });
      }
      if (buffer.byteLength === 0) return reply.code(400).send({ error: "The uploaded image is empty." });
      // Mirrors Anthropic's own per-image size ceiling for a base64-inlined image —
      // tighter than index.ts's 50MB whole-request multipart limit (shared with
      // file-node uploads), deliberately, since vision specifically rejects anything
      // much larger than this regardless of the request's own size budget.
      if (buffer.byteLength > MAX_IMAGE_BYTES) {
        return reply.code(413).send({ error: "That image is over 8MB — try a smaller one." });
      }

      const saved = await saveUpload(buffer, file.filename);
      const attachment: AttachmentRef = { storedName: saved.storedName, mimeType: file.mimetype, originalName: file.filename };
      return attachment;
    }
  );

  // History + cost summary ------------------------------------------------------

  app.get<{ Params: { boardId: string; nodeId: string }; Querystring: { sessionId?: string } }>(
    "/api/boards/:boardId/nodes/:nodeId/chat-history",
    async (request, reply) => {
      const [node] = await db.select().from(nodes).where(eq(nodes.id, request.params.nodeId));
      if (!node || node.type !== "chat") return reply.code(404).send({ error: "Chat node not found." });

      const sessionId = request.query.sessionId;
      const isLegacy = !sessionId || sessionId === LEGACY_SESSION_ID;
      const messages = await db
        .select()
        .from(chat_messages)
        .where(
          and(
            eq(chat_messages.node_id, node.id),
            isLegacy ? isNull(chat_messages.session_id) : eq(chat_messages.session_id, sessionId)
          )
        )
        .orderBy(asc(chat_messages.created_at));
      return { messages };
    }
  );

  // Local LLM (Ollama) status + live model list — real-time, not a static ModelInfo
  // list the way the three cloud providers get one, since what's actually usable
  // depends entirely on what the user has pulled, and that can change at any moment
  // (ollama.ts's `getLocalStatus` doc comment has the full reasoning).
  app.get("/api/providers/local-models", async () => {
    return getLocalStatus();
  });

  // F-29 — estimated running cost total, broken down per provider, Native API only.
  // Summed in application code rather than a SQL aggregate: this is a tiny local SQLite
  // table (one no-coder's own chat history), not a scale concern, and keeping the math
  // in plain TS next to where estimated_cost is computed (below) is easier to keep the
  // two in sync than a parallel SQL expression would be.
  app.get("/api/providers/cost-summary", async () => {
    const rows = await db.select().from(chat_messages).where(eq(chat_messages.role, "assistant"));
    const totals = new Map<string, number>();
    for (const row of rows) {
      if (!row.provider || row.estimated_cost == null) continue;
      totals.set(row.provider, (totals.get(row.provider) ?? 0) + row.estimated_cost);
    }
    return {
      totals: PROVIDERS.map((provider) => ({ provider, estimatedCostUsd: totals.get(provider) ?? 0 })),
    };
  });

  // Manual Input bridge (F-12/F-20, Phase 6) ------------------------------------
  //
  // Not an execution mode that calls any provider — a copy/paste convenience for
  // when Istiyak wants to use a chat tool he already pays for elsewhere (claude.ai,
  // ChatGPT, etc.) instead of spending Native API budget or needing Local LLM
  // running. Two plain JSON endpoints, no SSE: (1) assemble the exact text he'd
  // paste there, (2) save what he pastes back as an ordinary turn.

  app.post<{ Params: { boardId: string; nodeId: string }; Body: { prompt?: string } }>(
    "/api/boards/:boardId/nodes/:nodeId/manual-assemble",
    async (request, reply) => {
      const prompt = request.body?.prompt?.trim();
      if (!prompt) return reply.code(400).send({ error: "A prompt is required." });

      const [node] = await db.select().from(nodes).where(eq(nodes.id, request.params.nodeId));
      if (!node || node.type !== "chat") return reply.code(404).send({ error: "Chat node not found." });

      // Same `assembleContext` every other execution mode calls (a connected
      // video/audio/link node still extracts on a cache miss here) — no
      // `onExtracting` callback, since there's no open SSE stream to push progress
      // into; this plain POST just takes as long as a cold extraction takes.
      const { context, notesForAI, brandProfile } = await assembleContext(node);
      return { assembledPrompt: buildAssembledPromptText(context, brandProfile, notesForAI, prompt) };
    }
  );

  app.post<{
    Params: { boardId: string; nodeId: string };
    Body: { prompt?: string; response?: string; sessionId?: string };
  }>("/api/boards/:boardId/nodes/:nodeId/manual-turn", async (request, reply) => {
    const { nodeId } = request.params;
    const prompt = request.body?.prompt?.trim();
    const response = request.body?.response?.trim();
    if (!prompt) return reply.code(400).send({ error: "A prompt is required." });
    if (!response) return reply.code(400).send({ error: "Paste the response you got back before saving." });

    const [node] = await db.select().from(nodes).where(eq(nodes.id, nodeId));
    if (!node || node.type !== "chat") return reply.code(404).send({ error: "Chat node not found." });

    // Same session-resolution shape as the real send route below — a session id
    // that no longer exists fails the same way there, too.
    const requestedSessionId = request.body?.sessionId;
    const isLegacySession = !requestedSessionId || requestedSessionId === LEGACY_SESSION_ID;
    let sessionRow: { id: string; title: string | null } | null = null;
    if (!isLegacySession) {
      const [found] = await db.select().from(chat_sessions).where(eq(chat_sessions.id, requestedSessionId));
      if (!found || found.node_id !== nodeId) {
        return reply.code(404).send({ error: "That conversation no longer exists — start a new one." });
      }
      sessionRow = found;
    }
    const sessionIdForRows = sessionRow?.id ?? null;

    const priorMessages = await db
      .select()
      .from(chat_messages)
      .where(
        and(
          eq(chat_messages.node_id, nodeId),
          isLegacySession ? isNull(chat_messages.session_id) : eq(chat_messages.session_id, sessionIdForRows!)
        )
      );

    // Saved as an ordinary user/assistant pair — provider/model/tokens_used/
    // estimated_cost all left null, same as Local LLM's own messages (F-29: "Local
    // LLM / Manual Input messages: Never counted"), since no metered call happened.
    const [userMessage] = await db
      .insert(chat_messages)
      .values({ node_id: nodeId, session_id: sessionIdForRows, role: "user", content: prompt })
      .returning();
    const [assistantMessage] = await db
      .insert(chat_messages)
      .values({ node_id: nodeId, session_id: sessionIdForRows, role: "assistant", content: response })
      .returning();

    if (sessionRow) {
      const isFirstMessage = priorMessages.length === 0;
      await db
        .update(chat_sessions)
        .set({
          updated_at: new Date().toISOString(),
          ...(isFirstMessage && !sessionRow.title
            ? { title: prompt.length > 48 ? `${prompt.slice(0, 48)}…` : prompt }
            : {}),
        })
        .where(eq(chat_sessions.id, sessionRow.id));
    }

    return { userMessage, assistantMessage };
  });

  // Mindmap generation (F-17/TF-10, ADR-0101) — plain JSON, not SSE: this is a single
  // one-shot structuring call, not a conversation turn, and nothing here is persisted
  // to chat_messages (the mindmap becomes its OWN node, board-store.ts's
  // addMindmapNode, not another row in this node's own history).
  app.post<{ Params: { boardId: string; nodeId: string }; Body: { content?: string } }>(
    "/api/boards/:boardId/nodes/:nodeId/generate-mindmap",
    async (request, reply) => {
      const content = request.body?.content?.trim();
      if (!content) return reply.code(400).send({ error: "Nothing to generate a mindmap from." });

      const [node] = await db.select().from(nodes).where(eq(nodes.id, request.params.nodeId));
      if (!node || node.type !== "chat") return reply.code(404).send({ error: "Chat node not found." });

      const chatData = (node.data && typeof node.data === "object" ? node.data : {}) as ChatNodeData;
      const provider = isProviderId(chatData.provider) ? chatData.provider : "claude";
      const model = chatData.model;
      const executionMode = chatData.executionMode ?? "native";
      if (!model) return reply.code(400).send({ error: "This chat node has no model selected." });
      // Manual Input has no model to call at all (no key, no local server — it's a
      // copy/paste bridge to an external tool) — there's no adapter this could even
      // dispatch to, so this is blocked outright rather than guessing a provider.
      if (executionMode === "manual") {
        return reply.code(400).send({
          error: "Generate mindmap isn't available in Manual Input mode — switch this node to Native API or Local LLM first.",
        });
      }

      const adapter = executionMode === "local" ? ollamaAdapter : getAdapter(provider);
      if (!(await adapter.isConfigured())) {
        return reply.code(400).send({
          error:
            executionMode === "local"
              ? "Ollama isn't reachable — install it from ollama.com, run `ollama pull <model>`, and make sure it's running, then try again."
              : `No ${provider[0].toUpperCase()}${provider.slice(1)} API key saved — add one in Settings.`,
        });
      }

      let fullText = "";
      let streamError: string | undefined;
      try {
        for await (const chunk of adapter.streamChat({
          model,
          prompt: `${MINDMAP_SYSTEM_PROMPT}\n\n---\n\n${content}`,
          history: [],
          context: [],
        })) {
          if (chunk.type === "text") fullText += chunk.text;
          else if (chunk.type === "error") streamError = chunk.message;
        }
      } catch (err) {
        app.log.error(err);
        streamError = "Something went wrong talking to the provider. Check the server log for details.";
      }
      if (streamError) return reply.code(502).send({ error: streamError });

      let parsed: unknown;
      try {
        parsed = JSON.parse(stripCodeFence(fullText));
      } catch {
        return reply.code(422).send({ error: "Couldn't structure this response into a mindmap — try regenerating." });
      }
      if (parsed && typeof parsed === "object" && "error" in parsed) {
        return reply
          .code(422)
          .send({ error: "This response is too short or unstructured to turn into a mindmap — try a longer, more detailed response." });
      }
      if (!isValidMindmapResult(parsed)) {
        return reply.code(422).send({ error: "Couldn't structure this response into a mindmap — try regenerating." });
      }
      return { topic: parsed.topic, children: parsed.children };
    }
  );

  // Send + stream ----------------------------------------------------------------

  app.post<{
    Params: { boardId: string; nodeId: string };
    Body: {
      prompt?: string;
      sessionId?: string;
      attachments?: AttachmentRef[];
      webSearchEnabled?: boolean;
      thinkingEnabled?: boolean;
    };
  }>("/api/boards/:boardId/nodes/:nodeId/chat", async (request, reply) => {
    const { nodeId } = request.params;
    const prompt = request.body?.prompt?.trim();
    const attachments = request.body?.attachments ?? [];
    const webSearchEnabled = Boolean(request.body?.webSearchEnabled);
    const thinkingEnabled = Boolean(request.body?.thinkingEnabled);

    const [node] = await db.select().from(nodes).where(eq(nodes.id, nodeId));
    if (!node || node.type !== "chat") {
      return reply.code(404).send({ error: "Chat node not found." });
    }
    if (!prompt) {
      return reply.code(400).send({ error: "A prompt is required." });
    }

    const requestedSessionId = request.body?.sessionId;
    const isLegacySession = !requestedSessionId || requestedSessionId === LEGACY_SESSION_ID;
    let sessionRow: { id: string; title: string | null } | null = null;
    if (!isLegacySession) {
      const [found] = await db.select().from(chat_sessions).where(eq(chat_sessions.id, requestedSessionId));
      if (!found || found.node_id !== nodeId) {
        return reply.code(404).send({ error: "That conversation no longer exists — start a new one." });
      }
      sessionRow = found;
    }
    const sessionIdForRows = sessionRow?.id ?? null;

    const chatData = (node.data && typeof node.data === "object" ? node.data : {}) as ChatNodeData;
    const provider = isProviderId(chatData.provider) ? chatData.provider : "claude";
    const model = chatData.model;
    if (!model) {
      return reply.code(400).send({ error: "This chat node has no model selected." });
    }

    // F-12: "selecting an inert mode should say so plainly, not silently do nothing" —
    // Native API and Local LLM both actually send now. Manual Input is still
    // intentionally inert (it's a copy-paste bridge to an external chat tool the user
    // already pays for, not an automatic-send mode by design) — not yet built here.
    const executionMode = chatData.executionMode ?? "native";
    if (executionMode === "manual") {
      return reply.code(400).send({
        error: "Manual Input mode doesn't send automatically — switch this node to Native API or Local LLM to chat here.",
      });
    }

    // Local LLM bypasses the node's own `provider` field entirely — Istiyak's own
    // framing of why: Manual Input is a copy-paste convenience, not automatic AI;
    // Local LLM (Ollama, running on his own machine) is the only mode that gives real,
    // automatic, in-app AI synthesis at zero marginal cost per message, independent of
    // which cloud provider icon the node happens to display. See providers/ollama.ts's
    // top comment for the full reasoning on why it isn't just another `ProviderId`.
    const adapter = executionMode === "local" ? ollamaAdapter : getAdapter(provider);
    if (!(await adapter.isConfigured())) {
      return reply.code(400).send({
        error:
          executionMode === "local"
            ? "Ollama isn't reachable — install it from ollama.com, run `ollama pull <model>`, and make sure it's running, then try again."
            : `No ${provider[0].toUpperCase()}${provider.slice(1)} API key saved — add one in Settings.`,
      });
    }

    const priorMessages = await db
      .select()
      .from(chat_messages)
      .where(
        and(
          eq(chat_messages.node_id, nodeId),
          isLegacySession ? isNull(chat_messages.session_id) : eq(chat_messages.session_id, sessionIdForRows!)
        )
      )
      .orderBy(asc(chat_messages.created_at));
    // A past turn's image bytes are never resent (ChatInput.history's own doc comment
    // in providers/types.ts explains why) — folded into a short text placeholder
    // instead, so a later turn can still see THAT an image was there even without its
    // pixels.
    const history = priorMessages.map((m) => {
      const atts = (m.attachments as AttachmentRef[] | null) ?? [];
      const prefix =
        atts.length > 0 ? `[${atts.length} image${atts.length > 1 ? "s" : ""} attached: ${atts.map((a) => a.originalName).join(", ")}]\n` : "";
      return { role: m.role as "user" | "assistant", content: prefix + m.content };
    });

    // Read + base64-encode THIS turn's DIRECTLY-attached images BEFORE hijacking the
    // response — an unreadable attachment (deleted from disk, bad reference) fails the
    // send with a plain JSON 400 the same way every other pre-stream validation here
    // does, rather than needing to fail that case over an already-hijacked SSE
    // connection. This is only HALF of what ends up in the final `images` array sent to
    // the adapter below — the other half (a CONNECTED image node's bytes) comes back
    // from `assembleContext` further down, since resolving connected nodes needs the
    // DB lookups `assembleContext` already does (see context-assembly.ts's own comment
    // on why that gap existed until now).
    const directImages: { mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp"; base64: string }[] = [];
    for (const att of attachments) {
      if (!SUPPORTED_IMAGE_MIME_TYPES.has(att.mimeType)) {
        return reply.code(400).send({ error: `"${att.originalName}" isn't a supported image type.` });
      }
      const buffer = await readStoredFile(att.storedName);
      if (!buffer) {
        return reply.code(400).send({ error: `Couldn't read the attached image "${att.originalName}" — try attaching it again.` });
      }
      directImages.push({ mediaType: att.mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp", base64: buffer.toString("base64") });
    }

    // Round 1 bug #4 (Istiyak: "User should be able to stop response in between...
    // Currently button is in processing mode so can't cancel the response in
    // between") — the client-side half (chat-node.tsx's composer button) closes the
    // connection when Stop is clicked; THIS is what actually reacts to that. Before,
    // "close" did nothing but a comment saying there was nothing to do — the provider
    // call kept running and burning tokens/time against a reply nobody was listening
    // for anymore, the stream loop below just kept writing to a dead socket. Now it
    // aborts the in-flight provider call (every adapter forwards this signal into its
    // own `fetch`) and flags the loop below to stop pulling further chunks.
    let clientDisconnected = false;
    const providerAbort = new AbortController();
    request.raw.on("close", () => {
      clientDisconnected = true;
      providerAbort.abort();
    });

    // Hijacked BEFORE `assembleContext` now (Phase 5, ADR-0044/ADR-0085..0087) — a
    // connected video/audio/link node can trigger a genuinely slow yt-dlp/ffmpeg/
    // whisper pipeline run on a cache miss, and the whole point of surfacing that as an
    // "extracting" SSE event (implementation_plan.md Phase 5 step 5) is for the chat UI
    // to show it WHILE waiting, not find out about it after the fact — which means the
    // stream has to already be open before `assembleContext` is even called.
    reply.hijack();
    writeSseHeaders(reply);

    const { context, notesForAI, brandProfile, images: connectedImages } = await assembleContext(node, (info) => {
      writeSseEvent(reply, { type: "extracting", nodeId: info.nodeId, label: info.label });
    });
    // Direct attachment (this turn's composer upload) + connected image nodes (edges
    // into this chat node) are merged into one flat list here — the adapters
    // themselves (claude.ts/ollama.ts) don't need to know or care which path a given
    // image came from, same as context items from different node types already don't
    // distinguish their source past this point.
    const images = [...directImages, ...connectedImages];

    // The user's own turn is saved immediately, before the provider stream starts — so
    // it's part of this node's permanent history even if the provider call then fails
    // (the failed turn just never gets an assistant reply beneath it, same as a
    // real chat client that shows your sent message regardless of what happens next).
    await db.insert(chat_messages).values({
      node_id: nodeId,
      session_id: sessionIdForRows,
      role: "user",
      content: prompt,
      attachments: attachments.length > 0 ? attachments : null,
    });

    // Auto-title a real session from its first message (never for the legacy group,
    // which has no row to title); bump its recency on every turn either way, so the
    // sidebar sorts by last activity.
    if (sessionRow) {
      const isFirstMessage = priorMessages.length === 0;
      await db
        .update(chat_sessions)
        .set({
          updated_at: new Date().toISOString(),
          ...(isFirstMessage && !sessionRow.title
            ? { title: prompt.length > 48 ? `${prompt.slice(0, 48)}…` : prompt }
            : {}),
        })
        .where(eq(chat_sessions.id, sessionRow.id));
    }

    let fullText = "";
    let finalUsage: { inputTokens: number; outputTokens: number; webSearches?: number } | undefined;
    let streamError: string | undefined;

    try {
      for await (const chunk of adapter.streamChat({
        model,
        prompt,
        history,
        context,
        notesForAI,
        brandProfile,
        images: images.length > 0 ? images : undefined,
        webSearchEnabled,
        thinkingEnabled,
        signal: providerAbort.signal,
      })) {
        if (clientDisconnected) break; // Stop clicked — nothing left to write to
        if (chunk.type === "text") {
          fullText += chunk.text;
          writeSseEvent(reply, { type: "text", text: chunk.text });
        } else if (chunk.type === "thinking" || chunk.type === "search_query" || chunk.type === "search_results") {
          // Pure UI annotations — never folded into `fullText` (the persisted
          // assistant reply), just forwarded through as-is.
          writeSseEvent(reply, chunk);
        } else if (chunk.type === "done") {
          finalUsage = chunk.usage;
        } else if (chunk.type === "error") {
          streamError = chunk.message;
        }
      }
    } catch (err) {
      // An aborted fetch throws/yields here same as a real provider failure would —
      // only log and surface it as one when the CLIENT didn't ask for this (a real
      // "something went wrong" belongs in the log; a user clicking Stop does not).
      if (!clientDisconnected) {
        app.log.error(err);
        streamError = "Something went wrong talking to the provider. Check the server log for details.";
      }
    }

    if (clientDisconnected) {
      // Save whatever was generated before the stop, mirroring the chat-node.tsx
      // composer's own optimistic local save — so a stopped reply survives a reload
      // instead of silently vanishing, same as a reply that finished normally. No SSE
      // write and no `reply.raw.end()`: the connection that would receive either is
      // already gone.
      if (fullText) {
        await db.insert(chat_messages).values({
          node_id: nodeId,
          session_id: sessionIdForRows,
          role: "assistant",
          content: fullText,
          provider,
          model,
        });
        if (sessionRow) {
          await db.update(chat_sessions).set({ updated_at: new Date().toISOString() }).where(eq(chat_sessions.id, sessionRow.id));
        }
      }
      return;
    }

    if (streamError) {
      writeSseEvent(reply, { type: "error", message: streamError });
      reply.raw.end();
      return;
    }

    const modelInfo = adapter.listModels().find((m) => m.id === model);
    const tokenCost =
      finalUsage && modelInfo?.inputCostPer1kTokens !== undefined && modelInfo?.outputCostPer1kTokens !== undefined
        ? (finalUsage.inputTokens / 1000) * modelInfo.inputCostPer1kTokens +
          (finalUsage.outputTokens / 1000) * modelInfo.outputCostPer1kTokens
        : null;
    // Web search has its own flat per-use price, separate from token cost (F-29) —
    // adapter.webSearchCostPerUse is undefined for anything that doesn't support
    // hosted search, so this is a no-op there.
    const searchCost = finalUsage?.webSearches ? finalUsage.webSearches * (adapter.webSearchCostPerUse ?? 0) : 0;
    const estimatedCost = tokenCost !== null || searchCost > 0 ? (tokenCost ?? 0) + searchCost : null;

    await db.insert(chat_messages).values({
      node_id: nodeId,
      session_id: sessionIdForRows,
      role: "assistant",
      content: fullText,
      provider,
      model,
      tokens_used: finalUsage ? finalUsage.inputTokens + finalUsage.outputTokens : null,
      estimated_cost: estimatedCost,
    });
    if (sessionRow) {
      await db.update(chat_sessions).set({ updated_at: new Date().toISOString() }).where(eq(chat_sessions.id, sessionRow.id));
    }

    writeSseEvent(reply, { type: "done" });
    reply.raw.end();
  });
}
