---
paths:
  - "packages/tokens/**"
  - "apps/web/components/ui/**"
  - "apps/web/styles/**"
---

# Design token conventions

Full rationale: `docs/rules-decisions.md` ADR-0024–ADR-0028. Pipeline detail: `docs/architecture.md` §7.

- **Never hardcode a color, spacing, or typography value.** Every value traces back to `packages/tokens/tokens/primitives.json` or `semantic.json`. If a value you need doesn't exist as a token yet, add the token — don't inline the raw value "just this once."
- Tokens are W3C DTCG format (`$value`/`$type`).
- `semantic.json` is organized **by usage category**, not generic color family: `color.text.*`, `color.background.*`, `color.border.*`. A text color and a background color are different tokens even if they happen to be the same hex value — never reuse one across categories.
- Palette: a clean, neutral "Figma light-mode" style (neutral grays + one accent) — **independent of EPICINK Studio's brand assets**, never pull from the carousel/content palette.
- Typeface: **Inter only**. No second typeface.
- Single light theme for MVP — no dark-mode variants to maintain yet.
- shadcn/ui primitives in `apps/web/components/ui/` are code-owned (generated into the repo, not an npm dependency) — edit them directly when needed, don't fight the generator.
