# Audit — Brainy (brainy.ai)

> **What this file is:** a periodic reality-check — comparing what was actually built against what `prd.md`, `feature.md`, and `implementation_plan.md` said would be built, to surface gaps, drift, or orphaned code before they compound. Run one audit entry per phase, right after that phase's "done looks like" criterion (per `prd.md` §6) is claimed as met — don't take the plan's checkmarks on faith without actually looking.
>
> **What this catches that `testing.md` doesn't:** `testing.md` verifies a feature works in isolation. This file checks the *shape* of what got built — does the file/folder structure still match `architecture.md`? Did a "temporary" workaround from mid-phase get left in permanently? Is there code for something `feature.md` doesn't describe (scope crept in silently)? Are there files nothing references anymore?

**How to run an audit:**
1. Re-read the relevant phase's entries in `prd.md` §6, `feature.md`, and `implementation_plan.md`.
2. Walk the actual repo/folder structure and diff it mentally against `architecture.md` §2.
3. Fill in the template below honestly — including things that are "fine but worth flagging," not just hard failures.
4. Anything found that needs fixing gets logged in `bugs.md` (if it's a defect) or a new ADR in `rules-decisions.md` (if it's a deliberate deviation worth recording).

---

## Template

```
## Audit — Phase # — YYYY-MM-DD

**Claimed done per implementation_plan.md:** yes/no, as of this date
**Matches prd.md §6 "done looks like"?:** yes/no — detail any gap

**Structural check against architecture.md:**
- Folder structure matches §2? 
- Any new files/folders not described anywhere? (list them — either update architecture.md or remove them)
- Any file described in architecture.md that doesn't actually exist yet?

**Scope check against feature.md:**
- Anything built that isn't described in any feature entry? (silent scope creep — note it, decide whether it becomes a documented feature or gets removed)
- Any feature marked done in implementation_plan.md whose Level-2 flows in feature.md aren't actually all handled?

**Orphans:**
- Any file/function with nothing importing or calling it?
- Any "temporary"/"TODO: remove" code left in from earlier in the phase?

**Skeptical pass (even pre-launch, this still matters — ADR-0049):**
- Any secret or key visible anywhere it shouldn't be (logs, committed files, frontend network tab)?
- Any error path that would show a raw stack trace to the user instead of a plain message?
- Any cost-incurring or data-mutating action without double-submit protection?
- Any async action with no timeout/failure path (just spins forever on failure)?
- Remember: this self-review is a first pass, not proof — Istiyak should actually try to break the thing himself before trusting it.

**Findings / action items:**
- ...

**Logged to bugs.md:** (list BUG-### ids, if any)
**Logged to rules-decisions.md:** (list ADR-#### ids, if any)
```

---

## Phase 0 — Scaffolding

*(not yet run — Phase 0 hasn't started)*

---

## Phase 1 — App Shell

*(not yet run)*

---

*(Entries for Phases 2–7 are added the same way, as each phase is reached. Don't pre-create empty headers for phases far in the future — add the section when its audit is actually run, so this file's structure reflects real history rather than a template skeleton.)*
