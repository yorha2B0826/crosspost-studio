import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";

export default defineConfig(
  globalIgnores([
    "node_modules",
    "dist",
    "apps/obsidian-plugin/main.js",
    "apps/obsidian-plugin/esbuild.config.mjs",
    "apps/obsidian-plugin/versions.json"
  ]),
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    }
  },
  ...obsidianmd.configs.recommended
);
