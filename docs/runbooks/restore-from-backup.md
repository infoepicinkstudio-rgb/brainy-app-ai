# Runbook: Restore `brainy.db` from backup

**When to use this:** `brainy.db` is corrupted, a migration went wrong, or a board/file was deleted by mistake and you need to go back to a known-good copy.

**Related:** `docs/architecture.md` §10 (Backups), `tools/scripts/backup-db.mjs` (creates the backups this runbook restores).

## Steps

1. **Stop the app.** Close both the frontend and backend processes (`Ctrl+C` wherever `npm run dev` is running). Restoring while SQLite is open risks corrupting the restore itself.
2. **Locate your most recent backup.** Backups are created by `npm run backup-db` (see `tools/scripts/backup-db.mjs` once Phase 0 exists) and land wherever that script writes them — check its output location. Pick the most recent one from *before* the problem started, not necessarily the single newest file.
3. **Move the current (broken) `brainy.db` aside** rather than deleting it outright — rename it to something like `brainy.db.broken-<date>` in case you need to inspect it later or recover something from it that the backup doesn't have.
4. **Copy the chosen backup file to the real location**, named exactly `brainy.db`, in the same folder the app expects it (check `apps/server`'s DB config for the exact path once it exists).
5. **Restart the app.** Open a board you know existed in the backup and confirm its content is there and looks right — don't just confirm the app starts.
6. **If the restore worked**, you can delete the `brainy.db.broken-*` file once you're confident you don't need anything from it. If it didn't, go back to step 2 and try an older backup.

## Notes

- This is a full-database restore — there's no per-board or per-table granularity. Restoring brings back everything exactly as it was at backup time, including anything you did *not* want undone.
- If you don't have any backup at all, there's nothing this runbook can do — which is exactly why `docs/architecture.md` §10 asks for periodic manual backups until this is automated.
