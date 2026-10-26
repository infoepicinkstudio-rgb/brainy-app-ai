// Local, content-addressed storage for file-node uploads (F-26, ADR-0053). No table for
// this exists yet — architecture.md has nothing specced beyond extraction_cache's text
// data, so this is a small, low-stakes implementation call made to keep Phase 2 moving
// rather than blocking on it: files live in a gitignored `uploads/` folder at the repo
// root (same tier as brainy.db — real user data, never committed), named
// `<sha256-of-content>__<sanitized-original-filename>`. Content-addressing means
// re-uploading the exact same file is a free no-op write and gives the extraction
// cache (keyed by the same hash) a natural, correct cache key for free. Flagged in the
// Phase 2 delivery report for Istiyak to fold into rules-decisions.md if it matters.

import { createHash } from "node:crypto";
import { mkdir, writeFile, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// apps/server/src/lib -> repo root is five levels up
export const UPLOADS_DIR = path.resolve(__dirname, "../../../../uploads");

function sanitizeFilename(name: string): string {
  // Strip path separators and anything else that could escape UPLOADS_DIR or confuse
  // a filesystem; keep it human-readable, not perfectly safe-for-every-OS.
  return name.replace(/[/\\]/g, "_").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-180) || "file";
}

export interface SavedUpload {
  storedName: string;
  contentHash: string;
  absPath: string;
  bytes: number;
}

export async function saveUpload(buffer: Buffer, originalFilename: string): Promise<SavedUpload> {
  await mkdir(UPLOADS_DIR, { recursive: true });
  const contentHash = createHash("sha256").update(buffer).digest("hex");
  const storedName = `${contentHash}__${sanitizeFilename(originalFilename)}`;
  const absPath = path.join(UPLOADS_DIR, storedName);

  try {
    await stat(absPath);
    // Already on disk under this content hash — identical bytes, nothing to write.
  } catch {
    await writeFile(absPath, buffer);
  }

  return { storedName, contentHash, absPath, bytes: buffer.byteLength };
}

/** Resolves a stored filename to an absolute path, rejecting anything that isn't a
 * plain filename inside UPLOADS_DIR (no traversal via ../ or an absolute path). */
export function resolveStoredFile(storedName: string): string | null {
  if (!storedName || storedName.includes("/") || storedName.includes("\\") || storedName.includes("..")) {
    return null;
  }
  return path.join(UPLOADS_DIR, storedName);
}

export async function readStoredFile(storedName: string): Promise<Buffer | null> {
  const absPath = resolveStoredFile(storedName);
  if (!absPath) return null;
  try {
    return await readFile(absPath);
  } catch {
    return null;
  }
}
