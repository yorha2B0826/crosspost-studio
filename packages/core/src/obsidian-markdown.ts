import type { Diagnostic } from "@crosspost/protocol";

const IMAGE_EXTENSIONS = new Set([
  "avif",
  "gif",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "webp"
]);

export interface PreprocessedMarkdown {
  diagnostics: Diagnostic[];
  markdown: string;
}

export function preprocessObsidianMarkdown(markdown: string): PreprocessedMarkdown {
  const diagnostics: Diagnostic[] = [];
  const converted = markdown.replace(
    /!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
    (_full, rawTarget: string, rawLabel: string | undefined) => {
      const target = rawTarget.trim();
      const extension = target.split(".").pop()?.toLowerCase() ?? "";
      if (!IMAGE_EXTENSIONS.has(extension)) {
        diagnostics.push({
          code: "unsupported-embed",
          message: `Embedded note or binary file "${target}" is not supported in the MVP.`,
          severity: "warning",
          source: target
        });
        return `> [Crosspost warning: unsupported embed ${target}]`;
      }
      const trimmedLabel = rawLabel?.trim();
      // Obsidian treats a pure-numeric label as a width hint, not alt text.
      const widthHint = trimmedLabel?.match(/^\d+$/)?.[0];
      const label = trimmedLabel && !widthHint ? trimmedLabel : target;
      const fragment = widthHint ? `#w=${widthHint}` : "";
      return `![${label}](obsidian-asset:${encodeURIComponent(target)}${fragment})`;
    }
  );

  return {
    diagnostics,
    markdown: converted
  };
}
