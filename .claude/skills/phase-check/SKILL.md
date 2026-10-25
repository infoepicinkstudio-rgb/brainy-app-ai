---
name: phase-check
description: Run before marking any phase in docs/implementation_plan.md as done. Verifies the production build/lint pass, points at the matching docs/testing.md section, and runs a skeptical pre-close review. Use whenever a phase's checklist looks complete, before actually checking its "done looks like" item.
---

## Current state

!`git status --short`

## Instructions

A phase in `docs/implementation_plan.md` is **not** done just because its checkboxes are ticked. Do the following, in order, before checking the phase's final "done looks like" item:

1. **Run the real build, not just the dev server.** `npm run build` (or the workspace-specific equivalent for `apps/web` and `apps/server`), plus lint and a TypeScript check if either app has one configured. Treat any failure as a blocker — fix it before continuing, per ADR-0049 in `docs/rules-decisions.md`.
2. **Find the matching section in `docs/testing.md`** for the phase that's closing, and actually run through its cases against the real running app — don't assume a case passes because the feature "looks right." Log anything that fails in `docs/bugs.md` before fixing it (diagnosis first, per `docs/agents.md` §2).
3. **Run the skeptical pre-close review** (the same list `docs/audit.md`'s "Skeptical pass" asks for):
   - Any secret or key visible anywhere it shouldn't be (logs, committed files, a frontend network request)?
   - Any error path that would show a raw stack trace instead of a plain message?
   - Any cost-incurring or data-mutating action without double-submit protection?
   - Any async action with no timeout — just spins forever on failure?
4. **Open `docs/audit.md`** and fill in a real audit entry for this phase using its template — structural check against `docs/architecture.md` §2, scope check against `docs/feature.md`, orphan check. This is a judgment pass, not something this skill does for you.
5. Only after 1–4: check the phase's "done looks like" item in `docs/implementation_plan.md`, and tell Istiyak what was checked and what (if anything) needed fixing along the way — don't just report "done."
6. **Push the branch, then stop and hand off.** All of the above happens on this phase's own branch (`phase-<n>-<slug>` or `feature/<slug>`), never on `main` (ADR-0054). Once 1–5 pass, `git push` the branch and tell Istiyak it's ready for a Pull Request — opening the PR, reviewing the diff, merging to `main`, and deleting the branch are his steps to take on GitHub's website, not something to do automatically. Exact commands: `docs/runbooks/git-basics.md`.

This skill does the mechanical parts (1–2) reliably; it does not replace Istiyak actually looking at the running app himself (per ADR-0049 — "verify AI output yourself, don't treat an AI's own review as proof").
