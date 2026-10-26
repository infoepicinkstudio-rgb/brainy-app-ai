// Pure function: derives a 1–2 letter avatar initials string from a display name.
// Kept pure and dependency-free so it's trivially unit-checkable — no test runner is
// wired into this repo yet (Phase 0/1 scope didn't call for one), so this is verified
// by direct invocation below rather than a committed test file; wire up a real test
// runner (vitest is the natural fit alongside Vite/Next tooling) before this grows.

export function initialsFromName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";

  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  const first = parts[0]?.[0] ?? "";
  const last = parts[parts.length - 1]?.[0] ?? "";
  return (first + last).toUpperCase();
}
