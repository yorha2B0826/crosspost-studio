import { renderMermaidSvg } from "./mermaid.js";
import type { MermaidEngine } from "./mermaid.js";
import type { ResolvedAsset } from "./types.js";

export function browserRenderMermaidSvg(source: string): Promise<ResolvedAsset> {
  return renderMermaidSvg(
    source,
    // Dynamic import is required: mermaid is a browser-only, multi-megabyte
    // dependency that must stay out of Node-side core consumers; only browser
    // callers opt in through this loader.
    async () => {
      const mermaidModule = (await import("mermaid")) as {
        default: MermaidEngine;
      };
      return mermaidModule.default;
    },
    true
  );
}
