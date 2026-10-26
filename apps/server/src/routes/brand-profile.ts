// The local Brand/Voice Profile (F-21, ADR-0039) — a single row of free-text content,
// opted into per chat node in context assembly from Phase 4 onward. Settings only needs
// to read and write its content in Phase 1.

import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { brand_profile } from "../db/schema.js";

const DEFAULT_LABEL = "Default";

interface SaveBrandProfileBody {
  content?: string;
}

export async function brandProfileRoutes(app: FastifyInstance) {
  app.get("/api/brand-profile", async () => {
    const [profile] = await db.select().from(brand_profile).limit(1);
    return { brandProfile: profile ?? null };
  });

  app.put<{ Body: SaveBrandProfileBody }>("/api/brand-profile", async (request) => {
    const content = request.body?.content ?? "";
    const [existing] = await db.select().from(brand_profile).limit(1);

    if (existing) {
      await db
        .update(brand_profile)
        .set({ content, updated_at: new Date().toISOString() })
        .where(eq(brand_profile.id, existing.id));
      const [updated] = await db.select().from(brand_profile).where(eq(brand_profile.id, existing.id));
      return { brandProfile: updated };
    }

    const [created] = await db
      .insert(brand_profile)
      .values({ label: DEFAULT_LABEL, content })
      .returning();
    return { brandProfile: created };
  });
}
