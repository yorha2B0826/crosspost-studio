// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyDraftToVisibleEditor,
  extractEmbeddedImages,
  extractEmbeddedMarkdownImages,
  htmlToPlainText
} from "./dom-adapter";

beforeEach(() => {
  document.body.innerHTML = "";
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue({
    0: {} as DOMRect,
    item: () => null,
    length: 1
  } as unknown as DOMRectList);
  Object.defineProperty(document, "execCommand", {
    configurable: true,
    value: vi.fn((command: string) => command === "selectAll")
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("visible editor adapters", () => {
  it("extracts embedded image data into file uploads and leaves stable markers", () => {
    const result = extractEmbeddedImages(
      '<p>before<img alt="formula" src="data:image/png;base64,iVBORw0KGgo=">after</p>',
      "00000000-0000-4000-8000-000000000099"
    );

    expect(result.images).toHaveLength(1);
    expect(result.images[0]?.file).toMatchObject({
      name: "crosspost-0.png",
      type: "image/png"
    });
    expect(result.html).not.toContain("data:image/png");
    expect(result.html).toContain(
      "CROSSPOST_IMAGE_00000000000040008000000000000099_0"
    );
  });

  it("extracts Markdown data images without changing their surrounding syntax", () => {
    const result = extractEmbeddedMarkdownImages(
      "before\n\n![示例](data:image/png;base64,iVBORw0KGgo=)\n\n" +
        "![流程图](data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=)\n\nafter",
      "00000000-0000-4000-8000-000000000098"
    );

    expect(result.images).toHaveLength(2);
    expect(result.images[0]?.file.type).toBe("image/png");
    expect(result.images[1]?.file).toMatchObject({
      name: "crosspost-1.svg",
      type: "image/svg+xml"
    });
    expect(result.markdown).toContain(
      "![示例](CROSSPOST_IMAGE_00000000000040008000000000000098_0)"
    );
    expect(result.markdown).toContain(
      "![流程图](CROSSPOST_IMAGE_00000000000040008000000000000098_1)"
    );
    expect(result.markdown).not.toContain("data:image/png");
    expect(result.markdown).not.toContain("data:image/svg+xml");
  });

  it("uses rendered plain text instead of Markdown as Zhihu's clipboard fallback", () => {
    const text = htmlToPlainText(
      "<section><h2>标题</h2><p><strong>粗体</strong>与公式 " +
        '<span class="ztext-math" data-tex="E=mc^2">E=mc^2</span></p></section>'
    );

    expect(text).toContain("标题");
    expect(text).toContain("粗体与公式 E=mc^2");
    expect(text).not.toContain("##");
    expect(text).not.toContain("**");
  });

  it("fills a Zhihu fixture and requires a post-injection save signal", async () => {
    document.body.innerHTML = `
      <textarea placeholder="请输入标题"></textarea>
      <div class="DraftEditor-root"><div contenteditable="true" role="textbox"></div></div>
      <span class="SaveStatus">保存中</span>
    `;
    window.setTimeout(() => {
      document.querySelector(".SaveStatus")!.textContent = "草稿已保存";
    }, 0);

    const result = await applyDraftToVisibleEditor({
      html: "<section><h1>中文标题</h1><p>正文</p></section>",
      jobId: "00000000-0000-4000-8000-000000000000",
      markdown: "# 中文标题\n\n正文",
      platform: "zhihu",
      title: "中文标题"
    });

    expect(result.saved).toBe(true);
    expect(document.querySelector("textarea")?.value).toBe("中文标题");
    expect(document.querySelector("[contenteditable]")?.innerHTML).toContain("正文");
  });

  it("recognizes Zhihu's current timestamped draft status", async () => {
    document.body.innerHTML = `
      <textarea placeholder="请输入标题"></textarea>
      <div class="DraftEditor-root"><div contenteditable="true" role="textbox"></div></div>
      <div class="DraftStatusTip"><div>保存中</div></div>
    `;
    window.setTimeout(() => {
      document.querySelector(".DraftStatusTip div")!.textContent = "刚刚 · 草稿";
    }, 0);

    const result = await applyDraftToVisibleEditor({
      html: "<section><h1>中文标题</h1><p>正文</p></section>",
      jobId: "00000000-0000-4000-8000-000000000001",
      markdown: "# 中文标题\n\n正文",
      platform: "zhihu",
      title: "中文标题"
    });

    expect(result.saved).toBe(true);
  });

  it("continues with the live Zhihu editor after DraftJS replaces the cleared node", async () => {
    document.body.innerHTML = `
      <textarea placeholder="请输入标题"></textarea>
      <div class="DraftEditor-root">
        <div class="public-DraftEditor-content" contenteditable="true" role="textbox">
          <p>旧正文</p>
          <span class="FormulaCSR" data-tex="old"></span>
        </div>
      </div>
      <span class="SaveStatus">保存中</span>
    `;
    const staleEditor = document.querySelector<HTMLElement>("[contenteditable]")!;
    vi.spyOn(document, "execCommand").mockImplementation((command: string) => {
      if (command === "delete") {
        const liveEditor = staleEditor.cloneNode(false) as HTMLElement;
        staleEditor.replaceWith(liveEditor);
        return true;
      }
      return false;
    });
    window.setTimeout(() => {
      document.querySelector(".SaveStatus")!.textContent = "草稿已保存";
    }, 0);

    const result = await applyDraftToVisibleEditor({
      html: "<section><h1>新标题</h1><p>新正文</p></section>",
      jobId: "00000000-0000-4000-8000-000000000002",
      markdown: "# 新标题\n\n新正文",
      platform: "zhihu",
      title: "新标题"
    });

    const liveEditor = document.querySelector<HTMLElement>("[contenteditable]")!;
    expect(result.saved).toBe(true);
    expect(staleEditor.isConnected).toBe(false);
    expect(document.activeElement).toBe(liveEditor);
    expect(liveEditor.innerHTML).toContain("新正文");
    expect(liveEditor.textContent).not.toContain("旧正文");
  });

  it("stops when the expected editor DOM is absent", async () => {
    document.body.innerHTML = "<main>请登录</main>";

    const result = await applyDraftToVisibleEditor({
      html: "<p>正文</p>",
      jobId: "00000000-0000-4000-8000-000000000000",
      markdown: "正文",
      platform: "juejin",
      title: "标题"
    });

    expect(result).toMatchObject({
      errorCode: "editor-not-found",
      saved: false
    });
  });

  it("fills a Juejin Markdown fixture and waits for its save signal", async () => {
    document.body.innerHTML = `
      <input placeholder="请输入标题" />
      <div class="bytemd-editor"><div class="CodeMirror"><textarea></textarea></div></div>
      <span class="draft-status">保存中</span>
    `;
    window.setTimeout(() => {
      document.querySelector(".draft-status")!.textContent = "已保存";
    }, 0);

    const result = await applyDraftToVisibleEditor({
      html: "<p>掘金正文</p>",
      jobId: "00000000-0000-4000-8000-000000000000",
      markdown: "# 掘金正文",
      platform: "juejin",
      title: "掘金标题"
    });

    expect(result.saved).toBe(true);
    expect(document.querySelector("input")?.value).toBe("掘金标题");
    expect(
      document.querySelector<HTMLTextAreaElement>(".CodeMirror textarea")?.value
    ).toBe("# 掘金正文");
  });

  it.each([
    {
      editor: '<div class="monaco-editor"><textarea class="inputarea"></textarea></div>',
      platform: "csdn" as const,
      title: '<input id="txtTitle" />'
    },
    {
      editor: '<textarea id="markdownContent"></textarea>',
      platform: "oschina" as const,
      title: '<input name="title" />'
    },
    {
      editor: '<textarea id="post-body"></textarea>',
      platform: "cnblogs" as const,
      title: '<input id="post-title" />'
    }
  ])(
    "fills the visible $platform Markdown fixture and waits for save evidence",
    async ({ editor, platform, title }) => {
      document.body.innerHTML = `
        ${title}
        ${editor}
        <span class="save-status">保存中</span>
      `;
      window.setTimeout(() => {
        document.querySelector(".save-status")!.textContent = "已保存";
      }, 0);

      const result = await applyDraftToVisibleEditor({
        html: `<p>${platform} 正文</p>`,
        jobId: "00000000-0000-4000-8000-000000000010",
        markdown: `# ${platform} 正文`,
        platform,
        title: `${platform} 标题`
      });

      expect(result.saved).toBe(true);
      expect(document.querySelector<HTMLInputElement>("input")?.value).toBe(
        `${platform} 标题`
      );
      expect(document.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe(
        `# ${platform} 正文`
      );
    }
  );

  it("pastes a CSDN Markdown image as a file and waits for its uploaded URL", async () => {
    class TestDataTransfer {
      readonly files: File[] = [];
      readonly items = {
        add: (file: File): File => {
          this.files.push(file);
          return file;
        }
      };
      private readonly values = new Map<string, string>();

      getData(type: string): string {
        return this.values.get(type) ?? "";
      }

      setData(type: string, value: string): void {
        this.values.set(type, value);
      }
    }
    class TestClipboardEvent extends Event {
      readonly clipboardData: TestDataTransfer;

      constructor(
        type: string,
        init: EventInit & { clipboardData: TestDataTransfer }
      ) {
        super(type, init);
        this.clipboardData = init.clipboardData;
      }
    }
    vi.stubGlobal("DataTransfer", TestDataTransfer);
    vi.stubGlobal("ClipboardEvent", TestClipboardEvent);

    document.body.innerHTML = `
      <input id="txtTitle" />
      <div class="monaco-editor"><textarea class="inputarea"></textarea></div>
      <span class="save-status">保存中</span>
    `;
    const editor = document.querySelector<HTMLTextAreaElement>("textarea")!;
    editor.addEventListener("paste", (event) => {
      event.preventDefault();
      const transfer = (event as unknown as TestClipboardEvent).clipboardData;
      expect(transfer.files[0]?.type).toBe("image/png");
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      editor.setRangeText(
        "https://img.example.test/crosspost.png",
        start,
        end,
        "end"
      );
      editor.dispatchEvent(new InputEvent("input", { bubbles: true }));
      document.querySelector(".save-status")!.textContent = "已保存";
    });

    const result = await applyDraftToVisibleEditor({
      html: '<p><img src="data:image/png;base64,iVBORw0KGgo="></p>',
      jobId: "00000000-0000-4000-8000-000000000011",
      markdown: "![本地图片](data:image/png;base64,iVBORw0KGgo=)",
      platform: "csdn",
      title: "图片草稿"
    });

    expect(result.saved).toBe(true);
    expect(editor.value).toContain(
      "![本地图片](https://img.example.test/crosspost.png)"
    );
    expect(editor.value).not.toContain("CROSSPOST_IMAGE_");
    expect(editor.value).not.toContain("data:image/png");
  });

  it("rejects unresolved one-time asset markers", async () => {
    const result = await applyDraftToVisibleEditor({
      html: '<img src="crosspost-asset://missing">',
      jobId: "00000000-0000-4000-8000-000000000000",
      markdown: "![x](crosspost-asset://missing)",
      platform: "zhihu",
      title: "标题"
    });

    expect(result).toMatchObject({
      errorCode: "unresolved-assets",
      saved: false
    });
  });
});
