import { defineConfig } from "drizzle-kit";

// Generates migrations from src/db/schema.ts into drizzle/ (committed — this is the
// schema's real history, per ADR-0022: schema changes only through a migration).
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: "file:../../brainy.db",
  },
});
