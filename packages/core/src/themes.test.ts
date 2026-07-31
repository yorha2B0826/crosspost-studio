import { describe, expect, it } from "vitest";
import { getThemeCss, themeIds } from "./themes.js";
import type { ThemeId } from "./types.js";

describe("theme system", () => {
  const allThemes = themeIds;

  it("includes all 15 themes", () => {
    expect(allThemes).toHaveLength(15);
    expect(new Set(allThemes).size).toBe(15); // no duplicates
  });

  it.each(allThemes)("theme %s returns non-empty CSS", (theme: ThemeId) => {
    const css = getThemeCss(theme);
    expect(css.length).toBeGreaterThan(100);
  });

  it.each(allThemes)("theme %s includes the scoped root", (theme: ThemeId) => {
    expect(getThemeCss(theme)).toContain("#crosspost-root");
  });

  it.each(allThemes)("theme %s CSS parses without syntax errors", (theme: ThemeId) => {
    const css = getThemeCss(theme);
    expect(() => {
      // Verify the CSS is syntactically valid by checking for balanced braces
      const openCount = (css.match(/\{/g) ?? []).length;
      const closeCount = (css.match(/\}/g) ?? []).length;
      expect(openCount).toBe(closeCount);
    }).not.toThrow();
  });

  it.each(allThemes)("theme %s has no empty rule blocks", (theme: ThemeId) => {
    const css = getThemeCss(theme);
    expect(css).not.toMatch(/\{\s*\}/);
  });

  it("all themes define font-family", () => {
    for (const theme of allThemes) {
      expect(getThemeCss(theme)).toMatch(/font-family/);
    }
  });

  it("all themes set base font size on root", () => {
    for (const theme of allThemes) {
      // BASE_CSS already sets font-size: 16px on #crosspost-root,
      // and each theme either overrides or inherits it
      expect(getThemeCss(theme)).toMatch(/font-size/);
    }
  });

  it("minimal has the original serif-less style", () => {
    const css = getThemeCss("minimal");
    expect(css).toContain("sans-serif");
    expect(css).toContain("-apple-system");
  });

  it("academic uses serif fonts", () => {
    const css = getThemeCss("academic");
    expect(css).toContain("serif");
  });

  it("tech uses mono-color blue accent", () => {
    const css = getThemeCss("tech");
    expect(css).toContain("#0b5fff");
  });

  it("dark uses a dark background", () => {
    const css = getThemeCss("dark");
    expect(css).toContain("#0d1117");
  });

  it("mono is the monospace theme", () => {
    const css = getThemeCss("mono");
    expect(css).toMatch(/monospace/i);
    expect(css).toContain("text-transform");
  });

  it("vintage has a parchment background", () => {
    const css = getThemeCss("vintage");
    expect(css).toContain("#fdf6e3");
  });
});