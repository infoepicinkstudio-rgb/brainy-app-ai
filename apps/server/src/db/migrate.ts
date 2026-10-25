// Applies every pending migration in ./drizzle to brainy.db. Run via `npm run db:migrate`
// (workspace: apps/server) — this is what a fresh clone runs to get an empty, correctly
// shaped database (architecture.md §5.3, ADR-0022).

import { migrate } from "drizzle-orm/libsql/migrator";
import { db } from "./client.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

migrate(db, { migrationsFolder: path.resolve(__dirname, "../../drizzle") });

console.log("Migrations applied — brainy.db is up to date.");
