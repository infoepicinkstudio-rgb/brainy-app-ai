import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Default position is bottom-left. The canvas's own zoom/undo/redo control cluster
  // (apps/web/app/brainboards/[id]/page.tsx, ADR-0066) first moved there (BUG-010) and
  // has SINCE moved again to bottom-right (Istiyak's second-round feedback, to match
  // the Poppy reference layout) — so the dev indicator now sits at bottom-left, the one
  // corner nothing else occupies. Confirmed live (Playwright) each time the control
  // cluster's position changes that this portal doesn't end up back on top of it;
  // re-check this if the cluster ever moves again. Moved rather than disabled outright
  // since it's still a useful dev-mode affordance otherwise.
  devIndicators: {
    position: "bottom-left",
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
