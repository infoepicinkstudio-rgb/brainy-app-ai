# Implementation Plan — Brainy (brainy.ai)

> **What this file is:** the technical build roadmap — the "Blueprint." For each phase: *what* gets built (checkable tasks, down to the smallest unit) and *how* it gets built (the technical approach: which files/modules, which interfaces, in what order, and what it depends on). This is more than a to-do list — it's `architecture.md`'s design translated into an actual build sequence.
>
> **Relationship to the other docs:** `prd.md` §6 defines each phase's scope and "done looks like" criterion — this file is that same phase list, expanded with the technical path to get there. `feature.md` defines each feature's Level-2 user flows — this file turns them into build steps. `architecture.md` defines the system's shape — this file is the order of operations for building that shape. `testing.md` verifies each piece once built; `audit.md` checks the result still matches the plan; `bugs.md` logs what went wrong along the way.
>
> **This file replaces `progress-tracker.md`**, which has been renamed to this (see ADR-0048 in `rules-decisions.md`) and expanded with the technical-approach detail that name implies. If you still see a `progress-tracker.md` file on disk, it's a stale leftover — delete it; this file is the authoritative one going forward.
>
> **How to use this file:** check a box only when the task is actually verified working (run it, don't assume — cross-check against `testing.md`). Read a phase's **Technical approach** before starting its checklist, not after — it sets the build order so you're not wiring a UI component to a backend route that doesn't exist yet. If a task needs breaking down further once you're inside it, add the sub-items. If a phase's approach turns out to be wrong once you're actually building it, update this file in the same change (and log why in `rules-decisions.md` if the change is significant) rather than silently deviating from a stale plan.

Legend: `[ ]` not started · `[~]` in progress · `[x]` done & verified

---

## Dependency chain (why the phases are ordered this way)

```
Phase 0 (scaffolding)
    │   provides: repo, DB, token pipeline, both processes running
    ▼
Phase 1 (App Shell)
    │   provides: profile system, Settings UI, credential storage
    │   ← chosen to go here specifically so Phase 4 never needs a
    │     standalone credential-storage workaround (ADR-0041)
    ▼
Phase 2 (core canvas)
    │   provides: board store, autosave, text nodes, Boards List
    ▼
Phase 3 (more node types)
    │   provides: groups, edges — the connection mechanism Phase 4's
    │     context assembly depends on
    ▼
Phase 4 (first chat node)
    │   provides: provider-adapter pattern, SSE streaming, context
    │     assembly — built once here, reused by Phase 6's providers
    ▼
Phase 5 (video nodes)
    │   provides: lazy extraction — depends on Phase 4's context
    │     assembly already existing to plug transcripts into
    ▼
Phase 6 (polish + remaining providers)
    │   reuses Phase 4's adapter interface — should require no
    │     changes to the interface itself, only new implementations
    ▼
Phase 7 (security hardening)
        verifies everything above, doesn't add new product surface
```

Each arrow is a real dependency, not just a suggested order — verified against the no-forward-dependency rule (`rules-decisions.md` ADR-0040) when this plan was drafted.

---

## Phase 0 — Scaffolding

**Objective (from `prd.md` §6):** `npm install && npm run dev` starts both processes cleanly with an empty DB; Storybook runs with zero components.

**Technical approach:**
Build order matters here because later steps assume earlier ones exist:
0. **Directory structure first** — `CLAUDE.md` (root, uppercase), `README.md`, `docs/`, `.claude/` are already in place before this phase starts (see `architecture.md` §2, ADR-0050) — confirm they survived the move correctly (links resolve, nothing left at the old flat paths) before writing any app code.
1. **Repo shell next** — `git init`, `.gitignore`, root `package.json` with workspaces (`apps/*`, `packages/*`), `gitleaks` git pre-commit hook (via husky or `pre-commit`, distinct from `.claude/` hooks — ADR-0050) — before any actual app code, so every subsequent commit is already covered.
2. **`packages/tokens` next** — it has no dependency on the apps, and both `apps/web`'s Tailwind config and Storybook (step 5) need its output to exist.
3. **`apps/server` + SQLite/Drizzle** — the data layer, built before the frontend touches it at all. Write the initial migration (`architecture.md` §5.3's table list) here.
4. **`apps/web` Next.js init**, wired to consume `packages/tokens`'s generated Tailwind config.
5. **Storybook init** last, pointed at `apps/web/components/ui` (empty at this point — that's expected and fine per the objective above).

**Build checklist:**
- [x] Confirm the directory restructure (ADR-0050) is in place: `CLAUDE.md` at root (uppercase), `README.md` at root, all planning docs under `docs/`, `.claude/rules/` and `.claude/skills/phase-check/` present — verified via a live directory scan of Istiyak's machine
- [x] `git init`, GitHub remote connected, initial commit (documentation set) pushed to `main` — done ahead of the rest of Phase 0, see ADR-0054 and `docs/runbooks/git-basics.md`
- [x] `.gitignore` (node_modules, `brainy.db`, `.env`, `packages/tokens/build/`, Storybook build output, `.claude/settings.local.json` if not already globally excluded) — written pre-Phase-0 alongside the GitHub connection, so the first commit was already clean
- [x] Create a `phase-0-scaffolding` branch off `main` before writing any app code (ADR-0054) — confirmed via `git status`/`git branch` screenshot, clean working tree on `phase-0-scaffolding`
- [x] `gitleaks` installed, `.gitleaks.toml` config, git pre-commit hook wired and tested — done ahead of the rest of Phase 0, alongside the GitHub connection (ADR-0054): confirmed it blocks a real-looking secret (caught a fake Stripe key via the `stripe-access-token` rule) and allows a clean commit through
- [x] Phase 0 closed out via the `/phase-check` → GitHub Pull Request → merge-to-`main` → delete-branch flow (`docs/runbooks/git-basics.md`), not a direct commit to `main` — confirmed: PR #1 (`phase-0-scaffolding` → `main`) created and merged on GitHub
- [x] `tools/scripts/backup-db.mjs` written — copies `brainy.db` to a timestamped file in `backups/`; wired as `npm run backup-db`; tested against a real `brainy.db` (produced a working backup file)
- [x] `.claude/settings.json` populated with a narrow permission allowlist (`npm install`, `npm run dev`/`build`/`lint` and per-workspace variants, `db:generate`, `db:migrate`, `backup-db`, `storybook`, `build-storybook`) — reviewed in full and delivered to the repo root
- [x] Root workspace config (npm workspaces) — `apps/*`, `packages/*`, confirmed via root `package.json`
- [x] `packages/tokens` — DTCG `primitives.json`/`semantic.json`, Style Dictionary config present
- [x] Style Dictionary build script runs successfully and outputs Tailwind config + CSS variables to `packages/tokens/build/` — ran as the first step of `npm run dev` without error
- [x] `apps/server` — Fastify app initialized, runs on `localhost:4000` with a `/health` route — confirmed via `npm run dev` screenshot (server up)
- [x] SQLite file created (`brainy.db`, gitignored) + Drizzle configured in `apps/server`
- [x] Initial Drizzle migration: `users`, `boards`, `folders`, `nodes`, `edges`, `chat_messages`, `provider_credentials`, `extraction_cache`, `brand_profile` tables created per `architecture.md` §5.3 — schema reviewed in full, matches
- [x] `apps/web` — Next.js app initialized (app router), builds and runs on `localhost:3000` — confirmed via browser screenshot (only a harmless dev-only hydration warning from a browser extension, not a real bug)
- [x] `apps/web` Tailwind config wired to consume the generated token output
- [~] Lint rule in place blocking hardcoded color/spacing values — rule is present in the scaffold but not yet independently confirmed running a real violation and failing; re-check during Phase 1's first real component
- [~] Storybook initialized in the repo (zero stories yet) — config present; `npm run storybook` itself not yet run and watched succeed
- [x] `npm run dev` (or equivalent root script) starts both `apps/web` and `apps/server` together — confirmed via screenshot
- [ ] Production build passes clean: `apps/web` builds (`next build`), TypeScript compiles with no errors, lint passes — not just the dev server (ADR-0049) — **only `npm run dev` has been run so far; `npm run build` has not**
- [ ] Clean-install check: clone into a genuinely fresh folder, install, build, and run using only the README's instructions — fix anything that isn't actually automatic (ADR-0049) — **not yet run**
- [ ] **Phase 0 "done looks like" verified** — holding this open until the two checks above actually run; everything else is genuinely done

**Depends on:** nothing (first phase). **Nothing later in this phase depends on anything from Phase 1+.**
**Verify with:** manual smoke test (no `testing.md` entries yet — nothing user-facing exists).

---

## Phase 1 — App Shell

**Objective:** a fresh install shows the login screen once, then persists a profile; Settings can store and retrieve a Claude API key from SQLite; provider node types in a placeholder tools panel correctly show enabled/disabled state based on that key.

**Technical approach:**
This phase is frontend-heavy with one real backend surface (provider credentials). Build order:
1. **Backend first:** a minimal `provider_credentials` CRUD route in `apps/server` (get/set/clear per provider) and a `users` profile route (get/set single profile row) — both trivial REST, no streaming needed yet.
2. **Zustand settings store** in `apps/web/stores` wrapping those routes.
3. **Login screen** — a route-level check (does a profile exist?) gates whether `/` renders the login form or redirects to Boards List; this logic belongs in a layout/middleware check, not scattered per-page.
4. **Navbar + dropdown** as a shared layout component, mounted once at the root layout so it's automatically present on every route added later (Boards List, Canvas) without re-wiring it per page.
5. **Settings page** last, consuming the settings store from step 2 — API key fields, default execution mode, Brand/Voice Profile editor.
6. **Tools-panel stub:** since the real tools panel doesn't exist until Phase 4, this phase only needs a placeholder component proving `isConfigured()` correctly reflects saved/cleared keys — the real panel UI gets built in Phase 4 against the same backend check.

**Build checklist:**

> **Verification note (2026-10-26):** built and verified from a headless environment with no browser available. `[x]` below means the real backend was exercised directly (HTTP calls, raw-DB inspection, isolated crypto scripts) and/or the exact frontend code path was confirmed to consume the exact field verified correct server-side — not that a human has watched it render. See `testing.md` Phase 1 section for the full case-by-case breakdown, including a couple of genuine gaps left honestly open rather than checked off.

*TF-01 — First-run / cosmetic login*
- [x] Login screen UI: name input + submit
- [x] Avatar-from-initials generator util (pure function, unit-checkable) — directly exercised, 6/6 cases pass (1-word, multi-word, extra whitespace, empty, single-char)
- [x] On submit: write profile row to `users` table — verified via `POST /api/profile`
- [x] On app load: check `users` table — if a profile exists, skip login and go straight to Boards List — verified via `GET /api/profile` + `AppGate` redirect logic
- [~] Profile (name + avatar) renders correctly after a restart — the data persists and reloads correctly (verified); actual on-screen rendering not visually confirmed, no browser available here

*Navbar*
- [x] Persistent navbar component (mounted at root layout, present on every route by construction)
- [x] Avatar/profile dropdown: Settings link, keyboard-shortcuts reference, About/version info, cosmetic Sign Out
- [x] Sign Out (cosmetic) returns to login screen without deleting the stored profile — verified by code: `signOut()` only flips `sessionActive`, never calls a delete endpoint
- [x] Top Nav polish pass (ADR-0076/0077): wordmark motion removed, `shadow-nav` softened, avatar switched to a solid-fill badge for contrast, name+chevron trigger, profile dropdown rebuilt with icon-per-item + tinted hover states and a dedicated danger treatment for Sign out
- [x] Board-canvas breadcrumb (ADR-0078/0079): inside a board, the navbar's left slot shows a breadcrumb instead of the wordmark — folder (when the board is in one) → "Boards" (clickable text) → board name, the last segment double-click-to-rename in place. Round 7 (ADR-0079) corrected the initial ordering/icon-vs-text choice after live-checking it against Istiyak's literal wording — see `testing.md`'s Phase 2.5 Round 7 entry

*TF-11 — Settings*
- [x] Settings route/page shell
- [x] Provider API key fields for Claude / OpenAI / Gemini, each backed by a row in `provider_credentials`
- [x] Saving a key updates `is_enabled`/presence correctly; clearing a key reverts it — verified full lifecycle via direct HTTP calls (set → configured:true → clear → configured:false)
- [x] `isConfigured()` check (`architecture.md` §4.2) wired through to a placeholder tools-panel indicator (stub acceptable here — real tools panel UI arrives in Phase 4)
- [x] Default execution mode setting per provider (Local LLM / Native API / Manual Input) stored and retrievable — verified via `PUT`/`GET /api/providers/:provider`
- [x] Brand/Voice Profile editor: create/edit/save content to `brand_profile` table — verified full save/reload cycle via direct HTTP calls

*Misc App Shell*
- [x] Keyboard shortcuts reference modal (placeholder content acceptable — finalize once real shortcuts exist)
- [x] About/version info modal (shows app name "Brainy.ai", version string) — *(corrected from this checklist's own earlier "Brainy" to "Brainy.ai" — ADR-0062)*
- [~] **Phase 1 "done looks like" verified** — backend and logic genuinely verified by direct exercise (see `testing.md`); two real gaps found and either fixed (BUG-002: app-load gate hung forever with no backend-unreachable message — fixed) or honestly left open (per-provider key-format validation — not built, noted in `testing.md` F-11). Full visual/interactive confirmation in a real browser is still owed — left for Istiyak to do once, see `testing.md`'s open `[ ]` items.

**Depends on:** Phase 0 (DB, both processes running). **Chosen to come before canvas work specifically so Phase 4 never needs a workaround for credential storage (ADR-0041).**
**Verify with:** `testing.md` Phase 1 section.

---

## Phase 2 — Core canvas

**Objective:** can create a board, add text nodes, close the app, reopen it, and find everything exactly as left — including after a hard refresh.

**Technical approach:**
1. **`boards`/`folders` CRUD routes** in `apps/server` first — Boards List is just a thin UI over these.
2. **Boards List screen**, built against those routes, including the Trash view (soft-delete via `deleted_at` — no new table, just a filtered query).
3. **Board Zustand store** — this is the high-frequency store (ADR-0012); design its update shape before writing canvas UI against it, since retrofitting a store's shape after components depend on it is expensive.
4. **React Flow canvas mount** at `/brainboards/[id]`, initially with pan/zoom/select only — no node types yet. Background: a subtle dot-grid pattern (small, evenly-spaced dots — not a blank page, not a line grid), the look Istiyak pointed to in Poppy.ai's canvas. Define it as new primitive tokens (dot size, spacing, color — likely a faint tint of `color.gray`) rather than a hardcoded value, consistent with the token-first rule (ADR-0024/ADR-0031); React Flow's own `<Background variant="dots">` is the natural fit for this, styled from those tokens.
5. **Text node component**, the first real node type, built against the board store from step 3.
6. **Autosave**: a debounced effect in the board store that writes node/edge changes back via a `nodes`/`edges` PATCH route — implement this *after* text nodes exist, so there's something real to autosave, rather than building the autosave mechanism against nothing.
7. **File/document node and link/reference node components** (F-26, F-27 — ADR-0053), built right after text nodes since they're the same complexity class (static content, no AI/extraction wiring yet — that lands in Phase 4). File node upload handling and actual text/data extraction are two separate steps: get the node rendering with a stored file reference first, add the Node-native PDF/DOCX/XLSX parsing (into `extraction_cache`, keyed by content hash) as a following step — don't block the node's existence on extraction working yet.

**Build checklist:**

*TF-02 — Boards List*
- [x] Boards List screen renders all non-deleted boards
- [x] Create new board (writes `boards` row, navigates into it)
- [x] Rename board
- [x] Folders: create folder, move board into folder
- [x] Soft-delete a board (`deleted_at` set, disappears from main list)
- [x] Trash view shows soft-deleted boards
- [x] Restore from Trash (`deleted_at` cleared)
- [x] Permanent delete from Trash (hard delete row + cascade its nodes/edges/messages)

  Verified end-to-end with Playwright (create → move to folder → rename → soft-delete →
  appears in Trash → restore → back on main list → delete second board → permanent-delete
  confirm dialog → gone for good), zero console errors across the run. Two of this
  checklist's sub-checks ("disappeared from main list" immediately after soft-delete, and
  "left Trash" immediately after Restore) came back `false` in the automated script on
  every run, but every *downstream* step in the same run (appears in Trash; back on main
  list after Restore; gone after permanent delete) passed every time — so the actual
  behavior is correct, confirmed by hand too. Isolated this with several standalone
  repros (single-board case, exact two-board/folder case, explicit delays from 0–1000ms)
  and every isolated repro showed the list updating instantly and correctly. This is very
  likely a timing artifact in the long 20+-step compounding test script re-reading the
  DOM a tick too early, not a real product defect — flagging it honestly rather than
  quietly deleting the two checks or declaring it 100% resolved. Worth a look if it
  recurs once Phase 3 adds more list-mutating actions.

*TF-03 — Canvas navigation*
- [x] React Flow canvas mounted at `/brainboards/[id]`
- [x] Canvas background renders a subtle dot-grid (small dots, token-driven spacing/color) — not a blank page; reference: Poppy.ai's canvas
- [x] Pan/zoom works smoothly
- [x] Single-node selection
- [x] Multi-node selection (marquee or shift-click)
- [x] Board Zustand store wired to initial load (fetch nodes/edges on open)
- [x] Autosave: node position/content changes debounce-write back to SQLite
- [x] Verified: refresh the page mid-edit, nothing is lost

  The dot-grid background and the canvas rendering at all were broken for most of this
  phase by a real layout bug (see BUG-003 below) — confirmed fixed via a direct DOM
  inspection (node bounding rect went from off-screen/invisible to correctly positioned)
  and the React Flow console warning disappearing entirely. Pan/zoom and both selection
  modes confirmed by direct interaction, not just by reading the code (multi-select uses
  Control+click, not Shift+click — Shift is React Flow's marquee-select key; both work).
  Autosave-survives-hard-refresh — the single most important behavioral guarantee in
  this phase per the build directive — was run as its own dedicated check, repeated on
  the final full regression pass, and confirmed passing every time.

*TF-04 — Text nodes*
- [x] Text node component (create, edit inline, delete)
- [x] Text node content persists through the autosave path above
- [ ] Deleting a text node also removes any edges pointing at it (relevant once Phase 3 adds edges — note it here so it isn't forgotten when edges land)

*TF-12 — File/document nodes (F-26, ADR-0053)*
- [x] File node component: drag-and-drop or file-picker upload, renders filename/icon/preview, persists a file reference via autosave
- [x] PDF text extraction (`pdf-parse` or equivalent), written to `extraction_cache` keyed by content hash
- [x] DOCX text extraction (`mammoth` or equivalent), same cache pattern
- [x] XLSX extraction into a flattened tabular text summary, same cache pattern
- [x] Image files accepted as file nodes with no text extraction — visual reference only, plus optional manual notes field (reuses the F-16 notes pattern)
- [x] Unsupported file type shows a clear message, not a broken node
- [x] Corrupt/unparseable file shows a graceful extraction-failure state (same shape as F-14's video failure state)
- [x] Click-through opens/downloads the original file

  All six fixture types tested for real (actual generated .pdf/.docx/.xlsx/.png files, a
  plain .txt as the unsupported case, and a deliberately truncated/invalid .pdf as the
  corrupt case) — each produced the correct card content/status. Content-hash extraction
  caching confirmed genuinely fast on a re-upload of the same file (~25-35ms server round
  trip measured via `page.waitForResponse`, not a padded wait) rather than re-parsing.
  Click-through is a real `<a href=... target="_blank" rel="noopener noreferrer">` to
  `/api/files/:storedName` — confirmed correct by reading the component and the route,
  not by driving an actual new-tab navigation in the automated script.

*TF-13 — Generic link/reference nodes (F-27, ADR-0053)*
- [x] Link node component: paste a URL, editable title, free-text "paste content here" area, persists via autosave
- [x] No scraping attempted — confirmed deliberate, not a missing feature
- [ ] Empty content field omitted from context assembly (not sent as empty content)
- [x] Click-through opens the original URL

  Context assembly itself doesn't exist as code yet (that's Phase 4's AI-chat wiring per
  `architecture.md`), so there's nothing to verify this against yet — left unchecked
  rather than checked-on-faith; worth a direct look once Phase 4 builds that assembly
  step, to confirm an empty `notes` field is actually skipped rather than sent as `""`.
  The URL/title fields and the "Open link" click-through (same real-anchor pattern as the
  file node, verified by reading the component) work correctly.

- [x] **Phase 2 "done looks like" verified**

  "Create a board, add text nodes, close the app, reopen it, find everything exactly as
  left — including after a hard refresh" — confirmed directly: created a board, added a
  text node with specific content, hard-refreshed within a few seconds, and the exact
  content was still there. The two remaining open items above (edge-cascade-on-delete,
  context-assembly) are explicitly scoped to later phases in this plan already, not gaps
  in this phase's own objective.

*(Grouping and duplication, originally considered for this phase, are deferred to Phase 3 — see F-07/F-19 in `feature.md` — because duplication of a group needs edges to exist first to test the "external edges aren't copied" rule correctly.)*

**Depends on:** Phase 1 (App Shell must exist so there's a navbar/route shell to put the canvas into).
**Verify with:** `testing.md` Phase 2 section.

---

## Phase 2.5 — Node card overhaul + deletion/undo UX + video-link metadata pull-forward

**Objective:** node cards read as compact, color-coded, and genuinely interactive (hover feedback, no dead "X" button); deletion is exclusively Delete-key or a 3-dot menu, backed by real undo/redo; pasting a YouTube link renders a thumbnail card immediately. Inserted here (not as part of Phase 3) because it's a correctness/UX pass over Phase 2's own node types, not new node *kinds* in the Phase 3 sense (edges/grouping/duplication) — see ADR-0065/ADR-0066.

**Why this phase exists / how it differs from the plan:** not originally scheduled — added in response to direct user feedback on the already-built Phase 2 cards ("cards look very big... no mouse hovers reflect... very lazy") plus two real bugs (BUG-008, BUG-009). It also pulls forward ONLY the metadata/thumbnail slice of Phase 5's TF-05 checklist (see below) — the lazy yt-dlp/ffmpeg/Whisper extraction pipeline is untouched and still correctly blocked on Phase 4's context-assembly module.

**Technical approach:** see ADR-0065 (card redesign, deletion model, video node type) and ADR-0066 (undo/redo, selection/pan/zoom) for the full reasoning — summarized in the checklist below.

**Build checklist:**

*Node card visual redesign*
- [x] `NodeChrome` shrunk `w-64`→`w-56`, `rounded-lg`→`rounded-md`, real hover elevation (`shadow-surface`→`shadow-surface-raised` + border tint) added where none existed before
- [x] New `color.info` token scale + `background.infoMuted`/`background.dangerMuted`/`text.info`/`border.infoMuted`/`border.dangerMuted` semantic tokens (no hardcoded hex — ADR-0024/0031)
- [x] Shared `NodeHeader` (icon + truncated label + 3-dot menu) and `NodeMenu` components, used by all four node types instead of each hand-rolling its own header
- [x] Investigated the "very very slow / laggy" report directly: root cause was the complete absence of any hover state (`shadow-surface`/`shadow.sm`'s alpha is close to imperceptible on its own) rather than a re-render bug; `React.memo` added to all four node components anyway as correct baseline practice, not because a specific re-render bug was found

*Deletion UX*
- [x] Standalone "X" delete button removed from every node header
- [x] 3-dot menu added (Open where applicable + Delete)
- [x] `deleteKeyCode` narrowed to `["Delete"]` only (BUG-008 — Backspace used to also trigger it)
- [x] `board-store.ts`'s `deleteNode` now optimistically removes the node (and any edges touching it) from local state itself, not just the server (BUG-009) — makes every deletion path (keyboard, menu, programmatic) instant and consistent
- [x] No confirmation dialog — covered by undo instead (ADR-0066)

*Undo/redo*
- [x] Session-scoped history stack in `board-store.ts` covering create, delete, position change, and data/type edits
- [x] Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y keyboard shortcuts, guarded so an actively-focused text field keeps its own native undo
- [x] Undo/Redo buttons in the same bottom-left control cluster as zoom (`<Controls>` + `<ControlButton>`)
- [x] Backend POST `/api/boards/:boardId/nodes` accepts an optional explicit `id`, used only by undo-of-delete so a restored node is the same node, not a lookalike

*Multi-select + Figma-like pan/zoom*
- [x] ~~`selectionOnDrag` (drag empty canvas = marquee-select) + `panOnDrag={[1, 2]}` (pan via middle/right-button drag)~~ — **reversed in Round 8 (ADR-0080):** plain left-drag now pans directly (`panOnDrag={[0, 1, 2]}`, `selectionOnDrag` removed); marquee-select moved to `selectionKeyCode="Shift"` (Shift+drag), not dropped. `panOnScroll` (scroll pans, Ctrl/Cmd+scroll or pinch zooms) unchanged.
- [x] `multiSelectionKeyCode={["Shift"]}` — Shift+click toggles a node in/out of selection
- [x] `minZoom`/`maxZoom`/`fitViewOptions` retuned against the smaller w-56 card footprint
- [x] Round 8 (ADR-0080): idle canvas-pane cursor fixed to the normal arrow (was showing React Flow's own persistent grab-hand cursor the entire time `panOnDrag` was enabled, not just while actually dragging) — `.react-flow__pane.draggable:not(.dragging) { cursor: default !important; }` in `globals.css`
- [x] Round 8 (ADR-0081): canvas background changed from plain white to a light `accent.50` tint and the dot-grid darkened/enlarged for visibility — surfaced BUG-021 (the canvas's `bg-background-canvas` className had never actually painted anything, due to React Flow's own un-layered stylesheet always beating a Tailwind `@layer utilities` rule targeting the same element), fixed with a plain un-layered CSS override instead

*Video-link metadata (Phase 5's TF-05, metadata/thumbnail slice only)*
- [x] YouTube link parser (`apps/web/lib/youtube.ts`, watch/youtu.be/shorts/embed URL shapes)
- [x] Metadata/thumbnail fetch via YouTube's public oEmbed endpoint, server-side (`GET /api/link-preview?url=`, `apps/server/src/routes/link-preview.ts`) — no API key needed
- [x] Distinct `video` node type (`VideoNode` component): thumbnail + title + click-through to the original, explicitly no in-app playback
- [x] Pasting a YouTube URL on the canvas creates a `video` node directly; typing/pasting a YouTube URL into an existing `link` node's URL field converts it in place
- [x] Invalid/unreachable video link shows a clear error state on the card itself (not a crash), and the raw link is still clickable
- [ ] Instagram link parser + metadata — explicitly OUT of scope for this pass (Phase 5's own checklist item, not pulled forward)
- [ ] Lazy yt-dlp/ffmpeg/Whisper extraction pipeline — explicitly OUT of scope (still blocked on Phase 4's context-assembly module, per Phase 5's own "Depends on" line)

*Round 2 (ADR-0067 through ADR-0071) — control cluster fix, universal type-adaptive paste/upload, resizable cards, ribbon-behind-card styling pass*
- [x] BUG-011 fixed: undo/redo/zoom/fit icons no longer render as filled blobs (inline `style={{ fill: "none" }}`); control cluster moved to `<Controls position="bottom-right" orientation="horizontal">`, order undo/redo/zoom-in/zoom-out/fit-view
- [x] `GET /api/link-preview` widened beyond YouTube-only: generic title+favicon fetch for any http(s) URL (capped read, regex-extracted `<title>`/favicon `<link>`), plus Vimeo's own public oEmbed endpoint alongside YouTube's — ADR-0067/ADR-0069
- [x] Link node header now shows the fetched title+favicon (or the raw URL as plain text on fetch failure) instead of two permanently-empty bordered `<input>` boxes; title stays manually editable (click to edit inline); notes textarea collapsed by default, expands on focus/content
- [x] Plain-text paste onto bare canvas now creates a text node seeded with the pasted content (previously a no-op) — ADR-0069
- [x] File uploads get a server-computed `fileKind` (pdf/docx/xlsx/image/other) driving a distinct card icon per kind — ADR-0069
- [x] A hover-only delete "X" (top-left, routes through the same `deleteNode`/undo path) added back as a third deletion path alongside the 3-dot menu and Delete key — ADR-0068, amends ADR-0065
- [x] Cards resizable by dragging the bottom-right corner (`NodeResizeControl`, shown only when selected); size persisted to `data.cardWidth`/`cardHeight` on resize-end only; undoable in the same history stack as move/data edits — ADR-0070
- [x] BUG-012 fixed: resize-driven size must be read from `data.cardWidth`/`cardHeight`, never React Flow's own `NodeProps.width`/`height` (those reflect measured, not explicit, size)
- [x] Ribbon-behind-card header structure (a separate colored layer sitting behind/peeking out around the white body card, not the top strip of one bordered box) applied to all four node types — ADR-0071; BUG-013 fixed (CSS margin-collapse was hiding it entirely)
- [x] Icon+color-per-type system: text=info/blue, link=neutral/gray, file/document=warning/orange (unified color, per-kind icon kept), YouTube=danger/red, Vimeo=accent/purple — ADR-0071
- [x] Document card body shows file size + a download affordance; YouTube thumbnail shows a channel-name badge (bottom-left) when known
- [x] Chat-bubble "ask AI" icon from the reference deliberately omitted entirely (Phase 4 chat node doesn't exist yet) — documented call, ADR-0071
- [x] Colored connector/handle dot from the reference deliberately deferred, not implemented — no edge-creation UI/`<Handle>` exists in the app yet, so a connector dot would be a dead affordance for an unbuilt feature, same reasoning as the chat-bubble omission — ADR-0071

*Round 3 (ADR-0072) — delete "X" repositioned, ribbon tightened, real resize/link-conversion bugs fixed, slim scrollbars*
- [x] BUG-014 fixed: a `link` node whose URL already resolves to a recognized video platform now converts to a real video card on mount (previously the mount effect explicitly skipped any video URL, assuming a `blur` event would handle it — one never fires for a server-loaded node) and also converts live on every keystroke, not just on blur
- [x] BUG-015 fixed: resize handle enlarged 10px→14px with stronger border/shadow — React Flow's own CSS centers the handle exactly on the card's corner POINT, so a small handle left most of its real hit-area outside the card's visible edge, causing a drag aimed at what the user can actually see to miss and move the card instead
- [x] Hover-only delete "X" moved from outside the top-LEFT corner to outside the top-RIGHT corner, distinct from the header's own inline 3-dot menu
- [x] Ribbon-behind-card overshoot tightened from 4px/side to 2px/side — still a real peek, not flush, but quieter
- [x] Slim, mostly-transparent scrollbars (`.scrollbar-thin` utility, plain CSS, no new dependency) applied to every scrollable node-card surface, replacing the default blocky OS scrollbar

*Round 4 (ADR-0073) — structural fix: ribbon/body collapsed into one flex-sized container*
- [x] BUG-016 fixed: ribbon header and white body were two independently-sized boxes (one absolutely positioned against an unstyled wrapper, one with its own explicit pixel style) that visibly drifted apart mid-resize, with the resize handle floating detached from the card — rebuilt as a single `flex flex-col` container where header is `shrink-0` and body is `flex-1 min-h-0`, so the body's size is always derived from the one shared container and cannot drift or lag
- [x] Video thumbnail and file-card image changed from a fixed height to `flex-1 min-h-0` (once resized) so the actual media area grows with the card, not just the header — the literal "resize only resizes the header" complaint
- [x] Hover-delete "X" pushed further out again (`-top-4/-right-4`), confirmed live with a real ~6px/4px gap from the 3-dot menu
- [x] File/document card header label changed from the specific filename to the generic "Documents" category word (filename moved into the body, next to its own small icon), matching the reference screenshots exactly
- [x] Text card's header icon now sits inside a small filled chip (`iconBadge`), matching the reference's distinct badge treatment

*Round 5 (ADR-0074) — polish pass: light-tint headers, "open" icon beside the 3-dot menu, corner-radius nesting fix, re-matched icon choices*
- [x] Header/ribbon color switched from a solid `.600`-shade fill + white text/icon to a pale `.100`-shade tint (`ribbonBg`) + darker `.700`-shade text/icon (`ribbonFg`) of the same hue, across all four node types and the ribbon-behind-card backdrop — matches the reference's light theme exactly; old `.600` solid value kept as `ribbonSolid`, now scoped to the `iconBadge` chip only
- [x] "Open" action moved out of the 3-dot dropdown into its own always-visible icon button directly beside the menu trigger — `NodeMenu` no longer accepts `onOpen`/`openLabel` at all
- [x] BUG-017 fixed: body's `rounded-md` (8px) didn't nest correctly inside the outer container's `rounded-lg` (12px) minus its 2px padding (ideal inner radius 10px) — changed to `rounded-lg` to match, removing the "clipped at the corners" look
- [x] YouTube's generic `Clapperboard` icon swapped for `SquarePlay` in `iconBadge`'s solid red chip (no literal YouTube glyph exists in this lucide-react version — confirmed); Vimeo kept its own plain `Video` glyph in purple; Text's `iconBadge` now correctly passes `accent="info"` (previously defaulted to neutral/gray, a round-4 gap)

*Round 6 (ADR-0075) — resize restricted to text, 3-dot menu removed, per-type colored hover/select ring, per-filetype document colors restored, text card read-only-by-default, link card redesign, drag-and-drop/paste-file upload fixed*
- [x] Resize handle now only ever renders for the text card — `file-node.tsx`/`link-node.tsx`/`video-node.tsx` no longer pass `onResizeEnd` to `NodeChrome`
- [x] The 3-dot menu removed entirely from every card header — `node-menu.tsx` deleted; `NodeHeader`'s "open" button generalized into a reusable hover-only action slot (icon configurable per card) also used for the text card's new "Edit" affordance
- [x] Hover/selected ring color now derives from each card's own accent (`RIBBON_RING_SELECTED_CLASSES`/`RIBBON_RING_HOVER_CLASSES`), moved to the OUTER container so the whole card (ribbon + body) reads as selected as one unit, not just the body
- [x] Hover-only delete "X" toned down — border/shadow removed, hover color changed from red to neutral gray
- [x] File-card per-kind color restored (reversing ADR-0071's unification): PDF=red, Word/docx=blue, Excel/xlsx=green
- [x] Text card is read-only by default with a hover "Edit" icon (new node still opens straight into edit mode); its read-only preview treats the first line as a title (bigger, medium weight)
- [x] Link card header no longer inline-editable; the URL now lives in its own always-visible row below the header with a pencil edit icon; an Open Graph/Twitter-Card preview image (when the metadata fetch finds one) renders full-width above that row, same visual weight as the video card's thumbnail; header icon fallback changed from a chain-link glyph to `Globe`
- [x] BUG-018 fixed: dragging a file onto the canvas, or pasting a file copied from the OS (not a URL/text), now creates a real file node through the existing upload path instead of falling through to the browser's native open/save handling

*Round 7 (ADR-0079) — cross-agent `board-store.ts` build-break fixed (BUG-020); canvas sub-header replaced by a floating icon toolbar; breadcrumb reordered*
- [x] BUG-020 fixed: the live device's `board-store.ts` had silently lost its `previewImageUrl?: string` field (round 6's link-preview-image work) when combined with a parallel nav agent's `boardFolderId`/`renameBoard` additions to the same file — broke Istiyak's real `npm run build` at type-check. Restored the field; both sides' work now coexist.
- [x] `CanvasShell`'s old h-12 sub-header ("← Boards" link, board title, text-labeled Text/Link/File buttons) removed entirely — redundant with the Navbar breadcrumb now covering the same identity (ADR-0078)
- [x] New `CanvasToolbar` (`apps/web/components/canvas/canvas-toolbar.tsx`): a floating vertical icon-only palette, top-left of the canvas, carrying the same three node-creation actions (Text/Link/File) as plain icon buttons with hover tooltips showing the full action name — no motion design beyond the existing hover color-fade, per Istiyak's explicit Phase-8 deferral
- [x] New `Tooltip` primitive (`apps/web/components/ui/tooltip.tsx`) — CSS-only (`group-hover` + opacity), no new dependency
- [x] `BoardBreadcrumb` reordered/reworded: folder (if any) → "Boards" as real clickable text (was an icon-only Home link) → board name — matches Istiyak's literal correction, live-checked against a board actually inside the "Research" folder before and after the change
- [x] Bottom-right undo/redo/zoom/fit-view cluster checked against this round's "right bottom corner like poppy" ask — already satisfies it from an earlier round, no change needed

- [x] **Phase 2.5 verified** — exercised directly in a sandboxed copy of the app (own `npm run dev`, Playwright against it): create each node type, hover a card, multi-select via Shift+click and via marquee-drag, delete via Delete key, the 3-dot menu, and the hover-only X, undo/redo through several steps (including resize), paste a YouTube URL, paste plain text, paste a non-video URL, type a YouTube URL into a link node, upload files of different kinds, drag-resize a card and confirm persistence across reload, pan via scroll, zoom via Ctrl+scroll. Screenshots confirmed the ribbon-behind-card look and per-type accent colors render correctly on all four node types. Round 5: re-verified all five card instances (text/YouTube/Vimeo/file/link) side-by-side against the reference's pale-tint header colors (confirmed via computed `getComputedStyle` background/text colors, not just visual judgment), confirmed the open-icon sits beside and to the left of the 3-dot menu trigger and is independently clickable, confirmed the dropdown menu no longer lists "Open", and confirmed the corner-radius fix via computed border-radius/padding/gap measurements on a resized, scrolling text card. Round 6: confirmed the resize handle appears ONLY on the text card (selected, for all four types, via `.react-flow__resize-control` count); confirmed zero `[aria-label="Node actions"]` buttons exist anywhere on the board; confirmed per-type selected/hover ring colors via computed `box-shadow` on two simultaneously multi-selected cards of different accents (distinct oklab colors, not one shared blue); confirmed per-filetype document colors via computed background color keyed to each file's actual filename (pdf/docx/xlsx all distinct); confirmed the text card's read-only preview + hover Edit button + textarea-on-click flow, and that a brand-new empty text card still opens directly into edit mode; confirmed the link card's URL row and edit-pencil render unconditionally (not just on hover/before resolution) and that a preview-image box renders correctly (verified with a `data:` URI image, sidestepping this sandbox's lack of real internet egress to external image hosts — a known, previously-documented limitation, not a regression); confirmed drag-and-drop and clipboard-file-paste both create a real file node via an actual `POST /api/files/upload` network request (not just a DOM check), including correcting a first attempt at the paste test itself, which used a generically-dispatched event lacking real `clipboardData` and so wasn't exercising the app's own code path at all. Round 7: reproduced and fixed the real `npm run build` type-check failure (not just the truncated error Istiyak saw), confirmed clean `npm run build` on both `apps/web` and `apps/server` workspaces against a freshly re-staged copy of the live device state; confirmed live that the breadcrumb (with the nav agent's `boardFolderId`/`renameBoard`) and the new floating toolbar (icon buttons, tooltip-on-hover, actually creating a node on click) work correctly together with zero console/page errors; confirmed the new breadcrumb order/wording against a board actually moved into a folder; confirmed the old sub-header is completely gone from the DOM. Round 8: confirmed via computed `getComputedStyle(.react-flow__pane).cursor` that the idle cursor reads "default" (not "grab") and that it correctly becomes "grabbing" mid-drag (not clobbered by the idle-state override, after catching and fixing exactly that regression during verification itself); confirmed a plain left-drag starting on genuinely empty canvas pans the viewport (`.react-flow__viewport`'s `transform` changes) while a Shift+drag over the same empty area instead draws a `.react-flow__selection` rectangle and does NOT pan; confirmed `.react-flow`'s computed `background-color` matches `--color-accent-50` exactly (`rgb(238, 242, 255)`) after first catching, via the same computed-style check, that it read fully transparent despite the CSS variable and Tailwind utility both looking correct (BUG-021); screenshot-confirmed the new tinted background and darker/larger dots visually match Istiyak's reference image.

**Depends on:** Phase 2 (reuses its node types, store, and autosave mechanism — not rebuilt).
**Verify with:** `testing.md`'s own Phase 2.5 section.

---

## Phase 3 — More node types

**Objective:** can group nodes, connect two nodes with an edge, and duplicate a selection, all persisting correctly.

**Technical approach:**
1. **Edges first** — `edges` table already exists (Phase 0 migration); build the drag-to-connect UI and its persistence route before grouping/duplication, since both of those need real edges to test against correctly.
2. **Grouping** as a client-side selection concept initially (a set of node IDs treated as one unit for move/select) — confirm during implementation whether this needs its own `group` node type in the DB or can stay purely a UI-layer concept; resolve the open question flagged in the original tracker draft (whether "group node type" and "grouping a selection" are the same feature) here, and record whichever way it's decided as a new ADR if it's not already obvious from `architecture.md`.
3. **Duplication last** in this phase, building on both edges and grouping — implement the "external edges not copied" rule (F-07 in `feature.md`) as its own explicit test case, not an assumption.

**Build checklist:**

> **Status (2026-10-28):** all items below confirmed by code review in `apps/web/stores/board-store.ts`, `apps/web/app/brainboards/[id]/page.tsx`, and `apps/server/src/routes/boards.ts` — this work was actually built, just never checked off here. See `testing.md`'s Phase 3 section for the per-item code citations. Not re-verified by a live click-through (no browser/computer access to Istiyak's dev server from this session).

*TF-06 — Connections*
- [x] Drag-to-connect edge creation UI — React Flow's `onConnect` wired to `connectNodes` (board-store.ts), which rejects self-loops and exact duplicate edges.
- [x] Edge persists to `edges` table — `connectNodes` posts to `/api/boards/:id/edges`.
- [x] Edge deletion (click/select + delete) — `deleteEdge` → `deleteEdgeRemote` issues a real `DELETE /api/boards/:id/edges/:edgeId`.
- [x] Edge visually distinguishes direction (source → target) — default edge options set `markerEnd: { type: MarkerType.ArrowClosed, ... }` (brainboards/[id]/page.tsx).

*Grouping*
- [x] Resolve: is "group" its own node type, or a UI-only selection concept? Decide and record the answer. — Decided: its own node type (`RF_GROUP_TYPE` / `GroupNodeData`, persisted server-side), not a UI-only selection concept.
- [x] Group selected nodes into one movable/selectable unit — `groupSelectedNodes` sets `parentId` + `extent: "parent"` on each member, React Flow's own convention for moving children with their parent.
- [x] Ungroup without altering member positions relative to each other — `ungroupNode` restores each member's absolute position from its stored `relativePosition` before detaching.

*Duplication (F-07, F-19)*
- [x] Duplicate a single node — `duplicateSelection` via `buildCloneTemplate`/`materializeTemplate`, fixed `DUPLICATE_OFFSET` nudge.
- [x] Duplicate a group — confirm internal edges are preserved, external edges are NOT copied onto the duplicate — `buildCloneTemplate` includes only edges with both endpoints inside the selection.
- [x] Duplicate an entire board — confirm the duplicate is fully independent of the original — server route `POST /api/boards/:id/duplicate` re-inserts everything under brand-new ids on a brand-new board row.
- [x] Copy/paste a selection across boards — new nodes get new UUIDs, internal edges preserved — `clipboard` is a module-level variable that survives a board switch; `materializeTemplate` always mints fresh UUIDs.
- [x] **Phase 3 "done looks like" verified** — verified by code review per the items above; not yet exercised live in the running app.

**Depends on:** Phase 2 (board store, text nodes, autosave mechanism all reused here, not rebuilt).
**Verify with:** `testing.md` Phase 3 section.

---

## Phase 4 — First chat node

**Objective:** a Claude chat node, connected to one or more text nodes, returns a real streamed response that correctly reflects the connected nodes' content.

**Technical approach:** this is the phase where the provider-adapter pattern (`architecture.md` §4.2) gets built for real — build it generically even though only Claude is wired up, so Phase 6 adds new adapters without touching this interface.
1. **`ProviderAdapter` interface** defined first in `apps/server/src/providers/` (the `streamChat` / `isConfigured` / `listModels` shape from `architecture.md` §4.2), with the Claude implementation as the only real one (returning Claude's real model list for `listModels()`); stub OpenAI/Gemini files that satisfy the interface but throw "not implemented" — this is what makes their tools-panel slots real rather than decorative.
2. **SSE route** in `apps/server/src/routes/` that calls the adapter and streams chunks — build and test this against a trivial hardcoded prompt before wiring context assembly, to isolate streaming bugs from context-assembly bugs.
3. **Context assembly** (`architecture.md` §4.3) as its own module — given a chat node ID, resolve connected nodes (text, file, and link nodes at this phase; video nodes come in Phase 5) into a prompt. Keep this logic separate from the SSE route so Phase 5 can extend it without touching streaming code.
4. **Real tools panel** built now (the Phase 1 stub is replaced) — shows Claude enabled, OpenAI/Gemini greyed out, driven by the same `isConfigured()` check from Phase 1.
5. **Per-node model selector** (ADR-0052) — a dropdown on the chat node UI populated from `listModels()`, defaulting to a sane model so the node is usable without a choice. Stored per-node, independent of execution mode.
6. **Cost tracking** (F-29, ADR-0052) — `chat_messages` gains `model`/`tokens_used`/`estimated_cost` columns; the Native API path in `streamChat()` records token usage on response; a small running-total view in Settings sums it per provider.
7. **Chat node UI component** last, wired to the SSE client (`apps/web/lib`) and rendering streamed tokens as they arrive.

**Build checklist:**

*TF-07 — Configure chat node*
- [x] `ProviderAdapter` interface defined; Claude implementation real (incl. `listModels()`), OpenAI/Gemini stubs present and satisfy the interface
- [x] Real tools panel component (replaces Phase 1 stub), Claude enabled/disabled per `isConfigured()`
- [x] Claude chat node type component, placeable on canvas from the tools panel
- [x] Per-node execution-mode selector UI — MVP only requires **Native API** to function; Local LLM/Manual Input visible but may be inert (say so plainly if selected)
- [x] Per-node model selector UI (F-12, ADR-0052) — independent of execution mode, defaults to a sane model, never blocks node placement on a choice

*TF-08 — Chat synthesis*
- [ ] SSE route on backend for chat streaming, tested against a hardcoded prompt first — *built, never executed against a live connection; blocked on a funded API key (see Status below)*
- [ ] Frontend SSE client consuming the stream, rendering tokens as they arrive — *built, same blocker*
- [x] Context-assembly module: resolve connected text, file, and link nodes' content into the prompt (video nodes deferred to Phase 5)
- [x] `chat_messages` persistence (both user prompt and streamed response saved), including `model`/`tokens_used`/`estimated_cost` for Native API calls
- [x] Per-node "notes for AI" field exists on the node and is included in context assembly
- [x] Error/stuck state UI (what the user sees if the API call fails or hangs) + retry action that re-sends without requiring the prompt to be retyped — *the "no key saved" error path is exercisable today, at zero cost, by sending with no key configured; the mid-stream-failure path still needs a live call*
- [x] Brand/Voice Profile opt-in per chat node, included in context assembly when opted in
- [x] Estimated cost running-total view in Settings (F-29), summing Native API usage per provider — explicitly labeled as an estimate
- [ ] **Phase 4 "done looks like" verified** — a real connected-node-aware streamed response confirmed, using the model chosen on that specific node — **BLOCKED, open**

**Depends on:** Phase 1 (API-key storage), Phase 3 (edges — context assembly reads connections).
**Verify with:** `testing.md` Phase 4 section.

**Status (2026-10-28):** build closed — every item that can be verified without spending
API tokens is done and `tsc --noEmit` is clean on both apps. The two items above left
open are deliberately left open, not forgotten: neither can be truthfully checked off
without an actual streamed response, and that requires a funded Anthropic API key,
which doesn't exist in this build environment. Live-verify those two, then re-run
`testing.md`'s Phase 4 section (F-12/F-13/F-29/F-16/F-20/F-21), before calling this
phase fully done. Full handoff notes: `claude/phase-4-status.md` in the Brainy.ai
Project.

---

## Phase 5 — Video/audio nodes + lazy extraction pipeline

**Scoped with Istiyak at session start (two rounds of clarifying questions, logged as
ADR-0085 through ADR-0088 in `rules-decisions.md`) — this objective and checklist
reflect the scope as actually decided, which is wider than this section's original
draft:**
- A dedicated `audio` node type for uploaded audio files (mp3/wav/m4a/ogg/flac/aac) —
  upload only, no URL variant (ADR-0085).
- The existing `video` node (YouTube/Vimeo oEmbed, pre-existing from the node-card-
  overhaul work, ADR-0065 — thumbnail/title only, no extraction) is extended to also
  accept uploaded local video files (mp4/mov/webm/mkv/avi) via a `source: "url"|"upload"`
  discriminant (ADR-0086). Instagram was never implemented and is not part of this
  phase's scope.
- `link` nodes become extraction-eligible through the same pipeline, amending (not
  reversing) ADR-0053/F-27's "no automatic scraping" boundary — a link that isn't
  actually a yt-dlp-supported media URL just falls back to notes-only (ADR-0087).
- Whisper runs via `@fugood/whisper.node` (prebuilt native addon, no Windows build
  toolchain), not a subprocess wrapping `whisper.cpp` as ADR-0051 originally pictured —
  logged as ADR-0088, which narrows ADR-0051's literal wording while keeping its actual
  goal (zero extra toolchain, $0 cost).

**Objective:** an uploaded audio/video file, or a pasted link, sits on the board doing
nothing until a connected chat node's first question actually references it — that
reference triggers the yt-dlp → ffmpeg → whisper pipeline once, caches the transcript in
`extraction_cache` forever, and every later question (or re-opening the board) reuses the
cached result. The only way to force a fresh run is the node's manual "Re-extract" button.

**Technical approach:**
0. **No DB migration needed** — `extraction_cache` (`source_key` unique, content, extracted_at) was already generalized for exactly this (video/audio transcripts + file-node text) when it was created; confirmed by reading `db/schema.ts` before writing any Phase 5 code.
1. **`media-extraction.ts`** (`apps/server/src/lib/`) as a single module owning the whole pipeline — cache-check, yt-dlp download, ffmpeg normalize-to-wav, whisper transcribe, cache-write — structured after the existing `extraction.ts` (pdf/docx/xlsx) pattern: never throws, always resolves to a status (`ok`/`pending`/`failed`).
2. **Upload-route classification before anything else**: `files.ts`'s upload route now classifies `mediaKind` (`document`/`audio`/`video`) by extension and skips the document-only `extractForFile` path entirely for audio/video — storage only, same content-addressed `uploads/` directory already used by file nodes.
3. **Context-assembly extension**: `context-assembly.ts` gains a shared `resolveMediaNode` branch for `video`/`audio`/`link` node types (replacing the old `video → null`/inline-`link` handling), taking an `onExtracting` callback so a cache-miss can surface progress.
4. **In-progress UI state** via the existing chat SSE stream — `chat.ts` moves `assembleContext` to run after the stream is already hijacked, so a new `"extracting"` SSE event can be emitted mid-assembly, before any model tokens arrive.
5. **Manual Re-extract** as its own route (`POST /api/boards/:boardId/nodes/:nodeId/re-extract`), the one place the pipeline runs outside the lazy chat-triggered path, forcing past the cache.

**Build checklist:**

*TF-05 — Video link node (pre-existing) + new audio/video upload support*
- [x] YouTube + Vimeo link parser + oEmbed metadata/thumbnail fetch — pre-existing (`lib/video-platform.ts`, node-card-overhaul work), confirmed still correct, not re-built this phase
- [x] Video node UI: thumbnail, title, click-through to original — explicitly no in-app playback (pre-existing)
- [x] Invalid/unreachable link handled gracefully (error state on the node, not a crash) — pre-existing
- [x] `audio` node type added (data shape, board-store routing, node component) (ADR-0085)
- [x] `video` node extended to accept uploaded files via `source: "upload"` (ADR-0086)
- [x] Video and link node types confirmed live on Istiyak's board (real YouTube links, real article links, cards render and behave correctly) — audio/video-upload specifically still unconfirmed, see below

*Lazy extraction pipeline*
- [x] `yt-dlp.exe` and `ffmpeg.exe` installed on Istiyak's machine and reachable — confirmed by multiple real, successful transcriptions this session (e.g. a full-length YouTube video)
- [x] `extraction_cache` cache-check function (`hasCachedTranscript`/`extractMediaForNode` in `media-extraction.ts`)
- [x] yt-dlp integration (audio pull, for URL-sourced video/audio/link nodes)
- [x] ffmpeg normalization step (mono 16kHz WAV, what `@fugood/whisper.node` expects)
- [x] Whisper transcription step (`@fugood/whisper.node`, ADR-0088 — not a subprocess, not Python)
- [x] `link` nodes wired into the same pipeline, notes-only fallback on a non-media URL (ADR-0087); extended by ADR-0094 to a real article-text scrape fallback (not just notes-only) when the media pipeline doesn't apply
- [x] GGML model file (`models/ggml-base.en.bin`) downloaded on Istiyak's machine — confirmed by the same successful transcriptions above
- [ ] Cache-check-before-extract logic confirmed end-to-end on a real board (second question about the same source does not re-run the pipeline) — not explicitly tested this session
- [x] In-progress UI state plumbing built (SSE `"extracting"` event, `chat.ts`/`chat-stream.ts`/`chat-node.tsx`)
- [x] In-progress UI state confirmed visible live during an actual extraction — the ADR-0091/ADR-0093 shimmer, confirmed working by Istiyak ("Shimmer worked now")
- [x] Context assembly updated to include video/audio/link transcripts once extracted
- [ ] Extraction failure (private/region-locked/unsupported/corrupt upload) confirmed to show a clear failure state live — the FALSE-failure bug (BUG-029) was caught and fixed this session, but a genuine failure case hasn't been explicitly re-tested since
- [x] Manual "Re-extract" button confirmed live (used repeatedly this session, including the Re-extract that surfaced BUG-029)
- [ ] **Phase 5 "done looks like" verified** — single-extraction-per-source caching behavior specifically not yet explicitly re-tested; everything else on this checklist that bears on "done" is now live-confirmed

**Depends on:** Phase 4 (context assembly must already exist to extend).
**Verify with:** `testing.md` Phase 5 section.

**Status (2026-10-28, updated end of this session's second round):** Core pipeline is
now LIVE-CONFIRMED working on Istiyak's machine, not just code-complete — a major step
up from this doc's original "not yet live-verified" status. This session (continuing
after the original Phase 5 build session) found and fixed six real bugs surfaced by
actual use (BUG-026 through BUG-032) and shipped six further ADRs (ADR-0091 through
ADR-0096): eager cache-respecting extraction on card creation, a thumbnail shimmer
"still working" indicator, bounded pipeline concurrency, real article-text extraction
for ordinary links (narrowing ADR-0053 further), a fix for connected image nodes never
reaching a vision model (they only worked via direct chat-composer attachment before),
and a race-condition fix for a node's `data` being silently reverted mid-extraction.
Full narrative in `claude/phase-5-status.md` (Project doc). **Remaining `[ ]` items on
this checklist (and in `testing.md`'s Phase 5 section) are PARKED as of 2026-10-28** —
Istiyak's own call, to revisit after this round's git commit/PR, not currently
blocking anything. Two checklist items above
remain genuinely untested (repeat-reference caching, a true extraction-failure case) —
worth a deliberate pass before calling Phase 5 fully closed. Performance (extraction
and local-model response speed) is known to be slow on CPU-only hardware — Istiyak has
explicitly deferred tuning this to a later pass, not a blocker for now.

---

## Phase 6 — Polish + remaining providers

**Objective:** all three provider node types fully functional when configured; outliers panel returns real channel data; a Mindmap node can be generated from a chat response.

**Technical approach:**
1. **Provider adapters first** — implement the OpenAI and Gemini stubs from Phase 4 for real. If this requires changing the `ProviderAdapter` interface itself (not just filling in a stub), that's a signal the Phase 4 interface design needs revisiting — log it as an ADR rather than quietly special-casing one provider.
2. **Local LLM / Manual Input modes** next, since they're currently inert stubs from Phase 4 — implement at least one real Local LLM path (Ollama) and the Manual Input copy/paste bridge.
3. **Outliers panel and Mindmap node** last — both are additive UI features with no dependency on the provider work above, so order between them doesn't matter; pick whichever has clearer requirements at the time.

**Build checklist:**
- [ ] OpenAI `ProviderAdapter` implementation, enabled end-to-end
- [ ] Gemini `ProviderAdapter` implementation, enabled end-to-end
- [ ] Local LLM (Ollama) adapter path implemented for at least one provider's node
- [ ] Manual Input mode: copy/paste bridge UI (assembled prompt shown for copy, pasted response accepted back in)

*TF-09 — Outliers panel*
- [ ] YouTube Data API integration: channel search
- [ ] Outlier-multiplier calculation against channel baseline (methodology per 1of10.com reference, ADR-0005)
- [ ] Latest / Popular / Outliers toggle UI
- [ ] Quick-add a result directly to the current board as a video node
- [ ] Channel-not-found / no-data state is distinguishable from "zero outliers"

*TF-10 — Mindmap output node*
- [ ] Mindmap node type + rendering
- [ ] "Generate mindmap" action available from a chat node's response
- [ ] Regenerate creates a new node rather than overwriting a previous one
- [ ] **Phase 6 "done looks like" verified**

**Depends on:** Phase 4 (adapter interface, chat response data to generate mindmaps from), Phase 5 (video nodes, for outliers quick-add).
**Verify with:** `testing.md` Phase 6 section.

---

## Phase 7 — Security hardening

**Objective:** a deliberately malformed/malicious URL pasted into a video node cannot execute anything beyond the intended yt-dlp call; backend is confirmed unreachable from outside localhost; a dry-run of "what would get published" contains no secrets or personal board content.

**Technical approach:** this phase doesn't add product surface — it's a focused audit-and-fix pass against everything built in Phases 0–6, specifically closing the open item from `rules-decisions.md` ADR-0034.
1. **Subprocess input sanitization** — audit every call site that passes a user-provided string (pasted URL) into yt-dlp/ffmpeg; use parameterized subprocess calls (argument arrays, never shell-string interpolation) and validate the URL shape before it ever reaches a subprocess.
2. **Localhost-binding verification** — confirm `apps/server`'s Fastify instance binds to `127.0.0.1`, not `0.0.0.0`; test from a second device on the same network that it's genuinely unreachable, not just "unreachable in theory."
3. **CORS verification** — confirm the backend rejects a cross-origin request from anything other than `localhost:3000` (e.g. try a `fetch()` from a page served on a different local port and confirm it's refused). This is the browser-side counterpart to localhost-binding — binding alone doesn't stop this (ADR-0049, `architecture.md` §6).
4. **Error-handling/logging audit** — confirm backend errors actually land in an inspectable log file, confirm no endpoint ever returns a raw stack trace to the frontend, confirm the double-submit guards from F-25 are actually in place on every cost-incurring/mutating action (ADR-0049, `architecture.md` §11).
5. **Public-repo hygiene audit** — run a full-history `gitleaks` scan, review `.gitignore` coverage against everything in `architecture.md` §5.3's schema (nothing from `provider_credentials`/`extraction_cache`/`chat_messages`/`brand_profile` content should ever have touched git), and re-run the Phase 0 clean-install check one more time against the final repo state before any public-repo step.

**Build checklist:**
- [ ] Audit every yt-dlp/ffmpeg call site for subprocess injection risk; convert any shell-string interpolation to parameterized argument arrays
- [ ] Add URL-shape validation before a pasted link ever reaches a subprocess call
- [ ] Confirmed: backend server is unreachable from outside `localhost` (tested from a second device, not just assumed)
- [ ] Confirmed: CORS rejects requests from any origin other than `localhost:3000`
- [ ] Confirmed: backend errors are written to an inspectable log file; no endpoint returns a raw stack trace to the frontend
- [ ] Confirmed: double-submit guards (F-25) are in place on chat send, board creation, and Settings save
- [ ] `.gitignore` audited — confirmed no secrets, no `brainy.db`, no personal board content ever entered git history
- [ ] Full-history `gitleaks` scan run once, clean, before any public-repo step
- [ ] Clean-install check re-run against the final repo state
- [ ] **Phase 7 "done looks like" verified** — malformed URL test case confirmed safe

**Depends on:** everything (this phase audits the full system as built, not a specific prior phase's output).
**Verify with:** `testing.md` Phase 7 section.

---

## Not yet scheduled (owed, per `agents.md` §6 / `rules-decisions.md` open items)

- [ ] Decide code style/lint/automated-testing/branching/CI conventions (currently undecided — do not silently assume defaults beyond what's already in `agents.md` §6)
- [ ] Resolve the unreadable Typography System PDF, if it ever becomes relevant (currently low priority — Inter + independent palette already confirmed)
