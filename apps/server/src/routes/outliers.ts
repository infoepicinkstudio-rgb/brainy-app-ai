// Outliers research panel (F-15/TF-09, ADR-0100) — two read-only lookups backing the
// panel's own two steps (search a channel, then browse it). Neither one writes to the
// board at all; quick-add (creating a real video node on the current board) reuses the
// EXISTING `addVideoNodeFromUrl` board-store action client-side — this file only ever
// returns data for the panel to show, never creates a node itself.

import type { FastifyInstance } from "fastify";
import { getDecryptedYoutubeKey } from "./youtube-credentials.js";
import { searchChannels, listChannelVideosWithOutliers, YoutubeApiError } from "../lib/youtube-api.js";

const NO_KEY_MESSAGE = "No YouTube Data API key saved — add one in Settings.";

export async function outliersRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { q?: string } }>("/api/youtube/search-channels", async (request, reply) => {
    const query = request.query.q?.trim();
    if (!query) {
      return reply.code(400).send({ error: "A search query is required." });
    }
    const apiKey = await getDecryptedYoutubeKey();
    if (!apiKey) {
      return reply.code(400).send({ error: NO_KEY_MESSAGE });
    }
    try {
      const channels = await searchChannels(apiKey, query);
      // F-15: "channel not found" must read as distinct from "zero outliers" — this
      // just returns an empty array either way (succeeded, found nothing), and the
      // panel's own copy is what tells the two apart (see outliers-panel.tsx).
      return { channels };
    } catch (err) {
      if (err instanceof YoutubeApiError) {
        return reply.code(err.status || 502).send({ error: err.message });
      }
      throw err;
    }
  });

  app.get<{ Params: { channelId: string } }>("/api/youtube/channel/:channelId/videos", async (request, reply) => {
    const apiKey = await getDecryptedYoutubeKey();
    if (!apiKey) {
      return reply.code(400).send({ error: NO_KEY_MESSAGE });
    }
    try {
      // Round 2 (Istiyak, reference screenshot): listChannelVideosWithOutliers now
      // returns the channel's subscriber/video counts alongside its videos (same
      // already-paid /channels call, just reading more fields from it — see
      // youtube-api.ts), for the panel header's "X subscribers · Y videos" line.
      const result = await listChannelVideosWithOutliers(apiKey, request.params.channelId);
      return result;
    } catch (err) {
      if (err instanceof YoutubeApiError) {
        return reply.code(err.status || 502).send({ error: err.message });
      }
      throw err;
    }
  });
}
