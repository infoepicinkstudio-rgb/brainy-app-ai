# Bugs — Brainy (brainy.ai)

> **What this file is:** a running error log. When something breaks — in testing (`testing.md`) or in real use — log it here *before* fixing it, so there's a record of what actually went wrong and why, not just the final patched state.
>
> **Why this exists:** when an AI coding session hits a bug, diagnosing from a clear symptom + console error + affected files is far more reliable than guessing from the code alone. This file is also where to look first if something that used to work seems broken again — check whether it's a regression of something already logged.

**How to log a bug:**
1. Copy the template below into a new entry.
2. Fill in **Symptom**, **Console/error output** (verbatim, not paraphrased), and **Files involved** *before* attempting a fix — diagnosis first, patch second.
3. Once fixed, fill in **Root cause** and **Fix**, and move the entry to the "Resolved" section below (don't delete it — a resolved bug is still useful history).

---

## Template

```
### BUG-### — <short title>
**Date:** YYYY-MM-DD
**Status:** Open | In progress | Resolved
**Feature/Task Flow:** (e.g. F-13 / TF-08)
**Symptom:** what the user sees/experiences
**Console/error output:**
```
<paste verbatim>
```
**Files involved:** <paths, once known>
**Root cause:** <once diagnosed>
**Fix:** <what actually changed>
```

---

## Open

*(none currently open)*

---

## Resolved

### BUG-008 — Pressing Backspace while a node was merely selected (not focused in its own input) permanently deleted it, with no undo
**Date:** 2026-10-26
**Status:** Resolved
**Feature/Task Flow:** TF-03 (Canvas navigation) / TF-04 (Text nodes)
**Symptom:** Clicking a node card to select it (not clicking into its textarea/input), then pressing Backspace for any ordinary reason (e.g. about to type a search query elsewhere, or just an accidental keypress) silently and permanently deleted the node. `nodes` has no soft-delete column and (before this pass) there was no undo mechanism at all, so this was unrecoverable data loss.
**Console/error output:** none — this was React Flow's own documented `deleteKeyCode` behavior working exactly as configured, not a crash.
**Files involved:** `apps/web/app/brainboards/[id]/page.tsx`
**Root cause:** `<ReactFlow deleteKeyCode={["Backspace", "Delete"]} />` registers Backspace as a global delete-selected-node shortcut. Backspace is the single most commonly-typed key on a keyboard (every text correction anywhere on the page); binding it to "delete the selected node" with no confirmation and no undo was a destructive-by-default config, not a deliberate product decision anyone had signed off on.
**Fix:** Narrowed `deleteKeyCode` to `["Delete"]` only. Combined with this pass's new undo/redo (ADR-0066) and the 3-dot-menu/Delete-key-only deletion model (ADR-0065), an accidental Delete keypress is now also recoverable via Ctrl+Z. Verified in the sandbox: selecting a node and pressing Backspace no longer deletes it; pressing Delete still does, and Ctrl+Z restores it.

### BUG-009 — A node's "X" delete button removed it from the server immediately but left it visually on the canvas until the board was reloaded
**Date:** 2026-10-26
**Status:** Resolved
**Feature/Task Flow:** TF-04/TF-12/TF-13 (node deletion, all types)
**Symptom:** Clicking a node card's "X" button deleted the node from the database right away (confirmed via a direct re-fetch), but the card stayed visible on the canvas — editable, draggable — until the user left the board and came back (`loadBoard()` re-running), at which point it vanished. Reported by Istiyak as "close/X on a node does not delete immediately from canvas, however if we go back to board and come back that node disappears."
**Console/error output:** none — no error, just stale client state.
**Files involved:** `apps/web/stores/board-store.ts` (`deleteNode`), `apps/web/components/canvas/link-node.tsx`, `apps/web/components/canvas/file-node.tsx`, `apps/web/components/canvas/text-node.tsx`
**Root cause:** `deleteNode(nodeId)` in `board-store.ts` only ever called the backend `DELETE` endpoint — it never removed the node from the local Zustand `nodes` array. The Delete-key path happened to look correct by accident: React Flow's own `onNodesChange`/`applyNodeChanges` already updates local state for a `"remove"` change *before* `board-store.ts`'s `onNodesChange` handler also calls `deleteNode(change.id)` for the server-side delete — so that path had two independent removals (one local, one remote) that both fired. But each node component's "X" button called `deleteNode(id)` **directly**, bypassing `onNodesChange`/`applyNodeChanges` entirely, so only the remote half of that pair ever ran — the card had no reason to disappear from local state until the next full `loadBoard()`.
**Fix:** `deleteNode` now optimistically filters the deleted node (and any edges referencing it) out of local `nodes`/`edges` state itself, in addition to firing the DELETE request — making it safe to call from anywhere (keyboard, 3-dot menu, or directly) with consistent, instant results. As part of this same pass, the "X" button itself was removed from every node header (ADR-0065) — deletion now only happens via the Delete key or each node's 3-dot menu, both of which call this same fixed `deleteNode`. Verified in the sandbox with Playwright: deleting via the 3-dot menu removes the card from the canvas instantly, with no reload needed.

### BUG-010 — New Undo/Redo canvas buttons were unclickable in `npm run dev` (Next.js's own dev indicator sat on top of them)
**Date:** 2026-10-26
**Status:** Resolved
**Feature/Task Flow:** node-card-overhaul slice (ADR-0066)
**Symptom:** Discovered while Playwright-testing the new Undo/Redo buttons (bottom-left control cluster, per the brief): clicks on them timed out.
**Console/error output:**
```
<nextjs-portal></nextjs-portal> from <script data-nextjs-dev-overlay="true">…</script> subtree intercepts pointer events
```
**Files involved:** `apps/web/next.config.ts`
**Root cause:** Next.js 16's dev-mode indicator badge defaults to `position: "bottom-left"` (confirmed in `next/dist/server/config-shared.js`'s own default config) — the exact same corner React Flow's `<Controls>` already occupies, and where this pass's new Undo/Redo buttons were added. This isn't a test-harness-only artifact: Istiyak's actual day-to-day workflow is `npm run dev`, so this would have made the real buttons unclickable on his real machine too, not just in this session's automated test.
**Fix:** Added `devIndicators: { position: "bottom-right" }` to `apps/web/next.config.ts` — keeps the indicator available (still useful for build-error visibility in dev) but out of the canvas controls' way. Verified: the same Playwright click that previously timed out now succeeds.

### BUG-011 — Undo/Redo/zoom/fit icons in the canvas control cluster rendered as solid filled blobs instead of clean line icons
**Date:** 2026-10-26
**Status:** Resolved
**Feature/Task Flow:** node-card-overhaul slice, round 2 (Istiyak's follow-up: "Undo redo buttons added but its wiered in terms of View. Something malfunctioned with icons.")
**Symptom:** The control cluster's icons (Undo, Redo, and after this pass's relayout also Zoom-in/Zoom-out/Fit-view) rendered as misshapen solid shapes rather than recognizable line icons — reported by Istiyak via screenshot as a vertical stack with "what looks like a lock/hand icon, and only ONE curved arrow" where two distinct undo/redo arrows should have been legible.
**Console/error output:** none — purely a visual/CSS rendering issue, no console error or crash.
**Files involved:** `apps/web/app/brainboards/[id]/page.tsx`
**Root cause:** Investigated by dumping the live rendered DOM with Playwright rather than assuming the coordinator's working hypothesis (that `ControlButton` wasn't being used as a proper `<Controls>` child — checked and ruled out; it already was). The actual cause: React Flow's own bundled stylesheet (`@xyflow/react/dist/style.css`) sets `.react-flow__controls-button svg { fill: currentColor; ... }`, tuned for its own built-in glyph icons which have no conflicting `fill` of their own. The Lucide icons used for Undo2/Redo2 (and, after the relayout, Plus/Minus/Maximize2) are stroke-based (`fill="none" stroke="currentColor"`), and a CSS property always wins over an SVG presentation attribute of the same name — so that blanket rule silently overrode each icon's `fill="none"`, filling in their strokes/gaps and turning them into solid blobs.
**Fix:** Added an inline `style={{ fill: "none" }}` (highest specificity available short of `!important`, guaranteed to beat the class+element compound selector) to every custom icon in the control cluster, alongside an explicit `size={12}` matching React Flow's own `max-width/max-height: 12px` constraint on these buttons. Verified via a live Playwright DOM dump showing each `<svg>` now carries `style="fill: none;"` and renders as a clean line icon, and via screenshot comparison before/after.

### BUG-012 — Every node card self-collapsed to a ~2px×2px box on first render once resizable cards (ADR-0070) were added
**Date:** 2026-10-26
**Status:** Resolved
**Feature/Task Flow:** node-card-overhaul slice, round 2 (resizable cards, Istiyak's follow-up)
**Symptom:** The instant `NodeChrome` started reading an explicit `width`/`height` off React Flow's own `NodeProps` and applying it as an inline style, every freshly created card (never yet manually resized) rendered as an almost invisible 2px×2px speck instead of its normal size — the whole canvas appeared blank in a Playwright screenshot even though the DOM showed the node elements existed.
**Console/error output:** none — a layout/sizing bug, no thrown error.
**Files involved:** `apps/web/components/canvas/node-chrome.tsx`, `text-node.tsx`, `file-node.tsx`, `link-node.tsx`, `video-node.tsx`
**Root cause:** `NodeProps.width`/`height` (the props React Flow passes into a custom node component) are NOT purely an app-set explicit size — `@xyflow/system`'s `getNodeDimensions()` computes them as `node.measured?.width ?? node.width ?? node.initialWidth ?? 0`, i.e. they reflect React Flow's own MEASURED size via `ResizeObserver`, which is near-zero for one render tick before the observer's first callback fires. Using that raw value directly as `style={{ width, height }}` locked the card at that transient near-zero measurement in a self-reinforcing deadlock (a 2px box has nothing to measure larger next time).
**Fix:** Every node-type component now reads the EXPLICIT resized size from its own `data.cardWidth`/`data.cardHeight` (set only by `saveNodeSize`, ADR-0070's own persistence path) instead of destructuring `width`/`height` from `NodeProps` at all — this is the only value that actually means "the user resized this card," genuinely `undefined` until they do. Verified via a live Playwright DOM dump showing a fresh node has no inline `width`/`height` style at all and renders at its normal `w-56` footprint, and via screenshot.

### BUG-013 — The new ribbon-behind-card header (ADR-0071) rendered completely invisible — a flat white box, no color showing through anywhere
**Date:** 2026-10-26
**Status:** Resolved
**Feature/Task Flow:** node-card-overhaul slice, round 2, styling pass (Istiyak's reference screenshots)
**Symptom:** After implementing the colored "ribbon" layer meant to sit behind and peek out around the white body card, a live screenshot showed a totally flat white card with zero ribbon color visible anywhere — despite a DOM dump confirming the ribbon `<div>` was present in the markup with the correct `bg-ribbon-*` class.
**Console/error output:** none — a CSS layout bug, not a crash.
**Files involved:** `apps/web/components/canvas/node-chrome.tsx`
**Root cause:** The body card used a top `margin` (`mt-6`) to push itself down below the absolutely-positioned ribbon sitting behind it. The OUTER wrapping `<div>` (`group relative`) had no border or padding of its own, so per standard CSS margin-collapsing rules, the body's top margin collapsed straight through the parent — silently erasing the intended 24px offset. The ribbon ended up positioned at effectively the same spot as the body, fully hidden underneath it, even though every class name in the DOM looked correct.
**Fix:** Moved the top offset from a `margin` on the body (`mt-6`) to `padding` on the OUTER wrapper (`pt-6`) — padding never collapses, so the wrapper's own box now genuinely reserves the space, and the ribbon (absolutely positioned against that wrapper) correctly peeks out above the body, which now follows the padding in normal flow with no top-spacing class of its own. (A first attempt derived `"pt-6"` at runtime via `"mt-6".replace("mt-", "pt-")` — caught and reverted before testing, since Tailwind's JIT scanner only generates CSS for class names that appear as literal strings in source; a runtime-constructed class name produces no CSS even though the DOM's `className` attribute looks correct.) Verified via a live Playwright screenshot showing the ribbon's accent color now genuinely visible, peeking out above and around the white body card's top edges, on every node type.

### BUG-014 — A `link`-type node whose URL already resolved to a YouTube/Vimeo link never converted or fetched metadata on load — stuck forever as the old raw-input card
**Date:** 2026-10-26
**Status:** Resolved
**Feature/Task Flow:** node-card-overhaul slice, round 3 (Istiyak: "Card nodes not coming out as expected", reported with a live screenshot of a "youtube.com" card still showing a bordered raw-URL `<input>`)
**Symptom:** A link card whose URL was a recognizable YouTube link sat permanently showing the pre-ADR-0067 raw-input look (domain as the header label, no favicon, the URL in a plain bordered field) instead of converting to a rich video card or at minimum showing a fetched title — even after the backend/frontend code for both paths had already shipped and worked correctly for freshly-pasted URLs.
**Console/error output:** none — a logic/condition bug, not a crash.
**Files involved:** `apps/web/components/canvas/link-node.tsx`
**Root cause:** The per-card mount effect that auto-fetches metadata for an already-saved link node explicitly EXCLUDED any URL that `parseVideoUrl()` recognized, on the assumption that the conversion-to-video path (`convertLinkNodeToVideo`) would be triggered separately by `handleUrlBlur`. But `handleUrlBlur` only fires on a real `blur` DOM event — which never happens for a node that's simply loaded from the server and rendered; nothing in the mount path called it. So any `link`-type row already saved with a video URL (created before the conversion path existed, left mid-edit in an earlier session, or saved via any path that didn't happen to trigger a blur) stayed permanently un-converted and un-fetched — the exact state in Istiyak's screenshot.
**Fix:** The mount effect now checks `parseVideoUrl(typedData.url)` FIRST and calls `convertLinkNodeToVideo` directly when it matches, instead of skipping entirely. Additionally, the URL input's `onChange` handler now also checks for a recognized video URL on every keystroke and converts immediately (not just on blur) — covering the case where a URL is typed/pasted into the field and the card is never blurred before being screenshotted/left alone. Verified live: a node seeded via direct API call exactly matching the broken shape (`type: "link"`, a YouTube URL, no `status`/`metaForUrl` fields — simulating a legacy/stuck row) now converts to a real video card the instant the board loads, with no user action needed.

### BUG-015 — Resize handle's real hit-target sat mostly outside the card's visible corner, making a drag aimed at what the user actually sees miss and move the card instead
**Date:** 2026-10-26
**Status:** Resolved
**Feature/Task Flow:** node-card-overhaul slice, round 3 (Istiyak: "Resize is not working")
**Symptom:** Dragging from what looks like the card's bottom-right corner frequently just moved the whole card instead of resizing it. The underlying resize mechanism itself worked perfectly when grabbed exactly on its own internal anchor point (confirmed via repeated automated drag/reload/undo cycles) — so this read as "resize does nothing" without being a logic bug at all.
**Console/error output:** none — a hit-target/affordance issue, not a crash or logic error.
**Files involved:** `apps/web/components/canvas/node-chrome.tsx`
**Root cause:** React Flow's own base stylesheet gives every `.react-flow__resize-control.handle` a `translate: -50% -50%`, centering the handle exactly ON the card's corner POINT rather than tucking it inside the card's visible bounds. At the previous 10px handle size, only the inner half (≈5px) of that box actually overlapped the card's visible edge — the rest floated in the surrounding canvas space, which looks like nothing is there. A mouse aimed precisely at the card's own visible corner (the only thing a user can actually see to aim at) would land mostly outside the real hit-target and instead start a node-drag, since the whole card is draggable everywhere else.
**Fix:** Enlarged the handle from `size-2.5` (10px) to `size-3.5` (14px) and increased its visual contrast (`border-2`, added `shadow-surface-raised`) so more of its always-centered hit area genuinely overlaps the card's visible corner, and the corner itself is easier to spot once a card is selected. Verified live by deliberately aiming the simulated drag at the CARD's own visible bottom-right pixel (not the handle's known internal center) — the resize now succeeds from that natural aim point, where it previously would have missed.

### BUG-016 — Ribbon header and white body card drifted apart into two independently-sized boxes; resize handle floated detached from the card; resizing only grew the header, never the thumbnail/body
**Date:** 2026-10-26
**Status:** Resolved
**Feature/Task Flow:** node-card-overhaul slice, round 4 (Istiyak, with a live screenshot: "Real chunk here. Design got worse" — the red ribbon visibly wider than and offset from the white body below it, a small resize-handle square floating fully detached near the bottom-right not touching the card at all, and resizing visibly only grew the header, never the thumbnail underneath)
**Console/error output:** none — a structural CSS/layout bug, not a crash.
**Files involved:** `apps/web/components/canvas/node-chrome.tsx`, `video-node.tsx`, `file-node.tsx`
**Root cause:** The ribbon (header) and the white body were two SEPARATE elements with two SEPARATE sources of truth for size. The ribbon was absolutely positioned against an OUTER wrapper that carried no explicit width of its own — an ordinary block element, which per CSS fills whatever width its own parent (React Flow's `.react-flow__node` wrapper) happens to have at any given moment. The body, meanwhile, carried its own independent `style={{ width, height }}` sourced from `data.cardWidth/cardHeight`, updated only once, at the very end of a resize gesture (`onResizeEnd`). But `NodeResizeControl` drives its live drag feedback by calling React Flow's own `triggerNodeChanges` continuously while dragging — a separate, immediate write path that updates `node.width/height` on the RF node object (and therefore the outer `.react-flow__node` wrapper's own live width) long before our own `onResizeEnd` ever fires. Mid-drag, the two were structurally guaranteed to disagree: the outer wrapper (and the ribbon that filled it) tracked the live drag, while the body stayed pinned to its last-saved size — visually, exactly the "header grew, body didn't" and "handle floated away from the card" symptoms in Istiyak's screenshot. On top of that, the video/file cards' own thumbnail and image elements used a hardcoded fixed height (`h-32`/`h-28`) regardless of the card's resized height, so even once the body itself resized correctly, the media inside it still didn't visibly grow.
**Fix:** Collapsed to a single sized container. `NodeChrome`'s outer `<div>` now carries the `w-56` default (or the explicit resized `style={{ width, height }}`) directly AND is the ribbon itself (the colored background lives on this one element — there is no second, independently-positioned ribbon box). The header row and the white body are both ordinary in-flow flex children of that one container (`flex flex-col`): the header sized to its own content (`shrink-0`), the body filling whatever space remains (`flex-1 min-h-0`). Because the body's size is now DERIVED from the single shared container via flexbox fill — never an independently-tracked pixel value — it is structurally incapable of drifting from the ribbon or lagging during a live drag. The resize handle, now anchored to this same single container, can no longer float away from it either. Separately, the video thumbnail and file-card image were changed from a fixed height to `flex-1 min-h-0` (when the card has an explicit resized height) so they actually absorb extra resized space instead of staying pinned at their old size. Verified live: resized a video/file/text card's actual visible corner mid-drag and after-drop, confirming the ribbon, body, and resize handle share an identical bounding box at every observed instant (never drifting), and that the thumbnail/image area visibly grows along with the card, not just the header.

### BUG-017 — Card preview/body content looked "clipped" at the corners — body's rounded-corner radius didn't match its own inset from the outer card edge
**Date:** 2026-10-26
**Status:** Resolved
**Feature/Task Flow:** node-card-overhaul slice, round 5 (Istiyak: "corner radius is slightly can be improved looks clipped from the edges for the card previews" — illustrated with a zoomed reference crop showing a scrollbar sitting flush against a rounded card corner)
**Console/error output:** none — a static CSS geometry mismatch, not a crash or timing bug, so this was diagnosed by computing the nested-corner math directly rather than via Playwright.
**Files involved:** `apps/web/components/canvas/node-chrome.tsx`
**Root cause:** `NodeChrome`'s outer container (BUG-016's single sized container, since round 4) uses `rounded-lg` (12px, the project's `--radius-lg` token) with `p-0.5` (2px) padding around its body child, so its own tinted background shows as a 2px "peek" ring on every side. For two concentric rounded rectangles to nest cleanly — the inner curve following the outer curve at a constant 2px offset — the inner radius needs to be `outerRadius − padding` = 12 − 2 = **10px**. The body div was instead using `rounded-md` (8px), 2px short of that. At a sharp corner this reads exactly as Istiyak described: the body's corner curves in "faster" than the outer ring around it, leaving a visible notch/mismatch — the scrollbar-at-the-corner reference crop makes it obvious because `overflow-y-auto` content clips right at that under-curved edge.
**Fix:** Changed the body div's rounded corner from `rounded-md` (8px) to `rounded-lg` (12px) in `apps/web/components/canvas/node-chrome.tsx`. This doesn't hit the exact theoretical 10px ideal (Tailwind's token scale jumps `md`→`lg` with no 10px step, and adding a one-off arbitrary value would violate the `tailwindcss/no-arbitrary-value` lint rule / ADR-0024's token-only rule), but using the SAME radius as the outer ring is the safe direction: an inner radius at or above the ideal never produces a visible notch (only an inner radius smaller than the outer-minus-padding ideal does), so matching `rounded-lg` on both elements removes the clipped/notched look entirely. Verified via a direct computed-style check (Playwright `getComputedStyle`): outer `border-radius: 12px` / `padding: 2px`, body `border-radius: 12px`, with a consistent 2px gap measured on all four sides between the outer and body boxes, and `overflow: hidden auto` on the body correctly clipping its scrollable content to that matching curve.

### BUG-018 — Dropping a file onto the canvas, or pasting a file copied from the OS, did nothing — the browser's own default open/save handling took over instead
**Date:** 2026-10-26
**Status:** Resolved
**Feature/Task Flow:** TF-12 (file upload), cross-cutting with the canvas's existing paste-to-create handler
**Symptom:** Istiyak: "On dropping any file on canvas / or / copy pasting from desktop its node card not getting generated. Its directly getting towards browsers default open / save functionality." Dragging a file from the OS file explorer onto the board, or copying a file in the explorer and pasting it on the canvas, never created a file node — the browser opened/downloaded the file itself instead, as if the app weren't there at all.
**Console/error output:** none — no handler existed at all for either path, so nothing ever ran to error.
**Files involved:** `apps/web/app/brainboards/[id]/page.tsx`
**Root cause:** Two separate, genuine gaps, not one:
1. The canvas had NO `dragover`/`drop` handlers whatsoever. A `dragover` handler must call `preventDefault()` for the browser to treat the element as a valid drop target at all — without that, a subsequent `drop` event never gets a chance to do anything useful, and the browser falls through to its native "open this file" behavior for anything dragged onto an ordinary web page.
2. The existing paste handler (added for paste-a-URL/paste-text, ADR-0065/round-2) only ever read `event.clipboardData.getData("text/plain")` — it never checked `event.clipboardData.files` at all. A real file on the OS clipboard (copied in Explorer/Finder, not a text selection) has no `text/plain` entry, so it silently fell through every branch and reached no code path, leaving the browser's own default paste handling to take over.
**Fix:** Added `onDragOver`/`onDrop` handlers to the canvas's wrapping div, routing any dropped files through the exact same `addFileNode` upload path the toolbar's "File" button already uses, with `screenToFlowPosition` placing each dropped node at the actual drop coordinates (multiple dropped files are offset slightly from each other, not stacked exactly on top of one another). Extended the existing paste handler to check `event.clipboardData.files` FIRST, before the `text/plain` branch, routing any files found through the same `addFileNode` path. Verified live via Playwright: a synthetic `DataTransfer` with a real `File` object, dispatched as both a `drop` event (at specific canvas coordinates) and a `paste` event (constructed as a genuine `ClipboardEvent` with `clipboardData` set, not a generic `Event` — an earlier attempt using Playwright's generic `dispatchEvent` helper silently failed because it didn't construct a true `ClipboardEvent`, caught and corrected during verification itself) — both created a real file node via an actual `POST /api/files/upload` request, confirmed via network log.

### BUG-019 — `next dev`/`next build` threw `CLIENT_HOOK_DYNAMIC` once the Navbar started deciding wordmark-vs-breadcrumb from the current route
**Date:** 2026-10-26
**Status:** Resolved
**Feature/Task Flow:** TF-01 (global nav) — the board-canvas breadcrumb pass (ADR-0078)
**Note on provenance:** logged after the fact, from the parallel "nav agent"'s own implementation note in ADR-0078, not independently investigated by this agent — the fix had already been made and verified by that agent before this round began; it's recorded here because `docs/bugs.md` had no entry for it despite ADR-0078 already citing "BUG-019," and a cross-reference to a bug that doesn't exist in the log is worse than a secondhand entry.
**Symptom:** Once the Navbar's left slot started conditionally rendering a breadcrumb instead of the wordmark based on the current route, both `next dev` and a full `next build` started throwing `CLIENT_HOOK_DYNAMIC`.
**Files involved:** `apps/web/components/layout/navbar.tsx`
**Root cause:** Deciding wordmark-vs-breadcrumb needs `usePathname()` — a dynamic client hook — and `next.config.ts`'s `cacheComponents` option requires any component reading such a hook to be wrapped in `Suspense`, the same constraint the per-route `Suspense` wrappers around `useParams()`/`useSearchParams()` in `[id]/page.tsx` and `(list)/all/page.tsx` already exist to satisfy. The route-deciding logic was first written as a plain conditional inside `Navbar` itself, with no such boundary.
**Fix:** Extracted the pathname-dependent decision into its own `NavbarBrand` child component, wrapped in `<Suspense fallback={<Wordmark />}>` inside `Navbar` — the wordmark doubles as the fallback, so there's no flash of empty space while it resolves.

### BUG-020 — `npm run build` failed at type-check on Istiyak's machine after two agents' parallel work landed on the device together (cross-agent integration bug)
**Date:** 2026-10-26
**Status:** Resolved
**Feature/Task Flow:** Cross-cutting — TF-05 (link-preview image, round 6) collided with the Top Nav/breadcrumb pass's edits to the same file
**Symptom:** Istiyak ran `npm run build` for real and it failed at the type-check step (`next build`'s "Failed to type check." + npm's exit-code-1 wrapper). The app was completely unusable — no production build could be produced — even though two separate agents (this one and a parallel "nav agent" doing top-nav/breadcrumb/profile-menu work) had each independently verified a fully clean build in their own isolated sandboxes just before this, neither having seen the other's changes.
**Console/error output (reproduced directly, not from Istiyak's truncated screenshot):**
```
components/canvas/link-node.tsx(166,13): error TS2322: Type 'unknown' is not assignable to type 'string | Blob | undefined'.
components/canvas/link-node.tsx(169,50): error TS2345: Argument of type 'unknown' is not assignable to parameter of type 'SetStateAction<string | undefined>'.
Failed to type check.
```
**Files involved:** `apps/web/stores/board-store.ts`, `apps/web/components/canvas/link-node.tsx`
**Root cause:** Both agents genuinely edited `apps/web/stores/board-store.ts` concurrently in separate sandboxes — this agent's round 6 added a `previewImageUrl?: string` field to the `LinkNodeData` interface (for the link-card preview-image feature), while the nav agent added `boardFolderId`/`renameBoard` for the breadcrumb/rename-board work. Whatever combined the two sets of edits onto the live device correctly preserved almost everything from both sides (undo/redo, resize, `cardWidth`/`cardHeight`, `boardFolderId`, `renameBoard` all landed intact) — this was NOT a wholesale clobber of one agent's work by the other. But the single `previewImageUrl?: string` field on `LinkNodeData` was dropped during that merge. Because `LinkNodeData extends Record<string, unknown>`, any property access not declared on the interface itself (`typedData.previewImageUrl`) silently falls through to the index signature and types as `unknown` instead of erroring at the access site — so the real break only surfaced downstream, in `link-node.tsx`'s `<img src={typedData.previewImageUrl}>` and its `onError` handler, as a type mismatch against `<img>`'s `src`/`useState`'s setter, not as an obviously-related error pointing back at the interface. This is exactly the failure mode the coordinator predicted: each agent's sandbox build passed because neither ever contained the other's edits at the same time, so neither could have caught a field getting lost in whatever process combined them.
**Fix:** Restored `previewImageUrl?: string;` to the `LinkNodeData` interface in `apps/web/stores/board-store.ts`, alongside (not replacing) the nav agent's `boardFolderId`/`renameBoard` additions — both sides' work now coexist in the same interface/store as originally intended. No other file needed a change; `link-node.tsx` itself was already correct and needed no edit once the interface had the field back. Verified via a full fresh `npm run build -w apps/web` (and `-w apps/server`) against a freshly re-staged copy of the live device state, not a cached local copy — both type-check and build now pass clean.
**Process note for future rounds:** when two agents are known to be working in parallel on the same repo, a merged file landing on the device should be diffed field-by-field against BOTH source versions before either agent reports done, not just skimmed for "does X still look present" — a single dropped optional field is easy to miss by eye and only surfaces as a seemingly-unrelated type error several files away.

### BUG-021 — The canvas's `bg-background-canvas` className never actually painted anything — a real, pre-existing bug invisible only because the old color was white-on-white
**Date:** 2026-10-26
**Status:** Resolved
**Feature/Task Flow:** TF-03 (canvas) — surfaced while implementing Istiyak's "canvas looks very plain... need to add a bit of character" ask (ADR-0082)
**Symptom:** Changing `packages/tokens/tokens/semantic.json`'s `background.canvas` token from `{color.white}` to `{color.accent.50}` (a pale lavender tint, matching Istiyak's reference screenshot) produced zero visible change on the live canvas — it stayed the same plain near-white it had always been, even though the generated CSS variable and the Tailwind utility both looked completely correct on inspection.
**Console/error output:** none — no error, the rule simply never applied; caught by computed-style inspection (`getComputedStyle(.react-flow).backgroundColor` read `rgba(0, 0, 0, 0)` — fully transparent — while `getComputedStyle(.react-flow).getPropertyValue('--color-background-canvas')` on that exact same element correctly read `#eef2ff`), not by any thrown error.
**Files involved:** `apps/web/app/brainboards/[id]/page.tsx` (the `<ReactFlow className="bg-background-canvas">` prop), `apps/web/app/globals.css`
**Root cause:** React Flow's own stylesheet (`@xyflow/react/dist/style.css`) sets `.react-flow { background-color: var(--xy-background-color, var(--xy-background-color-default)) }` with `--xy-background-color-default: transparent`, as a **plain, un-layered** CSS rule — that stylesheet is imported directly (`import "@xyflow/react/dist/style.css"`), not run through Tailwind's `@layer` system at all. Per the CSS Cascade Layers spec, an un-layered declaration always wins over a layered one, regardless of specificity or source order. Tailwind v4 puts every one of its own utilities (including `bg-background-canvas`) inside `@layer utilities` — so even though that utility's rule genuinely exists, genuinely targets `.react-flow` with the same specificity, and genuinely loads after React Flow's stylesheet in the bundle, it still loses every time, because "layered vs. unlayered" decides the cascade before specificity or order are even considered. This was a real, pre-existing bug the entire time this className existed — it was invisible only because the token's old value was plain white, which looks identical to "nothing painted at all" against this app's white page chrome, so nobody had reason to suspect the utility wasn't actually working.
**Fix:** Removed the non-functional `className="bg-background-canvas"` from `[id]/page.tsx` (dead markup that silently does nothing is worse than none at all) and added a plain, un-layered override directly in `globals.css` — `.react-flow { background-color: var(--color-background-canvas) !important; }` — which wins on the same "unlayered beats layered" grounds Tailwind's own utility was losing on. Verified via computed style (`background-color` on `.react-flow` now correctly reads `rgb(238, 242, 255)`, matching `--color-accent-50` exactly) and visually via screenshot.
**Process note:** any future Tailwind utility applied directly to a React-Flow-rendered element (`.react-flow`, `.react-flow__pane`, `.react-flow__node`, etc.) should be verified with a real computed-style check, not just "the class is present in the DOM" — React Flow's own stylesheet being unlayered CSS means it silently wins over any Tailwind utility targeting the same element, with no visual warning that anything is wrong when the colors happen to coincide.

### BUG-022 — Trash reused none of the Boards List's visual treatment, so the same product read as two different ones
**Date:** 2026-10-27
**Status:** Resolved
**Feature/Task Flow:** TF-02 (Boards List / Trash) — Istiyak: "Board tiles showing different in All board and how it looks in Trash is completely different."
**Symptom:** `apps/web/app/brainboards/(list)/trash/page.tsx` never called `BoardCard` at all — it hand-rolled its own much plainer row markup (a bare title plus two ghost buttons, no icon avatar, no folder chip, no timestamp, no hover background), built before `BoardCard` existed and never brought in line with it afterward. Visiting Trash right after the Boards List made the mismatch obvious: same app, two different row designs for the same underlying object.
**Console/error output:** none — a visual/structural inconsistency, not a runtime error.
**Files involved:** `apps/web/app/brainboards/(list)/trash/page.tsx`, `apps/web/components/boards/board-card.tsx`
**Root cause:** `BoardCard` (icon avatar, title, folder chip, timestamp, hover row) was built for the Boards List page only; Trash predates it and was never migrated over, so the two pages diverged visually even though they render the same `BoardSummary` shape.
**Fix:** Gave `BoardCard` a `variant="trash"` prop that swaps its action cluster to Restore/Delete-forever only and drops the stretched open-link, rename, move-to-folder, and favorite controls (none of which make sense for an already-deleted board) — see ADR-0084. `trash/page.tsx` now renders the same `BoardCard` the Boards List does, inside the same `rounded-lg border border-border-default bg-background-surface` list shell, instead of its own separate markup. Verified live: Trash and the Boards List now read as the same row component with a different action set, confirmed via screenshot.

### BUG-023 — Dropdown-menu hover rectangle overflowed past its container's rounded corners
**Date:** 2026-10-27
**Status:** Resolved
**Feature/Task Flow:** TF-02 (Boards List) — Istiyak: "On hover and clicking on 3 dots outline of hover getting invisible at corners due to hover bg color is not getting clipped. Same thing happening across menus hover."
**Symptom:** Hovering the first or last item in `board-row-menu.tsx`'s "⋮" dropdown showed that item's `hover:bg-background-muted` highlight as a plain square rectangle poking past the menu container's own `rounded-lg` corners, instead of being clipped to match them.
**Console/error output:** none — a pure CSS rendering defect, confirmed visually (screenshot of the hovered corner before/after).
**Files involved:** `apps/web/components/boards/board-row-menu.tsx`
**Root cause:** The menu container had `rounded-lg` but no `overflow-hidden`, so a child element's own background paints right up to the child's box edges regardless of the parent's border-radius — the parent's rounded corners only clip a child's painted content when the parent actually establishes a clipping box via `overflow` other than `visible`. `apps/web/components/layout/profile-menu.tsx`'s dropdown (built earlier this session, ADR-0077) already had `overflow-hidden` and was checked and confirmed NOT to have this bug — `board-row-menu.tsx` was the one dropdown in the app missing it.
**Fix:** Added `overflow-hidden` to `board-row-menu.tsx`'s dropdown container, alongside its existing `rounded-lg`. Verified live: hovering the first and last menu items now shows the highlight correctly clipped to the rounded corner, screenshotted at a tight crop to confirm.

### BUG-024 — Board row's hover background and pointer cursor covered different areas, so the edges "looked" clickable but weren't
**Date:** 2026-10-27
**Status:** Resolved
**Feature/Task Flow:** TF-02 (Boards List) — Istiyak: "Mouser hover to hand conversion is not happening at edges for that we need to come to middle of the card. However background color got converted to Hover state."
**Symptom:** `board-card.tsx`'s outer row `<div>` carried the full-width `hover:bg-background-muted` (so the highlighted background correctly spanned the row's whole padded width), but the actual `<Link>` that gave the native pointer cursor and handled the click only wrapped the inner icon+title+chip+timestamp cluster, not the row's own left/right padding. Hovering those padding gutters showed the highlighted background with a plain arrow cursor and did nothing on click, while only the middle of the row behaved as a link.
**Console/error output:** none — a cursor/clickable-area mismatch, confirmed by inspecting `document.elementFromPoint()` at the row's left-edge pixel (it resolved to the outer `<div>`, not the `<a>`, before the fix).
**Files involved:** `apps/web/components/boards/board-card.tsx`
**Root cause:** The clickable `<Link>` and the hover-highlighted area were two different, non-matching boxes — the highlight implied the whole row was clickable, the actual hit area said otherwise.
**Fix:** Rebuilt the row around a "stretched link" pattern (ADR-0084): a single `<Link href={...} className="absolute inset-0">` now fills the entire row (parent `relative`), with the icon/title/chip/timestamp/favorite-star/"⋮"-menu all given `relative` so they paint above it (same stacking context, later in DOM order) and stay independently clickable with no `stopPropagation` needed. The clickable area and the hover-highlighted area are now the exact same box. Verified live: `document.elementFromPoint()` at the row's left-edge pixel now resolves to the `<a>` with `cursor: pointer`, confirmed via a scripted check, not just a screenshot.

### BUG-025 — Deleting a folder with the new "delete its boards too" strategy crashed the server with a foreign-key constraint violation
**Date:** 2026-10-27
**Status:** Resolved
**Feature/Task Flow:** TF-02 (Boards List / Folders) — surfaced while implementing the folder-delete strategy choice (ADR-0082)
**Symptom:** Choosing "Delete its boards too" in the new folder-delete dialog and confirming returned a 500 and left the folder undeleted (its boards, however, DID get correctly soft-deleted to Trash first, since that update ran and committed before the failing statement).
**Console/error output:**
```
DrizzleQueryError: Failed query: delete from "folders" where "folders"."id" = ?
params: 38f11e42-...
caused by: LibsqlError: SQLITE_CONSTRAINT: FOREIGN KEY constraint failed
```
**Files involved:** `apps/server/src/routes/boards.ts`, `apps/server/src/db/schema.ts`
**Root cause:** `boards.folder_id` is a real foreign key against `folders.id` (`schema.ts`). The new `DELETE /api/folders/:id` handler's "delete" branch soft-deleted every board in the folder (set `deleted_at`) but left `folder_id` pointing at that same folder, then tried to delete the folder row itself — which SQLite correctly refused, since a row still referenced it. The pre-existing "move" branch never hit this, because it always reassigns `folder_id` away from the folder before deleting it.
**Fix:** The "delete" branch's board update now also sets `folder_id: null` alongside `deleted_at`, matching what "move to no folder" already does — a trashed board doesn't meaningfully belong to a folder anymore anyway, so this is the semantically right value, not just the FK-safe one. Verified live end-to-end (create a folder, put a board in it, delete the folder choosing "delete its boards too") with both a direct API call and a full Playwright run through the dialog; the folder deletes cleanly and the board lands in Trash with no folder reference.

### BUG-001 — `drizzle-kit generate`'s SQLite table-rebuild migration selected a column that didn't exist yet
**Date:** 2026-10-26
**Status:** Resolved
**Feature/Task Flow:** TF-11 (Settings — provider execution mode)
**Symptom:** `npm run db:migrate -w apps/server` crashed on a fresh database with `SQLITE_ERROR: no such column: execution_mode`.
**Console/error output:**
```
LibsqlBatchError: SQLITE_ERROR: SQLITE_ERROR: no such column: execution_mode
    at Sqlite3Client.migrate ...
```
**Files involved:** `apps/server/drizzle/0001_colorful_mandrill.sql` (generated), `apps/server/src/db/schema.ts`
**Root cause:** Adding `execution_mode` to `provider_credentials` forced SQLite's table-rebuild migration pattern (SQLite can't add a `NOT NULL ... DEFAULT` column plus a `UNIQUE` constraint via plain `ALTER TABLE`, so drizzle-kit creates `__new_provider_credentials`, copies rows across, drops the old table, renames the new one). `drizzle-kit generate` wrote the copy step's `INSERT ... SELECT` listing `execution_mode` as one of the columns to read *from the old table* — but the old table (migration 0000) never had that column, since it's the one being added. A drizzle-kit generation bug, not a hand-authoring mistake.
**Fix:** Hand-edited the generated `0001_colorful_mandrill.sql` to drop `execution_mode` from the `SELECT ... FROM provider_credentials` column list (and the matching `INSERT INTO` column list), so migrated rows take the new column's `DEFAULT 'native'` instead of trying to read a column that doesn't exist yet. Verified: `npm run db:migrate` now runs clean on a fresh database. Worth a quick glance at any future generated migration that both adds a column and triggers SQLite's rebuild pattern — the same bug could recur.

### BUG-002 — App-load gate hung forever on a loading spinner when the backend wasn't running
**Date:** 2026-10-26
**Status:** Resolved
**Feature/Task Flow:** TF-01 (app-load gate)
**Symptom:** `StoreHydrator` calls `loadProfile()` with no `.catch()`. If `apps/server` isn't running (or crashes) when the frontend loads, the underlying `fetch()` rejects, the promise goes unhandled, `profileLoaded` never flips to `true`, and `AppGate` stays on its `aria-busy` loading `<main>` forever — no message, no way out, matching none of `architecture.md` §6's "backend unreachable is its own distinct error state" intent for the one screen that actually needs it most (every other action's error already said to check the server was running; this path, the first thing a user sees, didn't).
**Console/error output:**
```
Uncaught (in promise) TypeError: fetch failed
```
**Files involved:** `apps/web/components/layout/store-hydrator.tsx`, `apps/web/stores/settings-store.ts`, `apps/web/app/page.tsx`
**Root cause:** `loadProfile` had no error handling at all — it assumed the `fetch` would succeed or the caller would catch it, but its only caller (`StoreHydrator`'s `useEffect`) did neither.
**Fix:** Added `profileLoadError: string | null` to the settings store; `loadProfile` now catches the failure and sets a clear message ("Can't reach the Brainy.ai backend. Check that the server is running.") instead of throwing; added a `retryLoadProfile` action; `AppGate` (`apps/web/app/page.tsx`) now renders that message with a "Try again" button instead of the indefinite spinner when `profileLoadError` is set. Verified: `fetch()` against a dead port rejects as expected (confirmed directly in Node), so the catch path is reachable; full visual confirmation of the rendered error screen in a browser was not possible in this environment and is left for Istiyak to eyeball.

### BUG-003 — Canvas rendered completely blank (React Flow: "parent container needs a width and a height")
**Date:** 2026-10-26
**Status:** Resolved
**Feature/Task Flow:** TF-03 (Canvas navigation)
**Symptom:** Opening a board showed an empty page — no canvas, no dot-grid, no nodes, no error. The browser console logged React Flow's own warning.
**Console/error output:**
```
[React Flow]: The parent container needs a width and a height to render the graph.
```
**Files involved:** `apps/web/app/layout.tsx`, `apps/web/app/brainboards/[id]/page.tsx`
**Root cause:** `<body>` used `min-h-full` (a floor on height) instead of `h-full` (a bound). `min-h-full` doesn't reliably propagate a *definite* height down through nested `flex-1` containers the way a true `height`-bound ancestor chain does, so React Flow's root element ended up with no resolvable height at all — not "too small," genuinely indeterminate.
**Fix:** Changed `<body>` from `className="flex min-h-full flex-col"` to `className="flex h-full flex-col"` in `apps/web/app/layout.tsx`. Verified: the console warning disappeared entirely, and a direct DOM inspection of a node's bounding rect went from off-screen/zero-size to a correct, fully-in-viewport rect.

### BUG-004 — Text/file/link node content did not survive a page refresh (autosave silently corrupted)
**Date:** 2026-10-26
**Status:** Resolved
**Feature/Task Flow:** TF-03/TF-04 (Autosave)
**Symptom:** Typing into a text node, waiting for autosave, then refreshing the page showed the node reverted to its original (often empty) content instead of what was typed.
**Console/error output:** none — failed silently, no thrown error on either client or server.
**Files involved:** `apps/server/src/routes/nodes.ts`, `apps/server/src/db/schema.ts` (the `nodes.data` column, declared `text(column, { mode: "json" })`)
**Root cause:** Drizzle's `{ mode: "json" }` column type already auto-serializes a JS value to a JSON string on write and auto-parses it back to an object on read. Both the POST and PATCH routes in `nodes.ts` were *also* calling `JSON.stringify(data)` before handing it to Drizzle — double-encoding the value. A read then came back as a plain string (the once-stringified JSON) instead of the intended object, which the frontend's node components couldn't render as real content.
**Fix:** Removed the manual `JSON.stringify()` call in both the POST route (`data: data === undefined ? {} : data`) and the PATCH route (`if (data !== undefined) patch.data = data;`), letting Drizzle do the serialization once, as designed. Verified via a direct curl round-trip (write a node, then re-fetch it) showing the content correctly preserved as a real object, and via the full Playwright regression's dedicated autosave-survives-hard-refresh check.

### BUG-005 — Every PATCH/PUT/DELETE request from the browser silently failed (CORS) — affects Phase 1 features too, not just Phase 2
**Date:** 2026-10-26
**Status:** Resolved
**Feature/Task Flow:** Cross-cutting (TF-02 trash/restore/rename, TF-03 autosave/position-save, and retroactively Phase 1's provider-key and brand-profile saves)
**Symptom:** Node autosave, drag-to-reposition saving, board rename, moving a board into a folder, and (found only once this was traced back) Phase 1's Settings provider-key/branding saves all appeared to silently do nothing when exercised through the actual browser UI — no visible error, the request simply never reached the server as far as the UI could tell. curl-based testing of the same endpoints worked fine, which is why this went undetected through all of Phase 1.
**Console/error output:**
```
Access to fetch at 'http://localhost:4000/api/...' from origin 'http://localhost:3000' has been blocked by CORS policy: Method ... is not allowed by Access-Control-Allow-Methods.
```
(confirmed directly via `curl -i -X OPTIONS` showing `access-control-allow-methods: GET,HEAD,POST` only)
**Files involved:** `apps/server/src/index.ts`
**Root cause:** `@fastify/cors` v11's actual default `methods` option is `'GET,HEAD,POST'` only — PUT/PATCH/DELETE are not included unless explicitly listed. The CORS plugin was registered with only `{ origin: FRONTEND_ORIGIN }`, no `methods` option, so every PATCH/PUT/DELETE request from the real browser failed CORS preflight before ever reaching a route handler. curl bypasses CORS entirely (it's a browser-enforced policy), so every curl-based verification this session and in Phase 1 passed while the real app silently didn't work.
**Fix:** Added an explicit `methods: ["GET", "POST", "PUT", "PATCH", "DELETE"]` to the `cors` plugin registration in `apps/server/src/index.ts`. Verified: the full Playwright regression (which drives the real browser, not curl) now passes autosave, position-save, rename, and folder-move end-to-end. This is the single highest-impact fix of Phase 2 — worth Istiyak specifically re-testing Phase 1's Settings save buttons by hand, since they were silently broken in the real app this whole time despite passing every curl-based check.

### BUG-006 — Trash/Restore/permanent-delete actions silently did nothing (unhandled promise rejection on a bodyless request)
**Date:** 2026-10-26
**Status:** Resolved
**Feature/Task Flow:** TF-02 (Boards List — Trash)
**Symptom:** Clicking "Move to Trash" (or Restore) appeared to do nothing — no error shown, board stayed in place.
**Console/error output:**
```
FST_ERR_CTP_EMPTY_JSON_BODY: Body cannot be empty when content-type is set to 'application/json'
```
(surfaced client-side as an uncaught/unhandled promise rejection, since the calling code had no try/catch)
**Files involved:** `apps/web/lib/api.ts`
**Root cause:** The shared `api.post()`/`api.delete()` wrapper always sent `Content-Type: application/json`, even for calls with no body (trash/restore/delete all send no body). Fastify's body parser rejects a request that declares a JSON content type but has an empty body.
**Fix:** Made the `Content-Type: application/json` header conditional on `init?.body !== undefined` in `apps/web/lib/api.ts`'s `request()` function. Verified via the full Playwright regression — trash/restore/delete all now complete and update the UI.

### BUG-007 — Permanent-delete button never closed its confirm dialog or removed the board, despite the server-side delete succeeding
**Date:** 2026-10-26
**Status:** Resolved
**Feature/Task Flow:** TF-02 (Boards List — Trash, permanent delete)
**Symptom:** Confirming "Delete forever" on a trashed board deleted the row in the database (confirmed via direct inspection) but the dialog stayed open and the board stayed visible in the Trash list in the UI.
**Console/error output:**
```
SyntaxError: Unexpected end of JSON input
```
**Files involved:** `apps/web/lib/api.ts`
**Root cause:** Every hard-DELETE route in this API correctly returns `204 No Content` on success — an empty body, by design. The shared `request()` wrapper unconditionally called `response.json()` on every successful response, which throws on an empty body. The caller's follow-up code (closing the dialog, removing the board from local state) never ran because the exception happened first.
**Fix:** Added a short-circuit in `apps/web/lib/api.ts`'s `request()`: `if (response.status === 204) return undefined as T;` before the generic `.json()` call. Verified via the full Playwright regression — the dialog now closes and the board disappears immediately after a successful permanent delete.
