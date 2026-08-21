import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function fail(message) {
  console.error(`bump-version: ${message}`);
  process.exit(1);
}

const version = process.argv[2];
if (!version || !SEMVER_PATTERN.test(version)) {
  fail("Usage: node scripts/bump-version.mjs <version> (e.g. node scripts/bump-version.mjs 1.0.2)");
}

const root = process.cwd();

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
}
async function writeJson(relativePath, value) {
  await writeFile(path.join(root, relativePath), `${JSON.stringify(value, null, 2)}\n`, "utf8");
  console.log(`Updated ${relativePath}`);
}

const rootPackage = await readJson("package.json");
const manifest = await readJson("manifest.json");
if (rootPackage.version !== manifest.version) {
  fail(
    `Root package.json version (${rootPackage.version}) and manifest.json version (${manifest.version}) disagree; reconcile them before bumping.`
  );
}
if (rootPackage.version === version) {
  fail(`Version ${version} is already the current version.`);
}

// versions.json maps each released plugin version to the minimum Obsidian
// app version that supports it. New releases inherit the minAppVersion of
// the release being bumped from.
const minAppVersion = manifest.minAppVersion;
const versions = await readJson("versions.json");
if (versions[version] !== undefined) {
  fail(`versions.json already contains an entry for ${version}.`);
}
versions[version] = minAppVersion;

await writeJson("package.json", { ...rootPackage, version });
await writeJson("manifest.json", { ...manifest, version });
await writeJson("apps/obsidian-plugin/manifest.json", { ...manifest, version });
await writeJson(
  "apps/obsidian-plugin/package.json",
  { ...(await readJson("apps/obsidian-plugin/package.json")), version }
);
await writeJson(
  "apps/browser-extension/package.json",
  { ...(await readJson("apps/browser-extension/package.json")), version }
);
await writeJson("versions.json", versions);
await writeJson("apps/obsidian-plugin/versions.json", versions);

console.log(`Bumped all manifests to ${version}.`);
