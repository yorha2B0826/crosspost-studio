// @vitest-environment jsdom

import type { Diagnostic } from "@crosspost/protocol";
import { describe, expect, it, vi } from "vitest";

import {
  getWeChatCopyBlockingDiagnostics,
  htmlToPlainText,
  writeHtmlSourceToClipboard,
  writeRichHtmlToClipboard
} from "./clipboard.js";

class TestClipboardItem {
  readonly items: Record<string, Blob>;

  constructor(items: Record<string, Blob>) {
    this.items = items;
  }
}

function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      resolve(typeof reader.result === "string" ? reader.result : "");
    });
    reader.addEventListener("error", () => {
      reject(reader.error ?? new Error("Failed to read clipboard Blob."));
    });
    reader.readAsText(blob);
  });
}

describe("WeChat rich clipboard", () => {
  it("writes HTML and readable plain text representations", async () => {
    const write = vi.fn().mockResolvedValue(undefined);

    await writeRichHtmlToClipboard(
      '<section><h1>标题</h1><p>正文 <strong>加粗</strong> <svg data-crosspost-formula="inline" aria-label="LaTeX: E=mc^2"><path fill="currentColor"></path></svg></p></section>',
      { write },
      TestClipboardItem as unknown as typeof ClipboardItem
    );

    expect(write).toHaveBeenCalledOnce();
    const item = write.mock.calls[0]?.[0][0] as unknown as TestClipboardItem;
    const copiedHtml = await readBlobText(item.items["text/html"]!);
    expect(copiedHtml).toContain("<strong>加粗</strong>");
    expect(copiedHtml).toContain('data-crosspost-formula="inline"');
    expect(copiedHtml).toContain('fill="currentColor"');
    expect(await readBlobText(item.items["text/plain"]!)).toBe("标题正文 加粗");
  });

  it("extracts text without executing or exposing markup", () => {
    expect(htmlToPlainText("<p>第一段</p><script>ignored()</script><p>第二段</p>")).toBe(
      "第一段第二段"
    );
  });

  it("writes the exact HTML source expected by source-editor helpers", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const html =
      '<section><p>正文 <svg data-crosspost-formula="inline"><path fill="currentColor"></path></svg></p></section>';

    await writeHtmlSourceToClipboard(html, { writeText });

    expect(writeText).toHaveBeenCalledWith(html);
  });

  it("allows manual copy when only WeChat API requirements fail", () => {
    const diagnostics: Diagnostic[] = [
      {
        code: "wechat-cover-required",
        message: "cover",
        severity: "error"
      },
      {
        code: "wechat-author-too-long",
        message: "author",
        severity: "error"
      },
      {
        code: "wechat-title-too-long",
        message: "title",
        severity: "error"
      },
      {
        code: "image-resolution-failed",
        message: "image",
        severity: "error"
      }
    ];

    expect(getWeChatCopyBlockingDiagnostics(diagnostics)).toEqual([
      diagnostics[3]
    ]);
  });
});
