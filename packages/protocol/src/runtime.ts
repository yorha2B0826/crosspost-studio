// Increment this whenever a browser-runtime change must be present before the
// Obsidian plugin may safely enqueue a draft job. This is intentionally
// independent from the public extension version so local unpacked builds can
// detect stale service workers and content scripts without a release bump.
export const BROWSER_RUNTIME_REVISION = "2026-08-21-platform-adapters-9" as const;
