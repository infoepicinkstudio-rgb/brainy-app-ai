import * as React from "react";
import { Copy, ExternalLink, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { RIBBON_SOLID_CLASSES, type NodeAccent } from "@/components/canvas/node-chrome";

// Shared header row for every node type: icon + truncated label (left), a Duplicate
// icon and a single "open/edit" action icon (right). Consolidating this in one place
// is what makes every node type's header actually consistent down to spacing/icon-size
// rather than four near-identical hand-rolled copies drifting apart over time.
//
// ADR-0075 (restored — Istiyak, Phase 3 close-out testing: "3 dots came back again...
// Link card header editable which we denied also came back"): the 3-dot menu
// (node-menu.tsx) is gone from this component entirely, and so is the inline
// click-to-edit label (`onLabelCommit`) — its only user was the link card, which
// ADR-0075 explicitly stops making editable in the header ("link card header should
// not be editable avoid the complexity"). What used to be a hardcoded "open" icon
// button is now a generic hover-only action slot (`onOpen`/`openLabel`/`actionIcon`,
// defaulting to `ExternalLink`) reused by the text card for its own "Edit" affordance
// (`Pencil`) instead. `onDelete` is gone too — deletion lives exclusively in
// NodeChrome's own separate hover-only "X" and the Delete key, never in this header.
//
// One deliberate addition ADR-0075's own spec didn't anticipate: Duplicate (Phase 3,
// F-07) didn't exist as a concept when that ADR was decided, and its only current home
// was the now-deleted menu. Rather than resurrecting a menu for one item, it gets its
// own small always-hover-revealed icon button here — the exact same pattern already
// used for the group card's own Duplicate/Ungroup icons (group-node.tsx), not a new
// convention.
export function NodeHeader({
  icon: Icon,
  label,
  onOpen,
  openLabel,
  actionIcon: ActionIcon = ExternalLink,
  onDuplicate,
  spinning,
  faviconUrl,
  iconBadge,
  accent = "neutral",
}: {
  icon?: LucideIcon;
  label: string;
  onOpen?: () => void;
  openLabel?: string;
  /** The hover-only action button's icon — defaults to `ExternalLink` ("Open"); the
   * text card passes `Pencil` for its own "Edit" affordance instead. Ignored when
   * `onOpen` isn't provided. */
  actionIcon?: LucideIcon;
  /** Duplication (Phase 3, F-07) — its own hover-only icon button, not a menu item;
   * see this file's top comment for why. */
  onDuplicate?: () => void;
  /** Shows a small spin animation on the icon — used for the video card's "loading" status. */
  spinning?: boolean;
  /** An external favicon URL to show instead of `icon`, when available. Falls back to
   * `icon` automatically if the image fails to load. */
  faviconUrl?: string;
  /** Round 4/5 (re-matching the reference cards): the Text card's reference shows its
   * icon inside a small FILLED chip rather than a bare line-icon on the ribbon — and
   * round 5 extends this to YouTube's icon too, now that both are the "solid icon"
   * types the reference draws a distinct badge for (Istiyak: "Text should be 'T' block
   * solid icon" — "etc"). Opt-in per card; the other types' plain `ribbonFg`-colored
   * icons already match their reference closely enough without one. */
  iconBadge?: boolean;
  /** Which accent's `ribbonSolid` color fills the `iconBadge` chip — ignored otherwise. */
  accent?: NodeAccent;
}) {
  const [failedFaviconUrl, setFailedFaviconUrl] = React.useState<string | undefined>(undefined);
  const showFavicon = Boolean(faviconUrl) && faviconUrl !== failedFaviconUrl;

  return (
    <div className="flex w-full min-w-0 items-center justify-between gap-1.5">
      <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium">
        {showFavicon ? (
          // eslint-disable-next-line @next/next/no-img-element -- an external favicon
          // URL (fetched server-side for its address only, ADR-0067), not a local/
          // optimizable asset.
          <img
            src={faviconUrl}
            alt=""
            className="size-3 shrink-0 rounded-sm"
            onError={() => setFailedFaviconUrl(faviconUrl)}
          />
        ) : Icon && iconBadge ? (
          <span className={cn("flex size-4 shrink-0 items-center justify-center rounded", RIBBON_SOLID_CLASSES[accent])}>
            <Icon className={cn("size-2.5 fill-current text-text-on-accent", spinning && "animate-spin")} aria-hidden="true" />
          </span>
        ) : Icon ? (
          <Icon className={cn("size-3 shrink-0", spinning && "animate-spin")} aria-hidden="true" />
        ) : null}
        <span className="truncate" title={label}>
          {label}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-0.5">
        {onDuplicate ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDuplicate();
            }}
            aria-label="Duplicate"
            title="Duplicate"
            className="nodrag rounded p-0.5 opacity-0 transition-opacity duration-fast hover:bg-black/10 group-hover:opacity-100 group-focus-within:opacity-100"
          >
            <Copy className="size-3" aria-hidden="true" />
          </button>
        ) : null}
        {onOpen ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpen();
            }}
            aria-label={openLabel ?? "Open"}
            title={openLabel ?? "Open"}
            className="nodrag rounded p-0.5 opacity-0 transition-opacity duration-fast hover:bg-black/10 group-hover:opacity-100 group-focus-within:opacity-100"
          >
            <ActionIcon className="size-3" aria-hidden="true" />
          </button>
        ) : null}
      </span>
    </div>
  );
}
