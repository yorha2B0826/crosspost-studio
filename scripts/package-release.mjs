import { cp, mkdir, readFile, readdir, unlink } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const releaseRoot = path.join(root, "dist");
const pluginSource = path.join(root, "apps", "obsidian-plugin");
const pluginRelease = path.join(releaseRoot, "obsidian");
await mkdir(pluginRelease, { recursive: true });
for (const file of ["main.js", "manifest.json", "styles.css"]) {
  await cp(path.join(pluginSource, file), path.join(pluginRelease, file));
}

const extensionOutput = path.join(root, "apps", "browser-extension", ".output");
const zip = (await readdir(extensionOutput)).find(
  (file) => file.endsWith(".zip") && file.includes("chrome")
);
if (!zip) {
  throw new Error("WXT did not produce a Chromium extension zip.");
}
const browserRelease = path.join(releaseRoot, "chromium");
await mkdir(browserRelease, { recursive: true });
for (const stale of (await readdir(browserRelease)).filter((file) =>
  file.endsWith(".zip")
)) {
  await unlink(path.join(browserRelease, stale));
}
const extensionManifest = JSON.parse(
  await readFile(
    path.join(extensionOutput, "chrome-mv3", "manifest.json"),
    "utf8"
  )
);
const releaseZip = `crosspost-studio-bridge-${extensionManifest.version}-chrome.zip`;
await cp(path.join(extensionOutput, zip), path.join(browserRelease, releaseZip));
console.log(`Release artifacts written to ${releaseRoot}`);
