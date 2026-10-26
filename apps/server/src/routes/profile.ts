// Single cosmetic profile row (ADR-0032 — no real auth). TF-01: the frontend calls
// GET on app load to decide login-vs-Boards-List, and POST once on first submit.

import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { initialsFromName } from "../lib/avatar-initials.js";

interface SaveProfileBody {
  name?: string;
}

export async function profileRoutes(app: FastifyInstance) {
  app.get("/api/profile", async () => {
    const [profile] = await db.select().from(users).limit(1);
    return { profile: profile ?? null };
  });

  app.post<{ Body: SaveProfileBody }>("/api/profile", async (request, reply) => {
    const name = request.body?.name?.trim();
    if (!name) {
      return reply.code(400).send({ error: "A name is required." });
    }

    const avatarInitials = initialsFromName(name);
    const [existing] = await db.select().from(users).limit(1);

    if (existing) {
      await db
        .update(users)
        .set({ name, avatar_initials: avatarInitials, updated_at: new Date().toISOString() })
        .where(eq(users.id, existing.id));
      const [updated] = await db.select().from(users).where(eq(users.id, existing.id));
      return { profile: updated };
    }

    const [created] = await db
      .insert(users)
      .values({ name, avatar_initials: avatarInitials })
      .returning();
    return reply.code(201).send({ profile: created });
  });
}
