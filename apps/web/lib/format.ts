// Relative-time formatting for board-row metadata (Boards List sidebar redesign).
//
// The `boards` table (apps/server/src/db/schema.ts) only has `created_at`/`updated_at`
// — no dedicated "last opened" column — so a row's timestamp is honestly "Updated",
// never "Opened" (that would claim tracking that doesn't exist). Adding real
// open-tracking (e.g. a PATCH on canvas-mount bumping a new `last_opened_at` column)
// would need a schema migration + a new endpoint; flagged as a reasonable future
// enhancement rather than done in this pass, since "Updated" is already honest and the
// directive explicitly left this as a judgment call.
export function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const diffSec = Math.round((Date.now() - date.getTime()) / 1000);

  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;

  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;

  const diffDay = Math.round(diffHour / 24);
  if (diffDay < 7) return `${diffDay}d ago`;

  const diffWeek = Math.round(diffDay / 7);
  if (diffWeek < 5) return `${diffWeek}w ago`;

  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
}
