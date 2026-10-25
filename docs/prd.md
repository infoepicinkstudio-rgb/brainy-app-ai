# PRD — Brainy (brainy.ai)

> **What this file is:** the product spec — what Brainy does, for whom, in what order, and what "done" looks like per phase.
>
> **Cross-references:** every decision referenced here is explained in [`rules-decisions.md`](./rules-decisions.md) (cited as ADR-####). The system design that implements this spec is in [`architecture.md`](./architecture.md). The Level-2 User Flow detail (branches, edge cases, error states) for each Task Flow below lives in [`feature.md`](./feature.md), one feature entry at a time — this file stays at Task Flow level. Task-by-task build tracking, including the technical build approach per phase, lives in [`implementation_plan.md`](./implementation_plan.md), which breaks every flow below into checkable build steps.

---

## 1. Vision

Brainy is a personal, local-first research-and-synthesis tool for Istiyak's own content workflow. It replaces the need for Poppy.ai's paid infinite-canvas product with a self-built equivalent that costs nothing beyond infrastructure he already has, while matching (not exceeding) the parts of Poppy's workflow that actually matter to his process: dropping in raw material (videos, notes, past content, analytics), connecting it visually, and using AI to synthesize new ideas from whatever's connected.

It is not a product for other people. If it's ever open-sourced, that's a byproduct of building it properly — not a goal driving feature decisions. *(ADR-0001, ADR-0003, ADR-0004)*

### Problem statement

Istiyak's content research today is scattered — YouTube/Instagram outlier research, his own knowledge base, past top-performing posts, raw idea notes, and analytics spreadsheets live in different places with no way to visually connect them or have an AI synthesize across them in one view. Poppy.ai solves this shape of problem but costs money he doesn't currently have to spare, and he'd rather own a lean, purpose-built version anyway.

### Who it's for

One user: Istiyak. There are no other personas, no team features, no sharing. *(ADR-0001)*

### Brand/voice note

Brainy's own visual identity is **independent of EPICINK Studio** — no shared colors, no shared assets *(ADR-0009, ADR-0028)*. Where EPICINK's brand materials *are* relevant is tone-of-voice for in-app copy (error messages, empty states, onboarding text): thoughtful, human, practical, no unnecessary jargon — the same writing principles Istiyak already applies to his content, just not the same visual skin.

---

## 2. Product principles

1. **Local-first, $0 by default.** Every feature must work with zero ongoing cost; paid/API-based upgrades are opt-in per feature, never required. *(ADR-0004, ADR-0019)*
2. **Token-first, nothing hardcoded.** Every visual decision traces back to a design token. *(ADR-0024)*
3. **Light to build, professional underneath.** Conventions are industry-standard; day-to-day building stays lean. *(ADR-0007)*
4. **No forward dependencies.** A phase never silently needs something from a later phase. *(ADR-0040)*
5. **Lazy, not eager.** Expensive operations (transcription, AI calls) happen only when something actually needs the result, and are cached once done. *(ADR-0044)*

---

## 3. Flow-hierarchy convention (read this before the flows below)

**Project-specific definition — intentionally the reverse of the common industry convention, documented explicitly so no one guesses otherwise:**
- **Task Flow = Level 1** — the named task as a whole (e.g. "Add a YouTube video to a board").
- **User Flow = Level 2** — the branches/variants beneath that task (e.g. paste a valid link / paste an invalid link / link to a private video / extraction fails).

*(ADR-0038)*

---

## 4. Core task flows (Level 1)

Each of these is broken into its Level-2 user flows (branches/edge cases) in [`feature.md`](./feature.md) — look up the matching `TF-##` tag there for the full detail. Listed here at Task Flow level so the overall shape of the product is visible in one place.

### TF-01 — First run / cosmetic login
Open app for the first time → see login screen → enter a name → avatar auto-generated from initials → profile persists (SQLite) → land on Boards List. On every subsequent launch, skip straight to Boards List with the persisted profile shown in the navbar. *(ADR-0032)*

### TF-02 — Boards List management
View all Brainboards (grid or list) → create a new board → open a board → rename a board → move a board into a folder → soft-delete a board (Trash) → restore from Trash → permanently delete from Trash. *(ADR-0020, ADR-0021 — soft-delete via `deleted_at`)*

### TF-03 — Canvas navigation
Open a board → pan/zoom the infinite canvas → select single/multiple nodes → group selected nodes → duplicate a node, group, or the whole board → autosave continuously with no explicit save action. *(ADR-0011)*

### TF-04 — Add a text/note node
Add a blank text node to the canvas → type freeform notes → node persists as part of the board's autosave.

### TF-05 — Add a video link node (YouTube/Instagram)
Paste a link → node renders as a thumbnail card (title, thumbnail, click-through to original) → no in-app playback → deep content (transcript) is not fetched yet. *(ADR-0044)*

### TF-06 — Connect nodes
Drag an edge from one node to another → edge represents "this node's content is available as context to that node" → no data is duplicated, the connection is referenced at query time. *(ADR-0011, Architecture §4.3)*

### TF-07 — Configure a chat node's AI provider, model, and mode
Open the tools panel → see Claude/OpenAI/Gemini chat node types → unconfigured providers appear greyed out → go to Settings → enter an API key for a provider → that provider's node type becomes selectable → place a chat node on the canvas → choose its execution mode (Local LLM / Native API / Manual Input) **and, independently, which model to use within that provider** (e.g. a cheaper/faster model for a quick summary node, a stronger model for a heavy-synthesis node) — both choices are per-node, not board-wide, so a single board can mix cheap and strong models side by side. *(ADR-0018, ADR-0019, ADR-0052)*

### TF-08 — Chat node synthesis
Connect one or more content nodes to a chat node → optionally add a per-node "notes for AI" free-text instruction → optionally attach the local Brand/Voice Profile → send a prompt → response streams in via SSE → first time a connected video node's deep content is actually needed, lazy extraction runs automatically and transparently (with a visible in-progress state) → result is cached for next time. *(ADR-0019, ADR-0039, ADR-0044, Architecture §4.3–§4.5)*

### TF-09 — Outliers research panel
Search a YouTube channel → toggle Latest / Popular / Outliers → see outlier-multiplier badges → quick-add a result directly to the current board as a video link node. *(ADR-0005, ADR-0045 — Should-have)*

### TF-10 — Mindmap output node
From a chat node's response (or a selection of connected nodes), generate a Mindmap as its own node type on the canvas. *(ADR-0045 — Should-have)*

### TF-11 — Settings
Open Settings from the navbar dropdown → manage provider API keys → set default execution mode per provider → view/edit the local Brand/Voice Profile content → view estimated running Native API spend → (MVP: nothing else needs to live here yet). *(ADR-0032, ADR-0039, ADR-0052, Architecture §8 Phase 1)*

### TF-12 — Add a file/document node (PDF, DOCX, XLSX)
Drag a local file onto the canvas, or use a file picker → node renders with filename, file-type icon, and a small preview → for PDF/DOCX/XLSX, text/data content is extracted in the background and cached (same `extraction_cache` pattern as video nodes) → extracted content becomes available as context once a connected chat node needs it → click-through opens/downloads the original file. Image files are also accepted as file nodes, but shown as a plain visual reference with an optional manual notes field — no text extraction (no OCR in MVP). *(ADR-0053)*

### TF-13 — Add a generic link/reference node
Paste any URL that isn't a YouTube/Instagram video link (e.g. a LinkedIn post, an article) → node renders with the raw URL, an editable title, and a free-text area for manually pasting the page's content if the user wants it available as AI context → no automated scraping is attempted (confirmed infeasible for LinkedIn and most non-video platforms) → click-through opens the original URL. *(ADR-0053)*

---

## 5. Feature scope (MoSCoW)

### Must-have (MVP)
- Infinite canvas: pan/zoom, select, group, duplicate (TF-03)
- Text/note nodes (TF-04)
- YouTube/Instagram link nodes, thumbnail-only (TF-05)
- File/document nodes — PDF, DOCX, XLSX with text/data extraction; images as visual-only reference (TF-12)
- Generic link/reference nodes — any non-video URL, manually-pasted content, no scraping (TF-13)
- Node-to-node connections (TF-06)
- One working chat node type: **Claude only**, with per-node model selection within that provider (TF-07, TF-08) — OpenAI/Gemini node types exist in the UI as greyed-out/reserved slots but are not required to function in MVP
- Board autosave, Boards List with create/rename/soft-delete/restore (TF-02)
- Cosmetic demo login + App Shell + full Settings (TF-01, TF-11)
- Lazy video transcript extraction with caching (TF-05, TF-08)
- Cross-cutting error handling, local error logging, and double-submit protection (F-25 in `feature.md`)

*(ADR-0043, ADR-0044, ADR-0049, ADR-0052, ADR-0053)*

### Should-have
- Outliers research panel (TF-09)
- Per-node "notes for AI" field (TF-08)
- Mindmap output node (TF-10)
- Live mic voice input (as an input method into chat nodes, in addition to typing)
- Multi-select + copy/duplicate of blocks/groups/boards (TF-03)
- Documented chat-stuck/chat-error feedback states
- Local Brand/Voice Profile memory (TF-08, TF-11)
- Estimated Native API cost tracking, visible in Settings (TF-11)

*(ADR-0045, ADR-0052)*

### Could-have
- OpenAI and Gemini chat nodes actually enabled (beyond reserved slots)
- Figma MCP-assisted UI polish pass
- "Push to Notion" export of board output

*(ADR-0018, ADR-0036, ADR-0037)*

### Explicitly excluded
- AI-generated Presentation/slideshow output type — not even Could-have
- Any multiplayer/collaboration feature of any kind
- Dark mode (MVP is single light theme; could revisit post-MVP, not scoped now)
- Real authentication/accounts — the login is permanently cosmetic

*(ADR-0001, ADR-0027, ADR-0032, ADR-0046)*

---

## 6. Phased roadmap

| Phase | Name | Ships | Done looks like |
|---|---|---|---|
| 0 | Scaffolding | Monorepo, git, SQLite+Drizzle base schema, gitleaks, token pipeline skeleton | `npm install && npm run dev` starts both processes cleanly with an empty DB; Storybook runs with zero components (ready for Phase 1) |
| 1 | **App Shell** | Navbar, profile/avatar, first-run login, full Settings (incl. provider API-key fields) | A fresh install shows the login screen once, then persists a profile; Settings can store and retrieve a Claude API key from SQLite; provider node types in a placeholder tools panel correctly show enabled/disabled state based on that key |
| 2 | Core canvas | React Flow canvas, text nodes, **file/document nodes, link/reference nodes**, autosave, board store, Boards List CRUD | Can create a board, add text/file/link nodes, close the app, reopen it, and find everything exactly as left — including after a hard refresh |
| 3 | More node types | Group nodes, node connections (edges), duplicate/multi-select | Can group nodes, connect two nodes with an edge, and duplicate a selection, all persisting correctly |
| 4 | First chat node | Claude provider adapter (with **per-node model selection**), SSE streaming, context assembly from connected nodes (text, file, link), **estimated cost tracking** | A Claude chat node, connected to one or more text/file/link nodes, returns a real streamed response that correctly reflects the connected nodes' content, using whichever model was chosen for that node |
| 5 | Video nodes | YouTube/Instagram thumbnail nodes, lazy extraction pipeline, `extraction_cache` | Pasting a YouTube link renders a thumbnail node instantly; connecting it to a chat node and asking a question about its content triggers extraction once, caches it, and a second question does not re-trigger extraction |
| 6 | Polish + remaining providers | OpenAI/Gemini adapters enabled, outliers panel, mindmap output node | All three provider node types fully functional when configured; outliers panel returns real channel data; a Mindmap node can be generated from a chat response |
| 7 | Security hardening | Subprocess input sanitization, localhost-binding verification, public-repo hygiene pass | A deliberately malformed/malicious URL pasted into a video node cannot execute anything beyond the intended yt-dlp call; backend is confirmed unreachable from outside localhost; a dry-run of "what would get published" contains no secrets or personal board content |

No phase requires anything from a later phase — verified explicitly against this constraint when the roadmap was set (see ADR-0040, ADR-0041 for the one violation caught and fixed during scoping).

---

## 7. Success criteria (what "working" means for Brainy, overall)

- Istiyak can do everything he currently does in Poppy.ai's free/basic workflow, inside Brainy, at $0 ongoing cost (or opt-in paid cost only when he chooses Native API mode).
- No board data is ever lost on refresh, restart, or crash (autosave is continuous and reliable).
- A new chat node, connected to real research material, produces genuinely synthesis-quality output — not just a passthrough of the connected content.
- The repo is clean enough that a hired developer could be handed `CLAUDE.md` + `docs/architecture.md` and be productive without a verbal walkthrough.

---

## 8. Out of scope (reaffirmed)

- Multiplayer/collaboration (ADR-0001)
- Real authentication (ADR-0032)
- Dark mode for MVP (ADR-0027)
- AI-generated presentations/slideshows (ADR-0046)
- Hosting/deployment work (Architecture §9 — not blocked later, not built now)
