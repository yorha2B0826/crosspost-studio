import { describe, expect, it } from "vitest";
import { preprocessObsidianMarkdown } from "./obsidian-markdown.js";

describe("Obsidian Markdown preprocessor", () => {
  it("converts image wikilinks to standard markdown images", () => {
    const result = preprocessObsidianMarkdown("![[photo.png]]");
    expect(result.markdown).toContain("![photo.png](obsidian-asset:photo.png)");
    expect(result.diagnostics).toHaveLength(0);
  });

  it("uses label text when provided", () => {
    const result = preprocessObsidianMarkdown("![[photo.png|My Photo]]");
    expect(result.markdown).toContain("![My Photo](obsidian-asset:photo.png)");
  });

  it("supports multiple image formats", () => {
    const formats = ["png", "jpg", "jpeg", "gif", "svg", "webp", "avif"];
    for (const ext of formats) {
      const result = preprocessObsidianMarkdown(`![[img.${ext}]]`);
      expect(result.markdown).toContain("obsidian-asset:");
      expect(result.diagnostics).toHaveLength(0);
    }
  });

  it("emits a warning for non-image embeds", () => {
    const result = preprocessObsidianMarkdown("![[notes.pdf]]");
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe("unsupported-embed");
    expect(result.diagnostics[0]?.severity).toBe("warning");
    expect(result.markdown).toContain("[Crosspost warning:");
  });

  it("emits a warning for embedded markdown notes", () => {
    const result = preprocessObsidianMarkdown("![[other-note]]");
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe("unsupported-embed");
  });

  it("handles multiple wikilinks in one document", () => {
    const result = preprocessObsidianMarkdown(
      "Look: ![[a.png]] and ![[b.pdf]] and ![[c.jpg|Label]]"
    );
    expect(result.markdown).toContain("obsidian-asset:a.png");
    expect(result.markdown).toContain("obsidian-asset:c.jpg");
    expect(result.markdown).toContain("[Crosspost warning:");
    expect(result.diagnostics).toHaveLength(1); // only b.pdf is warned
  });

  it("handles wikilinks with paths", () => {
    const result = preprocessObsidianMarkdown("![[attachments/screenshot.png]]");
    expect(result.markdown).toContain("obsidian-asset:attachments%2Fscreenshot.png");
    expect(result.diagnostics).toHaveLength(0);
  });

  it("trims whitespace in targets", () => {
    const result = preprocessObsidianMarkdown("![[  spaced.png | Caption  ]]");
    expect(result.markdown).toContain("![Caption]");
    expect(result.markdown).toContain("obsidian-asset:spaced.png");
  });

  it("passes through text without wikilinks unchanged", () => {
    const input = "# Hello\n\nThis is **bold** and `code`.";
    const result = preprocessObsidianMarkdown(input);
    expect(result.markdown).toBe(input);
    expect(result.diagnostics).toHaveLength(0);
  });

  it("handles empty input", () => {
    const result = preprocessObsidianMarkdown("");
    expect(result.markdown).toBe("");
    expect(result.diagnostics).toHaveLength(0);
  });
});