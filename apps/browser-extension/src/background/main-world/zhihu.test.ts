// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TestClipboardEvent } from "../../lib/test-helpers";
import { stubClipboardGlobals } from "../../lib/test-helpers";

vi.mock("wxt/browser", () => ({ browser: {} }));

import { applyZhihuRichTextInPage } from "./zhihu";

beforeEach(() => {
  document.body.innerHTML = `
    <div class="DraftEditor-root">
      <div class="public-DraftEditor-content" contenteditable="true" role="textbox"></div>
    </div>
  `;
  stubClipboardGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Zhihu main-world writer", () => {
  it("accepts a native Draft.js paste only after the rich body remains stable", async () => {
    const editor = document.querySelector<HTMLElement>("[contenteditable]")!;
    editor.addEventListener("paste", (event) => {
      event.preventDefault();
      editor.innerHTML = (
        event as unknown as TestClipboardEvent
      ).clipboardData.getData("text/html");
    });

    const result = await applyZhihuRichTextInPage(
      "<section><h1>中文标题</h1><p>完整正文</p></section>"
    );

    expect(result.applied, result.message).toBe(true);
    expect(editor.textContent).toContain("完整正文");
  });

  it("invokes the live React paste handler when a DOM paste is ignored", async () => {
    const editor = document.querySelector<HTMLElement>("[contenteditable]")!;
    Object.defineProperty(editor, "__reactProps$crosspost", {
      configurable: true,
      value: {
        onPaste(event: { clipboardData: { getData: (type: string) => string } }) {
          editor.innerHTML = event.clipboardData.getData("text/html");
        }
      }
    });

    const result = await applyZhihuRichTextInPage(
      "<section><h1>React 标题</h1><p>React 正文</p></section>"
    );

    expect(result.applied, result.message).toBe(true);
    expect(editor.textContent).toContain("React 正文");
  });

  it("requires every native LaTeX payload to survive Draft.js conversion", async () => {
    const editor = document.querySelector<HTMLElement>("[contenteditable]")!;
    editor.addEventListener("paste", (event) => {
      event.preventDefault();
      editor.innerHTML = "<h1>公式标题</h1><p>公式前公式后</p>";
    });

    const result = await applyZhihuRichTextInPage(
      '<section><h1>公式标题</h1><p>公式前<span class="ztext-math" data-tex="E=mc^2">E=mc^2</span>公式后</p></section>'
    );

    expect(result.applied).toBe(false);
    expect(result.message).toContain("did not preserve");
  }, 10_000);

  it("rejects a Draft.js update that is rolled back before the stability window", async () => {
    const editor = document.querySelector<HTMLElement>("[contenteditable]")!;
    editor.innerHTML = "<p>旧正文</p>";
    editor.addEventListener("paste", (event) => {
      event.preventDefault();
      editor.innerHTML = (
        event as unknown as TestClipboardEvent
      ).clipboardData.getData("text/html");
      window.setTimeout(() => {
        editor.innerHTML = "<p>平台恢复的旧正文</p>";
      }, 100);
    });

    const result = await applyZhihuRichTextInPage(
      "<section><h1>新标题</h1><p>不能丢失的新正文</p></section>"
    );

    expect(result.applied).toBe(false);
    expect(result.message).toContain("did not preserve");
    expect(editor.textContent).toContain("平台恢复的旧正文");
  }, 10_000);
});
