# Architecture — Brainy (brainy.ai)

> **What this file is:** a description of the system **as designed/as-built** — the stack, folder structure, data model, and how the pieces talk to each other. Read this to understand *how Brainy works*.
>
> **What this file is not:** the reasoning behind these choices (that's [`rules-decisions.md`](./rules-decisions.md) — every section below links back to the ADR that decided it), the product spec (that's [`prd.md`](./prd.md)), or the entry point for a coding session (that's [`CLAUDE.md`](../CLAUDE.md), at the repo root).
>
> **Keep this file in sync with reality.** When the actual code structure diverges from what's written here (a folder gets renamed, a package gets swapped), update this file in the same change — it should never describe a system that doesn't exist. If a change also represents a new *decision* (not just an implementation detail), add an ADR to `rules-decisions.md` too.

---

## 1. System overview

Brainy is a local-only, single-user, infinite-canvas research/synthesis tool. It runs as two small processes on `localhost`:

```
┌─────────────────────────┐        HTTP + SSE        ┌──────────────────────────┐
│   Frontend (Next.js)    │ ───────────────────────▶ │   Backend (Fastify)      │
│   localhost:3000        │ ◀─────────────────────── │   localhost:4000          │
│                          │        JSON / SSE         │                          │
│  - React Flow canvas    │                           │  - Provider adapters     │
│  - Zustand stores        │                           │  - yt-dlp/ffmpeg jobs    │
│  - shadcn/ui components  │                           │  - Drizzle/SQLite access │
│  - Design tokens (CSS)   │                           │                          │
└─────────────────────────┘                           └──────────────┬───────────┘
                                                                      │
                                                              ┌───────▼────────┐
                                                              │  SQLite (file)  │
                                                              │  brainy.db      │
                                                              └─────────────────┘
```

Both processes run on the user's own machine. Nothing is hosted; there is no cloud component, no account system beyond a cosmetic local profile (ADR-0032), and no network calls except: (a) to AI providers' own APIs, when a chat node is set to Native API mode, and (b) to YouTube/Instagram to fetch public metadata/media for link nodes.

*(Decided: ADR-0010, ADR-0013, ADR-0004)*

---

## 2. Repo structure (monorepo)

```
brainy-app-ai/
├── CLAUDE.md                  # Claude Code entry point — auto-loaded at session start (root, uppercase — required)
├── README.md                  # human-facing front door: what this is, how to run it
├── .claude/
│   ├── settings.json          # team-shared Claude Code settings: permissions, hooks (committed)
│   ├── settings.local.json    # personal overrides (gitignored, Claude Code manages this itself)
│   ├── rules/                 # path-scoped conventions, auto-loaded only when matching files are touched
│   │   ├── db-conventions.md       # paths: apps/server/src/db/**
│   │   ├── token-conventions.md    # paths: packages/tokens/**, apps/web/components/ui/**
│   │   └── error-handling-conventions.md  # paths: apps/server/**, apps/web/**
│   └── skills/                # reusable procedures Claude invokes or is invoked with /name
│       └── phase-check/
│           └── SKILL.md       # runs the build/lint/audit checklist before a phase is called done
├── docs/                      # every planning doc — kept out of the root to keep it clean
│   ├── rules-decisions.md     # ADR log — every decision + rationale
│   ├── architecture.md        # this file — system as designed/built
│   ├── prd.md                 # product spec, phase roadmap
│   ├── feature.md             # feature-by-feature spec, Level-2 user flows
│   ├── implementation_plan.md # the technical build roadmap ("the Blueprint")
│   ├── agents.md               # AI-assisted coding working conventions (deliberately NOT root AGENTS.md — see CLAUDE.md)
│   ├── testing.md             # manual test cases per feature
│   ├── bugs.md                 # error log
│   ├── audit.md                 # periodic built-vs-planned reality checks
│   └── runbooks/               # step-by-step ops procedures (not build tasks — occasional maintenance)
│       ├── restore-from-backup.md
│       └── rotate-api-key.md
├── tools/
│   └── scripts/                # repo-wide operational scripts (not part of any single app)
│       └── (created in Phase 0 — see implementation_plan.md: backup-db script, clean-install check)
├── apps/
│   ├── web/                 # Next.js frontend
│   │   ├── app/              # Next.js app router
│   │   ├── components/       # composed components (screens use these)
│   │   │   ├── ui/           # shadcn/ui primitives (code-owned, generated)
│   │   │   └── canvas/       # React Flow node components, edges, toolbar
│   │   ├── stores/           # Zustand stores (board store, UI store, settings store)
│   │   ├── lib/              # API client, SSE client, utils
│   │   └── styles/           # generated CSS variables (from tokens), globals.css
│   └── server/               # Fastify backend
│       ├── src/
│       │   ├── routes/       # REST + SSE route handlers
│       │   ├── providers/    # AI provider-adapter implementations
│       │   ├── extraction/   # yt-dlp/ffmpeg/Whisper pipeline
│       │   ├── db/           # Drizzle schema + migrations
│       │   └── index.ts      # server entry
│       └── drizzle/          # generated migrations
├── packages/
│   └── tokens/               # design tokens source + Style Dictionary build
│       ├── tokens/
│       │   ├── primitives.json
│       │   └── semantic.json
│       ├── style-dictionary.config.js
│       └── build/            # generated output (Tailwind config, CSS vars) — gitignored
├── .storybook/                # Storybook config (documents apps/web/components/ui)
├── .gitleaks.toml
├── .gitignore
└── package.json                # workspace root (npm/pnpm workspaces)
```

**Why a monorepo, two processes, not one Next.js app:** keeps heavy processing (AI calls, yt-dlp, ffmpeg) fully isolated from the UI thread, while staying "light" — this is two small processes sharing one repo, not a microservices split. *(ADR-0013, ADR-0007)*

**Why `docs/` instead of a flat root, and why `.claude/rules/`+`.claude/skills/` exist:** researched directly against Claude Code's actual conventions (not assumed) — `CLAUDE.md` must be uppercase at root to auto-load; a root `AGENTS.md` would be treated as an alternative to `CLAUDE.md` itself, not a second doc, which is why `agents.md` lives in `docs/` instead; `.claude/rules/*.md` files with `paths` frontmatter load automatically only when Claude touches matching files, which keeps specific conventions (DB naming, token rules) out of context until they're actually relevant, improving adherence without bloating every session; `.claude/skills/` are reusable, invokable procedures distinct from one-off instructions. *(ADR-0050)*

---

## 3. Frontend architecture

### 3.1 Layering (token-first, component-based)

```
design tokens (packages/tokens)
        │
        ▼
Tailwind config + CSS variables (generated)
        │
        ▼
shadcn/ui primitives (apps/web/components/ui) — button, input, dialog, etc.
        │
        ▼
composed components (apps/web/components/canvas) — chat node, video node, toolbar
        │
        ▼
screens (apps/web/app/*) — Boards List, Canvas view
```

Nothing below the tokens layer may hardcode a color or spacing value — enforced by an automated lint rule. *(ADR-0024, ADR-0031)*

### 3.2 State management

**Zustand**, not Redux. One store per concern, not one giant global store:
- **Board store** — the currently open Brainboard's nodes, edges, selection state. This is the high-frequency store (node dragging/resizing) — Zustand's update model is specifically chosen to keep this fast.
- **UI store** — panel open/closed states, active tool, modal state.
- **Settings store** — provider API-key presence (not the keys themselves — those live server-side in SQLite, never sent to or held in frontend state), per-node execution mode defaults.

*(ADR-0012)*

### 3.3 Canvas

React Flow renders the infinite canvas. Each node type (text, YouTube link, Instagram link, chat-per-provider, mindmap output, group) is a custom React Flow node component living in `components/canvas/`. Edges carry no data themselves — they define *which nodes feed context into which chat nodes*; the actual context assembly happens server-side when a chat node is invoked (see §4.3).

*(ADR-0011)*

### 3.4 Routing

`/brainboard/all` — the Boards List. `/brainboard/[id]` — an individual Brainboard's canvas. Base URL lives in environment config (`NEXT_PUBLIC_APP_URL` or equivalent), never hardcoded, so `localhost:3000` → `https://app.brainy.ai` (if ever hosted) is a config change only.

*(ADR-0023)*

---

## 4. Backend architecture

### 4.1 Responsibilities

The Fastify backend owns everything that must not touch the UI thread:
- All database reads/writes (via Drizzle)
- All AI provider calls (streamed back to the frontend via SSE)
- All yt-dlp/ffmpeg/transcription jobs
- Secret storage and retrieval (API keys — never exposed to the frontend beyond a boolean "is this provider configured?")

### 4.2 Provider-adapter pattern

Each AI provider (Claude, OpenAI, Gemini) implements a shared adapter interface:

```ts
interface ProviderAdapter {
  id: "claude" | "openai" | "gemini";
  streamChat(input: ChatInput): AsyncIterable<ChatChunk>;
  isConfigured(): Promise<boolean>;   // has an API key been set?
  listModels(): ModelInfo[];          // the model choices this provider exposes, e.g. Haiku/Sonnet/Opus
}

interface ChatInput {
  model: string;        // which specific model within the adapter's provider — per-node, not board-wide
  // ...connected-node context, prompt, etc.
}
```

A chat node's three execution modes map onto this as follows:
- **Native API mode** → calls the matching `ProviderAdapter.streamChat()`, which hits the provider's real API and streams tokens back over SSE, using whichever `model` the node was configured with.
- **Local LLM mode** → a parallel adapter path that calls a local Ollama instance instead of a hosted API — same streaming contract, no API key needed; `model` maps to whichever local model Ollama is serving.
- **Manual Input mode** → no network call at all; the backend assembles the prompt/context and hands it to the frontend to display for copy-paste, then accepts a pasted response back in as if it were a normal reply. `model` has no effect in this mode.

Each provider's node type in the tools panel is disabled in the UI until `isConfigured()` returns true for that provider (i.e., a key exists in `provider_credentials`). MVP wires up and enables only the Claude adapter; OpenAI and Gemini adapters exist as stubs satisfying the interface so the panel's reserved slots are real, not decorative. **Model selection is independent of all of the above and lives per-node**: each chat node stores its own `model`, so one board can mix a cheap/fast model on a simple summary node with a stronger model on a heavy-synthesis node, same provider or not (ADR-0052).

**Cost tracking (F-29, Should-have):** every Native API `streamChat()` call records its token usage onto the resulting `chat_messages` row; Settings sums these against each provider's published per-token rate for a running *estimated* spend total. This is explicitly an estimate, not a reconciled bill — Local LLM and Manual Input messages are never counted, since neither has a metered cost.

*(ADR-0018, ADR-0019, ADR-0052)*

### 4.3 Context assembly for chat nodes

When a chat node is invoked, the backend:
1. Looks up which nodes are connected to it via `edges`.
2. For each connected node, resolves its content by `type`:
   - **text** nodes return their text directly.
   - **video** nodes trigger lazy extraction if not already cached (§4.4).
   - **file** nodes (PDF/DOCX/XLSX) return their cached extracted text/data, triggering extraction first on a cache miss — the same lazy pattern as video, keyed by content hash instead of source URL (§4.4, ADR-0053). Image-type file nodes contribute only their manual notes field, if set — there's no extracted text to fall back on.
   - **link** nodes return their manually-pasted content field if the user filled one in; an empty one is omitted entirely rather than contributing an empty string (ADR-0053).
   - other **chat** nodes contribute their last response.
3. Appends the node's own "notes for AI" field (if set) and the Brand/Voice Profile (if attached) as additional context.
4. Assembles the final prompt and streams it to the selected `ProviderAdapter`, using that chat node's configured `model` (§4.2).

*(ADR-0019, ADR-0039, ADR-0053)*

### 4.4 Lazy extraction pipeline

YouTube/Instagram nodes store only a link + fetched thumbnail/title metadata at creation time — no transcript work happens yet. The first time a connected chat node actually needs that node's deep content:
1. Backend checks `extraction_cache` for an existing entry keyed by source URL.
2. If missing: runs `yt-dlp` to pull audio, `ffmpeg` to normalize it, then a Whisper transcription pass.
3. Result is written to `extraction_cache` and used immediately — never re-run for the same source again.

**Tooling (no Python by default):** the standalone `yt-dlp.exe` build (bundles its own interpreter, not `pip install yt-dlp`), the native `ffmpeg.exe` binary, and `whisper.cpp` invoked through a Node package that wraps it as a subprocess — not OpenAI's Python `whisper` package, and not a paid cloud Whisper API (would break the $0-by-default principle). This keeps the dev environment to Node/npm plus two downloaded binaries, no second language runtime. Python remains an explicit fallback if this route hits a real wall during Phase 5 (reliability or quality), not something excluded going forward. None of this is needed for Phase 0 — nothing in that phase touches the extraction pipeline.

**Same pattern, reused for file nodes (ADR-0053):** PDF/DOCX/XLSX file nodes (F-26) go through the identical lazy-check-cache-extract-cache-write flow, just keyed by a hash of the file's content instead of a source URL, and using Node-native parsing libraries (`pdf-parse`, `mammoth`, an XLSX reader) instead of yt-dlp/ffmpeg/Whisper — still no Python, consistent with the tooling decision above. `extraction_cache` is shared by both; it was never meant to be video-specific, just "the cache for anything expensive to pull text/data out of."

*(ADR-0044, ADR-0051, ADR-0053)*

### 4.5 Streaming (SSE)

Chat responses stream over Server-Sent Events rather than a single blocking response, so the frontend can render tokens as they arrive rather than waiting on the full generation.

*(ADR-0014)*

---

## 5. Data layer

### 5.1 Stack

SQLite (single file, `brainy.db`) behind **Drizzle ORM**. Drizzle is the abstraction boundary — if a future migration to Postgres/MySQL or a Firebase sync layer is ever needed, the application code talks to Drizzle, not to SQLite directly.

*(ADR-0015, ADR-0016)*

### 5.2 Naming conventions

- `snake_case`, plural table names, no `tbl` prefix.
- Foreign keys: `<singular_table>_id`.
- Every table: `created_at`, `updated_at`. `boards` additionally: `deleted_at` (soft-delete → Trash UI).
- Booleans: `is_`/`has_` prefix.
- Primary keys: **UUID**, not auto-increment — chosen for future multi-device merge safety even though sync isn't built yet.

*(ADR-0020, ADR-0021)*

### 5.3 Draft v0 schema (grows via Drizzle migrations as features are built)

| Table | Purpose | Key columns beyond id/timestamps |
|---|---|---|
| `users` | Single local profile (cosmetic — ADR-0032) | `name`, `avatar_initials` |
| `boards` | One Brainboard (canvas) | `title`, `folder_id`, `deleted_at` |
| `folders` | Optional grouping of boards in the Boards List | `name`, `parent_folder_id` |
| `nodes` | Any node on a canvas (text, video link, **file/document, link/reference**, chat, mindmap, group) | `board_id`, `type`, `position_x`, `position_y`, `data` (JSON, shape depends on `type`) |
| `edges` | Connections between nodes | `board_id`, `source_node_id`, `target_node_id` |
| `chat_messages` | Message history for a chat node | `node_id`, `role`, `content`, `provider`, `model`, `tokens_used`, `estimated_cost` (last three support ADR-0052's cost tracking, F-29 — `model`/`tokens_used` also drive F-12's per-node model selection) |
| `provider_credentials` | API keys per provider | `provider`, `api_key` (encrypted at rest — see §6), `is_enabled` |
| `extraction_cache` | Cached extracted content for anything expensive to pull text/data out of — video/audio transcripts **and, since ADR-0053, file-node PDF/DOCX/XLSX text/data** | `source_key` (a source URL *or* a file-content hash — generalized from the original `source_url`), `extracted_content`, `extracted_at` |
| `brand_profile` | Local Brand/Voice Profile content (ADR-0039) | `label`, `content` |

This table is a **starting point**, not a frozen schema — it is expected to grow as each phase (§8) is implemented. Every addition goes through a Drizzle migration, never a manual schema edit.

*(ADR-0022)*

---

## 6. Security posture

- **Secrets never leave the backend.** API keys live only in `provider_credentials` (SQLite), which is gitignored. The frontend only ever learns a boolean `is_configured` per provider.
- **`gitleaks` pre-commit hook** scans every commit for accidentally-included secrets before it's allowed in.
- **Backend binds to `localhost` only** — not reachable from the network. *(to be verified/enforced explicitly in Phase 7 — see Open Items in rules-decisions.md, ADR-0034)*
- **CORS restricted to the frontend's own origin.** Binding to `localhost` does not by itself stop a malicious website the user visits in their browser from making a `fetch()` call to `localhost:4000` from within that page — the browser doesn't care that the target is "local," only the server's CORS policy decides who's allowed to call it. The Fastify backend must only accept cross-origin requests from `localhost:3000` (the frontend's own origin), never a wildcard `*`. Without this, provider API keys and board content would be readable by any page the user happens to have open. *(ADR-0049)*
- **Subprocess input sanitization** for anything passed into `yt-dlp`/`ffmpeg` (pasted URLs) — **not yet designed in detail; owed as its own security pass before Phase 7.** *(ADR-0034 — open)*
- **Public-repo hygiene**: the repo is structured so that publishable code (everything above) and Istiyak's own private research content (`brainy.db` itself, and anything in `provider_credentials`/`extraction_cache`/`chat_messages`) are cleanly separated by `.gitignore` — the database file is never committed, only the schema/migrations that define its shape.

*(ADR-0033, ADR-0034)*

---

## 7. Design token pipeline

```
packages/tokens/tokens/primitives.json   (W3C DTCG format: $value / $type)
packages/tokens/tokens/semantic.json     (aliases primitives, organized by usage category:
                                           color.text.*, color.background.*, color.border.*)
            │
            ▼  Style Dictionary
            │
   ┌────────┴─────────┐
   ▼                   ▼
Tailwind config    CSS variables (globals.css)
   │                   │
   └─────────┬─────────┘
             ▼
   shadcn/ui primitives + all components consume these — never a raw hex/px value
```

- **Format:** W3C DTCG (2025.10), authored in code for now, structured so a future Figma Tokens Studio export is a drop-in.
- **Semantic organization:** by usage category, not generic color family — prevents a text color being reused as a background color.
- **Palette:** a clean, neutral "Figma light-mode" style palette (neutral grays + one accent) — explicitly independent of EPICINK Studio's brand palette.
- **Typeface:** Inter only.
- **Theme:** single light theme for MVP — no dark mode yet.
- **Documentation:** every component in `components/ui/` gets a Storybook story.
- **Enforcement:** lint rule blocks hardcoded color/spacing values outside the token files.

*(ADR-0009, ADR-0024, ADR-0025, ADR-0026, ADR-0027, ADR-0028, ADR-0029, ADR-0030, ADR-0031)*

---

## 8. Build phases (as they affect architecture)

| Phase | What gets built | Architectural pieces introduced |
|---|---|---|
| 0 | Scaffolding | Monorepo skeleton, git, SQLite + Drizzle base schema, gitleaks hook, token pipeline base |
| 1 | **App Shell** | Navbar, profile/avatar, first-run login (cosmetic), full Settings page (incl. provider API-key fields) — moved here specifically so later phases never need a workaround for credential storage |
| 2 | Core canvas | React Flow canvas, text nodes, **file/document nodes, link/reference nodes**, autosave, board store |
| 3 | More node types | Group nodes, additional content node types |
| 4 | First chat node | Claude provider adapter (**per-node model selection**), SSE streaming, context assembly (text, file, link), **cost tracking** |
| 5 | Video nodes | Thumbnail-only nodes, lazy extraction pipeline, `extraction_cache` |
| 6 | Polish + remaining providers | OpenAI/Gemini adapters enabled, mindmap output node, outliers panel |
| 7 | Security hardening | Subprocess sanitization, localhost-binding verification, public-repo hygiene pass |

Full feature detail per phase lives in `prd.md`; this table exists only to show which architectural pieces unlock which phase.

*(ADR-0040, ADR-0041)*

---

## 9. Hosting (not built now, not blocked later)

Nothing here assumes `localhost`. The base-URL env var (§3.4), the separate backend process (§4), and the SQLite-behind-Drizzle abstraction (§5.1) mean a future move to a hosted deployment (e.g. `app.brainy.ai`) would be a configuration and infrastructure change, not an architecture rewrite — but this is explicitly **not** being built now.

*(ADR-0004, ADR-0016, ADR-0023)*

---

## 10. Backups (local)

Even a local-only, single-user tool has one real failure mode worth guarding against: disk corruption, an accidental delete, or a bad migration wiping out `brainy.db` — which would mean losing all boards/research, not just app state. Until something more automated exists:

- Periodically copy `brainy.db` to a separate location (a different drive, or a synced folder) — manually is fine for now; this is not yet automated.
- Before running any new Drizzle migration against real data, copy `brainy.db` first. A bad migration should be a "restore the copy" problem, never a "lost everything" problem.
- Uploaded/cached media (nothing exists for this yet beyond `extraction_cache`'s text data — no raw video/audio files are retained) doesn't currently need separate backup consideration.

This is intentionally lightweight — matching the "vibe coded feel, professionally executed" principle (ADR-0007) rather than importing full production backup tooling that a local personal tool doesn't need yet. Revisit if Brainy is ever hosted (§9).

*(ADR-0047)*

---

## 11. Error handling & logging conventions

A small set of cross-cutting rules, applied everywhere rather than re-decided per feature (the per-feature error *states* in `feature.md` — F-25 especially — build on these):

- **Backend errors are logged to a file, not just console.** A terminal getting closed shouldn't mean a failure is unrecoverable to diagnose — the Fastify backend writes errors (provider-call failures, yt-dlp/ffmpeg failures, DB errors) to a local log file Istiyak can open and inspect after the fact.
- **The UI never shows a raw stack trace or exception message.** Every user-facing error is a plain, specific sentence ("Couldn't reach Claude — check your API key in Settings" rather than a dumped exception). The real detail goes in the log above, not the screen — this matters even for a personal tool, and matters more if the repo/screenshots are ever shared publicly.
- **"Backend unreachable" is its own distinct error state**, different from "the AI provider failed." Brainy is two processes — if `apps/server` isn't running or crashes, the frontend should say so plainly rather than behaving as if a provider call simply failed.
- **Duplicate-click / double-submit protection on cost-incurring or data-mutating actions.** Specifically: sending a chat prompt in Native API mode (a double-send is a real money cost, not just a UI glitch), creating a board, and saving Settings. The action's button/control disables itself for the duration of the in-flight request.
- **Loading states resolve to something** — either a result or a clear failure — rather than spinning indefinitely. Every async action that can hang gets a reasonable timeout.

*(ADR-0049; see `feature.md` F-25 for how this plays out as a concrete feature, and `testing.md` for the test cases)*
