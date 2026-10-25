import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import tailwind from "eslint-plugin-tailwindcss";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Blocks hardcoded colors/spacing outside the token files (ADR-0024, ADR-0031):
  // every value must come from packages/tokens via a Tailwind utility class, never
  // an arbitrary value like bg-[#fff] or a raw hex/px string in a className.
  {
    ...tailwind.configs.recommended,
    settings: {
      tailwindcss: {
        cssConfigPath: "./app/globals.css",
      },
    },
    rules: {
      ...tailwind.configs.recommended.rules,
      "tailwindcss/no-arbitrary-value": "error",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
