import { describe, expect, it } from "vitest";
import { sanitizeCustomCss } from "./css.js";

describe("CSS sanitizer", () => {
  it("preserves whitelisted properties scoped under #crosspost-root", () => {
    const css = "#crosspost-root h1 { font-size: 2em; color: #333; }";
    const result = sanitizeCustomCss(css);
    expect(result).toContain("font-size: 2em");
    expect(result).toContain("color: #333");
  });

  it("strips selectors not scoped to #crosspost-root", () => {
    const css = `
      #crosspost-root p { line-height: 1.8; }
      body { background: red; }
      .global-class { color: blue; }
    `;
    const result = sanitizeCustomCss(css);
    expect(result).toContain("line-height: 1.8");
    expect(result).not.toContain("background: red");
    expect(result).not.toContain("color: blue");
  });

  it("allows child/descendant selectors under #crosspost-root", () => {
    const css = `
      #crosspost-root > p { margin: 0; }
      #crosspost-root h2 + h3 { margin-top: 0; }
      #crosspost-root li ~ li { margin-top: 2px; }
      #crosspost-root:hover { outline: none; }
      #crosspost-root[lang] { font-style: normal; }
      #crosspost-root .note { padding: 4px; }
      #crosspost-root#main { border: none; }
    `;
    const result = sanitizeCustomCss(css);
    expect(result).toContain("margin: 0");
    expect(result).toContain("margin-top: 0");
    expect(result).toContain("margin-top: 2px");
    expect(result).toContain("padding: 4px");
    expect(result).toContain("border: none");
  });

  it("blocks url() values", () => {
    const css = "#crosspost-root div { background: url('https://evil.com/x'); }";
    const result = sanitizeCustomCss(css);
    expect(result).not.toContain("url(");
    expect(result).not.toContain("evil.com");
  });

  it("blocks escaped values that could hide a URL token", () => {
    const css = "#crosspost-root div { background: u\\72l('https://evil.com/x'); }";
    const result = sanitizeCustomCss(css);
    expect(result).not.toContain("evil.com");
  });

  it("blocks expression() values", () => {
    const css = "#crosspost-root p { width: expression(alert(1)); }";
    const result = sanitizeCustomCss(css);
    expect(result).not.toContain("expression(");
  });

  it("blocks javascript: URIs", () => {
    const css =
      "#crosspost-root a { background: javascript:void(0); }";
    const result = sanitizeCustomCss(css);
    expect(result).not.toContain("javascript:");
  });

  it("removes @-rules", () => {
    const css = `
      @import url('bad.css');
      @font-face { font-family: Bad; src: url('x.woff'); }
      #crosspost-root p { color: green; }
      @media screen { #crosspost-root p { font-size: 14px; } }
    `;
    const result = sanitizeCustomCss(css);
    expect(result).toContain("color: green");
    expect(result).not.toContain("url(");
    expect(result).not.toContain("@media");
  });

  it("blocks unlisted CSS properties", () => {
    const css = "#crosspost-root div { position: absolute; top: 0; z-index: 999; opacity: 0.5; }";
    const result = sanitizeCustomCss(css);
    expect(result).not.toContain("position:");
    expect(result).not.toContain("top:");
    expect(result).not.toContain("z-index:");
    expect(result).not.toContain("opacity:");
  });

  it("returns empty string when nothing survives", () => {
    const css =
      "body { color: red; } .evil { background: url('x'); } @import 'x';";
    const result = sanitizeCustomCss(css).trim();
    expect(result).toBe("");
  });

  it("handles empty input", () => {
    expect(() => sanitizeCustomCss("")).not.toThrow();
    expect(sanitizeCustomCss("").trim()).toBe("");
  });

  it("preserves important flag in allowed properties", () => {
    const css = "#crosspost-root h1 { color: #000 !important; }";
    const result = sanitizeCustomCss(css);
    expect(result).toContain("!important");
    expect(result).toContain("color: #000");
  });

  it("handles comma-separated selectors under #crosspost-root", () => {
    const css =
      "#crosspost-root h1, #crosspost-root h2, #crosspost-root h3 { font-weight: bold; }";
    const result = sanitizeCustomCss(css);
    expect(result).toContain("font-weight: bold");
    expect(result).toContain("h1");
    expect(result).toContain("h2");
    expect(result).toContain("h3");
  });
});
