// SQLite connection + Drizzle client. brainy.db lives at the repo root, gitignored
// (never committed — see architecture.md §6, ADR-0033, ADR-0049).
//
// Uses @libsql/client rather than better-sqlite3 (ADR-0055): better-sqlite3 needs a
// native addon compiled via node-gyp on install, which can fail on a machine without a
// C++ build toolchain already set up — a real risk for a no-coder's machine. libsql
// ships platform prebuilds through npm itself, so `npm install` just works.

import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// apps/server/src/db -> repo root is four levels up
const dbPath = path.resolve(__dirname, "../../../../brainy.db");

const client = createClient({ url: `file:${dbPath}` });

export const db = drizzle(client, { schema });
