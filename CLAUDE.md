# CLAUDE.md — Entry point for Claude Code sessions on Brainy

> **This file is read automatically by Claude Code when a session starts in this folder** — that's exactly why it's named `CLAUDE.md` in uppercase at the project root: that's the specific filename/location Claude Code looks for to auto-load project instructions (confirmed against the official Claude Code docs). It exists so every new session (or every session after a context reset) can get oriented in under a minute, without re-deriving decisions that are already settled. It is the real continuity mechanism for this project — not any claude.ai conversation, not claude.ai memory. Treat the docs below as load-bearing, not optional reading.
>
> **Why the planning docs live in `docs/`, not at root:** keeps the repo root clean (just this file, `README.md`, config, and the actual folders) — standard practice, and matches the pattern this was modeled on. `README.md` at root is the human-facing front door; this file is the Claude-facing one.
>
> **Why `agents.md` is `docs/agents.md`, not root `AGENTS.md`:** Claude Code treats a root-level `AGENTS.md` as an alternative to `CLAUDE.md` itself (project instructions, in its place) — not as a second, separately-purposed doc. Our `agents.md` is a different thing (AI-assisted *coding working conventions* specific to this repo, not project memory), so it deliberately stays lowercase and inside `docs/`, where it's just an ordinary reference doc this file points to — avoiding a naming collision with a real Claude Code mechanism.

---

## Read in this order before doing anything

1. **This file** — orientation.
2. **[`docs/rules-decisions.md`](./docs/rules-decisions.md)** — every decision made and *why*. If you're about to make a choice (naming, library, pattern) that feels like it should already have an answer, check here first. It almost certainly does.
3. **[`docs/architecture.md`](./docs/architecture.md)** — the system as designed: stack, folder structure, data model, how frontend/backend talk, the token pipeline, the provider-adapter pattern.
4. **[`docs/prd.md`](./docs/prd.md)** — what's being built, for whom, and the phase roadmap with "done looks like" criteria per phase.
5. **[`docs/feature.md`](./docs/feature.md)** — the detailed, feature-by-feature spec: every feature's actual Level-2 user flows (branches, edge cases, error states), tagged by which Task Flow in `prd.md` it belongs to.
6. **[`docs/agents.md`](./docs/agents.md)** — your own working conventions on this repo: commit/push behavior, how to log new decisions, what to never assume.
7. **[`docs/implementation_plan.md`](./docs/implementation_plan.md)** — the granular, checkable technical build roadmap (the "Blueprint"). Check this to see what phase is active, the technical approach for it, and what's already done before starting new work.
8. **[`docs/testing.md`](./docs/testing.md)** — manual test cases per feature; run these before checking a tracker item done.
9. **[`docs/bugs.md`](./docs/bugs.md)** — the error log. Check it when something looks like a regression; log new bugs here before fixing them.
10. **[`docs/audit.md`](./docs/audit.md)** — periodic reality-checks of built-vs-planned per phase. Run one before considering a phase truly closed.
11. **[`docs/runbooks/`](./docs/runbooks/)** — step-by-step operational procedures: restoring a backup, rotating a leaked API key, and [`git-basics.md`](./docs/runbooks/git-basics.md) — the branching workflow (ADR-0054), including exact commands, since Istiyak is learning git alongside this project.
12. **`.claude/rules/`** — path-scoped conventions (DB naming, token rules, error-handling conventions) that load automatically only when you're actually touching the matching files — these restate specific ADRs from `docs/rules-decisions.md` in a form Claude Code loads on demand, so check the ADR itself if you need the full rationale.

---

## One-paragraph orientation

Brainy is Istiyak's personal, single-user, local-only infinite-canvas research tool — a lean, purpose-built equivalent to Poppy.ai, built at $0 ongoing cost. It's a monorepo: a Next.js frontend (`apps/web`, React Flow canvas, Zustand state, shadcn/ui + Tailwind, design tokens in DTCG format) talking over HTTP/SSE to a separate Fastify backend (`apps/server`, owns SQLite via Drizzle, AI provider adapters, yt-dlp/ffmpeg extraction). There is no multiplayer, no real auth (login is cosmetic), no hosting yet, and the explicit build philosophy is "vibe coded feel, professionally executed" — lean day-to-day, industry-standard underneath.

## Non-negotiables (do not relitigate these without flagging it explicitly to Istiyak)

- No multiplayer/collaboration features, ever. (ADR-0001)
- $0 ongoing cost must remain possible for every feature — paid options are opt-in, never required. (ADR-0004)
- No hardcoded colors/spacing — everything traces to a design token. (ADR-0024, enforced by lint)
- No forward dependencies between build phases. (ADR-0040)
- Brainy's visual identity does not reuse EPICINK Studio's brand assets. (ADR-0009)
- Secrets live only in SQLite (`provider_credentials`), gitignored, never in `.env`, guarded by a `gitleaks` **git** pre-commit hook (via husky or the `pre-commit` framework — a `.git`/`.husky` mechanism, not a Claude Code hook). A *separate* thing, Claude Code's own `.claude/` hooks/rules, enforces some of the same conventions (e.g. token usage) while you're actively editing — see `.claude/rules/`. (ADR-0033, ADR-0050)
- Never commit directly to `main` — all work happens on a `phase-<n>-<slug>` or `feature/<slug>` branch, merged in via a GitHub Pull Request. (ADR-0054, `docs/runbooks/git-basics.md`)

## When something isn't covered by the docs

If a decision genuinely isn't covered in `docs/rules-decisions.md`, `docs/architecture.md`, or `docs/prd.md` — stop and ask Istiyak rather than assuming a reasonable default, per his explicit standing instruction that no area should be left to guesswork. If you do have to make a small, low-stakes call to keep moving (e.g. a variable name), proceed, but flag what you decided and why so it can be added to `docs/rules-decisions.md` if it turns out to matter.

## Current phase

Check `docs/implementation_plan.md` for the live status. As of this doc's writing, Phase 0 (scaffolding) has not yet started in code — the planning docs under `docs/`, this file, and the `.claude/` setup are the first deliverables, written before any code per Istiyak's explicit "no code until design is broken down" rule. (ADR-0006)
