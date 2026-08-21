// @vitest-environment jsdom

import { Blob as NodeBlob } from "node:buffer";
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
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (document as unknown as { execCommand?: Document["execCommand"] })
    .execCommand;
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

  it("extracts complete Markdown data images as paste-safe insertion tokens", () => {
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
      "CROSSPOST_IMAGE_00000000000040008000000000000098_0"
    );
    expect(result.markdown).toContain(
      "CROSSPOST_IMAGE_00000000000040008000000000000098_1"
    );
    expect(result.markdown).not.toContain("![示例](CROSSPOST_IMAGE_");
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
    staleEditor.addEventListener("input", (event) => {
      if (event instanceof InputEvent && event.inputType === "deleteContentBackward") {
        const liveEditor = staleEditor.cloneNode(false) as HTMLElement;
        staleEditor.replaceWith(liveEditor);
      }
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
    expect(result.message).toContain("title=missing, body=missing");
    expect(result.message).toContain("visible controls: none");
  });

  it.each(["【无标题】", "CSDN 标题"])(
    "opens CSDN's collapsed %s title and fills its current Markdown editor",
    async (collapsedTitle) => {
      document.body.innerHTML = `
        <button id="collapsed-title">${collapsedTitle}</button>
        <pre class="editor__inner markdown-highlighting" contenteditable="true"></pre>
        <span class="save-status">保存中</span>
      `;
      document
        .querySelector("#collapsed-title")
        ?.addEventListener("click", (event) => {
          const input = document.createElement("input");
          input.value = "【无标题】";
          input.placeholder = "请输入文章标题（5~100个字）";
          (event.currentTarget as HTMLElement).replaceWith(input);
        });
      window.setTimeout(() => {
        document.querySelector(".save-status")!.textContent = "草稿已保存";
      }, 0);

      const result = await applyDraftToVisibleEditor({
        html: "<p>CSDN 正文</p>",
        jobId: "00000000-0000-4000-8000-000000000000",
        markdown: "# CSDN 正文",
        platform: "csdn",
        title: "CSDN 标题"
      });

      expect(result.saved).toBe(true);
      expect(document.querySelector<HTMLInputElement>("input")?.value).toBe(
        "CSDN 标题"
      );
      const editor = document.querySelector<HTMLElement>("pre");
      expect(editor?.innerText || editor?.textContent).toContain("CSDN 正文");
    }
  );

  it("inserts CSDN Markdown line breaks through the editor's native command model", async () => {
    document.body.innerHTML = `
      <input id="txtTitle" />
      <pre class="editor__inner markdown-highlighting" contenteditable="true">旧正文</pre>
      <span class="save-status">保存中</span>
    `;
    const editor = document.querySelector<HTMLElement>("pre")!;
    let model = editor.textContent ?? "";
    editor.addEventListener("input", (event) => {
      if ((event as InputEvent).inputType === "deleteContentBackward") {
        model = editor.textContent ?? "";
      }
    });
    const execCommandMock = vi.fn(
      (command: string, _showUi: boolean, value?: string | null): boolean => {
          if (command === "insertText") {
            model += value ?? "";
          } else if (command === "insertLineBreak") {
            model += "\n";
          } else {
            return false;
          }
          editor.textContent = model;
          editor.dispatchEvent(
            new InputEvent("input", { bubbles: true, inputType: command })
          );
          document.querySelector(".save-status")!.textContent = "草稿已保存";
          return true;
      }
    );
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommandMock
    });

    const markdown = "# 标题\n\n正文\n\n## 列表\n\n- 第一项\n- 第二项\n";
    const result = await applyDraftToVisibleEditor({
      html: "<h1>标题</h1><p>正文</p>",
      jobId: "00000000-0000-4000-8000-000000000022",
      markdown,
      platform: "csdn",
      title: "CSDN 原生换行"
    });

    expect(result.saved).toBe(true);
    expect(editor.textContent).toBe(markdown);
    expect(execCommandMock).toHaveBeenCalledWith(
      "insertLineBreak",
      false,
      null
    );
  });

  it("delegates CSDN Markdown replacement to the main-world runtime", async () => {
    document.body.innerHTML = `
      <input id="txtTitle" />
      <pre class="editor__inner markdown-highlighting" contenteditable="true">旧正文</pre>
      <span class="save-status">保存中</span>
    `;
    const editor = document.querySelector<HTMLElement>("pre")!;
    const setCsdnMarkdown = vi.fn((markdown: string) => {
      editor.textContent = markdown;
      document.querySelector(".save-status")!.textContent = "草稿已保存";
      return Promise.resolve(markdown);
    });
    const markdown = "# 标题\n\n正文\n\n- 第一项\n";

    const result = await applyDraftToVisibleEditor(
      {
        html: "<h1>标题</h1><p>正文</p>",
        jobId: "00000000-0000-4000-8000-000000000023",
        markdown,
        platform: "csdn",
        title: "CSDN 主世界写入"
      },
      { setCsdnMarkdown }
    );

    expect(result.saved).toBe(true);
    expect(setCsdnMarkdown).toHaveBeenCalledWith(markdown);
    expect(editor.textContent).toBe(markdown);
  });

  it("opens Jianshu's notebook landing page before filling a new article", async () => {
    document.body.innerHTML = `
      <button id="new-article">新建文章</button>
      <input class="collection-name" placeholder="请输入文集名..." />
    `;
    document.querySelector("#new-article")?.addEventListener("click", () => {
      document.body.insertAdjacentHTML(
        "beforeend",
        `
          <input placeholder="请输入标题" />
          <div id="arthur-editor" contenteditable="true"></div>
          <span class="save-status">保存中</span>
        `
      );
      window.setTimeout(() => {
        document.querySelector(".save-status")!.textContent = "已保存";
      }, 0);
    });

    const result = await applyDraftToVisibleEditor({
      html: "<p>简书正文</p>",
      jobId: "00000000-0000-4000-8000-000000000011",
      markdown: "简书正文",
      platform: "jianshu",
      title: "简书标题"
    });

    expect(result.saved).toBe(true);
    expect(
      document.querySelector<HTMLInputElement>("input[placeholder='请输入标题']")
        ?.value
    ).toBe("简书标题");
    expect(document.querySelector("#arthur-editor")?.innerHTML).toContain(
      "简书正文"
    );
  });

  it("fills Jianshu's current Kalamu editor without relying on hashed classes", async () => {
    document.body.innerHTML = `
      <div class="writer-pane">
        <p class="_3-3KB">保存中</p>
        <div class="article-fields">
          <input class="_24i7u" value="2026-08-04" />
          <div class="editor-shell">
            <div id="editor">
              <div class="kalamu-area" contenteditable="true"></div>
            </div>
          </div>
        </div>
      </div>
    `;
    window.setTimeout(() => {
      document.querySelector(".writer-pane > p")!.textContent = "已保存";
    }, 0);

    const result = await applyDraftToVisibleEditor({
      html: "<h1>简书正文</h1><p>富文本内容</p>",
      jobId: "00000000-0000-4000-8000-000000000012",
      markdown: "# 简书正文\n\n富文本内容",
      platform: "jianshu",
      title: "简书标题"
    });

    expect(result.saved).toBe(true);
    expect(document.querySelector<HTMLInputElement>(".article-fields > input")?.value)
      .toBe("简书标题");
    expect(document.querySelector(".kalamu-area")?.innerHTML).toContain(
      "简书正文"
    );
  });

  it("replaces an existing Jianshu article through the editor paste model", async () => {
    class TestDataTransfer {
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
      <div class="writer-pane">
        <p class="_3-3KB">已保存</p>
        <div class="article-fields">
          <input class="_24i7u" value="旧标题" />
          <div id="editor">
            <div class="kalamu-area" contenteditable="true"><p>旧正文</p></div>
          </div>
        </div>
      </div>
    `;
    const editor = document.querySelector<HTMLElement>(".kalamu-area")!;
    editor.addEventListener("paste", (event) => {
      event.preventDefault();
      const html = (event as unknown as TestClipboardEvent).clipboardData.getData(
        "text/html"
      );
      if (!html) {
        return;
      }
      editor.innerHTML = html.replaceAll(" ", "");
      document.querySelector(".writer-pane > p")!.textContent = "保存中";
      editor.dispatchEvent(
        new InputEvent("input", { bubbles: true, inputType: "insertFromPaste" })
      );
      window.setTimeout(() => {
        document.querySelector(".writer-pane > p")!.textContent = "已保存";
      }, 0);
    });

    const result = await applyDraftToVisibleEditor({
      html: "<h1>新正文</h1><p>完整 富文本 内容</p>",
      jobId: "00000000-0000-4000-8000-000000000047",
      markdown: "# 新正文\n\n完整 富文本 内容",
      platform: "jianshu",
      title: "新标题"
    });

    expect(result.saved).toBe(true);
    expect(editor.textContent).toContain("新正文");
    expect(editor.textContent).not.toContain("旧正文");
  });

  it("does not mistake restored Jianshu content for the replacement article", async () => {
    class TestDataTransfer {
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
      <div class="writer-pane">
        <p class="_3-3KB">已保存</p>
        <div class="article-fields">
          <input class="_24i7u" value="旧标题" />
          <div id="editor">
            <div class="kalamu-area" contenteditable="true"><p>旧正文</p></div>
          </div>
        </div>
      </div>
    `;
    const editor = document.querySelector<HTMLElement>(".kalamu-area")!;
    editor.addEventListener("paste", (event) => {
      event.preventDefault();
    });

    const result = await applyDraftToVisibleEditor({
      html: "<h1>未写入的新正文</h1>",
      jobId: "00000000-0000-4000-8000-000000000048",
      markdown: "# 未写入的新正文",
      platform: "jianshu",
      title: "新标题"
    });

    expect(result.saved).toBe(false);
    expect(result.unknown).toBe(true);
    expect(result.errorCode).toBe("editor-update-unconfirmed");
    expect(editor.textContent).toBe("旧正文");
  }, 7_000);

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

  it("fills the current OSChina rich-text editor and waits for autosave", async () => {
    document.body.innerHTML = `
      <input class="title-input" placeholder="请输入文章标题" />
      <div class="tiptap ProseMirror aie-content" contenteditable="true" role="textbox"></div>
      <span class="publish-right-title">文章将自动保存至草稿箱</span>
      <button>草稿箱</button>
    `;
    window.setTimeout(() => {
      document.querySelector(".publish-right-title")!.textContent =
        "文章已自动保存至草稿箱";
    }, 0);

    const result = await applyDraftToVisibleEditor({
      html: "<h1>开源中国正文</h1><p>富文本内容</p>",
      jobId: "00000000-0000-4000-8000-000000000011",
      markdown: "# 开源中国正文\n\n富文本内容",
      platform: "oschina",
      title: "开源中国标题"
    });

    expect(result.saved).toBe(true);
    expect(document.querySelector<HTMLInputElement>("input")?.value).toBe(
      "开源中国标题"
    );
    expect(document.querySelector(".aie-content")?.innerHTML).toContain(
      "开源中国正文"
    );
  });

  it("switches the OSChina AI wizard to its visible editor before filling", async () => {
    document.body.innerHTML = `
      <input placeholder="请输入文章标题" />
      <button>切换到MD编辑器</button>
      <button>草稿箱</button>
      <span class="publish-right-title">文章将自动保存至草稿箱</span>
    `;
    document.querySelector("button")!.addEventListener("click", () => {
      document.body.insertAdjacentHTML(
        "beforeend",
        '<div class="tiptap ProseMirror aie-content" contenteditable="true" role="textbox"></div>'
      );
      window.setTimeout(() => {
        document.querySelector(".publish-right-title")!.textContent =
          "文章已自动保存至草稿箱";
      }, 0);
    });

    const result = await applyDraftToVisibleEditor({
      html: "<h1>开源中国正文</h1><p>富文本内容</p>",
      jobId: "00000000-0000-4000-8000-000000000013",
      markdown: "# 开源中国正文\n\n富文本内容",
      platform: "oschina",
      title: "开源中国标题"
    });

    expect(result.saved).toBe(true);
    expect(document.querySelector<HTMLInputElement>("input")?.value).toBe(
      "开源中国标题"
    );
    expect(document.querySelector(".aie-content")?.innerHTML).toContain(
      "开源中国正文"
    );
  });

  it.each([
    {
      editor: '<div class="monaco-editor"><textarea class="inputarea"></textarea></div>',
      platform: "csdn" as const,
      title: '<input id="txtTitle" />'
    },
    {
      editor: '<textarea id="post-body"></textarea>',
      platform: "cnblogs" as const,
      title: '<input id="post-title" />'
    },
    {
      editor: '<textarea name="text"></textarea>',
      platform: "segmentfault" as const,
      title: '<input name="title" />'
    },
    {
      editor: '<textarea id="content"></textarea>',
      platform: "51cto" as const,
      title: '<input id="title" />'
    },
    {
      editor: '<div class="CodeMirror"><textarea></textarea></div>',
      platform: "tencentcloud" as const,
      title: '<input placeholder="请输入文章标题" />'
    }
  ])(
    "fills the visible $platform Markdown fixture and waits for save evidence",
    async ({ editor, platform, title }) => {
      document.body.innerHTML = `
        ${title}
        ${editor}
        <span class="save-status">保存中</span>
        ${
          platform === "cnblogs"
            ? "<button>存为草稿</button>"
            : platform === "tencentcloud"
              ? "<button>存草稿</button>"
              : ""
        }
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

  it("fills the current Blog Park Markdown editor and clicks only save draft", async () => {
    document.body.innerHTML = `
      <input id="post-title" class="field__control field__control--title" />
      <textarea id="md-editor" class="not-resizable"></textarea>
      <button>存为草稿</button>
      <button>发布</button>
    `;
    const saveDraft = document.querySelector<HTMLButtonElement>("button")!;
    const publish = document.querySelectorAll<HTMLButtonElement>("button")[1]!;
    const publishClick = vi.fn();
    publish.addEventListener("click", publishClick);
    saveDraft.addEventListener("click", () => {
      const status = document.createElement("div");
      status.className = "message-panel-header";
      status.dataset.elLocator = "post-saved-page";
      status.textContent = "保存成功";
      document.body.append(status);
    });

    const result = await applyDraftToVisibleEditor({
      html: "<p>博客园正文</p>",
      jobId: "00000000-0000-4000-8000-000000000023",
      markdown: "# 博客园正文",
      platform: "cnblogs",
      title: "博客园标题"
    });

    expect(result.saved).toBe(true);
    expect(document.querySelector<HTMLInputElement>("input")?.value).toBe(
      "博客园标题"
    );
    expect(document.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe(
      "# 博客园正文"
    );
    expect(publishClick).not.toHaveBeenCalled();
  });

  it("updates an existing Blog Park draft through its save-draft action", async () => {
    document.body.innerHTML = `
      <input id="post-title" />
      <textarea id="md-editor"></textarea>
      <button>保存草稿</button>
      <button>发布草稿</button>
    `;
    const saveDraft = document.querySelector<HTMLButtonElement>("button")!;
    const publishDraft = document.querySelectorAll<HTMLButtonElement>("button")[1]!;
    const publishClick = vi.fn();
    publishDraft.addEventListener("click", publishClick);
    saveDraft.addEventListener("click", () => {
      const status = document.createElement("div");
      status.className = "message-panel-header";
      status.dataset.elLocator = "post-saved-page";
      status.textContent = "保存成功";
      document.body.append(status);
    });

    const result = await applyDraftToVisibleEditor({
      html: "<p>博客园更新正文</p>",
      jobId: "00000000-0000-4000-8000-000000000025",
      markdown: "# 博客园更新正文",
      platform: "cnblogs",
      title: "博客园更新标题"
    });

    expect(result.saved).toBe(true);
    expect(document.querySelector<HTMLInputElement>("#post-title")?.value).toBe(
      "博客园更新标题"
    );
    expect(document.querySelector<HTMLTextAreaElement>("#md-editor")?.value).toBe(
      "# 博客园更新正文"
    );
    expect(publishClick).not.toHaveBeenCalled();
  });

  it("fills Tencent Cloud's current Tiptap editor and clicks only save draft", async () => {
    document.body.innerHTML = `
      <textarea class="cdc-article-editor__title-input" placeholder="请输入标题"></textarea>
      <div class="tiptap ProseMirror cdc-rich-editor" contenteditable="true"></div>
      <button>存草稿</button>
      <button>去发布</button>
      <div role="alert"></div>
    `;
    const saveDraft = document.querySelector<HTMLButtonElement>("button")!;
    const publish = document.querySelectorAll<HTMLButtonElement>("button")[1]!;
    const publishClick = vi.fn();
    publish.addEventListener("click", publishClick);
    saveDraft.addEventListener("click", () => {
      document.querySelector("[role='alert']")!.textContent = "保存草稿成功";
    });

    const result = await applyDraftToVisibleEditor({
      html: "<h2>腾讯云正文</h2><p>富文本</p>",
      jobId: "00000000-0000-4000-8000-000000000024",
      markdown: "## 腾讯云正文\n\n富文本",
      platform: "tencentcloud",
      title: "腾讯云标题"
    });

    expect(result.saved).toBe(true);
    expect(
      document.querySelector<HTMLTextAreaElement>(
        ".cdc-article-editor__title-input"
      )?.value
    ).toBe("腾讯云标题");
    expect(document.querySelector(".cdc-rich-editor")?.innerHTML).toContain(
      "腾讯云正文"
    );
    expect(publishClick).not.toHaveBeenCalled();
  });

  it.each([
    {
      editor:
        '<div class="ProseMirror" contenteditable="true" role="textbox"></div>',
      platform: "baijiahao" as const
    },
    {
      editor:
        '<div class="ProseMirror" contenteditable="true" role="textbox"></div>',
      platform: "toutiao" as const
    },
    {
      editor:
        '<div class="ql-editor" contenteditable="true" role="textbox"></div>',
      platform: "bilibili" as const
    },
    {
      editor:
        '<div class="ProseMirror" contenteditable="true" role="textbox"></div>',
      platform: "tencentcloud" as const
    }
  ])(
    "fills the visible $platform rich-text fixture and waits for save evidence",
    async ({ editor, platform }) => {
      document.body.innerHTML = `
        <textarea placeholder="请输入标题"></textarea>
        ${editor}
        <span class="${platform === "bilibili" ? "save-tip" : "draft-status"}">保存中</span>
        ${
          platform === "bilibili" || platform === "baijiahao"
            ? `<button>${platform === "bilibili" ? "保存为草稿" : "存草稿"}</button>`
            : platform === "tencentcloud"
              ? "<button>存草稿</button>"
              : ""
        }
      `;
      const confirmSaved = (): void => {
        document.querySelector(
          platform === "bilibili" ? ".save-tip" : ".draft-status"
        )!.textContent =
          platform === "toutiao" ? "已保存至草稿箱" : "草稿已保存";
      };
      if (
        platform === "baijiahao" ||
        platform === "bilibili" ||
        platform === "tencentcloud"
      ) {
        document.querySelector("button")!.addEventListener("click", confirmSaved);
      } else {
        window.setTimeout(confirmSaved, 0);
      }

      const result = await applyDraftToVisibleEditor({
        html: `<section><h2>${platform} 正文</h2><p><strong>粗体</strong></p></section>`,
        jobId: "00000000-0000-4000-8000-000000000012",
        markdown: `## ${platform} 正文\n\n**粗体**`,
        platform,
        title: `${platform} 标题`
      });

      expect(result.saved).toBe(true);
      expect(document.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe(
        `${platform} 标题`
      );
      expect(document.querySelector<HTMLElement>("[contenteditable]")?.innerHTML)
        .toContain("<strong>粗体</strong>");
    }
  );

  it("replaces an existing Toutiao article through its ProseMirror paste model", async () => {
    class TestDataTransfer {
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
      <textarea placeholder="请输入标题">旧标题</textarea>
      <div class="ProseMirror" contenteditable="true" role="textbox"><p>旧正文</p></div>
      <span class="draft-status">已保存至草稿箱</span>
    `;
    const editor = document.querySelector<HTMLElement>(".ProseMirror")!;
    editor.addEventListener("paste", (event) => {
      event.preventDefault();
      const html = (event as unknown as TestClipboardEvent).clipboardData.getData(
        "text/html"
      );
      if (!html) {
        return;
      }
      editor.innerHTML = html;
      document.querySelector(".draft-status")!.textContent = "保存中";
      editor.dispatchEvent(
        new InputEvent("input", { bubbles: true, inputType: "insertFromPaste" })
      );
      window.setTimeout(() => {
        document.querySelector(".draft-status")!.textContent = "已保存至草稿箱";
      }, 0);
    });

    const result = await applyDraftToVisibleEditor({
      html: "<h2>今日头条新正文</h2><p><strong>完整富文本</strong></p>",
      jobId: "00000000-0000-4000-8000-000000000049",
      markdown: "## 今日头条新正文\n\n**完整富文本**",
      platform: "toutiao",
      title: "今日头条新标题"
    });

    expect(result.saved).toBe(true);
    expect(document.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe(
      "今日头条新标题"
    );
    expect(editor.textContent).toContain("今日头条新正文");
    expect(editor.textContent).not.toContain("旧正文");
  });

  it("waits for Toutiao's asynchronously mounted editor before reporting it missing", async () => {
    class TestDataTransfer {
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

    window.setTimeout(() => {
      document.body.innerHTML = `
        <textarea placeholder="请输入标题"></textarea>
        <div class="ProseMirror" contenteditable="true" role="textbox"></div>
      `;
      const editor = document.querySelector<HTMLElement>(".ProseMirror")!;
      editor.addEventListener("paste", (event) => {
        event.preventDefault();
        editor.innerHTML = (
          event as unknown as TestClipboardEvent
        ).clipboardData.getData("text/html");
        editor.dispatchEvent(
          new InputEvent("input", { bubbles: true, inputType: "insertFromPaste" })
        );
      });
    }, 50);

    const result = await applyDraftToVisibleEditor({
      html: "<p>异步挂载后的正文</p>",
      jobId: "00000000-0000-4000-8000-000000000052",
      markdown: "异步挂载后的正文",
      platform: "toutiao",
      title: "异步挂载标题"
    });

    expect(result).toMatchObject({
      bodyText: "异步挂载后的正文",
      saved: true
    });
    expect(document.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe(
      "异步挂载标题"
    );
  }, 6_000);

  it("accepts Toutiao media markers without dropping text around an inline formula", async () => {
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
      <textarea placeholder="请输入标题"></textarea>
      <div class="ProseMirror" contenteditable="true" role="textbox"></div>
      <span class="draft-status">保存中</span>
    `;
    const editor = document.querySelector<HTMLElement>(".ProseMirror")!;
    editor.addEventListener("paste", (event) => {
      event.preventDefault();
      const transfer = (event as unknown as TestClipboardEvent).clipboardData;
      const html = transfer.getData("text/html");
      if (html) {
        editor.innerHTML = html;
        editor.dispatchEvent(
          new InputEvent("input", { bubbles: true, inputType: "insertFromPaste" })
        );
        return;
      }

      expect(transfer.files[0]?.type).toBe("image/png");
      const range = window.getSelection()!.getRangeAt(0);
      range.deleteContents();
      const platformMarker = document.createElement("span");
      platformMarker.textContent = "[图片]";
      const uploadedImage = document.createElement("img");
      uploadedImage.src = "https://p3-sign.toutiaoimg.com/crosspost-formula.png";
      Object.defineProperties(uploadedImage, {
        complete: { value: true },
        naturalWidth: { value: 216 }
      });
      range.insertNode(platformMarker);
      platformMarker.after(uploadedImage);
      editor.dispatchEvent(
        new InputEvent("input", { bubbles: true, inputType: "insertFromPaste" })
      );
      window.setTimeout(() => {
        document.querySelector(".draft-status")!.textContent = "已保存至草稿箱";
      }, 0);
    });

    const result = await applyDraftToVisibleEditor({
      html:
        '<p>这是一段包含<strong>粗体</strong>和行内公式' +
        '<img alt="LaTeX" src="data:image/png;base64,iVBORw0KGgo=">的中文正文。</p>',
      jobId: "00000000-0000-4000-8000-000000000050",
      markdown: "这是一段包含**粗体**和行内公式 $E=mc^2$ 的中文正文。",
      platform: "toutiao",
      title: "今日头条行内公式"
    });

    expect(result.saved).toBe(true);
    expect(editor.textContent).toContain("这是一段包含粗体和行内公式");
    expect(editor.textContent).toContain("的中文正文。");
    expect(editor.textContent).toContain("[图片]");
    expect(editor.querySelectorAll("img")).toHaveLength(1);
  });

  it("returns rich Toutiao readback for server verification when no save label appears", async () => {
    class TestDataTransfer {
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
      <textarea placeholder="请输入标题"></textarea>
      <div class="ProseMirror" contenteditable="true" role="textbox"></div>
    `;
    const editor = document.querySelector<HTMLElement>(".ProseMirror")!;
    editor.addEventListener("paste", (event) => {
      event.preventDefault();
      const html = (event as unknown as TestClipboardEvent).clipboardData.getData(
        "text/html"
      );
      editor.innerHTML = html;
      editor.dispatchEvent(
        new InputEvent("input", { bubbles: true, inputType: "insertFromPaste" })
      );
    });

    const result = await applyDraftToVisibleEditor({
      html:
        '<h2>自动保存正文</h2><p>等待服务器回读。</p>' +
        '<p><img src="https://p3-sign.toutiaoimg.com/remote.png"></p>',
      jobId: "00000000-0000-4000-8000-000000000051",
      markdown: "## 自动保存正文\n\n等待服务器回读。",
      platform: "toutiao",
      title: "今日头条自动保存"
    });

    expect(result).toMatchObject({
      bodyText: "自动保存正文等待服务器回读。",
      imageCount: 1,
      saved: true
    });
    expect(result.message).toContain("verified after reload");
  }, 6_000);

  it("matches Baijiahao's current editor and requires the explicit draft action", async () => {
    document.body.innerHTML = `
      <baijiahao-title id="title-host"></baijiahao-title>
      <div class="FeEditorApp-_9ddb7e475b559749-editor FeEditorApp-_377c94a778c072b3-editor"
        data-lexical-editor="true" contenteditable="true"></div>
      <span class="autosave-status">自动保存</span>
      <div role="alert"></div>
      <button>存草稿</button>
      <button>发布</button>
    `;
    const titleRoot = document
      .querySelector<HTMLElement>("#title-host")!
      .attachShadow({ mode: "open" });
    titleRoot.innerHTML = `
      <div>请输入标题（2 - 64字）</div>
      <div role="textbox" contenteditable="plaintext-only"
        data-placeholder="请输入标题（2 - 64字）"></div>
    `;
    const saveDraft = document.querySelectorAll<HTMLButtonElement>("button")[0]!;
    const publish = document.querySelectorAll<HTMLButtonElement>("button")[1]!;
    const saveClick = vi.fn();
    const publishClick = vi.fn();
    saveDraft.addEventListener("click", () => {
      saveClick();
      document.querySelector("[role='alert']")!.textContent = "保存草稿成功";
    });
    publish.addEventListener("click", publishClick);

    const result = await applyDraftToVisibleEditor({
      html: "<section><h2>百家号正文</h2><p><strong>粗体</strong></p></section>",
      jobId: "00000000-0000-4000-8000-000000000025",
      markdown: "## 百家号正文\n\n**粗体**",
      platform: "baijiahao",
      title: "百家号验收标题"
    });

    expect(result.saved, result.message).toBe(true);
    expect(saveClick).toHaveBeenCalledOnce();
    expect(publishClick).not.toHaveBeenCalled();
    expect(titleRoot.querySelector<HTMLElement>("[role='textbox']")?.textContent)
      .toBe("百家号验收标题");
    expect(document.querySelector<HTMLElement>("[data-lexical-editor]")?.innerHTML)
      .toContain("<strong>粗体</strong>");
  });

  it("distinguishes Baijiahao's input-box title from its article body", async () => {
    document.body.innerHTML = `
      <div class="input-box">
        <div class="FeEditorApp-_9ddb7e475b559749-placeholder">请输入标题（2 - 64字）</div>
        <div class="title-inner">
          <div class="FeEditorApp-_9ddb7e475b559749-editor"
            contenteditable="true"></div>
        </div>
      </div>
      <div class="ProseMirror" contenteditable="true"></div>
      <div role="alert"></div>
      <button>存草稿</button>
      <button>发布</button>
    `;
    document.querySelectorAll<HTMLButtonElement>("button")[0]!.addEventListener(
      "click",
      () => {
        document.querySelector("[role='alert']")!.textContent = "保存草稿成功";
      }
    );
    const publishClick = vi.fn();
    document.querySelectorAll<HTMLButtonElement>("button")[1]!.addEventListener(
      "click",
      publishClick
    );

    const result = await applyDraftToVisibleEditor({
      html: "<p>真正的百家号正文</p>",
      jobId: "00000000-0000-4000-8000-000000000028",
      markdown: "真正的百家号正文",
      platform: "baijiahao",
      title: "input-box 标题"
    });

    expect(result.saved, result.message).toBe(true);
    expect(document.querySelector<HTMLElement>(".input-box [contenteditable]")?.textContent)
      .toBe("input-box 标题");
    expect(document.querySelector<HTMLElement>(".ProseMirror")?.textContent)
      .toContain("真正的百家号正文");
    expect(publishClick).not.toHaveBeenCalled();
  });

  it("uses Baijiahao's FeEditor title and UEditor article body independently", async () => {
    document.body.innerHTML = `
      <div class="input-box">
        <div class="FeEditorApp-_9ddb7e475b559749-placeholder">请输入标题（2 - 64字）</div>
      </div>
      <div class="FeEditorApp-_9ddb7e475b559749-container">
        <div class="FeEditorApp-_9ddb7e475b559749-editor FeEditorApp-_377c94a778c072b3-editor"
          contenteditable="true"></div>
      </div>
      <div class="editor-outter-wrapper">
        <div class="ueditor edui-default">
          <div class="edui-editor edui-default">
            <div class="edui-body-container"></div>
          </div>
        </div>
      </div>
      <div role="alert"></div>
      <button>存草稿</button>
      <button>发布</button>
    `;
    document.querySelectorAll<HTMLButtonElement>("button")[0]!.addEventListener(
      "click",
      () => {
        document.querySelector("[role='alert']")!.textContent = "保存草稿成功";
      }
    );
    const publishClick = vi.fn();
    document.querySelectorAll<HTMLButtonElement>("button")[1]!.addEventListener(
      "click",
      publishClick
    );

    const result = await applyDraftToVisibleEditor({
      html: "<h2>UEditor 正文</h2><p>完整文章</p>",
      jobId: "00000000-0000-4000-8000-000000000029",
      markdown: "## UEditor 正文\n\n完整文章",
      platform: "baijiahao",
      title: "FeEditor 标题"
    });

    expect(result.saved, result.message).toBe(true);
    expect(
      document.querySelector<HTMLElement>("[class*='FeEditorApp-'][class*='-editor']")
        ?.textContent
    ).toBe("FeEditor 标题");
    expect(document.querySelector<HTMLElement>(".edui-body-container")?.innerHTML)
      .toContain("<h2>UEditor 正文</h2>");
    expect(publishClick).not.toHaveBeenCalled();
  });

  it("fills Baijiahao's same-origin UEditor iframe body", async () => {
    document.body.innerHTML = `
      <div class="input-box">
        <div class="FeEditorApp-_9ddb7e475b559749-placeholder">请输入标题（2 - 64字）</div>
      </div>
      <div class="FeEditorApp-_9ddb7e475b559749-container">
        <div class="FeEditorApp-_9ddb7e475b559749-editor"
          contenteditable="true"></div>
      </div>
      <div class="editor-outter-wrapper">
        <div class="ueditor edui-default">
          <div class="edui-editor edui-default">
            <iframe class="edui-editor-iframeholder"></iframe>
          </div>
        </div>
      </div>
      <div role="alert"></div>
      <button>存草稿</button>
    `;
    const editorFrame = document.querySelector<HTMLIFrameElement>(
      ".edui-editor-iframeholder"
    )!;
    const editorBody = editorFrame.contentDocument!.body;
    editorBody.setAttribute("contenteditable", "true");
    let decoratedByUeditor = false;
    editorBody.addEventListener("input", () => {
      if (decoratedByUeditor) {
        return;
      }
      const heading = editorBody.querySelector("h2");
      if (heading) {
        heading.after(
          editorBody.ownerDocument.createTextNode("UEditor 辅助节点")
        );
        decoratedByUeditor = true;
      }
    });
    document.querySelector("button")!.addEventListener("click", () => {
      document.querySelector("[role='alert']")!.textContent = "保存草稿成功";
    });

    const result = await applyDraftToVisibleEditor({
      html: "<h2>iframe 正文</h2><p>完整文章</p>",
      jobId: "00000000-0000-4000-8000-000000000030",
      markdown: "## iframe 正文\n\n完整文章",
      platform: "baijiahao",
      title: "iframe UEditor 标题"
    });

    expect(result.saved, result.message).toBe(true);
    expect(
      document.querySelector<HTMLElement>("[class*='FeEditorApp-'][class*='-editor']")
        ?.textContent
    ).toBe("iframe UEditor 标题");
    expect(editorBody.innerHTML).toContain("<h2>iframe 正文</h2>");
    expect(editorBody.textContent).toContain("UEditor 辅助节点");
  });

  it("accepts Baijiahao's visually normal readback and uploads its iframe image", async () => {
    class FrameDataTransfer {
      private readonly values = new Map<string, string>();
      readonly items = { add: vi.fn() };

      getData(type: string): string {
        return this.values.get(type) ?? "";
      }

      setData(type: string, value: string): void {
        this.values.set(type, value);
      }
    }
    class FrameClipboardEvent extends Event {
      readonly clipboardData: FrameDataTransfer;

      constructor(
        type: string,
        init: EventInit & { clipboardData: FrameDataTransfer }
      ) {
        super(type, init);
        this.clipboardData = init.clipboardData;
      }
    }
    vi.stubGlobal("DataTransfer", FrameDataTransfer);
    vi.stubGlobal("ClipboardEvent", FrameClipboardEvent);

    document.body.innerHTML = `
      <div class="input-box">
        <div class="FeEditorApp-placeholder">请输入标题（2 - 64字）</div>
      </div>
      <div class="FeEditorApp-container">
        <div class="FeEditorApp-editor" contenteditable="true"></div>
      </div>
      <div class="editor-outter-wrapper">
        <div class="ueditor"><div class="edui-editor">
          <iframe class="edui-editor-iframeholder"></iframe>
        </div></div>
      </div>
      <div role="alert"></div>
      <button>存草稿</button>
    `;
    const editorFrame = document.querySelector<HTMLIFrameElement>(
      ".edui-editor-iframeholder"
    )!;
    const editorBody = editorFrame.contentDocument!.body;
    editorBody.setAttribute("contenteditable", "true");
    const interceptedRichPaste = vi.fn();
    editorBody.addEventListener("paste", (event) => {
      const transfer = (event as unknown as FrameClipboardEvent).clipboardData;
      event.preventDefault();
      const richHtml = transfer.getData("text/html");
      if (richHtml) {
        interceptedRichPaste();
        const brokenImage = editorBody.ownerDocument.createElement("img");
        brokenImage.src = "data:image/png;base64,iVBORw0KGgo=";
        editorBody.replaceChildren(brokenImage);
      } else {
        const paragraph = editorBody.querySelector("p");
        if (paragraph) {
          const hiddenHelper = editorBody.ownerDocument.createElement("span");
          hiddenHelper.style.display = "none";
          hiddenHelper.textContent = "UEditor 辅助文本";
          paragraph.replaceChildren(
            editorBody.ownerDocument.createTextNode("iframe "),
            hiddenHelper,
            editorBody.ownerDocument.createTextNode("图片正文")
          );
        }
        const uploadedImage = editorBody.ownerDocument.createElement("img");
        uploadedImage.src = "https://img.example.test/baijiahao-uploaded.png";
        Object.defineProperties(uploadedImage, {
          complete: { value: true },
          naturalWidth: { value: 640 }
        });
        editorBody.append(uploadedImage);
      }
      editorBody.dispatchEvent(new InputEvent("input", { bubbles: true }));
    });
    document.querySelector("button")!.addEventListener("click", () => {
      document.querySelector("[role='alert']")!.textContent = "保存草稿成功";
    });

    const result = await applyDraftToVisibleEditor({
      html:
        '<p>iframe 图片正文</p><img alt="测试图" src="data:image/png;base64,iVBORw0KGgo=">',
      jobId: "00000000-0000-4000-8000-000000000031",
      markdown: "iframe 图片正文",
      platform: "baijiahao",
      title: "iframe 图片标题"
    });

    expect(result.saved, result.message).toBe(true);
    expect(interceptedRichPaste).not.toHaveBeenCalled();
    expect(editorBody.textContent).toContain("UEditor 辅助文本");
    expect(editorBody.textContent).not.toContain("CROSSPOST_IMAGE_");
    expect(editorBody.querySelector("img")?.src).toBe(
      "https://img.example.test/baijiahao-uploaded.png"
    );
  });

  it("activates Baijiahao's lazy title control without reusing its body editor", async () => {
    document.body.innerHTML = `
      <div id="title-placeholder">请输入标题（2 - 64字）</div>
      <baijiahao-title id="lazy-title"></baijiahao-title>
      <div class="article-editor">
        <div class="FeEditorApp-editor" contenteditable="true"></div>
      </div>
      <div role="alert"></div>
      <button>存草稿</button>
    `;
    const titleHost = document.querySelector<HTMLElement>("#lazy-title")!;
    const titleRoot = titleHost.attachShadow({ mode: "open" });
    document.querySelector("#title-placeholder")!.addEventListener("click", () => {
      titleRoot.innerHTML =
        '<textarea placeholder="请输入标题（2 - 64字）"></textarea>';
    });
    document.querySelector("button")!.addEventListener("click", () => {
      document.querySelector("[role='alert']")!.textContent = "保存草稿成功";
    });

    const result = await applyDraftToVisibleEditor({
      html: "<p>正文不能被当成标题</p>",
      jobId: "00000000-0000-4000-8000-000000000026",
      markdown: "正文不能被当成标题",
      platform: "baijiahao",
      title: "延迟标题控件"
    });

    expect(result.saved, result.message).toBe(true);
    expect(titleRoot.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe(
      "延迟标题控件"
    );
    expect(document.querySelector(".FeEditorApp-editor")?.textContent).toContain(
      "正文不能被当成标题"
    );
  });

  it("finds Baijiahao's title control inside a same-origin component frame", async () => {
    document.body.innerHTML = `
      <iframe id="title-frame"></iframe>
      <div class="article-editor">
        <div class="FeEditorApp-editor" contenteditable="true"></div>
      </div>
      <div role="alert"></div>
      <button>存草稿</button>
    `;
    const titleDocument = document.querySelector<HTMLIFrameElement>(
      "#title-frame"
    )!.contentDocument!;
    titleDocument.body.innerHTML =
      '<textarea placeholder="请输入标题（2 - 64字）"></textarea>';
    vi.spyOn(
      titleDocument.querySelector<HTMLTextAreaElement>("textarea")!,
      "getClientRects"
    ).mockReturnValue({
      0: {} as DOMRect,
      item: () => null,
      length: 1
    } as unknown as DOMRectList);
    document.querySelector("button")!.addEventListener("click", () => {
      document.querySelector("[role='alert']")!.textContent = "保存草稿成功";
    });

    const result = await applyDraftToVisibleEditor({
      html: "<p>跨 frame 正文</p>",
      jobId: "00000000-0000-4000-8000-000000000027",
      markdown: "跨 frame 正文",
      platform: "baijiahao",
      title: "跨 frame 标题"
    });

    expect(result.saved, result.message).toBe(true);
    expect(titleDocument.querySelector<HTMLTextAreaElement>("textarea")?.value)
      .toBe("跨 frame 标题");
    expect(document.querySelector(".FeEditorApp-editor")?.textContent).toContain(
      "跨 frame 正文"
    );
  });

  it("uses rendered text for a rich editor's plain-text paste fallback", async () => {
    class TestDataTransfer {
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
      <textarea placeholder="请输入标题"></textarea>
      <div class="ProseMirror" contenteditable="true" role="textbox"></div>
      <span class="draft-status">保存中</span>
      <button>存草稿</button>
    `;
    const editor = document.querySelector<HTMLElement>("[contenteditable]")!;
    editor.addEventListener("paste", (event) => {
      event.preventDefault();
      const transfer = (event as unknown as TestClipboardEvent).clipboardData;
      editor.textContent = transfer.getData("text/plain");
      editor.dispatchEvent(new InputEvent("input", { bubbles: true }));
    });
    document.querySelector("button")!.addEventListener("click", () => {
      document.querySelector(".draft-status")!.textContent = "保存草稿成功";
    });

    const result = await applyDraftToVisibleEditor({
      html: "<section><h2>标题</h2><p><strong>粗体</strong>正文</p></section>",
      jobId: "00000000-0000-4000-8000-000000000013",
      markdown: "## 标题\n\n**粗体**正文",
      platform: "baijiahao",
      title: "富文本回退"
    });

    expect(result.saved).toBe(true);
    expect(editor.textContent).toBe("标题粗体正文");
    expect(editor.textContent).not.toContain("**");
  });

  it("retries a safe rich-editor clear when the platform restores an image node", async () => {
    document.body.innerHTML = `
      <textarea placeholder="请输入标题"></textarea>
      <div class="ProseMirror" contenteditable="true" role="textbox">
        <p>旧正文</p>
        <figure><img src="https://img.example.test/old.png"></figure>
      </div>
      <span class="draft-status">保存中</span>
      <button>存草稿</button>
    `;
    const editor = document.querySelector<HTMLElement>("[contenteditable]")!;
    let deleteInputCount = 0;
    let restoredImageOnce = false;
    editor.addEventListener("input", (event) => {
      if ((event as InputEvent).inputType === "deleteContentBackward") {
        deleteInputCount += 1;
      }
      if (!restoredImageOnce && !editor.textContent?.trim()) {
        restoredImageOnce = true;
        editor.innerHTML =
          '<figure><img src="https://img.example.test/stubborn.png"></figure>';
        return;
      }
      if (editor.textContent?.includes("新正文")) {
        document.querySelector(".draft-status")!.textContent = "内容已自动保存";
      }
    });
    document.querySelector("button")!.addEventListener("click", () => {
      document.querySelector(".draft-status")!.textContent = "保存草稿成功";
    });

    const result = await applyDraftToVisibleEditor({
      html: "<p>新正文</p>",
      jobId: "00000000-0000-4000-8000-000000000019",
      markdown: "新正文",
      platform: "baijiahao",
      title: "安全重复清空"
    });

    expect(result.saved).toBe(true);
    expect(deleteInputCount).toBe(2);
    expect(restoredImageOnce).toBe(true);
    expect(editor.textContent).toBe("新正文");
    expect(editor.querySelector("img")).toBeNull();
  });

  it("replaces an existing OSChina draft through one editor paste transaction", async () => {
    class TestDataTransfer {
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
      <textarea placeholder="请输入文章标题"></textarea>
      <div class="tiptap ProseMirror aie-content" contenteditable="true">
        <p>旧正文</p>
        <figure><img src="https://oscimg.example.test/old.png"></figure>
      </div>
      <button>草稿箱</button>
    `;
    const editor = document.querySelector<HTMLElement>("[contenteditable]")!;
    let deleteInputs = 0;
    editor.addEventListener("input", (event) => {
      if ((event as InputEvent).inputType.startsWith("delete")) {
        deleteInputs += 1;
      }
    });
    editor.addEventListener("paste", (event) => {
      event.preventDefault();
      const transfer = (event as unknown as TestClipboardEvent).clipboardData;
      editor.innerHTML = transfer.getData("text/html");
      editor.dispatchEvent(
        new InputEvent("input", { bubbles: true, inputType: "insertFromPaste" })
      );
    });
    document.querySelector("button")!.addEventListener("click", () => {
      const message = document.createElement("div");
      message.className = "ant-message-success";
      message.textContent = "保存草稿成功";
      document.body.append(message);
    });

    const result = await applyDraftToVisibleEditor({
      html: "<h2>新正文</h2><p>替换成功</p>",
      jobId: "00000000-0000-4000-8000-000000000020",
      markdown: "## 新正文\n\n替换成功",
      platform: "oschina",
      title: "开源中国更新"
    });

    expect(result.saved).toBe(true);
    expect(deleteInputs).toBe(0);
    expect(editor.textContent).toBe("新正文替换成功");
    expect(editor.querySelector("img")).toBeNull();
  });

  it("uploads consecutive Bilibili images through HTTP-backed Eva3 drops", async () => {
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
    class TestDragEvent extends Event {
      readonly dataTransfer: TestDataTransfer | null;

      constructor(
        type: string,
        init: EventInit & { dataTransfer?: TestDataTransfer | null }
      ) {
        super(type, init);
        this.dataTransfer = init.dataTransfer ?? null;
      }
    }
    vi.stubGlobal("DataTransfer", TestDataTransfer);
    vi.stubGlobal("ClipboardEvent", TestClipboardEvent);
    vi.stubGlobal("DragEvent", TestDragEvent);

    document.body.innerHTML = `
      <textarea class="title-input__inner" placeholder="请输入标题（建议30字以内）"></textarea>
      <div class="tiptap ProseMirror eva3-editor" contenteditable="true" role="textbox"></div>
      <span class="save-tip">保存中</span>
      <button>保存为草稿</button>
    `;
    const editor = document.querySelector<HTMLElement>("[contenteditable]")!;
    editor.addEventListener("paste", (event) => {
      event.preventDefault();
      const transfer = (event as unknown as TestClipboardEvent).clipboardData;
      const html = transfer.getData("text/html");
      if (html) {
        editor.innerHTML = html;
        editor.dispatchEvent(new InputEvent("input", { bubbles: true }));
        return;
      }
      expect(transfer.files[0]?.type).toBe("image/png");
      const range = window.getSelection()!.getRangeAt(0);
      const wrapper = document.createElement("div");
      wrapper.className = "eva3-enhanced-image-wrapper";
      const localImage = document.createElement("img");
      localImage.src = "data:image/png;base64,iVBORw0KGgo=";
      wrapper.append(localImage);
      range.insertNode(wrapper);
      editor.dispatchEvent(new InputEvent("input", { bubbles: true }));
    });
    editor.addEventListener("dragover", (event) => event.preventDefault());
    let uploadCount = 0;
    editor.addEventListener("drop", (event) => {
      event.preventDefault();
      const transfer = (event as unknown as TestDragEvent).dataTransfer;
      expect(transfer?.files[0]?.type).toBe("image/png");
      const range = window.getSelection()!.getRangeAt(0);
      const uploadedImage = document.createElement("img");
      uploadCount += 1;
      uploadedImage.src = `http://i0.hdslb.com/bfs/new_dyn/crosspost-${uploadCount}.png`;
      Object.defineProperties(uploadedImage, {
        complete: { value: true },
        naturalWidth: { value: 216 }
      });
      range.insertNode(uploadedImage);
      editor.dispatchEvent(new InputEvent("input", { bubbles: true }));
    });
    document.querySelector("button")!.addEventListener("click", () => {
      document.querySelector(".save-tip")!.textContent = "保存成功";
    });

    const result = await applyDraftToVisibleEditor({
      html:
        '<p>公式一：<img src="data:image/png;base64,iVBORw0KGgo="></p>' +
        '<p>公式二：<img src="data:image/png;base64,iVBORw0KGgo="></p>',
      jobId: "00000000-0000-4000-8000-000000000018",
      markdown: "公式",
      platform: "bilibili",
      title: "B站图片草稿"
    });

    expect(result.saved).toBe(true);
    expect(uploadCount).toBe(2);
    expect(editor.innerHTML).toContain(
      "http://i0.hdslb.com/bfs/new_dyn/crosspost-1.png"
    );
    expect(editor.innerHTML).toContain(
      "http://i0.hdslb.com/bfs/new_dyn/crosspost-2.png"
    );
    expect(editor.innerHTML).not.toContain("CROSSPOST_IMAGE_");
    expect(editor.innerHTML).not.toContain("data:image/png");
    expect(editor.querySelector(".eva3-enhanced-image-wrapper")).toBeNull();
  });

  it("accepts Bilibili native transient images before saved-draft readback", async () => {
    class TestDataTransfer {
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
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      value: () => ({ drawImage: vi.fn(), scale: vi.fn() })
    });
    Object.defineProperty(HTMLCanvasElement.prototype, "toBlob", {
      configurable: true,
      value: (callback: BlobCallback) => {
        callback(
          new NodeBlob([new Uint8Array([137, 80, 78, 71])], {
            type: "image/png"
          }) as unknown as Blob
        );
      }
    });
    class FakeImage {
      decoding = "auto";
      height = 20;
      naturalHeight = 20;
      naturalWidth = 40;
      ownerDocument = document;
      onerror: OnErrorEventHandler | null = null;
      onload: (() => void) | null = null;
      width = 40;

      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("Image", FakeImage);
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:bilibili-svg"),
      revokeObjectURL: vi.fn()
    });

    document.body.innerHTML = `
      <textarea class="title-input__inner" placeholder="请输入标题（建议30字以内）"></textarea>
      <div class="tiptap ProseMirror eva3-editor" contenteditable="true" role="textbox">
        <p>旧 B 站正文</p>
        <div class="eva3-enhanced-image-wrapper"><img src="http://i0.hdslb.com/old.png"></div>
      </div>
      <span class="save-tip">保存中</span>
      <button>保存为草稿</button>
    `;
    const editor = document.querySelector<HTMLElement>("[contenteditable]")!;
    editor.addEventListener("paste", (event) => {
      event.preventDefault();
      const transfer = (event as unknown as TestClipboardEvent).clipboardData;
      editor.innerHTML = transfer.getData("text/html");
      editor.dispatchEvent(
        new InputEvent("input", { bubbles: true, inputType: "insertFromPaste" })
      );
    });
    const uploadBilibiliImage = vi.fn((file: File) => {
      expect(file.type).toBe("image/png");
      const selection = window.getSelection();
      const selectedRange = selection?.rangeCount
        ? selection.getRangeAt(0).cloneRange()
        : undefined;
      if (!selectedRange) {
        return Promise.resolve(undefined);
      }
      selectedRange.collapse(true);
      const image = document.createElement("img");
      const uploadIndex = editor.querySelectorAll("img").length + 1;
      image.src = `data:image/png;base64,aW1hZ2U${uploadIndex}`;
      selectedRange.insertNode(image);
      editor.dispatchEvent(new InputEvent("input", { bubbles: true }));
      // The page-world uploader confirms the new image, but Bilibili may
      // normalize or replace its source before the content world observes it.
      return Promise.resolve(
        `blob:https://member.bilibili.com/native-upload-${uploadIndex}`
      );
    });
    document.querySelector("button")!.addEventListener("click", () => {
      document.querySelector(".save-tip")!.textContent = "保存成功";
    });

    const result = await applyDraftToVisibleEditor(
      {
        html:
          '<p>公式一：<img src="data:image/png;base64,iVBORw0KGgo="></p>' +
          '<p>流程图：<img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="></p>',
        jobId: "00000000-0000-4000-8000-000000000025",
        markdown: "公式",
        platform: "bilibili",
        title: "B站原生上传草稿"
      },
      { uploadBilibiliImage }
    );

    expect(result.saved).toBe(true);
    expect(uploadBilibiliImage).toHaveBeenCalledTimes(2);
    expect(editor.innerHTML).toContain(
      "data:image/png;base64,aW1hZ2U1"
    );
    expect(editor.innerHTML).toContain(
      "data:image/png;base64,aW1hZ2U2"
    );
    expect(editor.textContent).not.toContain("旧 B 站正文");
    expect(editor.innerHTML).not.toContain("old.png");
    expect(editor.innerHTML).not.toContain("CROSSPOST_IMAGE_");
  });

  it("treats a post-injection save-state class change as fresh evidence", async () => {
    document.body.innerHTML = `
      <input name="title" />
      <textarea name="text"></textarea>
      <span class="save-status">已保存</span>
    `;
    window.setTimeout(() => {
      document.querySelector(".save-status")!.classList.add("is-fresh");
    }, 0);

    const result = await applyDraftToVisibleEditor({
      html: "<p>正文</p>",
      jobId: "00000000-0000-4000-8000-000000000014",
      markdown: "正文",
      platform: "segmentfault",
      title: "标题"
    });

    expect(result.saved).toBe(true);
  });

  it.each([
    {
      editor: '<textarea name="text"></textarea>',
      html: "<p>正文</p>",
      markdown: "![损坏图片](data:image/png;base64,%%%%)",
      platform: "segmentfault" as const,
      title: '<input name="title" />'
    },
    {
      editor:
        '<div class="ProseMirror" contenteditable="true" role="textbox"></div>',
      html: '<p><img src="data:image/png;base64,%%%%"></p>',
      markdown: "正文",
      platform: "baijiahao" as const,
      title: '<textarea placeholder="请输入标题"></textarea>'
    }
  ])(
    "does not silently insert an invalid inline image into $platform",
    async ({ editor, html, markdown, platform, title }) => {
      document.body.innerHTML = `${title}${editor}`;

      const result = await applyDraftToVisibleEditor({
        html,
        jobId: "00000000-0000-4000-8000-000000000015",
        markdown,
        platform,
        title: "损坏图片"
      });

      expect(result).toMatchObject({
        errorCode: "invalid-inline-image",
        saved: false,
        unknown: true
      });
      expect(
        document.querySelector<HTMLTextAreaElement>("textarea[name='text']")?.value ??
          ""
      ).not.toContain("data:image");
      expect(
        document.querySelector<HTMLElement>("[contenteditable]")?.innerHTML ?? ""
      ).not.toContain("data:image");
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
        "![已上传](https://img.example.test/crosspost.png)",
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

  it("uses CSDN's visible image dialog when the current editor exposes it", async () => {
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
      <pre class="editor__inner markdown-highlighting" contenteditable="true"></pre>
      <button data-title="图片 – Command+Shift+G"></button>
      <span class="save-status">保存中</span>
    `;
    const editor = document.querySelector<HTMLElement>("pre")!;
    const pastedDocuments: string[] = [];
    editor.addEventListener("paste", (event) => {
      event.preventDefault();
      const transfer = (event as unknown as TestClipboardEvent).clipboardData;
      const markdown = transfer.getData("text/plain");
      pastedDocuments.push(markdown);
      editor.textContent =
        (editor.innerText || editor.textContent || "") + markdown;
      editor.dispatchEvent(new InputEvent("input", { bubbles: true }));
    });
    let uploadCount = 0;
    document.querySelector("button")!.addEventListener("click", () => {
      const dialog = document.createElement("div");
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-label", "Insert image");
      dialog.innerHTML = `
        <input type="file" accept="image/png,image/jpeg" />
        <button>确定</button>
      `;
      const input = dialog.querySelector<HTMLInputElement>("input")!;
      input.addEventListener("change", () => {
        expect(input.files?.[0]?.type).toBe("image/png");
      });
      dialog.querySelector("button")!.addEventListener("click", () => {
        uploadCount += 1;
        editor.textContent =
          (editor.innerText || editor.textContent || "") +
          `\n![已上传](https://img.csdn.test/crosspost-${uploadCount}.png)`;
        editor.dispatchEvent(new InputEvent("input", { bubbles: true }));
        document.querySelector(".save-status")!.textContent = "已保存";
        vi.spyOn(dialog, "getClientRects").mockReturnValue({
          item: () => null,
          length: 0
        } as unknown as DOMRectList);
      });
      document.body.append(dialog);
    });

    const result = await applyDraftToVisibleEditor({
      html: '<p><img src="data:image/png;base64,iVBORw0KGgo="></p>',
      jobId: "00000000-0000-4000-8000-000000000021",
      markdown:
        "图片一：![本地图片](data:image/png;base64,iVBORw0KGgo=)\n\n" +
        "图片二：![公式](data:image/png;base64,iVBORw0KGgo=)",
      platform: "csdn",
      title: "CSDN 图片对话框"
    });

    expect(result.saved).toBe(true);
    expect(uploadCount).toBe(2);
    const finalMarkdown = editor.innerText || editor.textContent || "";
    expect(finalMarkdown).toContain(
      "https://img.csdn.test/crosspost-1.png"
    );
    expect(finalMarkdown).toContain(
      "https://img.csdn.test/crosspost-2.png"
    );
    expect(finalMarkdown).not.toContain("CROSSPOST_IMAGE_");
    expect(finalMarkdown.match(/crosspost-1\.png/g)).toHaveLength(1);
    expect(finalMarkdown.match(/crosspost-2\.png/g)).toHaveLength(1);
    expect(finalMarkdown).toContain("图片一：![本地图片]");
    expect(finalMarkdown).toContain("图片二：![公式]");
    expect(finalMarkdown).toContain("\n\n图片二：");
    expect(pastedDocuments).toHaveLength(2);
  });

  it("uploads CodeMirror images before rewriting the final SegmentFault Markdown", async () => {
    class TestDataTransfer {
      readonly files: File[] = [];
      readonly items = {
        add: (file: File): File => {
          this.files.push(file);
          return file;
        }
      };
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
      <input id="title" name="title" />
      <div class="CodeMirror">
        <textarea></textarea>
        <pre class="CodeMirror-code"></pre>
      </div>
      <span class="save-status">保存中</span>
    `;
    const editor = document.querySelector<HTMLTextAreaElement>("textarea")!;
    const rendered = document.querySelector<HTMLElement>(".CodeMirror-code")!;
    editor.addEventListener("input", () => {
      if (editor.value) {
        rendered.textContent = editor.value;
        editor.value = "";
      }
      if (!rendered.textContent?.includes("CROSSPOST_IMAGE_")) {
        document.querySelector(".save-status")!.textContent = "已保存";
      }
    });
    editor.addEventListener("paste", (event) => {
      event.preventDefault();
      const transfer = (event as unknown as TestClipboardEvent).clipboardData;
      expect(transfer.files[0]?.type).toBe("image/png");
      rendered.textContent +=
        "\n![已上传](https://img.segmentfault.test/crosspost.png)";
    });

    const result = await applyDraftToVisibleEditor(
      {
        html: '<p><img src="data:image/png;base64,iVBORw0KGgo="></p>',
        jobId: "00000000-0000-4000-8000-000000000016",
        markdown:
          "# 思否图片草稿\n\n正文。\n\n- 项目\n  - 子项\n\n![本地图片](data:image/png;base64,iVBORw0KGgo=)",
        platform: "segmentfault",
        title: "思否图片草稿"
      },
      {
        setSegmentFaultMarkdown: (markdown) => {
          rendered.replaceChildren(
            ...markdown.split("\n").map((line) => {
              const renderedLine = document.createElement("pre");
              renderedLine.className = "CodeMirror-line";
              renderedLine.textContent = line
                ? line.replace(/^ {2}/, " \u00a0")
                : "\u200b";
              return renderedLine;
            })
          );
          if (!markdown.includes("CROSSPOST_IMAGE_")) {
            document.querySelector(".save-status")!.textContent = "已保存";
          }
          return Promise.resolve(markdown);
        }
      }
    );

    expect(result.saved).toBe(true);
    expect(rendered.textContent).toContain(
      "![本地图片](https://img.segmentfault.test/crosspost.png)"
    );
    expect(rendered.textContent).not.toContain("CROSSPOST_IMAGE_");
    expect(rendered.textContent).not.toContain("data:image/png");
    expect(result.bodyText).toContain("# 思否图片草稿\n\n正文。");
    expect(result.bodyText).toContain("\n  - 子项\n");
  });

  it("uses SegmentFault's image dialog before rebuilding CodeMirror Markdown", async () => {
    class TestDataTransfer {
      readonly files: File[] = [];
      readonly items = {
        add: (file: File): File => {
          this.files.push(file);
          return file;
        }
      };
    }
    vi.stubGlobal("DataTransfer", TestDataTransfer);

    document.body.innerHTML = `
      <input name="title" />
      <button class="icon-image"></button>
      <div class="CodeMirror">
        <textarea></textarea>
        <pre class="CodeMirror-code"></pre>
      </div>
      <span class="save-status">保存中</span>
    `;
    const editor = document.querySelector<HTMLTextAreaElement>("textarea")!;
    const rendered = document.querySelector<HTMLElement>(".CodeMirror-code")!;
    let finalDocumentBlurred = false;
    editor.addEventListener("blur", () => {
      if (!rendered.textContent?.includes("CROSSPOST_IMAGE_")) {
        finalDocumentBlurred = true;
        document.querySelector(".save-status")!.textContent = "已保存";
      }
    });
    editor.addEventListener("input", () => {
      if (editor.value) {
        rendered.textContent = editor.value;
        editor.value = "";
      }
      if (!rendered.textContent?.includes("CROSSPOST_IMAGE_")) {
        document.querySelector(".save-status")!.textContent = "已保存";
      }
    });
    document.querySelector("button")!.addEventListener("click", () => {
      const dialog = document.createElement("div");
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
      dialog.innerHTML = `
        <input type="file" id="editor.imgLink" />
        <button>确定</button>
      `;
      const input = dialog.querySelector<HTMLInputElement>("input")!;
      input.addEventListener("change", () => {
        expect(input.files?.[0]?.type).toBe("image/png");
      });
      dialog.querySelector("button")!.addEventListener("click", () => {
        rendered.textContent +=
          "\n![已上传](/img/dialog.png)";
        dialog.remove();
      });
      document.body.append(dialog);
    });

    const result = await applyDraftToVisibleEditor(
      {
        html: '<p><img src="data:image/png;base64,iVBORw0KGgo="></p>',
        jobId: "00000000-0000-4000-8000-000000000022",
        markdown: "图片：![本地图片](data:image/png;base64,iVBORw0KGgo=)",
        platform: "segmentfault",
        title: "思否图片对话框"
      },
      {
        setSegmentFaultMarkdown: (markdown) => {
          editor.focus();
          rendered.textContent = markdown;
          return Promise.resolve(markdown);
        }
      }
    );

    expect(result.saved).toBe(true);
    expect(rendered.textContent).toBe(
      "图片：![本地图片](http://localhost:3000/img/dialog.png)"
    );
    expect(finalDocumentBlurred).toBe(true);
    expect(rendered.textContent).not.toContain("CROSSPOST_IMAGE_");
  });

  it("rewrites 51CTO Markdown after uploads that ignore the selected token", async () => {
    class TestDataTransfer {
      readonly files: File[] = [];
      readonly items = {
        add: (file: File): File => {
          this.files.push(file);
          return file;
        }
      };
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
      <input placeholder="请输入标题，您可以输入100个字" />
      <textarea placeholder="请输入正文"></textarea>
      <span class="save-draft">保存中</span>
    `;
    const editor = document.querySelector<HTMLTextAreaElement>("textarea")!;
    editor.addEventListener("paste", (event) => {
      event.preventDefault();
      const transfer = (event as unknown as TestClipboardEvent).clipboardData;
      expect(transfer.files[0]?.type).toBe("image/png");
      editor.value +=
        "![已上传](https://img.51cto.test/crosspost.png)";
      editor.dispatchEvent(new InputEvent("input", { bubbles: true }));
    });
    editor.addEventListener("input", () => {
      if (!editor.value.includes("CROSSPOST_IMAGE_")) {
        document.querySelector(".save-draft")!.textContent = "已保存";
      }
    });

    const result = await applyDraftToVisibleEditor({
      html: '<p><img src="data:image/png;base64,iVBORw0KGgo="></p>',
      jobId: "00000000-0000-4000-8000-000000000017",
      markdown: "图片：![本地图片](data:image/png;base64,iVBORw0KGgo=)",
      platform: "51cto",
      title: "51CTO 图片草稿"
    });

    expect(result.saved).toBe(true);
    expect(editor.value).toBe(
      "图片：![本地图片](https://img.51cto.test/crosspost.png)"
    );
    expect(editor.value).not.toContain("CROSSPOST_IMAGE_");
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
