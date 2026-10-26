// Client-side YouTube URL classification — Phase 5's "YouTube link parser" pulled
// forward (implementation_plan.md's new node-card-overhaul slice, ADR-0065). Deliberately
// cheap and synchronous (no network) so a paste or a URL-field edit can switch a card's
// visual style to the video style the instant it's typed, before the backend's
// metadata/thumbnail fetch (apps/server/src/routes/link-preview.ts) resolves.
//
// The backend does its OWN independent parse of whatever URL it's given (never trusts a
// client-sent "this is a YouTube video" flag) — this duplication is intentional, not an
// oversight; see link-preview.ts's own comment.

export interface YouTubeMatch {
  videoId: string;
  canonicalUrl: string;
}

const WATCH_HOSTS = new Set(["www.youtube.com", "youtube.com", "m.youtube.com", "music.youtube.com"]);

export function parseYouTubeUrl(rawUrl: string): YouTubeMatch | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();

  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0];
    return id ? { videoId: id, canonicalUrl: `https://www.youtube.com/watch?v=${id}` } : null;
  }

  if (!WATCH_HOSTS.has(host)) return null;

  if (url.pathname === "/watch") {
    const id = url.searchParams.get("v");
    return id ? { videoId: id, canonicalUrl: `https://www.youtube.com/watch?v=${id}` } : null;
  }

  const shortsMatch = url.pathname.match(/^\/shorts\/([^/]+)/);
  if (shortsMatch) {
    return { videoId: shortsMatch[1], canonicalUrl: `https://www.youtube.com/watch?v=${shortsMatch[1]}` };
  }

  const embedMatch = url.pathname.match(/^\/embed\/([^/]+)/);
  if (embedMatch) {
    return { videoId: embedMatch[1], canonicalUrl: `https://www.youtube.com/watch?v=${embedMatch[1]}` };
  }

  return null;
}
