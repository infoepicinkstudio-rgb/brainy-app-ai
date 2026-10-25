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

*TF-01 — First-run / cosmetic login*
- [ ] Login screen UI: name input + submit
- [ ] Avatar-from-initials generator util (pure function, unit-checkable)
- [ ] On submit: write profile row to `users` table
- [ ] On app load: check `users` table — if a profile exists, skip login and go straight to Boards List
- [ ] Profile (name + avatar) renders correctly after a restart

*Navbar*
- [ ] Persistent navbar component (mounted at root layout, present on every route by construction)
- [ ] Avatar/profile dropdown: Settings link, keyboard-shortcuts reference, About/version info, cosmetic Sign Out
- [ ] Sign Out (cosmetic) returns to login screen without deleting the stored profile

*TF-11 — Settings*
- [ ] Settings route/page shell
- [ ] Provider API key fields for Claude / OpenAI / Gemini, each backed by a row in `provider_credentials`
- [ ] Saving a key updates `is_enabled`/presence correctly; clearing a key reverts it
- [ ] `isConfigured()` check (`architecture.md` §4.2) wired through to a placeholder tools-panel indicator (stub acceptable here — real tools panel UI arrives in Phase 4)
- [ ] Default execution mode setting per provider (Local LLM / Native API / Manual Input) stored and retrievable
- [ ] Brand/Voice Profile editor: create/edit/save content to `brand_profile` table

*Misc App Shell*
- [ ] Keyboard shortcuts reference modal (placeholder content acceptable — finalize once real shortcuts exist)
- [ ] About/version info modal (shows app name "Brainy", version string)
- [ ] **Phase 1 "done looks like" verified**

**Depends on:** Phase 0 (DB, both processes running). **Chosen to come before canvas work specifically so Phase 4 never needs a workaround for credential storage (ADR-0041).**
**Verify with:** `testing.md` Phase 1 section.

---

## Phase 2 — Core canvas

**Objective:** can create a board, add text nodes, close the app, reopen it, and find everything exactly as left — including after a hard refresh.

**Technical approach:**
1. **`boards`/`folders` CRUD routes** in `apps/server` first — Boards List is just a thin UI over these.
2. **Boards List screen**, built against those routes, including the Trash view (soft-delete via `deleted_at` — no new table, just a filtered query).
3. **Board Zustand store** — this is the high-frequency store (ADR-0012); design its update shape before writing canvas UI against it, since retrofitting a store's shape after components depend on it is expensive.
4. **React Flow canvas mount** at `/brainboard/[id]`, initially with pan/zoom/select only — no node types yet.
5. **Text node component**, the first real node type, built against the board store from step 3.
6. **Autosave**: a debounced effect in the board store that writes node/edge changes back via a `nodes`/`edges` PATCH route — implement this *after* text nodes exist, so there's something real to autosave, rather than building the autosave mechanism against nothing.
7. **File/document node and link/reference node components** (F-26, F-27 — ADR-0053), built right after text nodes since they're the same complexity class (static content, no AI/extraction wiring yet — that lands in Phase 4). File node upload handling and actual text/data extraction are two separate steps: get the node rendering with a stored file reference first, add the Node-native PDF/DOCX/XLSX parsing (into `extraction_cache`, keyed by content hash) as a following step — don't block the node's existence on extraction working yet.

**Build checklist:**

*TF-02 — Boards List*
- [ ] Boards List screen renders all non-deleted boards
- [ ] Create new board (writes `boards` row, navigates into it)
- [ ] Rename board
- [ ] Folders: create folder, move board into folder
- [ ] Soft-delete a board (`deleted_at` set, disappears from main list)
- [ ] Trash view shows soft-deleted boards
- [ ] Restore from Trash (`deleted_at` cleared)
- [ ] Permanent delete from Trash (hard delete row + cascade its nodes/edges/messages)

*TF-03 — Canvas navigation*
- [ ] React Flow canvas mounted at `/brainboard/[id]`
- [ ] Pan/zoom works smoothly
- [ ] Single-node selection
- [ ] Multi-node selection (marquee or shift-click)
- [ ] Board Zustand store wired to initial load (fetch nodes/edges on open)
- [ ] Autosave: node position/content changes debounce-write back to SQLite
- [ ] Verified: refresh the page mid-edit, nothing is lost

*TF-04 — Text nodes*
- [ ] Text node component (create, edit inline, delete)
- [ ] Text node content persists through the autosave path above
- [ ] Deleting a text node also removes any edges pointing at it (relevant once Phase 3 adds edges — note it here so it isn't forgotten when edges land)

*TF-12 — File/document nodes (F-26, ADR-0053)*
- [ ] File node component: drag-and-drop or file-picker upload, renders filename/icon/preview, persists a file reference via autosave
- [ ] PDF text extraction (`pdf-parse` or equivalent), written to `extraction_cache` keyed by content hash
- [ ] DOCX text extraction (`mammoth` or equivalent), same cache pattern
- [ ] XLSX extraction into a flattened tabular text summary, same cache pattern
- [ ] Image files accepted as file nodes with no text extraction — visual reference only, plus optional manual notes field (reuses the F-16 notes pattern)
- [ ] Unsupported file type shows a clear message, not a broken node
- [ ] Corrupt/unparseable file shows a graceful extraction-failure state (same shape as F-14's video failure state)
- [ ] Click-through opens/downloads the original file

*TF-13 — Generic link/reference nodes (F-27, ADR-0053)*
- [ ] Link node component: paste a URL, editable title, free-text "paste content here" area, persists via autosave
- [ ] No scraping attempted — confirmed deliberate, not a missing feature
- [ ] Empty content field omitted from context assembly (not sent as empty content)
- [ ] Click-through opens the original URL

- [ ] **Phase 2 "done looks like" verified**

*(Grouping and duplication, originally considered for this phase, are deferred to Phase 3 — see F-07/F-19 in `feature.md` — because duplication of a group needs edges to exist first to test the "external edges aren't copied" rule correctly.)*

**Depends on:** Phase 1 (App Shell must exist so there's a navbar/route shell to put the canvas into).
**Verify with:** `testing.md` Phase 2 section.

---

## Phase 3 — More node types

**Objective:** can group nodes, connect two nodes with an edge, and duplicate a selection, all persisting correctly.

**Technical approach:**
1. **Edges first** — `edges` table already exists (Phase 0 migration); build the drag-to-connect UI and its persistence route before grouping/duplication, since both of those need real edges to test against correctly.
2. **Grouping** as a client-side selection concept initially (a set of node IDs treated as one unit for move/select) — confirm during implementation whether this needs its own `group` node type in the DB or can stay purely a UI-layer concept; resolve the open question flagged in the original tracker draft (whether "group node type" and "grouping a selection" are the same feature) here, and record whichever way it's decided as a new ADR if it's not already obvious from `architecture.md`.
3. **Duplication last** in this phase, building on both edges and grouping — implement the "external edges not copied" rule (F-07 in `feature.md`) as its own explicit test case, not an assumption.

**Build checklist:**

*TF-06 — Connections*
- [ ] Drag-to-connect edge creation UI
- [ ] Edge persists to `edges` table
- [ ] Edge deletion (click/select + delete)
- [ ] Edge visually distinguishes direction (source → target)

*Grouping*
- [ ] Resolve: is "group" its own node type, or a UI-only selection concept? Decide and record the answer.
- [ ] Group selected nodes into one movable/selectable unit
- [ ] Ungroup without altering member positions relative to each other

*Duplication (F-07, F-19)*
- [ ] Duplicate a single node
- [ ] Duplicate a group — confirm internal edges are preserved, external edges are NOT copied onto the duplicate
- [ ] Duplicate an entire board — confirm the duplicate is fully independent of the original
- [ ] Copy/paste a selection across boards — new nodes get new UUIDs, internal edges preserved
- [ ] **Phase 3 "done looks like" verified**

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
- [ ] `ProviderAdapter` interface defined; Claude implementation real (incl. `listModels()`), OpenAI/Gemini stubs present and satisfy the interface
- [ ] Real tools panel component (replaces Phase 1 stub), Claude enabled/disabled per `isConfigured()`
- [ ] Claude chat node type component, placeable on canvas from the tools panel
- [ ] Per-node execution-mode selector UI — MVP only requires **Native API** to function; Local LLM/Manual Input visible but may be inert (say so plainly if selected)
- [ ] Per-node model selector UI (F-12, ADR-0052) — independent of execution mode, defaults to a sane model, never blocks node placement on a choice

*TF-08 — Chat synthesis*
- [ ] SSE route on backend for chat streaming, tested against a hardcoded prompt first
- [ ] Frontend SSE client consuming the stream, rendering tokens as they arrive
- [ ] Context-assembly module: resolve connected text, file, and link nodes' content into the prompt (video nodes deferred to Phase 5)
- [ ] `chat_messages` persistence (both user prompt and streamed response saved), including `model`/`tokens_used`/`estimated_cost` for Native API calls
- [ ] Per-node "notes for AI" field exists on the node and is included in context assembly
- [ ] Error/stuck state UI (what the user sees if the API call fails or hangs) + retry action that re-sends without requiring the prompt to be retyped
- [ ] Brand/Voice Profile opt-in per chat node, included in context assembly when opted in
- [ ] Estimated cost running-total view in Settings (F-29), summing Native API usage per provider — explicitly labeled as an estimate
- [ ] **Phase 4 "done looks like" verified** — a real connected-node-aware streamed response confirmed, using the model chosen on that specific node

**Depends on:** Phase 1 (API-key storage), Phase 3 (edges — context assembly reads connections).
**Verify with:** `testing.md` Phase 4 section.

---

## Phase 5 — Video nodes

**Objective:** pasting a YouTube link renders a thumbnail node instantly; connecting it to a chat node and asking a question about its content triggers extraction once, caches it, and a second question does not re-trigger extraction.

**Technical approach:**
0. **Install the pipeline binaries before writing any extraction code** — `yt-dlp.exe` (standalone build, no Python), `ffmpeg.exe` — both need to be on `PATH` or referenced by an explicit path in config. No Python install needed for this phase by default (ADR-0051); if the Node/whisper.cpp wrapper route is abandoned later, that's the point to revisit installing Python.
1. **Metadata fetch first** (thumbnail/title only) — a lightweight route, no subprocess work, gets the video node rendering correctly before the heavier extraction pipeline exists at all.
2. **`extraction_cache` lookup logic** as its own function (`checkCache(url)`), written and tested against manually-inserted rows *before* the real pipeline exists — proves the cache-hit/cache-miss branching is correct independent of yt-dlp actually working.
3. **yt-dlp → ffmpeg → Whisper pipeline** built as a single backend job function, called only on a confirmed cache miss. Whisper step uses a Node package wrapping `whisper.cpp` as a subprocess (ADR-0051) — not a Python call.
4. **Context-assembly extension**: the module from Phase 4 gains a video-node branch — on encountering a video node, call the extraction pipeline (with its cache check) before resolving content, rather than assuming text is already there.
5. **In-progress UI state** last, surfaced through the existing SSE stream (an intermediate status chunk) rather than inventing a second communication channel.

**Build checklist:**

*TF-05 — Add video link node*
- [ ] YouTube link parser + metadata/thumbnail fetch (oEmbed or Data API)
- [ ] Instagram link parser + metadata/thumbnail fetch
- [ ] Video node UI: thumbnail, title, click-through to original — explicitly no in-app playback
- [ ] Invalid/unreachable link handled gracefully (error state on the node, not a crash)

*Lazy extraction pipeline*
- [ ] `yt-dlp.exe` and `ffmpeg.exe` installed on the dev machine and reachable (PATH or explicit config path) — no Python required for this (ADR-0051)
- [ ] `extraction_cache` cache-check function, tested against manually-inserted rows
- [ ] yt-dlp integration (audio pull)
- [ ] ffmpeg normalization step
- [ ] Whisper transcription step (via a Node package wrapping `whisper.cpp`, not a Python call)
- [ ] Cache-check-before-extract logic confirmed end-to-end (second request for the same URL does not re-run the pipeline)
- [ ] In-progress UI state shown on the node/chat while extraction runs (via existing SSE channel)
- [ ] Context assembly updated to include video-node transcripts once extracted
- [ ] Extraction failure (private/region-locked/unsupported) shows a clear failure state; chat can continue without that node's content
- [ ] **Phase 5 "done looks like" verified** — confirmed only one extraction run per source

**Depends on:** Phase 4 (context assembly must already exist to extend).
**Verify with:** `testing.md` Phase 5 section.

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
