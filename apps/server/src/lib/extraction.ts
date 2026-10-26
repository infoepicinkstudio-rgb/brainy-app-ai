// File-node text/data extraction — PDF, DOCX, XLSX (F-26, ADR-0053, ADR-0051: Node-native
// libraries only, no Python). Images are deliberately NOT handled here — no OCR in MVP,
// they're visual-only file nodes (handled in the route layer, never reach this module).
// Every result is cached in `extraction_cache` keyed by the file's content hash, so
// re-uploading identical bytes is a cache hit, not a re-parse (verified in Phase 2 testing).

import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { extraction_cache } from "../db/schema.js";

export type ExtractionStatus = "ok" | "unsupported" | "failed" | "not_applicable";

export interface ExtractionResult {
  status: ExtractionStatus;
  content: string | null;
  /** True when this came straight from extraction_cache — no parsing work happened. */
  cached: boolean;
}

// Caps a pathologically large spreadsheet/doc from producing a multi-MB cache row —
// a low-stakes implementation safety valve, not a product decision; flagged in the
// Phase 2 report same as the uploads/ storage location call.
const MAX_EXTRACTED_CHARS = 500_000;

function truncate(text: string): string {
  if (text.length <= MAX_EXTRACTED_CHARS) return text;
  return text.slice(0, MAX_EXTRACTED_CHARS) + "\n\n[...truncated — original content exceeded the extraction size cap]";
}

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "heic"]);

function extOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot + 1).toLowerCase();
}

async function extractPdf(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

async function extractDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

function extractXlsx(buffer: Buffer): string {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const parts: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    parts.push(`--- Sheet: ${sheetName} ---\n${csv}`);
  }
  return parts.join("\n\n");
}

/**
 * Extracts text/data for a file node, checking `extraction_cache` first. Returns
 * "not_applicable" for images (no extraction attempted by design), "unsupported" for
 * any other file type, and "failed" for a corrupt/unparseable supported file — never
 * throws, so a bad upload can't crash the route.
 */
export async function extractForFile(
  buffer: Buffer,
  originalFilename: string,
  contentHash: string
): Promise<ExtractionResult> {
  const ext = extOf(originalFilename);

  if (IMAGE_EXTENSIONS.has(ext)) {
    return { status: "not_applicable", content: null, cached: false };
  }

  const supported = ext === "pdf" || ext === "docx" || ext === "xlsx" || ext === "xls";
  if (!supported) {
    return { status: "unsupported", content: null, cached: false };
  }

  const [cached] = await db.select().from(extraction_cache).where(eq(extraction_cache.source_key, contentHash));
  if (cached) {
    return { status: "ok", content: cached.extracted_content, cached: true };
  }

  try {
    let text: string;
    if (ext === "pdf") {
      text = await extractPdf(buffer);
    } else if (ext === "docx") {
      text = await extractDocx(buffer);
    } else {
      text = extractXlsx(buffer);
    }

    const content = truncate(text.trim());
    await db.insert(extraction_cache).values({
      source_key: contentHash,
      extracted_content: content,
    });
    return { status: "ok", content, cached: false };
  } catch {
    // Corrupt, password-protected, or otherwise unparseable — a graceful failure
    // state, not a 500. The real error goes to the server log via the route's own
    // catch (error-handling-conventions.md: never surface a raw stack trace to the UI).
    return { status: "failed", content: null, cached: false };
  }
}

export function isImageExtension(filename: string): boolean {
  return IMAGE_EXTENSIONS.has(extOf(filename));
}
