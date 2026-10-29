"use client";

import * as React from "react";
import { Search, X, ChevronLeft, Plus, Flame, Clock, TrendingUp, TrendingDown, Minus, Loader2, Eye, Heart, MessageCircle, Check } from "lucide-react";
import { ApiError } from "@/lib/api";
import { searchYoutubeChannels, listChannelVideos, type ChannelSearchResult, type OutlierVideo } from "@/lib/outliers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Outliers research panel (F-15/TF-09, ADR-0100) — a floating overlay on the canvas, not
// a Dialog (components/ui/dialog.tsx is explicitly sized/scoped for the two small
// reference modals it already serves — About, Keyboard shortcuts — and this needs real
// room for a search box, tabs, and a scrollable video grid). Two steps, kept as simple
// local state rather than its own store: (1) search for a channel by name, (2) browse
// that channel's videos across three tabs.
//
// Round 1 UX #8 (Istiyak: "Outliers panel should reset — not show stale last search +
// show a recent search section") reverses this file's earlier design, where state was
// deliberately left untouched across opens/closes. Now: closing the panel always resets
// its live search/browse state, so reopening it always starts fresh — but a channel
// just explored isn't gone, it's one click away from the panel's own "Recent searches"
// list (persisted in localStorage, independent of this live state, shown on the blank
// default screen). That combination — reset the working state, but remember the
// history — replaces "leave the whole panel exactly as I last left it" with something
// that doesn't surprise Istiyak on reopen while still saving him from retyping a search
// he just ran.
//
// Quick-add deliberately does NOT build its own node-creation logic — it calls back
// into the EXISTING `addVideoNodeFromUrl` board-store action (via `onQuickAdd`, passed
// in from page.tsx, which has the position/board context this panel doesn't) exactly
// the same way pasting a YouTube URL onto the canvas already does, so a quick-added
// video gets a real oEmbed-fetched title/thumbnail, not whatever this panel's own
// (cheaper, playlistItems-sourced) data happened to show.
//
// Round 2 (Istiyak, reference screenshot): replaced the old instant per-card "+" with
// select-then-bulk-add — clicking a card's thumbnail toggles it into a selection set,
// and a single "Add N Selected" action (only shown once something's selected) adds them
// all at once. `onQuickAdd` takes an array for this reason: page.tsx needs to see the
// WHOLE batch together to fan the new nodes out diagonally (same convention
// `addMindmapNode` already uses in board-store.ts) instead of stacking every selected
// video on the exact same canvas position, which is what would happen if this just
// called a single-URL callback once per selected video.

type Tab = "latest" | "popular" | "outliers";

const TABS: Array<{ key: Tab; label: string; icon: React.ElementType }> = [
  { key: "latest", label: "Latest", icon: Clock },
  { key: "popular", label: "Popular", icon: Flame },
  { key: "outliers", label: "Outliers", icon: TrendingUp },
];

// Paired with an Eye icon in the grid card below (Round 2, matching the icon+number
// reference Istiyak shared) rather than spelling out "views" every time — the icon
// already says what's being counted, so the bare count reads cleanly next to it.
function formatViewCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

// Round 2 (Istiyak: reference screenshot of a similar outliers tool) — a three-tier
// color+icon scheme instead of the old plain "≥2 is green, everything else is the same
// gray" badge, which never actually flagged an underperforming video at all. Tiers are
// relative to THIS channel's own median (see youtube-api.ts's `multiplier` doc comment):
// clearly below it reads as a caution signal, clearly above it reads as a standout, and
// the (wide) middle stays neutral rather than forcing every video into "good" or "bad."
function multiplierTier(multiplier: number): { Icon: React.ElementType; className: string } {
  if (multiplier < 1) {
    return { Icon: TrendingDown, className: "bg-background-danger-muted text-text-danger" };
  }
  if (multiplier >= 1.5) {
    return { Icon: Flame, className: "bg-background-success-muted text-text-success" };
  }
  return { Icon: Minus, className: "bg-background-surface/90 text-text-muted" };
}

// Round 1 UX #8's "recent search" half — plain localStorage, same reasoning as every
// other client-only persistence choice in this local-first app. Independent of the
// panel's own live React state (which now resets on close, see OutliersPanel below),
// and independent of any board: a channel searched from one board shows up as "recent"
// from any other board too, since there's nothing board-specific about having looked at
// a YouTube channel.
const RECENT_CHANNELS_KEY = "brainy:outliers:recentChannels";
const MAX_RECENT_CHANNELS = 6;

function loadRecentChannels(): ChannelSearchResult[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_CHANNELS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is ChannelSearchResult =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as ChannelSearchResult).channelId === "string" &&
        typeof (item as ChannelSearchResult).title === "string"
    );
  } catch {
    // Best-effort — a corrupted or inaccessible localStorage entry just means no
    // recent-search section shows, not a crash.
    return [];
  }
}

function saveRecentChannels(channels: ChannelSearchResult[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RECENT_CHANNELS_KEY, JSON.stringify(channels));
  } catch {
    // Best-effort, same reasoning as loadRecentChannels above.
  }
}

// Round 1 bug #10 (Istiyak: "Some channel avatar images show a broken-image icon in
// the Outliers panel"). The backend (youtube-api.ts) already sends "" when YouTube
// genuinely has no avatar for a channel — the `thumbnailUrl ?` check below already
// covers that case correctly. This covers the OTHER case: a real URL that's present
// but fails to actually load in the browser (a dead/expired avatar link, a transient
// network hiccup) — previously nothing caught that, so the browser just rendered its
// own native broken-image glyph instead of falling back to the same placeholder used
// for "no avatar at all." onError flips this to the placeholder the same way a missing
// URL already does. Extracted out of ChannelRow (Round 2) so the panel's own header
// can reuse the exact same avatar+fallback logic at a larger size, rather than
// duplicating the onError dance for a second time.
function ChannelAvatar({ thumbnailUrl, size = "size-8" }: { thumbnailUrl: string; size?: string }) {
  const [imageFailed, setImageFailed] = React.useState(false);
  return thumbnailUrl && !imageFailed ? (
    // eslint-disable-next-line @next/next/no-img-element -- an external YouTube-hosted
    // thumbnail, not a local/optimizable asset.
    <img src={thumbnailUrl} alt="" className={cn(size, "shrink-0 rounded-full")} onError={() => setImageFailed(true)} />
  ) : (
    <span className={cn(size, "shrink-0 rounded-full bg-background-muted")} aria-hidden="true" />
  );
}

// Shared row markup for a channel, whether it came from a fresh search or the "Recent
// searches" list below — both need the exact same avatar+title button, so this is the
// one place that markup lives.
function ChannelRow({
  channel,
  onSelect,
}: {
  channel: ChannelSearchResult;
  onSelect: (channel: ChannelSearchResult) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(channel)}
      className="flex w-full items-center gap-2 rounded-md p-1.5 text-left hover:bg-background-muted"
    >
      <ChannelAvatar thumbnailUrl={channel.thumbnailUrl} />
      <span className="truncate text-sm text-text-primary">{channel.title}</span>
    </button>
  );
}

export function OutliersPanel({
  open,
  onOpenChange,
  onQuickAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Adds a video node for each URL to the current board — see this file's top comment
   * for why this panel doesn't create the nodes itself, and why this takes the whole
   * selected batch at once rather than one URL at a time. */
  onQuickAdd: (urls: string[]) => void;
}) {
  const [query, setQuery] = React.useState("");
  const [isSearching, setIsSearching] = React.useState(false);
  const [searchError, setSearchError] = React.useState<string | null>(null);
  const [channelResults, setChannelResults] = React.useState<ChannelSearchResult[] | null>(null);

  const [selectedChannel, setSelectedChannel] = React.useState<ChannelSearchResult | null>(null);
  const [videos, setVideos] = React.useState<OutlierVideo[] | null>(null);
  // Round 2 (Istiyak, reference screenshot) — the panel header's "X subscribers · Y
  // videos" line. Separate from `selectedChannel` (ChannelSearchResult, from the
  // search step) since subscriber/video counts only come back once a channel is
  // actually selected and its videos are fetched (see youtube-api.ts).
  const [channelSubscriberCount, setChannelSubscriberCount] = React.useState<number | undefined>(undefined);
  const [channelVideoCount, setChannelVideoCount] = React.useState<number | undefined>(undefined);
  const [channelHandle, setChannelHandle] = React.useState<string | undefined>(undefined);
  const [isLoadingVideos, setIsLoadingVideos] = React.useState(false);
  const [videosError, setVideosError] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<Tab>("latest");
  // Round 2 select-then-bulk-add — a Set of videoIds, independent of which tab is
  // active (Latest/Popular/Outliers are just three sort orders over the SAME fetched
  // videos, so a selection made on one tab should still hold if you switch tabs before
  // hitting "Add Selected").
  const [selectedVideoIds, setSelectedVideoIds] = React.useState<Set<string>>(new Set());

  // Round 1 UX #8 — loaded once via a lazy initializer (runs on the client during
  // hydration; the `typeof window` guard inside keeps it SSR-safe), not an effect: this
  // component stays mounted while `open` is false (it just renders null — see the early
  // return below), so an effect gated on mount alone would never re-read a change made
  // by another open/close cycle anyway, and a plain lazy initializer is simpler here.
  const [recentChannels, setRecentChannels] = React.useState<ChannelSearchResult[]>(() => loadRecentChannels());

  // The other half of Round 1 UX #8: closing the panel always resets its live
  // search/browse state, so reopening it starts fresh instead of silently showing
  // whatever was last searched, however long ago (reverses this file's earlier
  // "intentionally NOT reset" design — see this file's top comment). recentChannels
  // above is deliberately NOT touched here — that's the persisted history this same
  // bug asked for, the replacement for "leave the whole panel as I last left it."
  React.useEffect(() => {
    if (open) return;
    setQuery("");
    setIsSearching(false);
    setSearchError(null);
    setChannelResults(null);
    setSelectedChannel(null);
    setVideos(null);
    setChannelSubscriberCount(undefined);
    setChannelVideoCount(undefined);
    setChannelHandle(undefined);
    setIsLoadingVideos(false);
    setVideosError(null);
    setActiveTab("latest");
    setSelectedVideoIds(new Set());
  }, [open]);

  async function handleSearch(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    setIsSearching(true);
    setSearchError(null);
    setChannelResults(null);
    try {
      const results = await searchYoutubeChannels(trimmed);
      setChannelResults(results);
    } catch (err) {
      setSearchError(errorMessage(err, "Couldn't search YouTube. Try again."));
    } finally {
      setIsSearching(false);
    }
  }

  async function handleSelectChannel(channel: ChannelSearchResult) {
    setSelectedChannel(channel);
    setActiveTab("latest");
    setVideos(null);
    setChannelSubscriberCount(undefined);
    setChannelVideoCount(undefined);
    setChannelHandle(undefined);
    setVideosError(null);
    setIsLoadingVideos(true);
    setSelectedVideoIds(new Set()); // a prior channel's selection can't carry over

    // Round 1 UX #8 — remember this channel for the panel's own "Recent searches"
    // section: most-recent-first, de-duped by channelId, capped so the list stays a
    // quick glance rather than a growing log.
    setRecentChannels((prev) => {
      const next = [channel, ...prev.filter((c) => c.channelId !== channel.channelId)].slice(0, MAX_RECENT_CHANNELS);
      saveRecentChannels(next);
      return next;
    });

    try {
      const result = await listChannelVideos(channel.channelId);
      setVideos(result.videos);
      setChannelSubscriberCount(result.subscriberCount);
      setChannelVideoCount(result.videoCount);
      setChannelHandle(result.handle);
    } catch (err) {
      setVideosError(errorMessage(err, "Couldn't load this channel's videos. Try again."));
    } finally {
      setIsLoadingVideos(false);
    }
  }

  function handleBackToSearch() {
    setSelectedChannel(null);
    setVideos(null);
    setChannelSubscriberCount(undefined);
    setChannelVideoCount(undefined);
    setChannelHandle(undefined);
    setVideosError(null);
    setSelectedVideoIds(new Set());
  }

  function toggleVideoSelected(videoId: string) {
    setSelectedVideoIds((prev) => {
      const next = new Set(prev);
      if (next.has(videoId)) next.delete(videoId);
      else next.add(videoId);
      return next;
    });
  }

  function handleAddSelected() {
    if (!videos) return;
    const urls = videos.filter((v) => selectedVideoIds.has(v.videoId)).map((v) => v.url);
    if (urls.length === 0) return;
    onQuickAdd(urls);
    setSelectedVideoIds(new Set());
  }

  // Latest = server's own upload-date order, as-is; Popular/Outliers just re-sort the
  // SAME already-fetched list client-side — one fetch per channel selection covers
  // every tab (lib/youtube-api.ts's own top comment explains why this matters for
  // quota), so switching tabs here never triggers another network call.
  const sortedVideos = React.useMemo(() => {
    if (!videos) return null;
    if (activeTab === "popular") return [...videos].sort((a, b) => b.viewCount - a.viewCount);
    if (activeTab === "outliers") return [...videos].sort((a, b) => b.multiplier - a.multiplier);
    return videos;
  }, [videos, activeTab]);

  if (!open) return null;

  return (
    <div
      className="pointer-events-auto absolute top-4 right-4 bottom-4 z-20 flex w-96 flex-col overflow-hidden rounded-xl border border-border-default bg-background-surface shadow-md"
      role="dialog"
      aria-label="Outliers research panel"
    >
      {/* Istiyak (Round 3, "Dope Motions"/"Lara Acosta" reference crops): name + handle
          sit on the SAME line (name bold, handle muted right after it, not stacked),
          and the stats line below is compact with the numbers themselves bold —
          "670.0K subscribers · 552 videos" reads as two highlighted numbers plus plain
          labels, not a single flat sentence. Two text lines total under the avatar,
          matching the reference's tight 2-line block. No verified checkmark next to
          the name: the Data API v3 channel schema has no public "verified" field at
          all, so there's no real data to back one — left out rather than faked.
          Round 4 — Istiyak: "separate this above Profile header with a divider and let
          Segment control, button, and videos sit on body area with proper spacing." So
          this ONE border-b is back (profile header vs. everything below it as two
          distinct sections), but the tabs/add-button blocks below stay border-free —
          that was the "three bordered sections" look Round 2 deliberately removed, and
          this round only asks for the outer split, not those inner lines back too. */}
      <div
        className={cn(
          "flex shrink-0 items-start justify-between gap-2 border-b border-border-muted px-3 py-2.5",
          !selectedChannel && "items-center"
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          {selectedChannel ? (
            <button
              type="button"
              onClick={handleBackToSearch}
              aria-label="Back to channel search"
              title="Back to channel search"
              className="shrink-0 self-center rounded p-0.5 text-text-muted hover:bg-background-muted hover:text-text-primary"
            >
              <ChevronLeft className="size-3.5" aria-hidden="true" />
            </button>
          ) : null}
          {selectedChannel ? <ChannelAvatar thumbnailUrl={selectedChannel.thumbnailUrl} size="size-10" /> : null}
          <div className="min-w-0">
            <div className="flex min-w-0 items-baseline gap-1.5">
              <h2 className="min-w-0 truncate text-sm font-semibold text-text-primary">
                {selectedChannel ? selectedChannel.title : "Outliers research"}
              </h2>
              {/* Istiyak: "slight UI jumbling after skeleton loading changed to actual
                  data" — the skeleton bar was a bare h-3 (12px) box, but text-xs content
                  sits in a 16px line box, so the row's own height changed by 4px the
                  moment the real handle replaced it. Both branches now render inside the
                  SAME h-4 flex container (loading or not), so the swap only changes
                  what's drawn inside a already-fixed-height row, not the row's height
                  itself. */}
              {selectedChannel && (channelHandle || isLoadingVideos) ? (
                <span className="flex h-4 shrink-0 items-center truncate text-xs text-text-muted">
                  {channelHandle ?? (
                    <span className="h-3 w-16 animate-pulse rounded bg-background-muted" aria-hidden="true" />
                  )}
                </span>
              ) : null}
            </div>
            {selectedChannel &&
            (channelSubscriberCount !== undefined || channelVideoCount !== undefined || isLoadingVideos) ? (
              <p className="mt-0.5 flex h-4 items-center truncate text-xs text-text-muted">
                {channelSubscriberCount !== undefined || channelVideoCount !== undefined ? (
                  <>
                    {channelSubscriberCount !== undefined ? (
                      <>
                        <span className="font-semibold text-text-primary">{formatViewCount(channelSubscriberCount)}</span>
                        {" "}subscribers
                      </>
                    ) : null}
                    {channelSubscriberCount !== undefined && channelVideoCount !== undefined ? " · " : null}
                    {channelVideoCount !== undefined ? (
                      <>
                        <span className="font-semibold text-text-primary">{formatViewCount(channelVideoCount)}</span> videos
                      </>
                    ) : null}
                  </>
                ) : (
                  <span className="h-3 w-28 animate-pulse rounded bg-background-muted" aria-hidden="true" />
                )}
              </p>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label="Close"
          title="Close"
          className="shrink-0 rounded p-0.5 text-text-muted hover:bg-background-muted hover:text-text-primary"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      </div>

      {!selectedChannel ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
          <form onSubmit={handleSearch} className="flex gap-1.5">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search a YouTube channel…"
              className="nodrag"
            />
            <Button type="submit" variant="secondary" size="sm" disabled={isSearching} className="shrink-0">
              {isSearching ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Search className="size-3.5" aria-hidden="true" />}
            </Button>
          </form>

          {searchError ? <p className="text-sm text-text-danger">{searchError}</p> : null}

          {channelResults && channelResults.length === 0 ? (
            // F-15: "channel not found" must read as distinct from "this channel has
            // zero outliers" (the OTHER empty state, below, once a channel IS
            // selected) — this one names the search term that came back empty.
            <p className="text-sm text-text-muted">No channels found for &ldquo;{query.trim()}&rdquo;.</p>
          ) : null}

          {channelResults && channelResults.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {channelResults.map((channel) => (
                <li key={channel.channelId}>
                  <ChannelRow channel={channel} onSelect={(c) => void handleSelectChannel(c)} />
                </li>
              ))}
            </ul>
          ) : null}

          {!channelResults && !isSearching && !searchError ? (
            recentChannels.length > 0 ? (
              // Round 1 UX #8's "recent search" section — shown on the panel's blank
              // default screen (no active search yet this time it's open), so a
              // channel explored earlier is one click away instead of requiring a
              // retyped search, even though the live search state above it resets on
              // every close.
              <div className="flex flex-col gap-1.5">
                <h3 className="px-1.5 text-xs font-medium text-text-muted">Recent searches</h3>
                <ul className="flex flex-col gap-1">
                  {recentChannels.map((channel) => (
                    <li key={channel.channelId}>
                      <ChannelRow channel={channel} onSelect={(c) => void handleSelectChannel(c)} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-text-muted">Search a channel to browse its Latest, Popular, and Outlier videos.</p>
            )
          ) : null}
        </div>
      ) : (
        <>
          {/* Istiyak (Round 2, reference screenshot): "Segmented control rather than
              tabs" — a pill-shaped track with a solid pill behind whichever option is
              active, replacing the old underline-style tabs (which read as a page's
              section tabs, not a 3-way toggle over the same list). Round 4: pt-3
              gives this its own breathing room below the header's divider instead of
              sitting flush against it. */}
          <div className="shrink-0 px-3 pt-3 pb-2">
            <div className="flex gap-0.5 rounded-lg bg-background-muted p-0.5">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 text-xs font-medium transition-colors",
                    activeTab === tab.key
                      ? "bg-background-surface text-text-primary shadow-sm"
                      : "text-text-muted hover:text-text-secondary"
                  )}
                >
                  <tab.icon className="size-3" aria-hidden="true" />
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Round 2 select-then-bulk-add — Istiyak: "Keep this Add button constant.
              Just enable disable. Otherwise UI is jumbling." Was conditionally
              mounted/unmounted on selectedVideoIds.size, which shifted the whole grid
              below up/down every time a selection changed. Now always occupies the
              same space; only its disabled state (and label) change. */}
          <div className="shrink-0 px-3 pb-2">
            <Button
              type="button"
              size="sm"
              className="nodrag w-full"
              disabled={selectedVideoIds.size === 0}
              onClick={handleAddSelected}
            >
              <Plus className="size-3.5" aria-hidden="true" />
              {selectedVideoIds.size > 0 ? `Add ${selectedVideoIds.size} Selected` : "Select videos to add"}
            </Button>
          </div>

          {/* Round 4 — Istiyak: "Add the proper breathing space top and bottom also."
              pt-3 gives the first video row room below the button above it; pb-4 gives
              the LAST row a bit more than the usual p-3 before the panel's own rounded
              bottom edge, so the list doesn't read as cut off flush against it. */}
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 pt-3 pb-4">
            {isLoadingVideos ? <p className="text-sm text-text-muted">Loading…</p> : null}
            {videosError ? <p className="text-sm text-text-danger">{videosError}</p> : null}
            {/* "Zero outliers" / "this channel has no videos" — distinct from the
                channel-not-found state above, which never gets this far. */}
            {sortedVideos && sortedVideos.length === 0 ? (
              <p className="text-sm text-text-muted">This channel has no videos to show.</p>
            ) : null}
            {/* Istiyak (Round 2): "Videos not captured according to aspect ratios" +
                "see the difference how current tool is rendering and how poppy.ai is
                doing that" — a cramped single-column list with a tiny fixed-height
                thumbnail never reads as image-forward, and fixed height meant a Short's
                real portrait shape only ever showed up as a few extra pixels of width,
                easy to miss entirely. This is a straight rebuild into a 2-column image
                grid (poppy.ai-style): each card's thumbnail is full-card-width with its
                OWN real aspect ratio driving its height, so a vertical Short is visibly
                tall and a normal upload is visibly wide, title sits below in up to two
                lines, and the outlier multiplier/quick-add move onto the thumbnail
                itself as small overlay chips rather than crowding the text line. */}
            {sortedVideos && sortedVideos.length > 0 ? (
              <div className="grid grid-cols-2 gap-2.5">
                {sortedVideos.map((video) => {
                  // Same sanity clamp as the canvas video-node (0.4–2.5, roughly
                  // ultra-tall Shorts through ultra-wide) so missing/corrupt data falls
                  // back to an assumed 16:9 card shape rather than a sliver or a huge
                  // strip — a grid card has no sane "fixed box" fallback the way the old
                  // list row did, so the fallback has to be a plausible ratio instead.
                  const thumbAspectRatio =
                    video.thumbnailWidth && video.thumbnailHeight && video.thumbnailHeight > 0
                      ? video.thumbnailWidth / video.thumbnailHeight
                      : null;
                  const hasReliableAspectRatio = thumbAspectRatio !== null && thumbAspectRatio >= 0.4 && thumbAspectRatio <= 2.5;
                  const displayAspectRatio = hasReliableAspectRatio ? thumbAspectRatio : 16 / 9;

                  const isSelected = selectedVideoIds.has(video.videoId);

                  // Istiyak: "Outlier score not showing anywhere" — this used to only
                  // compute (and therefore only render) on the Outliers tab, but the
                  // multiplier is meaningful regardless of which tab a video happens to
                  // be sorted into right now, and the reference shows it on every card
                  // unconditionally. Always on.
                  const tier = multiplierTier(video.multiplier);

                  // Istiyak (Round 2, close-up reference screenshot): every reference
                  // card has NO separate text area below the image — the title and
                  // stats sit directly ON the thumbnail, over a dark gradient scrim for
                  // legibility against any image. Rebuilt the same way here. The image
                  // itself stays a `<button>` (click anywhere on it to toggle
                  // selection), but the title can't live inside that button — an `<a>`
                  // nested in a `<button>` is invalid HTML — so it's a separate,
                  // absolutely-positioned sibling stacked on top instead, independently
                  // clickable to open the video while the image behind it still selects.
                  return (
                    <div
                      key={video.videoId}
                      className={cn(
                        "group/card relative w-full overflow-hidden rounded-lg bg-background-muted",
                        isSelected && "ring-2 ring-border-focus"
                      )}
                      style={{ aspectRatio: displayAspectRatio }}
                    >
                      <button
                        type="button"
                        onClick={() => toggleVideoSelected(video.videoId)}
                        aria-pressed={isSelected}
                        aria-label={isSelected ? `Deselect ${video.title}` : `Select ${video.title}`}
                        title={isSelected ? "Deselect" : "Select"}
                        className="nodrag absolute inset-0"
                      >
                        {video.thumbnailUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- an
                          // external YouTube-hosted thumbnail, not a local/optimizable
                          // asset.
                          <img src={video.thumbnailUrl} alt="" className="size-full object-cover" />
                        ) : null}
                      </button>

                      {/* Istiyak (Round 2, close-up reference screenshot): a hover-only
                          centered "+" for adding just THIS one video instantly, without
                          going through select-then-bulk-add at all. `opacity` and
                          `pointer-events` are toggled TOGETHER by the same group-hover/
                          group-focus-within variants (not opacity alone) — otherwise
                          this invisible-but-still-`pointer-events-auto` button would
                          silently swallow every click on the selection button
                          underneath, even while you can't see it's there. */}
                      <button
                        type="button"
                        onClick={() => onQuickAdd([video.url])}
                        aria-label={`Quick add ${video.title} to board`}
                        title="Quick add to board"
                        className={cn(
                          "nodrag absolute top-1/2 left-1/2 flex size-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center",
                          "rounded-full bg-black/60 text-white shadow-lg",
                          "pointer-events-none opacity-0 transition-opacity",
                          "group-hover/card:pointer-events-auto group-hover/card:opacity-100",
                          "group-focus-within/card:pointer-events-auto group-focus-within/card:opacity-100",
                          "hover:bg-black/75"
                        )}
                      >
                        <Plus className="size-5" aria-hidden="true" />
                      </button>

                      {/* Gradient scrim — always on, not hover-only, since the title/
                          stats below need to stay legible over an arbitrary thumbnail
                          at rest, exactly like the reference. */}
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />

                      {tier ? (
                        <span
                          className={cn(
                            "pointer-events-none absolute top-1 left-1 flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium shadow-sm",
                            tier.className
                          )}
                        >
                          <tier.Icon className="size-3" aria-hidden="true" />
                          {video.multiplier.toFixed(1)}×
                        </span>
                      ) : null}

                      {/* Round 2 select-then-bulk-add (replaces the old instant "+" —
                          see this file's top comment) — an empty ring when unselected,
                          a filled checkmark once picked, same visual language as the
                          reference screenshot's selection circle. Purely a visual
                          indicator (the button behind it already covers the whole
                          card), so it doesn't need its own click handler. */}
                      <span
                        className={cn(
                          "pointer-events-none absolute top-1 right-1 flex size-5 items-center justify-center rounded-full shadow-sm",
                          isSelected
                            ? "bg-background-accent text-text-on-accent"
                            : "bg-black/30 ring-1 ring-inset ring-white/60"
                        )}
                      >
                        {isSelected ? <Check className="size-3.5" aria-hidden="true" /> : null}
                      </span>

                      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-0.5 p-1.5">
                        <a
                          href={video.url}
                          target="_blank"
                          rel="noreferrer"
                          className="nodrag pointer-events-auto line-clamp-2 text-xs leading-snug font-medium text-white hover:underline"
                          title={video.title}
                        >
                          {video.title}
                        </a>
                        <span className="flex items-center gap-2 text-[11px] text-white/85">
                          <span className="flex items-center gap-0.5">
                            <Eye className="size-3" aria-hidden="true" />
                            {formatViewCount(video.viewCount)}
                          </span>
                          {/* Istiyak (Round 2, reference screenshot): likes/comments
                              alongside views. Each stat is only shown when YouTube
                              actually reported it — omitted (not "0") means a creator
                              hid likes or disabled comments on that specific video, and
                              showing a confident zero there would be a false claim. */}
                          {video.likeCount !== undefined ? (
                            <span className="flex items-center gap-0.5">
                              <Heart className="size-3" aria-hidden="true" />
                              {formatViewCount(video.likeCount)}
                            </span>
                          ) : null}
                          {video.commentCount !== undefined ? (
                            <span className="flex items-center gap-0.5">
                              <MessageCircle className="size-3" aria-hidden="true" />
                              {formatViewCount(video.commentCount)}
                            </span>
                          ) : null}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
