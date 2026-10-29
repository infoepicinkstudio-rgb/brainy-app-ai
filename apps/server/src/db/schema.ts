// Drizzle schema — Brainy's SQLite data model.
// Source of truth: ../../../../docs/architecture.md §5.3 (table list) and §5.2 (naming conventions).
// Schema changes ONLY through a Drizzle migration (`npm run db:generate` in this workspace) —
// never hand-edit brainy.db directly. See rules-decisions.md ADR-0022.
//
// Conventions (ADR-0020, ADR-0021): snake_case, plural table names, UUID primary keys,
// every table gets created_at/updated_at, `boards` additionally gets deleted_at (soft-delete),
// booleans use an is_/has_ prefix.

import { sqliteTable, text, integer, real, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const timestamps = {
  created_at: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
  updated_at: text("updated_at")
    .notNull()
    .default(sql`(current_timestamp)`),
};

/** Single local, cosmetic profile — no real auth. ADR-0032. */
export const users = sqliteTable("users", {
  id: id(),
  name: text("name").notNull(),
  avatar_initials: text("avatar_initials").notNull(),
  ...timestamps,
});

/** Optional grouping of boards in the Boards List. */
export const folders = sqliteTable("folders", {
  id: id(),
  name: text("name").notNull(),
  parent_folder_id: text("parent_folder_id"),
  ...timestamps,
});

/** One Brainboard (canvas). Soft-deleted via deleted_at → Trash UI. */
export const boards = sqliteTable("boards", {
  id: id(),
  title: text("title").notNull(),
  folder_id: text("folder_id").references(() => folders.id),
  deleted_at: text("deleted_at"),
  // Favorite-star toggle on Boards List rows (ADR-0083). A plain boolean, no sort/filter
  // behavior attached yet — scope was deliberately kept to "toggle + persistence only".
  is_favorite: integer("is_favorite", { mode: "boolean" }).notNull().default(false),
  ...timestamps,
});

/**
 * Any node on a canvas — text, video link, file/document, link/reference, chat,
 * mindmap, or group (ADR-0043, ADR-0053). `data` shape depends on `type`; validated
 * in application code, not at the DB layer.
 */
export const nodes = sqliteTable("nodes", {
  id: id(),
  board_id: text("board_id")
    .notNull()
    .references(() => boards.id),
  type: text("type").notNull(), // "text" | "video" | "file" | "link" | "chat" | "mindmap" | "group"
  position_x: real("position_x").notNull().default(0),
  position_y: real("position_y").notNull().default(0),
  // Phase 3, TF-Grouping: which `group`-type node (if any) this node is a member of.
  // Mirrors React Flow's own `parentId` concept directly (board-store.ts's `toRfNode`
  // maps this 1:1) rather than inventing a separate membership model — React Flow
  // already natively handles "drag the group, children move with it" and "constrain a
  // child inside its group" once a node carries `parentId` + `extent: 'parent'`, so
  // there's no grouping *logic* to hand-roll beyond maintaining this one column.
  // Self-referencing FK, nullable (most nodes belong to no group); no cascade at the DB
  // level — ungrouping explicitly nulls this on every child first, same pattern
  // boards.ts's folder-delete "move" action already uses for `boards.folder_id`.
  parent_node_id: text("parent_node_id").references((): AnySQLiteColumn => nodes.id),
  data: text("data", { mode: "json" }).notNull().default("{}"),
  ...timestamps,
});

/** Connection between two nodes — context flows source → target (architecture.md §4.3). */
export const edges = sqliteTable("edges", {
  id: id(),
  board_id: text("board_id")
    .notNull()
    .references(() => boards.id),
  source_node_id: text("source_node_id")
    .notNull()
    .references(() => nodes.id),
  target_node_id: text("target_node_id")
    .notNull()
    .references(() => nodes.id),
  ...timestamps,
});

/**
 * One conversation thread within a chat node (Phase 4 follow-up, Istiyak: "New session
 * and session list side panel needed" — matching the multi-conversation pattern of
 * mainstream AI chat UIs). A single chat node can hold many of these; the canvas
 * connection/context-assembly story (architecture.md §4.3) is entirely unaffected —
 * connections are still node-to-node, sessions are purely an organizational split of
 * ONE node's own message history. `title` is null until the session's first user
 * message arrives, then auto-derived from it (routes/chat.ts) — never user-renamed in
 * this pass, matching F-12's own "a sane default is pre-selected" spirit rather than
 * adding a rename flow nothing asked for yet.
 */
export const chat_sessions = sqliteTable("chat_sessions", {
  id: id(),
  node_id: text("node_id")
    .notNull()
    .references(() => nodes.id),
  title: text("title"),
  ...timestamps,
});

/**
 * Message history for a chat node, split across `chat_sessions` (above).
 * model/tokens_used/estimated_cost support per-node model selection (F-12) and
 * estimated cost tracking (F-29) — ADR-0052. `session_id` nullable rather than
 * NOT NULL: any row saved before this column existed has no session to point at;
 * routes/chat.ts's chat-history read groups those orphaned rows into a synthesized
 * "Legacy conversation" per node rather than losing them, so this stays nullable
 * instead of forcing a destructive backfill. `attachments` (Istiyak: "Image upload in
 * chat") holds a JSON array of `{storedName, mimeType, originalName}` — the same
 * content-addressed storage lib/uploads.ts already uses for file-node uploads, not a
 * second upload mechanism; null/empty for every message with no image.
 */
export const chat_messages = sqliteTable("chat_messages", {
  id: id(),
  node_id: text("node_id")
    .notNull()
    .references(() => nodes.id),
  session_id: text("session_id").references(() => chat_sessions.id),
  role: text("role").notNull(), // "user" | "assistant"
  content: text("content").notNull(),
  provider: text("provider"), // "claude" | "openai" | "gemini" | null (Local LLM / Manual Input)
  model: text("model"),
  tokens_used: integer("tokens_used"),
  estimated_cost: real("estimated_cost"),
  attachments: text("attachments", { mode: "json" }),
  ...timestamps,
});

/**
 * API keys per provider — one row per provider, created lazily the first time Settings
 * touches it (ADR-0061). `api_key` is encrypted at rest (AES-256-GCM, ADR-0060, see
 * architecture.md §6) and null until the user saves a key; `execution_mode` is settable
 * independently of whether a key exists (Local LLM mode never needs one).
 */
export const provider_credentials = sqliteTable("provider_credentials", {
  id: id(),
  provider: text("provider").notNull().unique(), // "claude" | "openai" | "gemini"
  api_key: text("api_key"), // encrypted ciphertext; null = not configured
  is_enabled: integer("is_enabled", { mode: "boolean" }).notNull().default(true),
  execution_mode: text("execution_mode").notNull().default("native"), // "local" | "native" | "manual" — ADR-0061
  ...timestamps,
});

/**
 * Phase 6 (F-15/TF-09, ADR-0100) — a single row holding the YouTube Data API v3 key the
 * Outliers panel needs, encrypted at rest with the SAME `db/crypto.ts` helpers as
 * `provider_credentials.api_key` above (ADR-0060) rather than a plaintext column. A
 * deliberately SEPARATE table, not a fourth row in `provider_credentials`: a YouTube key
 * isn't a chat `ProviderAdapter` and has no `execution_mode` concept (local/native/
 * manual means nothing for a plain data lookup) — reusing that table would mean every
 * row carrying a column meaningless to it. Singleton by convention (never more than one
 * row — there's only one YouTube key to hold), created lazily the first time Settings'
 * Outliers section is touched, same lazy-creation pattern as `provider_credentials`.
 */
export const youtube_credentials = sqliteTable("youtube_credentials", {
  id: id(),
  api_key: text("api_key"), // encrypted ciphertext; null = not configured
  ...timestamps,
});

/**
 * Cached extracted content for anything expensive to pull text/data out of —
 * video/audio transcripts (ADR-0044) and, since ADR-0053, file-node PDF/DOCX/XLSX
 * text/data. source_key is a source URL *or* a file-content hash.
 */
export const extraction_cache = sqliteTable("extraction_cache", {
  id: id(),
  source_key: text("source_key").notNull().unique(),
  extracted_content: text("extracted_content").notNull(),
  extracted_at: text("extracted_at")
    .notNull()
    .default(sql`(current_timestamp)`),
  ...timestamps,
});

/** Local Brand/Voice Profile content — ADR-0039. */
export const brand_profile = sqliteTable("brand_profile", {
  id: id(),
  label: text("label").notNull(),
  content: text("content").notNull(),
  ...timestamps,
});
