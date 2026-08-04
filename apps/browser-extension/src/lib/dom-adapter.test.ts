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
      expect(document.querySelector("pre")?.textContent).toContain(
        "CSDN 正文"
      );
    }
  );

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
        <span class="draft-status">保存中</span>
        ${platform === "bilibili" ? '<button>保存为草稿</button>' : ""}
      `;
      const confirmSaved = (): void => {
        document.querySelector(".draft-status")!.textContent =
          platform === "toutiao" ? "已保存至草稿箱" : "草稿已保存";
      };
      if (platform === "bilibili") {
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
    `;
    const editor = document.querySelector<HTMLElement>("[contenteditable]")!;
    editor.addEventListener("paste", (event) => {
      event.preventDefault();
      const transfer = (event as unknown as TestClipboardEvent).clipboardData;
      editor.textContent = transfer.getData("text/plain");
      editor.dispatchEvent(new InputEvent("input", { bubbles: true }));
      document.querySelector(".draft-status")!.textContent = "草稿已保存";
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

    const result = await applyDraftToVisibleEditor({
      html: '<p><img src="data:image/png;base64,iVBORw0KGgo="></p>',
      jobId: "00000000-0000-4000-8000-000000000016",
      markdown: "![本地图片](data:image/png;base64,iVBORw0KGgo=)",
      platform: "segmentfault",
      title: "思否图片草稿"
    });

    expect(result.saved).toBe(true);
    expect(rendered.textContent).toContain(
      "![本地图片](https://img.segmentfault.test/crosspost.png)"
    );
    expect(rendered.textContent).not.toContain("CROSSPOST_IMAGE_");
    expect(rendered.textContent).not.toContain("data:image/png");
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
