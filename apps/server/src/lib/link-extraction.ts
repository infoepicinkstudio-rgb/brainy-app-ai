// ADR-0094 — article-text extraction for `link` nodes. Narrows ADR-0053's "no scraping"
// boundary rather than reversing it: ADR-0053 ruled out scraping specifically because
// LinkedIn (and most non-YouTube platforms at the time) require auth or JS rendering,
// which a plain server-side fetch can't do anything with — that's still true here, and
// still fails gracefully (falls through to `status: "failed"`, same as an unparseable
// media URL). What's now in scope is the large class of ordinary, server-rendered
// article/blog pages (news sites, Medium, Substack, personal blogs) that a direct GET +
// Readability-style parse genuinely CAN read — exactly what Istiyak asked for: "Links
// should scrap data then only they can pass context to next nodes."
//
// Deliberately NOT a browser-automation scrape (no Playwright/Puppeteer here) — that
// would be a much heavier, slower, more fragile dependency for this one fallback step,
// and most article pages don't need JS execution to render their actual text content.
// A page that DOES need JS (or sits behind a login/paywall) just fails this step
// cleanly, the same as any other unreachable/unparseable source in this codebase.

import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

// Fetching + parsing a single HTML page is fundamentally a fast operation (seconds),
// nothing like media-extraction.ts's multi-minute yt-dlp/whisper budget — a generous
// but still short ceiling catches a hung/slow server without making a genuinely broken
// link sit "pending" for a long time first.
const PAGE_FETCH_TIMEOUT_MS = 20_000;

// A real browser UA, not a bare fetch()'s default — some sites serve a stripped-down
// (or outright blocked) response to an obviously non-browser User-Agent. This is a
// single unauthenticated GET, no cookies/session/JS — still fully transparent as an
// automated request via every other signal (no referer, no browser-only headers), just
// not needlessly self-identifying in a way that trips a basic bot filter for no reason.
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * Fetches `url` and extracts its main readable article text (Readability's own
 * algorithm — the same approach Firefox's Reader View uses: strips nav/ads/sidebars,
 * keeps the actual article body). Throws on any failure (non-HTML response, fetch
 * error/timeout, or Readability finding no real article content) — callers (currently
 * only media-extraction.ts's `extractMediaForNode`, as a fallback after a failed media
 * pipeline attempt for a `link` node) are expected to catch this and treat it as an
 * ordinary extraction failure, never a thrown error that reaches the UI directly
 * (error-handling-conventions.md).
 */
export async function extractArticleText(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PAGE_FETCH_TIMEOUT_MS);
  let html: string;
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!response.ok) {
      throw new Error(`Fetching the page failed (HTTP ${response.status})`);
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("html")) {
      throw new Error(`Not an HTML page (content-type: "${contentType}")`);
    }
    html = await response.text();
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`Fetching the page timed out after ${PAGE_FETCH_TIMEOUT_MS / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  // JSDOM parses the raw HTML into a real DOM (scripts disabled by default — this never
  // executes any of the page's own JS, which is exactly why a JS-rendered page won't
  // have its real content in the initial HTML and will correctly fail the "no content
  // found" check below, same as ADR-0053's original LinkedIn concern).
  const dom = new JSDOM(html, { url });
  const article = new Readability(dom.window.document).parse();
  const text = article?.textContent?.replace(/\s+/g, " ").trim();
  if (!text) {
    throw new Error("Readability found no extractable article content on this page");
  }
  return text;
}
