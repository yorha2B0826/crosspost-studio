// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as tabFlowModule from "../tab-flow";

const { executeScript } = vi.hoisted(() => ({
  executeScript: vi.fn()
}));

vi.mock("wxt/browser", () => ({
  browser: { scripting: { executeScript } }
}));
vi.mock("../tab-flow", async (importOriginal) => ({
  ...(await importOriginal<typeof tabFlowModule>()),
  pause: vi.fn(() => Promise.resolve()),
  reloadTabAndWait: vi.fn(() => Promise.resolve())
}));

import { verifyJianshuDraftContent } from "./jianshu";

function renderDraft(title: string, body: string, images = 0): void {
  document.body.innerHTML = `
    <div><div><div id="editor">
      <input type="text" placeholder="请输入标题" value="${title}" />
      <div class="kalamu-area" contenteditable="true">${body}${"<img />".repeat(images)}</div>
    </div></div></div>
  `;
}

describe("verifyJianshuDraftContent", () => {
  beforeEach(() => {
    executeScript.mockReset();
    document.body.innerHTML = "";
  });

  it("reports a structured diagnostic with the verified verdict", async () => {
    renderDraft("标题", "正文");
    executeScript.mockImplementation(({ args, func }: { args: unknown[]; func: (...parts: unknown[]) => string }) =>
      Promise.resolve([{ result: func(...args) }])
    );

    const verification = await verifyJianshuDraftContent(1, "标题", "正文", 0);

    expect(verification.verified).toBe(true);
    expect(verification.diagnostic).toContain("titleMatch=true");
    expect(verification.diagnostic).toContain("images=0/0");
  });

  it("explains a mismatch through the diagnostic instead of a bare false", async () => {
    renderDraft("错误标题", "正文");
    executeScript.mockImplementation(({ args, func }: { args: unknown[]; func: (...parts: unknown[]) => string }) =>
      Promise.resolve([{ result: func(...args) }])
    );

    const verification = await verifyJianshuDraftContent(1, "标题", "正文", 2);

    expect(verification.verified).toBe(false);
    expect(verification.diagnostic).toContain("titleMatch=false");
    expect(verification.diagnostic).toContain("images=0/2");
  });

  it("accepts Jianshu serialization that removes a short formula alternative", async () => {
    renderDraft(
      "标题",
      '<p>第一部分中文正文用于校验</p><p>第二部分和结尾保持完整</p><img src="https://cdn.example.com/formula.png" />'
    );
    executeScript.mockImplementation(({ args, func }: { args: unknown[]; func: (...parts: unknown[]) => string }) =>
      Promise.resolve([{ result: func(...args) }])
    );

    const verification = await verifyJianshuDraftContent(
      1,
      "标题",
      "第一部分中文正文用于校验公式E=mc2第二部分和结尾保持完整",
      1
    );

    expect(verification.verified).toBe(true);
    expect(verification.diagnostic).toContain("anchorCoverage=");
  });

  it("rejects a truncated Jianshu body even when its beginning matches", async () => {
    renderDraft(
      "标题",
      '<p>第一部分中文正文用于校验</p><img src="https://cdn.example.com/image.png" />'
    );
    executeScript.mockImplementation(({ args, func }: { args: unknown[]; func: (...parts: unknown[]) => string }) =>
      Promise.resolve([{ result: func(...args) }])
    );

    const verification = await verifyJianshuDraftContent(
      1,
      "标题",
      "第一部分中文正文用于校验第二部分必须完整保留第三部分也必须完整保留第四部分结束",
      1
    );

    expect(verification.verified).toBe(false);
    expect(verification.diagnostic).toContain("bodyMatch=false");
  });

  it("stops polling without touching the tab once the job is cancelled", async () => {
    const verification = await verifyJianshuDraftContent(
      1,
      "标题",
      "正文",
      0,
      () => true
    );

    expect(verification.verified).toBe(false);
    expect(executeScript).not.toHaveBeenCalled();
  });
});
