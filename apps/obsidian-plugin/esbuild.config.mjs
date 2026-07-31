import builtins from "builtin-modules";
import esbuild from "esbuild";

const production = process.argv[2] === "production";

const context = await esbuild.context({
  banner: {
    js: "/* Crosspost Studio - MIT */"
  },
  bundle: true,
  entryPoints: ["src/main.ts"],
  external: ["obsidian", "electron", ...builtins],
  format: "cjs",
  logLevel: "info",
  // Obsidian requires plugin code to be human-readable for review.
  // Minification is disabled to satisfy the community plugin guidelines.
  minify: false,
  outfile: "main.js",
  // The desktop plugin owns a localhost HTTP/WebSocket server. Resolving the
  // `ws` package with the browser condition selects its browser-only stub,
  // where WebSocketServer is unavailable.
  platform: "node",
  sourcemap: "inline",
  target: "es2022",
  treeShaking: true
});

if (production) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
}
