// Context assembly for chat nodes — architecture.md §4.3. Given a chat node's id,
// resolves everything connected to it into plain-text context an adapter can fold into
// a prompt. Kept as its own module, separate from the SSE route (chat.ts) and from any
// one provider adapter, specifically so Phase 5 (video-node context) and Phase 6
// (OpenAI/Gemini) can both extend what feeds in here without touching streaming code or
// adapter internals — exactly the boundary implementation_plan.md Phase 4 step 3 calls
// for.

import { eq, and, or, desc } from "drizzle-orm";
import { db } from "../db/client.js";
import { nodes, edges, chat_messages, extraction_cache, brand_profile } from "../db/schema.js";
import type { ContextItem } from "../providers/types.js";

interface TextNodeData {
  content?: string;
}
interface FileNodeData {
  fileName?: string;
  contentHash?: string;
  isImage?: boolean;
  extractionStatus?: string;
  notes?: string;
}
interface LinkNodeData {
  url?: string;
  title?: string;
  notes?: string;
}
interface ChatNodeData {
  notesForAI?: string;
  useBrandProfile?: boolean;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

// Direction matters here (schema.ts: "context flows source → target") — a chat node
// only pulls content from nodes where IT is the target, i.e. nodes pointing INTO it.
// This is what makes a connection's drawn direction (TF-06: "Edge visually
// distinguishes direction") mean something beyond cosmetics: dragging a connection
// backwards (chat node -> text node) does NOT feed that text node's content in, which
// matches how every other canvas tool with directional edges (a flowchart, a mind map)
// treats arrow direction as meaningful, not decorative.
async function resolveConnectedNodeIds(chatNodeId: string): Promise<string[]> {
  const rows = await db.select().from(edges).where(eq(edges.target_node_id, chatNodeId));
  return rows.map((row) => row.source_node_id);
}

async function resolveOneNode(node: typeof nodes.$inferSelect): Promise<ContextItem | null> {
  const data = asRecord(node.data);

  if (node.type === "text") {
    const content = (data as TextNodeData).content?.trim();
    if (!content) return null;
    return { nodeType: "text", label: "Connected text note", content };
  }

  if (node.type === "file") {
    const fileData = data as FileNodeData;
    const pieces: string[] = [];
    if (!fileData.isImage && fileData.extractionStatus === "ok" && fileData.contentHash) {
      const [cached] = await db
        .select()
        .from(extraction_cache)
        .where(eq(extraction_cache.source_key, fileData.contentHash));
      if (cached?.extracted_content) pieces.push(cached.extracted_content);
    }
    // Image file nodes contribute only their manual notes (architecture.md §4.3) — no
    // extracted text exists to fall back on, by design (no OCR in MVP).
    if (fileData.notes?.trim()) pieces.push(fileData.notes.trim());
    if (pieces.length === 0) return null;
    return {
      nodeType: "file",
      label: fileData.fileName ? `Connected file: ${fileData.fileName}` : "Connected file",
      content: pieces.join("\n\n"),
    };
  }

  if (node.type === "link") {
    const linkData = data as LinkNodeData;
    const content = linkData.notes?.trim();
    if (!content) return null; // "no automated scraping" (F-27) — an empty link contributes nothing
    const label = linkData.title || linkData.url ? `Connected link: ${linkData.title || linkData.url}` : "Connected link";
    return { nodeType: "link", label, content };
  }

  if (node.type === "chat") {
    const [lastReply] = await db
      .select()
      .from(chat_messages)
      .where(and(eq(chat_messages.node_id, node.id), eq(chat_messages.role, "assistant")))
      .orderBy(desc(chat_messages.created_at))
      .limit(1);
    if (!lastReply?.content.trim()) return null;
    return { nodeType: "chat", label: "Connected chat node's last response", content: lastReply.content.trim() };
  }

  // video/group/mindmap nodes: video context arrives in Phase 5 (F-14); a group or
  // mindmap node connected directly is not itself a content source.
  return null;
}

export interface AssembledContext {
  context: ContextItem[];
  notesForAI?: string;
  brandProfile?: string;
}

/**
 * Resolves everything feeding into `chatNodeId`: connected nodes' content, this node's
 * own "notes for AI" field (F-16), and the Brand/Voice Profile when this node has opted
 * in (F-21, never applied unless the node itself asked for it).
 */
export async function assembleContext(chatNode: typeof nodes.$inferSelect): Promise<AssembledContext> {
  const chatData = asRecord(chatNode.data) as ChatNodeData;

  const connectedIds = await resolveConnectedNodeIds(chatNode.id);
  const context: ContextItem[] = [];
  if (connectedIds.length > 0) {
    const connectedNodes = await db
      .select()
      .from(nodes)
      .where(or(...connectedIds.map((id) => eq(nodes.id, id))));
    for (const node of connectedNodes) {
      const item = await resolveOneNode(node);
      if (item) context.push(item);
    }
  }

  let brandProfileContent: string | undefined;
  if (chatData.useBrandProfile) {
    const [profile] = await db.select().from(brand_profile).limit(1);
    if (profile?.content.trim()) brandProfileContent = profile.content.trim();
  }

  return {
    context,
    notesForAI: chatData.notesForAI?.trim() || undefined,
    brandProfile: brandProfileContent,
  };
}
