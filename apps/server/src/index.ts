// Brainy backend entry point — Fastify. architecture.md §4.1: owns all DB reads/writes,
// AI provider calls, and yt-dlp/ffmpeg/transcription jobs, so none of that blocks the UI thread.

import Fastify from "fastify";
import cors from "@fastify/cors";

const PORT = Number(process.env.PORT ?? 4000);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? "http://localhost:3000";

const app = Fastify({ logger: true });

// CORS restricted to the frontend's own origin only — "localhost-only" binding alone
// does not stop a browser-side cross-origin fetch() from a malicious page the user has
// open elsewhere. Never widen this to "*". See architecture.md §6, ADR-0049.
await app.register(cors, {
  origin: FRONTEND_ORIGIN,
});

app.get("/health", async () => {
  return { status: "ok", service: "brainy-server", time: new Date().toISOString() };
});

try {
  await app.listen({ port: PORT, host: "localhost" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
