# Rules & Decisions — Brainy (brainy.ai)

> **What this file is:** a dated, append-only log of every decision made about Brainy, with the reasoning behind it. When in doubt about "why does it work this way," this is the file to check — it should always win over guessing.
>
> **What this file is not:** a description of the current system (that's [`architecture.md`](./architecture.md)), the product spec (that's [`prd.md`](./prd.md)), or build steps (that's `CLAUDE.md` at the repo root and `implementation_plan.md`).
>
> **Rule for future edits to this file:** never delete or rewrite a past decision to "fix" it. If a decision changes, add a new entry that supersedes the old one and link back to it (`Supersedes: ADR-0012`). The history of *why we changed our mind* is as valuable as the decision itself. This applies to filenames too — an ADR that mentions `claude.md` (lowercase) is describing what was true *at that point in the project's history*; it is not rewritten just because the file was later renamed to `CLAUDE.md` (see ADR-0050). Only new text added from here on uses the current names.
>
> **Cross-references:** this file is read alongside `architecture.md` (system as-is), `prd.md` (product scope), `CLAUDE.md` (entry point / context for AI coding sessions, repo root), and `agents.md` (AI-assisted coding working conventions). If any of those ever appears to contradict this file, this file is the source of truth for *why*, and should be treated as the one to fix the others against.

---

## How to read an entry

Each decision is numbered (`ADR-####`), dated, and has four parts:
- **Decision** — what we're doing, stated plainly.
- **Rationale** — why, including alternatives we considered and rejected.
- **Status** — `Decided` (locked in) or `Open` (revisit later, noted explicitly).
- **Touches** — which other doc(s) this decision should also be reflected in.

---

## 1. Product scope & identity

### ADR-0001 — Single-user, no multiplayer, ever
**Decision:** Brainy has no multiplayer/collaboration features of any kind — no shared boards, no real-time presence, no comments-between-users. This is a deliberate, permanent scope boundary, not a "not in MVP" deferral.
**Rationale:** Istiyak is the only user. Multiplayer is one of the most expensive feature classes in software (conflict resolution, presence, permissions, sync) and has zero value here. Ruling it out completely — not just deprioritizing it — keeps the data model, sync logic, and auth model trivial by comparison.
**Status:** Decided.
**Touches:** prd.md, architecture.md (data model has no org/team/sharing tables).

### ADR-0002 — Product name and terminology
**Decision:** The app is named **Brainy** (domain concept: `brainy.ai`). An individual canvas/workspace unit inside it is called a **Brainboard** — the equivalent of "a file" in Figma's mental model (one board = one autosaving unit containing all its nodes, connections, and content).
**Rationale:** Needed a name before real docs could reference entities consistently. "Brainboard" was chosen deliberately to parallel Figma's "file" concept so the mental model transfers instantly for a design-literate user.
**Status:** Decided.
**Touches:** prd.md, architecture.md, data model table names.

### ADR-0003 — Reference product and scope boundary
**Decision:** Poppy.ai is the direct reference product for UX patterns and feature shape. Brainy intentionally reproduces Poppy's *workflow* (infinite canvas, node types, chat-on-canvas, outlier research panel) but not its business model, multiplayer features, or anything outside the single-user research-and-synthesis use case.
**Rationale:** Poppy.ai's public marketing site, help-center articles, and in-app patterns were deep-dived specifically to extract validated UX patterns (see ADR-0024 onward) rather than guessing at feature shape from a blank page.
**Status:** Decided.
**Touches:** prd.md.

### ADR-0004 — Zero ongoing cost is a hard constraint, not a preference
**Decision:** The app must run at genuinely $0 ongoing cost beyond infrastructure Istiyak already pays for (his Claude plan). Every architectural choice is filtered through this constraint first.
**Rationale:** Stated explicitly: this is a budget reality, not a principle — he'd use Poppy's paid plan if money weren't a constraint. This is why local SQLite (not a hosted DB), local-first processing (yt-dlp/ffmpeg locally, not a paid transcription API), and the three-mode AI switcher (ADR-0014) all exist.
**Status:** Decided.
**Touches:** prd.md, architecture.md.

### ADR-0005 — Reference methodology for "outliers"
**Decision:** 1of10.com is the confirmed reference for what "outlier" content detection/presentation should look like (multiplier-based scoring vs. a channel's baseline, Latest/Popular/Outliers toggle).
**Rationale:** Avoids reinventing an outlier-detection UX from scratch; borrows a validated mental model.
**Status:** Decided.
**Touches:** prd.md.

### ADR-0006 — Build process: scope fully before any code
**Decision:** No code is written until the system design is broken down to the smallest pieces — no screen-by-screen "vibe coded" building. Maximum clarifying questions are asked during scoping so nothing is left to guesswork.
**Rationale:** Istiyak is a non-coder/solo builder; the explicit goal is professional, industry-standard practices from day one specifically so a real developer could be onboarded later, and so the repo reads as intentional rather than improvised.
**Status:** Decided. (This document and its siblings are the direct output of honoring this rule.)
**Touches:** claude.md, agents.md.

### ADR-0007 — "Vibe coded feel, professionally executed"
**Decision:** The build should feel light and lean to work with day-to-day — not over-engineered, not bureaucratic — while the underlying system design, conventions, and data model remain genuinely professional/industry-standard.
**Rationale:** Explicit design principle balancing two things that usually trade off against each other: speed/ease of solo iteration vs. structural soundness for eventual developer handoff or open-sourcing.
**Status:** Decided.
**Touches:** architecture.md, agents.md.

### ADR-0008 — Scoping happens here; building happens locally
**Decision:** This claude.ai conversation (bound to the "Epic Engine" LinkedIn content Project) is for scoping only. The actual engineering work happens in a dedicated local project folder (`D:\brainy-app-ai`), git-initialized, worked on via a local Claude Code session. `claude.md` in that folder — not this chat or its memory — is the real context-transfer mechanism for future coding sessions.
**Rationale:** This chat's memory is scoped to Istiyak's LinkedIn/content-brand Project and isn't the right long-term home for engineering context. Keeping the two cleanly separated avoids context bleed in either direction.
**Status:** Decided.
**Touches:** claude.md.

### ADR-0009 — EPICINK branding is explicitly NOT reused for Brainy
**Decision:** Brainy does not reuse EPICINK Studio's brand assets, colors, or visual identity. It gets its own independent look.
**Rationale:** EPICINK's palette (warm editorial tones — greens, bricks, maroons, navy, cream) was designed for LinkedIn carousel content, not for a software tool used for hours of focused work. Conflating the two would also blur Brainy's identity as a personal engineering project vs. EPICINK's public-facing content brand.
**Status:** Decided.
**Supersedes:** an earlier open question about whether to ground Brainy's tokens in EPICINK branding.
**Touches:** architecture.md (design tokens), prd.md.

---

## 2. Tech stack

### ADR-0010 — Frontend framework: React + Next.js
**Decision:** React + Next.js, served via `localhost` as a browser app — not an Electron-packaged desktop app, not React Native.
**Rationale:** React Native was considered and ruled out — it targets mobile, not a desktop infinite-canvas tool, so it was never actually a fit. Next.js gives file-based routing, good DX, and a standard deployment path if Brainy is ever hosted later (ADR-0023).
**Status:** Decided.
**Touches:** architecture.md.

### ADR-0011 — Canvas engine: React Flow
**Decision:** React Flow powers the infinite canvas (nodes, edges, pan/zoom, selection).
**Rationale:** Purpose-built for exactly this interaction model; avoids building canvas primitives from scratch.
**Status:** Decided.
**Touches:** architecture.md.

### ADR-0012 — State management: Zustand
**Decision:** Zustand, not Redux.
**Rationale:** React Flow's canonical examples and community patterns lean on Zustand; it handles high-frequency updates (node dragging, live position changes) with less boilerplate and better performance characteristics than Redux for this specific workload. Door explicitly left open to revisit Redux only if the project later grows to a scale that justifies its extra structure.
**Status:** Decided.
**Touches:** architecture.md.

### ADR-0013 — Backend: separate Fastify process, not Next.js API routes
**Decision:** A separate, minimal Node backend (Fastify) runs alongside the Next.js frontend, in one monorepo (two small processes, not a heavy microservices split).
**Rationale:** Heavy operations (yt-dlp, ffmpeg, transcription, AI provider calls) must never be able to freeze the UI thread. Keeping them in Next.js API routes risks exactly that coupling. A separate process keeps the split clean while staying "light" per ADR-0007 — this is two small processes, not a distributed system.
**Status:** Decided.
**Touches:** architecture.md.

### ADR-0014 — Frontend/backend streaming: SSE for AI responses
**Decision:** AI chat responses stream from backend to frontend via Server-Sent Events, not blocking full-response requests.
**Rationale:** Matches the UX of every modern AI chat surface (token-by-token rendering) and avoids the backend holding a request open with no feedback during long generations.
**Status:** Decided.
**Touches:** architecture.md.

### ADR-0015 — Database: SQLite + Drizzle ORM
**Decision:** Local SQLite as the only datastore for now. Data layer built behind Drizzle ORM specifically so a future migration (e.g., to Postgres/MySQL, or a Firebase sync layer) stays possible without a full rewrite — even though a migration is considered unlikely to ever be necessary for a single-user, single-machine tool.
**Rationale:** Zero ongoing cost (ADR-0004), zero infra to manage, and it's genuinely sufficient for single-user local use. The ORM abstraction is cheap insurance, not a sign we expect to need it.
**Status:** Decided.
**Touches:** architecture.md, data model.

### ADR-0016 — Firebase sync is a possible future layer, not part of the current design
**Decision:** If multi-device access is ever wanted later, it would be added as an optional sync layer on top of SQLite — not by replacing SQLite now.
**Rationale:** Firebase was originally proposed as *the* database, which directly conflicted with the "fully local, $0 cost" requirement — Firebase has real usage-based costs at scale. Resolved by keeping SQLite as the source of truth now, with Firebase (or similar) only ever layered in later if multi-device becomes a real need.
**Status:** Decided (deferred).
**Touches:** architecture.md, data model (UUID PKs chosen partly for this reason — see ADR-0019).

### ADR-0017 — Styling: Tailwind CSS + shadcn/ui
**Decision:** Tailwind for styling; shadcn/ui's code-owned component model for UI primitives (not an installed package dependency like Mantine).
**Rationale:** shadcn/ui generates components *into* the codebase rather than importing them from a library — this means no opaque dependency to fight later, full control over every primitive, and it matches Istiyak's existing Figma-to-code workflow precedent. Mantine was considered and rejected specifically because it's heavier and less "owned."
**Status:** Decided.
**Touches:** architecture.md, token pipeline.

### ADR-0018 — AI providers: Claude, OpenAI, Gemini from the start (architecturally)
**Decision:** The provider-adapter architecture supports Claude, OpenAI, and Google Gemini from day one, even though MVP only *enables* the Claude node. Each provider gets its own distinct node type in the tools panel (e.g., "Claude Chat," "OpenAI Chat," "Gemini Chat") — not one generic chat node with a provider dropdown. A node type stays disabled/greyed out until its API key is entered in Settings.
**Rationale:** Avoids a costly architecture rework later to add multi-provider support, while keeping MVP scope honest (only Claude is actually wired up and usable at first).
**Status:** Decided.
**Touches:** architecture.md, prd.md.

### ADR-0019 — Three AI execution modes per chat node
**Decision:** Each chat node is independently configurable to one of three modes:
1. **Local LLM** (via Ollama) — free, runs on-device.
2. **Native API** — paid, calls the provider's API directly, seamless streaming.
3. **Manual Input** — free, a copy/paste bridge to claude.ai (or another provider's own chat UI) when no API budget is available.
**Rationale:** Direct answer to ADR-0004 (zero-cost constraint) without sacrificing the option of paid, seamless AI when budget allows — configurable per node, not a single global setting, since different nodes in the same board may warrant different cost/quality tradeoffs.
**Status:** Decided.
**Touches:** prd.md, architecture.md.

---

## 3. Data model conventions

### ADR-0020 — Naming conventions
**Decision:**
- `snake_case` for all table and column names.
- No `tbl` prefix on table names (checked against current best practice — prefixing is discouraged).
- Plural table names (`boards`, `nodes`, `edges`) — standard Drizzle/ORM convention.
- Foreign keys named `<singular_table>_id` (e.g. `board_id`).
- `created_at` / `updated_at` on every table; `deleted_at` additionally on `boards` to support soft-delete (powers the Trash UI).
- Boolean columns prefixed `is_` or `has_`.
**Rationale:** Standard, boring, widely-recognized conventions — chosen deliberately so a future developer never has to guess the shape of a table name or column.
**Status:** Decided.
**Touches:** architecture.md, data model.

### ADR-0021 — Primary keys: UUIDs, not auto-increment integers
**Decision:** Every table's primary key is a UUID, not an auto-increment integer.
**Rationale:** Chosen specifically for future Firebase-sync/multi-device merge safety (ADR-0016) — auto-increment IDs collide instantly across devices/offline writes; UUIDs don't.
**Status:** Decided.
**Touches:** architecture.md, data model.

### ADR-0022 — Draft v0 entity list
**Decision:** Starting entities: `users`, `boards`, `folders`, `nodes`, `edges`, `chat_messages`, `provider_credentials`, `extraction_cache`. Expected to grow incrementally via Drizzle migrations as the project progresses — this list is a starting point, not a frozen schema.
**Rationale:** Enough to support the MVP feature set without speculative tables for features not yet built.
**Status:** Decided (expected to evolve).
**Touches:** architecture.md.

### ADR-0023 — URL/routing and environment config
**Decision:** Routes follow the pattern `/brainboard/all` (e.g. `localhost:<port>/brainboard/all` now, `https://app.brainy.ai/brainboard/all` if ever hosted later). The base URL lives in environment config — never hardcoded — matching the same centralization discipline used for design tokens (ADR-0027).
**Rationale:** Keeps a future hosting move a config change, not a code change. Route naming stays consistent with whatever entity pluralization convention is locked (ADR-0020).
**Status:** Decided.
**Touches:** architecture.md.

---

## 4. Design system & tokens

### ADR-0024 — Token-first, component-based design system
**Decision:** Root design tokens (color, spacing, typography, etc.) feed reusable primitives (e.g. `button.tsx`), which feed composed components, which feed screens. Nothing is hardcoded per-screen — a modal's button color or padding must always trace back to a central token.
**Rationale:** Explicit goal of avoiding technical debt from day one; this is the single most repeated structural requirement across the whole scoping conversation.
**Status:** Decided.
**Touches:** architecture.md, prd.md.

### ADR-0025 — Token format: W3C DTCG
**Decision:** Design tokens authored directly in code (not Figma-synced for now) using the W3C DTCG format (`$value`/`$type` schema, version 2025.10), split into `primitives.json` and `semantic.json`, run through Style Dictionary to generate Tailwind config + CSS variables.
**Rationale:** Authoring in the DTCG standard now means a future Figma Tokens Studio sync is a drop-in, not a redesign — even though Figma sync isn't being built yet.
**Status:** Decided.
**Touches:** architecture.md.

### ADR-0026 — Semantic tokens organized by usage category
**Decision:** `semantic.json` is organized by usage category — `color.text.*`, `color.background.*`, `color.border.*` — rather than generic color families (e.g. `color.blue.500`) reused across unrelated contexts.
**Rationale:** Prevents a text color from accidentally being used as a background color or vice versa; this is a standard, validated design-system practice, and stays compatible with Figma Variables' grouped-collection structure for a future sync.
**Status:** Decided.
**Touches:** architecture.md.

### ADR-0027 — Single light theme only for MVP
**Decision:** No dark mode in MVP. One light theme.
**Rationale:** Scope control — dark mode is a real token/testing surface-area cost that isn't justified yet for a single-user tool.
**Status:** Decided (revisit later if wanted).
**Touches:** architecture.md, prd.md.

### ADR-0028 — UI color palette: clean neutral "Figma light-mode" style, independent of EPICINK
**Decision:** Brainy's palette is a standard neutral gray scale (background/surface/border/text neutrals, in the style of Figma/Linear/Notion) plus a single accent color — not derived from EPICINK's brand palette (see ADR-0009).
**Rationale:** A tool used for hours of focused work needs calm, neutral chrome with accent color reserved for actionable elements (primary actions, active states, links) — a warm editorial palette built for LinkedIn carousels doesn't serve that purpose.
**Status:** Decided. Exact accent color to be proposed and confirmed when tokens are drafted.
**Touches:** architecture.md (token files).

### ADR-0029 — Typeface: Inter, UI only
**Decision:** Inter is the sole typeface for Brainy's UI. No separate typography system is being imported from EPICINK's brand assets.
**Rationale:** Inter is a standard, highly legible UI typeface, confirmed sufficient — no need to introduce a second typeface for a utility tool.
**Status:** Decided.
**Touches:** architecture.md (token files).

### ADR-0030 — Component documentation: Storybook
**Decision:** Storybook documents every component.
**Rationale:** Chosen specifically to support future developer onboarding — a new contributor can see every component's states/variants without reading implementation code first.
**Status:** Decided.
**Touches:** architecture.md.

### ADR-0031 — Lint rule against hardcoded values
**Decision:** An automated lint rule blocks hardcoded color/spacing values anywhere outside the token files.
**Rationale:** Enforces ADR-0024 mechanically rather than relying on discipline alone.
**Status:** Decided.
**Touches:** architecture.md.

---

## 5. Cosmetic auth / demo profile

### ADR-0032 — Demo login is purely cosmetic
**Decision:** A login/profile experience exists for the "full app" feel, but there is no real user management, auth, passwords, or sessions. Login shown only on first run; the profile then persists. Avatar is auto-generated from initials (no upload). A persistent top navbar with avatar/profile dropdown appears across both the Boards List and Canvas views (matching Poppy's pattern). The dropdown contains Settings, a keyboard-shortcuts reference, About/version info, and a cosmetic Sign Out. Profile data (name, avatar) lives in a small table in the same local SQLite DB.
**Rationale:** Single-user local tool has no real need for auth, but the UI benefits from feeling like a complete product rather than a bare dev tool.
**Status:** Decided.
**Touches:** prd.md, data model (small `users`/profile table).

---

## 6. Security & process

### ADR-0033 — Secrets centralized in the gitignored SQLite layer
**Decision:** All provider API keys and other secrets live only in the gitignored SQLite database — never scattered across `.env` files or config. A `gitleaks` pre-commit hook guards against accidental commits of secrets.
**Rationale:** Next.js does not hot-reload `.env` changes without a restart (verified), which makes `.env` impractical for a live-editable Settings UI anyway — SQLite is both the more secure *and* the more practical choice. Important given the eventual public-repo/open-source plan.
**Status:** Decided.
**Touches:** architecture.md.

### ADR-0034 — Dedicated security discussion deferred, not skipped
**Decision:** A separate, focused security discussion is still owed, covering: input sanitization for anything fed into yt-dlp/ffmpeg subprocesses (injection risk from pasted URLs), binding the local backend to `localhost` only, and a clean split between publishable code and Istiyak's own private board content/research — relevant given the eventual public-repo plan.
**Rationale:** Explicitly deferred by Istiyak during scoping to avoid derailing the stack discussion; flagged here so it isn't forgotten.
**Status:** **Open — revisit before Phase 7 (security hardening) and before any public-repo step.**
**Touches:** architecture.md, prd.md (Phase 7).

### ADR-0035 — GitHub MCP: Claude may commit/push directly
**Decision:** Once coding starts, Claude can commit and push directly to the repo via GitHub MCP — no human-review gate required for every commit.
**Rationale:** Explicit user confirmation; matches the "vibe coded feel, professionally executed" build cadence (ADR-0007) for a solo project.
**Status:** Decided.
**Touches:** agents.md.

### ADR-0036 — Figma MCP deferred to post-MVP
**Decision:** Figma MCP integration (for UI/UX polish exploration, feeding back into Istiyak's existing Figma-to-code pipeline) is explicitly deferred to post-MVP.
**Rationale:** Not needed to ship the core product; avoids scope creep into Figma tooling before the app itself works.
**Status:** Decided (deferred).
**Touches:** prd.md.

### ADR-0037 — Notion MCP's role clarified: downstream export, not core to building Brainy
**Decision:** Notion MCP is relevant as a possible future "push to Notion" export feature for Brainboard's output (ideas/scripts/shot lists/asset management) — not something needed to build Brainboard itself.
**Rationale:** Clarifies scope so Notion integration isn't mistakenly treated as a build dependency.
**Status:** Decided (future feature, not current scope).
**Touches:** prd.md.

### ADR-0038 — Project-specific flow hierarchy: Task Flow (L1) → User Flow (L2)
**Decision:** For this project's documentation only, **Task Flow = Level 1** (the named task as a whole, e.g. "User login experience") and **User Flow = Level 2** (the branches/variants beneath it — OAuth, error states, reset password, edge cases).
**Rationale:** This is the *reverse* of the more commonly documented UX industry convention (most sources define User Flow as the broader/branching concept and Task Flow as the narrower single path) — flagged honestly during scoping, but adopted as Brainy's defined convention specifically to match how Istiyak thinks about the hierarchy. Documented explicitly here so no future doc or session guesses the more common convention instead.
**Status:** Decided (project-specific override of general industry terminology).
**Touches:** prd.md, task/flow tracker.

### ADR-0039 — Claude.ai Projects knowledge base is not accessible via API — Brainy gets its own local Brand Profile instead
**Decision:** Brainy's "Brand/Voice Profile" feature (for the chat nodes to reference Istiyak's writing voice/brand) is a local, Brainy-native database table — not a live integration with this claude.ai Project's knowledge base.
**Rationale:** Researched and confirmed: claude.ai Projects' knowledge base is not exposed via the standard Claude API. The only related capability is an enterprise Compliance API (read-only, special enablement required, doesn't feed chat completions). A local Brand Profile table works across all three AI providers (ADR-0018) and can be seeded once by copying relevant content in manually.
**Status:** Decided.
**Touches:** architecture.md, prd.md, data model.

---

## 7. Build sequencing

### ADR-0040 — Phased roadmap, no forward dependencies
**Decision:** Build proceeds in explicit phases, each with a "done looks like" milestone, checked against the rule that no phase may depend on something scheduled in a *later* phase.
**Current phase order (superseded by ADR-0041 below for phase 1):**
- Phase 0 — scaffolding
- Phase 1 — App Shell (navbar, profile/avatar, Settings) — moved up from its original Phase 5 slot, see ADR-0041
- Phase 2 — core canvas + text nodes + autosave
- Phase 3 — more node types
- Phase 4 — first Claude chat node
- Phase 5 — video nodes + lazy extraction
- Phase 6 — polish + remaining AI providers
- Phase 7 — security hardening (see ADR-0034 — do not skip)
**Rationale:** Prevents the kind of dependency violation caught during scoping (see ADR-0041) where an earlier phase silently needed something from a later one.
**Status:** Decided — exact phase content to be finalized in `prd.md`.
**Touches:** prd.md, task tracker.

### ADR-0041 — App Shell moved to immediately after backend scaffolding
**Decision:** The App Shell (navbar, toolbar, canvas container shell, profile/avatar, first-run login, full Settings page) is built right after backend scaffolding, as the very first visible milestone — not deferred to late in the roadmap.
**Rationale:** The original plan had the first Claude chat node (needing API-key storage) scheduled before the full Settings UI existed — a forward-dependency violation of ADR-0040. Rather than patch this with a minimal standalone credential-storage workaround, Istiyak requested moving the full App Shell (which includes Settings) earlier, which cleanly removes the dependency problem at its root.
**Status:** Decided. Supersedes the credential-storage-workaround idea entirely.
**Touches:** prd.md, task tracker, architecture.md.

### ADR-0042 — Documentation order for this kickoff
**Decision:** On the go-ahead to start building, deliverables are produced in this order: `rules-decisions.md` → `architecture.md` → `prd.md` → `claude.md` → `agents.md` → granular task/flow tracker → backend scaffolding (repo, git, SQLite/Drizzle) → token/CSS/component/Storybook pipeline → App Shell → then node-by-node feature work.
**Rationale:** Matches Istiyak's explicit sequencing request; each doc is written so later docs and later build steps can cross-reference it rather than re-deriving decisions from scratch.
**Status:** Decided — this document is step 1 of that sequence.
**Touches:** claude.md, agents.md, task tracker.

### ADR-0047 — Doc set extended with testing.md, bugs.md, audit.md; deployment-checklist items deferred as not-yet-applicable
**Decision:** After reviewing two vibe-coding best-practice references (a deployment-readiness checklist and a "6 docs for an MVP" file-system guide), three more docs were added to the doc set: `testing.md` (manual test-case checklist per feature), `bugs.md` (error log template), and `audit.md` (periodic "what was planned vs. what was actually built" reality-check). A lightweight "task-for-today" scratch-file convention (used and deleted within a single working session, never committed as a standing doc) was adopted and documented in `agents.md` rather than created as a persistent file now. A short "Backups" note was added to `architecture.md` §10 covering local `brainy.db` backup practice.

The bulk of the deployment-readiness checklist (secrets handling, auth/permission testing, database row-level security, mobile/responsive QA, production monitoring/analytics, rollback-to-previous-deploy procedures, legal/privacy/terms pages, a human-approval deploy gate) was reviewed and **deliberately not adopted**, because it assumes a hosted, multi-user, publicly-deployed product — none of which describes Brainy today (ADR-0001 single-user, ADR-0004 local-only/no hosting yet, ADR-0032 no real auth). Secrets handling specifically is already covered by the SQLite+gitleaks approach (ADR-0033). This whole checklist becomes directly relevant again if/when Brainy is ever actually hosted (`architecture.md` §9) and should be revisited at that point, not before.
**Rationale:** Keeps the doc set genuinely useful (testing/bug-tracking/audit discipline helps right now, even solo) without importing deployment-checklist bureaucracy that doesn't fit a local single-user tool — consistent with the "vibe coded feel, professionally executed" principle (ADR-0007): add process that earns its keep, skip process that doesn't yet apply.
**Status:** Decided.
**Touches:** testing.md, bugs.md, audit.md, agents.md, architecture.md §10.

### ADR-0048 — `progress-tracker.md` renamed to `implementation_plan.md`, expanded with per-phase technical approach
**Decision:** The granular build tracker was renamed from `progress-tracker.md` to `implementation_plan.md`, matching the naming used in the Medium "6 docs for an MVP" reference (ADR-0047). Beyond the rename, each phase now carries a **Technical approach** section — the actual build order within that phase, which files/modules/interfaces it touches, and why that order was chosen — in addition to the existing checkbox list. A dependency-chain diagram was added showing why phases are ordered the way they are, tying back to the no-forward-dependency rule (ADR-0040).
**Rationale:** The original tracker was checkbox-only — good for tracking completion, but it didn't capture *how* to build each phase, just *what*. The Medium article's framing of this doc as "the Blueprint... a phased, checkbox-based technical build roadmap" matches what was missing. All other docs that referenced `progress-tracker.md` by name (`prd.md`, `feature.md`, `agents.md`, `testing.md`, `audit.md`, `claude.md`) were updated to point to `implementation_plan.md` instead.
**Status:** Decided. Supersedes ADR-0047's original `progress-tracker.md` naming.
**Touches:** implementation_plan.md, prd.md, feature.md, agents.md, testing.md, audit.md, claude.md.

---

### ADR-0049 — Second, deeper pass on the deployment-readiness checklist: four real items adopted, the rest reconfirmed as not-yet-applicable
**Decision:** ADR-0047 dismissed most of the deployment-checklist article as assuming a hosted/multi-user product. A deeper re-read, item by item, found **four genuinely applicable items that were missed or underweighted** the first time, reinterpreted for a local-only context rather than a hosted one:

1. **CORS lockdown on the Fastify backend.** "Localhost-only" is not automatically safe from the browser's side — a malicious website the user visits could, without CORS restrictions, make a `fetch()` call from the browser to `localhost:4000` and read provider API keys or board content. The backend must restrict CORS to the frontend's own origin (`localhost:3000`) specifically, not `*`. Added to `architecture.md` §6 and `implementation_plan.md` Phase 7.
2. **Clean-install verification.** "Clone into a fresh folder, install, build, run, fix any setup failures" — directly serves the existing developer-onboarding/open-source goal (ADR-0006) and was previously only implied, not an explicit checklist item. Added to `implementation_plan.md` Phase 0 and Phase 7.
3. **Production build must pass, not just the dev server.** `next build` (and a clean TypeScript/lint pass) catches real classes of bugs the dev server hides — this was missing entirely from Phase 0's checklist, which only verified `npm run dev`. Added to `implementation_plan.md` Phase 0, and as a standing convention in `agents.md`: run the production build once before marking any phase done.
4. **Local, inspectable error logging; no stack traces surfaced to the UI.** Nothing in the doc set previously specified *where* backend errors go when something fails (console output disappears when a terminal closes) or that raw exceptions/stack traces should never reach the frontend. Added as a new `architecture.md` §11 (Error handling & logging conventions), and as cross-cutting feature **F-25** in `feature.md` (Must-have) covering: backend-unreachable state (distinct from "provider API unreachable"), duplicate-click/double-submit protection on cost-incurring or data-mutating actions (sending a chat prompt in Native API mode costs real money per request — a double-send is a real cost bug, not just a cosmetic one), and the log-to-file + friendly-message-to-user split.

The rest of the checklist was re-examined and **reconfirmed as correctly excluded**, with specific reasoning this time rather than a blanket dismissal: auth/permission testing and database row-level security both assume multiple users with data to isolate from each other, which doesn't exist (ADR-0001, single user, one local SQLite file); mobile/responsive QA assumes a device class Brainy was never scoped for (a desktop localhost canvas tool); analytics/monitoring-as-a-service and a hosted rollback plan assume production traffic and a hosting provider, neither of which exist yet (ADR-0004); legal/trust pages (privacy policy, ToS, cookie notice) assume collecting other people's data, which Brainy never does. The article's final item — "run an AI review for launch blockers, then verify it yourself, don't treat AI output as proof" — was adopted as a framing note added to `agents.md` and `audit.md`: an audit pass should explicitly look for this class of issue even pre-launch, and Istiyak should spot-check real app behavior himself rather than trusting a self-review.

**Rationale:** The first pass (ADR-0047) correctly rejected importing hosted-product bureaucracy wholesale, but moved too fast to find the handful of items that translate to a local context under different framing (localhost ≠ unreachable from a browser; "production build" matters even with no production deployment; "logs inspectable after launch" matters even with no launch). This second pass is the more careful version of the same judgment call, not a reversal of it.
**Status:** Decided. Extends ADR-0047; does not supersede it.
**Touches:** architecture.md §6, §11 (new), feature.md (F-25, new), implementation_plan.md (Phase 0, Phase 7), agents.md, audit.md.

---

## 8. MVP feature bucket decisions (MoSCoW)

Captured here as decisions about *scope*, not product description (see `prd.md` for the full feature spec).

### ADR-0043 — Must-have node types and core loop
**Decision:** MVP must include: infinite canvas with pan/zoom, text/note nodes, YouTube/Instagram link nodes (thumbnail-only, no in-app playback — see ADR-0044), grouping, node-to-node connections, one working AI chat node (Claude only, per ADR-0018), board autosave, and the cosmetic demo login/App Shell (ADR-0032, ADR-0041).
**Status:** Decided.
**Touches:** prd.md.

### ADR-0044 — Video content: thumbnail-only by default, lazy extraction on demand
**Decision:** YouTube/Instagram nodes display as rich thumbnails only (title, thumbnail, click-through link) with no in-app playback. Deep content (transcript) is extracted only when a connected chat node actually needs it, via a yt-dlp + ffmpeg + Whisper pipeline, cached in an `extraction_cache` table so it never re-runs for the same source.
**Rationale:** Avoids the complexity of in-app video playback entirely; avoids wasted processing by extracting only on actual demand, not on node creation.
**Status:** Decided.
**Touches:** architecture.md, prd.md, data model (`extraction_cache`).

### ADR-0045 — Should-have features (validated via Poppy.ai deep dive)
**Decision:** The following are **Should-have**, validated by Poppy.ai's actual marketing site/help-center content (not guessed): a dedicated Outliers browsing panel (search a channel, Latest/Popular/Outliers toggle, outlier-multiplier badge, quick-add to board); per-node "notes for AI" free-text field anchored to an individual node (separate from the main chat prompt); an AI-generated Mindmap output node type; live mic voice input (not just uploading pre-recorded audio); multi-select + copy/duplicate of blocks/groups/boards; a documented chat-stuck/chat-error feedback pattern; the local Brand/Voice Profile memory system (see ADR-0039).
**Status:** Decided.
**Touches:** prd.md.

### ADR-0046 — Explicitly excluded (not even Could-have)
**Decision:** An AI-generated Presentation/slideshow output type is explicitly excluded from scope entirely — not deferred, not a Could-have.
**Rationale:** Direct scope-control decision made during the Poppy.ai feature review.
**Status:** Decided (excluded).
**Touches:** prd.md.

---

## 9. Repo structure, tooling & environment

### ADR-0050 — Repo directory structure finalized: `CLAUDE.md` casing fix, `docs/`, `.claude/rules`, `.claude/skills`, `docs/runbooks/`, `tools/scripts/`
**Decision:** Before Phase 0 scaffolding starts, researched Claude Code's actual, current conventions directly (not assumed) and finalized the repo's directory structure against them, informed by a reference screenshot of a "Claude Code Project Template" (`.claude/skills/`, `.claude/hooks/`, `docs/decisions/`, `docs/runbooks/`, `tools/`) and standard monorepo practice. Specific changes:

1. **`claude.md` → `CLAUDE.md` (root, uppercase).** Confirmed against official docs: Claude Code auto-loads project instructions specifically from `CLAUDE.md` (or `AGENTS.md`) at root — not any casing. This was a real correctness bug, not a style preference; the file as originally named would not reliably auto-load.
2. **All other planning docs move into `docs/`** (`docs/rules-decisions.md`, `docs/architecture.md`, `docs/prd.md`, `docs/feature.md`, `docs/implementation_plan.md`, `docs/agents.md`, `docs/testing.md`, `docs/bugs.md`, `docs/audit.md`) — keeps the repo root to just `CLAUDE.md`, `README.md`, config files, and the real folders. Their mutual relative links (`./architecture.md` etc.) are unaffected since they move together as siblings; only `CLAUDE.md`'s links needed a `docs/` prefix.
3. **`agents.md` specifically stays lowercase and inside `docs/`, never becomes root `AGENTS.md`.** Confirmed Claude Code treats a root `AGENTS.md` as an alternative to `CLAUDE.md` itself (project memory, in its place), not a second doc — naming our working-conventions file that way at root would have silently collided with a real mechanism.
4. **`.claude/rules/*.md` added** — path-scoped conventions (`db-conventions.md`, `token-conventions.md`, `error-handling-conventions.md`), confirmed as a real Claude Code mechanism: a rule with `paths` frontmatter loads automatically only when Claude touches a matching file, rather than every session regardless of relevance — a more targeted version of what `agents.md` §5 already states in full.
5. **`.claude/skills/phase-check/SKILL.md` added** — a real, invokable procedure (confirmed `SKILL.md` format against docs) that runs the mechanical half of closing out a phase (production build, pointing at the right `testing.md` section) — doesn't replace the human `audit.md` pass, just removes the "did I forget a step" risk from it.
6. **`docs/runbooks/` added** — operational, human-followable procedures for things that happen occasionally rather than during a build phase (restoring `brainy.db` from backup, rotating a leaked API key) — previously only described in prose inside `architecture.md` §10, never as actual numbered steps.
7. **`tools/scripts/` reserved** for repo-wide operational scripts (a real backup script, a clean-install check script) — not written yet since there's no `package.json`/Node project to hang them off until Phase 0 exists; added as explicit Phase 0 checklist items in `implementation_plan.md` instead of writing orphaned scripts now.
8. **`README.md` added at root** — the human-facing front door (what this is, how to run it), distinct from `CLAUDE.md` which is Claude-facing.
9. **Clarified, not changed:** `gitleaks` (ADR-0033) is a **git** pre-commit hook (husky/`pre-commit` framework — `.git`/`.husky`-level), a different mechanism from Claude Code's own `.claude/` hooks/rules system. The two are complementary, not redundant, but conflating them in earlier docs was an ambiguity worth fixing explicitly.

**Declined from the reference screenshot, with reasons:** a `docs/decisions/` folder splitting every ADR into its own file — at 49+ ADRs in one well-organized, cross-referenced file, a split adds file-management overhead without a clear benefit at this project's scale; reconsider only if `rules-decisions.md` becomes genuinely unwieldy. A `tools/prompts/` folder — redundant with `.claude/skills/`, which is Claude Code's actual mechanism for exactly this; a parallel ad-hoc prompts folder would just be a second, less-integrated place to look.

**Mechanics note:** this session has no file-delete capability on Istiyak's machine, so rather than leaving 9 stale duplicate files to clean up, Istiyak chose to perform the physical move of the 8 existing docs into `docs/` and the `claude.md` → `CLAUDE.md` rename himself, directly in his editor, following the exact target tree in `architecture.md` §2.
**Rationale:** The goal stated from the start of this project was a repo a real developer (or Claude Code itself, cold) could pick up without guesswork. Guessing at Claude Code's own conventions rather than verifying them would have directly undermined that goal — the casing bug alone would have meant `CLAUDE.md`'s entire purpose silently failing.
**Status:** Decided.
**Touches:** CLAUDE.md, README.md (new), architecture.md §2, agents.md, docs/runbooks/* (new), .claude/rules/* (new), .claude/skills/phase-check/ (new), implementation_plan.md (Phase 0).

---

### ADR-0051 — Extraction pipeline (Phase 5): no-Python by default, standalone binaries + Node wrapper
**Decision:** The yt-dlp + ffmpeg + Whisper pipeline (ADR-0044) uses no Python runtime by default:
- **yt-dlp**: the standalone `yt-dlp.exe` build for Windows (bundles its own interpreter), not `pip install yt-dlp`.
- **ffmpeg**: the standard native `ffmpeg.exe` binary — always a separate install either way, not Python-related, but confirmed here so it isn't a surprise during Phase 5 setup.
- **Whisper**: `whisper.cpp` (the C++ port), invoked via a Node package that wraps it as a subprocess — not OpenAI's original Python `whisper` package, and not the paid Whisper API (would violate the $0-by-default principle, ADR-0004, as a hard requirement rather than an opt-in).

Python remains an explicitly allowed **fallback**, not excluded going forward: if the no-Python route (particularly the Node/whisper.cpp wrapper) proves unreliable or hits a real scaling/quality wall during Phase 5, switching to Python + `pip install openai-whisper` (or similar) is acceptable — but that's a deliberate fallback to reach for if needed, not the default path to build.
**Rationale:** Keeps the local dev environment to just Node/npm plus two downloaded binaries — no second language runtime to install, update, or explain to a future contributor, consistent with "vibe coded feel, professionally executed" (ADR-0007) and the non-coder-solo-builder context (ADR-0006). Confirmed this changes nothing about Phase 0 — none of Phase 0's scaffolding touches yt-dlp/ffmpeg/Whisper at all.
**Status:** Decided.
**Touches:** architecture.md §4.4, implementation_plan.md Phase 5.

---

## 10. Final completeness reconciliation (pre-Phase-0)

A closing pass against the entire scoping conversation, requested explicitly so nothing would need to be manually dug back out of chat history later. Two real gaps surfaced; both are corrected below rather than carried forward as open items.

### ADR-0052 — Final completeness pass: per-node model selection and Native API cost tracking were missing
**Decision:** A final reconciliation pass against the full scoping conversation (requested explicitly so nothing has to be manually dug out of chat history later) found two things stated early on that never made it into `feature.md`:

1. **Per-node model selection**, not just per-node *provider* selection. The original stack requirement was explicit: "each [chat node] has its own model selection... so cheap models can be used for simple tasks and stronger models for heavier synthesis within the same board." What got built into the docs was provider-level choice (Claude vs OpenAI vs Gemini, ADR-0018) and execution-mode choice (Local/Native/Manual, ADR-0019) — but not model-tier choice *within* a provider (e.g. Haiku vs Sonnet vs Opus for a Claude node). Folded into **F-12** (`feature.md`) rather than a new feature, since it's the same node-configuration surface; `ProviderAdapter.streamChat()` (`architecture.md` §4.2) now takes a `model` parameter alongside provider/mode.
2. **Cost tracking.** The original stack requirement explicitly asked for "a provider-adapter architecture with per-provider API keys **and cost tracking**" — cost tracking was never carried into the feature list. Added as **F-29** (Should-have): a lightweight, estimated running count of Native-API spend (token count × the provider's published rate — not a billing-grade system), surfaced somewhere unobtrusive. This directly supports the project's own founding constraint (ADR-0004, $0-by-default) — without it, a user has no visibility into when they've left the free tier of their own tool.

**Rationale:** Both were stated explicitly early in scoping and simply didn't survive the later MoSCoW/feature-bucket passes — not a deliberate descope, an oversight this pass exists to catch.
**Status:** Decided.
**Touches:** feature.md (F-12 extended, F-29 new), architecture.md §4.2, implementation_plan.md Phase 4, testing.md.

---

### ADR-0053 — Final completeness pass: generic file/document nodes and link-reference nodes were missing from the node-type list
**Decision:** The very first description of Brain Board's core functionality, at the start of scoping, was: drop "YouTube outliers, Instagram outliers, **his knowledge base**, **LinkedIn top performers**, raw idea notes, his best-performing content, and **his analytics Excel** onto an infinite canvas, **in any file type**." The node types that actually made it into `feature.md` cover text notes (F-09) and YouTube/Instagram video links (F-10) — but nothing for a knowledge-base document, a spreadsheet, or a non-video link like a LinkedIn post. Two node types were missing entirely, both now added as **Must-have** (this was core to the original ask, not a nice-to-have):

1. **F-26 — File/document node.** Upload a local PDF, DOCX, or XLSX file onto the canvas (his knowledge-base docs, his analytics spreadsheet). Parsed with Node-native libraries (e.g. `pdf-parse`, `mammoth`, an XLSX reader) — no Python, consistent with the extraction-pipeline tooling decision (ADR-0051). Extracted text/data is available to connected chat nodes the same way a text node's content is. Images are also accepted as file nodes but without text extraction (no OCR in MVP) — a visual reference plus an optional manual notes field, reusing the F-16 pattern. Reuses the existing `extraction_cache` table (keyed by content hash instead of URL) rather than adding a new table — no schema change needed, just a broadened description.
2. **F-27 — Generic link/reference node.** Paste any non-video URL (a LinkedIn post, an article) — since automated scraping of LinkedIn (and most non-YouTube platforms) was already ruled out earlier in scoping as infeasible, this node shows the raw URL plus an editable title and a free-text area for manually pasting the post's content if the user wants it available as AI context. No scraping is attempted; this is consistent with how Instagram link nodes already work (F-10), just generalized beyond video platforms.

Both get their own Task Flows (`TF-12`, `TF-13` in `prd.md` §4) and ship in Phase 2 alongside text nodes, with their content folded into the Phase 4 context-assembly module the same way video nodes extend it in Phase 5.
**Rationale:** Without these, Brainy literally cannot do the thing it was originally asked to do — bring in his knowledge base and his analytics Excel. This is a correction of an oversight from the MVP-scoping passes, not a new feature request.
**Status:** Decided.
**Touches:** prd.md §4 (TF-12, TF-13), §5 (Must-have list), §6 (phase table); feature.md (F-26, F-27 new); architecture.md §4.3, §5.3; implementation_plan.md Phase 2 and Phase 4; testing.md.

---

## 11. Version control & branching

### ADR-0054 — GitHub connected pre-Phase-0; GitHub Flow (main + short-lived branches) adopted as the branching model
**Decision:** Before any app-code scaffolding begins, the repo is connected to GitHub (`github.com/infoepicinkstudio-rgb/brainy-app-ai`) and the current documentation set is pushed as the first commit on `main`. This pulls Phase 0's existing `git init` checklist item (`implementation_plan.md`) forward and satisfies it early, specifically so the docs themselves are versioned and backed up from the start, not just the eventual app code.

**Branching model: GitHub Flow**, not the heavier Git Flow (no `develop`/`release`/`hotfix` branches — that model assumes a team and a release cadence neither of which exist here, ADR-0001):
- `main` is always the last known-good state.
- Every phase, or every individual feature when a phase is large enough to want finer checkpoints, gets its own short-lived branch (`phase-<n>-<slug>` or `feature/<slug>`), merged back into `main` via a GitHub Pull Request once verified (ties naturally into the existing `/phase-check` skill — ADR-0050 — which now also serves as the "ready to open a PR" gate), then deleted.
- Documented in full, with exact copy-paste commands pitched at a no-coder, in a new runbook: `docs/runbooks/git-basics.md`.
- A real `.gitignore` was written now (not deferred to Phase 0) — `node_modules/`, `brainy.db` + its journal/WAL files, `.env*`, build output folders, `.claude/settings.local.json` — so the very first commit is already clean, rather than committing something that needs a history-rewrite later to remove.

**Rationale:** Istiyak explicitly asked for version control set up before Phase 0 specifically so docs and future code are both covered from day one, and for a branch-per-feature habit "so proper branching can be versioned" — stated as a no-coder learning git for the first time. GitHub Flow is the simplest widely-recognized convention that satisfies that (one rule: never commit straight to `main`), without importing Git Flow's extra branch types that a solo no-coder would get no benefit from and would likely find confusing.
**Status:** Decided.
**Touches:** `.gitignore` (new), `docs/runbooks/git-basics.md` (new), `agents.md` (new convention), `implementation_plan.md` (Phase 0 checklist note), `CLAUDE.md` (pointer).

---

## Open items (not yet decided — tracked so they aren't lost)

- **ADR-0034** — dedicated security discussion (subprocess input sanitization, localhost-only binding, public-repo data hygiene) — still owed.
- **Accent color** — exact value for the neutral light-mode palette (ADR-0028) — to be proposed when tokens are drafted.
- **Typography System PDF** (`Epicink-Studio-Typography-System.pdf` in the EPICINK knowledge base) — returned no extractable text on read; low priority now that Inter is confirmed (ADR-0029) and EPICINK assets are explicitly not being reused (ADR-0009), but flagged in case it's ever needed for reference.
