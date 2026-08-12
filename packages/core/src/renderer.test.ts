import { describe, expect, it, vi } from "vitest";

import {
  computeContentHash,
  preprocessObsidianMarkdown,
  renderMathSvg,
  renderPublication,
  sanitizeCustomCss
} from "./index.js";

const PNG_HEADER = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

describe("publication renderer", () => {
  it("decorates academic headings with the reference part hierarchy", async () => {
    const rendered = await renderPublication(
      "# 编译器基础\n\n## 中间表示\n\n### 优化过程\n\n正文。",
      {
        metadata: { title: "学术主题" },
        platform: "wechat",
        theme: "academic"
      }
    );

    expect(rendered.artifact.html).toContain("PART 01");
    expect(rendered.artifact.html).toContain("crosspost-part-label");
    expect(rendered.artifact.html).toContain("crosspost-part-title");
    expect(rendered.artifact.html).toContain(">1.1</span>");
    expect(rendered.artifact.html).toContain("crosspost-subsection-marker");
    expect(rendered.artifact.html).toContain("Songti SC");
    expect(rendered.artifact.html).toContain("text-indent: 2em");
  });

  it("converts Obsidian image embeds and reports unsupported embeds", () => {
    const result = preprocessObsidianMarkdown("![[diagram.png|600]]\n![[chapter-note]]");

    expect(result.markdown).toContain("obsidian-asset:diagram.png");
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "unsupported-embed" })])
    );
  });

  it("embeds WeChat formulas in HTML while deduplicating ordinary images", async () => {
    const rasterizeFormula = vi.fn((_svg: string, display: boolean) =>
      Promise.resolve({
        bytes: new Uint8Array([...PNG_HEADER, display ? 2 : 1]),
        height: display ? 32 : 16,
        mimeType: "image/png" as const,
        width: display ? 120 : 40
      })
    );
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
          `<svg xmlns="http://www.w3.org/2000/svg" width="${display ? 120 : 40}" height="${display ? 32 : 16}"><path fill="currentColor" d="M0 0h1v1z"></path></svg>`,
        rasterizeFormula,
        resolveAsset: () => Promise.resolve({
          bytes: new Uint8Array([...PNG_HEADER, 9]),
          mimeType: "image/png",
          name: "same.png"
        }),
        theme: "minimal"
      }
    );

    expect(rendered.artifact.html).toContain("data-crosspost-formula");
    expect(rendered.artifact.html).toContain('fill="currentColor"');
    expect(rendered.artifact.html).toContain('aria-label="LaTeX: E=mc^2"');
    expect(rendered.artifact.html).not.toContain("<script");
    expect(rendered.artifact.html).not.toContain('img data-crosspost-formula');
    expect(rendered.artifact.markdown).toContain("$E=mc^2$");
    expect(rendered.artifact.markdown).toContain("$$\n\\int_0^1 x^2 dx\n$$");
    expect(rasterizeFormula).not.toHaveBeenCalled();
    expect(rendered.artifact.assets).toHaveLength(1);
    expect(
      rendered.artifact.assets.filter((asset) => asset.kind === "image")
    ).toHaveLength(1);
    expect(rendered.artifact.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects executable markup without collapsing WeChat formula blocks", async () => {
    const rendered = await renderPublication(
      "# 开始\n\n$$\nE=mc^2\n$$\n\n## 结束",
      {
        metadata: { title: "不安全公式" },
        platform: "wechat",
        renderFormula: () =>
          '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
        theme: "minimal"
      }
    );

    expect(rendered.artifact.html).not.toContain("<script");
    expect(rendered.artifact.markdown).toContain(
      "# 开始\n\n$$E=mc^2$$\n\n## 结束"
    );
    expect(rendered.artifact.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "formula-render-failed",
          severity: "error"
        })
      ])
    );
  });

  it("does not inline links emitted by MathJax formula extensions", async () => {
    const rendered = await renderPublication(
      "Inline $\\href{javascript:alert(1)}{x}$",
      {
        metadata: { title: "公式链接安全" },
        platform: "wechat",
        renderFormula: (latex, display) =>
          renderMathSvg(latex, display, "inherit"),
        theme: "minimal"
      }
    );

    expect(rendered.artifact.html).not.toContain("<a");
    expect(rendered.artifact.html).not.toContain("href=");
    expect(rendered.artifact.html).toContain("$\\href{javascript:alert(1)}{x}$");
    expect(rendered.artifact.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "formula-render-failed",
          severity: "error"
        })
      ])
    );
  });

  it("keeps real WeChat formulas readable through inherited dark-theme color", async () => {
    const rendered = await renderPublication(
      "Inline $E=mc^2$ and block:\n\n$$\n\\int_0^1 x^2 \\, dx = \\frac{1}{3}\n$$",
      {
        metadata: { title: "夜间公式" },
        platform: "wechat",
        renderFormula: (latex, display) =>
          renderMathSvg(latex, display, "inherit"),
        theme: "dark"
      }
    );

    expect(rendered.artifact.html).toContain("background: #0d1117");
    expect(rendered.artifact.html).toContain("color: inherit");
    expect(rendered.artifact.html).toContain("currentColor");
    expect(rendered.artifact.html).not.toContain("#1f2328");
    expect(rendered.artifact.assets).toHaveLength(0);
    expect(rendered.artifact.diagnostics).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "formula-render-failed" })
      ])
    );
  });

  it("preserves Markdown block separation for browser editors", async () => {
    const rendered = await renderPublication(
      "# 标题\n\n正文\n\n## 列表\n\n- 第一项\n- 第二项\n\n## 代码\n\n```ts\nconst n = 1;\n```\n\n## 图片\n\n![[same.png]]\n",
      {
        metadata: { title: "浏览器 Markdown" },
        platform: "csdn",
        resolveAsset: () =>
          Promise.resolve({
            bytes: new Uint8Array([...PNG_HEADER, 9]),
            mimeType: "image/png",
            name: "same.png"
          }),
        theme: "minimal"
      }
    );

    expect(rendered.artifact.markdown).toContain("# 标题\n\n正文");
    expect(rendered.artifact.markdown).toContain("## 列表\n\n- 第一项");
    expect(rendered.artifact.markdown).toContain(
      "## 代码\n\n```ts\nconst n = 1;\n```"
    );
    expect(rendered.artifact.markdown).toContain(
      "## 图片\n\n![same.png](crosspost-asset://"
    );
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
      "# 开始\n\n正文。\n\n## 流程图\n\n```mermaid\nflowchart LR\n  A[源稿] --> B[草稿]\n```\n\n## 结束\n\n收尾。\n",
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
    expect(rendered.artifact.markdown).toContain("# 开始\n\n正文。");
    expect(rendered.artifact.markdown).toContain(
      "## 流程图\n\n![Mermaid diagram]"
    );
    expect(rendered.artifact.markdown).toContain("\n\n## 结束\n\n收尾。");
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
