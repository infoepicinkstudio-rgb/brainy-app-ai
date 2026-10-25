---
paths:
  - "apps/server/src/db/**"
  - "apps/server/drizzle/**"
---

# Database conventions

Full rationale: `docs/rules-decisions.md` ADR-0020, ADR-0021. Full schema: `docs/architecture.md` §5.

- `snake_case`, plural table names (`boards`, `nodes`), no `tbl` prefix.
- Foreign keys: `<singular_table>_id` (e.g. `board_id`).
- Every table: `created_at`, `updated_at`. `boards` additionally: `deleted_at` (soft-delete — never hard-delete a board directly; see `docs/feature.md` F-05).
- Booleans: `is_`/`has_` prefix, never bare (`enabled` → `is_enabled`).
- Primary keys: **UUID**, never auto-increment integers — required for future multi-device merge safety even though sync isn't built yet.
- Every schema change goes through a Drizzle migration — never hand-edit `brainy.db`'s structure directly.
- Adding or changing a table/column? Update `docs/architecture.md` §5.3's schema table in the same change.
