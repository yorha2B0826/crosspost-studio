import { describe, expect, it } from "vitest";
import { renderPublication } from "./index.js";
import { themeIds } from "./themes.js";

describe("all-theme render smoke", () => {
  it("renders a full-element article under every theme", async () => {
    const md = `# 中文标题

正文段落 **粗体** *斜体* [链接](https://obsidian.md/) 和行内公式 $E=mc^2$。

> 引用块内容

## 列表

- 第一项
- 第二项
  - 嵌套项

### 列表细节

- 三级列表项

## 表格

| 列A | 列B |
| --- | --- |
| 1 | 2 |

## 代码

\`\`\`ts
export const answer: number = 42;
\`\`\`

## 图片

![[diagram.png]]

## 行间公式

$$
\\int_0^1 x^2\\,dx = \\frac{1}{3}
$$
`;
    const results: Array<{ theme: string; ok: boolean; htmlLen: number }> = [];
    for (const theme of themeIds) {
      const rendered = await renderPublication(md, {
        metadata: { title: "验收" },
        platform: "wechat",
        theme,
        renderFormula: (latex: string, display: boolean) =>
          `<svg xmlns="http://www.w3.org/2000/svg" width="${display ? 120 : 40}" height="${display ? 32 : 16}"><path fill="currentColor" d="M0 0h1v1z"/></svg>`,
        resolveAsset: () =>
          Promise.resolve({
            bytes: new Uint8Array([137, 80, 78, 71]),
            mimeType: "image/png",
            name: "diagram.png"
          }),
        renderMermaid: () =>
          Promise.resolve({
            bytes: new Uint8Array([137, 80, 78, 71]),
            mimeType: "image/png" as const,
            name: "mermaid.png"
          }),
      });
      const html = rendered.artifact.html;
      const checks = {
        styleAttr: html.includes('style="'),
        hasH1: html.includes("<h1"),
        hasH2: html.includes("<h2"),
        hasP: html.includes("<p"),
        hasBlockquote: html.includes("<blockquote"),
        hasTable: html.includes("<table"),
        hasCode: html.includes("<code"),
        hasImg: html.includes("<img"),
        noPseudo: !html.includes("::before") &&
          !html.includes("::after") &&
          !html.includes(":hover"),
        noGradient: !html.includes("linear-gradient"),
        h1Decorated: html.includes("PART 01") &&
          html.includes("crosspost-part-label") &&
          html.includes("crosspost-part-title"),
        h2Decorated: html.includes("1.1") &&
          html.includes("crosspost-section-number"),
        h3Decorated: html.includes("crosspost-subsection-marker"),
        headingsInlineStyled: html.includes('class="crosspost-section-number" style=')
      };
      results.push({
        theme,
        ok: Object.values(checks).every(Boolean),
        htmlLen: html.length
      });
      expect(checks, theme).toEqual(
        expect.objectContaining({
          styleAttr: true,
          hasH1: true,
          hasH2: true,
          hasP: true,
          hasBlockquote: true,
          hasTable: true,
          hasCode: true,
          hasImg: true,
          noPseudo: true,
          noGradient: true,
          h1Decorated: true,
          h2Decorated: true,
          h3Decorated: true,
          headingsInlineStyled: true
        })
      );
    }
    console.log(
      results
        .map((r) => `${r.theme.padEnd(9)} ${r.ok ? "OK" : "FAIL"} len=${r.htmlLen}`)
        .join("\n")
    );
  });

  it("keeps the academic theme's signature heading declarations after the factory migration", async () => {
    const rendered = await renderPublication(
      "# 标题\n\n## 小节\n\n### 子节\n",
      {
        metadata: { title: "学术主题" },
        platform: "wechat",
        theme: "academic"
      }
    );
    const html = rendered.artifact.html;
    expect(html).toContain("border-left: 4px solid #315b71");
    expect(html).toContain("letter-spacing: 0.055em");
    expect(html).toContain("color: #17364a");
    expect(html).toContain("font-size: 22px");
  });
});
