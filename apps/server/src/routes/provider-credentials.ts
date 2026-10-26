// Provider API-key storage + per-provider execution mode (TF-11, architecture.md §4.2).
// The raw key never leaves this file after being written — every response below returns
// only `isConfigured` (a boolean), matching architecture.md §6's "frontend only ever
// learns a boolean is_configured per provider."

import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { provider_credentials } from "../db/schema.js";
import { encrypt } from "../db/crypto.js";

const PROVIDERS = ["claude", "openai", "gemini"] as const;
type Provider = (typeof PROVIDERS)[number];

const EXECUTION_MODES = ["local", "native", "manual"] as const;
type ExecutionMode = (typeof EXECUTION_MODES)[number];

function isProvider(value: string): value is Provider {
  return (PROVIDERS as readonly string[]).includes(value);
}

function isExecutionMode(value: string): value is ExecutionMode {
  return (EXECUTION_MODES as readonly string[]).includes(value);
}

interface ProviderStatus {
  provider: Provider;
  isConfigured: boolean;
  isEnabled: boolean;
  executionMode: ExecutionMode;
}

function toStatus(provider: Provider, row: typeof provider_credentials.$inferSelect | undefined): ProviderStatus {
  return {
    provider,
    isConfigured: Boolean(row?.api_key),
    isEnabled: row?.is_enabled ?? true,
    executionMode: (row?.execution_mode as ExecutionMode | undefined) ?? "native",
  };
}

interface SaveProviderBody {
  apiKey?: string | null; // string to set, "" or null to clear, undefined to leave as-is
  executionMode?: string;
  isEnabled?: boolean;
}

export async function providerCredentialsRoutes(app: FastifyInstance) {
  app.get("/api/providers", async () => {
    const rows = await db.select().from(provider_credentials);
    const byProvider = new Map(rows.map((row) => [row.provider, row]));
    return {
      providers: PROVIDERS.map((provider) => toStatus(provider, byProvider.get(provider))),
    };
  });

  app.put<{ Params: { provider: string }; Body: SaveProviderBody }>(
    "/api/providers/:provider",
    async (request, reply) => {
      const { provider } = request.params;
      if (!isProvider(provider)) {
        return reply.code(400).send({ error: `Unknown provider "${provider}".` });
      }

      const { apiKey, executionMode, isEnabled } = request.body ?? {};
      if (executionMode !== undefined && !isExecutionMode(executionMode)) {
        return reply.code(400).send({ error: `Unknown execution mode "${executionMode}".` });
      }

      const [existing] = await db
        .select()
        .from(provider_credentials)
        .where(eq(provider_credentials.provider, provider));

      const patch: Partial<typeof provider_credentials.$inferInsert> = {
        updated_at: new Date().toISOString(),
      };
      if (apiKey !== undefined) {
        patch.api_key = apiKey ? encrypt(apiKey) : null;
      }
      if (executionMode !== undefined) {
        patch.execution_mode = executionMode;
      }
      if (isEnabled !== undefined) {
        patch.is_enabled = isEnabled;
      }

      if (existing) {
        await db.update(provider_credentials).set(patch).where(eq(provider_credentials.provider, provider));
      } else {
        await db.insert(provider_credentials).values({
          provider,
          api_key: apiKey ? encrypt(apiKey) : null,
          execution_mode: executionMode ?? "native",
          is_enabled: isEnabled ?? true,
        });
      }

      const [row] = await db
        .select()
        .from(provider_credentials)
        .where(eq(provider_credentials.provider, provider));
      return toStatus(provider, row);
    }
  );

  app.delete<{ Params: { provider: string } }>("/api/providers/:provider", async (request, reply) => {
    const { provider } = request.params;
    if (!isProvider(provider)) {
      return reply.code(400).send({ error: `Unknown provider "${provider}".` });
    }

    const [existing] = await db
      .select()
      .from(provider_credentials)
      .where(eq(provider_credentials.provider, provider));
    if (!existing) {
      return toStatus(provider, undefined);
    }

    await db
      .update(provider_credentials)
      .set({ api_key: null, updated_at: new Date().toISOString() })
      .where(eq(provider_credentials.provider, provider));

    const [row] = await db
      .select()
      .from(provider_credentials)
      .where(eq(provider_credentials.provider, provider));
    return toStatus(provider, row);
  });
}
