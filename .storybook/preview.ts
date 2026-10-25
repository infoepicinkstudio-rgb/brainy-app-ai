import type { Preview } from "@storybook/nextjs";
import "../apps/web/app/globals.css";

// Pulls in the real token-driven globals.css (architecture.md §7) so every story renders
// with Brainy's actual palette/typography, not Storybook's defaults.
const preview: Preview = {
  parameters: {
    backgrounds: {
      default: "page",
      values: [{ name: "page", value: "#ffffff" }],
    },
  },
};

export default preview;
