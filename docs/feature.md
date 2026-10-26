# Feature Spec — Brainy (brainy.ai)

> **What this file is:** the detailed, feature-by-feature spec — one entry per feature, each with its actual **User Flows (Level 2)**: the branches, edge cases, and error states beneath the Task Flow it belongs to. This is where the Level-2 detail that `prd.md` promises (§3–4) actually lives.
>
> **How this file relates to the others:** every feature below is tagged with the **Task Flow** it belongs to (`TF-##`, defined in [`prd.md`](./prd.md) §4), using this project's flow-hierarchy convention — **Task Flow = Level 1, User Flow = Level 2** (`rules-decisions.md` ADR-0038; this is the reverse of common industry usage, intentionally). Each entry also links to the relevant architecture section and ADR(s). [`implementation_plan.md`](./implementation_plan.md) turns every feature here into checkable build tasks — if a flow listed here isn't yet reflected as a checkbox there, add it rather than letting the two drift apart.
>
> **Tier labels** (Must/Should/Could/Excluded) match `prd.md` §5 exactly — this file doesn't re-decide scope, it just details it.

---

## Must-have features

### F-01 — Cosmetic first-run login
**Task Flow:** TF-01 (`prd.md` §4) · **Tier:** Must-have · **Phase:** 1
**What it does:** A one-time name-entry screen that generates a persistent local profile, purely for the "complete app" feel — no real authentication.

**User flows (Level 2):**
- **Happy path:** First launch → login screen shown → user types a name → submits → avatar auto-generated from initials → profile written to `users` table → lands on Boards List.
- **Returning user:** Any launch after a profile exists → login screen is skipped entirely → straight to Boards List with the persisted name/avatar shown in the navbar.
- **Empty name submitted:** Submit is disabled/blocked until at least one character is entered — no empty-string profile.
- **Name changed later:** Handled through Settings (see F-11), not through this first-run screen again — this screen only ever fires once per fresh install.

**References:** `architecture.md` §8 Phase 1 · ADR-0032

---

### F-02 — Persistent navbar + profile dropdown
**Task Flow:** TF-01 (`prd.md` §4) · **Tier:** Must-have · **Phase:** 1
**What it does:** A navbar present on both the Boards List and the Canvas view, showing the profile avatar with a dropdown.

**User flows (Level 2):**
- **Happy path:** Click avatar → dropdown opens → shows Settings, keyboard-shortcuts reference, About/version info, Sign Out.
- **Sign Out (cosmetic):** Clicking it returns to the login screen but does **not** delete the stored profile row — the next "login" just re-confirms the same name/avatar (no real session invalidation exists to perform).
- **Dropdown dismiss:** Click outside or press Escape closes it without side effects.

**References:** `architecture.md` §8 Phase 1 · ADR-0032

---

### F-03 — Boards List (create, rename, open)
**Task Flow:** TF-02 (`prd.md` §4) · **Tier:** Must-have · **Phase:** 2
**What it does:** The home screen listing all of a user's Brainboards.

**User flows (Level 2):**
- **Happy path — create:** Click "New board" → a `boards` row is created immediately (no blank "untitled" limbo state waiting on a modal) → navigates straight into the new, empty canvas.
- **Rename:** Inline rename on the board card/list row → writes to `boards.title` → reflected immediately in the navbar when that board is open.
- **Open:** Click a board card → navigates to `/brainboards/[id]` and loads its nodes/edges.
- **Empty state:** Zero boards exist yet → Boards List shows an empty-state prompt rather than a blank grid.

**References:** `architecture.md` §5.3 (`boards` table) · ADR-0020, ADR-0021

---

### F-04 — Folders (organize boards)
**Task Flow:** TF-02 (`prd.md` §4) · **Tier:** Must-have · **Phase:** 2
**What it does:** Optional grouping of boards into folders within the Boards List.

**User flows (Level 2):**
- **Happy path:** Create a folder → drag a board into it (or assign via a menu) → `boards.folder_id` set.
- **Move out:** Remove a board from a folder → `folder_id` cleared → board reappears at the top level.
- **Delete a folder with boards inside:** Boards inside are **not** deleted — they're un-filed back to the top level, only the folder row itself is removed. (Flagged here explicitly since it's the kind of edge case easy to get destructively wrong.)
- **Nested folders:** Not required for MVP — `folders.parent_folder_id` exists in the schema for future nesting but a flat folder list is sufficient to ship.

**References:** `architecture.md` §5.3 (`folders` table)

---

### F-05 — Soft-delete / Trash
**Task Flow:** TF-02 (`prd.md` §4) · **Tier:** Must-have · **Phase:** 2
**What it does:** Deleting a board moves it to a Trash view rather than destroying it immediately.

**User flows (Level 2):**
- **Happy path — delete:** Delete a board from the Boards List → `deleted_at` is set → board disappears from the main list, appears in Trash.
- **Restore:** From Trash, restore a board → `deleted_at` cleared → reappears in its original folder (or top level).
- **Permanent delete:** From Trash, permanently delete → hard-deletes the `boards` row and cascades to its `nodes`, `edges`, and `chat_messages`.
- **Trash is empty:** Shows an empty-state message, not an error.

**References:** `architecture.md` §5.2–5.3 · ADR-0020 (`deleted_at` convention)

---

### F-06 — Infinite canvas: pan, zoom, select
**Task Flow:** TF-03 (`prd.md` §4) · **Tier:** Must-have · **Phase:** 2
**What it does:** The base canvas interaction model, via React Flow.

**User flows (Level 2):**
- **Happy path:** Scroll/trackpad-pinch to zoom, click-drag empty canvas to pan, click a node to select it, shift-click or marquee-drag to multi-select.
- **Deselect:** Click empty canvas → clears selection.
- **Zoom limits:** Minimum/maximum zoom bounds prevent zooming into unusable extremes (exact bounds are an implementation detail, not a product decision — pick sane React Flow defaults unless it feels wrong in practice).

**References:** `architecture.md` §3.3 · ADR-0011

---

### F-07 — Grouping and duplication
**Task Flow:** TF-03 (`prd.md` §4) · **Tier:** Must-have · **Phase:** 3
**What it does:** Multi-select nodes into a group; duplicate a node, a group, or an entire board.

**User flows (Level 2):**
- **Group:** Multi-select nodes → group action → nodes become one movable/selectable unit.
- **Ungroup:** Reverse action restores individual node selection without altering node content or positions relative to each other.
- **Duplicate a single node:** Creates a new node with copied content, offset slightly in position so it doesn't sit exactly on top of the original.
- **Duplicate a group:** All member nodes are duplicated together, **and their edges to each other are preserved** in the duplicate; edges to nodes **outside** the duplicated group are **not** carried over (duplicating a group shouldn't silently wire the copy into the original's external context).
- **Duplicate a board:** Creates an entirely new `boards` row with copies of all its nodes/edges — the duplicate is fully independent (editing one never affects the other).

**References:** `architecture.md` §3.3 · ADR-0011

---

### F-08 — Board autosave
**Task Flow:** TF-03 (`prd.md` §4) · **Tier:** Must-have · **Phase:** 2
**What it does:** Continuous persistence of canvas state with no explicit "Save" action anywhere in the UI.

**User flows (Level 2):**
- **Happy path:** Any change (move a node, edit text, add a connection) debounce-writes to SQLite shortly after the change settles — not on every keystroke/pixel of drag.
- **Hard refresh mid-edit:** Reopening the board shows the last successfully-written state. A user should never lose more than a few seconds of work, but this is **not** a guarantee of zero data loss on every possible crash — just the practical bar for a local single-user tool.
- **Rapid back-to-back edits:** Debouncing must not drop an edit entirely (e.g. type, immediately drag — both must land), even though they may be written in separate autosave passes.

**References:** `architecture.md` §3.2 (board store) · ADR-0012

---

### F-09 — Text / note nodes
**Task Flow:** TF-04 (`prd.md` §4) · **Tier:** Must-have · **Phase:** 2
**What it does:** A freeform text node for raw notes/ideas.

**User flows (Level 2):**
- **Happy path:** Add a text node → click to edit inline → content persists via F-08's autosave.
- **Empty text node:** Allowed to exist (a user may place one before deciding what to write) — not auto-deleted just for being blank.
- **Delete:** Removing a text node that has edges connected to it also removes those edges (no orphaned edges pointing at a deleted node).

**References:** `architecture.md` §5.3 (`nodes` table, `data` JSON shape for `type: "text"`)

---

### F-10 — Video link nodes (YouTube / Instagram)
**Task Flow:** TF-05 (`prd.md` §4) · **Tier:** Must-have · **Phase:** 5
**What it does:** Paste a link, get a thumbnail-only card — no in-app playback.

**User flows (Level 2):**
- **Happy path — YouTube:** Paste a valid YouTube URL → node fetches title + thumbnail → renders as a card with a click-through link to the real video.
- **Happy path — Instagram:** Same shape, via whatever public metadata Instagram exposes for a given link (confirmed earlier in scoping: no automated *outlier browsing* for Instagram, but a pasted link resolving to a thumbnail card is in scope).
- **Invalid link pasted:** Node shows a clear error state ("couldn't load this link") rather than a broken/blank card, and does not crash the canvas.
- **Private/removed video:** Same error-state treatment as an invalid link — the node can't distinguish *why* a link failed from the outside, and doesn't need to.
- **Metadata fetch is slow:** Node shows a loading state (skeleton/spinner) rather than appearing broken while the fetch is in flight.

**References:** `architecture.md` §4.4 · ADR-0044

---

### F-11 — Settings: provider API keys
**Task Flow:** TF-07, TF-11 (`prd.md` §4) · **Tier:** Must-have · **Phase:** 1 (storage) / 4 (actually consumed)
**What it does:** Where Claude/OpenAI/Gemini API keys are entered and stored.

**User flows (Level 2):**
- **Happy path:** Open Settings → enter a Claude API key → save → key is written to `provider_credentials` → the Claude chat node type becomes selectable in the tools panel.
- **Clear a key:** Remove a saved key → provider reverts to disabled/greyed-out in the tools panel; any chat nodes already on a board using that provider should show a "provider no longer configured" state rather than silently failing.
- **Invalid key format:** Basic format validation (not a live API call) prevents obviously malformed keys from being saved as if correct — a true "is this key valid" check only happens on actual use (F-13), not at save time, to avoid an unnecessary network call just for saving a setting.
- **OpenAI / Gemini keys (MVP):** Fields exist and save correctly even though their node types aren't required to function in MVP (ADR-0043) — saving a key for a not-yet-wired provider shouldn't error, it just has no effect yet.

**References:** `architecture.md` §4.2, §6 · ADR-0018, ADR-0033

---

### F-12 — Chat node placement, per-node execution mode, and per-node model selection
**Task Flow:** TF-07 (`prd.md` §4) · **Tier:** Must-have · **Phase:** 4
**What it does:** Placing a provider-specific chat node and choosing how it runs — and, independently, which specific model within that provider it uses.

**User flows (Level 2):**
- **Happy path:** Tools panel shows Claude/OpenAI/Gemini chat node types → unconfigured ones are greyed out (per F-11) → place an enabled one on the canvas.
- **Per-node mode choice:** Each placed chat node independently selects Local LLM / Native API / Manual Input — changing one node's mode never affects any other node's mode, even on the same board.
- **Per-node model choice:** Independently of execution mode, each chat node picks a specific model from its provider's model list (e.g. a cheap/fast Claude model for a quick summary node, a stronger one for heavy synthesis) — this is a node-level setting, not board-wide, so one board can mix cheap and strong models side by side (ADR-0052). A sane default model is pre-selected so placing a node never requires a choice before it's usable.
- **MVP mode scope:** Only **Native API** is required to actually function at launch; Local LLM and Manual Input are visually selectable but may be inert until Phase 6 (ADR-0019, `architecture.md` §4.2) — selecting an inert mode should say so plainly, not silently do nothing.

**References:** `architecture.md` §4.2 · ADR-0018, ADR-0019, ADR-0052

---

### F-13 — Chat synthesis (streamed response from connected nodes)
**Task Flow:** TF-08 (`prd.md` §4) · **Tier:** Must-have · **Phase:** 4 (text context) / 5 (+ video context)
**What it does:** The actual core loop — a chat node reads whatever's connected to it and generates a response.

**User flows (Level 2):**
- **Happy path:** Connect one or more nodes to a chat node → type a prompt → send → response streams in token-by-token via SSE → saved to `chat_messages`.
- **No nodes connected:** Chat node still works as a plain chat (no connected-context), rather than refusing to send.
- **A connected video node's content isn't extracted yet:** First reference to it triggers lazy extraction (F-14) transparently, with a visible in-progress state in the chat node, before the prompt is actually sent to the provider.
- **Provider call fails (network error, bad key, rate limit):** Chat node shows a clear error/stuck state (ADR-0045) distinguishing "something went wrong, try again" from a silent hang — the user should never just see an endless loading spinner with no recourse.
- **Per-node "notes for AI" set:** That node's free-text instruction is included in context assembly alongside its content, not as a replacement for it.
- **Brand/Voice Profile attached:** Included in context assembly when the user has opted a given chat node into using it (not applied globally/invisibly to every chat node by default).

**References:** `architecture.md` §4.3, §4.5 · ADR-0014, ADR-0019, ADR-0039

---

### F-14 — Lazy video transcript extraction
**Task Flow:** TF-05, TF-08 (`prd.md` §4) · **Tier:** Must-have · **Phase:** 5
**What it does:** The yt-dlp → ffmpeg → Whisper pipeline, run only on demand and cached.

**User flows (Level 2):**
- **Happy path — first use:** A chat node needs a connected video node's content for the first time → backend checks `extraction_cache` (miss) → runs the full pipeline → writes the result to cache → uses it immediately.
- **Happy path — repeat use:** Same source URL requested again (same or a different chat node on the same or another board) → cache hit → no pipeline run, instant use.
- **Extraction fails (private video, deleted video, unsupported platform quirk):** Chat node shows a clear "couldn't extract this video's content" state and the conversation can continue without that node's deep content rather than blocking entirely.
- **Extraction is slow:** Visible in-progress state (not a frozen UI) — this is precisely the scenario the separate-backend-process architecture decision (ADR-0013) exists to keep from freezing anything else.

**References:** `architecture.md` §4.4 · ADR-0013, ADR-0044

---

### F-25 — Cross-cutting error handling, logging, and double-submit protection
**Task Flow:** — (cross-cutting, applies across TF-07, TF-08, TF-02, TF-11) · **Tier:** Must-have · **Phase:** introduced progressively from Phase 1 onward, formalized by Phase 4
**What it does:** The conventions in `architecture.md` §11, made concrete. Not a single screen — a set of behaviors every async/mutating action follows.

**User flows (Level 2):**
- **Backend crashes or isn't running:** Frontend shows "Can't reach Brainy's backend — is it running?" rather than treating it as a provider failure or hanging silently.
- **A provider call fails:** User sees a plain, specific message ("Couldn't reach Claude — check your API key in Settings"), never a raw stack trace; the real exception detail is written to the backend's local log file.
- **Double-click "Send" on a chat prompt:** Second click while the first is still in flight is a no-op (button disabled during the request) — specifically important because a Native-API chat send costs real money per request (ADR-0004); a double-send is a cost bug, not just a glitch.
- **Double-click "Create board" or "Save" in Settings:** Same disable-during-request pattern — prevents duplicate rows / redundant writes.
- **An operation hangs:** Any async action that can take a while (provider call, extraction, metadata fetch) has a reasonable timeout and surfaces a failure state rather than spinning forever.

**References:** `architecture.md` §6, §11 · ADR-0049

---

### F-26 — File/document nodes (PDF, DOCX, XLSX)
**Task Flow:** TF-12 (`prd.md` §4) · **Tier:** Must-have · **Phase:** 2 (node + storage) / 4 (context assembly)
**What it does:** Upload a local document (his knowledge-base docs, his analytics spreadsheet) onto the canvas, with its text/data content available to connected chat nodes — the same role F-10's video nodes play for video content, but for files.

**User flows (Level 2):**
- **Happy path — PDF/DOCX/XLSX:** Drag a file onto the canvas or use a file picker → node renders with filename, a file-type icon, and a short preview snippet → text (PDF/DOCX) or a flattened tabular summary (XLSX) is extracted in the background, keyed by content hash in `extraction_cache` (the same table F-14 uses, generalized to key on a file hash instead of a source URL — no schema change) → once extracted, a connected chat node can use it as context exactly like a text node's content.
- **Happy path — image file:** Accepted as a file node, but shown as a plain visual reference only — no text extraction, no OCR in MVP. An optional manual "notes" field (same pattern as F-16) lets the user type what the image shows if they want that available as AI context.
- **Click-through:** Clicking the node opens/downloads the original file — the node is a reference to it, not a replacement for it.
- **Unsupported file type:** Clear "this file type isn't supported yet" state rather than a silently broken node.
- **Extraction fails (corrupt file, password-protected, unreadable table):** Same error-state treatment as F-14's extraction failure — the node stays on the board, the chat node can continue without that file's content rather than blocking entirely.
- **Re-uploading the same file content:** Cache hit on content hash — no re-parsing, consistent with F-14's caching behavior.

**References:** `architecture.md` §4.3, §5.3 · ADR-0051, ADR-0053

---

### F-27 — Generic link/reference nodes
**Task Flow:** TF-13 (`prd.md` §4) · **Tier:** Must-have · **Phase:** 2 (node + storage) / 4 (context assembly)
**What it does:** Paste any non-video URL (a LinkedIn post, an article, any other reference) onto the canvas — the generalized version of F-10 for everything that isn't YouTube/Instagram.

**User flows (Level 2):**
- **Happy path:** Paste a URL → node renders with the raw URL and an editable title (no automated metadata fetch — this is deliberate, see below) → an optional free-text area lets the user manually paste the page's actual content (e.g. the LinkedIn post text) if they want it available as AI context.
- **No automated scraping, by design:** Unlike F-10's YouTube/Instagram metadata fetch, this node never attempts to scrape the target page — confirmed earlier in scoping that automated LinkedIn (and most non-YouTube platform) scraping is infeasible. The node is honestly a manual reference, not a disguised scraper.
- **Empty notes:** A link with no manually-pasted content is still a valid node (just the URL/title) — omitted entirely from context assembly rather than sent as empty content, same convention as F-16.
- **Click-through:** Clicking the node opens the original URL in a new tab.

**References:** `architecture.md` §4.3 · ADR-0053

---

## Should-have features

### F-15 — Outliers research panel
**Task Flow:** TF-09 (`prd.md` §4) · **Tier:** Should-have · **Phase:** 6
**What it does:** Search a YouTube channel and browse Latest / Popular / Outliers, with quick-add to the board.

**User flows (Level 2):**
- **Happy path:** Search a channel → results populate → toggle between Latest/Popular/Outliers → each outlier shows a multiplier badge against the channel's baseline → click "quick add" → a video link node (F-10) is created on the current board.
- **Channel not found / no public data:** Clear empty/error state, not a silent empty list indistinguishable from "this channel really has zero outliers."
- **Reference methodology:** Outlier-multiplier framing follows the 1of10.com reference model agreed during scoping (ADR-0005) — not a bespoke scoring method invented independently.

**References:** ADR-0005, ADR-0045

---

### F-16 — Per-node "notes for AI" field
**Task Flow:** TF-08 (`prd.md` §4) · **Tier:** Should-have · **Phase:** 4
**What it does:** A free-text field on an individual content node, separate from the chat prompt itself, giving the AI node-specific instruction ("focus on the pacing of the hook in this video," etc.).

**User flows (Level 2):**
- **Happy path:** Open a node's notes field → type an instruction → it's included whenever that node is used as context for any connected chat node.
- **Empty notes:** No effect on context assembly — omitted entirely rather than sent as an empty instruction.
- **Edited mid-conversation:** The *next* message sent picks up the updated notes; it does not retroactively alter already-sent/streamed messages in `chat_messages`.

**References:** `architecture.md` §4.3 · ADR-0045

---

### F-17 — Mindmap output node
**Task Flow:** TF-10 (`prd.md` §4) · **Tier:** Should-have · **Phase:** 6
**What it does:** Generates a Mindmap as its own visual node type from a chat response or a selection of connected nodes.

**User flows (Level 2):**
- **Happy path:** From a chat node's response, trigger "Generate mindmap" → a new mindmap-type node is created on the canvas, structured from that response's content.
- **Regenerate:** Running it again creates a **new** mindmap node rather than silently overwriting a previous one the user may have already edited/moved.
- **Malformed/unstructured response:** If the source content doesn't meaningfully break into a mindmap shape, the feature should say so rather than producing a mindmap with one meaningless node.

**References:** ADR-0045

---

### F-18 — Live mic voice input
**Task Flow:** TF-08 (`prd.md` §4) · **Tier:** Should-have · **Phase:** 6
**What it does:** Speak a prompt into a chat node instead of typing it — live microphone input, not just uploading a pre-recorded audio file.

**User flows (Level 2):**
- **Happy path:** Click mic icon on a chat node's input → speak → transcribed text populates the prompt field → review/edit before sending (not auto-sent the instant speech stops, to avoid sending a half-finished thought).
- **Mic permission denied:** Clear message explaining the feature needs microphone access, with no other part of the app degraded.
- **No speech detected:** Times out gracefully rather than hanging in a "listening" state forever.

**References:** ADR-0045

---

### F-19 — Multi-select + copy/duplicate across blocks/groups/boards
**Task Flow:** TF-03 (`prd.md` §4) · **Tier:** Should-have · **Phase:** 3
**What it does:** The fuller version of F-07's duplication — explicit copy/paste (not just an in-place duplicate action), validated as a real Poppy.ai pattern during the feature deep dive.
**User flows (Level 2):** Copy a selection (keyboard shortcut or menu action) → paste either on the same board or a different one → pasted nodes get new IDs/UUIDs (never collide with the originals) → internal edges between copied nodes are preserved, exactly as in F-07's duplicate behavior, just via a copy/paste verb instead of a single "duplicate" action.
**References:** ADR-0045 (validated via Poppy.ai deep dive)

---

### F-20 — Chat-stuck / chat-error feedback states
**Task Flow:** TF-08 (`prd.md` §4) · **Tier:** Should-have · **Phase:** 4
**What it does:** Documented, deliberate UI states for when a chat node's generation is slow, stuck, or has failed — distinct from F-13's basic error handling in that this formalizes the *pattern* (validated as a real, documented Poppy.ai pattern) rather than a one-off error message.
**User flows (Level 2):** A generation taking unusually long shows a distinct "this is taking a while" state before a hard failure state; a hard failure offers a retry action that re-sends the same prompt/context rather than making the user reconstruct it.
**References:** ADR-0045

---

### F-21 — Local Brand/Voice Profile
**Task Flow:** TF-08, TF-11 (`prd.md` §4) · **Tier:** Should-have · **Phase:** 1 (storage/editor) / 4 (consumption)
**What it does:** A local, Brainy-native substitute for live claude.ai Projects integration (which isn't API-accessible — ADR-0039) — a Settings-editable text profile a chat node can optionally pull in as extra context.
**User flows (Level 2):** Edit/save profile content in Settings (F-11 area) → on any chat node, opt in to "use Brand/Voice Profile" → its content is included in context assembly (F-13) → opting out on a specific node excludes it from that node only, not globally.
**References:** `architecture.md` §4.3 · ADR-0039

---

### F-29 — Estimated Native API cost tracking
**Task Flow:** TF-11 (`prd.md` §4) · **Tier:** Should-have · **Phase:** 4
**What it does:** A lightweight, estimated running count of spend from Native API chat calls, visible in Settings — not a billing-grade system, just enough visibility to know when you've left Brainy's $0-by-default baseline (ADR-0004).

**User flows (Level 2):**
- **Happy path:** Every Native API chat response records its token usage against `chat_messages` → Settings shows a running estimated total (tokens × the provider's published per-token rate), broken down per provider.
- **Local LLM / Manual Input messages:** Never counted — cost tracking only applies to Native API mode, since the other two modes have no metered cost to track.
- **Numbers are estimates, stated as such:** The UI is explicit that this is an estimate from token counts and published rates, not a reconciled bill from the provider — avoids implying a precision Brainy can't actually guarantee.
- **Reset/clear:** Not required for MVP — a simple running total since the app was installed is sufficient; a reset control can be a post-MVP nicety if it turns out to matter in practice.

**References:** `architecture.md` §4.2, §5.3 · ADR-0004, ADR-0052

---

## Could-have features

### F-22 — OpenAI and Gemini chat nodes, fully enabled
**Task Flow:** TF-07 (`prd.md` §4) · **Tier:** Could-have · **Phase:** 6
**What it does:** Takes the OpenAI/Gemini adapter stubs (present architecturally since Phase 0/4 per ADR-0018) and makes them fully functional, identically to the Claude node.
**User flows (Level 2):** Same shape as F-11–F-13, just for the other two providers — no new interaction pattern, purely enabling what was already reserved.
**References:** `architecture.md` §4.2 · ADR-0018

---

### F-23 — Figma MCP-assisted UI polish pass
**Task Flow:** — (not a user-facing flow; a build-process feature) · **Tier:** Could-have · **Phase:** post-MVP
**What it does:** Using Figma MCP to explore UI polish, feeding back into Istiyak's existing Figma-to-code pipeline.
**References:** ADR-0036

---

### F-24 — "Push to Notion" export
**Task Flow:** — (downstream export, not a core Brainy flow) · **Tier:** Could-have · **Phase:** post-MVP
**What it does:** Exporting a Brainboard's output (ideas/scripts/shot lists) to Notion via Notion MCP.
**References:** ADR-0037

---

## Explicitly excluded (do not build, even as Could-have)

- **AI-generated Presentation/slideshow output** — excluded outright, not deferred. (ADR-0046)
- **Any multiplayer/collaboration feature** — permanently out of scope. (ADR-0001)
- **Dark mode** — not scoped for MVP; a future theme could be added later without being "built in" now. (ADR-0027)
- **Real authentication/accounts** — the login (F-01) is permanently cosmetic. (ADR-0032)

---

## Feature → Phase index

| Phase | Features shipping |
|---|---|
| 1 | F-01, F-02, F-11 (storage only), F-21 (storage/editor only), F-25 (introduced progressively) |
| 2 | F-03, F-04, F-05, F-06, F-08, F-09, F-26 (node + storage), F-27 (node + storage) |
| 3 | F-07, F-19 |
| 4 | F-11 (consumption), F-12 (incl. model selection), F-13 (text + file + link context), F-16, F-20, F-21 (consumption), F-26 (context assembly), F-27 (context assembly), F-29 |
| 5 | F-10, F-13 (+ video context), F-14 |
| 6 | F-15, F-17, F-18, F-22 |
| post-MVP | F-23, F-24 |

This table should stay in sync with `prd.md` §6 and `implementation_plan.md` — if a feature moves phases, update both.
