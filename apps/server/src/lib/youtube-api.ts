// YouTube Data API v3 client (F-15/TF-09, ADR-0100) — plain `fetch`, no Google SDK, same
// "no SDK dependency" convention the chat provider adapters already use (claude.ts/
// openai.ts/gemini.ts). Two real API calls per channel browse, deliberately NOT the
// obvious third ("search.list with channelId + order=date/viewCount"):
//
// YouTube's own documented quota costs (developers.google.com/youtube/v3/determine_quota_cost)
// make search.list cost 100 units per call against a default free-tier budget of 10,000
// units/day — so naive "one search.list call per tab" would burn the ENTIRE daily quota
// in roughly 33 tab-switches, before Istiyak had done anything else with the key that
// day. channels.list + playlistItems.list (this file's actual path for listing a
// channel's own videos) cost ~1 unit each — getting a channel's recent uploads this way
// costs about 1/50th of the naive approach. The one place search.list is unavoidable is
// the initial "find a channel by name" lookup (there's no cheaper way to turn a search
// term into a channel id) — that single call still costs 100 units, but it only runs
// once per channel search, not once per tab click, which is the actual hot path.

const API_BASE = "https://www.googleapis.com/youtube/v3";
const OEMBED_TIMEOUT_MS = 6_000;

export class YoutubeApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = "YoutubeApiError";
  }
}

async function youtubeFetch<T>(path: string, apiKey: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${API_BASE}${path}`);
  url.searchParams.set("key", apiKey);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  let response: Response;
  try {
    response = await fetch(url.toString());
  } catch {
    throw new YoutubeApiError("Couldn't reach the YouTube Data API. Check your internet connection and try again.", 0);
  }

  if (!response.ok) {
    let reason = `YouTube Data API request failed (${response.status}).`;
    try {
      const body = (await response.json()) as { error?: { message?: string; errors?: { reason?: string }[] } };
      const apiMessage = body?.error?.message;
      const apiReason = body?.error?.errors?.[0]?.reason;
      if (response.status === 403 && (apiReason === "quotaExceeded" || /quota/i.test(apiMessage ?? ""))) {
        reason = "YouTube Data API daily quota is used up for this key. Try again after midnight Pacific time, or use a different key.";
      } else if (response.status === 400 && (apiReason === "keyInvalid" || /API key not valid/i.test(apiMessage ?? ""))) {
        reason = "This YouTube Data API key isn't valid. Check it in Settings.";
      } else if (apiMessage) {
        reason = apiMessage;
      }
    } catch {
      // No JSON body — keep the generic message.
    }
    throw new YoutubeApiError(reason, response.status);
  }
  return (await response.json()) as T;
}

export interface ChannelSearchResult {
  channelId: string;
  title: string;
  thumbnailUrl: string;
}

interface SearchListResponse {
  items: { id: { channelId: string }; snippet: { title: string; thumbnails: { default?: { url: string } } } }[];
}

/** "Search a channel" (F-15's happy path) — the one call in this file that genuinely
 * needs the expensive search.list endpoint; see this file's top comment. Returns up to
 * 5 candidate channels (a name like "MrBeast" is rarely unique) rather than guessing the
 * single best match, so the panel can let Istiyak disambiguate. */
export async function searchChannels(apiKey: string, query: string): Promise<ChannelSearchResult[]> {
  const data = await youtubeFetch<SearchListResponse>("/search", apiKey, {
    part: "snippet",
    type: "channel",
    q: query,
    maxResults: "5",
  });
  return data.items.map((item) => ({
    channelId: item.id.channelId,
    title: item.snippet.title,
    thumbnailUrl: item.snippet.thumbnails.default?.url ?? "",
  }));
}

interface ChannelsListResponse {
  items: {
    contentDetails: { relatedPlaylists: { uploads: string } };
    // Istiyak (Round 2, reference screenshot): the panel header needs subscriber/video
    // counts alongside the channel's avatar+name. This is the SAME /channels call
    // already made for the uploads playlist id — just requesting `statistics` too
    // (`part=contentDetails,statistics`) costs nothing extra; YouTube's quota is per
    // call, not per `part` value requested within it.
    statistics?: { subscriberCount?: string; videoCount?: string; hiddenSubscriberCount?: boolean };
    // Round 2 follow-up (Istiyak, closer reference crop: "channel DP, Name, Handle,
    // Post, Followers"): `customUrl` is YouTube's own handle field (e.g. "@laraacostar"
    // for most channels since the 2022-23 handles rollout) — same call again, `snippet`
    // added to `part`, still one request. Note there is no public "verified" field
    // anywhere in the Data API v3 channel schema, so the reference's blue checkmark
    // genuinely can't be replicated with real data — left out rather than faked.
    snippet?: { customUrl?: string };
  }[];
}

interface ChannelDetails {
  uploadsPlaylistId: string | null;
  // undefined (not 0) when the channel owner hid their subscriber count — YouTube
  // still returns the field with `hiddenSubscriberCount: true` and no real number in
  // that case, which this treats the same as "not provided" rather than showing 0.
  subscriberCount?: number;
  videoCount?: number;
  handle?: string;
}

async function getChannelDetails(apiKey: string, channelId: string): Promise<ChannelDetails> {
  const data = await youtubeFetch<ChannelsListResponse>("/channels", apiKey, {
    part: "contentDetails,statistics,snippet",
    id: channelId,
  });
  const item = data.items[0];
  const stats = item?.statistics;
  return {
    uploadsPlaylistId: item?.contentDetails?.relatedPlaylists?.uploads ?? null,
    subscriberCount: !stats?.hiddenSubscriberCount && stats?.subscriberCount !== undefined ? Number(stats.subscriberCount) : undefined,
    videoCount: stats?.videoCount !== undefined ? Number(stats.videoCount) : undefined,
    handle: item?.snippet?.customUrl,
  };
}

interface PlaylistItemsResponse {
  items: {
    snippet: {
      title: string;
      publishedAt: string;
      // CORRECTION (Istiyak: "no progress, even UI broken" — the grid never actually
      // varied): the width/height on these thumbnail objects are NOT the real pixel
      // size of the source video's thumbnail. YouTube's own docs
      // (developers.google.com/youtube/v3/docs/thumbnails) describe each quality name
      // as a FIXED nominal size (medium is always 320x180, etc.) — a vertical Short's
      // thumbnail gets letterboxed/pillarboxed INTO that same fixed box rather than
      // reported at its real shape, so every video's "medium" thumbnail claims roughly
      // the same ~16:9 dimensions regardless of source orientation. These fields are
      // kept only as a last-resort fallback below — `fetchRealThumbnailDims` (this
      // file) is the actual source of truth, the same oEmbed mechanism link-preview.ts
      // already relies on for a single pasted URL.
      thumbnails: {
        medium?: { url: string; width?: number; height?: number };
        default?: { url: string; width?: number; height?: number };
      };
      resourceId: { videoId: string };
    };
  }[];
}

/** The one place YouTube actually reports a thumbnail's REAL pixel dimensions — a
 * free, unauthenticated endpoint (no API key, zero Data API quota cost), the exact
 * mechanism link-preview.ts already uses for a single pasted video URL. Called once
 * per video here, in parallel (see Promise.all below), so this is extra round-trip
 * LATENCY (not quota) for a channel browse — an acceptable trade for a grid that
 * actually reflects real aspect ratios instead of silently never varying. Best-effort:
 * a timeout or failure for one video just means that one card falls back to the
 * fixed-box dimensions above (an assumed 16:9), never blocks the rest of the batch. */
async function fetchRealThumbnailDims(videoId: string): Promise<{ width?: number; height?: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OEMBED_TIMEOUT_MS);
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
      `https://www.youtube.com/watch?v=${videoId}`
    )}&format=json`;
    const res = await fetch(oembedUrl, { signal: controller.signal });
    if (!res.ok) return {};
    const body = (await res.json()) as { thumbnail_width?: number; thumbnail_height?: number };
    return { width: body.thumbnail_width, height: body.thumbnail_height };
  } catch {
    return {};
  } finally {
    clearTimeout(timer);
  }
}

interface VideosListResponse {
  // Istiyak (Round 2, reference screenshot): the stats row shows likes and comments
  // alongside views. We already call `/videos` with `part=statistics` for every video
  // just to get viewCount for the multiplier — that SAME response already carries
  // likeCount/commentCount too (developers.google.com/youtube/v3/docs/videos#statistics),
  // we just weren't reading them. No extra API call, no extra quota cost.
  items: { id: string; statistics?: { viewCount?: string; likeCount?: string; commentCount?: string } }[];
}

export interface OutlierVideo {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  publishedAt: string;
  viewCount: number;
  url: string;
  /** This video's views divided by the MEDIAN views across the batch fetched below
   * (ADR-0100 — Istiyak's own choice: "views vs. that channel's own median", not a
   * views-to-subscriber ratio). 1.0 means exactly at the channel's own typical
   * performance; 3.0 means 3x that channel's usual view count. Always present on every
   * video (not just ones above some cutoff) — the badge itself communicates magnitude,
   * there's no separate is/isn't-an-outlier boolean. */
  multiplier: number;
  /** The actual pixel dimensions of `thumbnailUrl` itself (the same `medium`/`default`
   * image, whichever one was picked) — a Short's thumbnail genuinely is taller than
   * wide, and the frontend uses this to size its box instead of force-cropping
   * everything into one fixed aspect ratio. Omitted when YouTube's response didn't
   * include a size for that image (rare, but the fields are optional upstream). */
  thumbnailWidth?: number;
  thumbnailHeight?: number;
  /** Omitted (not zero) when YouTube's statistics response didn't include this field for
   * a given video — a creator can hide like counts, and comments can be disabled
   * entirely, and both show up as the field simply being absent, not "0". The frontend
   * has to treat missing differently from zero for the same reason. */
  likeCount?: number;
  commentCount?: number;
}

const BASELINE_WINDOW = 25;

export interface ChannelVideosResult {
  videos: OutlierVideo[];
  // Istiyak (Round 2, reference screenshot): the panel header's "X subscribers · Y
  // videos" line. See ChannelDetails's doc comment above for why these are optional.
  subscriberCount?: number;
  videoCount?: number;
  // "@handle" (YouTube's customUrl) for the header's second line — not every channel
  // has claimed one, so this stays undefined rather than a guessed/derived fallback.
  handle?: string;
}

/** Fetches a channel's most recent uploads (via its uploads playlist, NOT search.list —
 * see this file's top comment) with each video's view count, and computes every video's
 * outlier multiplier against the MEDIAN view count of this same fetched batch. The
 * "channel's own baseline" is therefore its last `BASELINE_WINDOW` uploads, not its
 * entire upload history — a deliberate, honestly-scoped approximation (fetching a
 * channel's full history would mean many more quota-expensive calls for a personal
 * research tool), stated here rather than silently implied. Returned in upload-date-
 * descending order (= the "Latest" tab's own order); the frontend re-sorts this SAME
 * list client-side for "Popular" (by viewCount) and "Outliers" (by multiplier) — one
 * fetch covers all three tabs, no extra quota cost from switching between them. */
export async function listChannelVideosWithOutliers(apiKey: string, channelId: string): Promise<ChannelVideosResult> {
  const channelDetails = await getChannelDetails(apiKey, channelId);
  const { uploadsPlaylistId, subscriberCount, videoCount, handle } = channelDetails;
  if (!uploadsPlaylistId) return { videos: [], subscriberCount, videoCount, handle };

  const playlistData = await youtubeFetch<PlaylistItemsResponse>("/playlistItems", apiKey, {
    part: "snippet",
    playlistId: uploadsPlaylistId,
    maxResults: String(BASELINE_WINDOW),
  });
  if (playlistData.items.length === 0) return { videos: [], subscriberCount, videoCount, handle };

  const videoIds = playlistData.items.map((item) => item.snippet.resourceId.videoId);
  const videosData = await youtubeFetch<VideosListResponse>("/videos", apiKey, {
    part: "statistics",
    id: videoIds.join(","),
  });
  const viewCountById = new Map(videosData.items.map((item) => [item.id, Number(item.statistics?.viewCount ?? 0)]));
  // Kept separate from viewCountById above: viewCount always defaults to 0 for the
  // median math, but likeCount/commentCount must stay `undefined` when YouTube omitted
  // them (hidden likes, disabled comments) rather than silently becoming a false "0".
  const statsById = new Map(videosData.items.map((item) => [item.id, item.statistics]));

  // Real thumbnail dimensions (see fetchRealThumbnailDims's doc comment above for why
  // this is necessary at all) — fetched in parallel for the whole batch so this adds
  // one round-trip's worth of latency, not N sequential ones.
  const realDimsById = new Map<string, { width?: number; height?: number }>();
  await Promise.all(
    videoIds.map(async (id) => {
      realDimsById.set(id, await fetchRealThumbnailDims(id));
    })
  );

  const sortedViews = [...viewCountById.values()].sort((a, b) => a - b);
  const mid = Math.floor(sortedViews.length / 2);
  const median = sortedViews.length === 0 ? 0 : sortedViews.length % 2 === 0 ? (sortedViews[mid - 1] + sortedViews[mid]) / 2 : sortedViews[mid];

  const videos = playlistData.items.map((item) => {
    const videoId = item.snippet.resourceId.videoId;
    const viewCount = viewCountById.get(videoId) ?? 0;
    const stats = statsById.get(videoId);
    // thumbnailUrl itself still comes from the list API (no reason to change a working
    // image URL) — only the DIMENSIONS prefer the real oEmbed values, falling back to
    // the fixed-box list-API size only when oEmbed timed out/failed for this video.
    const thumb = item.snippet.thumbnails.medium ?? item.snippet.thumbnails.default;
    const realDims = realDimsById.get(videoId);
    return {
      videoId,
      title: item.snippet.title,
      thumbnailUrl: thumb?.url ?? "",
      thumbnailWidth: realDims?.width ?? thumb?.width,
      thumbnailHeight: realDims?.height ?? thumb?.height,
      publishedAt: item.snippet.publishedAt,
      viewCount,
      // `undefined` stays `undefined` here (not `?? 0`) — see OutlierVideo's doc
      // comment above on why missing must read differently from a real zero.
      likeCount: stats?.likeCount !== undefined ? Number(stats.likeCount) : undefined,
      commentCount: stats?.commentCount !== undefined ? Number(stats.commentCount) : undefined,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      // median === 0 would only happen if every fetched video somehow has 0 views
      // (brand-new channel, or statistics genuinely hidden) — falls back to 0 rather
      // than dividing by zero into Infinity/NaN badges.
      multiplier: median > 0 ? viewCount / median : 0,
    };
  });
  return { videos, subscriberCount, videoCount, handle };
}
