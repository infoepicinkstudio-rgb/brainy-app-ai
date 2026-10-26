# Testing — Brainy (brainy.ai)

> **What this file is:** a manual test-case checklist, one section per feature, matching the features and their Level-2 flows in [`feature.md`](./feature.md). A feature's checkbox in [`implementation_plan.md`](./implementation_plan.md) shouldn't be marked done until its test cases here pass.
>
> **What this file is not — yet:** an automated test suite. Whether (and how) to add automated tests is explicitly undecided — see `agents.md` §5. This file covers manual verification only, which is enough for a solo local tool at this stage; it can grow into/alongside automated coverage later without needing a rewrite.
>
> **How to use this:** before checking off a feature in the tracker, actually run through its cases here against the real running app — don't assume. When a bug turns up while testing, log it in [`bugs.md`](./bugs.md) rather than silently patching and moving on, so there's a record.

Legend: `[ ]` not yet run · `[x]` passes · `[~]` partially implemented/adjusted (see note)

---

## Phase 1 — App Shell

> **Phase 1 verification note (2026-10-26):** built and verified from a headless environment with no browser available. Backend behavior below was confirmed by running the real `apps/server` process and exercising it directly (HTTP calls, raw-DB inspection, isolated encryption round-trip scripts) — that's a genuine pass, not a guess. Frontend behavior was verified by confirming the exact component code path consumes the exact field that was independently confirmed correct server-side (e.g. `ProviderKeyField` renders off `status.isConfigured`, which was independently confirmed to flip correctly). What this fork could **not** do is look at rendered pixels in a browser — anything that's purely about layout, visual rendering, or multi-step pointer/keyboard interaction is left `[ ]` below for Istiyak to actually run once. Where a case is marked `[x]`, it means "logic + data path confirmed end-to-end," not "a human has seen it work."

**F-01 — Cosmetic first-run login**
- [x] Fresh install (empty `brainy.db`) shows the login screen — confirmed: `GET /api/profile` on a fresh DB returns `{"profile":null}`, and `AppGate` renders `FirstRunLogin` exactly when `profile` is `null`. *(not visually confirmed in a browser)*
- [x] Submitting a name creates a profile and lands on Boards List — confirmed: `POST /api/profile` creates the row and returns it; `AppGate`'s redirect effect fires to `/brainboard/all` once `profile` and `sessionActive` are both truthy. *(redirect itself not visually confirmed)*
- [x] Relaunching the app after a profile exists skips straight to Boards List — confirmed: `GET /api/profile` returns the existing row on a second call (no re-creation), which drives the same redirect path above.
- [x] Submit is blocked on an empty name field — confirmed in `FirstRunLogin`: `handleSubmit` returns early with "Enter a name to continue." before ever calling the API when `name.trim()` is empty.

**F-02 — Navbar + profile dropdown**
- [x] Avatar/initials render correctly for a 1-word and a multi-word name — confirmed visually this round (Top Nav polish pass, Playwright screenshot) in addition to the earlier direct `initialsFromName` unit check (6/6 cases).
- [x] Dropdown shows Settings, shortcuts reference, About, Sign Out — confirmed visually this round, now with per-item icons (see the Top Nav section below).
- [x] Sign Out returns to login screen without deleting the stored profile — confirmed by code: `signOut()` only sets `sessionActive: false` in the Zustand store; it never calls any delete/clear endpoint, so the `users` row is untouched. The gate's "profile exists but session inactive" branch then renders `WelcomeBack`, not a destroyed profile. Unchanged by this round's visual overhaul.
- [x] Navbar is present and consistent on both Boards List and Canvas views — confirmed visually this round on a real board route, not a placeholder. "Consistent" now means the header chrome (height, shadow, ProfileMenu) is identical on both; the LEFT SLOT content is deliberately different by design on a board route (breadcrumb, not the wordmark) — see the Top Nav section below and ADR-0078.

**F-11 — Settings: provider API keys (storage)**
- [x] Saving a Claude API key persists it (visible again after app restart, masked) — confirmed end-to-end: `PUT /api/providers/claude` encrypts and stores the key (verified as genuine AES-256-GCM ciphertext via raw DB read, not plaintext), `GET /api/providers` reflects `isConfigured: true` afterward, and the key field renders masked (`type="password"`) with no raw value ever returned to the frontend to display.
- [x] Clearing a key reverts the provider to "not configured" — confirmed: `DELETE /api/providers/:provider` nulls `api_key`; a follow-up `GET` shows `isConfigured: false`.
- [~] An obviously malformed key (e.g. empty string, wrong prefix) is rejected at save time — **partially implemented, adjusted from the original case:** an empty/whitespace-only key is caught client-side in `ProviderKeyField` ("Enter a key, or cancel.") before any API call. A "wrong prefix" format check (e.g. requiring a Claude key to start with a specific prefix) was **not** built in Phase 1 — the directive scoped this as generic CRUD storage, not per-provider key-format validation, and providers' actual key formats aren't guaranteed stable enough to hardcode a prefix check against. Left as a real gap, not silently dropped; revisit if a bad key actually causes a confusing failure mode once Native API calls exist (Phase 4+).

**F-21 — Brand/Voice Profile (editor)**
- [x] Profile content saves and reloads correctly after a restart — confirmed: `PUT /api/brand-profile` creates/updates the single "Default" row; a follow-up `GET /api/brand-profile` returns the same content back.

**F-25 — Cross-cutting error handling / logging / double-submit (initial pass)**
- [x] Stop the backend process while the frontend is open — confirm a clear "can't reach backend" message, not a hang or a silent failure — **this was a real gap found and fixed during Phase 1 (BUG-002, `bugs.md`):** the initial app-load path had no error handling at all and would hang on a loading spinner forever. Fixed: `loadProfile` now catches the failure, sets `profileLoadError`, and `AppGate` renders "Can't reach the Brainy.ai backend. Check that the server is running." with a "Try again" button. Verified that `fetch()` against a dead port rejects as expected (confirmed directly, not assumed) and that the catch path and retry action are wired correctly; the rendered error screen itself is not visually confirmed. Per-action errors elsewhere (Settings save/clear, login submit) already had this same "check the server is running" messaging from the first build pass.
- [ ] Double-click "Save" in Settings rapidly — confirm only one write happens — not yet built or tested; `ProviderKeyField`'s `Save key` button disables while `isSaving` is true, which should prevent this, but a true rapid-double-click race hasn't been exercised.
- [ ] Check that a deliberately forced backend error actually appears in the backend's log file — not tested; Fastify's default logger is in use but no explicit test of this was run.

---

## Phase 2 — Core canvas

**F-03 — Boards List**
- [x] "New board" creates a board and navigates into it immediately — confirmed live via Playwright against the real running app+backend (Boards List sidebar/list-row redesign pass): submitting the dialog redirects straight to `/brainboards/<new-id>`.
- [~] Renaming a board updates both the list and the open canvas's navbar — confirmed for the list (overflow menu → Rename → row updates). **Not confirmed**: whether a canvas tab for that board, already open in another window/tab at the time of the rename, live-updates its own navbar title — `board-store.ts`'s `boardTitle` is only set on `loadBoard` (mount), so an already-open canvas would only pick up the new title on its next load. Pre-existing behavior, not touched by this pass; flagging rather than assuming.
- [x] Zero-boards state shows an empty-state prompt, not a blank screen — confirmed visually (screenshot): icon + "No boards yet — create your first one…" + a "New board" button, sidebar still present.
- [x] Clicking the favorite star toggles it filled/unfilled and persists across a full page reload — confirmed live via Playwright (toggled on, reloaded, `aria-label="Remove from favorites"` still present post-reload).
- [x] The "Show all boards" button no longer appears inside a filtered folder view — confirmed live (button count 0 on a `?folder=` URL); the sidebar's "All Boards" link is the only way back, same as Trash already relied on its sidebar link.

**F-04 — Folders**
- [x] Renaming a folder from the sidebar (hover → pencil icon) updates the sidebar row and any board's folder chip that references it — confirmed live via Playwright: created "Verify Folder A", renamed to "Verify Folder Renamed", both the sidebar row and a board's chip inside it updated with no reload needed.
- [x] Deleting a folder from the sidebar (hover → trash icon) now opens a real choice dialog instead of silently moving boards — confirmed live, see the Boards List/Folders/Trash polish section below for the full flow.
- [x] Choosing "Move its boards" relocates every board in the deleted folder to the chosen target (or "No folder") and leaves them otherwise untouched — confirmed live via Playwright (board's folder chip disappeared after moving to "No folder").
- [x] Choosing "Delete its boards too" soft-deletes every board in the folder to Trash, not a hard delete — confirmed live via Playwright (board reappeared in `/brainboards/trash`, restorable).
- [x] Deleting the folder that's the currently active `?folder=` filter navigates back to the unfiltered Boards List rather than leaving the page on a now-dangling filter — confirmed live via Playwright (URL check after confirming delete).

**F-05 — Soft-delete / Trash**
- [x] Deleting a board removes it from the main list and shows it in Trash — confirmed live via Playwright: "Move to Trash" (overflow menu) removes it from `/brainboards/all`'s list, and it appears on `/brainboards/trash`.
- [x] Restoring from Trash brings it back — confirmed live via Playwright: "Restore" removes it from Trash and it reappears on `/brainboards/all`. *(Restore-to-original-folder specifically not separately isolated — the board tested wasn't in a folder when trashed.)*
- [x] Permanent delete from Trash removes the board — confirmed live via Playwright: "Delete forever" + confirm dialog removes it from Trash and a follow-up list fetch no longer includes it. *(Cascading nodes/edges/messages deletion confirmed by code read of the DELETE route, not re-verified live in this pass — no nodes existed on the test board.)*

**F-06 — Canvas pan/zoom/select**
- [ ] Pan and zoom work with both mouse and trackpad input
- [ ] Clicking empty canvas clears selection
- [ ] Multi-select via marquee drag selects the right nodes

**F-08 — Board autosave**
- [ ] Edit a node, hard-refresh within a few seconds, edit is retained
- [ ] Rapidly edit text then immediately drag the node — both changes persist

**F-09 — Text nodes**
- [ ] Create, edit, and delete a text node
- [ ] Deleting a text node also removes any edges pointing at it (no orphaned edges)

**F-26 — File/document nodes**
- [ ] Upload a PDF, confirm the node renders with filename/icon and extracted text later shows up correctly when a connected chat node references it (full round-trip tested in Phase 4)
- [ ] Upload a DOCX, same check
- [ ] Upload an XLSX, confirm the extracted tabular summary is sane (not garbled or truncated mid-row)
- [ ] Upload an image, confirm it renders as a visual-only reference with no extraction attempted, and the manual notes field works
- [ ] Upload an unsupported file type, confirm a clear "not supported" message rather than a broken node
- [ ] Upload a corrupted/password-protected PDF, confirm a graceful extraction-failure state, not a crash
- [ ] Re-upload the exact same file content, confirm a cache hit (no re-parsing) — check backend logs or timing

**F-27 — Generic link/reference nodes**
- [ ] Paste a LinkedIn post URL, confirm the node shows the raw URL/title with no automated fetch attempted
- [ ] Manually paste content into the notes area, confirm it's retained and editable
- [ ] Leave the notes area empty, confirm it's correctly omitted later from context assembly rather than sent as empty text (verified in Phase 4)
- [ ] Click-through opens the original URL in a new tab

---

## Boards List / Folders / Trash — polish pass (Istiyak's Folders/Board-Card/Trash feedback)

> Not its own F-### feature — real features (folder rename/delete, favorites) plus UX polish over the already-shipped F-02/F-03/F-04/F-05 Boards List/Folders/Trash, same category as the Top Nav polish pass above. All cases below confirmed live via Playwright against a sandboxed copy of the real app+backend (screenshots of normal + hover states + a full create/rename/delete/favorite/reload round trip), not assumed from reading the code.

**Folder rename/delete (ADR-0082)**
- [x] Hovering a sidebar folder row reveals a pencil and trash icon; neither is visible at rest — confirmed visually (hover screenshot vs. rest screenshot).
- [x] Clicking the pencil opens the same name-prompt dialog used for "New folder", pre-filled with the current name — confirmed live.
- [x] Clicking the trash icon opens `FolderDeleteDialog` with "Move its boards" selected by default (the pre-existing, already-tested behavior) — confirmed visually.
- [x] Selecting "Move its boards" reveals a folder picker (defaulting to "No folder"); selecting "Delete its boards too" hides the picker and shows a danger-styled selected state — confirmed visually (both states screenshotted).
- [x] See F-04 above for the full move/delete/navigate-away confirmations.

**Favorites (ADR-0083)**
- [x] A hollow star shows on every board row by default; clicking it fills solid in a warning/amber color — confirmed visually.
- [x] See F-03 above for the persistence-after-reload confirmation.
- [x] The favorite toggle does not appear on Trash rows (`variant="trash"`) — confirmed by code read and screenshot (Trash rows show only Restore/Delete-forever).

**Boards List / Trash visual consistency (ADR-0084)**
- [x] Trash rows now show the same icon avatar, title, folder chip (if the board had one before deletion — it's cleared on folder-delete-with-boards per BUG-025, but preserved on a plain single-board "Move to Trash"), and timestamp as the Boards List, inside the same rounded bordered list shell — confirmed visually, screenshotted side-by-side.
- [x] Hovering anywhere in a board row's padded bounds — including the left/right edges, not just the middle — shows both the hover background AND a pointer cursor together (BUG-024) — confirmed via a scripted `elementFromPoint()` check at the row's left-edge pixel, not just a screenshot (cursor read `pointer` on the stretched `<a>`, not `default` on the row `<div>`).
- [x] Hovering the first/last item of `board-row-menu.tsx`'s dropdown shows the highlight correctly clipped to the menu's rounded corners (BUG-023) — confirmed visually at a tight crop of the corner.
- [x] The folder chip on a board row shows a small folder icon and sits on its own line below the title, not sharing the title's row — confirmed visually.
- [x] The sidebar's "Folders" label reads as a small-caps section header, visually distinct from "All Boards"/"Trash" above it — confirmed visually.
- [x] The "+ New folder" button shows an accent-tinted background on hover, not just a flat muted one — confirmed visually (hover screenshot).
- [x] `board-row-menu.tsx`'s "No folder" option shows a folder-with-X icon when unselected (previously a "move into folder" icon, which read backwards for this option) — confirmed visually; every real folder in that same list now shows the plain folder icon, matching the sidebar's own icon.

---

## Phase 2.5 — Node card overhaul + deletion/undo UX + video-link metadata

**Node card visual**
- [ ] Create a text, file, and link node — cards render at the new compact width, color-coded header per type (neutral/neutral/blue)
- [ ] Hover a card — visible shadow/border change (not just a cursor change)
- [ ] 3-dot menu only appears on hover/focus of the card, not always-on

**Deletion (supersedes the old "X" button checks)**
- [ ] No "X" button exists anywhere on any node header
- [ ] Select a node, press Delete — removed instantly, no reload needed
- [ ] Select a node, press Backspace (not Delete) — node is NOT removed (BUG-008 regression check)
- [ ] Use the 3-dot menu's Delete action — removed instantly, no reload needed (BUG-009 regression check: confirm it disappears immediately, not only after leaving/returning to the board)
- [ ] Delete a node, confirm no confirmation dialog appears, and Ctrl+Z immediately restores it

**Undo/redo**
- [ ] Create a node, Ctrl+Z — node disappears; Ctrl+Shift+Z (or Ctrl+Y) — node reappears
- [ ] Edit a text node's content, blur, Ctrl+Z — content reverts to its pre-edit value
- [ ] Drag a node to a new position, Ctrl+Z — snaps back to its original position
- [ ] Delete a node via the 3-dot menu, Ctrl+Z — node reappears with its original content/position intact
- [ ] Click the Undo/Redo buttons in the bottom-left control cluster — same effect as the keyboard shortcuts
- [ ] While actively typing in a node's textarea, Ctrl+Z only affects that field's own text (native undo), not the canvas history

**Multi-select + pan/zoom**
- [ ] Click one node — selects only it; Shift+click a second node — both selected
- [ ] Drag on empty canvas — marquee-selects nodes under the rubber-band, does not pan
- [ ] Scroll (trackpad/wheel) on the canvas — pans; Ctrl/Cmd+scroll or pinch — zooms
- [ ] A board with only one or two nodes doesn't open absurdly zoomed in

**Video-link metadata (Phase 5 pull-forward — metadata/thumbnail only)**
- [ ] Paste a valid YouTube URL onto the canvas — a video-style card appears immediately (loading state), then fills in with the real title/thumbnail
- [ ] Create a generic link node, type a YouTube URL into its URL field, blur — it converts in place to a video card
- [ ] Click the video card's thumbnail (or its 3-dot menu's "Open original") — opens the real YouTube page in a new tab; confirm no in-app playback happens anywhere
- [ ] Paste an invalid/garbage URL — clean fallback, no crash
- [ ] Paste a non-YouTube URL — still creates the ordinary generic link card, unaffected

**Round 2 — control cluster fix**
- [ ] The Undo/Redo/Zoom-in/Zoom-out/Fit-view cluster sits bottom-right, laid out horizontally, each icon a clean line glyph (not a filled blob)

**Round 2 — universal title/favicon fetch**
- [ ] Create a link node, type/paste any non-video URL (e.g. a news article) — header fills in with the page's real title + favicon once it resolves, no more empty bordered input boxes
- [ ] Point a link node at a URL that can't be reached — header falls back to the raw URL shown as plain text, not a blank or broken layout
- [ ] Click the title text of a resolved link card — becomes editable inline; typed title is preserved (and not overwritten again by a later auto-fetch)
- [ ] A link node's notes field is collapsed by default and expands when focused or when it already has content

**Round 2 — universal type-adaptive paste/upload**
- [ ] Paste plain text (not a URL) onto bare canvas — creates a text node immediately with that content, no action needed
- [ ] Paste a Vimeo URL — creates a video-style card with Vimeo's own title/thumbnail, same as YouTube
- [ ] Upload a PDF, a Word doc, and an Excel file — each gets a distinct icon on its card, resolved immediately at upload time, no reload needed

**Round 2 — hover-only delete "X"**
- [ ] No "X" is visible on an unhovered card
- [ ] Hovering a card reveals an "X" in its top-left corner; clicking it deletes the node instantly
- [ ] Ctrl+Z immediately restores a node deleted via the hover-X, same as the other two deletion paths

**Round 2 — resizable cards**
- [ ] Select a card — a resize handle appears at its bottom-right corner only; it is not visible when the card isn't selected
- [ ] Drag the resize handle — the card grows/shrinks live; releasing it persists the new size
- [ ] Reload the page — the resized card keeps its new size (not reset to default)
- [ ] Ctrl+Z after a resize — the card snaps back to its previous size
- [ ] The resize handle never visually collides with the hover-only "X" (top-left) or the header's 3-dot menu (top-right)

**Round 2 — ribbon-behind-card styling + icon/color-per-type system**
- [ ] Every node type's colored header reads as a separate layer peeking out behind/around the white body card, not a flat top strip of one bordered box
- [ ] Text = blue, link = gray/neutral, file/document = orange (regardless of pdf/docx/xlsx — icon still varies by kind), YouTube = red, Vimeo = purple
- [ ] A document card's body shows the file size and a download affordance (in addition to the filename already in the header)
- [ ] A YouTube card with a known channel shows a small channel-name badge on its thumbnail
- [ ] No chat-bubble "ask AI" icon appears anywhere on any card header (deliberately omitted — ADR-0071)

**Round 3 — delete "X" repositioned, ribbon tightened, resize hit-target, slim scrollbars**
- [ ] Hovering a card reveals the "X" floating OUTSIDE the card's top-right corner, distinct from the header's inline 3-dot menu
- [ ] The ribbon's colored peek around the white body card reads as a subtle edge, not a loud oversized shoulder
- [ ] A link card whose URL is a YouTube/Vimeo link — even one created before this round, or loaded fresh from the database — converts to a real video card automatically on load, never staying stuck as a raw-input link card
- [ ] Typing/pasting a video URL into a link node's URL field converts it immediately, without needing to click away (blur) first
- [ ] Select a card, aim a drag at its own visible bottom-right corner pixel (not a theoretical handle center) — it resizes, not moves the card
- [ ] Any node content area that overflows (a long note, a long text body) shows a slim, mostly-transparent scrollbar — no blocky native up/down-arrow scrollbar anywhere

**Round 4 — structural fix: ribbon/body locked together, resize fixed for real**
- [ ] On every node type, the colored header and the white body stay visually locked together — same width, same left/right edges, at rest AND throughout a live resize drag (not just before/after)
- [ ] The resize handle never visually detaches from the card — it stays anchored exactly at the card's own bottom-right corner through the whole drag
- [ ] Resizing a YouTube/Vimeo video card grows the thumbnail/preview area itself, not just the red header bar
- [ ] Resizing an image file card grows the image itself, not just the header
- [ ] The hover-only "X" and the header's 3-dot menu have real visual clearance — they don't touch or overlap even when both are visible
- [ ] A document/file card's header reads "Documents" (generic), with the actual filename shown in the body next to its own small file-type icon
- [ ] The Text card's header icon sits inside a small filled chip, not a bare line icon

**Round 5 — light-tint header colors, "open" icon beside the 3-dot menu, corner-radius fix, re-matched icons**
- [ ] Every node type's header shows a pale tinted background with darker same-hue text/icon (not a solid saturated fill with white text) — text=pale blue/blue text, YouTube=pale red/red text, Vimeo=pale indigo/indigo text, file/document=pale amber/amber text, link=pale gray/gray text
- [ ] Hovering a card reveals an "open"/external-link icon directly beside the 3-dot menu trigger, both visible at once — clicking it opens the link/video/file in a new tab without opening the dropdown first
- [ ] Opening the 3-dot dropdown menu no longer lists an "Open" item — only type-specific extra actions (e.g. "Edit link") and "Delete"
- [ ] A resized, scrolling text/note card's body corners follow the outer card's own rounded corner smoothly — no visible notch or sharp edge where a scrollbar or content area meets the card boundary
- [ ] A YouTube card's header icon is a solid filled play-glyph badge (not a generic clapperboard/file icon); a Vimeo card's header icon is a plain (non-badged) video glyph, visually distinct from YouTube's
- [ ] The Text card's filled icon badge renders in blue (not gray/neutral)

**Round 6 — resize text-only, 3-dot menu removed, per-type hover/select ring, per-filetype document colors, text card read-only-by-default, link card redesign, drag-and-drop/paste-file upload**
- [ ] Selecting a text card shows a resize handle at its bottom-right corner; selecting a file/link/video card shows NO resize handle at all
- [ ] No card of any type shows a 3-dot "⋮" menu anywhere, hovered or not
- [ ] Hovering or selecting a card tints its border/ring in that card's OWN accent color (e.g. a YouTube card's ring reads reddish, a link card's reads gray/neutral) — not one universal blue ring on every type
- [ ] Multi-selecting two cards of different types (Shift+click or marquee) shows BOTH their headers and bodies highlighted as one unit, each in its own accent color — not just the body/preview area
- [ ] The hover-only delete "X" is quiet/minimal — no border, no drop shadow, and it does NOT turn red on hover
- [ ] A PDF file card's header reads red/pink, a Word (.docx) file card's reads blue, an Excel (.xlsx) file card's reads green
- [ ] A text card that already has content opens as read-only text (not an editable box) with a title-sized first line; hovering it reveals a pencil "Edit" icon in the header; clicking it switches to an editable textarea; a brand-new, still-empty text card opens directly into edit mode with no extra click needed
- [ ] A link card's header is plain text (clicking it does nothing) — the URL appears as small gray text in its own row below the header, always visible, with a pencil icon beside it to edit the URL
- [ ] A link card whose page has an Open Graph/Twitter-Card image shows a full-width preview image above the URL row, the same visual weight as a video card's thumbnail; a link card with no such image falls back to the plain favicon+title header with no empty image box
- [ ] Dragging a file from the desktop onto the canvas creates a file node at the drop location (not the browser's own file-open behavior)
- [ ] Copying a file in the OS (not a URL or text) and pasting it onto the bare canvas creates a file node (not the browser's own paste behavior)

**Round 7 (ADR-0079) — cross-agent build-break fix (BUG-020); canvas sub-header replaced by a floating icon toolbar**
- [x] `npm run build` (both `apps/web` and `apps/server` workspaces) completes with zero type errors against a freshly re-staged copy of the live device state — confirmed directly, not assumed from an earlier sandbox run.
- [x] A link card's optional preview-image field (`previewImageUrl`) type-checks correctly again and the board-store's `boardFolderId`/`renameBoard` (nav agent's work) are both still present and working — confirmed live: opened a board, breadcrumb showed correctly, renamed it via the breadcrumb, canvas and its Text/Link/File toolbar all worked, zero console/page errors.
- [ ] A link card whose fetched preview image genuinely loads (not just the `data:`-URI structural check from Round 6) — still blocked by this sandbox's lack of real internet egress to external image hosts, unchanged from Round 6's note; not re-attempted this round since nothing about the fix touches image loading itself.
- [x] The old "← Boards / title / Text / Link / File" sub-header no longer renders anywhere on a board route — confirmed live (DOM query for `a:has-text("← Boards")` returns zero matches).
- [x] A new floating icon toolbar renders top-left of the canvas with exactly three buttons (Text/Link/File), each with a correct `aria-label` — confirmed live.
- [x] Hovering a toolbar button shows a tooltip with its FULL name ("Add text note", not just "Text") — confirmed live (tooltip element present, opacity 1, correct text).
- [x] Clicking a toolbar button still performs its action — confirmed live: clicking "Add text note" created a real new node on the canvas (node count went from 1 to 2).
- [x] The bottom-right undo/redo/zoom/fit-view cluster is unchanged — confirmed by code read (no changes made) and live screenshot.

**Round 8 (ADR-0080, ADR-0081) — pan/select gesture reconciliation; canvas background tint + dot-grid visibility (BUG-021)**
- [x] A plain left-click-drag starting on empty canvas pans the viewport directly, no space-bar or other modifier needed — confirmed live via `.react-flow__viewport`'s computed `transform` changing after the drag.
- [x] A Shift+drag starting on empty canvas draws a marquee-selection rectangle instead, and does NOT pan the viewport — confirmed live (a `.react-flow__selection` element appears, and the viewport `transform` is unchanged before/after).
- [x] Shift+click still toggles a single node in/out of the current selection — unchanged, confirmed by code read (`multiSelectionKeyCode` untouched).
- [x] The canvas pane's cursor is the normal arrow at rest (idle, panOnDrag enabled but not actively dragging) — confirmed live via computed `cursor` on `.react-flow__pane` reading "default", not React Flow's own default "grab".
- [x] The cursor becomes "grabbing" during an actual active pan-drag, and reverts to the normal arrow the instant the drag ends — confirmed live; also confirms a regression caught and fixed during this same round's verification (the first version of the fix accidentally also suppressed the "grabbing" cursor mid-drag, showing "default" instead, until a `:not(.dragging)` guard was added).
- [x] The canvas background reads as a pale lavender/blue-gray tint, not plain white/off-white — confirmed live via computed `background-color` on `.react-flow` matching `--color-accent-50` exactly (`rgb(238, 242, 255)`), and visually via screenshot against Istiyak's reference image.
- [x] The dot grid is clearly visible (not barely-there) against the new tinted background, without reading as bold/high-contrast — confirmed via computed dot fill color (`rgb(161, 161, 170)`, `gray.400`) and visually via screenshot.
- [x] BUG-021 fixed: the canvas's `bg-background-canvas` className, present since long before this round, had never actually painted anything (React Flow's own un-layered stylesheet always beat the Tailwind utility) — confirmed the fix via the same computed-`background-color` check above; this bug would have been invisible before this round too, since white-on-white looked correct by coincidence.

---

## Top Nav / Breadcrumb / Profile Dropdown — polish pass (Istiyak's Top Nav feedback)

> Not its own F-### feature — UX polish over the already-shipped F-02 navbar/profile-dropdown, same category as the Phase 2.5 node-card polish rounds above. All cases below confirmed live via Playwright against a sandboxed copy of the real app (screenshots of normal + hover states), not assumed from reading the code.

**Wordmark**
- [x] Hovering the "Brainy.ai" logo link on Boards List/Trash/Settings shows no scale/press animation — confirmed live and by code (no `scale` utility remains in `WORDMARK_LINK_CLASSNAME` or the icon box).
- [x] The logo link still navigates to `/brainboards/all` — unchanged.

**Nav shadow**
- [x] The separator under the top nav reads as a soft, present-but-quiet edge, not a heavy drop-shadow — confirmed visually after softening `shadow-nav`'s second layer (`primitives.json`).

**Avatar**
- [x] The avatar circle is clearly visible against the white navbar (solid accent fill + white initials, not a washed-out near-white tint) — confirmed visually.
- [x] The profile's name renders beside the avatar in the navbar itself, not only inside the open dropdown — confirmed visually.

**Breadcrumb (board-canvas route only)**
- [x] Viewing a board shows a breadcrumb in the navbar's left slot instead of the wordmark — confirmed live on an actual board route, not just Boards List.
- [x] Boards List, Trash, and Settings still show the wordmark, unaffected — confirmed live.
- [x] Round 7 (ADR-0079, corrects the two lines below): order/wording changed to folder (if any, as text) → **"Boards"** as real clickable text (was an icon-only Home link) → board name — confirmed live against a board actually moved into the "Research" folder (breadcrumb read "Research > Boards > <board name>") and against a board with no folder (breadcrumb read "Boards > <board name>").
- [x] ~~Hovering the Home icon or a folder segment shows an accent-color hover~~ — superseded by the line above; hovering the folder segment or "Boards" text both still show the same accent-color hover, confirmed live.
- [x] Double-clicking the board-name segment turns it into an editable field; Enter commits, Escape cancels — confirmed live.
- [x] A pencil icon appears on hovering the board-name segment as a second, discoverable way to trigger the same rename — confirmed live.
- [x] A committed rename persists after a full page reload, and also updates `CanvasShell`'s own toolbar title (shared `board-store.ts` state) with no extra wiring needed — confirmed live.
- [x] ~~`CanvasShell`'s own "← Boards / title / Text / Link / File" toolbar is completely unchanged~~ — superseded by Round 7 (ADR-0079): that sub-header is now REMOVED entirely (it was the exact redundancy Istiyak flagged next), replaced by a floating icon toolbar — see the new Phase 2.5 Round 7 section above.

**Profile dropdown**
- [x] The dropdown header pairs a larger avatar with the name and a short caption — confirmed visually.
- [x] Settings / Keyboard shortcuts / About Brainy.ai each show an icon and a tinted accent hover — confirmed visually (hover screenshot).
- [x] Sign out shows a distinct red hover with a logout icon, visually separated (extra spacing + its own divider) from the rest of the menu — confirmed visually (hover screenshot).
- [x] Sign out still behaves exactly as before (returns to the login/welcome-back screen, profile row untouched) — unchanged logic, confirmed by code read.

---

## Phase 3 — More node types

**F-07 — Grouping and duplication**
- [ ] Group several nodes, move the group, all members move together
- [ ] Duplicate a group whose nodes have edges to nodes outside the group — confirm external edges are NOT copied onto the duplicate
- [ ] Duplicate an entire board — confirm editing the duplicate never affects the original

**F-19 — Multi-select copy/paste across boards**
- [ ] Copy a selection, paste on a different board, confirm new nodes get new IDs and internal edges are preserved

**TF-06 — Connections**
- [ ] Create an edge between two nodes, delete it, confirm it's actually gone (not just visually hidden)

---

## Phase 4 — First chat node

**F-12 — Chat node placement, execution mode & model selection**
- [ ] Unconfigured provider's node type is greyed out in the tools panel
- [ ] Changing one chat node's execution mode doesn't affect any other chat node on the same board
- [ ] Changing one chat node's model doesn't affect any other chat node's model, even same provider, same board
- [ ] A newly placed chat node has a pre-selected default model — never requires a choice before it's usable
- [ ] Set two chat nodes on the same board to different models, confirm each request actually hits the model it was configured with (check backend logs/response metadata, not just that it responded)

**F-13 — Chat synthesis**
- [ ] Send a prompt with zero connected nodes — works as a plain chat
- [ ] Connect a text node, ask a question about its content, confirm the response actually reflects it (not a generic answer)
- [ ] Connect a file node (F-26), ask a question about its content, confirm the response reflects the extracted text/data
- [ ] Connect a link node (F-27) with manually-pasted content, confirm it's used as context; with empty content, confirm it's silently omitted
- [ ] Disconnect the provider's API key mid-session (clear it in Settings), then try sending — confirm a clear error state, not a silent hang
- [ ] Set a per-node "notes for AI" field, confirm it changes the response in a way that shows it was actually used
- [ ] Double-click "Send" rapidly on a Native API chat node — confirm only one request actually fires (F-25)
- [ ] Open browser dev tools, confirm no stack trace/exception text ever renders in the chat node's error state (F-25)

**F-29 — Estimated cost tracking**
- [ ] Send a Native API prompt, confirm Settings' running total increases by a plausible amount for that provider/model
- [ ] Send a Local LLM or Manual Input message, confirm the running total does NOT increase
- [ ] Confirm the UI clearly labels the figure as an estimate, not an exact bill

**F-16 — Per-node notes field**
- [ ] Edit the notes field mid-conversation — confirm the next message picks it up, previous messages in history are unchanged

**F-20 — Chat-stuck / error states**
- [ ] Force a failed provider call (e.g. temporarily invalid key) — confirm the retry action re-sends without requiring the prompt to be retyped

**F-21 — Brand/Voice Profile (consumption)**
- [ ] A chat node with the profile opted in includes it in context; a sibling node with it opted out does not

---

## Phase 5 — Video nodes

**F-10 — Video link nodes**
- [ ] Paste a valid YouTube link — thumbnail/title load correctly
- [ ] Paste an invalid/garbage URL — clean error state, no crash
- [ ] Paste a link to a private/deleted video — same graceful error treatment

**F-14 — Lazy extraction**
- [ ] First chat reference to a video node's content triggers extraction (visible in-progress state)
- [ ] Second reference to the same video (same or different board) does NOT re-run extraction — confirm via timing or a log check
- [ ] A video that fails to extract (e.g. unsupported/region-locked) shows a clear failure state and the chat node can still be used without it

---

## Phase 6 — Polish + remaining providers

**F-15 — Outliers panel**
- [ ] Search a real channel, toggle Latest/Popular/Outliers, confirm result sets actually differ
- [ ] Quick-add an outlier result creates a correct video link node on the current board

**F-17 — Mindmap output node**
- [ ] Generate a mindmap from a chat response, confirm it reflects that response's actual content
- [ ] Regenerate — confirm it creates a new node rather than overwriting the first one

**F-18 — Live mic input**
- [ ] Deny mic permission — confirm a clear message, rest of the app unaffected
- [ ] Speak a prompt, confirm transcribed text appears for review before sending (not auto-sent)

**F-22 — OpenAI/Gemini chat nodes**
- [ ] Repeat the F-13 test cases against both providers once enabled

---

## Phase 7 — Security hardening

- [ ] Paste a deliberately malformed/shell-metacharacter-laden "URL" into a video node — confirm nothing executes beyond the intended yt-dlp call
- [ ] Confirm the backend is unreachable from another device on the same network (not just unreachable from "outside" in the abstract)
- [ ] Run a full-history `gitleaks` scan — confirm clean before any public-repo step
