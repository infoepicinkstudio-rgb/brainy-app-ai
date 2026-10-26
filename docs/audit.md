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

## Audit — Phase 2.5 — 2026-10-26

**Claimed done per implementation_plan.md:** yes, as of this date — all checklist items checked except the two explicitly-out-of-scope items (Instagram metadata, the lazy extraction pipeline), both called out in `implementation_plan.md`'s own text as deliberately excluded, not gaps.
**Matches prd.md §6 "done looks like"?:** n/a in the literal sense — this phase wasn't in the original roadmap (it's a UX-overhaul pass inserted in response to direct user feedback plus two real bugs). Verified against ITS OWN stated objective instead: node cards read as compact/color-coded/interactive, deletion is Delete-key-or-menu-only with working undo, and pasting a YouTube link renders a thumbnail card immediately — all confirmed directly via Playwright against a sandboxed copy of the real app (not assumed from reading the code), see `implementation_plan.md`'s own checklist notes for exactly what was exercised.

**Structural check against architecture.md:**
- Folder structure matches §2? Yes — new files (`apps/web/components/canvas/{node-header,node-menu,video-node}.tsx`, `apps/web/lib/youtube.ts`, `apps/server/src/routes/link-preview.ts`) all land in the same folders their sibling files already live in; nothing new was invented.
- Any new files/folders not described anywhere? `link-preview.ts`'s route is now referenced in `architecture.md` §4.4; `video-node.tsx`/the `video` node type were already anticipated there and in `nodes.ts`'s own `NODE_TYPES` list before this pass touched either.
- Any file described in architecture.md that doesn't actually exist yet? Not checked exhaustively; nothing in this phase's own scope is missing.

**Scope check against feature.md:**
- Anything built that isn't described in any feature entry? The card redesign/deletion/undo work isn't its own numbered F-### entry (it's UX polish over already-shipped F-09/F-26/F-27, not a new feature) — flagged here rather than silently invented; worth adding a short cross-reference note in `feature.md` if a future session finds it confusing, not done in this pass to avoid scope creep into document restructuring. The video-link metadata work IS F-10/TF-05, pulled forward intentionally and documented as such in three places (ADR-0065, `implementation_plan.md`, `testing.md`).
- Any feature marked done whose Level-2 flows in feature.md aren't actually all handled? F-10's "Instagram" half is explicitly not handled (out of scope, noted above) — the YouTube half's flows (happy path, invalid link, private/removed video treated the same as invalid, loading state) all match and were verified live.

**Orphans:**
- Any file/function with nothing importing or calling it? None found — `node-header.tsx`/`node-menu.tsx` are used by all four node types; `youtube.ts`'s `parseYouTubeUrl` is used by both the client-side paste handler and `link-node.tsx`'s conversion check.
- Any "temporary"/"TODO: remove" code left in from earlier in the phase? None found.

**Skeptical pass (ADR-0049):**
- Any secret or key visible anywhere it shouldn't be? Checked every new/touched file for hardcoded secrets or stray `console.log`/`console.error` — none found (`grep` run directly, not just eyeballed).
- Any error path that would show a raw stack trace to the user instead of a plain message? The video card's "error" status shows a plain sentence ("Couldn't load a preview — the link still opens"), confirmed live by actually exercising it (this sandbox's own network policy blocks outbound calls to youtube.com, which — usefully — forced the real error path to fire during testing rather than only the happy path). `link-preview.ts` never lets a thrown exception reach the client; every branch returns a plain JSON shape.
- Any cost-incurring or data-mutating action without double-submit protection? The new `/api/link-preview` call is a read with no cost; undo/redo button clicks aren't rate-limited but are cheap, idempotent-per-click local-state operations (not externally costly), consistent with how the rest of this app treats non-provider-call actions.
- Any async action with no timeout/failure path? `link-preview.ts`'s oEmbed fetch has an explicit 8s `AbortController` timeout and a `catch` that still returns a clean "error" status rather than hanging or 500ing.
- This self-review is a first pass, not proof — Istiyak should still try to break it himself, in particular: (a) the real YouTube happy-path (title/thumbnail actually loading) couldn't be exercised in THIS sandbox, since its network policy blocks outbound calls to youtube.com entirely — only the graceful-failure branch was verified live; worth Istiyak specifically pasting a real YouTube link on his own machine to confirm the thumbnail/title actually resolve, since that exact code path was necessarily unverified here; (b) multi-node Delete-key presses currently produce one undo step per node, not one atomic batch — a conscious simplification (see ADR-0066), not a defect, but worth knowing if it feels wrong in practice.

**Findings / action items:**
- BUG-010 (Next.js's own dev indicator overlapping the new Undo/Redo buttons in `npm run dev`) was found and fixed during this pass's own testing, before it ever reached Istiyak — see bugs.md.
- The YouTube oEmbed happy path (real title/thumbnail fetch) is unverified in this sandbox for the network-policy reason above — flagged in the skeptical pass, not quietly assumed to work.

**Logged to bugs.md:** BUG-008, BUG-009, BUG-010
**Logged to rules-decisions.md:** ADR-0065, ADR-0066

---

## Audit — Phase 2.5, round 2 (control cluster fix, universal paste/upload, resizable cards, ribbon styling) — 2026-10-26

**Claimed done per implementation_plan.md:** yes — all four of Istiyak's sequential follow-up asks (hover-X, universal type-adaptive paste/upload, resizable cards, ribbon/color styling pass) folded into one combined build and checked off in `implementation_plan.md`'s Phase 2.5 "Round 2" sub-section, verified together rather than piecemeal per his explicit instruction.
**Matches its own stated objective?:** Yes, checked against each of the four follow-up messages individually rather than one vague "looks right": control cluster icons render as clean line glyphs at bottom-right (BUG-011); plain-text paste creates a text node, file uploads get per-kind icons, Vimeo gets the same oEmbed treatment as YouTube; cards resize from the bottom-right corner, persist, and undo; the ribbon-behind-card look and per-type accent colors render correctly — all confirmed live via Playwright screenshots and DOM dumps, not assumed from code review.

**Structural check against architecture.md:**
- Folder structure matches §2? Yes — `apps/web/lib/video-platform.ts` replaces `apps/web/lib/youtube.ts` in the same location; `apps/web/components/canvas/node-notes-field.tsx` lands alongside its sibling node-chrome/header/menu files; nothing new was invented outside existing folders.
- Any new files/folders not described anywhere? No.

**Scope check against feature.md:** No new F-### feature was added — this remains UX polish over already-shipped node types (F-09/F-26/F-27) plus the Phase 5 metadata pull-forward (F-10), now generalized. Nothing built outside that boundary; full article/body-content scraping stayed explicitly out of scope (ADR-0067 reaffirms ADR-0053's line rather than moving it further).

**Orphans:** `apps/web/lib/youtube.ts` was deleted (superseded by `video-platform.ts`); grepped the full `apps/web` tree to confirm no remaining import references it. No other orphaned files found among this round's changes.

**Skeptical pass (ADR-0049):**
- Any secret or key visible anywhere it shouldn't be? Checked every new/touched file — none found.
- Any error path that would show a raw stack trace instead of a plain message? The generic link-metadata fetch (`link-preview.ts`'s new branch) catches every failure mode (non-HTML content-type, non-2xx, timeout, malformed HTML) and always returns a clean JSON shape; the link node's UI falls back to the raw URL as plain text, never a broken layout, confirmed live (this sandbox's outbound network policy blocks youtube.com/vimeo.com/arbitrary external domains, which usefully forced the failure branch to fire during testing — see finding below).
- Any cost-incurring or data-mutating action without double-submit protection? The new `saveNodeSize` PATCH fires once per resize-END (not per drag tick, confirmed by design and by watching the drag-tick-vs-end split in `NodeResizeControl`'s own callback contract), so it can't be spammed by a single drag gesture the way a per-tick save could.
- Any async action with no timeout/failure path? The generic metadata fetch caps its read at 200KB/until `</head>`, same bounded-read discipline as the pre-existing YouTube oEmbed call's own timeout.
- This self-review is a first pass, not proof — two things specifically unverifiable in THIS sandbox, same network-policy reason as the first Phase 2.5 audit entry: (a) the real YouTube/Vimeo oEmbed happy path (actual title/thumbnail/channel-name resolving) — only the graceful-failure branch was exercised live here; (b) the generic title+favicon fetch's happy path against a real external page. Both fall back correctly and show the intended UI in the failure case, which IS what was verified — but Istiyak should specifically paste a real YouTube URL, a real Vimeo URL, and a real article URL on his own machine to confirm the three happy paths he'll actually see day to day, since none of them could be exercised end-to-end here.

**Findings / action items:**
- Two judgment calls were made and documented rather than silently resolved: file-card ribbon color unified to orange across all non-image kinds (overriding an earlier per-filetype-color ask, in favor of a newer and more specific reference — ADR-0071), and the reference's chat-bubble "ask AI" icon omitted entirely rather than shown disabled (ADR-0071, since Brainy has no chat/AI node yet).
- One item from the reference screenshots was deliberately deferred rather than implemented: a colored connector/handle dot per card. Brainy currently renders no `<Handle>` on any node type at all — edges exist in the data model but nothing in the UI creates one yet — so a connector dot now would be a visual affordance for a feature that doesn't exist, the same category of problem as the chat-bubble icon. Documented in ADR-0071 rather than silently skipped.
- Two real, non-obvious bugs (BUG-012: fresh cards self-collapsing to ~2px once resize support read React Flow's measured size instead of the app's own explicit size; BUG-013: the ribbon rendering fully invisible due to CSS margin-collapse) were caught only by comparing a live Playwright screenshot against a DOM dump that looked structurally correct on its own — worth noting as a reminder that a correct-looking DOM dump alone is not sufficient verification for a layout/rendering change; a rendered screenshot is the only way to actually confirm one.

**Logged to bugs.md:** BUG-012, BUG-013
**Logged to rules-decisions.md:** ADR-0067, ADR-0068, ADR-0069, ADR-0070, ADR-0071

---

## Audit — Phase 2.5, round 3 (delete-X repositioning, ribbon tightening, resize/link-conversion bug fixes, slim scrollbars) — 2026-10-26

**Claimed done per implementation_plan.md:** yes — all three of Istiyak's items from his live-canvas screenshot report (delete-X placement, ribbon/card inconsistency including the real YouTube-card regression, resize + scrollbars) checked off in the Phase 2.5 "Round 3" sub-section.
**Matches its own stated objective?:** Yes. Critically, this round's two headline complaints ("card nodes not coming out as expected" and "resize is not working") were NOT styled over — both were reproduced live first, per standing instruction, and turned out to be real bugs with identifiable root causes (BUG-014, BUG-015), not just perception/taste issues. Verified via the same screenshot Istiyak sent: his exact "youtube.com" card shape was reconstructed via a direct API call (a `link`-type node with a YouTube URL and none of the newer status fields — exactly what a stuck/legacy row looks like) and confirmed to self-heal into a real video card on load after the fix, where it previously stayed frozen forever.

**Structural check against architecture.md:** No new files, no new folders — every change this round is inside already-existing node-card component files plus one new global CSS utility class. Nothing to reconcile against the architecture doc.

**Scope check against feature.md:** No new feature surface — pure bug fixes and a styling refinement over already-shipped node types.

**Orphans:** None — no file was added or removed this round.

**Skeptical pass (ADR-0049):**
- Any secret or key visible anywhere it shouldn't be? No new network calls or data handling introduced this round — checked anyway, none found.
- Any error path that would show a raw stack trace? N/A — no new async/error-handling logic added; the link-conversion fix reuses the existing `convertLinkNodeToVideo` action's own established error handling untouched.
- Any cost-incurring or data-mutating action without double-submit protection? The URL field's `onChange`-triggered conversion fires `convertLinkNodeToVideo` at most once per field (it mutates the node's `type` to `"video"`, so the link-specific input this handler lives on no longer exists after the first successful call — structurally can't double-fire).
- Any async action with no timeout/failure path? N/A, no new async paths.
- This self-review is a first pass, not proof — the resize fix (enlarging the hit-target) was verified by deliberately aiming a simulated drag at the card's own visible corner pixel rather than any internal coordinate this session already knew about, specifically to avoid confirming the fix only against the same precise-click conditions that already worked before the fix. Istiyak should still do a few real hand-driven resizes on his own machine with an actual mouse/trackpad to confirm the improved hit-target feels right in practice — a 14px target is a meaningful improvement over 10px but is still not large, and if it still feels fiddly in real use, the next lever to pull is a dedicated hit-area wrapper around the visible handle rather than enlarging the visible square further (which would start looking oversized).

**Findings / action items:**
- The resize-not-working report turned out to be a genuine, if subtle, usability bug (BUG-015) rather than either a regression or a misunderstanding — worth remembering that "doesn't work" from a non-technical user can mean "the target is real but too easy to miss," not only "broken."
- The YouTube-card report (BUG-014) was the most valuable catch of this round: a real, reproducible gap in the mount-time logic that would have silently affected every link card pasted or saved before this fix shipped, on every board, forever — not a one-off.

**Logged to bugs.md:** BUG-014, BUG-015
**Logged to rules-decisions.md:** ADR-0072

---

## Audit — Phase 2.5, round 4 (ribbon/body structural fix, resize-grows-thumbnail, delete-X clearance, reference re-match) — 2026-10-26

**Claimed done per implementation_plan.md:** yes — the Round 4 sub-section in Phase 2.5 is checked off, covering the structural fix plus the reference re-match items.
**Matches its own stated objective?:** Yes, and this is the most structurally significant fix of the whole node-card-overhaul arc so far. Istiyak's own words — "Real chunk here. Design got worse" — made clear round 3's fixes had papered over a deeper problem rather than solved it. This round deliberately did NOT patch the visual symptom again (round 3's mistake, in hindsight): it traced the drift to its actual mechanical cause (two elements independently tracking "how big is this card," one live via React Flow's own resize machinery, one only at resize-end) and removed the second source of truth entirely rather than trying to keep the two in sync more carefully. Verified live, repeatedly, mid-drag AND after-drop, across text/video/file/link node types — not just the YouTube case shown in the bug report.
**Matches the reference screenshots specifically?:** Re-checked side by side against all three reference images this round (not against memory of earlier rounds). Two real mismatches were found and fixed: the document card's header showed the specific filename where the reference shows the generic word "Documents" (filename moved into the body); the Text card's header icon was a bare line-icon where the reference shows it inside a small filled chip. The video card's bold-text-on-thumbnail look in the reference was confirmed to be baked into the actual YouTube thumbnail image itself (creator-authored thumbnail art), not something this app needs to render — no change needed there.

**Structural check against architecture.md:** No new files; this round touches only `node-chrome.tsx` plus the four existing node-type files' own usage of it.

**Scope check against feature.md:** No new feature surface, pure structural bug fix plus a closer visual match to already-agreed reference styling.

**Orphans:** None.

**Skeptical pass (ADR-0049):**
- Any secret or key visible anywhere it shouldn't be? No new network/data logic this round — none found.
- Any error path regression? None of this round's changes touch error/status handling; the video card's "error" preview state (confirmed in this sandbox's own network-restricted testing) still renders correctly inside the now-flex-1 thumbnail area.
- Any cost-incurring or data-mutating action without double-submit protection? N/A — purely layout/structure changes, no new mutations.
- This self-review is a first pass, not proof — the live-drag mid-resize screenshots in this sandbox showed the card's visual size already matching its final post-release size DURING the drag (not growing incrementally frame-by-frame, since screenshots are snapshots, not video) — so whether the resize feels smooth/animated in real continuous mouse movement on Istiyak's own machine, versus a single visual jump, could not be fully assessed from discrete screenshots alone. If a resize feels like it "snaps" rather than smoothly follows the cursor in real use, that would be a reasonable follow-up, though it was not reported as a complaint this round and the structural correctness (no drift, handle stays attached, body actually resizes) is the part that was broken and is now fixed.

**Findings / action items:**
- This is the second time in a row (rounds 3 and 4) that a card-chrome fix needed a second pass after shipping — worth treating any future node-chrome layout change with extra skepticism before calling it done: specifically, testing a resize gesture MID-DRAG (not just before/after) surfaced the actual bug, where a before/after-only check in round 2/3 would have (and did) miss it.

**Logged to bugs.md:** BUG-016
**Logged to rules-decisions.md:** ADR-0073

---

## Audit — Phase 2.5, round 5 (light-tint header colors, open-icon relocated beside 3-dot menu, corner-radius nesting fix, re-matched icon choices) — 2026-10-26

**Claimed done per implementation_plan.md:** yes — the Round 5 sub-section in Phase 2.5 is checked off, covering all four of Istiyak's numbered items.
**Matches its own stated objective?:** Yes. Istiyak's own framing this round — "Very close to what we wanted for this node cards. We almost achieved the card" — correctly signaled this was polish, not a structural redo, and it was treated that way: round 4's single flex-container structure (ADR-0073) was left untouched; nothing in this round required touching `NodeResizeControl`, the resize machinery, or the header/body flex relationship itself.
**Matches the reference screenshots specifically?:** Re-checked directly against both reference images. The color change was verified NOT just visually but with a direct `getComputedStyle` read of each card's outer background and header text color in the live sandbox — confirmed pale `.100`-shade backgrounds paired with darker `.700`-shade text per type (blue/red/indigo/amber/gray), matching the reference's light-theme treatment rather than relying on screenshot-only judgment, which is more reliable for a pure-color claim like this one. The scrollbar-at-the-corner scenario from the second reference crop was reproduced directly (a resized text card with enough content to force a scrollbar) and checked via computed box geometry, not just a screenshot — confirmed a consistent 2px gap on every side between the outer container and the body, with matching 12px radii on both, which is the actual geometric condition for a smooth nested corner.

**Structural check against architecture.md:** No new files, no new folders. Token changes stay inside the existing `packages/tokens` → `globals.css` pipeline (ADR-0024/ADR-0031); no hardcoded color values introduced.

**Scope check against feature.md:** No new feature surface. The "voice memo" wording in Istiyak's fourth point was reference-only icon-philosophy guidance — Brainy has no voice-memo node type, and none was added; this was treated as inapplicable to a node type that doesn't exist, not as an implicit feature request.

**Orphans:** None. `NodeMenu`'s `onOpen`/`openLabel` props and its dead "Open" `MenuItem` block (the first thing cleaned up this round, since node-header.tsx no longer passes them) were fully removed, including the now-unused `ExternalLink` import in `node-menu.tsx` — confirmed via `tsc --noEmit` and lint passing clean (0 errors) afterward, not left as silently-unreachable code.

**Skeptical pass (ADR-0049):**
- Any secret or key visible anywhere it shouldn't be? No new network/data logic this round — none found.
- Any error path regression? None of this round's changes touch status/error handling; the video card's existing "error" thumbnail state and the file card's existing extraction-status states were re-screenshotted and still render correctly under the new header colors.
- Any cost-incurring or data-mutating action without double-submit protection? N/A — color, icon, and layout-position changes only; the relocated "open" button calls the same `window.open` handler the dropdown item used to call, with the same `event.stopPropagation()` guard against also triggering the card's own select/drag behavior.
- Any async action with no timeout/failure path? N/A, no new async paths.
- This self-review is a first pass, not proof — the body's corner radius was matched to `rounded-lg` (12px) rather than hitting the mathematically exact 10px ideal, because Tailwind's token scale has no 10px step and an arbitrary value would violate `tailwindcss/no-arbitrary-value` (ADR-0024). This was a deliberate, reasoned choice (an inner radius at or above the ideal can't produce a visible notch, only a smaller one can — see BUG-017), but it means the nesting is technically "radius matches, offset by padding" rather than "radius mathematically pre-compensated for the padding." Worth a quick glance from Istiyak on his own machine at a real resized card's corner to confirm it reads as fully smooth now, not just "better than before."
- Only four of the five reference card types (text, YouTube, Vimeo, file, link) could be verified against a resolved/successful state in this sandbox — the sandbox has no real internet egress for actual YouTube/Vimeo oEmbed calls or favicon fetches, so the "ok" visual states for video thumbnails and link favicons were seeded directly via the API with synthetic data (a real YouTube thumbnail URL for the image itself, which DID load since it's a direct image fetch, not an oEmbed call) rather than exercised through the app's real fetch path. The color/icon/corner-radius/open-icon fixes are all structural/CSS-level and don't depend on that fetch path, so this doesn't weaken the verification of this round's actual changes, but Istiyak's own machine (with real internet access) remains the final confirmation for the full live-fetch path end to end.

**Findings / action items:**
- `NodeMenu`'s dead "Open" menu-item block from the previous edit pass (made before this summary/continuation point) was caught and cleaned up by running `tsc --noEmit` immediately — it would otherwise have been silently unreachable code (TypeScript didn't catch it as an error since both removed props were already optional), a good reminder that an optional-prop removal needs an explicit dead-code sweep of its own, not just a type-check.
- No new bugs beyond BUG-017 (the corner-radius nesting math) were found this round — the other three items were straightforward token/icon/layout changes with no hidden structural coupling, consistent with Istiyak's own "very close" framing.

**Logged to bugs.md:** BUG-017
**Logged to rules-decisions.md:** ADR-0074

---

## Audit — Phase 2.5, round 6 (resize restricted to text, 3-dot menu removed, per-type hover/select ring, per-filetype document colors restored, text card read-only-by-default, link card header/URL/preview-image redesign, drag-and-drop/paste-file upload fixed) — 2026-10-26

**Claimed done per implementation_plan.md:** yes — the Round 6 sub-section in Phase 2.5 is checked off, covering all ten of Istiyak's numbered items from this round.
**Matches its own stated objective?:** Yes. Istiyak's framing this round ("Very close" from round 5, now a longer troubleshooting/refinement list) was again polish-plus-one-real-bug, not structural — and it was treated that way: round 4's single flex-container structure (ADR-0073) and round 5's light-tint color system (ADR-0074) both stayed untouched except the one explicitly requested value (`ribbonBg.neutral`, one step more contrast). The one genuine interaction-model change (text card going read-only-by-default) was scoped exactly as asked — text only, not generalized to other types that don't have the same risk.
**Matches the reference screenshot specifically?:** The late-arriving Poppy link-card screenshot (globe icon, external-link icon, no menu, full-width preview image) was used correctly as a STRUCTURAL/layout reference only, per the coordinator's explicit instruction — its solid blue header color was NOT copied, since Istiyak had separately and explicitly locked the pale-tint color system from round 5 ("For rest Color part is sorted... locked it"). Worth flagging that this is a real potential point of confusion for a future round if a new reference image's color doesn't match what's already locked — this round handled it correctly only because the coordinator's message was explicit about which parts of the image were and weren't in scope; a future round without that explicit framing should default to NOT copying a new reference's color over an already-locked decision, and ask rather than assume either way.

**Structural check against architecture.md:** `node-menu.tsx` was deleted (fully unreferenced after this round's header redesign) rather than left as dead code — confirmed via `tsc --noEmit` passing clean immediately after the deletion, and no remaining imports anywhere in the codebase. No new files/folders added. `board-store.ts`'s `LinkNodeData` gained one new optional field (`previewImageUrl`) in the same `data` JSON blob every other per-node field already lives in (no new DB column, no migration) — consistent with ADR-0070's established pattern for extending a node type's data shape.

**Scope check against feature.md:** No new feature surface beyond what was explicitly asked. The coordinator's note that "voice memo" in Istiyak's wording was reference-image-only inspiration (no audio-recording node type exists or is planned) was correctly treated as out of scope and not built. The OG-image preview fetch is a small, bounded extension of the EXISTING lightweight-metadata-fetch scope (ADR-0067/ADR-0053: cosmetic metadata only, never page content) — not a new capability, just one more field from the same already-fetched `<head>` HTML.

**Orphans:** `node-menu.tsx` deleted (see above) — the one orphan this round would otherwise have created, caught and removed rather than left behind.

**Skeptical pass (ADR-0049):**
- Any secret or key visible anywhere it shouldn't be? No new network/data logic beyond the OG-image regex extraction (same fetch, same response shape pattern as the existing title/favicon extraction) — none found.
- Any error path that would show a raw stack trace? The new `addFileNode` calls in the canvas's drag-and-drop and paste-file handlers are wrapped in try/catch mirroring `handleFileChosen`'s own existing silent-failure handling (no toast system exists yet in this app, a known Phase-1-scope gap, not introduced by this round) — a failed upload via drag/paste fails exactly as gracefully (or ungracefully) as the existing toolbar "File" button already does, not worse.
- Any cost-incurring or data-mutating action without double-submit protection? The drag/paste file handlers both set `isUploading` around their upload loop, the same guard the toolbar button already uses, so a second drop/paste while one is still in flight is visually discouraged the same way (though, unlike the toolbar button, nothing currently blocks a SECOND drop/paste gesture itself from starting a second concurrent upload loop — the toolbar button disables itself via `disabled={isUploading}`, but the canvas's drop zone has no way to show "disabled" short of blocking pointer events entirely, which would also block normal canvas interaction while uploading. Flagged as a minor follow-up, not fixed this round: low-risk since multiple files in one drop/paste already upload sequentially in a loop, and a human dragging a second file mid-upload is a narrow edge case, not a likely one).
- Any async action with no timeout/failure path? The OG-image fetch reuses `fetchPageMetadata`'s existing `AbortController`/timeout (`GENERIC_FETCH_TIMEOUT_MS`), not a separate unbounded fetch.
- This self-review is a first pass, not proof — the preview-image feature could only be verified STRUCTURALLY in this sandbox (a `data:` URI image, proving the component renders correctly once an image loads), not against a REAL external OG image over the network: this sandbox's headless browser cannot reach `i.ytimg.com` (or, by extension, any external image host) at all, confirmed by a direct `page.goto` to that exact URL failing with `ERR_TUNNEL_CONNECTION_FAILED` on every attempt — a pre-existing sandbox limitation (noted in round 5's audit too), not a regression introduced here. The `onError` fallback was confirmed working correctly (gracefully reverting to the compact treatment, never a broken-image icon), which is the actual production-relevant behavior for a real-world failed/CORS-blocked/hotlink-protected image fetch too — but the HAPPY path (an image that successfully loads from a real external URL) needs Istiyak's own machine, with real internet access, as the final confirmation.
- A second, separate test-tooling pitfall was caught and corrected mid-verification: the first attempt to verify clipboard-file-paste used Playwright's generic `page.dispatchEvent(selector, "paste", {clipboardData})` helper, which does not construct a true `ClipboardEvent` (so the handler's `event.clipboardData` read as `undefined` and the test silently "failed" without ever exercising the real code path) — re-verified correctly via `page.evaluate` constructing an actual `new ClipboardEvent(...)` with `clipboardData` set, which then worked and confirmed a real `POST /api/files/upload` network request fired. Worth remembering for future rounds: a DOM-count check alone ("did a node appear") can look like it failed for a test-tooling reason that has nothing to do with the app, so a network-level check (did the actual request fire) is the more trustworthy signal when a browser API's event-construction details matter, as they do for `ClipboardEvent`/`DragEvent`.

**Findings / action items:**
- The file-color reversal (ADR-0071 → ADR-0075) is the second time in this arc a prior round's explicit call has been explicitly reversed by the same person who asked for the original (round 5 reversed nothing; round 4 added to round 3 rather than reversing it) — worth remembering that "locked" language from Istiyak (as used for the color system this round) should be taken as genuinely settled unless he says otherwise, the way the file-type color convention was NOT "locked" and turned out to need revisiting.
- The minor "second drop/paste mid-upload" gap noted above is a reasonable follow-up if it ever actually comes up in practice, not urgent enough to block this round on.

**Logged to bugs.md:** BUG-018
**Logged to rules-decisions.md:** ADR-0075

---

## Audit — Top Nav / Breadcrumb / Profile Dropdown polish pass — 2026-10-26

**Claimed done per implementation_plan.md:** n/a in the literal sense — like Phase 2.5, this is a UX-polish pass inserted in response to direct user feedback, not an original roadmap phase. Verified against Istiyak's own five numbered asks (logo motion, nav shadow, avatar contrast, breadcrumb, profile dropdown) directly via Playwright against a sandboxed copy of the real app, not assumed from reading the code.
**Matches prd.md §6 "done looks like"?:** n/a — same reasoning as Phase 2.5's first audit entry above.

**Structural check against architecture.md:**
- Folder structure matches §2? Yes — one new file (`apps/web/components/layout/board-breadcrumb.tsx`) lands in the same folder its sibling layout components (`navbar.tsx`, `profile-menu.tsx`) already live in; nothing new was invented.
- Any new files/folders not described anywhere? No.

**Scope check against feature.md:**
- Anything built that isn't described in any feature entry? No new F-### feature — this is UX polish over the already-shipped F-02 (Navbar + profile dropdown), same category as Phase 2.5's node-card polish rounds.

**Orphans:**
- Any file/function with nothing importing or calling it? None — `board-breadcrumb.tsx` is imported and used by `navbar.tsx`; `board-store.ts`'s new `renameBoard`/`boardFolderId` are both consumed by it.
- Any "temporary"/"TODO: remove" code left in from earlier in the phase? None found.

**Skeptical pass (ADR-0049):**
- Any secret or key visible anywhere it shouldn't be? No new network/data logic beyond the existing `PATCH /api/boards/:id` call (already used elsewhere) — none found.
- Any error path that would show a raw stack trace to the user instead of a plain message? The breadcrumb's rename reverts the local title silently on a failed PATCH (no toast system exists yet anywhere in this app — the same pre-existing gap `board-store.ts`'s own node-data autosave already has) rather than showing any raw error — consistent with, not a regression of, the rest of this file's error handling.
- Any cost-incurring or data-mutating action without double-submit protection? The rename commits on blur/Enter once per edit session — the input unmounts back to a static span immediately on commit, which structurally prevents a second submit of the same edit, and `isSaving` disables re-opening the editor mid-save.
- Any async action with no timeout/failure path? Reuses `api.patch`, which already carries `lib/api.ts`'s existing 15s timeout.
- This self-review is a first pass, not proof — Istiyak should look specifically at the breadcrumb: the "my read" judgment call on his garbled breadcrumb-paragraph sentence (ADR-0078) is the one piece of this round NOT directly confirmed by his own words, and should be corrected if wrong, which is contained to `navbar.tsx`'s `isBoardCanvas` branch if so.

**Findings / action items:**
- One real bug (not styling) was found and fixed during this pass's own verification, before it ever reached Istiyak: BUG-019, a `CLIENT_HOOK_DYNAMIC` crash from `usePathname()` outside a `Suspense` boundary — caught by actually running both `next dev` and a full `next build`, not just eyeballing the diff.
- `packages/tokens/tokens/semantic.json` and `apps/web/app/globals.css` were deliberately left untouched this round — no new color/shadow tokens were needed, only an existing shadow PRIMITIVE's value changed (`primitives.json`'s `shadow.nav`), so there was nothing to merge against the parallel node-card redesign work touching those two shared files.

**Logged to bugs.md:** BUG-019
**Logged to rules-decisions.md:** ADR-0076, ADR-0077, ADR-0078

---

## Audit — Round 7: cross-agent `board-store.ts` build-break fix (BUG-020) + canvas toolbar makeover + breadcrumb reorder — 2026-10-26

**Claimed done per implementation_plan.md:** Phase 2.5 Round 7 entry + the Navbar section's new Top-Nav-polish/breadcrumb lines (Phase 1). Verified by actually reproducing Istiyak's real `npm run build` failure (not trusting his truncated screenshot), finding the true root cause, fixing it, and re-verifying a clean build on a freshly re-staged copy of the live device state — then, as a second, separate piece of work, rebuilding the canvas sub-header into an icon toolbar and fixing the breadcrumb's wording/order, both confirmed live via Playwright.
**Matches prd.md §6 "done looks like"?:** n/a — same reasoning as the two Phase-2.5-adjacent audit entries above (user-feedback-driven polish/fix pass, not an original roadmap phase).

**The build-break fix itself — what actually went wrong while fixing it:**
- The first push of the `board-store.ts` fix and the first push of the `docs/bugs.md` BUG-020 entry both reported success (`device_commit_files` returned `written`, not `rejected`) but, when re-staged minutes later to confirm, neither had actually taken effect — `board-store.ts` was back to this agent's own pre-fix round-6-only version (31215 bytes, missing even the nav agent's `boardFolderId`/`renameBoard`) and `bugs.md` had no BUG-020 entry at all. Caught only because this agent re-staged and diffed after pushing, instead of trusting the tool's own success response — re-pushed immediately and re-confirmed byte-for-byte via a second re-stage. **Flagged honestly: the cause of that first silent non-apply was never identified** (not a code bug, a device-bridge/timing question outside this agent's visibility) — worth Istiyak knowing this happened, in case it recurs.
- Re-staging `docs/rules-decisions.md` before writing this round's own ADR surfaced that the parallel nav agent's ADR-0078 already cited a "BUG-019" that was never actually written to `bugs.md` (likely the same kind of lost-write this round hit directly) — written in honestly, sourced from ADR-0078's own implementation note rather than independently investigated, and this agent's own build-break entry renumbered to BUG-020 to avoid colliding with (or displacing) that already-cross-referenced number.

**Structural check against architecture.md:**
- Folder structure matches §2? Yes — `canvas-toolbar.tsx` lands in `components/canvas/` beside the node components it serves; `tooltip.tsx` lands in `components/ui/` beside the other small reusable primitives (`button.tsx`, `avatar.tsx`).
- Any new files/folders not described anywhere? No.
- New dependency added? No — the tooltip is plain CSS (`group-hover`/`opacity`), per the repo's standing "no new dependency unless truly unavoidable" rule.

**Scope check against feature.md:**
- Anything built that isn't described in any feature entry? No new F-### feature — toolbar/breadcrumb polish over the already-shipped canvas (Phase 2.5) and Navbar (Phase 1/ADR-0078), same category as every other polish round in this log.

**Orphans:**
- `CanvasToolbar` and `TooltipTrigger` are both imported and used (the former by `[id]/page.tsx`, the latter by `CanvasToolbar` itself). No leftover reference to the deleted sub-header's old `ArrowLeft`/`Link` imports — removed along with the JSX that used them, confirmed via a clean `npm run lint` (0 errors).

**Skeptical pass (ADR-0049):**
- Any secret or key visible anywhere it shouldn't be? No new network/data logic in this round at all — the build fix only restores a type, and the toolbar/breadcrumb work is pure presentation over existing store actions.
- Any cost-incurring or data-mutating action without double-submit protection? The toolbar's File button already disables itself while `isUploading`, unchanged from before this round.
- This self-review is a first pass, not proof — the one thing NOT independently confirmed this round is the zoom-panel ask ("right bottom corner like poppy"): no reference screenshot came through, so this was checked against the already-live bottom-right cluster from an earlier round and judged to already satisfy it, not against anything new from Istiyak. If his mental picture differs, that needs an actual screenshot, not another guess.

**Findings / action items:**
- BUG-020 (the build break) and BUG-019 (the nav agent's previously-uncommitted Suspense fix) are both now in `bugs.md`, closing the gap ADR-0078's existing cross-reference had been pointing at.
- Process note carried into `bugs.md` BUG-020 itself: when two agents are known to be working in parallel, a merged file should be diffed field-by-field against both source versions before either reports done — and, per this round's own experience, a push to the device should be re-staged and diffed immediately after, not trusted from its own success response alone.

**Logged to bugs.md:** BUG-019 (written in, sourced from ADR-0078), BUG-020
**Logged to rules-decisions.md:** ADR-0079

---

## Audit — Round 8: canvas pan/select gesture reconciliation + background tint/dot-grid character (BUG-021) — 2026-10-26

**Claimed done per implementation_plan.md:** Phase 2.5's "Multi-select + Figma-like pan/zoom" sub-section, now amended with Round 8 lines. Verified entirely live via Playwright computed-style checks and actual synthetic drag gestures against a sandboxed copy of the real app — not assumed from reading the code, and two real mistakes were caught and corrected during that same live verification (not just the one the brief itself anticipated).

**Matches prd.md §6 "done looks like"?:** n/a — same reasoning as every other polish-round audit entry in this log (user-feedback-driven refinement, not an original roadmap phase).

**Structural check against architecture.md:**
- Folder structure matches §2? Yes — no new files this round; all changes are to `[id]/page.tsx`'s existing `<ReactFlow>` props, `globals.css`, and `packages/tokens/tokens/semantic.json`.
- Any new files/folders not described anywhere? No.
- New dependency added? No.

**Scope check against feature.md:**
- Anything built that isn't described in any feature entry? No — this is canvas-interaction/visual polish over the already-shipped Phase 2.5 canvas, not a new feature.

**Orphans:** n/a — no new exports/components this round.

**Skeptical pass (ADR-0049):**
- Any secret or key visible anywhere it shouldn't be? No network/data logic touched this round at all — purely client-side interaction props and CSS.
- This self-review is a first pass, not proof — two genuine mistakes were made and caught DURING this round's own verification, not before: (1) the first cursor-override attempt also suppressed the correct `grabbing` cursor mid-drag, because `!important` beats a non-`!important` rule regardless of which was written later, and both `draggable` and `dragging` classes are present simultaneously during an active drag — fixed with a `:not(.dragging)` guard; (2) the background-color token change initially produced ZERO visible effect at all, traced to a real, pre-existing bug (BUG-021) rather than a mistake in this round's own token edit — React Flow's own un-layered stylesheet silently beats any same-specificity Tailwind utility targeting the same element, a general risk worth remembering for any FUTURE Tailwind utility applied directly to a React-Flow-rendered element, not just this one case.
- A third, lower-stakes miss during verification: the very first Playwright pan-drag test started its drag on top of an existing node instead of empty canvas, making it look like plain-drag panning wasn't working at all — caught immediately by checking the screenshot of actual node layout rather than trusting the automated result blindly, and the test was corrected to start from a genuinely empty area.

**Findings / action items:**
- BUG-021 is a real, pre-existing defect that predates this round (the `bg-background-canvas` className has been non-functional since it was first added) — flagged in `bugs.md` with a process note: any Tailwind utility applied directly to a React-Flow-rendered element needs a real computed-style check, not just "the class is present," because React Flow's unlayered CSS can silently win with no visual symptom when colors happen to coincide (exactly what hid this bug until the token value actually changed).
- Dev-server note for future rounds in this same sandbox: a stale Next.js `.next` dev cache from earlier in this session caused a CSS edit to not appear in the served bundle at all, even after a fresh `npm run build` — resolved by deleting `.next` and restarting the dev server; worth remembering if a CSS/token change ever appears to have "no effect" again despite a clean build.

**Logged to bugs.md:** BUG-021
**Logged to rules-decisions.md:** ADR-0080, ADR-0081

---

## Audit — Boards List / Folders / Trash polish pass — 2026-10-27

**Claimed done per implementation_plan.md:** F-04 (Folders) now has a real rename/delete UI with an explicit move-or-delete-boards strategy choice, replacing the pre-existing gap this file's own F-04 line previously flagged ("no UI exposes deleting a folder at all"). A new favorites feature (toggle + persistence, deliberately not sort/filter) was added on top of F-03. Verified entirely live via Playwright (screenshots of every new UI state, a scripted `elementFromPoint()` cursor check, and a full create-folder → rename → move-board → delete-folder(move) → create-another-folder → delete-folder(delete-boards-too) → confirm-in-Trash → favorite → reload round trip against a sandboxed copy of the real app+backend), not assumed from reading the code.

**Matches prd.md §6 "done looks like"?:** n/a — same reasoning as every other polish-round audit entry in this log (user-feedback-driven refinement of an already-shipped Phase 2 feature, not an original roadmap phase being closed for the first time); F-04's own checklist line in `testing.md` is the closer match, and that one is now genuinely checked off rather than flagged as a gap.

**Structural check against architecture.md:**
- Folder structure matches §2? Yes — `folder-delete-dialog.tsx` lands in `components/boards/` beside `board-card.tsx`/`board-row-menu.tsx`/`name-prompt-dialog.tsx`, the other Boards-List-specific components; `boards-refresh-store.ts` lands in `stores/` beside `folders-store.ts`/`board-store.ts`/`settings-store.ts`, matching this app's established one-store-per-concern pattern.
- Any new files/folders not described anywhere? No.
- New dependency added? No — the folder-delete dialog's folder picker is a plain native `<select>`, not a new combobox library; everything else reuses components already in the repo (`Dialog`, `Button`, `Label`).
- Schema change went through the real migration path? Yes — `drizzle-kit generate` produced `apps/server/drizzle/0002_overrated_wraith.sql`, applied via `npm run db:migrate` against a copy of the live database, not hand-edited. Checked against BUG-001's documented rebuild-migration gotcha before applying; didn't apply here since `is_favorite` has no `UNIQUE` constraint forcing SQLite's rebuild pattern (confirmed by reading the generated SQL: a plain `ALTER TABLE ... ADD COLUMN`, no table rebuild).

**Scope check against feature.md:**
- Anything built that isn't described in any feature entry? Favorites is a genuinely new capability not previously in `feature.md` — scoped deliberately narrow (toggle + persistence only, no sort/filter/favorites-view) to match exactly what the brief asked for, not expanded beyond it. Worth adding to `feature.md` in a future doc-sync pass; not done in this round since the brief's instructions were about `bugs.md`/`rules-decisions.md`/`testing.md`/`audit.md` specifically.

**Orphans:** `FolderDeleteDialog` and `useBoardsRefreshStore` are both imported and used (`boards-sidebar.tsx` for the dialog; `boards-sidebar.tsx`, `(list)/all/page.tsx`, and `(list)/trash/page.tsx` for the refresh store). `BoardCard`'s new `variant`/`onToggleFavorite`/`onRestore`/`onDeleteForever` props are all exercised by at least one caller (`(list)/all/page.tsx` for the default variant + favorite, `(list)/trash/page.tsx` for the trash variant). Confirmed via a clean `npm run lint` (0 new errors; the one pre-existing `motion-safe:duration-fast` custom-classname warning pattern this codebase already carries elsewhere appears once more in `board-row-menu.tsx`, not introduced by this round) and a clean `npm run build` for both `apps/web` and `apps/server`.

**Skeptical pass (ADR-0049):**
- Any secret or key visible anywhere it shouldn't be? No — this round touches boards/folders CRUD only, no provider credentials or auth paths.
- Any cost-incurring or data-mutating action without confirmation? The one new destructive-adjacent action (folder delete with "delete its boards too") goes through `FolderDeleteDialog`'s explicit confirm step, same as every other destructive action in this app (Trash's permanent-delete, single-board "Move to Trash" is non-destructive since it's a soft-delete). The favorite toggle is non-destructive and reversible, so no confirmation was added for it — consistent with how this app treats other reversible toggles.
- A real bug caught DURING this round's own verification, not anticipated by the brief: deleting a folder with "delete its boards too" crashed with a SQLite foreign-key violation (BUG-025) — the soft-deleted boards still pointed `folder_id` at the folder about to be deleted. Caught by actually running the flow through the UI (not just reading the route code), fixed, and re-verified both via a direct API call and a full fresh Playwright run through the dialog.
- This self-review is a first pass, not proof — the folder-delete-with-boards flow was tested with a folder containing exactly one board; a folder containing many boards, or a board that's simultaneously the one open in an already-loaded canvas tab elsewhere, wasn't separately isolated. Flagging rather than assuming either generalizes cleanly, though nothing in the implementation is board-count-specific (`where(boards.folder_id, id)` with no `LIMIT`).

**Findings / action items:**
- BUG-022 (Trash's own separate markup), BUG-023 (dropdown hover-clip), BUG-024 (row hover/cursor mismatch), and BUG-025 (folder-delete-with-boards FK crash) are all now in `bugs.md`.
- `feature.md` doesn't yet describe the favorites capability — noted above as a gap worth closing in a future doc-sync pass, not done here since it wasn't part of this round's explicit instructions.

**Logged to bugs.md:** BUG-022, BUG-023, BUG-024, BUG-025
**Logged to rules-decisions.md:** ADR-0082, ADR-0083, ADR-0084

---

*(Entries for Phases 3–7 are added the same way, as each phase is reached. Don't pre-create empty headers for phases far in the future — add the section when its audit is actually run, so this file's structure reflects real history rather than a template skeleton.)*
