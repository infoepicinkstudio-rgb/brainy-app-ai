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
