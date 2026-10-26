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

## Audit — Phase 2 — 2026-10-26

**Claimed done per implementation_plan.md:** yes, as of this date — all build-checklist items checked except two explicitly deferred to later phases (edge-cascade-on-delete, needs Phase 3's edges; context-assembly, needs Phase 4's AI-chat wiring), both already called out in `implementation_plan.md`'s own text as forward dependencies, not gaps.
**Matches prd.md §6 "done looks like"?:** yes — "create a board, add text nodes, close the app, reopen it, find everything exactly as left, including after a hard refresh" was verified directly, not assumed.

**Structural check against architecture.md:**
- Folder structure matches §2? Yes — `apps/server/src/routes/{boards,nodes,files}.ts`, `apps/server/src/lib/{uploads,extraction}.ts`, `apps/web/app/brainboards/{all,trash,[id]}/`, `apps/web/components/{boards,canvas}/`, `apps/web/stores/board-store.ts` all land where architecture.md's folder map says this phase's pieces belong.
- Any new files/folders not described anywhere? None found — everything added this phase maps to a named feature/route in `feature.md` or `architecture.md`.
- Any file described in architecture.md that doesn't actually exist yet? Not checked exhaustively against every future-phase reference; nothing in Phase 2's own described scope is missing.

**Scope check against feature.md:**
- Anything built that isn't described in any feature entry? No deliberate scope creep found. Two small additions beyond the literal checklist text, both inside what F-25/ADR-0049 (error-handling conventions) already requires rather than new scope: a double-submit guard on the file-upload button, and request timeouts added to `apps/web/lib/api.ts` (the latter was actually a pre-existing Phase 1 gap, fixed here only because the file was already open for Phase 2's PATCH/DELETE work).
- Any feature marked done whose Level-2 flows in feature.md aren't actually all handled? F-27 (link nodes): the "empty content omitted from context assembly" flow can't be verified yet because context assembly doesn't exist as code until Phase 4 — left unchecked in `implementation_plan.md` rather than checked on faith. F-26 (file nodes) and F-27 (link nodes) both flow-match feature.md otherwise.

**Orphans:**
- Any file/function with nothing importing or calling it? None found in the files touched this phase.
- Any "temporary"/"TODO: remove" code left in from earlier in the phase? None found — the `isUploading` guard and the `api.ts` timeout wrapper are both permanent, not scaffolding.

**Skeptical pass (even pre-launch, this still matters — ADR-0049):**
- Any secret or key visible anywhere it shouldn't be? Checked the new server/store/api files for hardcoded secrets, stray `console.log`/`console.error` — none found.
- Any error path that would show a raw stack trace to the user instead of a plain message? File-node extraction failures and unsupported-type cases show a plain sentence, not a stack trace; the board-load failure shows "Can't reach the Brainy.ai backend..." with a retry button.
- Any cost-incurring or data-mutating action without double-submit protection? Found and fixed one during this pass: the file-upload button had none — added an `isUploading` guard (see implementation_plan.md notes).
- Any async action with no timeout/failure path? Found and fixed one during this pass: `apps/web/lib/api.ts` had no fetch timeout anywhere (a pre-existing Phase 1 gap) — added `AbortController`-based timeouts to both `request()` and `uploadFile()`.
- This self-review is a first pass, not proof — Istiyak should still try to break it himself, especially the Settings save buttons from Phase 1 (see BUG-005 below — they were very likely silently broken by the CORS bug this whole time and deserve a direct re-check, not just a Phase 2 regression run).

**Findings / action items:**
- The CORS-methods bug (BUG-005) is retroactive: it very likely affected Phase 1's Settings provider-key and brand-profile saves too, undetected because Phase 1's own verification used curl (which bypasses browser CORS). Worth Istiyak manually re-testing those two Settings save buttons in the real app now that it's fixed.
- Two Playwright-script-level "false" results (soft-delete-disappears-immediately, restore-leaves-trash-immediately) remain unresolved as test-harness timing noise, not product defects — see implementation_plan.md's TF-02 notes and BUG log for the investigation. Worth re-checking if it recurs once Phase 3 adds more list-mutating actions to the same screens.
- Minor UX observation, not a bug: new nodes (Text/Link/File buttons) all spawn stacked at the same `centerPosition()` rather than cascading/offsetting from each other — fine for now, but worth a small offset if Istiyak finds himself frequently dragging nodes apart after adding several in a row.

**Logged to bugs.md:** BUG-003, BUG-004, BUG-005, BUG-006, BUG-007
**Logged to rules-decisions.md:** none — no deliberate deviations from the plan were made this phase, only bug fixes within the existing design.

---

*(Entries for Phases 3–7 are added the same way, as each phase is reached. Don't pre-create empty headers for phases far in the future — add the section when its audit is actually run, so this file's structure reflects real history rather than a template skeleton.)*
