// Outliers research panel (F-15/TF-09, ADR-0100) — plain typed wrappers around the two
// read-only lookups routes/outliers.ts exposes. Both are ordinary short GETs (no media
// pipeline, no LLM call behind them), so these go through `api.get` directly rather than
// needing their own timeout helper the way manual-assemble/generate-mindmap do.

import { api } from "@/lib/api";

export interface ChannelSearchResult {
  channelId: string;
  title: string;
  thumbnailUrl: string;
}

export interface OutlierVideo {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  publishedAt: string;
  viewCount: number;
  url: string;
  multiplier: number;
  // Real pixel dimensions of thumbnailUrl itself — a Short's thumbnail is genuinely
  // taller than wide; see this field's doc comment in the server's youtube-api.ts.
  thumbnailWidth?: number;
  thumbnailHeight?: number;
  // Undefined (not 0) when YouTube hid likes or disabled comments for this video — see
  // the server's youtube-api.ts doc comment on why that distinction matters here.
  likeCount?: number;
  commentCount?: number;
}

export interface ChannelVideosResult {
  videos: OutlierVideo[];
  // Round 2 (Istiyak, reference screenshot): the panel header's "X subscribers · Y
  // videos" line. Undefined (not 0) when YouTube didn't report it — see the server's
  // youtube-api.ts doc comment (a creator can hide their subscriber count).
  subscriberCount?: number;
  videoCount?: number;
  // "@handle" (YouTube's customUrl) for the header's second line — not every channel
  // has claimed one.
  handle?: string;
}

export async function searchYoutubeChannels(query: string): Promise<ChannelSearchResult[]> {
  const { channels } = await api.get<{ channels: ChannelSearchResult[] }>(
    `/api/youtube/search-channels?q=${encodeURIComponent(query)}`
  );
  return channels;
}

export async function listChannelVideos(channelId: string): Promise<ChannelVideosResult> {
  return api.get<ChannelVideosResult>(`/api/youtube/channel/${channelId}/videos`);
}
