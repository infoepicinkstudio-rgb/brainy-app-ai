// Context assembly for chat nodes — architecture.md §4.3. Given a chat node's id,
// resolves everything connected to it into plain-text context an adapter can fold into
// a prompt. Kept as its own module, separate from the SSE route (chat.ts) and from any
// one provider adapter, specifically so Phase 5 (video-node context) and Phase 6
// (OpenAI/Gemini) can both extend what feeds in here without touching streaming code or
// adapter internals — exactly the boundary implementation_plan.md Phase 4 step 3 calls
// for.
//
// Phase 5 (ADR-0044, extended by ADR-0085/ADR-0086/ADR-0087, see rules-decisions.md
// §12): video/audio/link nodes now resolve through `resolveMediaNode`, which lazily
// triggers `media-extraction.ts`'s yt-dlp/ffmpeg/whisper pipeline on a cache miss — the
// one place this module can be genuinely slow, which is why `assembleContext` takes an
// optional `onExtracting` callback so the caller (chat.ts) can surface an in-progress
// SSE event before that happens, rather than the chat UI just sitting frozen.

import { eq, and, or, desc } from "drizzle-orm";
import { db } from "../db/client.js";
import { nodes, edges, chat_messages, extraction_cache, brand_profile } from "../db/schema.js";
import type { ContextItem } from "../providers/types.js";
import { extractMediaForNode, hasCachedTranscript } from "./media-extraction.js";
import { readStoredFile } from "./uploads.js";

interface TextNodeData {
  content?: string;
}
interface FileNodeData {
  fileName?: string;
  storedName?: string;
  contentHash?: string;
  isImage?: boolean;
  extractionStatus?: string;
  notes?: string;
}

// An image CONNECTED to a chat node (a `file` node with `isImage: true`, wired in via
// an edge) and one ATTACHED directly in the chat composer (chat.ts's own
// `/chat-images` upload + its per-turn `attachments` field) are two completely
// different code paths in this app, and until now only the second one actually reached
// a vision-capable model — `resolveOneNode`'s `file` branch below used to forward
// nothing but a connected image's manual `notes` text (a stale leftover from before
// ADR-0089 added real vision support; its old comment said "no OCR in MVP," which
// stopped being true the moment direct-attachment vision shipped). Istiyak hit this
// directly: he connected a screenshot via an edge, not the composer's attach button,
// and the model correctly reported — given what it was actually sent — that it had no
// image at all. `ResolvedContextImage`/`resolveConnectedImage` below close that gap by
// reading a connected image file's bytes the same way chat.ts already does for a
// direct attachment, so both paths now feed the same `images` array regardless of
// provider (Local LLM or Native API — this fix is provider-agnostic).
interface ResolvedContextImage {
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  base64: string;
}

// Mirrors chat.ts's SUPPORTED_IMAGE_MIME_TYPES — only these four are safe to hand a
// vision model; a connected `file` node can also be `isImage: true` for svg/bmp/heic
// (files.ts's own upload-extension list), which this deliberately excludes rather than
// erroring on — same quietly-not-applicable treatment the rest of this module gives an
// unsupported/unreadable source.
const IMAGE_MIME_BY_EXT: Partial<Record<string, ResolvedContextImage["mediaType"]>> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
};

// Same ceiling as chat.ts's MAX_IMAGE_BYTES (duplicated, not imported — that constant
// guards an HTTP upload one layer up; this one guards a DB-stored file read, same
// reasoning files.ts/extraction.ts already give for their own small duplicated
// constants).
const MAX_CONTEXT_IMAGE_BYTES = 8 * 1024 * 1024;

async function resolveConnectedImage(data: FileNodeData): Promise<ResolvedContextImage | null> {
  if (!data.isImage || !data.storedName || !data.fileName) return null;
  const ext = data.fileName.slice(data.fileName.lastIndexOf(".") + 1).toLowerCase();
  const mediaType = IMAGE_MIME_BY_EXT[ext];
  if (!mediaType) return null;
  const buffer = await readStoredFile(data.storedName);
  if (!buffer || buffer.byteLength === 0 || buffer.byteLength > MAX_CONTEXT_IMAGE_BYTES) return null;
  return { mediaType, base64: buffer.toString("base64") };
}
interface MediaNodeData {
  url?: string;
  fileName?: string;
  title?: string;
  notes?: string;
}
interface ChatNodeData {
  notesForAI?: string;
  useBrandProfile?: boolean;
}

export type ExtractionProgressCallback = (info: { nodeId: string; label: string }) => void;

function labelForMediaNode(node: typeof nodes.$inferSelect, data: MediaNodeData): string {
  if (node.type === "audio") return data.fileName ? `Connected audio: ${data.fileName}` : "Connected audio";
  if (node.type === "video") {
    if (data.fileName) return `Connected video: ${data.fileName}`;
    return data.title || data.url ? `Connected video: ${data.title || data.url}` : "Connected video";
  }
  // link (ADR-0087)
  return data.title || data.url ? `Connected link: ${data.title || data.url}` : "Connected link";
}

// Shared by video/audio/link (ADR-0085/ADR-0086/ADR-0087/ADR-0094) — all three now
// resolve the same way: eagerly/lazily extract (cache-checked) and fold the result in
// alongside whatever manual notes the node also carries. A link node that isn't actual
// media now ALSO gets a real shot at useful content — ADR-0094 narrowed ADR-0053's
// "no scraping" boundary, so a failed yt-dlp attempt for a link falls through to
// link-extraction.ts's article-text scrape before giving up. Only a link whose page
// genuinely can't be fetched or parsed (dead link, needs JS/login, non-HTML response)
// still ends up `status: "failed"`, contributing just its notes, same as before.
async function resolveMediaNode(
  node: typeof nodes.$inferSelect,
  onExtracting?: ExtractionProgressCallback
): Promise<ContextItem | null> {
  const data = asRecord(node.data) as MediaNodeData;

  const alreadyCached = await hasCachedTranscript(node);
  if (!alreadyCached) {
    onExtracting?.({ nodeId: node.id, label: labelForMediaNode(node, data) });
  }
  const result = await extractMediaForNode(node);

  const pieces: string[] = [];
  if (result.status === "ok" && result.content) pieces.push(result.content);
  if (data.notes?.trim()) pieces.push(data.notes.trim());
  if (pieces.length === 0) return null;

  return {
    nodeType: node.type as ContextItem["nodeType"],
    label: labelForMediaNode(node, data),
    content: pieces.join("\n\n"),
  };
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

async function resolveOneNode(
  node: typeof nodes.$inferSelect,
  onExtracting?: ExtractionProgressCallback,
  images?: ResolvedContextImage[]
): Promise<ContextItem | null> {
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
    // Image file nodes now also contribute their actual pixels (see
    // ResolvedContextImage's comment above) — pushed into the caller's `images`
    // accumulator rather than returned here, since this function's own return value is
    // a text-only ContextItem. This runs regardless of whether `pieces` ends up empty,
    // so a connected image with no manual notes still gets SEEN even though it
    // contributes no text ContextItem.
    if (fileData.isImage && images) {
      const resolved = await resolveConnectedImage(fileData);
      if (resolved) images.push(resolved);
    }
    if (fileData.notes?.trim()) pieces.push(fileData.notes.trim());
    if (pieces.length === 0) return null;
    return {
      nodeType: "file",
      label: fileData.fileName ? `Connected file: ${fileData.fileName}` : "Connected file",
      content: pieces.join("\n\n"),
    };
  }

  // video/audio/link all resolve the same way now (ADR-0085/ADR-0086/ADR-0087) — see
  // resolveMediaNode's own comment.
  if (node.type === "video" || node.type === "audio" || node.type === "link") {
    return resolveMediaNode(node, onExtracting);
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

  // group/mindmap nodes connected directly are not themselves a content source.
  return null;
}

export interface AssembledContext {
  context: ContextItem[];
  notesForAI?: string;
  brandProfile?: string;
  /** Pixels from connected image `file` nodes (see ResolvedContextImage's comment
   * above) — always an array, never undefined, so chat.ts can spread it into its own
   * directly-attached `images` array unconditionally. */
  images: ResolvedContextImage[];
}

/**
 * Resolves everything feeding into `chatNodeId`: connected nodes' content, this node's
 * own "notes for AI" field (F-16), the Brand/Voice Profile when this node has opted in
 * (F-21, never applied unless the node itself asked for it), and any connected image
 * nodes' actual bytes (see `images` above).
 */
export async function assembleContext(
  chatNode: typeof nodes.$inferSelect,
  onExtracting?: ExtractionProgressCallback
): Promise<AssembledContext> {
  const chatData = asRecord(chatNode.data) as ChatNodeData;

  const connectedIds = await resolveConnectedNodeIds(chatNode.id);
  const context: ContextItem[] = [];
  const images: ResolvedContextImage[] = [];
  if (connectedIds.length > 0) {
    const connectedNodes = await db
      .select()
      .from(nodes)
      .where(or(...connectedIds.map((id) => eq(nodes.id, id))));
    for (const node of connectedNodes) {
      const item = await resolveOneNode(node, onExtracting, images);
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
    images,
  };
}
