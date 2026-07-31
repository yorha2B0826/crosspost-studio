import { describe, expect, it, vi } from "vitest";

import {
  computeContentHash,
  preprocessObsidianMarkdown,
  renderPublication,
  sanitizeCustomCss
} from "./index.js";

const PNG_HEADER = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

describe("publication renderer", () => {
  it("converts Obsidian image embeds and reports unsupported embeds", () => {
    const result = preprocessObsidianMarkdown("![[diagram.png|600]]\n![[chapter-note]]");

    expect(result.markdown).toContain("obsidian-asset:diagram.png");
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "unsupported-embed" })])
    );
  });

  it("turns formulas and local images into deduplicated publication assets", async () => {
    const rendered = await renderPublication(
      `---
title: ignored
---
# 中文标题

Inline $E=mc^2$ and block:

$$
\\int_0^1 x^2 dx
$$

![[same.png]]
![[same.png]]
`,
      {
        metadata: { title: "中文标题" },
        platform: "wechat",
        renderFormula: (_latex, display) =>
          `<svg xmlns="http://www.w3.org/2000/svg" width="${display ? 120 : 40}" height="${display ? 32 : 16}"></svg>`,
        rasterizeFormula: (_svg, display) => Promise.resolve({
          bytes: new Uint8Array([...PNG_HEADER, display ? 2 : 1]),
          height: display ? 32 : 16,
          mimeType: "image/png",
          width: display ? 120 : 40
        }),
        resolveAsset: () => Promise.resolve({
          bytes: new Uint8Array([...PNG_HEADER, 9]),
          mimeType: "image/png",
          name: "same.png"
        }),
        theme: "minimal"
      }
    );

    expect(rendered.artifact.html).toContain("data-crosspost-formula");
    expect(rendered.artifact.html).toContain("data-crosspost-baseline");
    expect(rendered.artifact.html).toContain('alt="LaTeX: E=mc^2"');
    expect(rendered.artifact.html).not.toContain("<script");
    expect(rendered.artifact.assets).toHaveLength(3);
    expect(
      rendered.artifact.assets.filter((asset) => asset.kind === "image")
    ).toHaveLength(1);
    expect(rendered.artifact.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("keeps Zhihu formulas native instead of creating image assets", async () => {
    const rendered = await renderPublication(
      "Inline $E=mc^2$ and block:\n\n$$\n\\\\int_0^1 x^2 dx\n$$",
      {
        metadata: { title: "知乎原生公式" },
        platform: "zhihu",
        rasterizeFormula: () =>
          Promise.resolve({
            bytes: PNG_HEADER,
            height: 16,
            mimeType: "image/png",
            width: 40
          }),
        theme: "minimal"
      }
    );

    expect(rendered.artifact.html).toContain('data-tex="E=mc^2"');
    expect(rendered.artifact.html).toContain('data-eeimg="1"');
    expect(rendered.artifact.html).toContain('data-eeimg="2"');
    expect(rendered.artifact.html).not.toContain("CROSSPOST_FORMULA_");
    expect(rendered.artifact.markdown).toContain("$E=mc^2$");
    expect(rendered.artifact.markdown).toContain("$$");
    expect(
      rendered.artifact.assets.filter((asset) =>
        asset.kind.startsWith("formula")
      )
    ).toHaveLength(0);
  });

  it("turns Mermaid blocks into SVG publication assets for browser platforms", async () => {
    const rendered = await renderPublication(
      "```mermaid\nflowchart LR\n  A[源稿] --> B[草稿]\n```",
      {
        metadata: { title: "Mermaid SVG" },
        platform: "juejin",
        renderMermaid: () =>
          Promise.resolve({
            bytes: new TextEncoder().encode(
              '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 120"></svg>'
            ),
            height: 120,
            mimeType: "image/svg+xml",
            name: "diagram.svg",
            width: 320
          }),
        theme: "minimal"
      }
    );

    expect(rendered.artifact.diagnostics).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "unsupported-mermaid" })
      ])
    );
    expect(rendered.artifact.html).toContain('data-crosspost-diagram="mermaid"');
    expect(rendered.artifact.markdown).toContain("![Mermaid diagram]");
    expect(rendered.artifact.assets).toEqual([
      expect.objectContaining({
        height: 120,
        kind: "diagram",
        mimeType: "image/svg+xml",
        width: 320
      })
    ]);
  });

  it("rasterizes Mermaid SVG to PNG for WeChat compatibility", async () => {
    const rasterize = vi.fn(() =>
      Promise.resolve({
        bytes: new Uint8Array([...PNG_HEADER, 7]),
        height: 240,
        mimeType: "image/png" as const,
        width: 640
      })
    );
    const rendered = await renderPublication(
      "```mermaid\nsequenceDiagram\n  A->>B: 保存草稿\n```",
      {
        metadata: { title: "Mermaid PNG" },
        platform: "wechat",
        rasterizeFormula: rasterize,
        renderMermaid: () =>
          Promise.resolve({
            bytes: new TextEncoder().encode(
              '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 120"></svg>'
            ),
            mimeType: "image/svg+xml",
            name: "diagram.svg"
          }),
        theme: "minimal"
      }
    );

    expect(rasterize).toHaveBeenCalledWith(
      expect.stringContaining("<svg"),
      true
    );
    expect(rendered.artifact.assets).toEqual([
      expect.objectContaining({
        kind: "diagram",
        mimeType: "image/png",
        name: "diagram.png"
      })
    ]);
  });

  it("blocks publishing when Mermaid syntax cannot be rendered", async () => {
    const rendered = await renderPublication(
      "```mermaid\nthis is not a diagram\n```",
      {
        metadata: { title: "Invalid Mermaid" },
        platform: "juejin",
        renderMermaid: () => Promise.reject(new Error("UnknownDiagramError")),
        theme: "minimal"
      }
    );

    expect(rendered.artifact.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "mermaid-render-failed",
          severity: "error"
        })
      ])
    );
  });

  it("removes unsafe custom CSS while preserving scoped presentation", () => {
    const sanitized = sanitizeCustomCss(`
      @import "https://example.com/bad.css";
      body { color: red; }
      #crosspost-root, body { font-weight: bold; }
      #crosspost-root p { color: #123; background-image: url(https://bad); }
    `);

    expect(sanitized).not.toContain("@import");
    expect(sanitized).not.toContain("body");
    expect(sanitized).not.toContain("font-weight");
    expect(sanitized).not.toContain("url(");
    expect(sanitized).toContain("color: #123");
  });

  it("keeps binding-only frontmatter changes out of the immutable source hash", async () => {
    const before = `---
crosspost:
  bindings: {}
---
# Same body
`;
    const after = `---
crosspost:
  bindings:
    zhihu:
      draftUrl: https://zhuanlan.zhihu.com/p/1
---
# Same body
`;

    const [beforeHash, afterHash] = await Promise.all([
      computeContentHash(before, { title: "Title" }),
      computeContentHash(after, { title: "Title" })
    ]);
    expect(afterHash).toBe(beforeHash);
  });
});
