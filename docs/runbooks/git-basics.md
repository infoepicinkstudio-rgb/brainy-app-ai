# Runbook: Git basics for Brainy (no-coder cheat sheet)

> **What this file is:** a plain-English reference for the handful of git commands this project actually needs, plus the exact steps for two situations: (1) one-time setup connecting this repo to GitHub, and (2) the repeatable workflow for every new phase/feature from here on. Written for Istiyak specifically — no prior git knowledge assumed. Full rationale for the branching decision: `rules-decisions.md` ADR-0054.

---

## The five words that matter, in plain English

- **init** — "start tracking this folder with git." Done once, ever, per project. Already done for Brainy.
- **add** — "stage these changed files" — tells git *which* changes you're about to save. `git add .` means "all of them."
- **commit** — "save a checkpoint" of whatever's staged, with a short message describing what changed. This is the actual save — like hitting Save in a document, except every save is kept forever and can be gone back to.
- **push** — "send my saved checkpoints up to GitHub" so they're backed up online and visible there.
- **pull** — "bring down whatever's on GitHub that I don't have locally yet." You'll use this rarely while working solo, mainly after merging something on GitHub's website.
- **branch** — a separate parallel copy of the project you can work in without touching the main, working version — this is the part that gives you "proper versioning."

## The branching model this project uses: one branch per phase/feature

- **`main`** is always the last known-good state — the version you'd hand to someone else or deploy from. You never work directly on `main`.
- Every phase (or, inside a big phase, every individual feature if you want finer checkpoints) gets its **own branch**, named after what it is: `phase-0-scaffolding`, `phase-2-core-canvas`, or `feature/f26-file-nodes` for a single feature worked on its own.
- You do all the actual work — edits, new files, everything — **on that branch**, committing as you go.
- When the phase/feature is done and verified (per the `/phase-check` skill), you push the branch to GitHub, open a **Pull Request** (a review/merge screen on GitHub's website — even solo, it's a useful "here's everything that changed" summary before it becomes permanent), merge it into `main`, then delete the branch.
- This is called **GitHub Flow** — the simple version of branching (just `main` + short-lived feature branches), not the heavier "Git Flow" model with separate develop/release branches that assumes a team. *(ADR-0054)*

---

## Part 1 — One-time setup (do this once, right now)

**Before you start:** open a terminal inside VS Code with the `D:\brainy-app-ai` folder open (``Terminal → New Terminal``), then check git is installed:

```
git --version
```

If that errors ("not recognized"), install Git for Windows from [git-scm.com](https://git-scm.com/download/win) with the default options, then close and reopen the VS Code terminal and try again.

Then, one command at a time:

```
git init
git branch -M main
git add .
git commit -m "Initial commit: documentation set (PRD, architecture, feature spec, implementation plan, ADRs)"
git remote add origin https://github.com/infoepicinkstudio-rgb/brainy-app-ai.git
git push -u origin main
```

What happens: the first `push` will open your browser asking you to sign in to GitHub (this is Git Credential Manager, which comes bundled with Git for Windows) — sign in with your GitHub account once, and it's remembered for future pushes. If you're ever prompted for a password directly instead of a browser sign-in screen, stop and come back here rather than typing a password into the terminal — GitHub phased that out in favor of the browser flow for a reason.

After this, refreshing `github.com/infoepicinkstudio-rgb/brainy-app-ai` in a browser should show the full `docs/`, `.claude/`, `CLAUDE.md`, `README.md` structure.

---

## Part 2 — The repeatable workflow (every phase/feature, from Phase 0 onward)

**Starting a new phase or feature:**
```
git checkout main
git pull
git checkout -b phase-0-scaffolding
```
(swap `phase-0-scaffolding` for whatever you're building — see naming below)

**While working — commit as you go, not just once at the end:**
```
git add .
git commit -m "short description of what you just did"
```
Do this every time you finish a meaningful chunk (a working component, a passing test, a fixed bug) — not just once when the whole phase is "done." Small, frequent commits are what actually make "proper versioning" useful; one giant commit at the end defeats the point.

**Pushing the branch to GitHub (do this periodically too, not only at the end — it's your backup):**
```
git push -u origin phase-0-scaffolding
```
(only need `-u origin <branch-name>` the first time you push that branch; afterwards plain `git push` works)

**Finishing the phase/feature:**
1. Run the `/phase-check` skill (or manually work through its checklist) — don't skip this just because the branch makes rollback easy; the branch is a safety net, not a replacement for actually checking the work.
2. `git push` the branch one last time with everything committed.
3. On GitHub's website, open a **Pull Request** from your branch into `main`, skim the diff (this is also just a good habit — seeing the whole change in one view catches things a file-by-file edit doesn't), then **Merge**.
4. Back in the terminal:
   ```
   git checkout main
   git pull
   git branch -d phase-0-scaffolding
   ```
   (the last command deletes the now-merged local branch — optional, but keeps the branch list from piling up. GitHub will offer to delete the remote copy too when you merge the PR; say yes.)

## Branch naming

- Phase-level work (most of the time, matching `implementation_plan.md`'s phase numbers): `phase-<n>-<short-slug>` — e.g. `phase-0-scaffolding`, `phase-1-app-shell`, `phase-5-video-nodes`.
- A single feature worth its own checkpoint, inside or outside a phase: `feature/<short-slug>` — e.g. `feature/f26-file-nodes`.
- A bug fix found outside normal phase work: `fix/<short-slug>`.
- Lowercase, hyphens, no spaces — same convention either way.

## If something goes wrong

- **Committed something you didn't mean to (not yet pushed):** `git reset --soft HEAD~1` undoes the last commit but keeps your files changed — fix what you need, then commit again.
- **Pushed a branch and want to abandon it:** just don't open a Pull Request for it, or delete the branch on GitHub — `main` was never touched.
- **Merge conflict during a Pull Request:** working solo, this should be rare (it means two branches changed the same lines) — if it happens, come back here and work through it rather than force-merging blindly.
- **Accidentally committed a secret (API key, `.env` content):** stop, don't push if you haven't already — see `docs/runbooks/rotate-api-key.md`, which covers exactly this.
