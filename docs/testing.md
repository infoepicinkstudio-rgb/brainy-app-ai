# Testing — Brainy (brainy.ai)

> **What this file is:** a manual test-case checklist, one section per feature, matching the features and their Level-2 flows in [`feature.md`](./feature.md). A feature's checkbox in [`implementation_plan.md`](./implementation_plan.md) shouldn't be marked done until its test cases here pass.
>
> **What this file is not — yet:** an automated test suite. Whether (and how) to add automated tests is explicitly undecided — see `agents.md` §5. This file covers manual verification only, which is enough for a solo local tool at this stage; it can grow into/alongside automated coverage later without needing a rewrite.
>
> **How to use this:** before checking off a feature in the tracker, actually run through its cases here against the real running app — don't assume. When a bug turns up while testing, log it in [`bugs.md`](./bugs.md) rather than silently patching and moving on, so there's a record.

Legend: `[ ]` not yet run · `[x]` passes · `[~]` partially implemented/adjusted (see note)

---

## Phase 1 — App Shell

> **Phase 1 verification note (2026-10-26):** built and verified from a headless environment with no browser available. Backend behavior below was confirmed by running the real `apps/server` process and exercising it directly (HTTP calls, raw-DB inspection, isolated encryption round-trip scripts) — that's a genuine pass, not a guess. Frontend behavior was verified by confirming the exact component code path consumes the exact field that was independently confirmed correct server-side (e.g. `ProviderKeyField` renders off `status.isConfigured`, which was independently confirmed to flip correctly). What this fork could **not** do is look at rendered pixels in a browser — anything that's purely about layout, visual rendering, or multi-step pointer/keyboard interaction is left `[ ]` below for Istiyak to actually run once. Where a case is marked `[x]`, it means "logic + data path confirmed end-to-end," not "a human has seen it work."

**F-01 — Cosmetic first-run login**
- [x] Fresh install (empty `brainy.db`) shows the login screen — confirmed: `GET /api/profile` on a fresh DB returns `{"profile":null}`, and `AppGate` renders `FirstRunLogin` exactly when `profile` is `null`. *(not visually confirmed in a browser)*
- [x] Submitting a name creates a profile and lands on Boards List — confirmed: `POST /api/profile` creates the row and returns it; `AppGate`'s redirect effect fires to `/brainboard/all` once `profile` and `sessionActive` are both truthy. *(redirect itself not visually confirmed)*
- [x] Relaunching the app after a profile exists skips straight to Boards List — confirmed: `GET /api/profile` returns the existing row on a second call (no re-creation), which drives the same redirect path above.
- [x] Submit is blocked on an empty name field — confirmed in `FirstRunLogin`: `handleSubmit` returns early with "Enter a name to continue." before ever calling the API when `name.trim()` is empty.

**F-02 — Navbar + profile dropdown**
- [ ] Avatar/initials render correctly for a 1-word and a multi-word name — the underlying `initialsFromName` pure function was directly exercised (6/6 cases incl. 1-word/multi-word/whitespace/empty all correct), but actual on-screen rendering is unverified.
- [ ] Dropdown shows Settings, shortcuts reference, About, Sign Out — present in `ProfileMenu`'s code, visual confirmation pending.
- [x] Sign Out returns to login screen without deleting the stored profile — confirmed by code: `signOut()` only sets `sessionActive: false` in the Zustand store; it never calls any delete/clear endpoint, so the `users` row is untouched. The gate's "profile exists but session inactive" branch then renders `WelcomeBack`, not a destroyed profile.
- [ ] Navbar is present and consistent on both Boards List and Canvas views — Boards List placeholder exists (Phase 2 builds the real one); Canvas doesn't exist until Phase 3. Re-check once those routes are real.

**F-11 — Settings: provider API keys (storage)**
- [x] Saving a Claude API key persists it (visible again after app restart, masked) — confirmed end-to-end: `PUT /api/providers/claude` encrypts and stores the key (verified as genuine AES-256-GCM ciphertext via raw DB read, not plaintext), `GET /api/providers` reflects `isConfigured: true` afterward, and the key field renders masked (`type="password"`) with no raw value ever returned to the frontend to display.
- [x] Clearing a key reverts the provider to "not configured" — confirmed: `DELETE /api/providers/:provider` nulls `api_key`; a follow-up `GET` shows `isConfigured: false`.
- [~] An obviously malformed key (e.g. empty string, wrong prefix) is rejected at save time — **partially implemented, adjusted from the original case:** an empty/whitespace-only key is caught client-side in `ProviderKeyField` ("Enter a key, or cancel.") before any API call. A "wrong prefix" format check (e.g. requiring a Claude key to start with a specific prefix) was **not** built in Phase 1 — the directive scoped this as generic CRUD storage, not per-provider key-format validation, and providers' actual key formats aren't guaranteed stable enough to hardcode a prefix check against. Left as a real gap, not silently dropped; revisit if a bad key actually causes a confusing failure mode once Native API calls exist (Phase 4+).

**F-21 — Brand/Voice Profile (editor)**
- [x] Profile content saves and reloads correctly after a restart — confirmed: `PUT /api/brand-profile` creates/updates the single "Default" row; a follow-up `GET /api/brand-profile` returns the same content back.

**F-25 — Cross-cutting error handling / logging / double-submit (initial pass)**
- [x] Stop the backend process while the frontend is open — confirm a clear "can't reach backend" message, not a hang or a silent failure — **this was a real gap found and fixed during Phase 1 (BUG-002, `bugs.md`):** the initial app-load path had no error handling at all and would hang on a loading spinner forever. Fixed: `loadProfile` now catches the failure, sets `profileLoadError`, and `AppGate` renders "Can't reach the Brainy.ai backend. Check that the server is running." with a "Try again" button. Verified that `fetch()` against a dead port rejects as expected (confirmed directly, not assumed) and that the catch path and retry action are wired correctly; the rendered error screen itself is not visually confirmed. Per-action errors elsewhere (Settings save/clear, login submit) already had this same "check the server is running" messaging from the first build pass.
- [ ] Double-click "Save" in Settings rapidly — confirm only one write happens — not yet built or tested; `ProviderKeyField`'s `Save key` button disables while `isSaving` is true, which should prevent this, but a true rapid-double-click race hasn't been exercised.
- [ ] Check that a deliberately forced backend error actually appears in the backend's log file — not tested; Fastify's default logger is in use but no explicit test of this was run.

---

## Phase 2 — Core canvas

**F-03 — Boards List**
- [ ] "New board" creates a board and navigates into it immediately
- [ ] Renaming a board updates both the list and the open canvas's navbar
- [ ] Zero-boards state shows an empty-state prompt, not a blank screen

**F-04 — Folders**
- [ ] Moving a board into a folder, then deleting the folder, leaves the board intact at top level

**F-05 — Soft-delete / Trash**
- [ ] Deleting a board removes it from the main list and shows it in Trash
- [ ] Restoring from Trash brings it back to its original folder
- [ ] Permanent delete from Trash removes the board and its nodes/edges/messages

**F-06 — Canvas pan/zoom/select**
- [ ] Pan and zoom work with both mouse and trackpad input
- [ ] Clicking empty canvas clears selection
- [ ] Multi-select via marquee drag selects the right nodes

**F-08 — Board autosave**
- [ ] Edit a node, hard-refresh within a few seconds, edit is retained
- [ ] Rapidly edit text then immediately drag the node — both changes persist

**F-09 — Text nodes**
- [ ] Create, edit, and delete a text node
- [ ] Deleting a text node also removes any edges pointing at it (no orphaned edges)

**F-26 — File/document nodes**
- [ ] Upload a PDF, confirm the node renders with filename/icon and extracted text later shows up correctly when a connected chat node references it (full round-trip tested in Phase 4)
- [ ] Upload a DOCX, same check
- [ ] Upload an XLSX, confirm the extracted tabular summary is sane (not garbled or truncated mid-row)
- [ ] Upload an image, confirm it renders as a visual-only reference with no extraction attempted, and the manual notes field works
- [ ] Upload an unsupported file type, confirm a clear "not supported" message rather than a broken node
- [ ] Upload a corrupted/password-protected PDF, confirm a graceful extraction-failure state, not a crash
- [ ] Re-upload the exact same file content, confirm a cache hit (no re-parsing) — check backend logs or timing

**F-27 — Generic link/reference nodes**
- [ ] Paste a LinkedIn post URL, confirm the node shows the raw URL/title with no automated fetch attempted
- [ ] Manually paste content into the notes area, confirm it's retained and editable
- [ ] Leave the notes area empty, confirm it's correctly omitted later from context assembly rather than sent as empty text (verified in Phase 4)
- [ ] Click-through opens the original URL in a new tab

---

## Phase 3 — More node types

**F-07 — Grouping and duplication**
- [ ] Group several nodes, move the group, all members move together
- [ ] Duplicate a group whose nodes have edges to nodes outside the group — confirm external edges are NOT copied onto the duplicate
- [ ] Duplicate an entire board — confirm editing the duplicate never affects the original

**F-19 — Multi-select copy/paste across boards**
- [ ] Copy a selection, paste on a different board, confirm new nodes get new IDs and internal edges are preserved

**TF-06 — Connections**
- [ ] Create an edge between two nodes, delete it, confirm it's actually gone (not just visually hidden)

---

## Phase 4 — First chat node

**F-12 — Chat node placement, execution mode & model selection**
- [ ] Unconfigured provider's node type is greyed out in the tools panel
- [ ] Changing one chat node's execution mode doesn't affect any other chat node on the same board
- [ ] Changing one chat node's model doesn't affect any other chat node's model, even same provider, same board
- [ ] A newly placed chat node has a pre-selected default model — never requires a choice before it's usable
- [ ] Set two chat nodes on the same board to different models, confirm each request actually hits the model it was configured with (check backend logs/response metadata, not just that it responded)

**F-13 — Chat synthesis**
- [ ] Send a prompt with zero connected nodes — works as a plain chat
- [ ] Connect a text node, ask a question about its content, confirm the response actually reflects it (not a generic answer)
- [ ] Connect a file node (F-26), ask a question about its content, confirm the response reflects the extracted text/data
- [ ] Connect a link node (F-27) with manually-pasted content, confirm it's used as context; with empty content, confirm it's silently omitted
- [ ] Disconnect the provider's API key mid-session (clear it in Settings), then try sending — confirm a clear error state, not a silent hang
- [ ] Set a per-node "notes for AI" field, confirm it changes the response in a way that shows it was actually used
- [ ] Double-click "Send" rapidly on a Native API chat node — confirm only one request actually fires (F-25)
- [ ] Open browser dev tools, confirm no stack trace/exception text ever renders in the chat node's error state (F-25)

**F-29 — Estimated cost tracking**
- [ ] Send a Native API prompt, confirm Settings' running total increases by a plausible amount for that provider/model
- [ ] Send a Local LLM or Manual Input message, confirm the running total does NOT increase
- [ ] Confirm the UI clearly labels the figure as an estimate, not an exact bill

**F-16 — Per-node notes field**
- [ ] Edit the notes field mid-conversation — confirm the next message picks it up, previous messages in history are unchanged

**F-20 — Chat-stuck / error states**
- [ ] Force a failed provider call (e.g. temporarily invalid key) — confirm the retry action re-sends without requiring the prompt to be retyped

**F-21 — Brand/Voice Profile (consumption)**
- [ ] A chat node with the profile opted in includes it in context; a sibling node with it opted out does not

---

## Phase 5 — Video nodes

**F-10 — Video link nodes**
- [ ] Paste a valid YouTube link — thumbnail/title load correctly
- [ ] Paste an invalid/garbage URL — clean error state, no crash
- [ ] Paste a link to a private/deleted video — same graceful error treatment

**F-14 — Lazy extraction**
- [ ] First chat reference to a video node's content triggers extraction (visible in-progress state)
- [ ] Second reference to the same video (same or different board) does NOT re-run extraction — confirm via timing or a log check
- [ ] A video that fails to extract (e.g. unsupported/region-locked) shows a clear failure state and the chat node can still be used without it

---

## Phase 6 — Polish + remaining providers

**F-15 — Outliers panel**
- [ ] Search a real channel, toggle Latest/Popular/Outliers, confirm result sets actually differ
- [ ] Quick-add an outlier result creates a correct video link node on the current board

**F-17 — Mindmap output node**
- [ ] Generate a mindmap from a chat response, confirm it reflects that response's actual content
- [ ] Regenerate — confirm it creates a new node rather than overwriting the first one

**F-18 — Live mic input**
- [ ] Deny mic permission — confirm a clear message, rest of the app unaffected
- [ ] Speak a prompt, confirm transcribed text appears for review before sending (not auto-sent)

**F-22 — OpenAI/Gemini chat nodes**
- [ ] Repeat the F-13 test cases against both providers once enabled

---

## Phase 7 — Security hardening

- [ ] Paste a deliberately malformed/shell-metacharacter-laden "URL" into a video node — confirm nothing executes beyond the intended yt-dlp call
- [ ] Confirm the backend is unreachable from another device on the same network (not just unreachable from "outside" in the abstract)
- [ ] Run a full-history `gitleaks` scan — confirm clean before any public-repo step
