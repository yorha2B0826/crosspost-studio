import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "wxt";

// Single source of truth shared with scripts/audit-build.mjs.
const platformOrigins = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../scripts/platform-origins.json", import.meta.url)),
    "utf8"
  )
) as string[];

export default defineConfig({
  manifest: {
    action: {
      default_title: "Crosspost Studio"
    },
    description:
      "Save Obsidian articles as drafts through visible editors on supported content platforms.",
    host_permissions: ["http://127.0.0.1/*"],
    minimum_chrome_version: "116",
    name: "Crosspost Studio Bridge",
    optional_host_permissions: [...platformOrigins],
    permissions: ["scripting", "storage", "tabs"]
  },
  srcDir: "src"
});
