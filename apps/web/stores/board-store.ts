// The high-frequency canvas store (ADR-0012) — node dragging and live position/content
// changes go through here, so its update shape was settled before any canvas UI was
// written against it (implementation_plan.md Phase 2 step 3), not retrofitted after.
//
// Autosave (Phase 2 step 6): text-content edits debounce-save (short window — testing.md
// F-08 requires "hard-refresh within a few seconds, edit is retained", so the debounce
// has to be well under that, not a lazy multi-second one) and flush immediately on
// blur; node position saves immediately on drag-stop, not debounced, since a drag
// naturally has a single clear "done" moment already.
//
// Undo/redo (ADR-0066, node-card-overhaul slice): a session-scoped command stack. Every
// user-initiated mutation (create, delete, position change, data/type edit, resize —
// ADR-0070) pushes one `HistoryEntry` capturing both the "before" and "after" shape, so
// undo/redo are just applying that entry in one direction or the other — there's no
// separate "replay the opposite operation" logic to keep in sync. Deliberately NOT
// persisted across reloads (a fresh page load starts with an empty stack) — simplest
// option that matches how every other local undo stack (a text editor, Figma within a
// session) actually behaves, and avoids having to reconcile a stale stack against server
// state that moved on.
//
// Card size (ADR-0070): no new DB column — `cardWidth`/`cardHeight` live inside each
// node's existing `data` JSON blob (same flexible, migration-free column every other
// per-node field already lives in) and are mirrored onto the React Flow `Node`'s own
// top-level `width`/`height` so `NodeResizer`/`NodeResizeControl` can read/drive them
// directly.

import { create } from "zustand";
import type { Node, Edge, NodeChange, EdgeChange, Connection } from "@xyflow/react";
import { applyNodeChanges, applyEdgeChanges } from "@xyflow/react";
import { api, uploadFile, reExtractRequest, extractRequest, ApiError } from "@/lib/api";
import { parseVideoUrl } from "@/lib/video-platform";
import { useToastStore } from "@/stores/toast-store";
import { useSettingsStore } from "@/stores/settings-store";

// "audio" added for Phase 5 (ADR-0085) — a dedicated node type for uploaded audio
// files, upload-only (no URL variant); "video" already covers both URL and upload
// sources as of ADR-0086 (VideoNodeData.source).
export type BrainyNodeType = "text" | "file" | "link" | "video" | "chat" | "audio";

// Phase 3 bug-fix round (Istiyak: "IF file type doesn't supported then it should not
// have come to board... mp3 mp4 html certain files not supported yet"). Before this,
// `addFileNode` uploaded and created a node for literally any file — extraction.ts
// (server-side) already classified pdf/docx/xlsx/xls as extractable and images as
// "visual, no extraction needed," but EVERYTHING else (mp3, mp4, html, zip, txt, …)
// still got a real board card, just one showing "This file type isn't supported for
// text extraction" inline — a confusing half-success for something the user expected
// to be rejected outright. This list is the single client-side source of truth for
// "can this even become a card" and must be kept in sync with routes/files.ts's own
// `SUPPORTED_UPLOAD_EXTENSIONS` on the server — duplicated rather than fetched at
// runtime since it's small, static, and needed synchronously before any network call.
//
// Phase 5 (ADR-0085/ADR-0086): audio/video extensions are exactly the ones the comment
// above was deliberately deferring — now accepted, but routed to a DIFFERENT node type
// than a document upload (see `addFileNode`'s branch on the upload response's
// `mediaKind` below), never through the pdf/docx/xlsx extraction path.
const AUDIO_UPLOAD_EXTENSIONS = new Set(["mp3", "wav", "m4a", "ogg", "flac", "aac"]);
const VIDEO_UPLOAD_EXTENSIONS = new Set(["mp4", "mov", "webm", "mkv", "avi"]);

const SUPPORTED_FILE_EXTENSIONS = new Set([
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "svg",
  "bmp",
  "heic",
  ...AUDIO_UPLOAD_EXTENSIONS,
  ...VIDEO_UPLOAD_EXTENSIONS,
]);

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot + 1).toLowerCase();
}

export function isSupportedFileType(filename: string): boolean {
  return SUPPORTED_FILE_EXTENSIONS.has(extensionOf(filename));
}

// Fields every node type's data shares — not enforced at the type level beyond this
// (each type still declares its own interface, extending Record<string, unknown> like
// before) but centralizing the doc comment keeps the four from drifting on meaning.
/** `cardWidth`/`cardHeight`: the node's resized on-canvas size in px (ADR-0070) — absent
 * until the user actually drags the resize handle at least once, at which point the
 * card switches from its natural/auto size to this explicit one. */

export interface TextNodeData extends Record<string, unknown> {
  content: string;
  cardWidth?: number;
  cardHeight?: number;
}

export interface FileNodeData extends Record<string, unknown> {
  fileName: string;
  storedName: string;
  contentHash: string;
  bytes: number;
  isImage: boolean;
  /** Round 2 (ADR-0069): drives the card's icon/accent color by file type (Office-style
   * red/blue/green conventions) — set once, server-side, at upload time. */
  fileKind: "pdf" | "docx" | "xlsx" | "image" | "other";
  extractionStatus: "ok" | "unsupported" | "failed" | "not_applicable" | "pending";
  extractionPreview: string | null;
  notes: string;
  cardWidth?: number;
  cardHeight?: number;
}

// Round 2 (ADR-0067): widened from "raw URL + blank title/URL inputs" to a header that
// shows a server-fetched title + favicon the moment a URL resolves, falling back to the
// raw URL as plain text (never a blank/broken layout) when that lookup fails.
export interface LinkNodeData extends Record<string, unknown> {
  url: string;
  title: string;
  /** "auto": `title` came from (or is still waiting on) the server-side title/favicon
   * fetch, so a later fetch may still update it. "manual": the user edited the header
   * title themselves (NodeHeader's inline edit) — a later fetch must never overwrite it. */
  titleSource: "auto" | "manual";
  faviconUrl: string;
  /** Status of the lightweight title+favicon fetch — "idle" before any URL has been
   * committed, "loading" while in flight, "ok" once resolved, "error" on failure/
   * timeout/no-<title> (falls back to showing the raw URL compactly). */
  status: "idle" | "loading" | "ok" | "error";
  /** The exact `url` value `title`/`faviconUrl`/`status` currently correspond to — lets
   * the UI tell "already fetched for this URL" apart from "URL changed, fetch again"
   * without a network round trip just to check. */
  metaForUrl: string;
  /** Round 6: an OG/Twitter-Card image URL pulled from the same metadata fetch, when the
   * target page has one — drives the link card's optional preview-image block
   * (link-node.tsx). Absent (not just empty-string) when no such image was found, so
   * link-node.tsx's `Boolean(...)` check needs no separate "" case. BUG-020: this field
   * was dropped from this interface by a cross-agent merge that combined this round's
   * work with a parallel nav-agent change to this same file — restored here; see
   * docs/bugs.md BUG-020 for the full root cause. */
  previewImageUrl?: string;
  notes: string;
  cardWidth?: number;
  cardHeight?: number;
  // Phase 5 (ADR-0087) — a link node's URL is now ALSO attempted through the lazy
  // yt-dlp/ffmpeg/whisper pipeline (media-extraction.ts) when a connected chat node
  // needs it, same cache/trigger model video nodes already use. Both optional and
  // undefined on every node until a first attempt actually happens (most link nodes,
  // pointing at an ordinary non-media page, will never show this at all) — this is
  // additive, not a replacement for the notes-only behavior above (ADR-0053 untouched).
  extractionStatus?: "pending" | "ok" | "failed";
  extractionPreview?: string | null;
}

// Phase 5's metadata/thumbnail slice pulled forward (implementation_plan.md node-card-
// overhaul entry, ADR-0065): a distinct `video` node type, not a `data.platform` flag on
// `link` — see that ADR for the reasoning. `status` tracks the backend oEmbed fetch
// (lib/video-platform.ts classifies the URL instantly, client-side; the network round
// trip for title/thumbnail is what `status` is tracking). Round 2 (ADR-0069) widened
// `platform` from YouTube-only to also cover Vimeo, which has the same kind of free,
// no-auth oEmbed endpoint.
//
// Phase 5 real build (ADR-0086): `source` discriminates between the original URL path
// (oEmbed metadata, `status`/`platform`/`videoId`/`thumbnailUrl`/`authorName` — all now
// optional, present only when `source === "url"`) and a new upload path (`fileName`/
// `storedName`/`contentHash`/`bytes`, the same shape FileNodeData already uses, present
// only when `source === "upload"`). Every node created before this ADR has no `source`
// field at all and reads as `"url"` by fallback (video-node.tsx) — every pre-existing
// video node really was URL-based. Both sources share the same lazy transcript
// extraction fields (`extractionStatus`/`extractionPreview`, ADR-0044/ADR-0086) —
// undefined until a connected chat node's first reference (or an explicit Re-extract)
// actually triggers one.
export interface VideoNodeData extends Record<string, unknown> {
  source?: "url" | "upload";
  // url-source fields (pre-existing, now optional — present when source is "url" or
  // absent/legacy)
  url?: string;
  platform?: "youtube" | "vimeo";
  videoId?: string;
  title?: string;
  thumbnailUrl?: string;
  authorName?: string;
  /** The oEmbed metadata fetch's own status — url-source only. Unrelated to
   * `extractionStatus` below, which tracks the separate transcript pipeline. */
  status?: "loading" | "ok" | "error";
  // upload-source fields (ADR-0086) — present when source === "upload"
  fileName?: string;
  storedName?: string;
  contentHash?: string;
  bytes?: number;
  // shared — lazy transcript extraction (ADR-0044, extended to uploads by ADR-0086)
  extractionStatus?: "pending" | "ok" | "failed";
  extractionPreview?: string | null;
  notes: string;
  cardWidth?: number;
  cardHeight?: number;
}

// Phase 5 (ADR-0085) — uploaded audio files (mp3/wav/m4a/ogg/flac/aac), their own node
// type rather than routed through `file` or folded into `video` (see that ADR for why).
// Upload-only, no URL variant; same lazy transcript extraction shape video/link nodes
// now share. `notes` matches every other node's manual "notes for AI" field (F-16).
export interface AudioNodeData extends Record<string, unknown> {
  fileName: string;
  storedName: string;
  contentHash: string;
  bytes: number;
  extractionStatus?: "pending" | "ok" | "failed";
  extractionPreview?: string | null;
  notes: string;
  cardWidth?: number;
  cardHeight?: number;
}

// Grouping (Phase 3, TF-Grouping) — a `group` node is a real node type (architecture.md
// §4.1/§5.3 already lists it alongside text/video/chat/mindmap; this resolves this
// phase's own "is group a node type or a UI-only selection concept?" open question).
// Unlike the four content types above, `cardWidth`/`cardHeight` here are the group's
// CONTAINER size, computed from its members' bounding box at creation time (see
// group-node.tsx), not an opt-in resize — every group has these set from the moment it
// exists, via the same existing generic `toRfNode` width/height mirroring, no special
// case needed there.
export interface GroupNodeData extends Record<string, unknown> {
  label: string;
  cardWidth: number;
  cardHeight: number;
}

// Phase 4 — first chat node (architecture.md §4.2, TF-07). `provider` picks which
// adapter this node calls (ADR-0018 — a distinct provider per node, never a dropdown
// that reconfigures the same node); `model` and `executionMode` are both independently
// per-node settings (ADR-0019/ADR-0052) — two different nodes on the same board, even
// same provider, can run different models or different execution modes without
// affecting each other. `messages` is NOT stored here — chat_messages is the source of
// truth server-side (chat.ts), fetched once on mount and appended to as the SSE stream
// comes in; keeping it out of `data` avoids a second, divergent copy of the same
// history living in two places.
export interface ChatNodeData extends Record<string, unknown> {
  provider: "claude" | "openai" | "gemini";
  model: string;
  executionMode: "local" | "native" | "manual";
  /** Per-node free-text instruction (F-16) — included in context assembly alongside
   * whatever's connected, never a replacement for it. */
  notesForAI: string;
  /** Brand/Voice Profile opt-in (F-21) — per-node, never applied globally/invisibly. */
  useBrandProfile: boolean;
  cardWidth?: number;
  cardHeight?: number;
}

interface ServerNode {
  id: string;
  board_id: string;
  type: string;
  position_x: number;
  position_y: number;
  // Grouping (Phase 3) — nullable; present on every row once migration 0003 lands.
  parent_node_id?: string | null;
  data: unknown;
}

interface ServerEdge {
  id: string;
  source_node_id: string;
  target_node_id: string;
}

function toRfNode(n: ServerNode): Node {
  const data = (n.data ?? {}) as Record<string, unknown>;
  const width = typeof data.cardWidth === "number" ? data.cardWidth : undefined;
  const height = typeof data.cardHeight === "number" ? data.cardHeight : undefined;
  return {
    id: n.id,
    type: toRfType(n.type),
    position: { x: n.position_x, y: n.position_y },
    data,
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
    // Grouping (Phase 3): mirrors React Flow's own parent/child mechanism directly —
    // `parentId` + `extent: "parent"` is what makes React Flow move a group's members
    // along with it and constrain them inside it natively, no hand-rolled drag logic
    // needed here. Only set when there IS a parent — an explicit `undefined` key would
    // still show up in the object via the spread below otherwise.
    ...(n.parent_node_id ? { parentId: n.parent_node_id, extent: "parent" as const } : {}),
  };
}

function toRfEdge(e: ServerEdge): Edge {
  return { id: e.id, source: e.source_node_id, target: e.target_node_id };
}

const SAVE_DEBOUNCE_MS = 400;
const MAX_HISTORY = 100;
// Duplication (Phase 3, F-07) — Ctrl+D's fixed visual nudge so a duplicate never lands
// exactly on top of its original (which would look like nothing happened until it's
// dragged). Copy/paste (F-19) doesn't use this — it targets the current viewport center
// instead (page.tsx's existing `centerPosition()`), since a paste is explicitly placed,
// not an in-place nudge.
const DUPLICATE_OFFSET = 32;

// BUG (caught during Phase 3 testing, Istiyak: "card style specific hover/selected work
// what we did is gone... generic selection/shadow is coming"): our custom group node's
// backend/stored `type` is literally "group" — but React Flow ships its OWN built-in
// node type ALSO named "group" with hardcoded default CSS (base stylesheet's
// `.react-flow__node-group` rule: fixed padding/border/background, plus a generic thin
// dark `box-shadow` on `.selected`). React Flow derives that CSS class straight from
// `node.type`, so OUR group node was silently inheriting RF's own stock demo appearance
// underneath/alongside our custom frame styling (group-node.tsx) the whole time — this
// is what read as "a generic shadow instead of our selected styling."
//
// Fixed by giving the group node a DIFFERENT type string at the React-Flow/rendering
// layer only. The stored/backend type (what's persisted in SQLite and what nodes.ts's
// `isNodeType()` validates) stays the plain "group" it always was — no migration, no
// risk to boards that already have real group nodes saved. `toRfType`/`toStoredType`
// are the ONLY two places these translate into each other; every other place in this
// file compares against `RF_GROUP_TYPE`, and every POST/PATCH body that sends a `type`
// field to the backend goes through `toStoredType` first.
export const RF_GROUP_TYPE = "groupFrame";
function toRfType(storedType: string): string {
  return storedType === "group" ? RF_GROUP_TYPE : storedType;
}
function toStoredType(rfType: string): string {
  return rfType === RF_GROUP_TYPE ? "group" : rfType;
}

type HistoryEntry =
  | { kind: "create"; node: Node }
  | { kind: "delete"; node: Node; edges: Edge[] }
  | { kind: "move"; nodeId: string; from: { x: number; y: number }; to: { x: number; y: number } }
  | {
      kind: "update";
      nodeId: string;
      from: { type: string; data: Record<string, unknown> };
      to: { type: string; data: Record<string, unknown> };
    }
  | {
      kind: "resize";
      nodeId: string;
      from: { width?: number; height?: number };
      to: { width: number; height: number };
    }
  // TF-06 — a drag-to-connect or an edge delete, each undoable the same way a node
  // create/delete is: "connect" forward = the edge exists, backward = it doesn't.
  | { kind: "connect"; edge: Edge }
  | { kind: "disconnectEdge"; edge: Edge }
  // Grouping (Phase 3) — "group" and "ungroup" are each other's inverse, both carrying
  // the SAME shape (the group node itself + each member's position RELATIVE to it, the
  // form React Flow's parentId convention requires): "group" forward = attachGroup
  // (create/reparent), backward = detachGroup (remove/un-parent); "ungroup" is the exact
  // opposite pairing. See attachGroup/detachGroup below — this symmetry is why there's
  // only two helper functions for four directions (group fwd/bwd, ungroup fwd/bwd).
  // Round (Istiyak, Phase 3 close-out testing: "On grouping several nodes if they
  // already have nodes connected. That keeps intact. which should not be the case.
  // Ideally after grouping nodes should not be there only groups node should appear"):
  // "group"/"ungroup" now also carry the edge side-effect of absorbing/releasing a
  // member's external connections onto the group itself (computeGroupEdgeAbsorption,
  // groupSelectedNodes/ungroupNode below) — `removedMemberEdges`/`createdGroupEdges` on
  // "group" are the edges that existed before/after that absorption, so undo can put
  // the originals back and remove the absorbed ones; `groupEdges` on "ungroup" is
  // whatever edges were live on the group at the moment it was dissolved, so undoing an
  // ungroup can recreate them. Deliberately NOT trying to redistribute a dissolved
  // group's edges back onto individual members on ungroup — with more than one member
  // there's no single correct member to hand an absorbed connection back to, so
  // ungrouping simply drops the group's own edges rather than guessing.
  | {
      kind: "group";
      groupNode: Node;
      members: { id: string; relativePosition: { x: number; y: number } }[];
      removedMemberEdges: Edge[];
      createdGroupEdges: Edge[];
    }
  | {
      kind: "ungroup";
      groupNode: Node;
      members: { id: string; relativePosition: { x: number; y: number } }[];
      groupEdges: Edge[];
    }
  // Duplication (Phase 3, F-07/F-19) — one entry covers BOTH Ctrl+D's in-place duplicate
  // and an explicit paste: both are "a batch of brand-new nodes/edges came into
  // existence together," undoable as one step regardless of how many nodes were in the
  // selection. `nodes`/`edges` are the ALREADY-MATERIALIZED objects (final ids, final
  // positions) — forward/redo recreates them with those SAME ids (recreateNodeRemote/
  // recreateEdgeRemote, same identity-stability reasoning as every other entry here),
  // backward/undo removes the whole batch outright (not an ungroup-release — these
  // members were created BY this entry, so undoing it has nothing to preserve).
  | { kind: "duplicate"; nodes: Node[]; edges: Edge[] };

interface BoardState {
  boardId: string | null;
  boardTitle: string | null;
  /** The board's current folder, if any — read by the navbar's breadcrumb (Top Nav
   * pass) so it doesn't need its own separate board fetch just to know this. */
  boardFolderId: string | null;
  nodes: Node[];
  edges: Edge[];
  loaded: boolean;
  loadError: string | null;
  past: HistoryEntry[];
  future: HistoryEntry[];

  loadBoard: (boardId: string) => Promise<void>;
  /** Renames the currently-loaded board (the breadcrumb's inline-rename UI, Top Nav
   * pass) — optimistic, same PATCH endpoint and shape as the Boards List page's own
   * `handleRenameBoard` ((list)/all/page.tsx), reused rather than duplicated. Reverts
   * the local title if the request fails, since an unrenamed board silently looking
   * renamed would be a worse outcome here than the best-effort autosave elsewhere in
   * this file (a title is user-authored identity, not a debounced content edit that'll
   * just retry on the next keystroke). */
  renameBoard: (title: string) => Promise<void>;
  onNodesChange: (changes: NodeChange[]) => void;
  /** `content` optionally seeds the node (the canvas's paste-plain-text-to-create-note
   * handler uses this so pasted text becomes a filled note in one create call, not an
   * empty one followed by a second PATCH). */
  addTextNode: (position: { x: number; y: number }, content?: string) => Promise<void>;
  addLinkNode: (position: { x: number; y: number }, prefill?: Partial<LinkNodeData>) => Promise<void>;
  addFileNode: (position: { x: number; y: number }, file: File) => Promise<void>;
  /** Phase 5 (ADR-0044's manual-override path) — forces a fresh yt-dlp/ffmpeg/whisper
   * run for a video/audio/link node's "Re-extract" button regardless of what's already
   * cached, via the long-running `/re-extract` route (lib/api.ts's `reExtractRequest`,
   * not the default short-timeout `request()`). Optimistically marks the node
   * `extractionStatus: "pending"` so the card updates immediately, and reverts on
   * failure (the DB row never actually changed). */
  reExtractNode: (nodeId: string) => Promise<void>;
  /** ADR-0091 — fired automatically the instant a video/audio/link node's source becomes
   * known (paste-to-create, file upload, or a link node's URL field committing), instead
   * of waiting for ADR-0044's lazy chat-triggered path or a manual Re-extract click.
   * Unlike `reExtractNode`, this is NOT forced — it respects the extraction_cache, so
   * triggering it repeatedly for the same already-extracted source is cheap (a cache
   * hit), not a wasted re-run of the pipeline. Fire-and-forget (not awaited by callers),
   * same convention as `refreshVideoMetadata`/`refreshLinkPreview`. */
  startExtraction: (nodeId: string) => void;
  /** Re-syncs just `type`/`data` for the given node ids from the server — used after a
   * chat-node SSE "extracting" event resolves, so the referenced video/audio/link
   * node's card picks up its new transcript/status without a full board reload. */
  refreshNodesData: (nodeIds: string[]) => Promise<void>;
  /** Places a chat node for the given provider, pre-selecting that provider's default
   * model (F-12: "never requires a choice before it's usable") — same toolbar-click
   * pattern as addTextNode/addLinkNode. */
  addChatNode: (position: { x: number; y: number }, provider: ChatNodeData["provider"]) => Promise<void>;
  /** Returns true if `url` was recognized as a YouTube/Vimeo link and a video node was created. */
  addVideoNodeFromUrl: (position: { x: number; y: number }, url: string) => Promise<boolean>;
  /** Converts an existing `link` node in place once its URL field resolves to a video platform. */
  convertLinkNodeToVideo: (nodeId: string, url: string) => Promise<boolean>;
  /** Kicks off the lightweight title+favicon fetch for a `link` node's current URL
   * (ADR-0067) — safe to call repeatedly; the caller is expected to already have
   * checked `metaForUrl !== url` so this isn't re-fetched needlessly. */
  refreshLinkPreview: (nodeId: string, url: string) => void;
  updateNodeData: (nodeId: string, data: Record<string, unknown>) => void;
  flushNodeData: (nodeId: string) => void;
  saveNodePosition: (nodeId: string, from: { x: number; y: number }, to: { x: number; y: number }) => void;
  /** Persists a card resize (ADR-0070) — called once on resize-end, not per drag tick. */
  saveNodeSize: (nodeId: string, size: { width: number; height: number }) => void;
  deleteNode: (nodeId: string) => Promise<void>;
  // TF-06 (Phase 3) — drag-to-connect edge selection/deletion flows through React
  // Flow's own onEdgesChange the exact same way onNodesChange above routes "remove"
  // through deleteNode: everything else (selection) is a plain local state update,
  // "remove" is routed to deleteEdge so every deletion path behaves identically.
  onEdgesChange: (changes: EdgeChange[]) => void;
  /** React Flow's onConnect handler fires this with the dragged connection's two
   * endpoints. Self-loops and an exact duplicate of an existing edge (either
   * direction) are silently ignored rather than erroring — dragging onto the wrong
   * handle by a pixel shouldn't need an error toast this app doesn't have yet. */
  connectNodes: (connection: Connection) => Promise<void>;
  deleteEdge: (edgeId: string) => Promise<void>;
  // Grouping (Phase 3). `bounds` is computed by the caller (the canvas page, which has
  // live access to React Flow's measured node dimensions via useReactFlow() — the store
  // itself only holds the explicit sizes we set, not live-measured ones) from the
  // selected nodes' bounding box, padded. Silently no-ops under 2 members or if every
  // selected node is already in a group (regrouping an already-grouped node isn't
  // supported in this pass — ungroup first).
  groupSelectedNodes: (
    memberIds: string[],
    bounds: { x: number; y: number; width: number; height: number }
  ) => Promise<void>;
  /** Removes the group container, restoring each member to its absolute canvas position
   * (unchanged relative to each other) — not a delete of the members themselves. */
  ungroupNode: (groupId: string) => Promise<void>;
  // Duplication (Phase 3, F-07/F-19). `nodeIds` are the SELECTED top-level ids — any id
  // that names a `group` node is automatically expanded to include its current members,
  // so passing just the group's own id is enough to duplicate/copy it whole; a selected
  // member whose group ISN'T also selected duplicates/copies as a lone, ungrouped node.
  // In every case, an edge is only ever carried over when BOTH its endpoints are inside
  // the same selected set (F-07's "external edges are NOT copied" rule) — see
  // `buildCloneTemplate` for the one place this is implemented.
  /** Ctrl+D — duplicates the selection in place on the SAME board, offset by a small
   * fixed nudge (`DUPLICATE_OFFSET`). Never touches the clipboard below. */
  duplicateSelection: (nodeIds: string[]) => Promise<void>;
  /** Ctrl+C — freezes a snapshot of the selection into a clipboard that deliberately
   * lives OUTSIDE this store's own state (see the module-level `clipboard` variable),
   * so it survives `loadBoard` resetting everything else when the user navigates to a
   * different board — the whole point of F-19's "paste on a different board." */
  copySelection: (nodeIds: string[]) => void;
  /** Ctrl+V — materializes whatever's in the clipboard onto the CURRENTLY loaded board
   * (whichever board that is), anchored at `position` (page.tsx's `centerPosition()`
   * for an explicit paste). A no-op if nothing's been copied yet. */
  pasteClipboard: (position: { x: number; y: number }) => Promise<void>;
  /** Synchronous peek at whether the clipboard (above) actually has something in it —
   * BUG-028: page.tsx's Ctrl+V keydown handler needs this BEFORE calling
   * `pasteClipboard` (which is async, and was unconditionally calling
   * `event.preventDefault()` regardless of whether there was anything to paste), so it
   * can let a truly empty-clipboard Ctrl+V fall through to the browser's native paste
   * event instead of silently swallowing it every time. */
  hasClipboardContent: () => boolean;
  /** Clears every node's `selected` flag at once — the canvas page's pane-click handler
   * uses this (board-store.ts owns `nodes` in controlled mode, so React Flow's own
   * `useReactFlow().setNodes` can't be the one to do it; it would just be overwritten
   * by the next render of this store's own `nodes`). */
  deselectAllNodes: () => void;
  undo: () => void;
  redo: () => void;
}

const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingData = new Map<string, Record<string, unknown>>();
// Snapshot of a node's {type, data} taken the moment an edit session starts (first
// change since the last commit) — compared against what actually gets committed so a
// debounce tick or a blur only produces a history entry when something really changed.
const editBaseline = new Map<string, { type: string; data: Record<string, unknown> }>();

// Duplication/copy-paste (Phase 3, F-19) — a frozen, board-agnostic snapshot of a past
// `copySelection` call. Positions are stored RELATIVE to the selection's own bounding-box
// top-left (`originX`/`originY` at copy time), and every reference between cloned nodes
// (a child's parent, an internal edge's two endpoints) is keyed by the ORIGINAL node id
// — `materializeTemplate` is what turns this into real nodes/edges, generating a fresh
// id for every entry EACH time it's called, so pasting the same clipboard twice (or once
// per board) always produces independent copies, never a collision.
//
// Deliberately a plain module-level variable, NOT part of the Zustand state this file
// otherwise keeps everything in: `loadBoard` resets `nodes`/`edges`/`past`/`future` on
// every board switch (by design — those are per-board), but a clipboard has to survive
// exactly that switch for "paste on a different board" to mean anything. Same reasoning
// already applies to `saveTimers`/`pendingData`/`editBaseline` above, just for a
// longer-lived piece of data.
interface CloneTemplateNode {
  originalId: string;
  type: string;
  data: Record<string, unknown>;
  relX: number;
  relY: number;
  /** The ORIGINAL id of this node's parent group, only when that group is ALSO part of
   * this same template (i.e. was itself selected/copied) — never a dangling reference
   * to a group that didn't come along. */
  parentOriginalId?: string;
}
interface CloneTemplateEdge {
  sourceOriginalId: string;
  targetOriginalId: string;
}
interface CloneTemplate {
  originX: number;
  originY: number;
  nodes: CloneTemplateNode[];
  edges: CloneTemplateEdge[];
}
let clipboard: CloneTemplate | null = null;

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function doSaveData(boardId: string, nodeId: string, patch: { type?: string; data: Record<string, unknown> }) {
  api.patch<{ node: ServerNode }>(`/api/boards/${boardId}/nodes/${nodeId}`, patch).catch(() => {
    // Best-effort autosave — a transient failure here shouldn't crash the canvas; the
    // next edit (or the next debounce tick) will retry with the latest data anyway.
  });
}

export const useBoardStore = create<BoardState>((set, get) => {
  function pushHistory(entry: HistoryEntry) {
    set((state) => ({
      past: [...state.past, entry].slice(-MAX_HISTORY),
      future: [],
    }));
  }

  function removeNodeAndEdgesLocal(nodeId: string): { node: Node | undefined; edges: Edge[] } {
    const state = get();
    const node = state.nodes.find((n) => n.id === nodeId);
    const removedEdges = state.edges.filter((e) => e.source === nodeId || e.target === nodeId);
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== nodeId),
      edges: s.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
    }));
    return { node, edges: removedEdges };
  }

  function deleteNodeRemote(nodeId: string) {
    const { boardId } = get();
    if (!boardId) return;
    const timer = saveTimers.get(nodeId);
    if (timer) clearTimeout(timer);
    saveTimers.delete(nodeId);
    pendingData.delete(nodeId);
    editBaseline.delete(nodeId);
    api.delete(`/api/boards/${boardId}/nodes/${nodeId}`).catch(() => {
      // The node is already gone from local state; a failed server delete here would
      // just mean it reappears on next reload, not a crash — acceptable for MVP.
    });
  }

  // Recreates a node with its ORIGINAL id (undo-of-delete / redo-of-create need the
  // restored node to be the same node, not a lookalike with a new id) — the backend's
  // POST route accepts an optional `id` for exactly this (see nodes.ts + ADR-0066).
  async function recreateNodeRemote(node: Node) {
    const { boardId } = get();
    if (!boardId) return;
    try {
      const { node: created } = await api.post<{ node: ServerNode }>(`/api/boards/${boardId}/nodes`, {
        id: node.id,
        type: toStoredType(node.type ?? "text"),
        position_x: node.position.x,
        position_y: node.position.y,
        // Grouping (Phase 3): a node deleted while it was still a group member has
        // `node.parentId` set and its position is already relative-to-group (how it was
        // stored locally the whole time) — carried over here so undo-of-delete puts it
        // back in its group, not floating top-level at its old relative coordinates
        // reinterpreted as absolute ones.
        parent_node_id: node.parentId ?? null,
        data: node.data,
      });
      set((s) => ({ nodes: [...s.nodes, toRfNode(created)] }));
    } catch {
      // Best-effort — an undo that fails to persist still restores the node visually
      // for this session; a future save/edit on it will retry.
      set((s) => ({ nodes: [...s.nodes, node] }));
    }
  }

  // --- Edges (TF-06, Phase 3) --------------------------------------------------------
  // Mirrors the node helpers immediately above: a *Local function updates only the
  // in-memory store, a *Remote function is the best-effort server call, and
  // recreateEdgeRemote restores a specific edge BY ITS ORIGINAL ID (not a fresh one)
  // for undo-of-delete/redo-of-connect, exactly like recreateNodeRemote does for nodes.

  function removeEdgeLocal(edgeId: string): Edge | undefined {
    const state = get();
    const edge = state.edges.find((e) => e.id === edgeId);
    set((s) => ({ edges: s.edges.filter((e) => e.id !== edgeId) }));
    return edge;
  }

  function deleteEdgeRemote(edgeId: string) {
    const { boardId } = get();
    if (!boardId) return;
    api.delete(`/api/boards/${boardId}/edges/${edgeId}`).catch(() => {
      // Best-effort — see deleteNodeRemote's own comment above; a failed server delete
      // here just means it reappears on next reload, not a crash.
    });
  }

  async function recreateEdgeRemote(edge: Edge) {
    const { boardId } = get();
    if (!boardId) return;
    try {
      const { edge: created } = await api.post<{ edge: ServerEdge }>(`/api/boards/${boardId}/edges`, {
        id: edge.id,
        source_node_id: edge.source,
        target_node_id: edge.target,
      });
      set((s) => ({ edges: [...s.edges, toRfEdge(created)] }));
    } catch {
      // Best-effort, same reasoning as recreateNodeRemote: restore visually for this
      // session even if the server round trip failed.
      set((s) => ({ edges: [...s.edges, edge] }));
    }
  }

  // Grouping absorbs connections (Istiyak: "Ideally after grouping nodes should not be
  // there only groups node should appear") — an edge where exactly ONE endpoint is a
  // node about to join the group gets re-pointed onto the GROUP itself rather than
  // staying attached to the (now hidden-handle, per node-chrome.tsx's
  // `hideConnections`) member buried inside it. An edge where BOTH endpoints are
  // joining this same group is "internal" and is left exactly alone — the same F-07
  // rule duplication already applies to its own copied selections. Returns the
  // original edges to remove and the DEDUPED (source, target) pairs to create in their
  // place, since two members both already wired to the same outside node must collapse
  // onto one group<->that-node edge, not two overlapping ones.
  function computeGroupEdgeAbsorption(
    groupId: string,
    memberIds: Set<string>,
    edges: Edge[]
  ): { toRemove: Edge[]; toCreatePairs: { source: string; target: string }[] } {
    const toRemove: Edge[] = [];
    const pairKeys = new Set<string>();
    const toCreatePairs: { source: string; target: string }[] = [];
    for (const edge of edges) {
      const sourceIsMember = memberIds.has(edge.source);
      const targetIsMember = memberIds.has(edge.target);
      if (sourceIsMember === targetIsMember) continue; // both internal or neither — untouched
      const source = sourceIsMember ? groupId : edge.source;
      const target = targetIsMember ? groupId : edge.target;
      toRemove.push(edge);
      if (source === target) continue; // degenerate (both ends collapsed to the group) — drop silently
      const key = `${source}->${target}`;
      if (!pairKeys.has(key)) {
        pairKeys.add(key);
        toCreatePairs.push({ source, target });
      }
    }
    return { toRemove, toCreatePairs };
  }

  // --- Grouping (Phase 3) -------------------------------------------------------------
  // attachGroup is "make this group exist and these members belong to it" — used by the
  // live group action, by redo-of-group, and by undo-of-ungroup (all three are the same
  // operation from the data's point of view). detachGroup is its exact inverse. Both
  // take the group node's id as fixed/given (the caller generates it client-side via
  // crypto.randomUUID() before the first call) so redo always recreates the SAME group,
  // never a lookalike with a new id — same identity-stability reasoning as every other
  // *Remote recreate function in this file.

  async function attachGroup(groupNode: Node, members: { id: string; relativePosition: { x: number; y: number } }[]) {
    const { boardId } = get();
    if (!boardId) return;
    try {
      await api.post(`/api/boards/${boardId}/nodes`, {
        id: groupNode.id,
        type: "group",
        position_x: groupNode.position.x,
        position_y: groupNode.position.y,
        data: groupNode.data,
      });
    } catch {
      // Best-effort — see recreateNodeRemote's own comment; the local state below still
      // makes the group visually correct for this session even if this POST failed.
    }
    set((s) => ({
      nodes: [
        groupNode,
        ...s.nodes
          .filter((n) => n.id !== groupNode.id)
          .map((n) => {
            const member = members.find((m) => m.id === n.id);
            if (!member) return n;
            return { ...n, position: member.relativePosition, parentId: groupNode.id, extent: "parent" as const };
          }),
      ],
    }));
    for (const member of members) {
      api
        .patch(`/api/boards/${boardId}/nodes/${member.id}`, {
          position_x: member.relativePosition.x,
          position_y: member.relativePosition.y,
          parent_node_id: groupNode.id,
        })
        .catch(() => {
          // Best-effort, same posture as every other mutation in this file.
        });
    }
  }

  async function detachGroup(groupNode: Node, members: { id: string; relativePosition: { x: number; y: number } }[]) {
    const { boardId } = get();
    if (!boardId) return;
    const absoluteMembers = members.map((m) => ({
      id: m.id,
      position: { x: groupNode.position.x + m.relativePosition.x, y: groupNode.position.y + m.relativePosition.y },
    }));
    set((s) => ({
      nodes: s.nodes
        .filter((n) => n.id !== groupNode.id)
        .map((n) => {
          const member = absoluteMembers.find((m) => m.id === n.id);
          if (!member) return n;
          const next: Node = { ...n, position: member.position };
          delete next.parentId;
          delete next.extent;
          return next;
        }),
    }));
    // The DELETE route also nulls every child's parent_node_id server-side as its own
    // safety net (nodes.ts) — the explicit PATCHes below are still needed regardless,
    // since that route doesn't know each member's new ABSOLUTE position, only that it's
    // no longer grouped.
    deleteNodeRemote(groupNode.id);
    for (const member of absoluteMembers) {
      api
        .patch(`/api/boards/${boardId}/nodes/${member.id}`, {
          position_x: member.position.x,
          position_y: member.position.y,
          parent_node_id: null,
        })
        .catch(() => {
          // Best-effort, same posture as every other mutation in this file.
        });
    }
  }

  // --- Duplication / copy-paste (Phase 3, F-07/F-19) ----------------------------------
  // buildCloneTemplate reads the CURRENT board state and turns a selection into the
  // board-agnostic snapshot shape described above the `clipboard` variable; it never
  // touches `set`/the server — that's materializeTemplate's job. Both duplicateSelection
  // and copySelection are thin wrappers around this one function so the "expand a
  // selected group to include its members" and "an edge only carries over when BOTH
  // endpoints are inside the selection" rules exist in exactly one place.
  function buildCloneTemplate(nodeIds: string[]): CloneTemplate | null {
    const { nodes, edges } = get();
    const idSet = new Set(nodeIds);
    for (const id of nodeIds) {
      const node = nodes.find((n) => n.id === id);
      if (node?.type === RF_GROUP_TYPE) {
        for (const member of nodes.filter((n) => n.parentId === id)) idSet.add(member.id);
      }
    }
    const selected = nodes.filter((n) => idSet.has(n.id));
    if (selected.length === 0) return null;

    // BUG (Istiyak, Phase 3 close-out testing: "Group getting copied but internal
    // nodes lost their positions"): a member node's `position` is RELATIVE TO ITS
    // PARENT once grouped (React Flow's own `parentId` convention — attachGroup above
    // stores exactly that, a position relative to the group's bounds), but the group
    // node's own `position` is an ABSOLUTE canvas coordinate. The old code below took
    // `Math.min` across BOTH without distinguishing them, mixing two different
    // coordinate spaces into one "origin" — corrupting every member's `relX`/`relY`,
    // worse the bigger the group's own absolute position was relative to its members'
    // small in-group offsets. Only ROOT-level selected nodes (standalone nodes, or a
    // group node itself) have an absolute position that belongs in this computation —
    // a member being carried along because its group was selected is excluded.
    let originX = Infinity;
    let originY = Infinity;
    for (const n of selected) {
      if (n.parentId && idSet.has(n.parentId)) continue; // member — relative position, not absolute
      originX = Math.min(originX, n.position.x);
      originY = Math.min(originY, n.position.y);
    }

    const templateNodes: CloneTemplateNode[] = selected.map((n) => {
      const isMember = Boolean(n.parentId && idSet.has(n.parentId));
      return {
        originalId: n.id,
        type: n.type ?? "text",
        data: structuredClone(n.data) as Record<string, unknown>,
        // A member's position is ALREADY relative to its parent — carried over as-is,
        // never measured against `originX`/`originY` (an absolute-coordinate concept
        // that doesn't apply to it). Only a root-level node's position is relative to
        // the selection's own origin.
        relX: isMember ? n.position.x : n.position.x - originX,
        relY: isMember ? n.position.y : n.position.y - originY,
        parentOriginalId: n.parentId && idSet.has(n.parentId) ? n.parentId : undefined,
      };
    });
    // F-07's explicit rule: an edge is "internal" (carried over) only when BOTH its
    // endpoints are part of THIS selection — any edge reaching outside it is dropped,
    // never copied onto the duplicate/paste.
    const templateEdges: CloneTemplateEdge[] = edges
      .filter((e) => idSet.has(e.source) && idSet.has(e.target))
      .map((e) => ({ sourceOriginalId: e.source, targetOriginalId: e.target }));

    return { originX, originY, nodes: templateNodes, edges: templateEdges };
  }

  // Turns a template into real, persisted nodes/edges anchored at (targetX, targetY) —
  // generates a FRESH id for every templated node on every call (so the same template
  // can be materialized repeatedly, e.g. pasted twice, without ever colliding), in two
  // passes (groups before members — the same "parent before child" ordering page.tsx's
  // render fix and attachGroup both already rely on) so a child's `parent_node_id`
  // always names an id the backend already has a row for.
  async function materializeTemplate(template: CloneTemplate, targetX: number, targetY: number) {
    const { boardId } = get();
    if (!boardId) return;
    const idMap = new Map<string, string>();
    for (const n of template.nodes) idMap.set(n.originalId, crypto.randomUUID());

    const orderedNodes = [
      ...template.nodes.filter((n) => n.type === RF_GROUP_TYPE),
      ...template.nodes.filter((n) => n.type !== RF_GROUP_TYPE),
    ];

    const createdNodes: Node[] = [];
    for (const n of orderedNodes) {
      const newId = idMap.get(n.originalId)!;
      const parent_node_id = n.parentOriginalId ? idMap.get(n.parentOriginalId) ?? null : null;
      // Same bug, other half: a member's `relX`/`relY` is ALREADY its correct
      // relative-to-parent offset (buildCloneTemplate above no longer re-measures it
      // against the selection's origin) — only a root-level node's position should
      // shift by the new (targetX, targetY) anchor. Adding targetX/targetY onto a
      // member's offset too was what actually flung it away from its new parent's
      // frame (then extent:"parent" clamped it to the edge, matching the screenshot).
      const position_x = parent_node_id ? n.relX : targetX + n.relX;
      const position_y = parent_node_id ? n.relY : targetY + n.relY;
      try {
        const { node: created } = await api.post<{ node: ServerNode }>(`/api/boards/${boardId}/nodes`, {
          id: newId,
          type: toStoredType(n.type),
          position_x,
          position_y,
          parent_node_id,
          data: n.data,
        });
        createdNodes.push(toRfNode(created));
      } catch {
        // Best-effort, same posture as every other mutation in this file — a failed
        // create here just means that one node is missing until the next reload/retry,
        // not a crash of the whole batch.
      }
    }

    const createdEdges: Edge[] = [];
    for (const e of template.edges) {
      const source_node_id = idMap.get(e.sourceOriginalId);
      const target_node_id = idMap.get(e.targetOriginalId);
      if (!source_node_id || !target_node_id) continue; // that node's own create failed above
      try {
        const { edge: created } = await api.post<{ edge: ServerEdge }>(`/api/boards/${boardId}/edges`, {
          id: crypto.randomUUID(),
          source_node_id,
          target_node_id,
        });
        createdEdges.push(toRfEdge(created));
      } catch {
        // Best-effort, same reasoning as above.
      }
    }

    set((s) => ({ nodes: [...s.nodes, ...createdNodes], edges: [...s.edges, ...createdEdges] }));
    pushHistory({ kind: "duplicate", nodes: createdNodes, edges: createdEdges });
  }

  function setNodePositionLocal(nodeId: string, x: number, y: number) {
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === nodeId ? { ...n, position: { x, y } } : n)),
    }));
  }

  function savePositionRemote(nodeId: string, x: number, y: number) {
    const { boardId } = get();
    if (!boardId) return;
    api.patch(`/api/boards/${boardId}/nodes/${nodeId}`, { position_x: x, position_y: y }).catch(() => {
      // Best-effort — see doSaveData's comment above.
    });
  }

  function applyNodeTypeAndDataLocal(nodeId: string, type: string, data: Record<string, unknown>) {
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === nodeId ? { ...n, type, data } : n)),
    }));
  }

  function commitNodeTypeAndData(nodeId: string, type: string, data: Record<string, unknown>) {
    applyNodeTypeAndDataLocal(nodeId, type, data);
    const { boardId } = get();
    if (boardId) doSaveData(boardId, nodeId, { type: toStoredType(type), data });
  }

  // Sets (or clears, when width/height are undefined — used by resize-undo reverting to
  // the pre-resize auto size) both the RF node's own width/height AND the mirrored
  // cardWidth/cardHeight in `data`, since `data` is what actually persists server-side
  // (ADR-0070 — no dedicated DB column).
  function setNodeSizeLocal(nodeId: string, width: number | undefined, height: number | undefined) {
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== nodeId) return n;
        const data = { ...(n.data as Record<string, unknown>), cardWidth: width, cardHeight: height };
        const next: Node = { ...n, data };
        if (width !== undefined) next.width = width;
        else delete next.width;
        if (height !== undefined) next.height = height;
        else delete next.height;
        return next;
      }),
    }));
  }

  function saveSizeRemote(nodeId: string) {
    const { boardId, nodes } = get();
    if (!boardId) return;
    const current = nodes.find((n) => n.id === nodeId);
    if (!current) return;
    doSaveData(boardId, nodeId, { data: current.data as Record<string, unknown> });
  }

  function applyEntryForward(entry: HistoryEntry) {
    switch (entry.kind) {
      case "create":
        recreateNodeRemote(entry.node);
        break;
      case "delete":
        removeNodeAndEdgesLocal(entry.node.id);
        deleteNodeRemote(entry.node.id);
        break;
      case "move":
        setNodePositionLocal(entry.nodeId, entry.to.x, entry.to.y);
        savePositionRemote(entry.nodeId, entry.to.x, entry.to.y);
        break;
      case "update":
        commitNodeTypeAndData(entry.nodeId, entry.to.type, entry.to.data);
        break;
      case "resize":
        setNodeSizeLocal(entry.nodeId, entry.to.width, entry.to.height);
        saveSizeRemote(entry.nodeId);
        break;
      case "connect":
        recreateEdgeRemote(entry.edge);
        break;
      case "disconnectEdge":
        removeEdgeLocal(entry.edge.id);
        deleteEdgeRemote(entry.edge.id);
        break;
      case "group":
        attachGroup(entry.groupNode, entry.members);
        for (const edge of entry.removedMemberEdges) {
          removeEdgeLocal(edge.id);
          deleteEdgeRemote(edge.id);
        }
        for (const edge of entry.createdGroupEdges) {
          recreateEdgeRemote(edge);
        }
        break;
      case "ungroup":
        for (const edge of entry.groupEdges) {
          removeEdgeLocal(edge.id);
          deleteEdgeRemote(edge.id);
        }
        detachGroup(entry.groupNode, entry.members);
        break;
      case "duplicate":
        for (const node of [...entry.nodes.filter((n) => n.type === RF_GROUP_TYPE), ...entry.nodes.filter((n) => n.type !== RF_GROUP_TYPE)]) {
          recreateNodeRemote(node);
        }
        for (const edge of entry.edges) {
          recreateEdgeRemote(edge);
        }
        break;
    }
  }

  function applyEntryBackward(entry: HistoryEntry) {
    switch (entry.kind) {
      case "create":
        removeNodeAndEdgesLocal(entry.node.id);
        deleteNodeRemote(entry.node.id);
        break;
      case "delete":
        recreateNodeRemote(entry.node);
        break;
      case "move":
        setNodePositionLocal(entry.nodeId, entry.from.x, entry.from.y);
        savePositionRemote(entry.nodeId, entry.from.x, entry.from.y);
        break;
      case "update":
        commitNodeTypeAndData(entry.nodeId, entry.from.type, entry.from.data);
        break;
      case "resize":
        setNodeSizeLocal(entry.nodeId, entry.from.width, entry.from.height);
        saveSizeRemote(entry.nodeId);
        break;
      case "connect":
        removeEdgeLocal(entry.edge.id);
        deleteEdgeRemote(entry.edge.id);
        break;
      case "disconnectEdge":
        recreateEdgeRemote(entry.edge);
        break;
      case "group":
        detachGroup(entry.groupNode, entry.members);
        for (const edge of entry.createdGroupEdges) {
          removeEdgeLocal(edge.id);
          deleteEdgeRemote(edge.id);
        }
        for (const edge of entry.removedMemberEdges) {
          recreateEdgeRemote(edge);
        }
        break;
      case "ungroup":
        attachGroup(entry.groupNode, entry.members);
        for (const edge of entry.groupEdges) {
          recreateEdgeRemote(edge);
        }
        break;
      case "duplicate":
        // Undoing a duplicate/paste removes the WHOLE batch it created outright — unlike
        // `deleteNode`'s group-aware special case, there's no pre-existing content to
        // preserve here: every one of these nodes (members included) was itself created
        // by this entry, so undo erases all of it. The backend's own node-DELETE route
        // already cascades any edge touching a node it's deleting, so there's nothing
        // separate to do for `entry.edges` here.
        for (const node of entry.nodes) {
          removeNodeAndEdgesLocal(node.id);
          deleteNodeRemote(node.id);
        }
        break;
    }
  }

  // Kicks off the backend oEmbed fetch and fills in title/thumbnail once it resolves —
  // deliberately NOT a history entry of its own (it's the system finishing what the
  // create/convert action already started, not a second user edit) and bypasses the
  // debounced autosave path entirely (immediate PATCH) since it's a one-shot background
  // fill-in, not something the user is actively typing.
  function refreshVideoMetadata(nodeId: string, url: string) {
    const { boardId } = get();
    if (!boardId) return;
    api
      .get<{
        platform: "youtube" | "vimeo" | "generic";
        status?: "ok" | "error";
        videoId?: string;
        title?: string;
        thumbnailUrl?: string;
        authorName?: string;
      }>(`/api/link-preview?url=${encodeURIComponent(url)}`)
      .then((result) => {
        const current = get().nodes.find((n) => n.id === nodeId);
        if (!current || current.type !== "video") return; // node deleted or converted away meanwhile
        const existing = current.data as VideoNodeData;
        const nextData: VideoNodeData =
          (result.platform === "youtube" || result.platform === "vimeo") && result.status === "ok"
            ? {
                ...existing,
                title: result.title ?? "",
                thumbnailUrl: result.thumbnailUrl ?? "",
                authorName: result.authorName ?? "",
                status: "ok",
              }
            : { ...existing, status: "error" };
        applyNodeTypeAndDataLocal(nodeId, "video", nextData);
        doSaveData(boardId, nodeId, { type: "video", data: nextData });
      })
      .catch(() => {
        const current = get().nodes.find((n) => n.id === nodeId);
        if (!current || current.type !== "video") return;
        const existing = current.data as VideoNodeData;
        const nextData: VideoNodeData = { ...existing, status: "error" };
        applyNodeTypeAndDataLocal(nodeId, "video", nextData);
        doSaveData(boardId, nodeId, { type: "video", data: nextData });
      });
  }

  // Round 2 (ADR-0067): the generic-link counterpart to refreshVideoMetadata — fetches
  // ONLY a title+favicon for a `link` node's URL, never page content. Same "not a
  // history entry of its own" and "bypasses the debounced autosave" reasoning. Respects
  // a manually-overridden title (`titleSource: "manual"`) by never touching `title` in
  // that case, even though favicon/status still update.
  function refreshLinkMetadata(nodeId: string, url: string) {
    const { boardId } = get();
    if (!boardId) return;

    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId && n.type === "link" ? { ...n, data: { ...(n.data as LinkNodeData), status: "loading" } } : n
      ),
    }));

    api
      .get<{ platform: "youtube" | "vimeo" | "generic"; status?: "ok" | "error"; title?: string; faviconUrl?: string }>(
        `/api/link-preview?url=${encodeURIComponent(url)}`
      )
      .then((result) => {
        const current = get().nodes.find((n) => n.id === nodeId);
        if (!current || current.type !== "link") return; // deleted or converted to video meanwhile
        const existing = current.data as LinkNodeData;
        if (existing.url !== url) return; // a newer edit already superseded this fetch

        let nextData: LinkNodeData;
        if (result.platform === "generic" && result.status === "ok") {
          nextData = {
            ...existing,
            title: existing.titleSource === "manual" ? existing.title : result.title || existing.title,
            faviconUrl: result.faviconUrl ?? existing.faviconUrl,
            status: "ok",
            metaForUrl: url,
          };
        } else {
          // Not recognized as a generic HTML page (or it is YouTube/Vimeo, which
          // should already have gone through convertLinkNodeToVideo instead) — leave
          // metaForUrl unset so a later retry (next blur) is allowed.
          nextData = { ...existing, status: "error" };
        }
        applyNodeTypeAndDataLocal(nodeId, "link", nextData);
        doSaveData(boardId, nodeId, { type: "link", data: nextData });
      })
      .catch(() => {
        const current = get().nodes.find((n) => n.id === nodeId);
        if (!current || current.type !== "link") return;
        const existing = current.data as LinkNodeData;
        if (existing.url !== url) return;
        const nextData: LinkNodeData = { ...existing, status: "error" };
        applyNodeTypeAndDataLocal(nodeId, "link", nextData);
        doSaveData(boardId, nodeId, { type: "link", data: nextData });
      });
  }

  // ADR-0091/ADR-0092 — background poller that picks up the REAL extraction outcome
  // after a client-side timeout, instead of leaving the card stuck on the optimistic
  // "pending" state forever. 20s between checks; gives up after 360 attempts (2 hours)
  // as a sanity ceiling — media-extraction.ts's `transcribe()` step has no server-side
  // timeout of its own, AND ADR-0092's bounded-concurrency queue means a node pasted
  // near the end of a big batch (Istiyak's own example: 10 videos at once) can now
  // spend real time just WAITING for a free slot before its own pipeline even starts,
  // on top of however long that pipeline takes. 2 hours comfortably covers a sizeable
  // batch of long videos; an abandoned poll is harmless (it's just a `refreshNodesData`
  // call; no cleanup needed if the user navigates away — see that function's own
  // board-mismatch no-op case), and even if the ceiling IS hit, the node's true status
  // is already persisted server-side — reopening the board later shows the real
  // outcome regardless of whether this particular poller gave up waiting for it.
  function pollNodeUntilSettled(nodeId: string) {
    const POLL_INTERVAL_MS = 20_000;
    const MAX_ATTEMPTS = 360;
    let attempts = 0;
    const tick = () => {
      attempts += 1;
      get()
        .refreshNodesData([nodeId])
        .then(() => {
          const node = get().nodes.find((n) => n.id === nodeId);
          const data = (node?.data ?? {}) as Record<string, unknown>;
          if (data.extractionStatus === "pending" && attempts < MAX_ATTEMPTS) {
            setTimeout(tick, POLL_INTERVAL_MS);
          }
        });
    };
    setTimeout(tick, POLL_INTERVAL_MS);
  }

  // ADR-0091 — the eager, cache-respecting counterpart to `reExtractNode`'s forced
  // manual override. Fires automatically once a video/audio/link node's source is known
  // (see the `startExtraction` call sites: addLinkNode, addVideoNodeFromUrl,
  // convertLinkNodeToVideo, the file-upload handler, and link-node.tsx's own
  // URL-commit paths). Deliberately mirrors `reExtractNode`'s optimistic-pending +
  // timeout-tolerant shape rather than sharing code with it outright — the two differ in
  // exactly the two places that matter (force vs. not, and silent-automatic vs.
  // toast-on-failure), and keeping them as separate, readable functions beats a shared
  // helper parameterized on booleans for a codebase this size.
  function triggerExtraction(nodeId: string) {
    const { boardId } = get();
    if (!boardId) return;
    const current = get().nodes.find((n) => n.id === nodeId);
    if (!current) return;
    const optimisticPendingData: Record<string, unknown> = {
      ...(current.data as Record<string, unknown>),
      extractionStatus: "pending",
      extractionPreview: null,
    };
    set((state) => ({
      nodes: state.nodes.map((n) => (n.id === nodeId ? { ...n, data: optimisticPendingData } : n)),
    }));
    extractRequest<{ node: ServerNode }>(`/api/boards/${boardId}/nodes/${nodeId}/extract`)
      .then(({ node }) => {
        set((state) => ({ nodes: state.nodes.map((n) => (n.id === nodeId ? toRfNode(node) : n)) }));
      })
      .catch((err) => {
        // A client-side timeout (ApiError status 0) does NOT mean the pipeline failed —
        // it has no matching server-side deadline and may genuinely still be running
        // (BUG-028's update 2 found this exact mismatch on the forced path; same fix
        // applies here). Leave the optimistic "pending" showing — it still matches
        // server reality — and poll for the real outcome instead of lying about it.
        if (err instanceof ApiError && err.status === 0) {
          pollNodeUntilSettled(nodeId);
          return;
        }
        // Any other error here means the pipeline never actually ran — the server route
        // only returns a non-200 for an invalid node (404/400, before extractMediaForNode
        // is ever called), and extractMediaForNode itself never throws (media-extraction.ts:
        // every real pipeline failure already resolves to a 200 with `extractionStatus:
        // "failed"`, which the `.then()` branch above would have applied instead of
        // landing here). So nothing changed server-side to revert away from — safe to
        // just restore the pre-trigger snapshot.
        set((state) => ({ nodes: state.nodes.map((n) => (n.id === nodeId ? current : n)) }));
      });
  }

  // Commits whatever's pending for `nodeId` (debounce tick or blur, whichever happens
  // first) and, if the final value actually differs from the edit session's baseline,
  // records one "update" history entry for the whole session — not one per keystroke.
  function commitPendingEdit(nodeId: string) {
    const { boardId, nodes } = get();
    saveTimers.delete(nodeId);
    const latest = pendingData.get(nodeId);
    pendingData.delete(nodeId);
    const baseline = editBaseline.get(nodeId);
    editBaseline.delete(nodeId);
    if (!latest || !boardId) return;

    const current = nodes.find((n) => n.id === nodeId);
    const type = current?.type ?? baseline?.type ?? "text";
    doSaveData(boardId, nodeId, { data: latest });

    if (baseline && !sameJson(baseline.data, latest)) {
      pushHistory({ kind: "update", nodeId, from: baseline, to: { type, data: latest } });
    }
  }

  return {
    boardId: null,
    boardTitle: null,
    boardFolderId: null,
    nodes: [],
    edges: [],
    loaded: false,
    loadError: null,
    past: [],
    future: [],

    loadBoard: async (boardId: string) => {
      set({ boardId, loaded: false, loadError: null, nodes: [], edges: [], past: [], future: [] });
      saveTimers.forEach((timer) => clearTimeout(timer));
      saveTimers.clear();
      pendingData.clear();
      editBaseline.clear();
      try {
        const [{ board }, { nodes: serverNodes }, { edges: serverEdges }] = await Promise.all([
          api.get<{ board: { id: string; title: string; folder_id: string | null } }>(`/api/boards/${boardId}`),
          api.get<{ nodes: ServerNode[] }>(`/api/boards/${boardId}/nodes`),
          api.get<{ edges: ServerEdge[] }>(`/api/boards/${boardId}/edges`),
        ]);
        set({
          boardTitle: board.title,
          boardFolderId: board.folder_id,
          nodes: serverNodes.map(toRfNode),
          edges: serverEdges.map(toRfEdge),
          loaded: true,
        });
      } catch {
        set({ loadError: "Can't reach the Brainy.ai backend. Check that the server is running.", loaded: true });
      }
    },

    renameBoard: async (title: string) => {
      const { boardId, boardTitle: previousTitle } = get();
      if (!boardId) return;
      const trimmed = title.trim();
      if (!trimmed || trimmed === previousTitle) return;
      set({ boardTitle: trimmed });
      try {
        await api.patch(`/api/boards/${boardId}`, { title: trimmed });
      } catch {
        // Revert — see the `renameBoard` doc comment above for why this one reverts
        // instead of silently retrying like the node-data autosave below does.
        set({ boardTitle: previousTitle });
      }
    },

    // Select/drag/position/resize-in-flight changes flow through React Flow's own
    // applyNodeChanges as before (this already handles "dimensions" changes correctly —
    // NodeResizer/NodeResizeControl drive live resize visuals through this exact path,
    // ADR-0070 — no special-casing needed here beyond what already existed). "remove"
    // changes are routed to `deleteNode` instead — it owns the full remove flow (history
    // snapshot + local removal + server delete) so every deletion path (Delete key,
    // 3-dot menu, hover "X", anywhere else) behaves identically.
    onNodesChange: (changes: NodeChange[]) => {
      const removeIds = changes.filter((c) => c.type === "remove").map((c) => c.id);
      const rest = changes.filter((c) => c.type !== "remove");
      if (rest.length > 0) {
        set((state) => ({ nodes: applyNodeChanges(rest, state.nodes) }));
      }
      for (const id of removeIds) {
        get().deleteNode(id);
      }
    },

    // Same "remove" split as onNodesChange above — selecting an edge is a plain local
    // change, deleting one (edge-select + Delete key, the same deleteKeyCode the canvas
    // already wires nodes through) goes through `deleteEdge` so it gets a history entry
    // and a server call, not just a silent local removal.
    onEdgesChange: (changes: EdgeChange[]) => {
      const removeIds = changes.filter((c) => c.type === "remove").map((c) => c.id);
      const rest = changes.filter((c) => c.type !== "remove");
      if (rest.length > 0) {
        set((state) => ({ edges: applyEdgeChanges(rest, state.edges) }));
      }
      for (const id of removeIds) {
        get().deleteEdge(id);
      }
    },

    // TF-06 — drag-to-connect. Ignores a self-loop and an exact duplicate (either
    // direction) locally before ever calling the server, so a slightly-off drag that
    // lands back on the same node or re-traces an existing connection just does
    // nothing rather than erroring with no error UI to show it in.
    connectNodes: async (connection) => {
      const { boardId, edges } = get();
      if (!boardId || !connection.source || !connection.target) return;
      if (connection.source === connection.target) return;
      const alreadyConnected = edges.some(
        (e) =>
          (e.source === connection.source && e.target === connection.target) ||
          (e.source === connection.target && e.target === connection.source)
      );
      if (alreadyConnected) return;

      try {
        const { edge: created } = await api.post<{ edge: ServerEdge }>(`/api/boards/${boardId}/edges`, {
          source_node_id: connection.source,
          target_node_id: connection.target,
        });
        const rfEdge = toRfEdge(created);
        set((state) => ({ edges: [...state.edges, rfEdge] }));
        pushHistory({ kind: "connect", edge: rfEdge });
      } catch {
        // Best-effort, same posture as every other mutation in this store — a failed
        // connect just means nothing was drawn; the user can try the drag again.
      }
    },

    deleteEdge: async (edgeId) => {
      const edge = removeEdgeLocal(edgeId);
      if (!edge) return; // already removed (e.g. duplicate remove change in the same batch)
      deleteEdgeRemote(edgeId);
      pushHistory({ kind: "disconnectEdge", edge });
    },

    addTextNode: async (position, content) => {
      const { boardId } = get();
      if (!boardId) return;
      const data: TextNodeData = { content: content ?? "" };
      const { node } = await api.post<{ node: ServerNode }>(`/api/boards/${boardId}/nodes`, {
        type: "text",
        position_x: position.x,
        position_y: position.y,
        data,
      });
      const rfNode = toRfNode(node);
      set((state) => ({ nodes: [...state.nodes, rfNode] }));
      pushHistory({ kind: "create", node: rfNode });
    },

    // `prefill` lets a caller (the canvas's paste-URL-to-create handler) seed the node's
    // data in the SAME create call the "Link" toolbar button already uses, rather than
    // creating an empty node and then issuing a second PATCH to fill it in.
    addLinkNode: async (position, prefill) => {
      const { boardId } = get();
      if (!boardId) return;
      const data: LinkNodeData = {
        url: "",
        title: "",
        titleSource: "auto",
        faviconUrl: "",
        status: "idle",
        metaForUrl: "",
        notes: "",
        ...prefill,
      };
      const { node } = await api.post<{ node: ServerNode }>(`/api/boards/${boardId}/nodes`, {
        type: "link",
        position_x: position.x,
        position_y: position.y,
        data,
      });
      const rfNode = toRfNode(node);
      set((state) => ({ nodes: [...state.nodes, rfNode] }));
      pushHistory({ kind: "create", node: rfNode });
      // A prefilled URL (paste-to-create) has no "blur" moment to trigger the fetch
      // from, so it's kicked off here directly instead.
      if (data.url) refreshLinkMetadata(rfNode.id, data.url);
      // ADR-0091 — eager extraction. Safe to fire unconditionally here (no video-URL
      // guard needed): the one real caller of this prefill path (page.tsx's
      // paste-to-create handler) already tries `addVideoNodeFromUrl` FIRST and only
      // falls back to `addLinkNode` when that returns false — i.e. `data.url` is never
      // a recognized video URL by the time it reaches here, so there's no risk of this
      // racing the separate trigger `convertLinkNodeToVideo` fires for that case.
      if (data.url) triggerExtraction(rfNode.id);
    },

    // Mirrors each provider's own backend default-model tier (apps/server/src/
    // providers/claude.ts etc.) — duplicated rather than fetched, same reasoning as
    // SUPPORTED_FILE_EXTENSIONS above: small, static, and needed synchronously before
    // any network call so a freshly placed node never shows a blank model selector.
    addChatNode: async (position, provider) => {
      const { boardId } = get();
      if (!boardId) return;
      const DEFAULT_MODEL: Record<ChatNodeData["provider"], string> = {
        claude: "claude-sonnet-5-5",
        openai: "gpt-5",
        gemini: "gemini-3-pro",
      };
      // Execution mode has two homes by design (ADR-0019/F-12): Settings'
      // provider_credentials.execution_mode is the DEFAULT a newly placed node of
      // that provider starts with; ChatNodeData.executionMode is the per-node value
      // chat.ts actually reads at send time, independently changeable afterwards
      // without touching any other node. We seed from the Settings default here so
      // the two stay in sync at placement time, falling back to "native" (the only
      // mode Phase 4 makes functional) if providers haven't loaded yet.
      const providerStatus = useSettingsStore.getState().providers.find((p) => p.provider === provider);
      const data: ChatNodeData = {
        provider,
        model: DEFAULT_MODEL[provider],
        executionMode: providerStatus?.executionMode ?? "native",
        notesForAI: "",
        useBrandProfile: false,
        // NodeChrome's own un-resized default (w-56/224px, auto height) fits a short
        // text snippet, not a message thread plus its own model/mode controls — unlike
        // every other node type, a chat node is useless at that size before the user
        // ever touches the resize handle, so it gets its own larger explicit starting
        // size instead of inheriting the shared default.
        //
        // Visual-match pass (Istiyak: "make a Chat card bigger in size to fit all in
        // context"): bumped again from 340×420 — that size was only ever enough for the
        // message thread + composer; it had no room for the reference layout's own
        // persistent sessions column (chat-node.tsx) alongside the thread, the session
        // title bar, and the model-picker/quick-actions row under the composer all at
        // once without tight scrolling. 620×680 fits all of that comfortably while still
        // being well within NodeChrome's resize range in either direction.
        cardWidth: 620,
        cardHeight: 680,
      };
      const { node } = await api.post<{ node: ServerNode }>(`/api/boards/${boardId}/nodes`, {
        type: "chat",
        position_x: position.x,
        position_y: position.y,
        data,
      });
      const rfNode = toRfNode(node);
      set((state) => ({ nodes: [...state.nodes, rfNode] }));
      pushHistory({ kind: "create", node: rfNode });
    },

    addFileNode: async (position, file: File) => {
      const { boardId } = get();
      if (!boardId) return;

      // Gate BEFORE uploading — Istiyak: an unsupported type (mp3, mp4, html, …) should
      // never reach the board at all, not land there with an inline "not supported"
      // message after the fact. Every call site (toolbar picker, drag-drop, OS paste —
      // page.tsx) funnels through this one function, so checking here covers all three
      // without duplicating the check at each call site.
      if (!isSupportedFileType(file.name)) {
        useToastStore.getState().showToast(
          `"${file.name}" isn't a supported file type yet. Try a PDF, Word, Excel, image, audio, or video file instead.`
        );
        return;
      }

      const formData = new FormData();
      formData.append("file", file);
      // Phase 5 (ADR-0085/ADR-0086): the server classifies `mediaKind` ("document" |
      // "audio" | "video") off the same upload — document-only fields
      // (isImage/fileKind/extraction) are only present when mediaKind is "document".
      const upload = await uploadFile<{
        fileName: string;
        storedName: string;
        contentHash: string;
        bytes: number;
        mediaKind: "document" | "audio" | "video";
        isImage?: boolean;
        fileKind?: FileNodeData["fileKind"];
        extraction?: { status: FileNodeData["extractionStatus"]; preview: string | null };
      }>("/api/files/upload", formData);

      let type: "file" | "audio" | "video";
      let data: FileNodeData | AudioNodeData | VideoNodeData;
      if (upload.mediaKind === "audio") {
        type = "audio";
        data = {
          fileName: upload.fileName,
          storedName: upload.storedName,
          contentHash: upload.contentHash,
          bytes: upload.bytes,
          notes: "",
        } satisfies AudioNodeData;
      } else if (upload.mediaKind === "video") {
        // Uploaded video file — the SAME `video` node type the URL path already uses
        // (ADR-0086), just with `source: "upload"` instead of oEmbed metadata.
        type = "video";
        data = {
          source: "upload",
          fileName: upload.fileName,
          storedName: upload.storedName,
          contentHash: upload.contentHash,
          bytes: upload.bytes,
          notes: "",
        } satisfies VideoNodeData;
      } else {
        type = "file";
        data = {
          fileName: upload.fileName,
          storedName: upload.storedName,
          contentHash: upload.contentHash,
          bytes: upload.bytes,
          isImage: upload.isImage ?? false,
          fileKind: upload.fileKind ?? "other",
          extractionStatus: upload.extraction?.status ?? "unsupported",
          extractionPreview: upload.extraction?.preview ?? null,
          notes: "",
        } satisfies FileNodeData;
      }

      const { node } = await api.post<{ node: ServerNode }>(`/api/boards/${boardId}/nodes`, {
        type,
        position_x: position.x,
        position_y: position.y,
        data,
      });
      const rfNode = toRfNode(node);
      set((state) => ({ nodes: [...state.nodes, rfNode] }));
      pushHistory({ kind: "create", node: rfNode });
      // ADR-0091 — an uploaded audio/video file's source is fully known the instant the
      // upload finishes (unlike a `link` node, which may still be an empty URL field at
      // this point), so this is the earliest honest moment to start extraction.
      if (type === "audio" || type === "video") triggerExtraction(rfNode.id);
    },

    reExtractNode: async (nodeId: string) => {
      const { boardId } = get();
      if (!boardId) return;
      const current = get().nodes.find((n) => n.id === nodeId);
      if (!current) return;
      // Optimistic "pending" so the card shows something immediately — the server call
      // below can take minutes (media-extraction.ts's own pipeline timeout), and this
      // matches how the server itself marks the node `pending` the moment it starts
      // (media-extraction.ts's `patchNodeExtractionState`).
      // Named to avoid shadowing the module-level `pendingData` Map above (debounced
      // text-edit saves) — unrelated despite the similar name.
      const optimisticPendingData: Record<string, unknown> = {
        ...(current.data as Record<string, unknown>),
        extractionStatus: "pending",
        extractionPreview: null,
      };
      set((state) => ({
        nodes: state.nodes.map((n) => (n.id === nodeId ? { ...n, data: optimisticPendingData } : n)),
      }));
      try {
        const { node } = await reExtractRequest<{ node: ServerNode }>(`/api/boards/${boardId}/nodes/${nodeId}/re-extract`);
        set((state) => ({ nodes: state.nodes.map((n) => (n.id === nodeId ? toRfNode(node) : n)) }));
      } catch (err) {
        // ADR-0091 — a client-side timeout (ApiError status 0) is NOT the same as a real
        // failure: media-extraction.ts's `transcribe()` step has no server-side timeout
        // of its own, so a long video can legitimately still be running on the backend
        // well past our own wait window. The bug this fixes: reverting straight to
        // `current` here used to flash the card back to whatever it showed BEFORE this
        // click — often a stale "failed" from an earlier, unrelated problem — directly
        // underneath a toast that says the opposite ("may still finish in the
        // background"). Now a timeout leaves the optimistic "pending" in place (it
        // matches server reality) and polls for the real outcome instead.
        if (err instanceof ApiError && err.status === 0) {
          useToastStore.getState().showToast(err.message);
          pollNodeUntilSettled(nodeId);
          return;
        }
        useToastStore
          .getState()
          .showToast(err instanceof Error ? err.message : "Couldn't re-extract this node's content. Please try again.");
        // Revert the optimistic "pending" — the actual DB row never changed (re-extract's
        // route only fails before extractMediaForNode runs; see triggerExtraction's own
        // matching comment above for why that's true of both extraction routes).
        set((state) => ({ nodes: state.nodes.map((n) => (n.id === nodeId ? current : n)) }));
      }
    },

    // Lightweight re-sync for nodes extraction touched mid-chat (chat-node.tsx, after an
    // "extracting" SSE event) — refetches the WHOLE board's nodes (there's no per-node
    // GET route) but only merges `data`/`type` for the ids actually asked for, so an
    // in-flight drag or unrelated local edit elsewhere on the board isn't clobbered by a
    // stale position/size from this fetch.
    refreshNodesData: async (nodeIds: string[]) => {
      const { boardId } = get();
      if (!boardId || nodeIds.length === 0) return;
      try {
        const { nodes: serverNodes } = await api.get<{ nodes: ServerNode[] }>(`/api/boards/${boardId}/nodes`);
        const byId = new Map(serverNodes.map((n) => [n.id, n]));
        set((state) => ({
          nodes: state.nodes.map((n) => {
            const fresh = nodeIds.includes(n.id) ? byId.get(n.id) : undefined;
            return fresh ? { ...n, type: fresh.type, data: fresh.data as Record<string, unknown> } : n;
          }),
        }));
      } catch {
        // Best-effort — the node's card just won't show its new status until the next
        // full board load; nothing in this app depends on this refresh succeeding.
      }
    },

    addVideoNodeFromUrl: async (position, url) => {
      const match = parseVideoUrl(url);
      if (!match) return false;
      const { boardId } = get();
      if (!boardId) return false;

      const data: VideoNodeData = {
        source: "url",
        url,
        platform: match.platform,
        videoId: match.videoId,
        title: "",
        thumbnailUrl: "",
        authorName: "",
        status: "loading",
        notes: "",
      };
      const { node } = await api.post<{ node: ServerNode }>(`/api/boards/${boardId}/nodes`, {
        type: "video",
        position_x: position.x,
        position_y: position.y,
        data,
      });
      const rfNode = toRfNode(node);
      set((state) => ({ nodes: [...state.nodes, rfNode] }));
      pushHistory({ kind: "create", node: rfNode });
      refreshVideoMetadata(rfNode.id, url);
      triggerExtraction(rfNode.id); // ADR-0091
      return true;
    },

    convertLinkNodeToVideo: async (nodeId, url) => {
      const match = parseVideoUrl(url);
      if (!match) return false;
      const current = get().nodes.find((n) => n.id === nodeId);
      if (!current || current.type !== "link") return false;

      const fromSnapshot = { type: current.type, data: current.data as Record<string, unknown> };
      const oldLinkData = current.data as LinkNodeData;
      const nextData: VideoNodeData = {
        source: "url",
        url,
        platform: match.platform,
        videoId: match.videoId,
        title: "",
        thumbnailUrl: "",
        authorName: "",
        status: "loading",
        notes: oldLinkData.notes ?? "",
      };

      commitNodeTypeAndData(nodeId, "video", nextData);
      pushHistory({ kind: "update", nodeId, from: fromSnapshot, to: { type: "video", data: nextData } });
      refreshVideoMetadata(nodeId, url);
      triggerExtraction(nodeId); // ADR-0091
      return true;
    },

    refreshLinkPreview: (nodeId, url) => {
      refreshLinkMetadata(nodeId, url);
    },

    startExtraction: (nodeId) => {
      triggerExtraction(nodeId);
    },

    updateNodeData: (nodeId, data) => {
      const { boardId } = get();
      if (!boardId) return;

      if (!pendingData.has(nodeId)) {
        const current = get().nodes.find((n) => n.id === nodeId);
        if (current) {
          editBaseline.set(nodeId, { type: current.type ?? "text", data: current.data as Record<string, unknown> });
        }
      }

      set((state) => ({
        nodes: state.nodes.map((n) => (n.id === nodeId ? { ...n, data } : n)),
      }));
      pendingData.set(nodeId, data);

      const existing = saveTimers.get(nodeId);
      if (existing) clearTimeout(existing);
      saveTimers.set(
        nodeId,
        setTimeout(() => {
          commitPendingEdit(nodeId);
        }, SAVE_DEBOUNCE_MS)
      );
    },

    // Called on blur so a quick hard-refresh right after typing never loses the edit —
    // bypasses the debounce and saves whatever's pending immediately.
    flushNodeData: (nodeId) => {
      const timer = saveTimers.get(nodeId);
      if (timer) {
        clearTimeout(timer);
        saveTimers.delete(nodeId);
      }
      commitPendingEdit(nodeId);
    },

    saveNodePosition: (nodeId, from, to) => {
      if (from.x === to.x && from.y === to.y) return; // no-op drag — nothing to persist or undo
      savePositionRemote(nodeId, to.x, to.y);
      pushHistory({ kind: "move", nodeId, from, to });
    },

    saveNodeSize: (nodeId, size) => {
      const current = get().nodes.find((n) => n.id === nodeId);
      if (!current) return;
      const from = { width: current.width, height: current.height };
      if (from.width === size.width && from.height === size.height) return; // no-op
      setNodeSizeLocal(nodeId, size.width, size.height);
      saveSizeRemote(nodeId);
      pushHistory({ kind: "resize", nodeId, from, to: size });
    },

    // Grouping (Phase 3): deleting a GROUP node (Delete key, hover "X", 3-dot menu —
    // every path funnels through this one function) must NOT take this branch — a plain
    // removeNodeAndEdgesLocal would leave its members' local `parentId` pointing at a
    // group that no longer exists in `nodes`, which React Flow doesn't handle. Deleting
    // a group IS ungrouping it (releases members, doesn't destroy them) plus removing
    // the now-empty container, which is exactly what ungroupNode already does — so this
    // delegates rather than duplicating that logic, and the resulting history entry is
    // correctly an "ungroup" one, not a "delete" one.
    deleteNode: async (nodeId) => {
      const target = get().nodes.find((n) => n.id === nodeId);
      if (target?.type === RF_GROUP_TYPE) {
        await get().ungroupNode(nodeId);
        return;
      }
      const { node, edges: removedEdges } = removeNodeAndEdgesLocal(nodeId);
      if (!node) return; // already removed (e.g. duplicate remove change in the same batch)
      deleteNodeRemote(nodeId);
      pushHistory({ kind: "delete", node, edges: removedEdges });
    },

    // Grouping (Phase 3). See the `groupSelectedNodes`/`ungroupNode` doc comments on the
    // BoardState interface above for the contract; attachGroup/detachGroup (above) do
    // the actual work, shared with undo/redo.
    groupSelectedNodes: async (memberIds, bounds) => {
      const { nodes, edges, boardId } = get();
      if (!boardId) return;
      const members = memberIds
        .map((id) => nodes.find((n) => n.id === id))
        .filter((n): n is Node => n !== undefined && !n.parentId)
        .map((n) => ({
          id: n.id,
          relativePosition: { x: n.position.x - bounds.x, y: n.position.y - bounds.y },
        }));
      if (members.length < 2) return; // nothing groupable, or only one ungrouped node selected

      const groupId = crypto.randomUUID();
      const data: GroupNodeData = { label: "Group", cardWidth: bounds.width, cardHeight: bounds.height };
      const groupNode: Node = {
        id: groupId,
        type: RF_GROUP_TYPE,
        position: { x: bounds.x, y: bounds.y },
        data,
        width: bounds.width,
        height: bounds.height,
      };
      await attachGroup(groupNode, members);

      // Absorb each member's external edges onto the group itself (Istiyak: "Ideally
      // after grouping nodes should not be there only groups node should appear") —
      // see computeGroupEdgeAbsorption's own comment for the dedup rule.
      const memberIdSet = new Set(members.map((m) => m.id));
      const { toRemove, toCreatePairs } = computeGroupEdgeAbsorption(groupId, memberIdSet, edges);
      for (const edge of toRemove) {
        removeEdgeLocal(edge.id);
        deleteEdgeRemote(edge.id);
      }
      const createdGroupEdges: Edge[] = [];
      for (const pair of toCreatePairs) {
        try {
          const { edge: created } = await api.post<{ edge: ServerEdge }>(`/api/boards/${boardId}/edges`, {
            id: crypto.randomUUID(),
            source_node_id: pair.source,
            target_node_id: pair.target,
          });
          const rfEdge = toRfEdge(created);
          set((s) => ({ edges: [...s.edges, rfEdge] }));
          createdGroupEdges.push(rfEdge);
        } catch {
          // Best-effort, same posture as every other mutation in this file.
        }
      }

      pushHistory({ kind: "group", groupNode, members, removedMemberEdges: toRemove, createdGroupEdges });
    },

    ungroupNode: async (groupId) => {
      const { nodes, edges } = get();
      const groupNode = nodes.find((n) => n.id === groupId && n.type === RF_GROUP_TYPE);
      if (!groupNode) return;
      const members = nodes
        .filter((n) => n.parentId === groupId)
        .map((n) => ({ id: n.id, relativePosition: { ...n.position } }));
      // The group's own edges (absorbed at group-time, or connected directly since)
      // don't get redistributed back to any one member — with several members there's
      // no single correct owner to hand an absorbed connection back to — so ungrouping
      // just drops them. Captured here (not re-derived later) so undoing this specific
      // ungroup can recreate exactly these edges, not whatever the group happens to
      // have at some other time.
      const groupEdges = edges.filter((e) => e.source === groupId || e.target === groupId);
      for (const edge of groupEdges) {
        removeEdgeLocal(edge.id);
        deleteEdgeRemote(edge.id);
      }
      await detachGroup(groupNode, members);
      pushHistory({ kind: "ungroup", groupNode, members, groupEdges });
    },

    // Duplication / copy-paste (Phase 3, F-07/F-19). See buildCloneTemplate/
    // materializeTemplate above for the shared logic; these three are thin wrappers
    // that differ only in WHERE the result lands and whether the clipboard is touched.
    duplicateSelection: async (nodeIds) => {
      const template = buildCloneTemplate(nodeIds);
      if (!template) return;
      await materializeTemplate(template, template.originX + DUPLICATE_OFFSET, template.originY + DUPLICATE_OFFSET);
    },

    copySelection: (nodeIds) => {
      const template = buildCloneTemplate(nodeIds);
      if (template) clipboard = template;
    },

    pasteClipboard: async (position) => {
      if (!clipboard) return;
      await materializeTemplate(clipboard, position.x, position.y);
    },

    hasClipboardContent: () => clipboard !== null,

    deselectAllNodes: () => {
      set((s) => ({ nodes: s.nodes.map((n) => (n.selected ? { ...n, selected: false } : n)) }));
    },

    undo: () => {
      const { past } = get();
      if (past.length === 0) return;
      const entry = past[past.length - 1];
      applyEntryBackward(entry);
      set((state) => ({ past: state.past.slice(0, -1), future: [...state.future, entry] }));
    },

    redo: () => {
      const { future } = get();
      if (future.length === 0) return;
      const entry = future[future.length - 1];
      applyEntryForward(entry);
      set((state) => ({ future: state.future.slice(0, -1), past: [...state.past, entry] }));
    },
  };
});
