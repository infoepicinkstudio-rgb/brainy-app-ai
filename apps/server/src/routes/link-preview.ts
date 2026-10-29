// Link/video metadata fetch — the Phase 5 slice pulled forward into the node-card-
// overhaul pass (implementation_plan.md, ADR-0065), widened twice since:
//
// Round 2 / ADR-0067: generalized from YouTube-only to ANY pasted/entered URL. YouTube
// and Vimeo both have a free, no-auth oEmbed endpoint (title + thumbnail + author in one
// call) and keep their existing `video` node treatment; everything else gets a NEW,
// deliberately lightweight fetch of just the target page's <title> tag and a favicon
// URL — explicitly NOT the page's actual body/article content, which stays exactly as
// out of scope as ADR-0053 originally decided. This route never returns page content,
// only cosmetic metadata (a title string, a favicon URL) — the favicon URL itself is
// handed to the client to load directly via <img src>, the same way the YouTube
// thumbnail URL already is, never proxied/re-served through this server.
//
// Fetched server-side, not from the browser (architecture.md §4 — "server owns external
// calls"), for the same reason file extraction already runs server-side: avoids CORS
// entirely and keeps every outbound network call in one place that can be rate-limited/
// logged/swapped later, rather than scattered across client components.
//
// This route does its OWN independent parse/classification of the given `url` — it
// never trusts a client-sent "this is YouTube/Vimeo" flag (apps/web/lib/video-platform.ts
// does the same parse client-side, but only to switch the card's visual style instantly;
// the server re-derives everything itself before ever calling out anywhere).

import type { FastifyInstance } from "fastify";

const YOUTUBE_WATCH_HOSTS = new Set(["www.youtube.com", "youtube.com", "m.youtube.com", "music.youtube.com"]);
const VIMEO_HOSTS = new Set(["vimeo.com", "www.vimeo.com", "player.vimeo.com"]);
const OEMBED_TIMEOUT_MS = 8_000;
const GENERIC_FETCH_TIMEOUT_MS = 8_000;
// <title> and a favicon <link> both live in <head>, near the top of the document — this
// caps how much of a generic page we ever read so a huge page can't tie up the server
// (ADR-0067: cosmetic metadata only, never a reason to read an entire page).
const MAX_HTML_BYTES = 200_000;

function parseYouTubeVideoId(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();

  if (host === "youtu.be") {
    return url.pathname.slice(1).split("/")[0] || null;
  }
  if (!YOUTUBE_WATCH_HOSTS.has(host)) return null;

  if (url.pathname === "/watch") {
    return url.searchParams.get("v");
  }
  const shortsMatch = url.pathname.match(/^\/shorts\/([^/]+)/);
  if (shortsMatch) return shortsMatch[1];

  const embedMatch = url.pathname.match(/^\/embed\/([^/]+)/);
  if (embedMatch) return embedMatch[1];

  return null;
}

function parseVimeoVideoId(url: URL): string | null {
  if (!VIMEO_HOSTS.has(url.hostname.toLowerCase())) return null;
  // Covers vimeo.com/<id>, vimeo.com/channels/<name>/<id>, and player.vimeo.com/video/<id>.
  const match = url.pathname.match(/(\d{6,})/);
  return match ? match[1] : null;
}

interface OEmbedResponse {
  title?: string;
  thumbnail_url?: string;
  author_name?: string;
  // Round 1 UX #9 (Istiyak: "Video preview thumbnails should match source aspect ratio
  // — 16:9 YouTube, 9:16 Shorts/Reels"). Both YouTube's and Vimeo's oEmbed responses
  // already include the actual pixel dimensions of thumbnail_url — a vertical Short's
  // thumbnail comes back with thumbnail_height > thumbnail_width, a normal video's the
  // other way around — so this is the real source of truth for aspect ratio, not a
  // guess from the URL shape (youtube.com/shorts/... gets normalized away to a plain
  // /watch?v= URL before this ever runs — see parseYouTubeVideoId above — so the URL
  // alone can't tell a Short from a normal upload at this point anyway).
  thumbnail_width?: number;
  thumbnail_height?: number;
}

async function fetchOembed(oembedUrl: string): Promise<OEmbedResponse | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OEMBED_TIMEOUT_MS);
  try {
    const res = await fetch(oembedUrl, { signal: controller.signal });
    if (!res.ok) return null;
    return (await res.json()) as OEmbedResponse;
  } catch {
    // Network failure/timeout, or a private/deleted/region-locked video — the oEmbed
    // endpoint 401s/404s for all of these and this route can't distinguish *why* from
    // the outside (feature.md F-10's own stated scope), so this is one graceful "no
    // metadata" result either way, never a 500 to the client.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const codePoint = code[1]?.toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return HTML_ENTITIES[code.toLowerCase()] ?? match;
  });
}

async function fetchPageMetadata(
  target: URL
): Promise<{ title?: string; faviconUrl?: string; previewImageUrl?: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GENERIC_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(target.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        // Identifies this as Brainy's own lookup, not a disguised scraper — some sites
        // block an unidentified/empty UA outright, which would otherwise look like
        // every generic link failing for no visible reason.
        "user-agent": "Mozilla/5.0 (compatible; BrainyAI-link-preview/1.0; local personal research tool)",
        accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("html")) return null;

    let html = "";
    const reader = res.body?.getReader();
    if (reader) {
      const decoder = new TextDecoder();
      let bytesRead = 0;
      while (bytesRead < MAX_HTML_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        bytesRead += value.byteLength;
        html += decoder.decode(value, { stream: true });
        if (/<\/head>/i.test(html)) break;
      }
      await reader.cancel().catch(() => {});
    } else {
      // Some runtimes/fetch polyfills don't expose a streaming body — fall back to
      // the whole response rather than silently returning nothing.
      html = await res.text();
    }

    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? decodeHtmlEntities(titleMatch[1].trim()).replace(/\s+/g, " ") : undefined;

    const iconMatch = html.match(/<link[^>]+rel=["'](?:shortcut icon|icon|apple-touch-icon)["'][^>]*>/i);
    let faviconUrl: string | undefined;
    if (iconMatch) {
      const hrefMatch = iconMatch[0].match(/href=["']([^"']+)["']/i);
      if (hrefMatch) {
        try {
          faviconUrl = new URL(hrefMatch[1], target).toString();
        } catch {
          faviconUrl = undefined;
        }
      }
    }
    if (!faviconUrl) {
      faviconUrl = new URL("/favicon.ico", target).toString();
    }

    // Round 6 (Istiyak: link card "can also have URL preview like youtube thumbnail
    // preview aspect ratio"): an Open Graph (or Twitter Card, as a fallback) image is
    // the same kind of cosmetic, publisher-supplied metadata as the title/favicon
    // above — still never the page's actual body/article content (ADR-0053 unchanged).
    // Absent entirely on plenty of sites, which is fine: the client falls back to its
    // existing compact favicon+title treatment when this is undefined.
    const ogImageMatch = html.match(
      /<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>|<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image["'][^>]*>/i
    );
    const twitterImageMatch = html.match(
      /<meta[^>]+name=["']twitter:image["'][^>]*content=["']([^"']+)["'][^>]*>|<meta[^>]+content=["']([^"']+)["'][^>]*name=["']twitter:image["'][^>]*>/i
    );
    const rawImage = (ogImageMatch?.[1] ?? ogImageMatch?.[2]) || (twitterImageMatch?.[1] ?? twitterImageMatch?.[2]);
    let previewImageUrl: string | undefined;
    if (rawImage) {
      try {
        previewImageUrl = new URL(decodeHtmlEntities(rawImage), target).toString();
      } catch {
        previewImageUrl = undefined;
      }
    }

    if (!title) return null; // nothing worth showing instead of the raw URL
    return { title, faviconUrl, previewImageUrl };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

interface LinkPreviewQuery {
  url?: string;
}

export async function linkPreviewRoutes(app: FastifyInstance) {
  app.get<{ Querystring: LinkPreviewQuery }>("/api/link-preview", async (request, reply) => {
    const { url } = request.query;
    if (!url) {
      return reply.code(400).send({ error: "Missing url query parameter." });
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return reply.code(400).send({ error: "Invalid url." });
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return reply.code(400).send({ error: "Only http/https URLs are supported." });
    }

    const videoId = parseYouTubeVideoId(url);
    if (videoId) {
      const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(canonicalUrl)}&format=json`;
      const body = await fetchOembed(oembedUrl);
      if (!body) {
        return { platform: "youtube" as const, videoId, status: "error" as const };
      }
      return {
        platform: "youtube" as const,
        videoId,
        status: "ok" as const,
        title: body.title ?? "",
        thumbnailUrl: body.thumbnail_url ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        authorName: body.author_name ?? "",
        thumbnailWidth: body.thumbnail_width,
        thumbnailHeight: body.thumbnail_height,
      };
    }

    // Vimeo (ADR-0067 follow-up): free, no-auth oEmbed endpoint, same shape as
    // YouTube's — low-effort enough to add alongside it rather than letting Vimeo links
    // fall through to the generic favicon+title case.
    const vimeoVideoId = parseVimeoVideoId(parsed);
    if (vimeoVideoId) {
      const oembedUrl = `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`;
      const body = await fetchOembed(oembedUrl);
      if (!body) {
        return { platform: "vimeo" as const, videoId: vimeoVideoId, status: "error" as const };
      }
      return {
        platform: "vimeo" as const,
        videoId: vimeoVideoId,
        status: "ok" as const,
        title: body.title ?? "",
        thumbnailUrl: body.thumbnail_url ?? "",
        authorName: body.author_name ?? "",
        thumbnailWidth: body.thumbnail_width,
        thumbnailHeight: body.thumbnail_height,
      };
    }

    // Generic link (ADR-0067): cosmetic title + favicon only, never the page's body
    // content.
    const meta = await fetchPageMetadata(parsed);
    if (meta?.title) {
      return {
        platform: "generic" as const,
        status: "ok" as const,
        title: meta.title,
        faviconUrl: meta.faviconUrl,
        previewImageUrl: meta.previewImageUrl,
      };
    }
    return { platform: "generic" as const, status: "error" as const };
  });
}
