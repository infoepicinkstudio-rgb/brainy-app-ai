// Boards + folders CRUD (TF-02, implementation_plan.md Phase 2 step 1 — Boards List is
// a thin UI over these). Soft-delete via `deleted_at` (ADR already locked in the
// `boards` table itself — no new table, just a filtered query, per the Phase 2 plan).

import type { FastifyInstance } from "fastify";
import { and, eq, isNull, isNotNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { boards, folders, nodes, edges, chat_messages } from "../db/schema.js";

interface CreateBoardBody {
  title?: string;
  folder_id?: string | null;
}

interface UpdateBoardBody {
  title?: string;
  folder_id?: string | null;
  is_favorite?: boolean;
}

interface FolderBody {
  name?: string;
  parent_folder_id?: string | null;
}

// Strategy for what happens to a folder's boards when the folder itself is deleted
// (ADR-0082). "move" (the default — matches the pre-existing, already-tested behavior)
// reassigns every board in the folder to `target_folder_id` (null = top level, same as
// before this round). "delete" sends every board in the folder to Trash (soft-delete,
// consistent with how board deletion works everywhere else in this app — never a hard
// delete from this flow) instead of relocating them.
interface DeleteFolderBody {
  action?: "move" | "delete";
  target_folder_id?: string | null;
}

export async function boardsRoutes(app: FastifyInstance) {
  // --- Folders ---------------------------------------------------------------

  app.get("/api/folders", async () => {
    const rows = await db.select().from(folders);
    return { folders: rows };
  });

  app.post<{ Body: FolderBody }>("/api/folders", async (request, reply) => {
    const name = request.body?.name?.trim();
    if (!name) {
      return reply.code(400).send({ error: "A folder name is required." });
    }
    const [created] = await db
      .insert(folders)
      .values({ name, parent_folder_id: request.body?.parent_folder_id ?? null })
      .returning();
    return reply.code(201).send({ folder: created });
  });

  app.patch<{ Params: { id: string }; Body: FolderBody }>("/api/folders/:id", async (request, reply) => {
    const { id } = request.params;
    const patch: Partial<typeof folders.$inferInsert> = { updated_at: new Date().toISOString() };
    if (request.body?.name !== undefined) {
      const name = request.body.name.trim();
      if (!name) return reply.code(400).send({ error: "A folder name is required." });
      patch.name = name;
    }
    if (request.body?.parent_folder_id !== undefined) {
      patch.parent_folder_id = request.body.parent_folder_id;
    }
    await db.update(folders).set(patch).where(eq(folders.id, id));
    const [updated] = await db.select().from(folders).where(eq(folders.id, id));
    if (!updated) return reply.code(404).send({ error: "Folder not found." });
    return { folder: updated };
  });

  // What happens to a folder's boards on delete is now a real, explicit choice
  // (ADR-0082) rather than always silently orphaning them to top level. Default stays
  // "move" to null (top level) when no body is sent at all, preserving the exact
  // pre-existing behavior testing.md F-04 already covers for any caller that doesn't
  // opt into the new body shape.
  app.delete<{ Params: { id: string }; Body: DeleteFolderBody | undefined }>(
    "/api/folders/:id",
    async (request, reply) => {
      const { id } = request.params;
      const action = request.body?.action ?? "move";

      if (action === "delete") {
        // Soft-delete every board in this folder — same `deleted_at` mechanism as the
        // single-board "Move to Trash" action, never a hard delete. `folder_id` is also
        // cleared here (BUG-025): `boards.folder_id` is a real FK against `folders.id`,
        // so leaving it pointing at the folder this request is about to delete below
        // violates that constraint the moment the DELETE on `folders` runs, even though
        // the board itself is only soft-deleted, not gone. A trashed board no longer
        // meaningfully "belongs" to a folder at all, so null is the right value here,
        // not just the FK-safe one.
        await db
          .update(boards)
          .set({ deleted_at: new Date().toISOString(), folder_id: null, updated_at: new Date().toISOString() })
          .where(eq(boards.folder_id, id));
      } else {
        const targetFolderId = request.body?.target_folder_id ?? null;
        await db
          .update(boards)
          .set({ folder_id: targetFolderId, updated_at: new Date().toISOString() })
          .where(eq(boards.folder_id, id));
      }

      await db.delete(folders).where(eq(folders.id, id));
      return reply.code(204).send();
    }
  );

  // --- Boards ------------------------------------------------------------------

  app.get("/api/boards", async () => {
    const rows = await db.select().from(boards).where(isNull(boards.deleted_at));
    return { boards: rows };
  });

  app.get("/api/boards/trash", async () => {
    const rows = await db.select().from(boards).where(isNotNull(boards.deleted_at));
    return { boards: rows };
  });

  app.get<{ Params: { id: string } }>("/api/boards/:id", async (request, reply) => {
    const [board] = await db.select().from(boards).where(eq(boards.id, request.params.id));
    if (!board) return reply.code(404).send({ error: "Board not found." });
    return { board };
  });

  app.post<{ Body: CreateBoardBody }>("/api/boards", async (request, reply) => {
    const title = request.body?.title?.trim() || "Untitled board";
    const [created] = await db
      .insert(boards)
      .values({ title, folder_id: request.body?.folder_id ?? null })
      .returning();
    return reply.code(201).send({ board: created });
  });

  app.patch<{ Params: { id: string }; Body: UpdateBoardBody }>("/api/boards/:id", async (request, reply) => {
    const { id } = request.params;
    const patch: Partial<typeof boards.$inferInsert> = { updated_at: new Date().toISOString() };
    if (request.body?.title !== undefined) {
      const title = request.body.title.trim();
      if (!title) return reply.code(400).send({ error: "A board title is required." });
      patch.title = title;
    }
    if (request.body?.folder_id !== undefined) {
      patch.folder_id = request.body.folder_id;
    }
    if (request.body?.is_favorite !== undefined) {
      patch.is_favorite = request.body.is_favorite;
    }
    await db.update(boards).set(patch).where(eq(boards.id, id));
    const [updated] = await db.select().from(boards).where(eq(boards.id, id));
    if (!updated) return reply.code(404).send({ error: "Board not found." });
    return { board: updated };
  });

  // Soft-delete -> Trash.
  app.post<{ Params: { id: string } }>("/api/boards/:id/trash", async (request, reply) => {
    const { id } = request.params;
    await db
      .update(boards)
      .set({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .where(eq(boards.id, id));
    const [updated] = await db.select().from(boards).where(eq(boards.id, id));
    if (!updated) return reply.code(404).send({ error: "Board not found." });
    return { board: updated };
  });

  // Restore from Trash.
  app.post<{ Params: { id: string } }>("/api/boards/:id/restore", async (request, reply) => {
    const { id } = request.params;
    await db.update(boards).set({ deleted_at: null, updated_at: new Date().toISOString() }).where(eq(boards.id, id));
    const [updated] = await db.select().from(boards).where(eq(boards.id, id));
    if (!updated) return reply.code(404).send({ error: "Board not found." });
    return { board: updated };
  });

  // Permanent delete from Trash — hard delete the row + cascade its nodes/edges/messages
  // (no DB-level ON DELETE CASCADE in the schema, so this is done explicitly, in the
  // dependency order edges/messages -> nodes -> board, to respect the FK references).
  app.delete<{ Params: { id: string } }>("/api/boards/:id", async (request, reply) => {
    const { id } = request.params;
    const [board] = await db.select().from(boards).where(eq(boards.id, id));
    if (!board) return reply.code(404).send({ error: "Board not found." });

    const boardNodes = await db.select().from(nodes).where(eq(nodes.board_id, id));
    for (const node of boardNodes) {
      await db.delete(chat_messages).where(eq(chat_messages.node_id, node.id));
    }
    await db.delete(edges).where(eq(edges.board_id, id));
    await db.delete(nodes).where(eq(nodes.board_id, id));
    await db.delete(boards).where(eq(boards.id, id));

    return reply.code(204).send();
  });
}
