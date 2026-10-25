#!/usr/bin/env node
// Copies brainy.db to a timestamped backup file, next to it. Matches the restore
// procedure in docs/runbooks/restore-from-backup.md. Run via `npm run backup-db`.

import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const dbPath = path.join(repoRoot, "brainy.db");
const backupDir = path.join(repoRoot, "backups");

if (!existsSync(dbPath)) {
  console.error(`No brainy.db found at ${dbPath} — nothing to back up yet.`);
  process.exit(1);
}

if (!existsSync(backupDir)) {
  mkdirSync(backupDir, { recursive: true });
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = path.join(backupDir, `brainy-${stamp}.db`);

copyFileSync(dbPath, backupPath);
console.log(`Backed up brainy.db -> ${backupPath}`);
