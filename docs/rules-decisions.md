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

## 12. Phase 0 scaffolding — implementation choices

Phase 0 was built and verified for real (clean `npm install`, production build, dev-boot, Storybook build, and a simulated clean-install from a fresh folder all passed). A handful of library/value choices weren't pinned down anywhere in the docs and had to be made while actually building — logged here rather than left silent, per `agents.md` §2.

### ADR-0055 — SQLite driver: `@libsql/client`, not `better-sqlite3`
**Decision:** The Drizzle/SQLite layer (architecture.md §5.1) uses `@libsql/client` + `drizzle-orm/libsql`, not `better-sqlite3`.
**Rationale:** `better-sqlite3` needs a native addon compiled via `node-gyp` at install time — this failed outright in the sandbox used to build and verify Phase 0 (no C++ toolchain / restricted network for the fallback source download), and the same failure mode is a real risk on a no-coder's own Windows machine, which won't have Visual Studio Build Tools installed by default. `@libsql/client` ships prebuilt per-platform binaries through npm itself, so `npm install` just works with no extra toolchain. Functionally equivalent for this project's needs (single local file, synchronous-feeling API, full Drizzle support).
**Status:** Decided.
**Touches:** `apps/server/package.json`, `apps/server/src/db/client.ts`, `apps/server/src/db/migrate.ts`, `apps/server/drizzle.config.ts`.

### ADR-0056 — Inter self-hosted via `@fontsource/inter`, not `next/font/google`
**Decision:** Inter (ADR-0025) is loaded via the `@fontsource/inter` package (actual font files shipped through npm), imported in `apps/web/app/globals.css`, rather than `next/font/google`'s live fetch from `fonts.googleapis.com` at build time.
**Rationale:** `next/font/google` failed the production build outright in the sandbox network used to build Phase 0 (couldn't reach Google's font CDN at build time). Even setting aside that specific environment, a build that depends on reaching an external service at build time is a fragile default for a tool whose whole premise is running reliably on a single person's machine — self-hosting removes that dependency entirely, with no real downside (same font, same weights).
**Status:** Decided.
**Touches:** `apps/web/app/layout.tsx`, `apps/web/app/globals.css`, `apps/web/package.json`.

### ADR-0057 — Accent color: `#4f46e5` (indigo-600), resolving the open item from ADR-0028
**Decision:** The token palette's one accent color (architecture.md §7, ADR-0028's "neutral grays + one accent") is a clean indigo (`primitives.json` `color.accent` scale, 50–900, base `#4f46e5`), used for primary actions, focus rings, and accent text/background tokens. Full neutral gray scale alongside it, both defined in `packages/tokens/tokens/primitives.json`.
**Rationale:** This was an explicitly flagged open item ("to be proposed when tokens are drafted") — now that tokens were actually drafted for Phase 0, resolving it rather than leaving a placeholder. Indigo reads as calm/professional/research-tool-appropriate, is visually distinct from any color associated with EPICINK Studio's own brand (ADR-0009), and is a well-understood, accessible choice at the chosen shade (passes standard contrast checks against both white and the near-black text token). Not precious about this — easy to swap later since every component consumes it only via the `color.accent.*` token, never a hardcoded hex.
**Status:** Decided. Removes "Accent color" from the open-items list below.
**Touches:** `packages/tokens/tokens/primitives.json`, `packages/tokens/tokens/semantic.json`.

### ADR-0058 — `concurrently` to run `apps/web` and `apps/server` together under one `npm run dev`
**Decision:** The root `npm run dev` script uses `concurrently` to run the tokens build, `apps/server`'s dev process, and `apps/web`'s dev process together, labeled and color-coded per process.
**Rationale:** Not decided anywhere previously; a plain, unopinionated choice — `concurrently` is the standard, minimal tool for this exact job (vs. a heavier task runner like Turborepo/Nx, which would be over-engineering for a two-process solo project per ADR-0007). Verified working: `npm run dev` from the repo root boots both processes and the tokens build together, matching Phase 0's literal "done looks like" criterion (`prd.md` §6).
**Status:** Decided.
**Touches:** root `package.json`.

### ADR-0059 — Misc Phase 0 naming/tooling notes
**Decision, bundled (each too small for its own ADR):**
- **React Flow ships as `@xyflow/react`**, not the older `reactflow` package name — React Flow was rebranded/moved to this scoped package for v12+; `architecture.md` and `prd.md` referred to it generically as "React Flow," which this package is.
- **Hardcoded-value lint enforcement** (ADR-0024, ADR-0031's "lint rule blocks hardcoded color/spacing values") is implemented via `eslint-plugin-tailwindcss`'s `no-arbitrary-value` rule in `apps/web/eslint.config.mjs`, rather than a hand-written custom rule — it directly targets the actual risk (an arbitrary Tailwind value like `bg-[#fff]` bypassing the token system) with a maintained, off-the-shelf rule instead of reinventing one.
- **`apps/web/AGENTS.md` is not a naming collision with ADR-0050's root-`AGENTS.md` concern.** Next.js itself auto-generates this file (regenerated by `next dev`, meant to be committed) to warn an AI coding assistant about breaking changes in this Next.js major version. It's scoped to `apps/web/`, not the repo root, and serves a different, narrower purpose than `docs/agents.md` (this repo's own working conventions) — both are kept.
**Status:** Decided.
**Touches:** `apps/web/package.json`, `apps/web/eslint.config.mjs`.

---

## 13. Phase 1 — App Shell — implementation choices

### ADR-0060 — Provider API keys encrypted at rest with AES-256-GCM, local per-machine key
**Decision:** `provider_credentials.api_key` is never stored as plaintext. It's encrypted with AES-256-GCM (Node's built-in `crypto`), a random 12-byte IV generated per write, and the auth tag stored alongside the ciphertext in a single `iv:authTag:ciphertext` (base64, colon-joined) string. The 32-byte key used for this lives in `apps/server/.local-key`: generated with `crypto.randomBytes(32)` and written (mode `0o600`) the first time the server boots and finds no such file; read from that file on every subsequent boot. The key is never logged, never included in any API response (`GET /api/providers` only ever returns a derived `isConfigured: boolean`), and never sent to the frontend in any form.
**Rationale:** `architecture.md` §6 already committed to "secrets never leave the backend" and gitignoring `brainy.db`, but gitignoring the database file only protects against *committing* it — it does nothing if the `.db` file itself is ever copied, backed up, synced to cloud storage, or read directly by another process on the machine. Encrypting the column is a second, independent layer that holds even if the raw file leaks. AES-256-GCM (vs. CBC or a simpler cipher) was chosen because it's authenticated — a tampered or corrupted ciphertext fails to decrypt loudly (via the auth tag check) rather than silently returning garbage. A per-machine generated key (vs. a key baked into the repo, or derived from something fixed) means the ciphertext is useless without that specific machine's key file, and losing/deleting the key file is a clean, understood failure mode (existing keys stop decrypting; user re-enters them in Settings) rather than a silent one.
**Status:** Decided.
**Touches:** `apps/server/src/db/crypto.ts` (new), `apps/server/src/routes/provider-credentials.ts`, `apps/server/src/db/schema.ts`, `.gitignore` (`apps/server/.local-key`), `docs/architecture.md` §6.

### ADR-0061 — `provider_credentials` schema shape and REST route surface for Phase 1
**Decision:**
- `provider_credentials.api_key` changed from `notNull()` to nullable — `null` means "not configured," distinct from an empty string, and lets `GET /api/providers` always return a row for all three fixed providers (seeded lazily) rather than omitting unconfigured ones.
- `provider` is `unique()` — exactly one row per provider, upserted in place rather than accumulating history.
- Added `execution_mode` (`text`, default `"native"`, one of `"local" | "native" | "manual"`) to the same table rather than a separate table — it's a per-provider setting with the same lifecycle and the same single-row-per-provider shape as the key itself, so a second table would just be a second place to keep in sync.
- Route surface is the minimal REST CRUD the directive called for, no more: `GET/POST /api/profile` (single-row upsert — there is exactly one user), `GET /api/providers` (always all three, synthesized defaults for unconfigured ones), `PUT /api/providers/:provider` (upsert; encrypts the key if one is provided; validates `provider` and `executionMode` against fixed allow-lists), `DELETE /api/providers/:provider` (nulls the key, leaves `execution_mode` and `is_enabled` alone), `GET/PUT /api/brand-profile` (single row, labeled `"Default"`, created lazily on first write).
**Rationale:** Nothing in `architecture.md` §5.3's schema table or §4 pinned down the exact column nullability, uniqueness, or route shapes — these are the concrete decisions made while actually building Phase 1, logged per `agents.md` §2 rather than left undocumented. Nullable+unique keeps the table a clean "current state per provider" model instead of a log, which is what every consumer (`isConfigured()`, the Settings UI) actually needs.
**Status:** Decided.
**Touches:** `apps/server/src/db/schema.ts`, `apps/server/src/routes/profile.ts`, `apps/server/src/routes/provider-credentials.ts`, `apps/server/src/routes/brand-profile.ts`.

### ADR-0062 — In-app branding is always "Brainy.ai," never bare "Brainy"
**Decision:** Everywhere the product name appears to the user — page `<title>`/metadata, the navbar wordmark, the About modal, the login/welcome screens, Settings headers, and any error or toast copy that names the product — it reads **"Brainy.ai,"** never standalone "Brainy." This applies to all current and future in-app copy.
**Rationale:** Istiyak flagged that the Phase 0 placeholder page shipped with bare "Brainy," which doesn't match the product's actual name. Logging this explicitly as a standing rule (not just a one-time fix) so it doesn't drift back to "Brainy" in a later phase's new screens. Internal/code-facing references — comments, doc headings like "Architecture — Brainy (brainy.ai)," `package.json` `description` fields, variable/table names — are unaffected; this rule is about what the user actually sees rendered in the app.
**Status:** Decided.
**Touches:** `apps/web/app/layout.tsx`, `apps/web/components/layout/navbar.tsx`, `apps/web/components/layout/profile-menu.tsx`, `apps/web/components/layout/about-dialog.tsx`, `apps/web/components/login/first-run-login.tsx`, `apps/web/components/settings/provider-key-field.tsx`, `docs/implementation_plan.md`.

### ADR-0063 — Route naming corrected to plural: `/brainboards/`, not `/brainboard/`
**Decision:** The Boards List and Brainboard canvas routes are `/brainboards/all` and `/brainboards/[id]` — plural — not the singular `/brainboard/all` / `/brainboard/[id]` that ADR-0023 originally specified and Phase 1 implemented.
**Rationale:** Istiyak noticed the inconsistency by eye in the actual URL bar. Checking it against the decision record confirmed it: ADR-0023 itself says route naming should "stay consistent with whatever entity pluralization convention is locked (ADR-0020)," and ADR-0020 locked **plural** table names (`boards`, `nodes`, `edges`). ADR-0023 then specified a singular route anyway, inconsistent with its own stated rule, and nothing caught the contradiction until now. Plural also simply matches the underlying `boards` table name. This corrects the inconsistency rather than introducing a new preference.
**Status:** Decided. Supersedes the route pattern in ADR-0023 (ADR-0023's env-config/base-URL points still stand).
**Touches:** `apps/web/app/page.tsx` (redirect target), `apps/web/app/brainboards/all/page.tsx` (renamed from `brainboard/all` — Istiyak needs to delete the now-empty old `apps/web/app/brainboard/` folder by hand, since this session can't delete files on his machine), `architecture.md` §3.4, `agents.md`, `feature.md`, `implementation_plan.md`.

### ADR-0064 — Design-token foundation extended (elevation, motion, full semantic color scales); `background.page`/`background.surface` decoupled
**Decision:**
- Added a `shadow` primitive group to `packages/tokens/tokens/primitives.json`: `sm`, `md`, `lg`, `accentRing` (for the accent-tinted glow under the brand mark / focus states), and `nav` (a dedicated, stronger value — see rationale). Semantic aliases added in `semantic.json`: `shadow.surface` → `shadow.sm`, `shadow.surfaceRaised` → `shadow.md`, `shadow.overlay` → `shadow.lg`, `shadow.accentFocus` → `shadow.accentRing`. `shadow.nav` is deliberately **not** given a semantic alias — Style Dictionary emits both a primitive and a same-named semantic token to the identical CSS custom-property name, so aliasing `shadow.nav` to itself is a circular reference, not just redundant. It's referenced directly from `globals.css`, the same pattern already used for `motion.*` below.
- Added a `motion` primitive group: `motion.duration.fast` (150ms) and `motion.duration.slow` (300ms), `motion.easing.standard` (`cubic-bezier(0.2, 0, 0, 1)`) and `motion.easing.out` (`cubic-bezier(0, 0, 0.2, 1)`) — better-ui's exact named values, not per-component magic numbers. These have no semantic alias layer either, for the same reason: four fixed, already-intention-revealing names (`fast`/`slow`/`standard`/`out`) don't need a second "raw vs. semantic" indirection the way colors do.
- All of the above are mapped into Tailwind utilities via `@theme inline` in `apps/web/app/globals.css`: `shadow-surface`, `shadow-surface-raised`, `shadow-overlay`, `shadow-accent-focus`, `shadow-nav`, `duration-fast`, `duration-slow`, `ease-standard`, `ease-out-token`.
- `color.danger`, `color.success`, and `color.warning` expanded from 2 shades each (500/600) to full 50–900 scales, matching the existing `color.gray`/`color.accent` pattern — Phase 1 only had enough of each to paint a single solid state, not e.g. a tinted background + matching text/border pairing.
- **`color.background.page` and `color.background.surface` swapped values.** `page` is now `{color.gray.50}` (was `{color.white}`); `surface` is now `{color.white}` (was `{color.gray.50}`).
**Rationale:** Istiyak's Phase 1 review ("everything runs nicely... UI is very simple and can be improved and a bit catchy," later sharpened to the navbar specifically needing to be "modern and catchy, not only separated through bottom border") traced back to two gaps, not a surface-level reskin: the token set itself had no elevation or motion vocabulary to express hierarchy with, and — the actual root cause — `background.page` and `background.surfaceRaised` both resolved to the same or near-identical white, so there was no contrast for *any* shadow to read against even once one was added; that's why the UI looked flat even where component-level details (Button's 0.96 press-scale, etc.) were already correctly implemented. `shadow.nav` is its own tuned value, visibly stronger than `shadow.sm`/`shadow.md`, because those card-level shadows were rendered and screenshotted on the navbar first and came out essentially imperceptible — a full-window-width horizontal bar has no bounded edges to frame a subtle shadow against the way a card does, so it needs materially more shadow intensity to register as elevation at all, confirmed by comparing rendered screenshots before and after.
**Status:** Decided.
**Touches:** `packages/tokens/tokens/primitives.json`, `packages/tokens/tokens/semantic.json`, `apps/web/app/globals.css`, `apps/web/components/layout/navbar.tsx`, `apps/web/components/layout/profile-menu.tsx`, `apps/web/components/ui/dialog.tsx`, `apps/web/components/login/first-run-login.tsx`, `apps/web/components/login/welcome-back.tsx`, `apps/web/app/settings/page.tsx`.

---

### ADR-0065 — Node card redesign: color-coded compact chrome, 3-dot-menu-only deletion, and a distinct `video` node type for the Phase-5 metadata pull-forward
**Decision:**
- **Card chrome**: every node type now shares `NodeChrome` (unchanged in principle, tightened in practice) at `w-56`/`rounded-md` instead of `w-64`/`rounded-lg`, plus a real hover state (`shadow-surface` → `shadow-surface-raised` + a tinted border) that didn't exist before at all.
- **Color-coded headers**: a new shared `NodeHeader` component takes an `accent` of `"neutral" | "info" | "danger"` — neutral (gray) for text/file nodes, info (new blue scale) for generic link nodes, danger (existing red scale) for video nodes. Two new primitive/semantic token pairs were added for this (`color.info.*`, plus `background.infoMuted`/`background.dangerMuted`/`text.info`/`border.infoMuted`/`border.dangerMuted` in `semantic.json`) rather than hardcoding hex values anywhere, per ADR-0024/0031. Reusing the existing `danger` scale for YouTube's red (rather than adding a dedicated "YouTube brand red" token) was a deliberate call — it's a strong enough match and keeps the palette from growing a token per future platform.
- **Deletion**: the standalone always-visible "X" button is removed from every node header. A new shared `NodeMenu` (3-dot/kebab, same click-outside/Escape pattern as `board-row-menu.tsx`) holds "Open" (where applicable) and "Delete", visible on hover/focus of the card rather than always-on. Going forward, a node can ONLY be deleted via the Delete key (while selected) or this menu's Delete action — both route through the same `board-store.ts` `deleteNode`, which now does the right thing everywhere (see BUG-009). **No confirmation dialog** on delete — covered below in ADR-0066, since the reasoning depends on undo existing.
- **Video nodes**: a real, distinct `type: "video"` node (not a `data.platform` flag on the existing `link` type). `nodes.type` is a plain `TEXT` column with zero DB-level enum constraint and `apps/server/src/routes/nodes.ts`'s own `NODE_TYPES` list already included `"video"` from Phase 2 (anticipating this), so this needed zero migration. A link node converts to a video node in place the moment its URL field resolves to a recognizable YouTube link (on blur, via `convertLinkNodeToVideo`), and a canvas paste of a YouTube URL creates a `video` node directly rather than a `link` node that then converts a moment later.
- **Metadata fetch**: new `GET /api/link-preview?url=` route on the backend (`apps/server/src/routes/link-preview.ts`), calling YouTube's public oEmbed endpoint (no API key) for title/thumbnail, server-side — never from the browser — matching the existing "server owns external calls" pattern (`architecture.md` §4, same reasoning as file-node extraction). This is explicitly ONLY the Phase 5 metadata/thumbnail slice; the yt-dlp/ffmpeg/Whisper lazy-extraction pipeline is untouched and still depends on Phase 4's context-assembly module.
**Rationale:** Istiyak's own words — cards "look very big," the X-button left a stale card on screen until a reload (traced to BUG-009, a real local-state bug, not a styling issue), and the reference screenshots showed a consistent color-coded/compact/3-dot-menu anatomy across card types that the existing cards didn't follow at all. Picking a distinct node type over a data flag for video keeps `nodeTypes` (the React Flow renderer-selection mechanism) doing exactly what it's for — selecting a whole different component tree, not branching deep inside one `LinkNode` component on a flag — and costs nothing migration-wise given the column was already untyped and the type name already reserved.
**Status:** Decided.
**Touches:** `packages/tokens/tokens/primitives.json`, `packages/tokens/tokens/semantic.json`, `apps/web/app/globals.css`, `apps/web/components/canvas/node-chrome.tsx`, `apps/web/components/canvas/node-header.tsx` (new), `apps/web/components/canvas/node-menu.tsx` (new), `apps/web/components/canvas/text-node.tsx`, `file-node.tsx`, `link-node.tsx`, `video-node.tsx` (new), `apps/web/lib/youtube.ts` (new), `apps/web/stores/board-store.ts`, `apps/server/src/routes/nodes.ts` (PATCH now accepts `type`), `apps/server/src/routes/link-preview.ts` (new), `apps/server/src/index.ts`, `docs/bugs.md` (BUG-008, BUG-009), `docs/implementation_plan.md`, `docs/testing.md`.

### ADR-0066 — Session-scoped undo/redo stack; Figma-like canvas selection/pan/zoom key mapping; no delete-confirmation dialog
**Decision:**
- **Undo/redo**: a command-style history stack lives in `board-store.ts` (`past`/`future` arrays of `HistoryEntry`, capped at 100 entries), covering the four mutations the brief called out as the minimum — node create, delete, position change (drag), and data/type edits (including the link→video conversion, modeled as a type+data "update" entry so it reuses the same machinery rather than needing a fifth entry kind). **Session-scoped, not persisted** — a fresh page load starts with an empty stack, same as reloading resets a text editor's undo history in most apps; reconciling a stale cross-reload stack against server state that may have moved on wasn't worth the complexity for a single-user local tool. A text-field edit produces ONE history entry per edit session (first keystroke after the last commit → the next blur/debounce-commit), not one per keystroke, so undoing a paragraph of typing is one Ctrl+Z, not one per character. A multi-node Delete-key press currently produces one history entry PER deleted node (undoing restores them one at a time rather than as a single batch) — a conscious "good enough for now" simplification, not an oversight; worth revisiting if Istiyak finds batch-undo friction in practice. Undo of a delete recreates the node with its ORIGINAL id (the POST route now accepts an optional `id`, used only by this path), so a redo/undo cycle on the same node stays the same node, not a lookalike — this needed a small, low-risk backend change (`apps/server/src/routes/nodes.ts`).
- **Controls**: Undo/Redo buttons live inside React Flow's own `<Controls>` (bottom-left, where zoom already is), added as `<ControlButton>` children rather than a second separately-positioned toolbar — matches the brief's "attached with the canvas zoom control" ask exactly. Also bound to Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y, guarded on `document.activeElement` so it never hijacks a text field's own native undo while actually typing.
- **Selection/pan/zoom**: `selectionOnDrag` on (drag on empty canvas = marquee-select), `panOnDrag={[1, 2]}` (pan via middle- or right-button drag instead of left-drag), `panOnScroll` on (trackpad/wheel scroll pans), default `zoomOnScroll`/`zoomOnPinch` left on (Ctrl/Cmd+scroll or pinch zooms) — this is React Flow's own closest built-in approximation of Figma's actual input model (drag-to-select, scroll-to-pan, modifier-to-zoom) and needed no custom pointer-event handling to get there. `multiSelectionKeyCode` set to `["Shift"]` so Shift+click toggles a node in/out of the current selection, as asked. `minZoom`/`maxZoom` (0.1–2) and `fitViewOptions` (`padding: 0.4, maxZoom: 1`) are tuned against the smaller w-56 card footprint from ADR-0065, not inherited from the old w-64 cards.
- **No delete-confirmation dialog.** An accidental Delete-key press or menu click is now recoverable via Ctrl+Z (immediately, no extra step) — a confirmation dialog would add a click to every deliberate delete (the overwhelmingly common case) to guard against a now-recoverable mistake. If Istiyak finds himself undoing accidental deletes often enough that even one extra click feels better than that, this is cheap to revisit.
**Rationale:** Matches the brief's explicit instructions for undo/redo placement and shortcuts, multi-select mechanics ahead of Phase 3's grouping work, and Figma-like pan/zoom, while keeping the implementation inside React Flow's own supported props rather than hand-rolling pointer-event handling that would fight the library.
**Status:** Decided.
**Touches:** `apps/web/stores/board-store.ts`, `apps/web/app/brainboards/[id]/page.tsx`, `apps/server/src/routes/nodes.ts`, `docs/implementation_plan.md`, `docs/testing.md`.

### ADR-0067 — Scope refinement of ADR-0053: cosmetic title/favicon fetch for ANY link now in-bounds; full content scraping still out
**Decision:** `GET /api/link-preview?url=` (ADR-0065's YouTube-only oEmbed route) is widened to handle any http(s) URL: YouTube and Vimeo keep their public no-auth oEmbed endpoints (title/thumbnail/author), and every other URL gets a lightweight generic fetch — a bounded read (`redirect: "follow"`, a real User-Agent, capped at 200KB or until `</head>`, whichever comes first) that regex-extracts `<title>` and a favicon `<link rel="icon"|"shortcut icon"|"apple-touch-icon">` (resolved against the target URL, falling back to `/favicon.ico`). This is explicitly still ONLY page metadata — no article/body content is ever read or stored, keeping ADR-0053's "no scraping" boundary intact; only the *specific* thing in scope moved from "none of this" to "title + favicon, nothing else." The link node's header now shows this fetched title + favicon (or the raw URL as plain text, never a bordered input, if the fetch fails) instead of two permanently-empty bordered `<input>` boxes.
**Rationale:** Istiyak's own words — "why do we need Title input and link input and all... see how crisp cards are made" — the old link card's two always-open input boxes read as unfinished/raw rather than a real preview, and the Poppy reference screenshots showed a title+favicon chip, not input fields. A capped, server-side, read-only metadata fetch is cheap and carries none of the scope/legal/complexity weight that full content scraping would, so it was a reasonable line to move.
**Status:** Decided.
**Touches:** `apps/server/src/routes/link-preview.ts`, `apps/web/components/canvas/link-node.tsx`, `apps/web/components/canvas/node-header.tsx`, `apps/web/stores/board-store.ts`.

### ADR-0068 — Hover-only delete "X" reinstated as a third, equally intentional deletion path alongside the 3-dot menu and Delete key
**Decision:** A small "X" button is added back to every node card, floating on the outer (non-clipping) wrapper's top-left corner — hidden (`opacity-0`) by default, revealed only on hover/focus (`group-hover:opacity-100`/`group-focus-within:opacity-100`) via `NodeChrome`. It routes through the exact same `deleteNode` action as the 3-dot menu's "Delete" item and the Delete key, so it's covered by the same undo entry and has no separate confirmation dialog, for the same reasoning as ADR-0066 (undo covers an accidental click; a hover-gated, deliberately-reached-for button is also inherently harder to hit by accident than an always-visible one). Positioned top-LEFT specifically so it can never collide with the header's own top-right 3-dot menu or ADR-0070's bottom-right resize handle.
**Rationale:** Istiyak's explicit follow-up: this isn't walking back ADR-0065's "no standalone always-visible X" decision (that one was about an *always-visible* X that left stale cards on screen, BUG-009) — a hover-gated X is a different, narrower affordance he specifically wants as a third path, not a contradiction.
**Status:** Decided. Amends ADR-0065's deletion-path list from two paths to three.
**Touches:** `apps/web/components/canvas/node-chrome.tsx`.

### ADR-0069 — Universal type-adaptive paste/upload: plain-text → text node, file-kind icon differentiation, Vimeo oEmbed
**Decision:**
- **Plain-text paste onto bare canvas** now creates a text node seeded with the pasted content (`addTextNode(position, content)`), instead of doing nothing. The existing URL-paste behavior (creating a link/video node) is unchanged — this only fills the previously-dead "paste plain text" branch.
- **File uploads** get a `fileKind` (`"pdf" | "docx" | "xlsx" | "image" | "other"`) computed server-side at upload time from extension/mime (`apps/server/src/routes/files.ts`'s `fileKindOf()`), driving a distinct icon per kind on the file card (FileText / FileSpreadsheet / ImageIcon) — resolved at creation time, no reload needed.
- **Vimeo** gets the same treatment as YouTube: a `parseVideoUrl()` helper (replacing the old YouTube-only `parseYouTubeUrl`) recognizes both platforms, and `link-preview.ts` calls Vimeo's own public no-auth oEmbed endpoint (`https://vimeo.com/api/oembed.json?url=`) the same way it already called YouTube's — low-effort, basically free, matching Istiyak's "worth adding since it's basically free" note.
- All of the above resolve immediately on paste/upload (server calls kick off the moment the node is created, with a `status: "loading"` state shown while in flight) — never requiring a reload to pick up the right type/style.
**Rationale:** Istiyak's explicit correction that the type-adaptive preview behavior "should be universal... not only limited to YouTube node cards" — generalizing a pattern that was already built (YouTube's own oEmbed + conversion-on-recognize) to the other cases it was always conceptually meant to cover, rather than treating YouTube as a one-off special case.
**Status:** Decided.
**Touches:** `apps/web/app/brainboards/[id]/page.tsx` (paste handler), `apps/web/lib/video-platform.ts` (new, replaces `apps/web/lib/youtube.ts`), `apps/server/src/routes/files.ts`, `apps/server/src/routes/link-preview.ts`, `apps/web/stores/board-store.ts`.

### ADR-0070 — Resizable cards: bottom-right-only drag handle, size persisted in `data` (no new DB column), undoable
**Decision:** Every node card can be resized by dragging its bottom-right corner, using `@xyflow/react`'s own `NodeResizeControl` (a single handle, not the full 8-handle `NodeResizer`) — shown only while the card is selected. Resizing never moves the node's `x`/`y` (a bottom-right-only handle can't), which keeps both the undo entry and the persisted shape simple: width/height only, no position coupling. The resized size is persisted the same way position already is — on resize-END only (not per drag tick), via a new `saveNodeSize` store action — and pushes a `"resize"` entry onto the same undo/redo history stack as move/data edits (ADR-0066), so a resize is undoable in the same bucket. No new DB column: the size is mirrored into each node's existing flexible `data` JSON blob as `cardWidth`/`cardHeight`, read back out by `toRfNode()` — avoids requiring Istiyak to run a manual `npm run db:migrate`, which his own `npm run dev` does not run automatically.
**Important implementation gotcha (see bugs.md BUG-012):** the resized size must be read from the node's own `data.cardWidth`/`cardHeight`, never from React Flow's `NodeProps.width`/`height` — those reflect MEASURED size (`@xyflow/system`'s `getNodeDimensions()`, falling back to a transient near-zero value before the first `ResizeObserver` tick), not an app-set explicit value, and using them directly self-collapses every fresh card to ~2px.
**Rationale:** Matches the brief exactly ("dragging their bottom-right corner... persist on resize-end, not every drag tick... undoable, same bucket as move/data edits") and the existing architecture's "no new column unless necessary" bias (position itself already lives partly outside `data` for historical reasons, but nothing forced size to follow that precedent for a brand-new field).
**Status:** Decided.
**Touches:** `apps/web/components/canvas/node-chrome.tsx`, `text-node.tsx`, `file-node.tsx`, `link-node.tsx`, `video-node.tsx`, `apps/web/stores/board-store.ts`, `docs/bugs.md` (BUG-012).

### ADR-0071 — Ribbon-behind-card header structure; icon+color-per-type system; chat-bubble "ask AI" icon deliberately omitted
**Decision:**
- **Ribbon structure**: the card header is no longer the literal top strip of one bordered box — it's a separate, slightly wider/taller rounded rect (`NodeChrome`'s new `header` prop, rendered in an absolutely-positioned layer) sitting BEHIND the white body card, peeking out around its top edges/corners, matching Istiyak's zoomed reference crop exactly. Implemented via `padding-top` on the outer wrapper, not `margin-top` on the body — see bugs.md BUG-013 for why that distinction mattered in practice (CSS margin-collapse silently erased the offset on the first attempt).
- **Icon+color-per-type system** (new `NodeAccent` values `warning`/`accent` added to ADR-0065's `neutral`/`info`/`danger`): text = `info` (blue, `Type` icon), link = `neutral` (gray, `Link2` icon), file/document = `warning` (orange/amber — unified across pdf/docx/xlsx/other, see note below), YouTube video = `danger` (red, existing), Vimeo video = `accent` (the app's existing indigo/purple primary-action scale, reused rather than adding a dedicated purple scale for one card type). New `color.ribbon.*` semantic tokens (`.600` shade of each primitive scale) + reused `text.onAccent` (white) for ribbon text.
- **File-card color, a deliberate deviation from the earlier per-filetype-color ask**: ADR-0069 originally called for Office-style per-kind colors (red/blue/green). This round's newer, more specific reference screenshots showed one consistent "document" (orange) ribbon color for every non-image file type. Rather than silently dropping either instruction, the call made here: keep per-kind ICON differentiation (still genuinely useful — PDF/Excel/other are visually distinguishable at a glance) while unifying the ribbon COLOR to match the newer reference, since the reference is more specific and more recent. Images keep a neutral ribbon (their own thumbnail is the primary visual identity, unchanged from before).
- **Chat-bubble "ask AI" icon — deliberately omitted entirely**, not wired as a disabled stub. The reference's header anatomy includes a chat-bubble icon between the title and the 3-dot menu, which in the reference app is "ask AI about this card" — a feature that needs a real chat/AI node Brainy doesn't have yet (Phase 4, not built). Call made here: leave it out entirely rather than ship a visible-but-dead icon, on the reasoning that an affordance that does nothing when clicked is worse than no affordance at all, even though this codebase has precedent elsewhere for showing a disabled stub of a not-yet-built feature. Revisit when Phase 4's chat/AI node exists.
- **Deferred, documented rather than implemented**: a colored connector/handle dot per card (tinted to the card's accent color) from the reference was NOT added — Brainy has no edge-creation UI at all yet (no `<Handle>` is rendered on any node currently; `edges` exist in the data model but nothing in the current UI creates one), so a connector dot here would be the same category of problem as the chat-bubble icon — a visual affordance for a feature that isn't built. Left out for the same reasoning, to revisit whenever node-to-node connections become a real feature.
- **Implemented, lower-effort additions matching the reference closely enough**: the document card's body now shows file size + a download icon/link (previously just the extraction-status text); the YouTube thumbnail shows a small channel-name badge bottom-left (from the oEmbed response's `author_name`) when known, matching the reference's platform/source badge. The text card's header icon is Lucide's `Type` glyph (already visually a filled "T") rather than a separate badge-chip wrapper around it — judged close enough to the reference's "T-badge" treatment not to warrant extra chrome for a single-user app.
**Rationale:** Matches Istiyak's two reference screenshots as closely as is reasonable without inventing not-yet-built features, while being explicit and auditable about the two places a judgment call was made (file-card color, chat-bubble omission) and the one place something was deliberately deferred (connector dot) rather than silently skipped.
**Status:** Decided.
**Touches:** `apps/web/components/canvas/node-chrome.tsx`, `node-header.tsx`, `text-node.tsx`, `file-node.tsx`, `link-node.tsx`, `video-node.tsx`, `packages/tokens/tokens/semantic.json`, `apps/web/app/globals.css`, `docs/bugs.md` (BUG-013).

### ADR-0072 — Round 3 node-card fixes: delete "X" moved outside the top-right corner, ribbon overshoot tightened, resize hit-target enlarged, slim scrollbars everywhere
**Decision:**
- **Hover-delete "X"** moved from floating outside the top-LEFT corner (ADR-0068's original placement) to floating outside the top-RIGHT corner instead — still hidden until hover/focus, still the same undo-covered `deleteNode` call, still clear of the bottom-right resize handle. Distinct from the header's own inline 3-dot menu (which stays inside the ribbon bar) even though both now live on the right side of the card, since the X floats entirely outside the card's bounds while the menu sits inside it.
- **Ribbon overshoot** reduced from 4px/side (`-inset-x-1 -top-1`) to 2px/side (`-inset-x-0.5 -top-0.5`) — a quieter peek, not a removal of the layered-ribbon effect itself (ADR-0071's structure is unchanged, only the offset amount).
- **Resize hit-target enlarged** from 10px to 14px with stronger border/shadow — see bugs.md BUG-015: the handle's own internal anchor point sits exactly on the card's corner (React Flow's own CSS centers it there via `translate: -50% -50%`), so a small handle leaves most of its real hit-area outside what the user can actually see to aim at. This isn't a cosmetic change — it's the actual fix for "resize isn't working."
- **Slim, mostly-transparent scrollbars** added globally via a `.scrollbar-thin` utility class (`apps/web/app/globals.css`) applied to every scrollable node-card surface (text body, notes field, file-node's extraction body, `NodeChrome`'s own overflow body once a card is resized) — plain CSS (`scrollbar-width`/`scrollbar-color` for Firefox, `::-webkit-scrollbar` for Chromium/Safari), no new dependency, thumb color derived from the existing `text.secondary` token via `color-mix()` rather than a new hardcoded color or a new token just for a translucent variant.
- **BUG-014** (a `link` node whose URL already resolves to a recognized video platform never converting or fetching metadata on mount, since the mount effect explicitly skipped any video URL on the wrong assumption that a `blur` event would always follow) is fixed by checking for a video URL first on mount and converting immediately, plus converting live on every keystroke in the URL field rather than waiting for blur — closing the gap for a card that's typed into and never actually blurred.
**Rationale:** Direct response to Istiyak's own live screenshot and explicit per-item feedback ("Delete on hover not suites the best... can be outside the header top right corner", "Header behind back is shooting out loud", "Resize is not working... scrollbars... look very old"). The resize and link-conversion fixes are root-cause bug fixes, not restyling — both were reproduced live before being touched, per standing instruction, rather than guessed at from the screenshot alone.
**Status:** Decided.
**Touches:** `apps/web/components/canvas/node-chrome.tsx`, `link-node.tsx`, `text-node.tsx`, `node-notes-field.tsx`, `file-node.tsx`, `apps/web/app/globals.css`, `docs/bugs.md` (BUG-014, BUG-015).

### ADR-0073 — Node card chrome rebuilt as a single flex-sized container (fixes the ribbon/body drift + detached resize handle + "resize only grows the header" bug)
**Decision:** `NodeChrome`'s header ribbon and white body are no longer two independently-positioned/sized elements (one absolutely positioned against an unstyled wrapper, one carrying its own explicit pixel style) — they are now both ordinary in-flow `flex flex-col` children of ONE outer container, and that outer container is the only element that ever carries an explicit size (the default `w-56`, or the resized `style={{ width, height }}`) and the only element the resize handle is anchored to. The header is `shrink-0` (sized to its own content); the body is `flex-1 min-h-0` (fills whatever's left) — so the body's size is always DERIVED from the shared container, never independently tracked, and structurally cannot drift from it. The small colored "peek" around the body is now just `p-0.5` padding on this one container showing its own background color through, not a second box's offset to keep in sync with anything. The video card's thumbnail and the file card's image were changed to `flex-1 min-h-0` (when the card has been resized) instead of a fixed height, so the actual media area grows with the card rather than staying pinned at its original size while empty space opens up around it.
**Rationale:** Istiyak's live screenshot showed the ribbon and body as two visibly separate, differently-sized boxes, a resize handle fully detached from the card, and confirmed resizing only grew the header — direct evidence the header and body were never truly one sized unit under ADR-0071/ADR-0072's structure. Root-caused (bugs.md BUG-016) to `NodeResizeControl`'s live-drag feedback writing directly to React Flow's own `node.width/height` (which the old unstyled outer wrapper tracked immediately, since a plain block element fills its parent's width) while the body's own explicit style only updated once, at resize-end — two sources of truth for the same thing, guaranteed to disagree mid-drag. The fix addresses the brief's explicit instruction to "fix the structure once at the structural level rather than chasing each symptom": a single sized container that both pieces are flex children of makes the drift physically impossible, rather than patching the visual symptom again.
**Also this round:** the hover-delete "X" pushed further out again (`-top-2/-right-2` → `-top-4/-right-4`, confirmed live with a real ~6px/4px clearance gap from the 3-dot menu, not touching); the file/document card's header label changed from the specific filename to the generic category word "Documents" (matching the Text card's "Text" and the reference screenshots exactly — the filename now lives in the body instead, next to its own small file-type icon); the Text card's header icon now sits inside a small filled chip (`iconBadge` prop on `NodeHeader`, opt-in per card) matching the reference's distinct "T badge" treatment, rather than the previous bare line-icon.
**Status:** Decided.
**Touches:** `apps/web/components/canvas/node-chrome.tsx`, `node-header.tsx`, `text-node.tsx`, `file-node.tsx`, `video-node.tsx`, `docs/bugs.md` (BUG-016).

### ADR-0074 — Round 5 node-card polish: light-tint headers replace solid fills, "open" action moved beside the 3-dot menu, corner-radius nesting fixed, icon choices re-matched to the reference
**Decision:**
- **Header color — solid fills replaced with light tints.** Istiyak: "Color we have set to solid While in reference we have light theme. help me to decide the best approach." The call made: every card type's header/ribbon now uses a pale `.100`-shade tint background (`ribbonBg`) paired with a darker `.700`-shade text/icon color (`ribbonFg`) of the SAME hue, instead of the previous saturated `.600`-shade solid fill with white text/icon. This matches the reference's light-theme header exactly (pale lavender/pink/blue/red/peach, each with legible darker-toned text) and reads as calmer and closer to the reference than the louder solid-color banner it replaces. The OLD solid `.600` value is kept as `ribbonSolid` — not deleted — because it's still needed for the small filled icon "badge" chip the reference shows on a couple of card types (see icon-choices below); it's just no longer used for the header's own background. Implemented as three parallel token groups (`ribbonBg`/`ribbonFg`/`ribbonSolid`, each with the existing six `NodeAccent` keys) in `packages/tokens/tokens/semantic.json`, generating three parallel CSS variable sets, rather than overloading the one old `ribbon` token with a second meaning.
- **"Open" action moved out of the 3-dot dropdown**, now its own always-visible icon button directly beside the 3-dot menu trigger in the header's right-hand side (Istiyak: "Go to link icon to embed beside the 3 dots upfront and not in beneath 3 dots"). It no longer lives inside `NodeMenu`'s dropdown at all — `NodeMenu` no longer accepts `onOpen`/`openLabel` props. Both actions (open, delete-menu) are visible together on hover, not one nested inside the other.
- **Corner-radius nesting fixed** — see bugs.md BUG-017. The body's `rounded-md` (8px) didn't nest correctly inside the outer container's `rounded-lg` (12px) minus its `p-0.5` (2px) padding; changed to `rounded-lg` (12px) to match.
- **Icon choices re-matched to the reference per type** (Istiyak: "Youtube should have youtube solid icon not the view file icon... Text should be 'T' block solid icon etc."): YouTube's generic `Clapperboard` swapped for `SquarePlay` rendered in `iconBadge`'s solid chip (red) — there is no literal YouTube brand glyph in this lucide-react version (checked directly: absent), so `SquarePlay`'s rounded-rect-plus-play-triangle silhouette is used as an honest, non-trademark stand-in, consistent with this project's standing practice of not imitating a third party's exact logo (see ADR-0073's chat-bubble-icon precedent). Vimeo keeps its own plain (non-badged) `Video` glyph in its purple `ribbonFg` color, so the two platforms stay visually distinct rather than sharing one badge treatment. Text's existing `iconBadge` now correctly receives `accent="info"` (it previously defaulted to `neutral`/gray, a gap from round 4 — the badge chip is blue as intended). Link and file/document icons were checked against the reference and left as-is; no swap needed there.
**Rationale:** All four items are Istiyak's own explicit, numbered feedback this round, relayed with reference screenshots; none of this is a structural change (round 4's flex-based single-container fix from ADR-0073 stays untouched) — this is a polish pass matching colors, icons, and one small corner-radius geometry fix to what the reference already showed, plus relocating one existing action within the header.
**Status:** Decided.
**Touches:** `packages/tokens/tokens/semantic.json`, `apps/web/app/globals.css`, `apps/web/components/canvas/node-chrome.tsx`, `node-header.tsx`, `node-menu.tsx`, `text-node.tsx`, `video-node.tsx`, `docs/bugs.md` (BUG-017).

### ADR-0075 — Round 6 node-card polish: resize restricted to text, 3-dot menu removed entirely, per-type colored hover/select ring, per-filetype document colors restored, text card goes read-only-by-default, link card header/URL/preview-image redesign, drag-and-drop/paste-file upload fixed
**Decision:**
- **Resize restricted to the text card only** (Istiyak: "Apart from text none of the node cards needed resize"). `file-node.tsx`/`link-node.tsx`/`video-node.tsx` no longer pass `onResizeEnd` to `NodeChrome` — since the resize handle only ever renders when `selected && onResizeEnd`, simply omitting the prop is the off-switch; no separate "is this type resizable" flag was needed. A card resized before this round still renders at its saved `cardWidth`/`cardHeight` (nothing is reset), it just can't be resized further.
- **The 3-dot menu is gone from every card, entirely** (Istiyak: "Let's remove 3 dots from card header... No 3 dots only on hover GO TO link and X outside as is"). `node-menu.tsx` is deleted outright (nothing references it any more). `NodeHeader`'s hardcoded "open" button became a generic hover-only action slot (`onOpen`/`openLabel`/`actionIcon`, defaulting to `ExternalLink`) reused for the text card's new "Edit" affordance (`Pencil`) — same position, same hover behavior, different icon/verb per card. The link card's "Edit link" menu item moved into its own always-visible pencil icon in a new URL row (see below) rather than being dropped. The header's inline title-edit (`onLabelCommit`) was removed along with it — its only user was the link card, which round 6 explicitly stops making editable in the header (see below).
- **Hover/selected state is now per-type colored, not one universal brand-blue ring** (Istiyak: "Hover/select is currently showing brand accent color and gray shadows which looks contradict from card style... youtube card will have its own hover style, link will have its own hover style"). `node-chrome.tsx` adds `RIBBON_RING_SELECTED_CLASSES`/`RIBBON_RING_HOVER_CLASSES`, deriving the ring color from the same `ribbon-fg-*` CSS variables the header tint already uses — Tailwind v4 auto-generates `ring-*` utilities for any color registered in the `--color-*` theme namespace, so this needed no new token group. The ring moved to the OUTER container (not the body), so hovering/selecting highlights the whole card — ribbon peek and body both — as one unit, extending ADR-0073's "one container" principle to the multi-select visual state (Istiyak: "whole node card should look like selected", not just the body/preview). The body itself now carries only a plain neutral border, with hover limited to a mild shadow bump — no second, differently-colored highlight competing with the outer ring.
- **The hover-only delete "X" was toned down** (Istiyak: "currently slightly loud i.e. border, shadow, red color on X on hover all this can be minimize"): border and shadow removed, hover color changed from red (`text-text-danger`) to a neutral secondary gray — it's a quiet, muted affordance now, consistent with a card design that otherwise shows almost no chrome until hovered.
- **Per-filetype document color restored, reversing ADR-0071's unification** (Istiyak, explicit new instruction: "Document type should have exact file type feel... Excel is uploaded but its not giving a feel of excel"). `file-node.tsx`'s `FILE_KIND_ACCENT` is no longer one flat `warning` orange for every non-image kind — PDF is `danger` (red), Word/docx is `info` (blue), Excel/xlsx is `success` (green), matching the familiar Office-suite color convention (a widely recognized visual language for file types generally, not any one brand's specific logo/mark). This is a direct, explicit reversal of a prior round's call, made because the person who asked for the original unification is the same person now asking for the opposite, with a concrete complaint ("Excel... not giving a feel of excel") the unified color structurally could not satisfy.
- **Text card is read-only by default, with an explicit "Edit" affordance** — the one genuine interaction-model change of this round (Istiyak: "Text card should have edit button like Go TO Link on hover. Rest should have text previews and not directly editable field. This will reduce the mistakenly text changes on the go"). `editing` is local component state in `text-node.tsx`, seeded ONCE from whether the node started out empty — a brand-new node opens straight into edit mode (immediately typeable), any node that already has content opens as a read-only preview, with the header's hover "Edit" (`Pencil`) icon the only way back into editing; blur returns to read-only. Deliberately scoped to text only — every other node type's body is already non-editable content (thumbnail, file preview, URL), so there was never an equivalent "stray click changes something" risk elsewhere. The read-only preview also treats the first line of `content` as a title (bigger, `font-medium`) with the rest as plain body text (Istiyak: "first line could be treated like title... like all notetakers behave") — purely a render-time split of the one existing plain-text field, no new "title" field added to the data model.
- **Link card redesigned around a concrete reference screenshot** (Poppy's own link card: globe icon, external-link icon, no menu, a full-width preview image below the header) — three changes from round 2's version: (1) the header's inline title edit is gone entirely (Istiyak: "link card header should not be editable avoid the complexity") — the header is plain text now; (2) the raw URL moved into its own row below the header, ALWAYS visible as small secondary gray text with its own pencil edit icon beside it (previously only shown before a title resolved or while editing); (3) when the metadata fetch finds an Open Graph/Twitter-Card image, it renders full-width above the URL row at the same visual weight as the video card's thumbnail, falling back to the existing compact favicon-only treatment when none exists. The header's icon fallback changed from `Link2` (a chain-link glyph) to `Globe`, matching the reference exactly, still overridden by the real fetched favicon once one resolves. The server's `fetchPageMetadata` (`link-preview.ts`) now also extracts an `og:image`/`twitter:image` meta tag alongside the existing title/favicon — same "cosmetic metadata only, never page content" scope as ADR-0067/ADR-0053, extended, not loosened.
- **Link card header color bumped one step, every other type's color left untouched** (Istiyak: "Link card color only slight with more contrast. its too light for now. For rest Color part is sorted... locked it"): `ribbonBg.neutral` moved from `color.gray.100` to `color.gray.200` in the token source — the only token value changed this round. Since `neutral` is also the accent an image-type file card uses, that card gets the same slightly deeper tint as a harmless side effect; nothing else about any other card type's color changed.
- **BUG-018 fixed**: drag-and-drop and clipboard-file-paste now both create a real file node through the existing upload path, instead of falling through to the browser's native open/save handling. See bugs.md for the full root cause (two separate gaps: no `dragover`/`drop` handlers at all, and the paste handler never checked `clipboardData.files`).
**Rationale:** All explicit, numbered feedback from Istiyak this round, several with a concrete reference screenshot. The resize/menu/hover-ring/delete-X changes are a coherent "make the chrome quieter" pass — removing redundant or competing affordances (a menu with nothing left to hold once its one remaining action has its own icon; a universal selection color that visually argued with each card's own per-type identity) rather than adding more surface. The file-color reversal and text-card interaction-model change are the two places this round explicitly overrides an earlier round's decision, both because Istiyak himself is the one asking for the opposite now, with a concrete reason each time.
**Status:** Decided.
**Touches:** `packages/tokens/tokens/semantic.json`, `apps/web/app/globals.css` (unchanged class mappings, same token group), `apps/web/components/canvas/node-chrome.tsx`, `node-header.tsx`, `text-node.tsx`, `file-node.tsx`, `video-node.tsx`, `link-node.tsx`, `apps/web/stores/board-store.ts`, `apps/web/app/brainboards/[id]/page.tsx`, `apps/server/src/routes/link-preview.ts`, `docs/bugs.md` (BUG-018). `node-menu.tsx` deleted.

### ADR-0076 — Top Nav polish round 1: wordmark motion removed, shadow-nav softened, avatar contrast fixed to a solid fill, name+chevron added beside the avatar
**Decision:**
- **Wordmark**: `navbar.tsx`'s `WORDMARK_LINK_CLASSNAME` no longer carries `enabled:active:scale-96`, and the icon box's `group-hover:scale-105` is removed too — the brand link still navigates to `/brainboards/all`, it just carries no press/hover transform feedback anymore. The icon mark itself (the brain glyph, its accent box) is deliberately untouched otherwise — Istiyak is redesigning the logo separately later and asked specifically not to touch that part yet.
- **shadow-nav**: `primitives.json`'s `shadow.nav` second layer softened from `0 12px 20px -12px rgba(24,24,27,0.20)` to `0 8px 16px -10px rgba(24,24,27,0.12)` (the hairline layer's own alpha also eased 0.06 → 0.05) — same two-layer "hairline + soft shadow" structure `navbar.tsx`'s own header comment already justifies (a bare 1px border alone reads as a flat strip with a line under it, not real elevation), just toned down in blur/spread/alpha so the separator reads as present but not as a heavy drop-shadow.
- **Avatar contrast**: `avatar.tsx`'s default fill switched from `bg-background-accent-muted` (accent.50, a near-white tint) + `text-text-accent` (accent.600) to a solid `bg-background-accent` (accent.600) + `text-text-on-accent` (white) — the muted-tint circle barely registered against the white navbar surface at all, independent of whatever contrast ratio its own initials technically met against that tint; a solid fill reads as a deliberate badge the way the navbar's own logo icon box already does (same token pairing, `bg-background-accent`/`text-text-on-accent`).
- **Name beside the avatar**: addressed in ADR-0077 below, since the trigger itself is part of the profile-dropdown overhaul, not a standalone navbar change.
**Rationale:** Istiyak's own words — the logo "is not a button" and the scale effect should go (he'll redesign the mark itself later); the bottom shadow is "too harsh and too much... can be reduce[d]... to decrease the loudness"; the avatar's "contrast is very low."
**Status:** Decided.
**Touches:** `apps/web/components/layout/navbar.tsx`, `apps/web/components/ui/avatar.tsx`, `packages/tokens/tokens/primitives.json`.

### ADR-0077 — Profile dropdown overhaul: name+avatar trigger, icon-per-item menu, tinted hover states, Sign out given a dedicated danger treatment
**Decision:**
- **Trigger**: `profile-menu.tsx`'s trigger is now avatar + the profile's name (truncated at `max-w-32`) + a `ChevronDown` that rotates 180° when open, replacing the previous bare-avatar button. Istiyak was explicitly open to either "add Name aside it or something else" — pairing the name directly in the navbar read as the more informative, more conventional choice (a Notion/Linear-style "name + chevron" trigger) over inventing a different affordance, and costs nothing extra since `Profile` (`settings-store.ts`) already carries `name`.
- **Dropdown header**: now pairs a larger avatar (`size="lg"`) with the name again plus a short "Local profile" caption underneath. `Profile`'s actual shape (`id`/`name`/`avatar_initials` — checked `useSettingsStore`'s type before writing this) has no email or other secondary field to honestly pair it with, so the caption states what's actually true about this single-profile, local-only tool rather than inventing a field that doesn't exist.
- **Per-item icons + richer hover**: Settings/Keyboard shortcuts/About Brainy.ai each get a Lucide icon (`Settings`/`Keyboard`/`Info`) for visual rhythm, consistent with how `board-row-menu.tsx` and `node-menu.tsx` already use icons generously elsewhere in this app. Hover changed from one flat `hover:bg-background-muted` identically on every item to an accent-tinted wash (`hover:bg-background-accent-muted hover:text-text-accent`) plus a small rightward icon nudge on hover — a deliberately nicer DEFAULT-item hover, reserving the danger treatment below for Sign out specifically so the two read as visually distinct categories of action, not just one more color choice among equals.
- **Sign out**: gets its own `LogOut` icon and a danger-tinted hover (`hover:bg-background-danger-muted`, text red at rest) — reusing the exact `background-danger-muted`/`text-danger` pairing `node-menu.tsx`'s own danger `MenuItem` already established, rather than inventing a second danger-hover convention in this codebase — plus its own `pt-1.5` wrapper below an extra divider, so it reads as a clearly separated third zone (header / menu / sign-out), not just the last row in one flat list.
- **Overall polish pass**: widened to `w-64` (from `w-56`); `shadow-overlay` (the same token `dialog.tsx` already uses for its own overlay-level shadow) in place of the previous `shadow-surface-raised`; `zoom-in-95` added to the existing fade/slide entrance animation; `overflow-hidden` so the header's own padding doesn't visually fight the rounded corners.
**Rationale:** Istiyak's own words — "This is the real juice... could be a little sexy" — each of his four specific asks (name-header polish, hover effects, sign-out's own treatment, "proper separation") addressed directly, plus a general quality pass per his "check what all can be improved in profile dropdown" instruction, aimed at matching the level of polish already given to node-card chrome in the parallel redesign work rather than stopping at the literal bullet points.
**Status:** Decided.
**Touches:** `apps/web/components/layout/profile-menu.tsx`.

### ADR-0078 — Board-canvas breadcrumb replaces the navbar wordmark inside a board; inline double-click rename
**Decision:** Inside a board's canvas route (`/brainboards/[id]`), the global Navbar's left slot now renders a breadcrumb — Home icon (links to `/brainboards/all`) → folder name (only if the board is actually inside one, links to that folder's filtered Boards List view) → the current board's name — instead of the "Brainy.ai" wordmark. The wordmark still renders everywhere else (Boards List, Trash, Settings). The board-name segment is the trail's only non-navigation segment: double-click to edit it in place, with a pencil icon also appearing on hover as a second, more discoverable way to trigger the same rename. Both commit via the same `PATCH /api/boards/:id` endpoint the Boards List page's own `handleRenameBoard` ((list)/all/page.tsx) already uses — now lifted into `board-store.ts` as a `renameBoard` action (optimistic; reverts the local title if the request fails) so both call sites share one implementation instead of duplicating the PATCH call.

**This is a judgment call on an ambiguous instruction, flagged explicitly per standing instruction — not silently committed to as definitely correct.** Istiyak's breadcrumb paragraph's middle sentence was garbled/non-native phrasing. The interpretation built here: the breadcrumb replaces the brand wordmark specifically (not added as a third bar, and not replacing `CanvasShell`'s own existing h-12 toolbar — its "← Boards"/title/Text/Link/File row is completely untouched, since nothing in the brief clearly asked for removing a working, unrelated piece of UI on a guess). **If this reading is wrong, the fix is contained to `navbar.tsx`'s `isBoardCanvas` branch and does not touch `CanvasShell`.**

**Implementation note:** `board-store.ts` gained a `boardFolderId` field — `loadBoard` previously only kept `board.title` from its board fetch, discarding `folder_id` — so the breadcrumb doesn't need a second board fetch just to know which folder (if any) a board is in. It still needs its own `useFoldersStore().loadFolders()` call to resolve that id to a NAME, since a board can be opened directly (a bookmark, a fresh tab) without the Boards List page ever having loaded folders first; guarded on that store's own `loaded` flag so two mounted consumers don't double-fetch.

**Implementation note (a real bug, not styling — see bugs.md BUG-019):** deciding wordmark-vs-breadcrumb needs `usePathname()`, a dynamic client hook that `next.config.ts`'s `cacheComponents` option requires wrapping in `Suspense` — confirmed the hard way, both `next dev` and a full `next build` threw `CLIENT_HOOK_DYNAMIC` until this was fixed, the same constraint the per-route `Suspense` wrappers around `useParams()`/`useSearchParams()` in `[id]/page.tsx` and `(list)/all/page.tsx` already exist to satisfy. Fixed by extracting the pathname-dependent decision into its own `NavbarBrand` child component, wrapped in `<Suspense fallback={<Wordmark />}>` inside `Navbar` — the wordmark doubles as the fallback, so there's no flash of empty space.
**Rationale:** Matches Istiyak's stated reason for wanting the brand name gone once inside a board (a separate toolbar is coming/already exists, making the brand bar's repetition of identity redundant) while keeping the one genuinely ambiguous reading explicit and reversible rather than guessed at silently.
**Status:** Decided, pending Istiyak's confirmation on the ambiguous-instruction interpretation above.
**Touches:** `apps/web/components/layout/navbar.tsx`, `apps/web/components/layout/board-breadcrumb.tsx` (new), `apps/web/stores/board-store.ts`, `docs/bugs.md` (BUG-019).

### ADR-0079 — Round 7: canvas toolbar rebuilt as a floating icon-only palette; breadcrumb reordered to "Folder → Boards → board name"; zoom/undo cluster confirmed already at bottom-right
**Decision:** Three changes, all from Istiyak's own words relayed this round:
1. **Toolbar makeover.** `CanvasShell`'s old h-12 sub-header (`apps/web/app/brainboards/[id]/page.tsx`) — the "← Boards" link, board title, and text-labeled Text/Link/File buttons — is gone entirely, not just restyled. The board's identity now lives solely in the Navbar's breadcrumb above it (ADR-0078); repeating "← Boards"/the title a second time directly below it was the exact redundancy Istiyak's brief called out. In its place: a new `CanvasToolbar` (`apps/web/components/canvas/canvas-toolbar.tsx`), a small floating vertical icon palette pinned to the canvas's top-left — Poppy's own tool-palette position — holding the same three node-creation actions (Text/Link/File) as plain square icon buttons, nothing more. Each button gets a tooltip (`apps/web/components/ui/tooltip.tsx`, new) showing its full name ("Add text note", "Add link", "Upload file") on hover — Istiyak's literal ask ("Full name in tooltip on hover. for now that's sufficient.") — and nothing beyond a plain opacity fade on the tooltip and the same hover color-fade every other control in this app already uses; no entrance/press motion design, since Istiyak explicitly deferred real interaction/motion work to Phase 8 for the whole product, not just this toolbar.
2. **Breadcrumb wording/order.** `BoardBreadcrumb` (`apps/web/components/layout/board-breadcrumb.tsx`) changes from "Home icon → folder → board name" to "folder (if any) → **Boards** (real clickable text, not an icon) → board name" — Istiyak's literal correction: *"breadcrumb is wrongly shows 'Boards | Board Name' but actually should show 'Folder Name | boards | board name.'"* Verified live before changing anything (a board moved into the "Research" folder, via Playwright) that the previous icon-only Home link read ambiguously and the folder segment sat in the wrong position relative to "Boards" — both confirmed, both fixed in this one pass.
3. **Zoom panel position.** No change — checked the already-live bottom-right horizontal undo/redo/zoom/fit-view cluster (`[id]/page.tsx`'s `<Controls position="bottom-right" orientation="horizontal">`, from an earlier round's own "match Poppy's layout" pass) against this round's ask and it already satisfies it. No reference screenshot came through this round to compare against for anything beyond that, so this is recorded as "already done" rather than guessed at further — if Istiyak's mental picture differs from what's live now, that needs an actual screenshot to act on, not a second guess.
**No new dependency:** the tooltip is a small `group-hover` + `opacity` CSS component (`tooltip.tsx`), not a Radix/Floating-UI tooltip library — consistent with agents.md's standing "no new dependency unless truly unavoidable" rule, and enough for a toolbar with a fixed, known layout (no auto-flip/collision-avoidance needed). It's deliberately NOT the native `title` attribute the bottom-right zoom/undo cluster uses for the same job — those are React Flow's own `<ControlButton>`, which doesn't accept arbitrary children for a styled tooltip, so `title` was the pragmatic floor there; this toolbar's buttons are plain `<button>`s with room to do better, and "mature toolbar design" read as wanting that polish.
**Rationale:** Matches Istiyak's stated reference (Poppy) and his explicit scoping of how much polish this pass should carry (icons + tooltips only, real interaction/motion design later), while keeping the breadcrumb fix grounded in what was actually confirmed live, not guessed from an ambiguous wording.
**Status:** Decided and shipped.
**Touches:** `apps/web/app/brainboards/[id]/page.tsx`, `apps/web/components/canvas/canvas-toolbar.tsx` (new), `apps/web/components/ui/tooltip.tsx` (new), `apps/web/components/layout/board-breadcrumb.tsx`.

### ADR-0080 — Round 8 part 1: plain left-drag now pans the canvas (reverses part of ADR-0066); marquee-select moves to Shift+drag; idle pane cursor fixed to the normal arrow
**Decision:** ADR-0066 deliberately set plain left-drag-on-empty-canvas to rubber-band/marquee-select, specifically because Istiyak had asked for Figma-style drag-to-multi-select at the time, with panning moved to middle/right-button drag, scroll, or (per that ADR's own mapping) effectively requiring a different gesture than a plain left-drag. Istiyak's own words this round reverse that default: *"On click and pan mouse should be grab and should move the canvas. Currently user has to press space + navigation that we need to change."* This round makes plain left-drag pan directly, with no modifier step, while deliberately NOT dropping marquee-select — it moves to Shift+drag instead (keeping Shift+click for single-node toggle-select exactly as ADR-0066 already had it, so one modifier key now covers both "add to selection" gestures consistently):
- `selectionOnDrag` removed (defaults to `false`) — plain drag no longer marquee-selects.
- `panOnDrag` widened from `[1, 2]` (middle/right only) to `[0, 1, 2]` — left, middle, and right buttons now all pan.
- `selectionKeyCode="Shift"` added explicitly (this is React Flow's own default value, but it's set explicitly here for clarity/self-documentation, same style this codebase already uses elsewhere) — holding Shift while dragging always draws a selection box, regardless of `panOnDrag`, so marquee-select is fully preserved, just moved behind a modifier instead of being the bare-drag default.
- `multiSelectionKeyCode={["Shift"]}` is unchanged — Shift+click still toggles one node in/out of the selection, same as before.

**Cursor fix (same round, same root cause Istiyak named — "entire canvas shows hand icon... should not be the case"):** React Flow's own stylesheet puts `cursor: grab` on `.react-flow__pane.draggable` for the ENTIRE time `panOnDrag` is truthy, including at rest — not just while actually dragging. That's a plain, UN-layered CSS rule (`@xyflow/react/dist/style.css` isn't wrapped in any Tailwind `@layer`), so a same-specificity Tailwind utility can't reliably out-cascade it; fixed with a plain override of our own in `globals.css` — `.react-flow__pane.draggable:not(.dragging) { cursor: default !important; }` — so the pane reads as an ordinary arrow at rest and only shows `grab`/`grabbing` (React Flow's own, untouched `.dragging` rule) during an actual active pan-drag. The `:not(.dragging)` guard matters: React Flow adds both `draggable` and `dragging` to the pane's class list at once mid-drag, and without it this `!important` rule would have also clobbered the correct `grabbing` cursor — caught live during verification (the mid-drag cursor briefly read "default" instead of "grabbing" before this guard was added).
**Rationale:** Istiyak's stated reason is explicit and direct — the space-bar step was friction he wants gone, and the Figma-style marquee-select he originally asked for is still fully available, just on a modifier instead of being the bare-drag default, so nothing from ADR-0066 is silently lost.
**Status:** Decided and shipped. Reverses part of ADR-0066 (the selection/pan/zoom key mapping bullet only — undo/redo, the no-confirmation-dialog decision, and the rest of that ADR are untouched).
**Touches:** `apps/web/app/brainboards/[id]/page.tsx`, `apps/web/app/globals.css`.

### ADR-0081 — Round 8 part 2: canvas background gets a light accent tint + a more visible dot grid; this surfaced BUG-021 (cursor-style issue, not a cursor one — see bugs.md)
**Decision:** Two token changes (`packages/tokens/tokens/semantic.json`), matching Istiyak's reference screenshot (a pale lavender/blue-gray tinted canvas with small, visible-but-understated gray dots — explicitly NOT plain white/off-white, and explicitly NOT a bold high-contrast grid):
- `background.canvas`: `{color.white}` → `{color.accent.50}` — the same light-tint-family approach ADR-0074 already established for the card ribbons, reused here rather than inventing a new token; `accent.50` (`#eef2ff`) is a close match to the reference's pale lavender tone.
- `background.canvasDot`: `{color.gray.200}` → `{color.gray.400}` — the old value was barely visible against white; `gray.400` reads clearly against the new tinted background without looking bold or high-contrast, matching the reference.
- `packages/tokens/tokens/primitives.json`'s `canvas.dotSize` unchanged at the token level (it's a raw pixel number consumed directly by React Flow's `<Background>`, not a CSS color token); the dot's rendered `size` prop in `[id]/page.tsx` was bumped 1→1.5 for a touch more visual weight, working together with the darker color rather than color alone carrying the whole fix.
**A real bug found while implementing this (BUG-021, logged in bugs.md before fixing, per standing process):** the canvas's `bg-background-canvas` Tailwind className had never actually painted anything, the entire time it existed — React Flow's own stylesheet sets `.react-flow { background-color: transparent }` as a plain, un-layered CSS rule, which (per the CSS Cascade Layers spec) always wins over a Tailwind utility living inside `@layer utilities`, regardless of specificity or source order. This was invisible only because the token's old value was white, indistinguishable from "nothing painted." Fixed with a plain, un-layered override in `globals.css` instead of relying on the Tailwind utility — same "plain CSS beats React Flow's plain CSS" pattern this round's cursor fix (ADR-0080) and BUG-011 (control icons) both already established for overriding this specific library's own un-layered styles.
**Rationale:** Matches Istiyak's own reference image and stated goal — visual separation between the white header/toolbar chrome and the canvas area, which currently read as one flat, blurred-together page.
**Status:** Decided and shipped.
**Touches:** `packages/tokens/tokens/semantic.json`, `apps/web/app/brainboards/[id]/page.tsx`, `apps/web/app/globals.css`, `docs/bugs.md` (BUG-021).

### ADR-0082 — Folder rename + delete added; deleting a folder is now a real, explicit choice between moving or trashing its boards
**Decision:** Two real features, neither of which existed before this round (Istiyak: "Rename option not available. Delete option with user consent not available."):
1. **Folder rename and delete, added to the sidebar.** `folders-store.ts` gains `renameFolder`/`deleteFolder` actions (the backend's `PATCH /api/folders/:id` already supported a name change; only the UI entry point was missing). Each sidebar folder row (`boards-sidebar.tsx`) gets a hover-revealed pencil/trash icon pair, not a full "⋮" dropdown like `board-row-menu.tsx`'s — a one-line sidebar item with exactly two actions doesn't need a whole menu's worth of chrome, and this keeps every folder row's height identical to "All Boards"/"Trash" above it. This was explicitly left as a judgment call in the brief; the lighter option was chosen for that reason, not because the heavier one was wrong.
2. **Folder delete asks what happens to its boards, instead of always silently moving them to top level.** A new `FolderDeleteDialog` (reusing the existing `Dialog` component, same shape as Trash's permanent-delete confirm) offers two radio choices: "Move its boards" (to another folder, or to no folder — the old default behavior, now explicit instead of implicit) or "Delete its boards too" (soft-deletes every board in the folder to Trash, same `deleted_at` mechanism as deleting one board at a time — never a hard delete). The backend's `DELETE /api/folders/:id` gains an optional JSON body (`{ action, target_folder_id }`); omitting it entirely preserves the exact pre-existing "move to null" behavior for any caller that doesn't opt into the new shape, so `testing.md` F-04 stays valid as written.
**A real bug found while implementing the "delete its boards too" branch (BUG-025, logged before fixing):** it crashed with a SQLite foreign-key violation, because the boards were soft-deleted but still pointed `folder_id` at the folder about to be deleted. Fixed by also nulling `folder_id` on those boards — see bugs.md for the full root cause.
**A small new store, not a bigger one:** the sidebar (where folder delete lives) and the Boards List/Trash pages (which own the actual boards array) are siblings under `(list)/layout.tsx` with no direct prop channel between them. Rather than lifting the whole boards list into a shared store, a tiny `boards-refresh-store.ts` (one counter, one `requestRefresh()` action) lets the sidebar tell either page "something changed, refetch" — both pages' pre-existing fetch effects just add this token to their dependency array alongside their own local `reloadToken`.
**Rationale:** "Delete option... not available" and "Delete board / move boards while deleting folder... is something to look at as feature" were both explicit, stated gaps — this closes both without inventing scope beyond what was asked (no folder-level undo, no nested folders, no bulk operations).
**Status:** Decided and shipped.
**Touches:** `apps/web/stores/folders-store.ts`, `apps/web/stores/boards-refresh-store.ts` (new), `apps/web/components/boards/boards-sidebar.tsx`, `apps/web/components/boards/folder-delete-dialog.tsx` (new), `apps/web/app/brainboards/(list)/all/page.tsx`, `apps/web/app/brainboards/(list)/trash/page.tsx`, `apps/web/lib/api.ts`, `apps/server/src/routes/boards.ts`, `docs/bugs.md` (BUG-025).

### ADR-0083 — Favorite-star toggle on boards (schema migration + UI), scope deliberately limited to toggle + persistence only
**Decision:** Boards can now be starred as a favorite. `boards.is_favorite` (`integer`, `mode: "boolean"`, `NOT NULL DEFAULT false`) is a new column on the existing table, added via a real `drizzle-kit generate` migration (`apps/server/drizzle/0002_overrated_wraith.sql`) — checked against `bugs.md`'s BUG-001 gotcha (a column that both needs `NOT NULL DEFAULT` *and* forces SQLite's table-rebuild rewrite pattern can have its new column wrongly referenced in the rebuild's own copy step) before applying it; this column has no `UNIQUE` constraint, so drizzle-kit generated a plain `ALTER TABLE boards ADD is_favorite integer DEFAULT false NOT NULL` with no rebuild involved, and BUG-001's failure mode doesn't apply here. Verified: migrated clean against a copy of the live database, all existing rows defaulted to `false`.
`PATCH /api/boards/:id` accepts an optional `is_favorite` in its body alongside the existing `title`/`folder_id`. `board-card.tsx` renders a `Star` toggle button (filled when favorited) that optimistically updates local state and persists via that same PATCH — same optimistic-then-persist shape `handleMoveToFolder` already uses on that page, not a new pattern.
**New token, not a borrowed one:** the filled star needed a warning/amber color, and `color.text` had `danger`/`success`/`info` state colors but no `warning` — an evident gap given `ribbonBg`/`ribbonFg`/`ribbonSolid` all already have a `warning` family for node ribbons. Added `text.warning` (`{color.warning.600}`) to `semantic.json` and mapped it into `globals.css`'s `@theme inline` block as `text-text-warning`, rather than reaching for `ribbon-solid-warning` (a token scoped to node ribbons, not board rows) or a raw, untraced Tailwind amber value, which the project's token-enforcement lint rule exists specifically to prevent.
**Deliberately out of scope:** sorting or filtering by favorite. The brief asked for "just the toggle and its persistence," and that's what shipped — nothing about favorite-sort ordering or a "Favorites" sidebar entry exists yet.
**Rationale:** Matches the brief exactly, including its own explicit scope boundary; the migration gotcha check was a direct instruction to re-read BUG-001 before generating anything, which turned out not to apply here but was worth confirming rather than assuming.
**Status:** Decided and shipped.
**Touches:** `apps/server/src/db/schema.ts`, `apps/server/drizzle/0002_overrated_wraith.sql` (new), `apps/server/src/routes/boards.ts`, `apps/web/components/boards/board-card.tsx`, `apps/web/app/brainboards/(list)/all/page.tsx`, `packages/tokens/tokens/semantic.json`, `apps/web/app/globals.css`.

### ADR-0084 — Round 1 Boards List / Trash visual-consistency pass: stretched-link row (fixes BUG-024), Trash reuses BoardCard (fixes BUG-022), folder chip redesigned with an icon below the title, sidebar label/button polish, "No folder" icon fixed, redundant "Show all boards" button removed
**Decision:** A cluster of related fixes/polish from Istiyak's own words this round, grouped into one entry since they're all the same "make the Boards List/Trash area read as a finished, consistent product" pass:
- **Row click/hover area fixed** (BUG-024): `board-card.tsx`'s row is now a "stretched link" — a single `<Link className="absolute inset-0">` filling the whole row, with the icon/title/chip/timestamp/star/"⋮"-menu layered above it via `relative` (same stacking context, later in DOM order, so they stay independently clickable with no `stopPropagation`). The clickable area and the hover-highlighted area are now provably the same box.
- **Trash reuses `BoardCard`** (BUG-022) via a new `variant="trash"` prop instead of its own separate markup — see ADR-0083's sibling bug entry for the fix detail.
- **Dropdown hover-clip fixed** (BUG-023): `board-row-menu.tsx`'s dropdown container was `rounded-lg` with no `overflow-hidden`, so the first/last item's hover rectangle poked past the rounded corners. `profile-menu.tsx`'s own dropdown (ADR-0077) was checked and already had `overflow-hidden`, so `board-row-menu.tsx` was the one place in the app still missing it.
- **Folder chip redesigned:** moved to its own line directly below the board title (not sharing the title's row) and gained a small `Folder` icon inside it. This was treated as one fix for two of Istiyak's complaints at once — the chip-styling ask and the separate "folder indication isn't properly indicated" complaint are the same underlying problem, and a more visually distinct, below-title, icon-bearing chip answers both.
- **Sidebar "Folders" label restyled** to a small-caps section header (`text-xs font-semibold tracking-wide uppercase text-text-muted`) instead of reading like one more nav link.
- **"+ New folder" button given real visual weight:** accent-tinted hover (`hover:bg-background-accent-muted hover:text-text-accent`) and a slightly larger hit target (`p-1.5`, icon `size-4`, up from `p-1`/`size-3.5`), instead of the previous flat muted-only hover that read as an afterthought.
- **"No folder" icon fixed** (investigated, not guessed at): `board-row-menu.tsx`'s move-to-folder list used to pair the *unselected* state of every option — including "No folder" — with `FolderInput` ("move into a folder"), which reads backwards for the one option that means the opposite (removing a board from its folder). "No folder" now uses `FolderX` for its unselected state; every real folder below it now uses the plain `Folder` icon (matching what the sidebar itself already uses consistently) instead of `FolderInput`, reducing icon variety in that one menu rather than adding to it.
- **Redundant "Show all boards" button removed** from the filtered-folder view (`(list)/all/page.tsx`) — it duplicated the sidebar's own "All Boards" nav link one click away. Direct precedent already existed in this exact codebase: `trash/page.tsx`'s own comment explains removing its old "Back to boards" link for the identical reason (the sidebar nav already covers it). Removed rather than "improved," per Istiyak's own "I think we don't need it."
**Rationale:** Matches Istiyak's literal complaints point-for-point rather than a broader redesign — every change here traces to a specific sentence in the brief, and nothing beyond what was asked (no grid-view toggle, no bulk select, no drag-reordering) was added.
**Status:** Decided and shipped.
**Touches:** `apps/web/components/boards/board-card.tsx`, `apps/web/components/boards/board-row-menu.tsx`, `apps/web/components/boards/boards-sidebar.tsx`, `apps/web/app/brainboards/(list)/all/page.tsx`, `apps/web/app/brainboards/(list)/trash/page.tsx`, `docs/bugs.md` (BUG-022, BUG-023, BUG-024).

## Open items (not yet decided — tracked so they aren't lost)

- **ADR-0034** — dedicated security discussion (subprocess input sanitization, localhost-only binding, public-repo data hygiene) — still owed.
- **Typography System PDF** (`Epicink-Studio-Typography-System.pdf` in the EPICINK knowledge base) — returned no extractable text on read; low priority now that Inter is confirmed (ADR-0029) and EPICINK assets are explicitly not being reused (ADR-0009), but flagged in case it's ever needed for reference.
