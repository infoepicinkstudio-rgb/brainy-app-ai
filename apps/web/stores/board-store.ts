// The high-frequency canvas store (ADR-0012) — node dragging and live position/content
// changes go through here, so its update shape was settled before any canvas UI was
// written against it (implementation_plan.md Phase 2 step 3), not retrofitted after.
//
// Autosave (Phase 2 step 6): text-content edits debounce-save (short window — testing.md
// F-08 requires "hard-refresh within a few seconds, edit is retained", so the debounce
// has to be well under that, not a lazy multi-second one) and flush immediately on
// blur; node position saves immediately on drag-stop, not debounced, since a drag
// naturally has a single clear "done" moment already.

import { create } from "zustand";
import type { Node, Edge, NodeChange } from "@xyflow/react";
import { applyNodeChanges } from "@xyflow/react";
import { api, uploadFile } from "@/lib/api";

export type BrainyNodeType = "text" | "file" | "link";

export interface TextNodeData extends Record<string, unknown> {
  content: string;
}

export interface FileNodeData extends Record<string, unknown> {
  fileName: string;
  storedName: string;
  contentHash: string;
  bytes: number;
  isImage: boolean;
  extractionStatus: "ok" | "unsupported" | "failed" | "not_applicable" | "pending";
  extractionPreview: string | null;
  notes: string;
}

export interface LinkNodeData extends Record<string, unknown> {
  url: string;
  title: string;
  notes: string;
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
  return {
    id: n.id,
    type: n.type,
    position: { x: n.position_x, y: n.position_y },
    data: (n.data ?? {}) as Record<string, unknown>,
  };
}

function toRfEdge(e: ServerEdge): Edge {
  return { id: e.id, source: e.source_node_id, target: e.target_node_id };
}

const SAVE_DEBOUNCE_MS = 400;

interface BoardState {
  boardId: string | null;
  boardTitle: string | null;
  nodes: Node[];
  edges: Edge[];
  loaded: boolean;
  loadError: string | null;

  loadBoard: (boardId: string) => Promise<void>;
  onNodesChange: (changes: NodeChange[]) => void;
  addTextNode: (position: { x: number; y: number }) => Promise<void>;
  addLinkNode: (position: { x: number; y: number }) => Promise<void>;
  addFileNode: (position: { x: number; y: number }, file: File) => Promise<void>;
  updateNodeData: (nodeId: string, data: Record<string, unknown>) => void;
  flushNodeData: (nodeId: string) => void;
  saveNodePosition: (nodeId: string, x: number, y: number) => void;
  deleteNode: (nodeId: string) => Promise<void>;
}

const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingData = new Map<string, Record<string, unknown>>();

function doSaveData(boardId: string, nodeId: string, data: Record<string, unknown>) {
  api.patch<{ node: ServerNode }>(`/api/boards/${boardId}/nodes/${nodeId}`, { data }).catch(() => {
    // Best-effort autosave — a transient failure here shouldn't crash the canvas; the
    // next edit (or the next debounce tick) will retry with the latest data anyway.
  });
}

export const useBoardStore = create<BoardState>((set, get) => ({
  boardId: null,
  boardTitle: null,
  nodes: [],
  edges: [],
  loaded: false,
  loadError: null,

  loadBoard: async (boardId: string) => {
    set({ boardId, loaded: false, loadError: null, nodes: [], edges: [] });
    try {
      const [{ board }, { nodes: serverNodes }, { edges: serverEdges }] = await Promise.all([
        api.get<{ board: { id: string; title: string } }>(`/api/boards/${boardId}`),
        api.get<{ nodes: ServerNode[] }>(`/api/boards/${boardId}/nodes`),
        api.get<{ edges: ServerEdge[] }>(`/api/boards/${boardId}/edges`),
      ]);
      set({
        boardTitle: board.title,
        nodes: serverNodes.map(toRfNode),
        edges: serverEdges.map(toRfEdge),
        loaded: true,
      });
    } catch {
      set({ loadError: "Can't reach the Brainy.ai backend. Check that the server is running.", loaded: true });
    }
  },

  onNodesChange: (changes: NodeChange[]) => {
    set((state) => ({ nodes: applyNodeChanges(changes, state.nodes) }));
    for (const change of changes) {
      if (change.type === "remove") {
        get().deleteNode(change.id);
      }
    }
  },

  addTextNode: async (position) => {
    const { boardId } = get();
    if (!boardId) return;
    const data: TextNodeData = { content: "" };
    const { node } = await api.post<{ node: ServerNode }>(`/api/boards/${boardId}/nodes`, {
      type: "text",
      position_x: position.x,
      position_y: position.y,
      data,
    });
    set((state) => ({ nodes: [...state.nodes, toRfNode(node)] }));
  },

  addLinkNode: async (position) => {
    const { boardId } = get();
    if (!boardId) return;
    const data: LinkNodeData = { url: "", title: "", notes: "" };
    const { node } = await api.post<{ node: ServerNode }>(`/api/boards/${boardId}/nodes`, {
      type: "link",
      position_x: position.x,
      position_y: position.y,
      data,
    });
    set((state) => ({ nodes: [...state.nodes, toRfNode(node)] }));
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
      extraction: { status: FileNodeData["extractionStatus"]; preview: string | null };
    }>("/api/files/upload", formData);

    const data: FileNodeData = {
      fileName: upload.fileName,
      storedName: upload.storedName,
      contentHash: upload.contentHash,
      bytes: upload.bytes,
      isImage: upload.isImage,
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
    set((state) => ({ nodes: [...state.nodes, toRfNode(node)] }));
  },

  updateNodeData: (nodeId, data) => {
    const { boardId } = get();
    if (!boardId) return;

    set((state) => ({
      nodes: state.nodes.map((n) => (n.id === nodeId ? { ...n, data } : n)),
    }));
    pendingData.set(nodeId, data);

    const existing = saveTimers.get(nodeId);
    if (existing) clearTimeout(existing);
    saveTimers.set(
      nodeId,
      setTimeout(() => {
        const latest = pendingData.get(nodeId);
        if (latest) doSaveData(boardId, nodeId, latest);
        pendingData.delete(nodeId);
        saveTimers.delete(nodeId);
      }, SAVE_DEBOUNCE_MS)
    );
  },

  // Called on blur so a quick hard-refresh right after typing never loses the edit —
  // bypasses the debounce and saves whatever's pending immediately.
  flushNodeData: (nodeId) => {
    const { boardId } = get();
    if (!boardId) return;
    const existing = saveTimers.get(nodeId);
    if (existing) {
      clearTimeout(existing);
      saveTimers.delete(nodeId);
    }
    const latest = pendingData.get(nodeId);
    if (latest) {
      doSaveData(boardId, nodeId, latest);
      pendingData.delete(nodeId);
    }
  },

  saveNodePosition: (nodeId, x, y) => {
    const { boardId } = get();
    if (!boardId) return;
    api
      .patch(`/api/boards/${boardId}/nodes/${nodeId}`, { position_x: x, position_y: y })
      .catch(() => {
        // Best-effort — see doSaveData's comment above.
      });
  },

  deleteNode: async (nodeId) => {
    const { boardId } = get();
    if (!boardId) return;
    const timer = saveTimers.get(nodeId);
    if (timer) clearTimeout(timer);
    saveTimers.delete(nodeId);
    pendingData.delete(nodeId);
    try {
      await api.delete(`/api/boards/${boardId}/nodes/${nodeId}`);
    } catch {
      // The node is already gone from local state; a failed server delete here would
      // just mean it reappears on next reload, not a crash — acceptable for MVP.
    }
  },
}));
