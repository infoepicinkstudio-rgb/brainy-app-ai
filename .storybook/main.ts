import type { StorybookConfig } from "@storybook/nextjs";

// Documents apps/web/components/ui (architecture.md §2, §7) — every shadcn/ui primitive
// gets a story as it's added. Zero stories at Phase 0 is expected and correct; this config
// just needs to boot cleanly (prd.md §6 Phase 0 "done looks like").
const config: StorybookConfig = {
  stories: ["../apps/web/components/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-a11y"],
  framework: {
    name: "@storybook/nextjs",
    options: {},
  },
  staticDirs: ["../apps/web/public"],
};

export default config;
