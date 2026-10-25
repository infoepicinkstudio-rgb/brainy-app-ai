# Testing — Brainy (brainy.ai)

> **What this file is:** a manual test-case checklist, one section per feature, matching the features and their Level-2 flows in [`feature.md`](./feature.md). A feature's checkbox in [`implementation_plan.md`](./implementation_plan.md) shouldn't be marked done until its test cases here pass.
>
> **What this file is not — yet:** an automated test suite. Whether (and how) to add automated tests is explicitly undecided — see `agents.md` §5. This file covers manual verification only, which is enough for a solo local tool at this stage; it can grow into/alongside automated coverage later without needing a rewrite.
>
> **How to use this:** before checking off a feature in the tracker, actually run through its cases here against the real running app — don't assume. When a bug turns up while testing, log it in [`bugs.md`](./bugs.md) rather than silently patching and moving on, so there's a record.

Legend: `[ ]` not yet run · `[x]` passes

---

## Phase 1 — App Shell

**F-01 — Cosmetic first-run login**
- [ ] Fresh install (empty `brainy.db`) shows the login screen
- [ ] Submitting a name creates a profile and lands on Boards List
- [ ] Relaunching the app after a profile exists skips straight to Boards List
- [ ] Submit is blocked on an empty name field

**F-02 — Navbar + profile dropdown**
- [ ] Avatar/initials render correctly for a 1-word and a multi-word name
- [ ] Dropdown shows Settings, shortcuts reference, About, Sign Out
- [ ] Sign Out returns to login screen without deleting the stored profile
- [ ] Navbar is present and consistent on both Boards List and Canvas views

**F-11 — Settings: provider API keys (storage)**
- [ ] Saving a Claude API key persists it (visible again after app restart, masked)
- [ ] Clearing a key reverts the provider to "not configured"
- [ ] An obviously malformed key (e.g. empty string, wrong prefix) is rejected at save time

**F-21 — Brand/Voice Profile (editor)**
- [ ] Profile content saves and reloads correctly after a restart

**F-25 — Cross-cutting error handling / logging / double-submit (initial pass)**
- [ ] Stop the backend process while the frontend is open — confirm a clear "can't reach backend" message, not a hang or a silent failure
- [ ] Double-click "Save" in Settings rapidly — confirm only one write happens
- [ ] Check that a deliberately forced backend error actually appears in the backend's log file

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
