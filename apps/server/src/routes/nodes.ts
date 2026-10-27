// Node + edge CRUD for a single board (TF-03/TF-04/TF-06/TF-12/TF-13). The `edges` table
// has existed since Phase 0, and Phase 2 already listed edges and cascaded them on node
// delete defensively (so a node delete never leaves an orphaned edge), but deliberately
// deferred edge *creation* to Phase 3 (implementation_plan.md: "relevant once Phase 3
// adds edges" — drag-to-connect needs real edges to build the UI against). This file now
// adds that: POST creates one (drag-to-connect, board-store.ts's `connectNodes`), DELETE
// removes one (edge-select + Delete key or undo of a connect).

import type { FastifyInstance } from "fastify";
import { and, eq, or } from "drizzle-orm";
import { db } from "../db/client.js";
import { nodes, edges, chat_messages } from "../db/schema.js";

const NODE_TYPES = ["text", "video", "file", "link", "chat", "mindmap", "group"] as const;
type NodeType = (typeof NODE_TYPES)[number];

function isNodeType(value: string): value is NodeType {
  return (NODE_TYPES as readonly string[]).includes(value);
}

interface CreateNodeBody {
  // Optional, explicit id — ONLY used by the frontend's undo/redo stack (ADR-0066) to
  // recreate a deleted/undone node with its original identity instead of a fresh random
  // one. Omitted on every ordinary "add a node" call, which still gets a random UUID via
  // the schema's $defaultFn, same as before.
  id?: string;
  type?: string;
  position_x?: number;
  position_y?: number;
  // Grouping (Phase 3) — set when a node is created already inside a group, or carried
  // over verbatim by undo/redo's recreate calls (board-store.ts). Absent/undefined on
  // every ordinary top-level create, same optional shape as `id` above.
  parent_node_id?: string | null;
  data?: unknown;
}

interface CreateEdgeBody {
  // Same undo/redo-identity purpose as CreateNodeBody's `id` above.
  id?: string;
  source_node_id?: string;
  target_node_id?: string;
}

interface UpdateNodeBody {
  // Node-card-overhaul slice (ADR-0065): a link node that resolves to a YouTube URL
  // converts in place to a `video` node — this is the one case a PATCH legitimately
  // changes a node's type, not just its position/data.
  type?: string;
  position_x?: number;
  position_y?: number;
  // Grouping (Phase 3) — group/ungroup both PATCH this: `null` is a real, meaningful
  // value here (ungroup), so this is checked with `!== undefined` below, the same
  // boards.ts folder_id pattern, never a falsy check that would treat null as "no
  // change sent".
  parent_node_id?: string | null;
  data?: unknown;
}

export async function nodesRoutes(app: FastifyInstance) {
  app.get<{ Params: { boardId: string } }>("/api/boards/:boardId/nodes", async (request) => {
    const rows = await db.select().from(nodes).where(eq(nodes.board_id, request.params.boardId));
    return { nodes: rows };
  });

  app.get<{ Params: { boardId: string } }>("/api/boards/:boardId/edges", async (request) => {
    const rows = await db.select().from(edges).where(eq(edges.board_id, request.params.boardId));
    return { edges: rows };
  });

  // TF-06 — drag-to-connect (Phase 3). Same optional-explicit-`id` shape as node create
  // (ADR-0066) so undo-of-edge-delete / redo-of-connect restore the SAME edge, not a
  // lookalike with a new id and therefore a second, duplicate-looking line.
  app.post<{ Params: { boardId: string }; Body: CreateEdgeBody }>(
    "/api/boards/:boardId/edges",
    async (request, reply) => {
      const { boardId } = request.params;
      const { id, source_node_id, target_node_id } = request.body ?? {};
      if (!source_node_id || !target_node_id) {
        return reply.code(400).send({ error: "source_node_id and target_node_id are required." });
      }
      if (source_node_id === target_node_id) {
        return reply.code(400).send({ error: "A node can't connect to itself." });
      }
      // Both endpoints must be real nodes on THIS board — the frontend only ever offers
      // handles for nodes already on the same canvas, but this guards the route itself
      // against a stale id (a node deleted in another tab) rather than trusting the body.
      const endpoints = await db
        .select({ id: nodes.id })
        .from(nodes)
        .where(and(eq(nodes.board_id, boardId), or(eq(nodes.id, source_node_id), eq(nodes.id, target_node_id))));
      if (endpoints.length < 2) {
        return reply.code(400).send({ error: "Both nodes must exist on this board." });
      }
      // De-dupe regardless of direction — two nodes connected twice (even reversed)
      // reads as a bug on a mind-map-style canvas, not a second meaningful relationship.
      const [existing] = await db
        .select()
        .from(edges)
        .where(
          and(
            eq(edges.board_id, boardId),
            or(
              and(eq(edges.source_node_id, source_node_id), eq(edges.target_node_id, target_node_id)),
              and(eq(edges.source_node_id, target_node_id), eq(edges.target_node_id, source_node_id))
            )
          )
        );
      if (existing) {
        return reply.code(200).send({ edge: existing });
      }
      const [created] = await db
        .insert(edges)
        .values({ ...(id ? { id } : {}), board_id: boardId, source_node_id, target_node_id })
        .returning();
      return reply.code(201).send({ edge: created });
    }
  );

  app.delete<{ Params: { boardId: string; edgeId: string } }>(
    "/api/boards/:boardId/edges/:edgeId",
    async (request, reply) => {
      const [edge] = await db.select().from(edges).where(eq(edges.id, request.params.edgeId));
      if (!edge) return reply.code(404).send({ error: "Edge not found." });
      await db.delete(edges).where(eq(edges.id, request.params.edgeId));
      return reply.code(204).send();
    }
  );

  app.post<{ Params: { boardId: string }; Body: CreateNodeBody }>(
    "/api/boards/:boardId/nodes",
    async (request, reply) => {
      const { boardId } = request.params;
      const { id, type, position_x, position_y, parent_node_id, data } = request.body ?? {};
      if (!type || !isNodeType(type)) {
        return reply.code(400).send({ error: `Unknown node type "${type}".` });
      }
      const [created] = await db
        .insert(nodes)
        .values({
          ...(id ? { id } : {}),
          board_id: boardId,
          type,
          position_x: position_x ?? 0,
          position_y: position_y ?? 0,
          ...(parent_node_id !== undefined ? { parent_node_id } : {}),
          // nodes.data is a Drizzle `{ mode: "json" }` column — it serializes on write and
          // parses on read by itself. Passing an already-JSON.stringify'd string here
          // double-encodes it, so the column ends up holding a quoted string instead of
          // an object, and every later read comes back as a plain string with no .content
          // (etc.) property — the bug behind "text survives in the session but a hard
          // refresh loses it" (verified via Playwright during Phase 2 build-out).
          data: data === undefined ? {} : data,
        })
        .returning();
      return reply.code(201).send({ node: created });
    }
  );

  // Autosave target — position and/or content changes, debounced on the client
  // (implementation_plan.md Phase 2 step 6). `data`, when sent, fully replaces the
  // node's data (the client always sends its complete current data object, not a
  // partial patch — single-user/single-session, so there's no concurrent-write risk
  // this needs to resolve).
  app.patch<{ Params: { boardId: string; nodeId: string }; Body: UpdateNodeBody }>(
    "/api/boards/:boardId/nodes/:nodeId",
    async (request, reply) => {
      const { nodeId } = request.params;
      const { type, position_x, position_y, parent_node_id, data } = request.body ?? {};
      if (type !== undefined && !isNodeType(type)) {
        return reply.code(400).send({ error: `Unknown node type "${type}".` });
      }
      const patch: Partial<typeof nodes.$inferInsert> = { updated_at: new Date().toISOString() };
      if (type !== undefined) patch.type = type;
      if (position_x !== undefined) patch.position_x = position_x;
      if (position_y !== undefined) patch.position_y = position_y;
      if (parent_node_id !== undefined) patch.parent_node_id = parent_node_id;
      if (data !== undefined) patch.data = data;

      await db.update(nodes).set(patch).where(eq(nodes.id, nodeId));
      const [updated] = await db.select().from(nodes).where(eq(nodes.id, nodeId));
      if (!updated) return reply.code(404).send({ error: "Node not found." });
      return { node: updated };
    }
  );

  // Deleting a node also removes any edges pointing at it and any chat history it
  // owned (testing.md F-09: "no orphaned edges"). Deleting a GROUP node ungroups its
  // members rather than taking them with it (BUG-free by construction, not a fix) —
  // same "move, don't cascade" reasoning as boards.ts's folder-delete default: removing
  // the container shouldn't destroy its contents, and the frontend's own delete path
  // (board-store.ts) never sends a group delete through this route without first
  // ungrouping client-side, but this is the server-side guarantee regardless of caller.
  app.delete<{ Params: { boardId: string; nodeId: string } }>(
    "/api/boards/:boardId/nodes/:nodeId",
    async (request, reply) => {
      const { nodeId } = request.params;
      const boardEdges = await db.select().from(edges).where(eq(edges.board_id, request.params.boardId));
      const connectedEdgeIds = boardEdges
        .filter((edge) => edge.source_node_id === nodeId || edge.target_node_id === nodeId)
        .map((edge) => edge.id);
      for (const edgeId of connectedEdgeIds) {
        await db.delete(edges).where(eq(edges.id, edgeId));
      }
      await db
        .update(nodes)
        .set({ parent_node_id: null, updated_at: new Date().toISOString() })
        .where(eq(nodes.parent_node_id, nodeId));
      await db.delete(chat_messages).where(eq(chat_messages.node_id, nodeId));
      await db.delete(nodes).where(eq(nodes.id, nodeId));
      return reply.code(204).send();
    }
  );
}
