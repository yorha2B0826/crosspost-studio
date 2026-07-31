import type { Diagnostic, PublicationArtifact } from "@crosspost/protocol";
import type { Root } from "mdast";
import juice from "juice";
import rehypeHighlight from "rehype-highlight";
import rehypeStringify from "rehype-stringify";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import remarkStringify from "remark-stringify";
import { unified } from "unified";

import { sanitizeCustomCss } from "./css.js";
import { sha256Hex } from "./hash.js";
import { renderMathSvg } from "./math.js";
import { preprocessObsidianMarkdown } from "./obsidian-markdown.js";
import { getThemeCss } from "./themes.js";
import type {
  PublicationAsset,
  RenderOptions,
  RenderedPublication,
  ResolvedAsset
} from "./types.js";

interface MutableNode {
  alt?: string;
  children?: MutableNode[];
  data?: {
    hProperties?: Record<string, unknown>;
  };
  lang?: string | null;
  type: string;
  url?: string;
  value?: string;
}

// A fixed UUID prefix prevents accidental collisions between formula markers
// and user-authored text that happens to look like a marker.
const FORMULA_MARKER_PREFIX = "a7b3c9d1";

export function zhihuFormulaMarker(latex: string, display: boolean): string {
  const encoded = Array.from(new TextEncoder().encode(latex), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
  return `CROSSPOST_FORMULA_${FORMULA_MARKER_PREFIX}_${display ? "BLOCK" : "INLINE"}_${encoded}_END`;
}

function formulaMarkerRegex(output: "html" | "markdown"): RegExp {
  // Markdown processors may escape underscores; match both forms.
  const sep = output === "markdown" ? "\\\\_" : "_";
  return new RegExp(
    `CROSSPOST${sep}FORMULA${sep}${FORMULA_MARKER_PREFIX}${sep}(INLINE|BLOCK)${sep}([a-f0-9]+)${sep}END`,
    "g"
  );
}

function decodeHex(value: string): string {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return new TextDecoder().decode(bytes);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function replaceZhihuFormulaMarkers(
  value: string,
  output: "html" | "markdown"
): string {
  const marker = formulaMarkerRegex(output);
  return value.replace(
    marker,
    (_marker, mode: string, encoded: string) => {
      const latex = decodeHex(encoded);
      const display = mode === "BLOCK";
      if (output === "markdown") {
        return display ? `$$\n${latex}\n$$` : `$${latex}$`;
      }
      return `<span class="ztext-math" data-tex="${escapeHtml(latex)}" data-eeimg="${display ? "2" : "1"}">${escapeHtml(latex)}</span>`;
    }
  );
}

function assetName(id: string, mimeType: string): string {
  const extension =
    mimeType === "image/png" ? "png" : mimeType === "image/svg+xml" ? "svg" : "bin";
  return `${id}.${extension}`;
}

async function addResolvedAsset(
  resolved: ResolvedAsset,
  kind: PublicationAsset["kind"],
  alt: string,
  assets: Map<string, PublicationAsset>
): Promise<PublicationAsset> {
  const id = await sha256Hex(resolved.bytes);
  const asset: PublicationAsset = {
    alt: resolved.alt ?? alt,
    bytes: resolved.bytes,
    height: resolved.height,
    id,
    kind,
    mimeType: resolved.mimeType,
    name: resolved.name || assetName(id, resolved.mimeType),
    width: resolved.width
  };
  assets.set(id, asset);
  return asset;
}

async function transformNode(
  node: MutableNode,
  options: RenderOptions,
  assets: Map<string, PublicationAsset>,
  diagnostics: Diagnostic[]
): Promise<MutableNode> {
  if (node.type === "code" && node.lang === "mermaid") {
    const source = node.value ?? "";
    if (!options.renderMermaid) {
      diagnostics.push({
        code: "unsupported-mermaid",
        message:
          "Mermaid rendering is unavailable in this environment, so the source remains a code block.",
        severity: "warning",
        source: source.slice(0, 200)
      });
      return node;
    }
    try {
      let resolved = await options.renderMermaid(source);
      if (resolved.mimeType !== "image/svg+xml") {
        throw new Error("The Mermaid renderer did not return an SVG image.");
      }
      if (options.platform === "wechat") {
        if (!options.rasterizeFormula) {
          throw new Error(
            "WeChat requires a PNG fallback, but no SVG rasterizer is available."
          );
        }
        resolved = {
          ...(await options.rasterizeFormula(
            new TextDecoder().decode(resolved.bytes),
            true
          )),
          name: resolved.name.replace(/\.svg$/i, ".png")
        };
      }
      const asset = await addResolvedAsset(
        resolved,
        "diagram",
        "Mermaid diagram",
        assets
      );
      return {
        alt: "Mermaid diagram",
        data: {
          hProperties: {
            "data-asset-id": asset.id,
            "data-crosspost-diagram": "mermaid",
            height: asset.height,
            width: asset.width
          }
        },
        type: "image",
        url: `crosspost-asset://${asset.id}`
      };
    } catch (error) {
      diagnostics.push({
        code: "mermaid-render-failed",
        message:
          error instanceof Error ? error.message : "Mermaid rendering failed.",
        severity: "error",
        source: source.slice(0, 200)
      });
      return node;
    }
  }

  if (node.type === "inlineMath" || node.type === "math") {
    const latex = node.value ?? "";
    const display = node.type === "math";
    if (options.platform === "zhihu") {
      const marker = zhihuFormulaMarker(latex, display);
      if (!display) {
        return {
          type: "text",
          value: marker
        };
      }
      return {
        children: [{ type: "text", value: marker }],
        type: "paragraph"
      };
    }
    try {
      const formulaSvg = renderMathSvg(latex, display);
      const resolved: ResolvedAsset = options.rasterizeFormula
        ? {
            ...(await options.rasterizeFormula(formulaSvg, display)),
            name: "formula.png"
          }
        : {
            bytes: new TextEncoder().encode(formulaSvg),
            mimeType: "image/svg+xml",
            name: "formula.svg"
          };
      if (!options.rasterizeFormula) {
        diagnostics.push({
          code: "formula-not-rasterized",
          message: "Formula remained SVG because no PNG rasterizer was available.",
          severity: "warning",
          source: latex.slice(0, 200)
        });
      }
      const asset = await addResolvedAsset(
        resolved,
        display ? "formula-block" : "formula-inline",
        `LaTeX: ${latex}`,
        assets
      );
      const baseline = display ? 0 : Math.max(1, Math.round((asset.height ?? 16) * 0.2));
      const imageNode: MutableNode = {
        alt: `LaTeX: ${latex}`,
        data: {
          hProperties: {
            "data-asset-id": asset.id,
            "data-crosspost-baseline": baseline,
            "data-crosspost-formula": display ? "block" : "inline",
            height: asset.height,
            style: display ? undefined : `vertical-align: -${baseline}px`,
            width: asset.width
          }
        },
        type: "image",
        url: `crosspost-asset://${asset.id}`,
        value: `LaTeX: ${latex}`
      };
      if (!display) {
        return imageNode;
      }
      return {
        children: [imageNode],
        data: {
          hProperties: {
            "data-crosspost-formula-block": "true"
          }
        },
        type: "paragraph"
      };
    } catch (error) {
      diagnostics.push({
        code: "formula-render-failed",
        message: error instanceof Error ? error.message : "Formula rendering failed.",
        severity: "error",
        source: latex.slice(0, 200)
      });
      return {
        type: "text",
        value: display ? `$$${latex}$$` : `$${latex}$`
      };
    }
  }

  if (node.type === "image" && node.url) {
    if (!options.resolveAsset) {
      diagnostics.push({
        code: "image-not-resolved",
        message: `Image "${node.url}" was not bundled because no resolver was available.`,
        severity: "warning",
        source: node.url
      });
      return node;
    }
    const resolved = await options.resolveAsset(node.url);
    if (!resolved) {
      diagnostics.push({
        code: "image-resolution-failed",
        message: `Image "${node.url}" could not be loaded.`,
        severity: "error",
        source: node.url
      });
      return node;
    }
    const asset = await addResolvedAsset(resolved, "image", node.alt ?? "", assets);
    return {
      ...node,
      data: {
        ...node.data,
        hProperties: {
          ...node.data?.hProperties,
          "data-asset-id": asset.id
        }
      },
      url: `crosspost-asset://${asset.id}`
    };
  }

  if (node.type === "code" && node.lang === "dataview") {
    diagnostics.push({
      code: `unsupported-${node.lang ?? "code"}`,
      message: `${node.lang ?? "This"} block is not rendered in the MVP and remains a code block.`,
      severity: "warning"
    });
  }

  if (node.type === "html") {
    diagnostics.push({
      code: "raw-html-escaped",
      message: "Raw HTML is escaped to keep platform output safe and deterministic.",
      severity: "warning"
    });
    return {
      type: "text",
      value: node.value ?? ""
    };
  }

  if (node.children) {
    node.children = await Promise.all(
      node.children.map((child) => transformNode(child, options, assets, diagnostics))
    );
  }
  return node;
}

export async function renderPublication(
  sourceMarkdown: string,
  options: RenderOptions
): Promise<RenderedPublication> {
  const preprocessed = preprocessObsidianMarkdown(sourceMarkdown);
  const diagnostics = [...preprocessed.diagnostics];
  const assets = new Map<string, PublicationAsset>();

  const parser = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ["yaml"])
    .use(remarkGfm)
    .use(remarkMath);
  const tree = parser.parse(preprocessed.markdown);
  tree.children = tree.children.filter((node) => node.type !== "yaml");
  const transformed = (await transformNode(
    tree as MutableNode,
    options,
    assets,
    diagnostics
  )) as Root;

  const htmlProcessor = unified()
    .use(remarkRehype)
    .use(rehypeHighlight, { detect: false })
    .use(rehypeStringify);
  const htmlTree = await htmlProcessor.run(transformed);
  const rawHtml = htmlProcessor.stringify(htmlTree);
  const platformHtml =
    options.platform === "zhihu"
      ? replaceZhihuFormulaMarkers(rawHtml, "html")
      : rawHtml;

  const css = `${getThemeCss(options.theme)}\n${
    options.customCss ? sanitizeCustomCss(options.customCss) : ""
  }`;
  const html = juice.inlineContent(`<section id="crosspost-root">${platformHtml}</section>`, css, {
    preserveImportant: true,
    removeStyleTags: true
  });

  const markdownProcessor = unified().use(remarkGfm).use(remarkStringify, {
    bullet: "-",
    fences: true
  });
  const rawMarkdown = markdownProcessor.stringify(transformed);
  const renderedMarkdown =
    options.platform === "zhihu"
      ? replaceZhihuFormulaMarkers(rawMarkdown, "markdown")
      : rawMarkdown;
  const contentHash = await computeContentHash(sourceMarkdown, options.metadata);
  const metadata = {
    author: options.metadata.author,
    coverAssetId: undefined,
    summary: options.metadata.summary,
    tags: options.metadata.tags ?? [],
    title: options.metadata.title
  };
  const artifact: PublicationArtifact = {
    assets: Array.from(assets.values(), ({ bytes: _bytes, ...descriptor }) => descriptor),
    contentHash,
    diagnostics,
    html,
    markdown: renderedMarkdown,
    metadata,
    platform: options.platform
  };

  return {
    artifact,
    assets
  };
}

export async function computeContentHash(
  sourceMarkdown: string,
  metadata: RenderOptions["metadata"]
): Promise<string> {
  const sourceWithoutFrontmatter = sourceMarkdown.replace(
    /^---\s*\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n|$)/,
    ""
  );
  return sha256Hex(
    JSON.stringify({
      body: sourceWithoutFrontmatter,
      metadata: {
        author: metadata.author ?? "",
        cover: metadata.cover ?? "",
        summary: metadata.summary ?? "",
        tags: metadata.tags ?? [],
        title: metadata.title
      }
    })
  );
}
