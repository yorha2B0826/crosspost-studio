import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
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

const expectedOrigins = [
  "https://editor.csdn.net/*",
  "https://i.cnblogs.com/*",
  "https://my.oschina.net/*",
  "https://*.zhihu.com/*",
  "https://juejin.cn/*"
].sort();
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
  await auditFile(path.join(root, "apps", "obsidian-plugin", file));
}
console.log("Build audit passed: permissions are scoped and no credential signatures were found.");
