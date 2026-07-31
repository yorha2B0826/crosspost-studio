import builtins from "builtin-modules";
import esbuild from "esbuild";
import { createRequire } from "node:module";

const production = process.argv[2] === "production";
const requireFromCore = createRequire(
  new URL("../../packages/core/package.json", import.meta.url)
);

const context = await esbuild.context({
  alias: {
    // The Node entry adds file/network resource loaders that CSS inlining does
    // not use. Bundle Juice's DOM-only entry to keep plugin permissions narrow.
    juice: requireFromCore.resolve("juice/client.js")
  },
  banner: {
    js: "/* Crosspost Studio - MIT */"
  },
  bundle: true,
  entryPoints: ["src/main.ts"],
  external: ["obsidian", "electron", ...builtins],
  format: "cjs",
  logLevel: "info",
  // Obsidian recommends minifying production builds to reduce startup time and
  // keep the release below the 5 MB Sync Standard file limit. Development
  // builds remain readable and retain inline source maps.
  minify: production,
  outfile: "main.js",
  // The desktop plugin owns a localhost HTTP/WebSocket server. Resolving the
  // `ws` package with the browser condition selects its browser-only stub,
  // where WebSocketServer is unavailable.
  platform: "node",
  // Inline source maps made the release main.js tens of megabytes larger and
  // prevented Obsidian Sync Standard users from syncing the plugin. Keep source
  // maps for local development only; production output is intentionally compact.
  sourcemap: production ? false : "inline",
  target: "es2022",
  treeShaking: true
});

if (production) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
}
