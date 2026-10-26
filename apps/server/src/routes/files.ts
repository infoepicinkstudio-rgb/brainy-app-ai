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
};

function extOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot + 1).toLowerCase();
}

export async function filesRoutes(app: FastifyInstance) {
  app.post("/api/files/upload", async (request, reply) => {
    const file = await request.file();
    if (!file) {
      return reply.code(400).send({ error: "No file was uploaded." });
    }

    const buffer = await file.toBuffer();
    if (buffer.byteLength === 0) {
      return reply.code(400).send({ error: "The uploaded file is empty." });
    }

    const saved = await saveUpload(buffer, file.filename);
    const extraction = await extractForFile(buffer, file.filename, saved.contentHash);
    const isImage = isImageExtension(file.filename);

    return {
      fileName: file.filename,
      storedName: saved.storedName,
      contentHash: saved.contentHash,
      bytes: saved.bytes,
      isImage,
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
