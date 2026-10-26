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
import type { Node, Edge, NodeChange } from "@xyflow/react";
import { applyNodeChanges } from "@xyflow/react";
import { api, uploadFile } from "@/lib/api";
import { parseVideoUrl } from "@/lib/video-platform";

export type BrainyNodeType = "text" | "file" | "link" | "video";

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
}

// Phase 5's metadata/thumbnail slice pulled forward (implementation_plan.md node-card-
// overhaul entry, ADR-0065): a distinct `video` node type, not a `data.platform` flag on
// `link` — see that ADR for the reasoning. `status` tracks the backend oEmbed fetch
// (lib/video-platform.ts classifies the URL instantly, client-side; the network round
// trip for title/thumbnail is what `status` is tracking). Round 2 (ADR-0069) widened
// `platform` from YouTube-only to also cover Vimeo, which has the same kind of free,
// no-auth oEmbed endpoint.
export interface VideoNodeData extends Record<string, unknown> {
  url: string;
  platform: "youtube" | "vimeo";
  videoId: string;
  title: string;
  thumbnailUrl: string;
  authorName: string;
  status: "loading" | "ok" | "error";
  notes: string;
  cardWidth?: number;
  cardHeight?: number;
}

interface ServerNode {
  id: string;
  board_id: string;
  type: string;
  position_x: number;
  position_y: number;
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
    type: n.type,
    position: { x: n.position_x, y: n.position_y },
    data,
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
  };
}

function toRfEdge(e: ServerEdge): Edge {
  return { id: e.id, source: e.source_node_id, target: e.target_node_id };
}

const SAVE_DEBOUNCE_MS = 400;
const MAX_HISTORY = 100;

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
    };

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
  undo: () => void;
  redo: () => void;
}

const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingData = new Map<string, Record<string, unknown>>();
// Snapshot of a node's {type, data} taken the moment an edit session starts (first
// change since the last commit) — compared against what actually gets committed so a
// debounce tick or a blur only produces a history entry when something really changed.
const editBaseline = new Map<string, { type: string; data: Record<string, unknown> }>();

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
        type: node.type,
        position_x: node.position.x,
        position_y: node.position.y,
        data: node.data,
      });
      set((s) => ({ nodes: [...s.nodes, toRfNode(created)] }));
    } catch {
      // Best-effort — an undo that fails to persist still restores the node visually
      // for this session; a future save/edit on it will retry.
      set((s) => ({ nodes: [...s.nodes, node] }));
    }
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
    if (boardId) doSaveData(boardId, nodeId, { type, data });
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
    },

    addFileNode: async (position, file: File) => {
      const { boardId } = get();
      if (!boardId) return;

      const formData = new FormData();
      formData.append("file", file);
      const upload = await uploadFile<{
        fileName: string;
        storedName: string;
        contentHash: string;
        bytes: number;
        isImage: boolean;
        fileKind: FileNodeData["fileKind"];
        extraction: { status: FileNodeData["extractionStatus"]; preview: string | null };
      }>("/api/files/upload", formData);

      const data: FileNodeData = {
        fileName: upload.fileName,
        storedName: upload.storedName,
        contentHash: upload.contentHash,
        bytes: upload.bytes,
        isImage: upload.isImage,
        fileKind: upload.fileKind,
        extractionStatus: upload.extraction.status,
        extractionPreview: upload.extraction.preview,
        notes: "",
      };

      const { node } = await api.post<{ node: ServerNode }>(`/api/boards/${boardId}/nodes`, {
        type: "file",
        position_x: position.x,
        position_y: position.y,
        data,
      });
      const rfNode = toRfNode(node);
      set((state) => ({ nodes: [...state.nodes, rfNode] }));
      pushHistory({ kind: "create", node: rfNode });
    },

    addVideoNodeFromUrl: async (position, url) => {
      const match = parseVideoUrl(url);
      if (!match) return false;
      const { boardId } = get();
      if (!boardId) return false;

      const data: VideoNodeData = {
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
      return true;
    },

    refreshLinkPreview: (nodeId, url) => {
      refreshLinkMetadata(nodeId, url);
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

    deleteNode: async (nodeId) => {
      const { node, edges: removedEdges } = removeNodeAndEdgesLocal(nodeId);
      if (!node) return; // already removed (e.g. duplicate remove change in the same batch)
      deleteNodeRemote(nodeId);
      pushHistory({ kind: "delete", node, edges: removedEdges });
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
