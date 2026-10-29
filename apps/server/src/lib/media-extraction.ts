// Video/audio transcript extraction, PLUS (ADR-0094) a link-node article-text fallback
// (Phase 5, ADR-0044 extended by ADR-0085/ADR-0086/ADR-0087/ADR-0088/ADR-0094). Mirrors
// extraction.ts's shape (status/content/cached) but for media/link sources instead of
// uploaded documents: yt-dlp (download) -> ffmpeg (normalize to 16kHz mono wav) ->
// whisper.cpp (transcribe) for video/audio and URL-sourced media; for a `link` node
// specifically, a failed media attempt falls through to link-extraction.ts's
// Readability-based article-text scrape instead of giving up (see `extractMediaForNode`
// below). Reuses the SAME `extraction_cache` table ADR-0044 already reserved for this
// ("video/audio transcripts" in schema.ts's own comment, now genuinely "extracted
// content" more broadly) — no schema change needed.
//
// Trigger model (ADR-0044's caching strategy — cache forever, manual override only —
// still holds; ADR-0091 changed WHEN the first run fires): called with no `force` from
// THREE places now — context-assembly.ts's lazy chat-triggered path (ADR-0044's
// original trigger, kept), routes/nodes.ts's non-forced `/extract` route (ADR-0091's
// eager trigger, fired the instant a node's source becomes known — paste-to-create,
// upload, or a link URL committing), and the same route's forced `/re-extract` sibling
// for the manual override (`force: true`, invalidates a stale cache entry). Because
// ADR-0091 means several of these can now fire within the same few seconds (pasting a
// batch of videos), `extractMediaForNode` bounds how many pipelines actually run at
// once — see `acquireExtractionSlot`/`MAX_CONCURRENT_EXTRACTIONS` below — rather than
// racing every triggered extraction against the others for the same CPU cores.

import { spawn } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { nodes, extraction_cache } from "../db/schema.js";
import { resolveStoredFile } from "./uploads.js";
import { extractArticleText } from "./link-extraction.js";

export type MediaExtractionStatus = "pending" | "ok" | "failed";

export interface MediaExtractionResult {
  status: MediaExtractionStatus;
  /** Full transcript — what context-assembly.ts actually feeds into a prompt. */
  content: string | null;
  /** Short preview — what a node card shows inline (same 400-char convention
   * extraction.ts/files.ts already use for document previews). */
  preview: string | null;
  /** True when this came straight from `extraction_cache` — no pipeline run happened. */
  cached: boolean;
}

// Mirrors extraction.ts's own cap — a multi-hour podcast transcript shouldn't bloat
// extraction_cache (or the prompt it eventually feeds) indefinitely.
const MAX_TRANSCRIPT_CHARS = 500_000;

function truncate(text: string): string {
  if (text.length <= MAX_TRANSCRIPT_CHARS) return text;
  return text.slice(0, MAX_TRANSCRIPT_CHARS) + "\n\n[...truncated — original transcript exceeded the extraction size cap]";
}

// External binaries (ADR-0051, implementation_plan.md Phase 5 step 0) — resolved from
// PATH by default (bare command name), overridable via env var for a non-standard
// install location. Same "config, never hardcoded" pattern lib/api.ts's own
// `API_BASE_URL` already uses.
const YTDLP_PATH = process.env.YTDLP_PATH ?? "yt-dlp";
const FFMPEG_PATH = process.env.FFMPEG_PATH ?? "ffmpeg";
// ADR-0088 — the GGML model file whisper.cpp actually loads; downloaded separately by
// Istiyak (@fugood/whisper.node doesn't automate this), gitignored like uploads/brainy.db.
const WHISPER_MODEL_PATH =
  process.env.WHISPER_MODEL_PATH ?? path.resolve(import.meta.dirname, "../../../../models/ggml-base.en.bin");

// A long podcast/lecture genuinely needs minutes, not seconds (F-25: "any async action
// that can take a while... has a reasonable timeout" — not "finishes instantly").
const PIPELINE_STEP_TIMEOUT_MS = 10 * 60 * 1000;

// ADR-0092 — bounded concurrency for the extraction pipeline. ADR-0091 made extraction
// fire automatically for every video/audio/link node roughly as soon as it's created,
// so pasting a batch (Istiyak's own example: "Suppose user pasted 10 video on board")
// can now trigger many pipeline runs within the same few seconds. Running all of them
// fully in parallel with NO limit wouldn't actually finish them faster on a single
// consumer machine — @fugood/whisper.node is CPU-bound with no GPU path here, so N
// transcriptions racing for the same handful of cores mostly just slow each other down
// in proportion (and N copies of the GGML model loaded into memory at once risks
// exhausting RAM on a lower-spec machine). Running them fully serially (1 at a time)
// is the opposite problem — 10 videos really would take most of a day. A small bounded
// queue gets real wall-clock parallelism without oversubscribing the machine: at most
// `MAX_CONCURRENT_EXTRACTIONS` pipelines run at once, everything else waits its turn.
// Tunable via EXTRACTION_CONCURRENCY (same env-var convention as YTDLP_PATH etc. above)
// for a machine that can comfortably handle more, or less, than the default of 2.
//
// Known limitation, not solved here: `transcribe()` below has no timeout of its own
// (pre-existing — see its own comment), so a single genuinely-hung whisper call would
// hold its queue slot forever and back up everything behind it. Flagged, not fixed in
// this pass — would need running whisper as a killable subprocess instead of the
// in-process native addon, a bigger change than this round's scope.
const MAX_CONCURRENT_EXTRACTIONS = Math.max(1, Number(process.env.EXTRACTION_CONCURRENCY) || 2);
let activeExtractions = 0;
const extractionWaitQueue: Array<() => void> = [];

function acquireExtractionSlot(): Promise<void> {
  if (activeExtractions < MAX_CONCURRENT_EXTRACTIONS) {
    activeExtractions++;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    extractionWaitQueue.push(() => {
      activeExtractions++;
      resolve();
    });
  });
}

function releaseExtractionSlot(): void {
  activeExtractions--;
  const next = extractionWaitQueue.shift();
  if (next) next();
}

// BUG-033 — deleting a node mid-extraction used to leave its pipeline running (and its
// concurrency slot held, see ADR-0092) for a node that no longer exists: DELETE
// .../nodes/:nodeId had zero awareness of acquireExtractionSlot/extractionWaitQueue or
// any in-flight extractMediaForNode call for that node. A batch-pasted-then-deleted set
// of videos could permanently starve every genuinely new extraction behind it — exactly
// what it looks like when a short video "should take seconds" but sits pending for many
// minutes right after deleting other nodes.
//
// Fix: every in-flight or queued extraction registers itself here, keyed by node id, so
// `cancelExtractionForNode` (called from the DELETE route) can mark it cancelled and —
// if a subprocess (yt-dlp/ffmpeg) is currently running for it — kill that process
// immediately. A still-QUEUED extraction (never reached acquireExtractionSlot yet, or
// resolved it but hasn't spawned anything) is skipped entirely the moment it would
// start, releasing its slot in ~0ms instead of running a pointless full pipeline.
//
// Known remaining gap, not solved here: @fugood/whisper.node's transcribeFile() is an
// in-process native addon with no kill hook (same limitation ADR-0092's own comment
// already flagged) — a node deleted during the whisper step itself still waits that one
// step out before its slot frees. Every other stage (download, normalize, and a node
// deleted before transcription ever starts) is now cancelled immediately.
class ExtractionCancelledError extends Error {
  constructor() {
    super("Extraction cancelled — node was deleted.");
    this.name = "ExtractionCancelledError";
  }
}

interface ActiveExtraction {
  cancelled: boolean;
  killCurrentProcess: (() => void) | null;
}

const activeExtractionsByNode = new Map<string, ActiveExtraction>();

/** Called from the node DELETE route. No-op if this node has no in-flight/queued
 * extraction right now (the common case) — safe to call unconditionally on every delete. */
export function cancelExtractionForNode(nodeId: string): void {
  const entry = activeExtractionsByNode.get(nodeId);
  if (!entry) return;
  entry.cancelled = true;
  entry.killCurrentProcess?.();
}

// `entry`, when passed, registers this subprocess as killable (BUG-033) for the
// duration of the call and clears that registration again once it settles — so
// `cancelExtractionForNode` can only ever kill the process that's actually running
// right now, never a stale handle from a previous stage.
function run(command: string, args: string[], entry?: ActiveExtraction): Promise<void> {
  return new Promise((resolve, reject) => {
    if (entry?.cancelled) {
      reject(new ExtractionCancelledError());
      return;
    }
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(command, args, { windowsHide: true });
    } catch (err) {
      reject(err);
      return;
    }
    if (entry) entry.killCurrentProcess = () => child.kill();
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${command} timed out after ${PIPELINE_STEP_TIMEOUT_MS / 1000}s`));
    }, PIPELINE_STEP_TIMEOUT_MS);
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      if (entry) entry.killCurrentProcess = null;
      // ENOENT here means the binary isn't on PATH — implementation_plan.md Phase 5
      // step 0's own install checklist, surfaced as a real error rather than a silent
      // hang the first time Istiyak hits this before installing yt-dlp.exe/ffmpeg.exe.
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (entry) entry.killCurrentProcess = null;
      if (entry?.cancelled) {
        reject(new ExtractionCancelledError());
      } else if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code}: ${stderr.slice(-2000)}`));
      }
    });
  });
}

type MediaSource = { kind: "url"; url: string } | { kind: "upload"; absPath: string };

async function downloadAudioFromUrl(url: string, workDir: string, entry: ActiveExtraction): Promise<string> {
  // yt-dlp pulls whatever audio track is actually available, in whatever container it
  // arrives in (m4a/webm/...) — no format conversion here, that's ffmpeg's explicit job
  // next. Kept as two real subprocess calls (implementation_plan.md Phase 5's own
  // checklist: "yt-dlp integration (audio pull)" then "ffmpeg normalization step" as
  // separate items) rather than leaning on yt-dlp's own `--audio-format` postprocessor,
  // for full control over the exact flags whisper needs.
  const outputTemplate = path.join(workDir, "source.%(ext)s");
  await run(YTDLP_PATH, ["-f", "bestaudio/best", "--no-playlist", "-o", outputTemplate, url], entry);
  const files = await readdir(workDir);
  const downloaded = files.find((f) => f.startsWith("source."));
  if (!downloaded) throw new Error("yt-dlp reported success but produced no output file");
  return path.join(workDir, downloaded);
}

async function normalizeToWav(inputPath: string, workDir: string, entry: ActiveExtraction): Promise<string> {
  const outputPath = path.join(workDir, "normalized.wav");
  // 16kHz mono PCM — the exact format @fugood/whisper.node's `transcribeFile` expects.
  // ffmpeg pulls the audio track directly out of a video container too, so this one
  // call handles an uploaded video file (ADR-0086) exactly the same way it handles
  // yt-dlp's audio-only download or an uploaded audio file (ADR-0085).
  await run(FFMPEG_PATH, ["-y", "-i", inputPath, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", outputPath], entry);
  return outputPath;
}

async function transcribe(wavPath: string, entry: ActiveExtraction): Promise<string> {
  // BUG-033 — whisper.node has no kill hook (see this file's top-of-section comment on
  // activeExtractionsByNode), so this is a best-effort check: if the node was deleted
  // during an earlier stage, don't even start transcription. A cancellation that lands
  // WHILE this call is running still isn't interruptible — documented limitation, not
  // fixed here.
  if (entry.cancelled) throw new ExtractionCancelledError();
  // Lazy import — @fugood/whisper.node loads a native addon at import time; importing
  // it only when actually transcribing keeps a not-yet-`npm install`ed dependency from
  // crashing the whole server at boot (this pipeline is new and optional until Istiyak
  // runs the one install command, same caution ADR-0051 already applied to the Python
  // fallback it explicitly kept available).
  const { initWhisper } = await import("@fugood/whisper.node");
  // `filePath`, not `model` — the GGML model path option name (confirmed against the
  // installed package's own binding.ts: `NativeContextOptions.filePath`).
  const context = await initWhisper({ filePath: WHISPER_MODEL_PATH });
  try {
    const { promise } = context.transcribeFile(wavPath, {});
    const result = await promise;
    // `result.result` is already the full plain-text transcript (whisper.node's own
    // concatenation of every segment) — exactly what a chat prompt needs; this app has
    // no transcript-viewer UI with per-segment timestamps (F-14 never asked for one),
    // so `result.segments` is never read here.
    return result.result.replace(/\s+/g, " ").trim();
  } finally {
    await context.release();
  }
}

async function runPipeline(source: MediaSource, entry: ActiveExtraction): Promise<string> {
  const workDir = await mkdtemp(path.join(tmpdir(), "brainy-extract-"));
  try {
    const rawAudioPath = source.kind === "url" ? await downloadAudioFromUrl(source.url, workDir, entry) : source.absPath;
    const wavPath = await normalizeToWav(rawAudioPath, workDir, entry);
    return await transcribe(wavPath, entry);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

// source_key convention (matches extraction_cache's existing doc comment: "a source URL
// *or* a file-content hash"): a URL-sourced node (video url-source, or any link node,
// ADR-0087) keys on its URL; an upload-sourced node (video upload-source ADR-0086, or
// audio ADR-0085) keys on its content hash — same as file-node extraction already does.
function sourceKeyFor(node: typeof nodes.$inferSelect): string | null {
  const data = asRecord(node.data);
  if (node.type === "video") {
    if (data.source === "upload") return typeof data.contentHash === "string" ? data.contentHash : null;
    return typeof data.url === "string" ? data.url : null; // url-source, including every legacy node (no `source` field predates ADR-0086 — all URL-based)
  }
  if (node.type === "audio") {
    return typeof data.contentHash === "string" ? data.contentHash : null;
  }
  if (node.type === "link") {
    return typeof data.url === "string" ? data.url : null;
  }
  return null;
}

function mediaSourceFor(node: typeof nodes.$inferSelect): MediaSource | null {
  const data = asRecord(node.data);
  if (node.type === "video" && data.source === "upload") {
    const absPath = typeof data.storedName === "string" ? resolveStoredFile(data.storedName) : null;
    return absPath ? { kind: "upload", absPath } : null;
  }
  if (node.type === "video" || node.type === "link") {
    return typeof data.url === "string" ? { kind: "url", url: data.url } : null;
  }
  if (node.type === "audio") {
    const absPath = typeof data.storedName === "string" ? resolveStoredFile(data.storedName) : null;
    return absPath ? { kind: "upload", absPath } : null;
  }
  return null;
}

// BUG-032 — re-reads the node's CURRENT `data` right before merging/writing, rather
// than trusting the `node.data` this function was called with, which can be stale: the
// route handler (`/extract`/`/re-extract` in nodes.ts) reads the node from the DB ONCE,
// then hands it to `extractMediaForNode`, which can run for a while — anywhere from a
// couple of seconds (ADR-0094's link-article scrape) to several minutes (a real video's
// whisper pass) — before this function is finally called. ANY other edit to that same
// node's `data` made WHILE extraction was in flight (most commonly: a link node's own
// title/favicon fetch, `board-store.ts`'s `refreshLinkMetadata`, which fires at almost
// exactly the same moment ADR-0091's eager extraction does) would otherwise be silently
// discarded the instant this function's blind `{...node.data, extractionStatus, ...}`
// spread overwrote it with the stale pre-edit snapshot. That's exactly what Istiyak saw:
// a link card's thumbnail/title rendered fine while extraction was still "pending"
// (the title fetch's own save had already landed and nothing had clobbered it yet), then
// vanished the instant extraction finished — because THIS write, using a `node.data`
// snapshot captured before the title fetch had saved anything, won the race and
// reverted the row back to titleless. Re-reading right here, as late as possible before
// the write, shrinks that race window to effectively nothing and fixes it for every
// node type/field, not just link titles specifically (the same stale-overwrite risk
// existed for, e.g., a note edited mid-transcription on a long video).
async function patchNodeExtractionState(
  node: typeof nodes.$inferSelect,
  status: MediaExtractionStatus,
  content: string | null
): Promise<void> {
  const [current] = await db.select().from(nodes).where(eq(nodes.id, node.id));
  const baseData = current ? asRecord(current.data) : asRecord(node.data);
  const nextData = {
    ...baseData,
    extractionStatus: status,
    extractionPreview: content ? content.slice(0, 400) : null,
  };
  node.data = nextData; // keep the in-memory row in sync for the rest of this call/request
  await db.update(nodes).set({ data: nextData, updated_at: new Date().toISOString() }).where(eq(nodes.id, node.id));
}

/** Cache-only lookup, no pipeline run — lets context-assembly.ts decide whether it's
 * about to trigger a (possibly slow) extraction BEFORE actually calling
 * `extractMediaForNode`, so it can warn the chat stream first (ADR per implementation_plan.md
 * Phase 5 step 5: "in-progress UI state... surfaced through the existing SSE stream"). */
export async function hasCachedTranscript(node: typeof nodes.$inferSelect): Promise<boolean> {
  const sourceKey = sourceKeyFor(node);
  if (!sourceKey) return false;
  const [cached] = await db
    .select({ id: extraction_cache.id })
    .from(extraction_cache)
    .where(eq(extraction_cache.source_key, sourceKey));
  return Boolean(cached);
}

/**
 * Lazily extracts (or, with `force`, re-extracts) content for a video/audio/link node:
 * checks `extraction_cache` first (skipped when `force`), runs the yt-dlp/ffmpeg/
 * whisper pipeline on a miss — for a `link` node, falling through to link-extraction.ts's
 * article-text scrape (ADR-0094) if that media attempt fails — and persists BOTH the
 * cache row and the node's own `data.extractionStatus`/`extractionPreview` — this is the
 * one place in the codebase that writes to a node's `data` from somewhere other than
 * routes/nodes.ts's PATCH handler, specifically because this can run mid-chat-request
 * (context-assembly.ts), not in direct response to a client PATCH, so the node itself
 * needs to self-update for its own card to ever reflect what happened without a manual
 * reload.
 *
 * Never throws — every failure mode (private/region-locked/unsupported video, a corrupt
 * upload, a missing yt-dlp/ffmpeg binary, no GGML model file, or — for a link node whose
 * media attempt AND article scrape both failed — an unreachable page, a non-HTML
 * response, or a page whose real content needs JS/a login the scrape can't do anything
 * with) collapses to `status: "failed"` (F-14: "chat node shows a clear failure
 * state... conversation can continue without that node's deep content"), never a 500
 * that blocks the rest of the chat turn.
 */
export async function extractMediaForNode(
  node: typeof nodes.$inferSelect,
  options: { force?: boolean } = {}
): Promise<MediaExtractionResult> {
  const sourceKey = sourceKeyFor(node);
  const source = mediaSourceFor(node);
  if (!sourceKey || !source) {
    return { status: "failed", content: null, preview: null, cached: false };
  }

  if (!options.force) {
    const [cached] = await db.select().from(extraction_cache).where(eq(extraction_cache.source_key, sourceKey));
    if (cached) {
      await patchNodeExtractionState(node, "ok", cached.extracted_content);
      return { status: "ok", content: cached.extracted_content, preview: cached.extracted_content.slice(0, 400), cached: true };
    }
  }

  // "pending" is set BEFORE the concurrency wait below, deliberately — a node queued
  // behind others (ADR-0092) is still honestly "not done yet, actively being worked
  // through" from the user's side, same card state as one that's actually running right
  // now. There's no separate "queued" status; see ADR-0092's own comment for why that
  // distinction wasn't worth the extra state everywhere this type is threaded through.
  await patchNodeExtractionState(node, "pending", null);

  // BUG-033 — registered for the full lifetime of this call (queued AND running) so
  // `cancelExtractionForNode` can reach it from the DELETE route either way. Always
  // cleaned up in the outer `finally` below, regardless of how this function exits.
  const entry: ActiveExtraction = { cancelled: false, killCurrentProcess: null };
  activeExtractionsByNode.set(node.id, entry);

  try {
    // ADR-0092 — waits for a free slot if MAX_CONCURRENT_EXTRACTIONS pipelines are
    // already running; resolves immediately otherwise.
    await acquireExtractionSlot();
    try {
      // BUG-033 — the node may have been deleted while this was waiting in the queue
      // (acquireExtractionSlot can take a while under ADR-0092's bound). Skip the
      // pipeline entirely rather than running it for nothing — releases this slot in
      // ~0ms instead of after a full, pointless yt-dlp/ffmpeg/whisper run.
      if (entry.cancelled) {
        return { status: "failed", content: null, preview: null, cached: false };
      }
      let extracted: string;
      try {
        extracted = truncate((await runPipeline(source, entry)).trim());
        if (!extracted) throw new Error("Pipeline produced an empty transcript");
      } catch (mediaErr) {
        // ADR-0094 — a `link` node gets one more chance before giving up: most link
        // URLs are ordinary web pages, not something yt-dlp can pull any media from, so
        // a media-pipeline failure here doesn't mean "nothing extractable" the way it
        // does for a dedicated video/audio node. Fall back to scraping the page's own
        // readable article text instead. `source.kind` is always `"url"` for a link
        // node (mediaSourceFor never returns an upload source for that type), so this
        // cast is safe. Video/audio nodes get no such fallback — a failed media
        // pipeline for those really does mean failure, same as before this ADR. A
        // cancellation (node deleted) is never worth falling back from — there's
        // nothing left to extract FOR.
        if (mediaErr instanceof ExtractionCancelledError) throw mediaErr;
        if (node.type !== "link" || source.kind !== "url") throw mediaErr;
        extracted = truncate((await extractArticleText(source.url)).trim());
        if (!extracted) throw new Error("No readable article content found either");
      }
      // Re-extract: clear any existing row for this source first rather than leaving a
      // stale duplicate — source_key is UNIQUE, so this keeps one row per source either way.
      if (options.force) {
        await db.delete(extraction_cache).where(eq(extraction_cache.source_key, sourceKey));
      }
      await db.insert(extraction_cache).values({ source_key: sourceKey, extracted_content: extracted });
      await patchNodeExtractionState(node, "ok", extracted);
      return { status: "ok", content: extracted, preview: extracted.slice(0, 400), cached: false };
    } catch (err) {
      if (err instanceof ExtractionCancelledError) {
        // Not a real failure — the node is gone, so there's no card left to show
        // "failed" on anyway. A quieter log line than a genuine pipeline error.
        console.log(`[media-extraction] cancelled for source "${sourceKey}" — node was deleted`);
        return { status: "failed", content: null, preview: null, cached: false };
      }
      // The real error goes to the server log only — never a raw stack trace to the UI
      // (error-handling-conventions.md).
      console.error(`[media-extraction] failed for source "${sourceKey}":`, err);
      await patchNodeExtractionState(node, "failed", null);
      return { status: "failed", content: null, preview: null, cached: false };
    } finally {
      releaseExtractionSlot();
    }
  } finally {
    activeExtractionsByNode.delete(node.id);
  }
}
