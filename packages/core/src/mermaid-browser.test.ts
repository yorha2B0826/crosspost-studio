// @vitest-environment jsdom

import { beforeAll, describe, expect, it } from "vitest";

import { browserRenderMermaidSvg } from "./mermaid-browser";

beforeAll(() => {
  Object.defineProperty(SVGElement.prototype, "getBBox", {
    configurable: true,
    value: () => ({
      bottom: 40,
      height: 40,
      left: 0,
      right: 160,
      top: 0,
      width: 160,
      x: 0,
      y: 0
    })
  });
  Object.defineProperty(SVGElement.prototype, "getComputedTextLength", {
    configurable: true,
    value: () => 80
  });
});

describe("browser Mermaid renderer", () => {
  it("renders Chinese Mermaid source to sanitized deterministic SVG", async () => {
    const source = "flowchart LR\n  A[Obsidian 源稿] --> B[平台草稿]";
    const [first, second] = await Promise.all([
      browserRenderMermaidSvg(source),
      browserRenderMermaidSvg(source)
    ]);
    const firstSvg = new TextDecoder().decode(first.bytes);
    const secondSvg = new TextDecoder().decode(second.bytes);

    expect(first).toMatchObject({
      mimeType: "image/svg+xml"
    });
    expect(first.name).toMatch(/^mermaid-[a-f0-9]{12}\.svg$/);
    expect(firstSvg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(firstSvg).toContain("viewBox=");
    expect(firstSvg).not.toMatch(
      /<script|<foreignObject|javascript:|onload=/i
    );
    expect(secondSvg).toBe(firstSvg);
  });
});
