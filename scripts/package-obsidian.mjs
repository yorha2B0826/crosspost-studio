import { cp, mkdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const releaseRoot = path.join(root, "dist");
const pluginSource = path.join(root, "apps", "obsidian-plugin");
const pluginRelease = path.join(releaseRoot, "obsidian");

await mkdir(pluginRelease, { recursive: true });
for (const file of ["main.js", "manifest.json", "styles.css"]) {
  const source = path.join(pluginSource, file);
  await cp(source, path.join(pluginRelease, file));
  // Obsidian's build verifier looks in conventional top-level output folders.
  await cp(source, path.join(releaseRoot, file));
}

console.log("Obsidian release artifacts written to dist/ and dist/obsidian/.");
