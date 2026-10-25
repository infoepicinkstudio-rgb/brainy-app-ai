// Style Dictionary config for Brainy's design tokens (architecture.md §7, ADR-0024/0025/0026/0031).
// Source: tokens/primitives.json (raw scales) + tokens/semantic.json (usage-category aliases,
// DTCG format — $value/$type). Never edit packages/tokens/build/ by hand — it's regenerated here
// and gitignored.

export default {
  source: ["tokens/primitives.json", "tokens/semantic.json"],
  platforms: {
    css: {
      transformGroup: "css",
      buildPath: "build/css/",
      files: [
        {
          destination: "variables.css",
          format: "css/variables",
          options: { outputReferences: true }
        }
      ]
    },
    json: {
      transformGroup: "js",
      buildPath: "build/json/",
      files: [
        {
          destination: "tokens.json",
          format: "json/nested"
        }
      ]
    }
  }
};
