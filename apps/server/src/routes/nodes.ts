// Node + edge CRUD for a single board (TF-03/TF-04/TF-12/TF-13). Edges are schema-ready
// (the `edges` table already exists) but Phase 2's own plan explicitly defers edge
// *creation* to Phase 3 — "relevant once Phase 3 adds edges" per implementation_plan.md.
// This route only lists/deletes edges defensively (so a node delete never leaves an
// orphaned edge pointing at nothing), it doesn't expose a way to create one yet.

import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { nodes, edges, chat_messages } from "../db/schema.js";

const NODE_TYPES = ["text", "video", "file", "link", "chat", "mindmap", "group"] as const;
type NodeType = (typeof NODE_TYPES)[number];

function isNodeType(value: string): value is NodeType {
  return (NODE_TYPES as readonly string[]).includes(value);
}

interface CreateNodeBody {
  type?: string;
  position_x?: number;
  position_y?: number;
  data?: unknown;
}

interface UpdateNodeBody {
  position_x?: number;
  position_y?: number;
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

  app.post<{ Params: { boardId: string }; Body: CreateNodeBody }>(
    "/api/boards/:boardId/nodes",
    async (request, reply) => {
      const { boardId } = request.params;
      const { type, position_x, position_y, data } = request.body ?? {};
      if (!type || !isNodeType(type)) {
        return reply.code(400).send({ error: `Unknown node type "${type}".` });
      }
      const [created] = await db
        .insert(nodes)
        .values({
          board_id: boardId,
          type,
          position_x: position_x ?? 0,
          position_y: position_y ?? 0,
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
      const { position_x, position_y, data } = request.body ?? {};
      const patch: Partial<typeof nodes.$inferInsert> = { updated_at: new Date().toISOString() };
      if (position_x !== undefined) patch.position_x = position_x;
      if (position_y !== undefined) patch.position_y = position_y;
      if (data !== undefined) patch.data = data;

      await db.update(nodes).set(patch).where(eq(nodes.id, nodeId));
      const [updated] = await db.select().from(nodes).where(eq(nodes.id, nodeId));
      if (!updated) return reply.code(404).send({ error: "Node not found." });
      return { node: updated };
    }
  );

  // Deleting a node also removes any edges pointing at it and any chat history it
  // owned (testing.md F-09: "no orphaned edges").
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
      await db.delete(chat_messages).where(eq(chat_messages.node_id, nodeId));
      await db.delete(nodes).where(eq(nodes.id, nodeId));
      return reply.code(204).send();
    }
  );
}
