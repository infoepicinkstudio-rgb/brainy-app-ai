// File-node upload + extraction (F-26, ADR-0053, implementation_plan.md Phase 2 step 7).
// Upload and node-data update are deliberately two separate calls: this route only
// saves the file + runs extraction and hands back the result; the frontend then calls
// the existing nodes PATCH route to attach that result to the node's `data` — one place
// owns "how a node gets updated" instead of duplicating that logic here.

import type { FastifyInstance } from "fastify";
import { saveUpload, readStoredFile, resolveStoredFile } from "../lib/uploads.js";
import { extractForFile, isImageExtension } from "../lib/extraction.js";
import { stat } from "node:fs/promises";

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  heic: "image/heic",
  // Phase 5 (ADR-0085/ADR-0086) — audio/video uploads are served back through this same
  // GET route (download links on audio-node.tsx/video-node.tsx), so they need a real
  // Content-Type too, same as every other stored upload.
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  flac: "audio/flac",
  aac: "audio/aac",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mkv: "video/x-matroska",
  avi: "video/x-msvideo",
};

function extOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot + 1).toLowerCase();
}

// Phase 3 bug-fix round (Istiyak: "IF file type doesn't supported then it should not
// have come to board... mp3 mp4 html certain files not supported yet"). The real,
// user-facing gate is client-side (board-store.ts's `isSupportedFileType`, checked
// BEFORE this route is even called, so the user sees a toast instantly with no upload
// round-trip) — this is the server-side backstop for any caller that skips that check,
// kept in sync with the same extension set (and with extraction.ts's own
// `IMAGE_EXTENSIONS`/`supported` lists, which this was already duplicating one layer
// down).
//
// Phase 5 (ADR-0085/ADR-0086): audio/video extensions are exactly the ones that
// comment above was deliberately deferring ("mp3 mp4 ... not supported yet") — they're
// accepted here now, but routed to a DIFFERENT node type than everything else in this
// set (see `mediaKindOf` below and board-store.ts's `addFileNode`), never through
// `extractForFile`'s pdf/docx/xlsx path.
const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "m4a", "ogg", "flac", "aac"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "webm", "mkv", "avi"]);

const SUPPORTED_UPLOAD_EXTENSIONS = new Set([
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "svg",
  "bmp",
  "heic",
  ...AUDIO_EXTENSIONS,
  ...VIDEO_EXTENSIONS,
]);

export type FileKind = "pdf" | "docx" | "xlsx" | "image" | "other";
export type MediaKind = "document" | "audio" | "video";

// Decides which node type an upload becomes (board-store.ts's `addFileNode`) — checked
// BEFORE `fileKind`/`extractForFile`, since audio/video never go through either of
// those (they get their own lazy transcript pipeline, media-extraction.ts, not
// pdf-parse/mammoth/xlsx, and not at upload time at all — ADR-0044's "extract only on
// actual demand" reasoning applies to these exactly as much as it does to a video link).
function mediaKindOf(filename: string): MediaKind {
  const ext = extOf(filename);
  if (AUDIO_EXTENSIONS.has(ext)) return "audio";
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  return "document";
}

// Round 2 (Istiyak: "File uploads should get type-specific visual treatment by file
// type... Office's own color conventions, blue/green/red etc."). Detected by extension
// at upload time, same moment extraction already classifies the file — the frontend
// uses this purely for icon/accent-color choice (node-chrome.tsx's NodeAccent), never
// for anything extraction-related.
function fileKindOf(filename: string): FileKind {
  const ext = extOf(filename);
  if (ext === "pdf") return "pdf";
  if (ext === "docx" || ext === "doc") return "docx";
  if (ext === "xlsx" || ext === "xls") return "xlsx";
  if (MIME_BY_EXT[ext]?.startsWith("image/")) return "image";
  return "other";
}

export async function filesRoutes(app: FastifyInstance) {
  app.post("/api/files/upload", async (request, reply) => {
    const file = await request.file();
    if (!file) {
      return reply.code(400).send({ error: "No file was uploaded." });
    }

    // `file.toBuffer()` fully drains the multipart stream — this must happen before
    // any early return below, or the request's body stream is left unconsumed
    // (@fastify/multipart expects every part to be read out, buffer or not).
    const buffer = await file.toBuffer();

    if (!SUPPORTED_UPLOAD_EXTENSIONS.has(extOf(file.filename))) {
      return reply.code(415).send({ error: `"${file.filename}" isn't a supported file type yet.` });
    }

    if (buffer.byteLength === 0) {
      return reply.code(400).send({ error: "The uploaded file is empty." });
    }

    const saved = await saveUpload(buffer, file.filename);
    const mediaKind = mediaKindOf(file.filename);

    // Audio/video (ADR-0085/ADR-0086): no extraction attempted here at all — the
    // storage step above is the only thing audio/video actually needs from this route;
    // the lazy yt-dlp/ffmpeg/whisper pipeline runs later, on an actual chat reference or
    // an explicit Re-extract (media-extraction.ts). `fileKind`/`extractForFile` are
    // document-shaped concerns (Office-color icon system, pdf-parse/mammoth/xlsx) that
    // never applied to these anyway.
    if (mediaKind !== "document") {
      return {
        fileName: file.filename,
        storedName: saved.storedName,
        contentHash: saved.contentHash,
        bytes: saved.bytes,
        mediaKind,
      };
    }

    const extraction = await extractForFile(buffer, file.filename, saved.contentHash);
    const isImage = isImageExtension(file.filename);
    const fileKind = fileKindOf(file.filename);

    return {
      fileName: file.filename,
      storedName: saved.storedName,
      contentHash: saved.contentHash,
      bytes: saved.bytes,
      isImage,
      fileKind,
      mediaKind,
      extraction: {
        status: extraction.status,
        // The extracted text itself can be large — the node's `data` column doesn't
        // need to carry it (it's always re-fetchable from extraction_cache by content
        // hash in Phase 4's context assembly), so only a short preview goes back here.
        preview: extraction.content ? extraction.content.slice(0, 400) : null,
      },
    };
  });

  app.get<{ Params: { storedName: string } }>("/api/files/:storedName", async (request, reply) => {
    const { storedName } = request.params;
    const absPath = resolveStoredFile(storedName);
    if (!absPath) {
      return reply.code(400).send({ error: "Invalid file reference." });
    }
    try {
      await stat(absPath);
    } catch {
      return reply.code(404).send({ error: "File not found." });
    }
    const buffer = await readStoredFile(storedName);
    if (!buffer) {
      return reply.code(404).send({ error: "File not found." });
    }
    const ext = extOf(storedName);
    reply.type(MIME_BY_EXT[ext] ?? "application/octet-stream");
    return reply.send(buffer);
  });
}
