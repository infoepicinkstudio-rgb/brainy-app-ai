// Brainy backend entry point — Fastify. architecture.md §4.1: owns all DB reads/writes,
// AI provider calls, and yt-dlp/ffmpeg/transcription jobs, so none of that blocks the UI thread.

import Fastify, { type FastifyError } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { profileRoutes } from "./routes/profile.js";
import { providerCredentialsRoutes } from "./routes/provider-credentials.js";
import { brandProfileRoutes } from "./routes/brand-profile.js";
import { boardsRoutes } from "./routes/boards.js";
import { nodesRoutes } from "./routes/nodes.js";
import { filesRoutes } from "./routes/files.js";
import { linkPreviewRoutes } from "./routes/link-preview.js";
import { chatRoutes } from "./routes/chat.js";

const PORT = Number(process.env.PORT ?? 4000);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? "http://localhost:3000";

const app = Fastify({ logger: true });

// Flagged as a gap after Phase 1 (error-handling-conventions.md: "Never surface a raw
// stack trace or exception message to the UI") — an uncaught route error previously had
// no handler at all, so Fastify's own default would do exactly that in dev mode. Fixed
// here while touching routes extensively for Phase 2: the real error still goes to the
// server log (app.log.error, same as everywhere else in this codebase), the client only
// ever sees a plain, generic message.
app.setErrorHandler((error: FastifyError, request, reply) => {
  request.log.error(error);
  const status = error.statusCode && error.statusCode < 500 ? error.statusCode : 500;
  reply.code(status).send({
    error: status < 500 ? error.message : "Something went wrong on the server. Check the server log for details.",
  });
});

// CORS restricted to the frontend's own origin only — "localhost-only" binding alone
// does not stop a browser-side cross-origin fetch() from a malicious page the user has
// open elsewhere. Never widen this to "*". See architecture.md §6, ADR-0049.
//
// `methods` must be listed explicitly: @fastify/cors v11's own default is only
// "GET,HEAD,POST" — PUT/PATCH/DELETE are NOT included unless named here. Without this,
// every mutating request that isn't a plain POST (provider-key saves, brand-profile
// saves, and all of Phase 2's node/board PATCH-autosave and DELETE calls) fails the
// browser's CORS preflight silently — confirmed via a live PATCH request while
// building Phase 2 (autosave calls were firing and reaching fetch(), but the browser
// itself blocked them before they ever reached the server).
await app.register(cors, {
  origin: FRONTEND_ORIGIN,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
});

// File-node uploads (F-26) — 50MB cap is a reasonable ceiling for a local-only,
// single-user knowledge-base PDF/DOCX/XLSX, not a hard product requirement.
await app.register(multipart, {
  limits: { fileSize: 50 * 1024 * 1024 },
});

app.get("/health", async () => {
  return { status: "ok", service: "brainy-server", time: new Date().toISOString() };
});

// Phase 1 — App Shell routes (architecture.md §4.1, ADR-0061).
await app.register(profileRoutes);
await app.register(providerCredentialsRoutes);
await app.register(brandProfileRoutes);

// Phase 2 — Core canvas routes (TF-02/TF-03/TF-04/TF-12/TF-13).
await app.register(boardsRoutes);
await app.register(nodesRoutes);
await app.register(filesRoutes);

// Node-card-overhaul slice (ADR-0065) — Phase 5's metadata/thumbnail fetch pulled
// forward; see link-preview.ts's own header comment for exact scope.
await app.register(linkPreviewRoutes);

// Phase 4 — First chat node (architecture.md §4.2/§4.3, TF-07/TF-08).
await app.register(chatRoutes);

try {
  await app.listen({ port: PORT, host: "localhost" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
