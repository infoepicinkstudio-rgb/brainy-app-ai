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
    // MVP only wires up Native API; Local LLM/Manual Input are visible but inert.
    const executionMode = chatData.executionMode ?? "native";
    if (executionMode !== "native") {
      return reply.code(400).send({
        error:
          executionMode === "local"
            ? "Local LLM mode isn't wired up yet — switch this node to Native API to chat."
            : "Manual Input mode doesn't send automatically — switch this node to Native API to chat here.",
      });
    }

    const adapter = getAdapter(provider);
    if (!(await adapter.isConfigured())) {
      return reply
        .code(400)
        .send({ error: `No ${provider[0].toUpperCase()}${provider.slice(1)} API key saved — add one in Settings.` });
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

    const { context, notesForAI, brandProfile } = await assembleContext(node);

    // Read + base64-encode THIS turn's images before saving the user row — an
    // unreadable attachment (deleted from disk, bad reference) fails the send with a
    // clear message rather than silently answering as though no image was sent.
    const images: { mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp"; base64: string }[] = [];
    for (const att of attachments) {
      if (!SUPPORTED_IMAGE_MIME_TYPES.has(att.mimeType)) {
        return reply.code(400).send({ error: `"${att.originalName}" isn't a supported image type.` });
      }
      const buffer = await readStoredFile(att.storedName);
      if (!buffer) {
        return reply.code(400).send({ error: `Couldn't read the attached image "${att.originalName}" — try attaching it again.` });
      }
      images.push({ mediaType: att.mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp", base64: buffer.toString("base64") });
    }

    // The user's own turn is saved immediately, before streaming starts — so it's
    // part of this node's permanent history even if the provider call then fails
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

    request.raw.on("close", () => {
      // Client navigated away / closed the tab mid-stream — nothing further to write.
      // Fastify/Node handle the underlying socket teardown; this just stops the loop
      // below from doing pointless work against a dead connection.
    });

    reply.hijack();
    writeSseHeaders(reply);

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
      })) {
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
      app.log.error(err);
      streamError = "Something went wrong talking to the provider. Check the server log for details.";
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
