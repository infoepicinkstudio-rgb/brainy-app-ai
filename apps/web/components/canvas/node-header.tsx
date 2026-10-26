import * as React from "react";
import { ExternalLink, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { RIBBON_SOLID_CLASSES, type NodeAccent } from "@/components/canvas/node-chrome";

// Shared header row for every node type: icon + truncated label (left), a single
// hover-only action icon (right). Consolidating this in one place is what makes every
// node type's header actually consistent down to spacing/icon-size rather than four
// near-identical hand-rolled copies drifting apart over time.
//
// Round 2 / ADR-0071: no longer owns its own colored background — `NodeChrome` now
// renders this INSIDE its header row, which sits directly on the card's own tinted
// background (round 5: a pale `ribbonBg` tint, not the old solid fill — see
// node-chrome.tsx), so this component just inherits whatever text color that row sets.
//
// Round 2 / ADR-0067 additions: `faviconUrl` swaps in a fetched site favicon in place of
// the generic type icon once a link card resolves (falls back to `icon` automatically if
// the image 404s).
//
// Round 5 (Istiyak: "Go to link icon to embed beside the 3 dots upfront and not in
// beneath 3 dots"): the external-open action became its own always-visible-on-hover icon
// button, no longer an item inside a dropdown.
//
// Round 6 / ADR-0075 (Istiyak: "Let's remove 3 dots from card header... No 3 dots only
// on hover GO TO link and X outside as is"): the 3-dot menu is gone from every card —
// `onDelete`/`extraMenuItems` removed entirely (delete now lives solely in
// `NodeChrome`'s own hover "X"; the link card's "Edit" action moved into its own body
// row, see link-node.tsx). What used to be hardcoded as "the open-link button" is now a
// single generic hover-action slot (`onOpen`/`openLabel`/`actionIcon`) reused for two
// different purposes across card types: file/link/video pass `ExternalLink` (the
// default) to open the original; the text card passes `Pencil` as its own "Edit"
// affordance (Istiyak: "Text card should have edit button like Go TO Link on hover") —
// same position, same hover behavior, same underlying slot, just a different icon/verb.
// `onLabelCommit` (inline label editing) was removed in this round too — the link card
// was its only user, and round 6 explicitly stops the header title from being editable
// (see link-node.tsx's new below-header URL-edit row instead).
export function NodeHeader({
  icon: Icon,
  label,
  onOpen,
  openLabel,
  actionIcon: ActionIcon = ExternalLink,
  spinning,
  faviconUrl,
  iconBadge,
  accent = "neutral",
}: {
  icon?: LucideIcon;
  label: string;
  /** The card's one hover-only header action (open-original, or — for the text card —
   * "start editing"). Omit entirely for a card with no such action. */
  onOpen?: () => void;
  openLabel?: string;
  /** Which icon the hover action button shows — defaults to `ExternalLink` (every
   * "open original" use case); the text card overrides this to `Pencil` for its own
   * "Edit" affordance. */
  actionIcon?: LucideIcon;
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
  // Tracks WHICH favicon URL most recently failed to load, rather than a plain boolean
  // reset via an effect when `faviconUrl` changes — comparing the two at render time
  // means a later, different favicon URL is never pre-judged by an earlier one's
  // failure (react-hooks/set-state-in-effect: derive this, don't sync it).
  const [failedFaviconUrl, setFailedFaviconUrl] = React.useState<string | undefined>(undefined);
  const showFavicon = Boolean(faviconUrl) && faviconUrl !== failedFaviconUrl;

  return (
    <div className="flex w-full min-w-0 items-center justify-between gap-1.5">
      {/* Round 6 (Istiyak: "Title can be medium in terms of weight"): `font-medium`
          (500) is the lightest step above the body's default regular weight this app's
          type scale offers — anything lighter would read as the same weight as ordinary
          body text and lose the "this is a label" distinction entirely. */}
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
          <span
            className={cn("flex size-4 shrink-0 items-center justify-center rounded", RIBBON_SOLID_CLASSES[accent])}
          >
            <Icon
              className={cn("size-2.5 fill-current text-text-on-accent", spinning && "animate-spin")}
              aria-hidden="true"
            />
          </span>
        ) : Icon ? (
          <Icon className={cn("size-3 shrink-0", spinning && "animate-spin")} aria-hidden="true" />
        ) : null}
        <span className="truncate" title={label}>
          {label}
        </span>
      </span>
      {onOpen ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOpen();
          }}
          aria-label={openLabel ?? "Open"}
          title={openLabel ?? "Open"}
          className="nodrag shrink-0 rounded p-0.5 opacity-0 transition-opacity duration-fast hover:bg-black/10 group-hover:opacity-100 group-focus-within:opacity-100"
        >
          <ActionIcon className="size-3" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
