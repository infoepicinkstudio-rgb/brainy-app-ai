// YouTube Data API key storage (F-15/TF-09, ADR-0100) — a single row, same encrypt-at-
// rest treatment as provider-credentials.ts but deliberately NOT that file: see
// db/schema.ts's own comment on `youtube_credentials` for why this isn't a fourth
// `provider_credentials` row. The raw key never leaves this file after being written —
// every response here returns only `isConfigured` (a boolean), matching
// provider-credentials.ts's own "frontend only ever learns a boolean" contract.

import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { youtube_credentials } from "../db/schema.js";
import { encrypt, decrypt } from "../db/crypto.js";

interface YoutubeStatus {
  isConfigured: boolean;
}

async function getRow() {
  const [row] = await db.select().from(youtube_credentials).limit(1);
  return row;
}

/** Used by routes/outliers.ts when it actually calls the YouTube Data API — the only
 * other place in the server that ever sees the decrypted key, same one-reader pattern
 * provider adapters use for provider_credentials.api_key. Returns null when no key has
 * been saved yet, so the caller can give its own "no key configured" error rather than
 * this file needing to know about Outliers at all. */
export async function getDecryptedYoutubeKey(): Promise<string | null> {
  const row = await getRow();
  if (!row?.api_key) return null;
  return decrypt(row.api_key);
}

function toStatus(row: { api_key: string | null } | undefined): YoutubeStatus {
  return { isConfigured: Boolean(row?.api_key) };
}

interface SaveYoutubeKeyBody {
  apiKey?: string | null; // string to set, "" or null to clear, undefined to leave as-is
}

export async function youtubeCredentialsRoutes(app: FastifyInstance) {
  app.get("/api/youtube/credentials", async () => {
    return toStatus(await getRow());
  });

  app.put<{ Body: SaveYoutubeKeyBody }>("/api/youtube/credentials", async (request, reply) => {
    const { apiKey } = request.body ?? {};
    if (apiKey === undefined) {
      return reply.code(400).send({ error: "apiKey is required." });
    }
    const existing = await getRow();
    const nextApiKey = apiKey ? encrypt(apiKey) : null;
    if (existing) {
      await db
        .update(youtube_credentials)
        .set({ api_key: nextApiKey, updated_at: new Date().toISOString() })
        .where(eq(youtube_credentials.id, existing.id));
    } else {
      await db.insert(youtube_credentials).values({ api_key: nextApiKey });
    }
    return toStatus(await getRow());
  });

  app.delete("/api/youtube/credentials", async () => {
    const existing = await getRow();
    if (existing) {
      await db
        .update(youtube_credentials)
        .set({ api_key: null, updated_at: new Date().toISOString() })
        .where(eq(youtube_credentials.id, existing.id));
    }
    return toStatus(await getRow());
  });
}
