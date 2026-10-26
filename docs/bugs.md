# Bugs — Brainy (brainy.ai)

> **What this file is:** a running error log. When something breaks — in testing (`testing.md`) or in real use — log it here *before* fixing it, so there's a record of what actually went wrong and why, not just the final patched state.
>
> **Why this exists:** when an AI coding session hits a bug, diagnosing from a clear symptom + console error + affected files is far more reliable than guessing from the code alone. This file is also where to look first if something that used to work seems broken again — check whether it's a regression of something already logged.

**How to log a bug:**
1. Copy the template below into a new entry.
2. Fill in **Symptom**, **Console/error output** (verbatim, not paraphrased), and **Files involved** *before* attempting a fix — diagnosis first, patch second.
3. Once fixed, fill in **Root cause** and **Fix**, and move the entry to the "Resolved" section below (don't delete it — a resolved bug is still useful history).

---

## Template

```
### BUG-### — <short title>
**Date:** YYYY-MM-DD
**Status:** Open | In progress | Resolved
**Feature/Task Flow:** (e.g. F-13 / TF-08)
**Symptom:** what the user sees/experiences
**Console/error output:**
```
<paste verbatim>
```
**Files involved:** <paths, once known>
**Root cause:** <once diagnosed>
**Fix:** <what actually changed>
```

---

## Open

*(none currently open)*

---

## Resolved

### BUG-001 — `drizzle-kit generate`'s SQLite table-rebuild migration selected a column that didn't exist yet
**Date:** 2026-10-26
**Status:** Resolved
**Feature/Task Flow:** TF-11 (Settings — provider execution mode)
**Symptom:** `npm run db:migrate -w apps/server` crashed on a fresh database with `SQLITE_ERROR: no such column: execution_mode`.
**Console/error output:**
```
LibsqlBatchError: SQLITE_ERROR: SQLITE_ERROR: no such column: execution_mode
    at Sqlite3Client.migrate ...
```
**Files involved:** `apps/server/drizzle/0001_colorful_mandrill.sql` (generated), `apps/server/src/db/schema.ts`
**Root cause:** Adding `execution_mode` to `provider_credentials` forced SQLite's table-rebuild migration pattern (SQLite can't add a `NOT NULL ... DEFAULT` column plus a `UNIQUE` constraint via plain `ALTER TABLE`, so drizzle-kit creates `__new_provider_credentials`, copies rows across, drops the old table, renames the new one). `drizzle-kit generate` wrote the copy step's `INSERT ... SELECT` listing `execution_mode` as one of the columns to read *from the old table* — but the old table (migration 0000) never had that column, since it's the one being added. A drizzle-kit generation bug, not a hand-authoring mistake.
**Fix:** Hand-edited the generated `0001_colorful_mandrill.sql` to drop `execution_mode` from the `SELECT ... FROM provider_credentials` column list (and the matching `INSERT INTO` column list), so migrated rows take the new column's `DEFAULT 'native'` instead of trying to read a column that doesn't exist yet. Verified: `npm run db:migrate` now runs clean on a fresh database. Worth a quick glance at any future generated migration that both adds a column and triggers SQLite's rebuild pattern — the same bug could recur.

### BUG-002 — App-load gate hung forever on a loading spinner when the backend wasn't running
**Date:** 2026-10-26
**Status:** Resolved
**Feature/Task Flow:** TF-01 (app-load gate)
**Symptom:** `StoreHydrator` calls `loadProfile()` with no `.catch()`. If `apps/server` isn't running (or crashes) when the frontend loads, the underlying `fetch()` rejects, the promise goes unhandled, `profileLoaded` never flips to `true`, and `AppGate` stays on its `aria-busy` loading `<main>` forever — no message, no way out, matching none of `architecture.md` §6's "backend unreachable is its own distinct error state" intent for the one screen that actually needs it most (every other action's error already said to check the server was running; this path, the first thing a user sees, didn't).
**Console/error output:**
```
Uncaught (in promise) TypeError: fetch failed
```
**Files involved:** `apps/web/components/layout/store-hydrator.tsx`, `apps/web/stores/settings-store.ts`, `apps/web/app/page.tsx`
**Root cause:** `loadProfile` had no error handling at all — it assumed the `fetch` would succeed or the caller would catch it, but its only caller (`StoreHydrator`'s `useEffect`) did neither.
**Fix:** Added `profileLoadError: string | null` to the settings store; `loadProfile` now catches the failure and sets a clear message ("Can't reach the Brainy.ai backend. Check that the server is running.") instead of throwing; added a `retryLoadProfile` action; `AppGate` (`apps/web/app/page.tsx`) now renders that message with a "Try again" button instead of the indefinite spinner when `profileLoadError` is set. Verified: `fetch()` against a dead port rejects as expected (confirmed directly in Node), so the catch path is reachable; full visual confirmation of the rendered error screen in a browser was not possible in this environment and is left for Istiyak to eyeball.

### BUG-003 — Canvas rendered completely blank (React Flow: "parent container needs a width and a height")
**Date:** 2026-10-26
**Status:** Resolved
**Feature/Task Flow:** TF-03 (Canvas navigation)
**Symptom:** Opening a board showed an empty page — no canvas, no dot-grid, no nodes, no error. The browser console logged React Flow's own warning.
**Console/error output:**
```
[React Flow]: The parent container needs a width and a height to render the graph.
```
**Files involved:** `apps/web/app/layout.tsx`, `apps/web/app/brainboards/[id]/page.tsx`
**Root cause:** `<body>` used `min-h-full` (a floor on height) instead of `h-full` (a bound). `min-h-full` doesn't reliably propagate a *definite* height down through nested `flex-1` containers the way a true `height`-bound ancestor chain does, so React Flow's root element ended up with no resolvable height at all — not "too small," genuinely indeterminate.
**Fix:** Changed `<body>` from `className="flex min-h-full flex-col"` to `className="flex h-full flex-col"` in `apps/web/app/layout.tsx`. Verified: the console warning disappeared entirely, and a direct DOM inspection of a node's bounding rect went from off-screen/zero-size to a correct, fully-in-viewport rect.

### BUG-004 — Text/file/link node content did not survive a page refresh (autosave silently corrupted)
**Date:** 2026-10-26
**Status:** Resolved
**Feature/Task Flow:** TF-03/TF-04 (Autosave)
**Symptom:** Typing into a text node, waiting for autosave, then refreshing the page showed the node reverted to its original (often empty) content instead of what was typed.
**Console/error output:** none — failed silently, no thrown error on either client or server.
**Files involved:** `apps/server/src/routes/nodes.ts`, `apps/server/src/db/schema.ts` (the `nodes.data` column, declared `text(column, { mode: "json" })`)
**Root cause:** Drizzle's `{ mode: "json" }` column type already auto-serializes a JS value to a JSON string on write and auto-parses it back to an object on read. Both the POST and PATCH routes in `nodes.ts` were *also* calling `JSON.stringify(data)` before handing it to Drizzle — double-encoding the value. A read then came back as a plain string (the once-stringified JSON) instead of the intended object, which the frontend's node components couldn't render as real content.
**Fix:** Removed the manual `JSON.stringify()` call in both the POST route (`data: data === undefined ? {} : data`) and the PATCH route (`if (data !== undefined) patch.data = data;`), letting Drizzle do the serialization once, as designed. Verified via a direct curl round-trip (write a node, then re-fetch it) showing the content correctly preserved as a real object, and via the full Playwright regression's dedicated autosave-survives-hard-refresh check.

### BUG-005 — Every PATCH/PUT/DELETE request from the browser silently failed (CORS) — affects Phase 1 features too, not just Phase 2
**Date:** 2026-10-26
**Status:** Resolved
**Feature/Task Flow:** Cross-cutting (TF-02 trash/restore/rename, TF-03 autosave/position-save, and retroactively Phase 1's provider-key and brand-profile saves)
**Symptom:** Node autosave, drag-to-reposition saving, board rename, moving a board into a folder, and (found only once this was traced back) Phase 1's Settings provider-key/branding saves all appeared to silently do nothing when exercised through the actual browser UI — no visible error, the request simply never reached the server as far as the UI could tell. curl-based testing of the same endpoints worked fine, which is why this went undetected through all of Phase 1.
**Console/error output:**
```
Access to fetch at 'http://localhost:4000/api/...' from origin 'http://localhost:3000' has been blocked by CORS policy: Method ... is not allowed by Access-Control-Allow-Methods.
```
(confirmed directly via `curl -i -X OPTIONS` showing `access-control-allow-methods: GET,HEAD,POST` only)
**Files involved:** `apps/server/src/index.ts`
**Root cause:** `@fastify/cors` v11's actual default `methods` option is `'GET,HEAD,POST'` only — PUT/PATCH/DELETE are not included unless explicitly listed. The CORS plugin was registered with only `{ origin: FRONTEND_ORIGIN }`, no `methods` option, so every PATCH/PUT/DELETE request from the real browser failed CORS preflight before ever reaching a route handler. curl bypasses CORS entirely (it's a browser-enforced policy), so every curl-based verification this session and in Phase 1 passed while the real app silently didn't work.
**Fix:** Added an explicit `methods: ["GET", "POST", "PUT", "PATCH", "DELETE"]` to the `cors` plugin registration in `apps/server/src/index.ts`. Verified: the full Playwright regression (which drives the real browser, not curl) now passes autosave, position-save, rename, and folder-move end-to-end. This is the single highest-impact fix of Phase 2 — worth Istiyak specifically re-testing Phase 1's Settings save buttons by hand, since they were silently broken in the real app this whole time despite passing every curl-based check.

### BUG-006 — Trash/Restore/permanent-delete actions silently did nothing (unhandled promise rejection on a bodyless request)
**Date:** 2026-10-26
**Status:** Resolved
**Feature/Task Flow:** TF-02 (Boards List — Trash)
**Symptom:** Clicking "Move to Trash" (or Restore) appeared to do nothing — no error shown, board stayed in place.
**Console/error output:**
```
FST_ERR_CTP_EMPTY_JSON_BODY: Body cannot be empty when content-type is set to 'application/json'
```
(surfaced client-side as an uncaught/unhandled promise rejection, since the calling code had no try/catch)
**Files involved:** `apps/web/lib/api.ts`
**Root cause:** The shared `api.post()`/`api.delete()` wrapper always sent `Content-Type: application/json`, even for calls with no body (trash/restore/delete all send no body). Fastify's body parser rejects a request that declares a JSON content type but has an empty body.
**Fix:** Made the `Content-Type: application/json` header conditional on `init?.body !== undefined` in `apps/web/lib/api.ts`'s `request()` function. Verified via the full Playwright regression — trash/restore/delete all now complete and update the UI.

### BUG-007 — Permanent-delete button never closed its confirm dialog or removed the board, despite the server-side delete succeeding
**Date:** 2026-10-26
**Status:** Resolved
**Feature/Task Flow:** TF-02 (Boards List — Trash, permanent delete)
**Symptom:** Confirming "Delete forever" on a trashed board deleted the row in the database (confirmed via direct inspection) but the dialog stayed open and the board stayed visible in the Trash list in the UI.
**Console/error output:**
```
SyntaxError: Unexpected end of JSON input
```
**Files involved:** `apps/web/lib/api.ts`
**Root cause:** Every hard-DELETE route in this API correctly returns `204 No Content` on success — an empty body, by design. The shared `request()` wrapper unconditionally called `response.json()` on every successful response, which throws on an empty body. The caller's follow-up code (closing the dialog, removing the board from local state) never ran because the exception happened first.
**Fix:** Added a short-circuit in `apps/web/lib/api.ts`'s `request()`: `if (response.status === 204) return undefined as T;` before the generic `.json()` call. Verified via the full Playwright regression — the dialog now closes and the board disappears immediately after a successful permanent delete.
