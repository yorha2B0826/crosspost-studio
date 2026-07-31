import {
  renderMermaidSvg
} from "./mermaid.js";
import type { ResolvedAsset } from "./types.js";

export function browserRenderMermaidSvg(source: string): Promise<ResolvedAsset> {
  return renderMermaidSvg(
    source,
    async () => {
      const { default: mermaid } = await import("mermaid");
      return mermaid;
    },
    true
  );
}
