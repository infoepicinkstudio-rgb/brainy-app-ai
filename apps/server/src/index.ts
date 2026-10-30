// Brainy backend entry point — Fastify. architecture.md §4.1: owns all DB reads/writes,
// AI provider calls, and yt-dlp/ffmpeg/transcription jobs, so none of that blocks the UI thread.

// BUG-026 fix, take 2: the earlier attempt used Node's native `--env-file=.env` flag on
// the `dev`/`start` scripts instead of a real dependency — reliable in isolation, but it
// turned out to re-break silently any time the npm script itself reverted (confirmed via
// a live diff of the file on disk: "dev": "tsx watch src/index.ts" with no flag, after
// Istiyak had done nothing more unusual than normal terminal use) — a one-line flag with
// no code trace is invisible to notice going missing. `dotenv` is a real, visible,
// version-controlled dependency instead: this import MUST stay the very first import in
// this file (ESM evaluates sibling imports in the order they're written, each one fully
// before the next — this guarantees `.env` is loaded into `process.env` before ANY other
// imported module's own top-level code runs, including media-extraction.ts's and
// ollama.ts's own `process.env.YTDLP_PATH`/`FFMPEG_PATH`/`OLLAMA_BASE_URL` reads).
import "dotenv/config";
import Fastify, { type FastifyError } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import pino from "pino";
import path from "node:path";
import { profileRoutes } from "./routes/profile.js";
import { providerCredentialsRoutes } from "./routes/provider-credentials.js";
import { brandProfileRoutes } from "./routes/brand-profile.js";
import { boardsRoutes } from "./routes/boards.js";
import { nodesRoutes } from "./routes/nodes.js";
import { filesRoutes } from "./routes/files.js";
import { linkPreviewRoutes } from "./routes/link-preview.js";
import { chatRoutes } from "./routes/chat.js";
import { youtubeCredentialsRoutes } from "./routes/youtube-credentials.js";
import { outliersRoutes } from "./routes/outliers.js";

const PORT = Number(process.env.PORT ?? 4000);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? "http://localhost:3000";

// Phase 7 (ADR-0034's open item, implementation_plan.md checklist item 4,
// error-handling-conventions.md: "Backend errors are logged to a file, not just
// console") — `logger: true` alone (the previous setup) hands Fastify a bare pino
// instance that writes to stdout only: fine while a terminal happens to be open and
// watched, useless the moment it's closed or scrolled past, which is exactly the
// "inspectable after the fact" case this rule is for. `pino.multistream` fans every
// log line out to BOTH stdout (so `npm run dev`'s live output is unchanged) and a real
// file on disk — one pino instance, one set of `app.log`/`request.log` calls already
// used everywhere in the codebase, no call-site changes needed anywhere else.
//
// `pino.destination({ mkdir: true })` is pino's own documented way to create the log
// directory on first run if it doesn't exist yet — confirmed by actually exercising it
// (a plain `pino.destination(path)` with no existing directory throws ENOENT
// asynchronously, which with no error listener would crash the process on first boot;
// `mkdir: true` avoids that entirely rather than needing a manual fs.mkdirSync first).
// `*.log` is already in .gitignore (matches at any depth, no new entry needed) so this
// never risks landing in git. No rotation — a single-user local dev server that
// restarts often; revisit if `server.log` ever grows large enough to matter.
const LOG_FILE = path.resolve(import.meta.dirname, "../logs/server.log");
const logger = pino(
  { level: process.env.LOG_LEVEL ?? "info" },
  pino.multistream([{ stream: process.stdout }, { stream: pino.destination({ dest: LOG_FILE, mkdir: true, sync: false }) }])
);

const app = Fastify({ loggerInstance: logger });

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

// Phase 6 — Outliers research panel (F-15/TF-09, ADR-0100).
await app.register(youtubeCredentialsRoutes);
await app.register(outliersRoutes);

// Phase 7 (ADR-0034's open item, implementation_plan.md checklist item 3) — bound to
// the literal loopback IP, not the hostname "localhost". Fastify/Node resolve
// "localhost" via DNS/hosts-file lookup before binding, which on a normal Windows
// install resolves to 127.0.0.1 (and ::1) anyway — but that resolution step is one
// more thing that could theoretically be wrong (a tampered hosts file, an unusual
// resolver config) for no benefit here. Binding the IP directly removes that step
// entirely: there's no resolution to get wrong, and it matches exactly what the
// checklist asks to confirm.
try {
  await app.listen({ port: PORT, host: "127.0.0.1" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
