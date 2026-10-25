// Drizzle schema — Brainy's SQLite data model.
// Source of truth: ../../../../docs/architecture.md §5.3 (table list) and §5.2 (naming conventions).
// Schema changes ONLY through a Drizzle migration (`npm run db:generate` in this workspace) —
// never hand-edit brainy.db directly. See rules-decisions.md ADR-0022.
//
// Conventions (ADR-0020, ADR-0021): snake_case, plural table names, UUID primary keys,
// every table gets created_at/updated_at, `boards` additionally gets deleted_at (soft-delete),
// booleans use an is_/has_ prefix.

import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
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
 * Message history for a chat node. model/tokens_used/estimated_cost support
 * per-node model selection (F-12) and estimated cost tracking (F-29) — ADR-0052.
 */
export const chat_messages = sqliteTable("chat_messages", {
  id: id(),
  node_id: text("node_id")
    .notNull()
    .references(() => nodes.id),
  role: text("role").notNull(), // "user" | "assistant"
  content: text("content").notNull(),
  provider: text("provider"), // "claude" | "openai" | "gemini" | null (Local LLM / Manual Input)
  model: text("model"),
  tokens_used: integer("tokens_used"),
  estimated_cost: real("estimated_cost"),
  ...timestamps,
});

/** API keys per provider. api_key is encrypted at rest — see architecture.md §6. */
export const provider_credentials = sqliteTable("provider_credentials", {
  id: id(),
  provider: text("provider").notNull(), // "claude" | "openai" | "gemini"
  api_key: text("api_key").notNull(),
  is_enabled: integer("is_enabled", { mode: "boolean" }).notNull().default(true),
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
