import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const MAX_SYNC_STANDARD_PLUGIN_BYTES = 5_000_000;
const WARN_SYNC_STANDARD_PLUGIN_BYTES = 4_500_000;

// The Obsidian plugin directory is primarily English-speaking. An
// English description of the plugin is required in the README.
const readme = await readFile(path.join(root, "README.md"), "utf8");
const englishWordCount = (readme.match(/\b[a-zA-Z]{3,}\b/g) ?? []).length;
if (englishWordCount < 100) {
  throw new Error(
    `README.md appears to contain insufficient English text (${englishWordCount} words of 3+ letters found). The Obsidian community directory requires an English description.`
  );
}
console.log(`README English word count: ${englishWordCount}`);

const rootManifest = JSON.parse(
  await readFile(path.join(root, "manifest.json"), "utf8")
);
const pluginManifest = JSON.parse(
  await readFile(
    path.join(root, "apps", "obsidian-plugin", "manifest.json"),
    "utf8"
  )
);
if (JSON.stringify(rootManifest) !== JSON.stringify(pluginManifest)) {
  throw new Error("Root and Obsidian plugin manifests must stay identical.");
}
const rootPackage = JSON.parse(
  await readFile(path.join(root, "package.json"), "utf8")
);
const obsidianPluginPackage = JSON.parse(
  await readFile(
    path.join(root, "apps", "obsidian-plugin", "package.json"),
    "utf8"
  )
);
const browserExtensionPackage = JSON.parse(
  await readFile(
    path.join(root, "apps", "browser-extension", "package.json"),
    "utf8"
  )
);
for (const [label, value] of [
  ["root package.json", rootPackage.version],
  ["Obsidian plugin manifest", pluginManifest.version],
  ["Obsidian plugin package.json", obsidianPluginPackage.version],
  ["browser extension package.json", browserExtensionPackage.version]
]) {
  if (value !== rootManifest.version) {
    throw new Error(
      `${label} version ${value} must match manifest.json version ${rootManifest.version}.`
    );
  }
}
const versions = JSON.parse(
  await readFile(path.join(root, "versions.json"), "utf8")
);
if (versions[rootManifest.version] !== rootManifest.minAppVersion) {
  throw new Error(
    "versions.json must map the current plugin version to minAppVersion."
  );
}
const extensionRoot = path.join(
  root,
  "apps",
  "browser-extension",
  ".output",
  "chrome-mv3"
);
const manifest = JSON.parse(
  await readFile(path.join(extensionRoot, "manifest.json"), "utf8")
);

const forbiddenPermissions = new Set(["cookies", "webRequest", "webRequestBlocking"]);
for (const permission of manifest.permissions ?? []) {
  if (forbiddenPermissions.has(permission)) {
    throw new Error(`Forbidden extension permission emitted: ${permission}`);
  }
}
const requiredOrigins = [...(manifest.host_permissions ?? [])].sort();
if (JSON.stringify(requiredOrigins) !== JSON.stringify(["http://127.0.0.1/*"])) {
  throw new Error(
    `Only the localhost bridge may be an install-time host permission: ${JSON.stringify(requiredOrigins)}`
  );
}

const platformOrigins = JSON.parse(
  await readFile(path.join(root, "scripts", "platform-origins.json"), "utf8")
);
const expectedOrigins = [...platformOrigins].sort();
const actualOrigins = [...(manifest.optional_host_permissions ?? [])].sort();
if (JSON.stringify(actualOrigins) !== JSON.stringify(expectedOrigins)) {
  throw new Error(
    `Unexpected optional host permissions: ${JSON.stringify(actualOrigins)}`
  );
}

const suspiciousSecrets = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bghp_[A-Za-z0-9]{30,}\b/,
  /\bsk-[A-Za-z0-9_-]{24,}\b/
];

async function auditFile(target) {
  const data = await readFile(target);
  if (data.includes(0)) {
    return;
  }
  const text = data.toString("utf8");
  for (const pattern of suspiciousSecrets) {
    if (pattern.test(text)) {
      throw new Error(`Potential credential found in ${path.relative(root, target)}`);
    }
  }
}

async function auditDirectory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await auditDirectory(target);
      continue;
    }
    if (entry.isSymbolicLink()) {
      continue;
    }
    await auditFile(target);
  }
}

await auditDirectory(extensionRoot);
for (const file of ["main.js", "manifest.json", "styles.css"]) {
  const source = path.join(root, "apps", "obsidian-plugin", file);
  const sourceData = await readFile(source);
  await auditFile(source);
  for (const packaged of [
    path.join(root, "dist", file),
    path.join(root, "dist", "obsidian", file)
  ]) {
    const packagedData = await readFile(packaged);
    if (!sourceData.equals(packagedData)) {
      throw new Error(`${path.relative(root, packaged)} does not match ${path.relative(root, source)}.`);
    }
    await auditFile(packaged);
  }
}
const pluginBundle = path.join(root, "apps", "obsidian-plugin", "main.js");
const pluginBundleSize = (await stat(pluginBundle)).size;
if (pluginBundleSize > MAX_SYNC_STANDARD_PLUGIN_BYTES) {
  throw new Error(
    `Obsidian main.js is ${(pluginBundleSize / 1_000_000).toFixed(2)} MB; it must not exceed 5 MB for Sync Standard.`
  );
}
if (pluginBundleSize > WARN_SYNC_STANDARD_PLUGIN_BYTES) {
  console.warn(
    `Warning: Obsidian main.js is ${(pluginBundleSize / 1_000_000).toFixed(2)} MB; it should stay below 4.5 MB for Sync Standard.`
  );
}
const forbiddenRuntimePatterns = [
  { label: "Node filesystem access", pattern: /require\(["'](?:node:)?fs(?:\/promises)?["']\)/ },
  { label: "dynamic Function construction", pattern: /new Function\s*\(/ },
  { label: "direct eval", pattern: /\beval\s*\(/ }
];
const pluginBundleText = await readFile(pluginBundle, "utf8");
for (const { label, pattern } of forbiddenRuntimePatterns) {
  if (pattern.test(pluginBundleText)) {
    throw new Error(`Obsidian main.js contains ${label}.`);
  }
}
console.log("Build audit passed: permissions are scoped and no credential signatures were found.");
