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

import { verifyCsdnDraftContent } from "./csdn";

describe("verifyCsdnDraftContent", () => {
  beforeEach(() => {
    executeScript.mockReset();
    document.body.innerHTML = "";
  });

  it("accepts exact Markdown and uploaded HTTP image URLs after reload", async () => {
    const markdown =
      "# 标题\n\n![图片](https://i-blog.csdnimg.cn/direct/image.png#pic_center)";
    document.body.innerHTML = `
      <input id="txtTitle" value="CSDN 标题" />
      <textarea class="editor">${markdown}</textarea>
    `;
    executeScript.mockImplementation(
      ({ args, func }: { args: unknown[]; func: (...parts: unknown[]) => unknown }) =>
        Promise.resolve([{ result: func(...args) }])
    );

    const result = await verifyCsdnDraftContent(
      1,
      "CSDN 标题",
      markdown,
      1
    );

    expect(result.verified).toBe(true);
    expect(result.diagnostic).toContain("bodyMatch=true");
    expect(result.diagnostic).toContain("images=1/1");
  });

  it("rejects a reloaded draft that lost an image", async () => {
    document.body.innerHTML = `
      <input id="txtTitle" value="CSDN 标题" />
      <textarea class="editor"># 标题</textarea>
    `;
    executeScript.mockImplementation(
      ({ args, func }: { args: unknown[]; func: (...parts: unknown[]) => unknown }) =>
        Promise.resolve([{ result: func(...args) }])
    );

    const result = await verifyCsdnDraftContent(1, "CSDN 标题", "# 标题", 1);

    expect(result.verified).toBe(false);
    expect(result.diagnostic).toContain("images=0/1");
  });
});
