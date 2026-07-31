import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, unlink } from "node:fs/promises";
import path from "node:path";

import "./package-obsidian.mjs";

const root = process.cwd();
const releaseRoot = path.join(root, "dist");

const extensionOutput = path.join(root, "apps", "browser-extension", ".output");
const extensionManifest = JSON.parse(
  await readFile(
    path.join(extensionOutput, "chrome-mv3", "manifest.json"),
    "utf8"
  )
);
const zipCandidates = (await readdir(extensionOutput)).filter(
  (file) =>
    file.endsWith(".zip") &&
    file.includes(`-${extensionManifest.version}-chrome`)
);
if (zipCandidates.length !== 1) {
  throw new Error(
    `Expected exactly one Chromium extension zip for version ${extensionManifest.version}, found ${zipCandidates.length}.`
  );
}
const [zip] = zipCandidates;
const browserRelease = path.join(releaseRoot, "chromium");
await mkdir(browserRelease, { recursive: true });
for (const stale of (await readdir(browserRelease)).filter((file) =>
  file.endsWith(".zip")
)) {
  await unlink(path.join(browserRelease, stale));
}
const releaseZip = `crosspost-studio-bridge-${extensionManifest.version}-chrome.zip`;
const sourceZipPath = path.join(extensionOutput, zip);
const releaseZipPath = path.join(browserRelease, releaseZip);
await cp(sourceZipPath, releaseZipPath);
const digest = (data) => createHash("sha256").update(data).digest("hex");
const [sourceDigest, releaseDigest] = await Promise.all([
  readFile(sourceZipPath).then(digest),
  readFile(releaseZipPath).then(digest)
]);
if (sourceDigest !== releaseDigest) {
  throw new Error("The packaged Chromium extension does not match the WXT output.");
}
console.log(`Release artifacts written to ${releaseRoot}`);
