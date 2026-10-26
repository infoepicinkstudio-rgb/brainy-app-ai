// Client-side video-URL classification — round 2 (Istiyak: "Copy pasting and adapting
// oEmbed is not only limited to YouTube node cards. It should be universal behaviour").
// Originally YouTube-only (lib/youtube.ts, ADR-0065); generalized here to also cover
// Vimeo, which has its own free, no-auth oEmbed endpoint (apps/server/src/routes/
// link-preview.ts fetches both the same way). Deliberately cheap and synchronous (no
// network) so a paste or a URL-field edit can switch a card to the video style the
// instant it's typed, before the backend's own metadata fetch resolves — the backend
// does its OWN independent parse of whatever URL it's given and never trusts this
// client-side classification for anything beyond the instant visual switch.

export type VideoPlatform = "youtube" | "vimeo";

export interface VideoUrlMatch {
  platform: VideoPlatform;
  videoId: string;
  canonicalUrl: string;
}

const YOUTUBE_WATCH_HOSTS = new Set(["www.youtube.com", "youtube.com", "m.youtube.com", "music.youtube.com"]);
const VIMEO_HOSTS = new Set(["vimeo.com", "www.vimeo.com", "player.vimeo.com"]);

function parseYouTube(url: URL): VideoUrlMatch | null {
  const host = url.hostname.toLowerCase();

  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0];
    return id ? { platform: "youtube", videoId: id, canonicalUrl: `https://www.youtube.com/watch?v=${id}` } : null;
  }
  if (!YOUTUBE_WATCH_HOSTS.has(host)) return null;

  if (url.pathname === "/watch") {
    const id = url.searchParams.get("v");
    return id ? { platform: "youtube", videoId: id, canonicalUrl: `https://www.youtube.com/watch?v=${id}` } : null;
  }
  const shortsMatch = url.pathname.match(/^\/shorts\/([^/]+)/);
  if (shortsMatch) {
    const id = shortsMatch[1];
    return { platform: "youtube", videoId: id, canonicalUrl: `https://www.youtube.com/watch?v=${id}` };
  }
  const embedMatch = url.pathname.match(/^\/embed\/([^/]+)/);
  if (embedMatch) {
    const id = embedMatch[1];
    return { platform: "youtube", videoId: id, canonicalUrl: `https://www.youtube.com/watch?v=${id}` };
  }

  return null;
}

function parseVimeo(url: URL): VideoUrlMatch | null {
  const host = url.hostname.toLowerCase();
  if (!VIMEO_HOSTS.has(host)) return null;

  // Covers vimeo.com/<id>, vimeo.com/channels/<name>/<id>, vimeo.com/groups/<name>/
  // videos/<id>, and player.vimeo.com/video/<id> — Vimeo's numeric video id is always
  // the long run of digits somewhere in the path, regardless of which of those shapes
  // it's embedded in.
  const idMatch = url.pathname.match(/(\d{6,})/);
  if (!idMatch) return null;
  const id = idMatch[1];
  return { platform: "vimeo", videoId: id, canonicalUrl: `https://vimeo.com/${id}` };
}

export function parseVideoUrl(rawUrl: string): VideoUrlMatch | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  return parseYouTube(url) ?? parseVimeo(url);
}
