# agents.md — Working conventions for AI-assisted coding on Brainy

> **What this file is:** how an AI coding session (Claude Code, or any future AI assistant working on this repo) should operate day-to-day — committing, logging decisions, updating the tracker, and what to never assume. Read after `CLAUDE.md` (repo root), `rules-decisions.md`, and `architecture.md`.
>
> **Why this file lives at `docs/agents.md`, not root `AGENTS.md`:** Claude Code treats a root-level `AGENTS.md` as an alternative to `CLAUDE.md` itself — project memory, in its place — not as a second, independently-purposed doc. This file is a different thing (working conventions specific to this repo), so keeping it lowercase and inside `docs/` avoids that collision entirely; `CLAUDE.md` points here explicitly instead. *(ADR-0050)*
>
> **Some of what's below also exists as `.claude/rules/*.md`** — path-scoped files Claude Code loads automatically only when you're actually editing matching files (DB conventions when touching `apps/server/src/db/**`, token conventions when touching `packages/tokens/**`, etc.), rather than every session regardless of relevance. This file is still the complete reference; the rules files are a distilled, on-demand subset of it.

---

## 1. Git / commit behavior

- **Branch per phase/feature — never commit directly to `main`.** `main` only receives merges via a GitHub Pull Request, one branch per phase (`phase-<n>-<slug>`) or per feature (`feature/<slug>`) worked on independently. Full workflow and exact commands for Istiyak: `docs/runbooks/git-basics.md`. *(ADR-0054)*
- **Direct commit/push *within* a branch is allowed, no external reviewer required.** ADR-0035's "no human-review gate" still holds day-to-day — the Pull Request before merging into `main` is Istiyak reviewing his own diff, not an added approval step from anyone else; it gives that existing solo-review habit a concrete place to happen rather than contradicting it. *(ADR-0035, ADR-0054)*
- **Commit granularity:** prefer small, focused commits over large batched ones — one logical change per commit (e.g. "add boards table migration," not "Phase 0 part 3"). This isn't a formally decided rule, just good practice for a repo meant to read cleanly for a future developer; flag to Istiyak if a different granularity is wanted.
- **`gitleaks` runs as a git pre-commit hook** (via husky or the `pre-commit` framework — a `.git`/`.husky`-level mechanism, distinct from Claude Code's own `.claude/` hooks/rules system below). Never bypass it (no `--no-verify`). If it blocks a commit, the fix is to remove the secret from the diff and ensure it's actually coming from `provider_credentials` in SQLite, not a config file. *(ADR-0033)*
- **Never commit `brainy.db`** or anything containing Istiyak's actual research content, API keys, or chat history — only schema/migrations that define the data shape. Check `.gitignore` covers this before the first commit in Phase 0.

## 2. Logging decisions as you go

- If you make a choice during implementation that isn't already covered in `rules-decisions.md` and isn't trivial (library selection, a naming pattern, a structural choice) — **add a new ADR entry to `rules-decisions.md` in the same change**, not after the fact. Follow the existing ADR format (Decision / Rationale / Status / Touches).
- If a past decision needs to change, add a new ADR that explicitly supersedes the old one (`Supersedes: ADR-####`) — never edit or delete the old entry.
- If you're genuinely unsure whether something counts as a "real decision" worth logging vs. a trivial implementation detail: log it. Over-documenting costs nothing; under-documenting is exactly the guesswork problem this whole doc set exists to prevent. *(ADR-0006)*

## 3. Working on one task at a time (scratch task file)

For a single focused work session (e.g. "today, build the text-node component"), it's fine to keep a short scratch file — call it `task_today.md` if you want a name — stating the goal, what it touches, and which reference docs matter for it. This is **not** a persistent project doc: delete it once the task is done. It exists purely to keep one session's attention narrow; `implementation_plan.md` is still the permanent record of what got done. Don't let a scratch file accumulate into a parallel, out-of-sync tracker.

## 4. Updating the progress tracker

- `implementation_plan.md` tracks every task down to the smallest unit, with the technical approach for each phase — this was an explicit requirement, not a nice-to-have. Mark tasks complete as you finish them, in the same session, not retroactively.
- Before starting a new piece of work, check the tracker for what phase is active and what's already marked done, so work doesn't get duplicated or built out of order relative to `prd.md`'s phase sequence.
- Never mark a phase's "done looks like" criterion (from `prd.md` §6) satisfied without actually verifying it — run the thing, don't assume it works.
- **Before marking any phase done, run the production build once** (e.g. `next build`, TypeScript compile, lint) — not just the dev server. The dev server hides real classes of bugs that only surface in a production build. *(ADR-0049)*
- **Run a skeptical self-review before claiming a phase done**, not just the feature checklist: actively look for the kind of thing a launch-blocker review looks for even though nothing is being launched — exposed secrets, an error that would show a stack trace to the user, a double-submittable action, a hang with no timeout. Then have Istiyak verify the result himself rather than treating this self-review as proof — an AI's own review of its own work is a useful first pass, not a substitute for someone actually looking. *(ADR-0049)*

## 5. Naming and structure (already decided — do not re-derive)

These are settled in `rules-decisions.md` — linking here as a checklist, not restating the rationale:
- DB: `snake_case`, plural tables, no `tbl` prefix, `<singular>_id` foreign keys, UUID primary keys, `created_at`/`updated_at` (+`deleted_at` on `boards`), `is_`/`has_` booleans. (ADR-0020, ADR-0021)
- Frontend: tokens → shadcn/ui primitives → composed components → screens, nothing hardcoded. (ADR-0024)
- Routes: `/brainboards/all`, `/brainboards/[id]` — plural, matching the `boards` table name. base URL from env config, never hardcoded. (ADR-0023, ADR-0063)
- Git branches: `phase-<n>-<slug>` or `feature/<slug>`, lowercase, hyphenated, merged to `main` via Pull Request. (ADR-0054, `docs/runbooks/git-basics.md`)

## 6. Not yet decided — ask before assuming

The following have **not** been explicitly settled anywhere in this doc set. Don't invent an answer silently — surface the question to Istiyak (or, if working unattended, make the most conservative/reversible choice, state clearly what was assumed, and flag it prominently):

- **Code style/lint/format tooling** (ESLint config specifics, Prettier, TypeScript strictness level) — only the "no hardcoded tokens" lint rule is decided; general TS/ESLint config is not.
- **Automated testing strategy** — no automated approach (unit/integration/e2e) has been discussed or decided yet; `testing.md` covers manual QA only for now, which is a deliberate, separate decision (ADR-0047), not a stand-in for this.
- **Commit message format** (e.g. Conventional Commits) — not decided; §1 above is a working suggestion, not a locked rule.
- **CI** — not discussed; nothing is assumed to run automatically beyond the local `gitleaks` pre-commit hook. (Branching *is* now decided — see §1 above, ADR-0054 — this bullet is about automated pipelines, not branches.)

## 7. Documentation hygiene

- `rules-decisions.md`, `architecture.md`, `prd.md`, and `feature.md` must stay internally consistent. If you change one in a way that affects another (e.g. architecture.md's schema table should reflect a new column added in a migration), update both in the same change.
- When a bug surfaces (in testing or real use), log it in `bugs.md` before fixing it — diagnosis first, patch second. See `bugs.md` for the exact format.
- When a phase is claimed done in `implementation_plan.md`, run an audit entry in `audit.md` for that phase before considering it truly closed — not just "the checkboxes are ticked" but "the actual repo structure and scope still match what the docs describe." The `/phase-check` skill (`.claude/skills/phase-check/`) runs the mechanical half of this (production build, a reminder of the testing.md section to run) — it doesn't replace actually running the audit template.
- A one-off maintenance procedure (restoring `brainy.db` from backup, rotating a leaked API key) belongs in `docs/runbooks/` as a numbered step-by-step, not buried in a prose paragraph somewhere — it should be followable without reading anything else first.
- If a convention here is specific enough to scope to certain files (and is being referenced often enough that it's worth not re-reading this whole file every time), consider adding or updating a matching `.claude/rules/*.md` file with `paths` frontmatter — but keep this file the complete version; the rule file is a distilled excerpt, not a replacement.
- Use the project's own flow-hierarchy convention when writing or discussing flows: **Task Flow = Level 1, User Flow = Level 2** — the reverse of common industry usage, documented in ADR-0038 specifically so this doesn't get silently "corrected" back to the standard convention.
