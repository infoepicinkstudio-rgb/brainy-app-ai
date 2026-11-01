// Phase 8 (ADR-0109): apps/server had no lint config at all before this. Plain TS/Node
// backend, no framework-specific rules needed (contrast apps/web's eslint-config-next
// setup) — just @eslint/js recommended + typescript-eslint recommended, scoped to src/
// only (dist/ is build output, never linted).
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  {
    rules: {
      // Mirrors what the codebase actually does throughout (ADR-prefixed inline
      // comments, defensive `catch {}` per architecture.md §11) rather than fighting it.
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
);
