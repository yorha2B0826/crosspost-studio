import type {
  ApplyDraftPayload,
  ApplyDraftResult,
  BrowserPlatform
} from "./messages";

interface PlatformDomDefinition {
  contentMode: "adaptive" | "markdown" | "rich-html";
  editorSelectors: string[];
  imageStrategy: "adaptive" | "markdown-paste" | "rich-paste";
  saveActionText?: string;
  saveEvidenceSelectors: string[];
  saveEvidenceText: RegExp;
  titleSelectors: string[];
}

interface EmbeddedImage {
  alt?: string;
  file: File;
  token: string;
}

class InvalidInlineImageError extends Error {}

const ZHIHU_IMPORT_FAILURE_IMAGE =
  "v2-4f89913ab376925632be5823a038f938";

const DEFINITIONS: Record<BrowserPlatform, PlatformDomDefinition> = {
  "51cto": {
    contentMode: "markdown",
    editorSelectors: [
      "textarea[placeholder='请输入正文']",
      "textarea#content",
      "textarea[name='content']",
      ".bytemd-editor .CodeMirror textarea",
      ".CodeMirror textarea",
      ".cm-editor .cm-content[contenteditable='true']",
      "textarea[aria-label*='Editor content']",
      "textarea"
    ],
    imageStrategy: "markdown-paste",
    saveEvidenceSelectors: [
      ".save-draft",
      "[class*='save-status']",
      "[class*='draft-status']",
      "[class*='autosave']",
      ".el-message--success",
      "[role='status']"
    ],
    saveEvidenceText: /草稿已保存|草稿保存成功|保存成功|自动保存成功|已保存/,
    titleSelectors: [
      "input#title",
      "input[name='title']",
      "input[placeholder*='标题']",
      "textarea[placeholder*='标题']"
    ]
  },
  baijiahao: {
    contentMode: "rich-html",
    editorSelectors: [
      ".ProseMirror[contenteditable='true']",
      "[contenteditable='true'][role='textbox']",
      "[data-slate-editor='true'][contenteditable='true']",
      ".edui-body-container[contenteditable='true']",
      ".public-DraftEditor-content[contenteditable='true']"
    ],
    imageStrategy: "rich-paste",
    saveEvidenceSelectors: [
      "[class*='save-status']",
      "[class*='draft-status']",
      "[class*='autosave']",
      ".ant-message-success",
      "[role='status']"
    ],
    saveEvidenceText: /草稿已保存|草稿保存成功|保存成功|自动保存成功|已保存/,
    titleSelectors: [
      "input[placeholder*='标题']",
      "textarea[placeholder*='标题']",
      "input[class*='title']",
      "textarea[class*='title']"
    ]
  },
  bilibili: {
    contentMode: "rich-html",
    editorSelectors: [
      "textarea[placeholder='请输入正文']",
      "[contenteditable='true'][data-placeholder='请输入正文']",
      "[contenteditable='true'][aria-label='请输入正文']",
      ".ql-editor[contenteditable='true']",
      ".ProseMirror[contenteditable='true']",
      ".w-e-text[contenteditable='true']",
      "[contenteditable='true'][role='textbox']",
      "[class*='editor'] [contenteditable='true']"
    ],
    imageStrategy: "rich-paste",
    saveActionText: "保存为草稿",
    saveEvidenceSelectors: [
      "[class*='save-status']",
      "[class*='draft-status']",
      "[class*='autosave']",
      "[class*='auto-save']",
      "[role='status']"
    ],
    saveEvidenceText:
      /草稿已保存|保存草稿成功|保存成功|自动保存成功|已自动保存|已保存/,
    titleSelectors: [
      "input[placeholder*='标题']",
      "textarea[placeholder*='标题']",
      "input[class*='title']",
      "textarea[class*='title']"
    ]
  },
  jianshu: {
    contentMode: "rich-html",
    editorSelectors: [
      "#editor .kalamu-area[contenteditable='true']",
      ".kalamu-area[contenteditable='true']",
      ".ProseMirror[contenteditable='true']",
      "[contenteditable='true'][role='textbox']",
      ".public-DraftEditor-content[contenteditable='true']",
      "div[data-div]",
      "div#arthur-editor"
    ],
    imageStrategy: "rich-paste",
    saveEvidenceSelectors: [
      "div:has(#editor) > p",
      "[class*='save']",
      "[class*='Save']",
      "[class*='status']",
      "[class*='Status']"
    ],
    saveEvidenceText: /草稿已保存|保存成功|已保存/,
    titleSelectors: [
      "div:has(> div > #editor) > input",
      "input[placeholder*='标题']",
      "textarea[placeholder*='标题']",
      "input[class*='title']",
      "input#title"
    ]
  },
  cnblogs: {
    contentMode: "markdown",
    editorSelectors: [
      "textarea#post-body",
      "textarea[name='postBody']",
      ".monaco-editor textarea.inputarea",
      ".CodeMirror textarea",
      ".cm-editor .cm-content[contenteditable='true']",
      "textarea[aria-label*='Editor content']",
      "textarea"
    ],
    imageStrategy: "markdown-paste",
    saveEvidenceSelectors: [
      "[class*='save-status']",
      "[class*='autosave']",
      "[class*='draft-status']",
      "[class*='status']"
    ],
    saveEvidenceText: /草稿已保存|保存成功|自动保存成功|已保存/,
    titleSelectors: [
      "input#post-title",
      "input#Editor_Edit_txbTitle",
      "input[name='postTitle']",
      "input[placeholder*='标题']",
      "input[class*='title']"
    ]
  },
  csdn: {
    contentMode: "markdown",
    editorSelectors: [
      "pre.editor__inner.markdown-highlighting[contenteditable='true']",
      ".monaco-editor textarea.inputarea",
      ".CodeMirror textarea",
      ".cm-editor .cm-content[contenteditable='true']",
      "textarea[aria-label*='Editor content']",
      "textarea[class*='editor']",
      "textarea"
    ],
    imageStrategy: "markdown-paste",
    saveEvidenceSelectors: [
      "[class*='save-status']",
      "[class*='autosave']",
      "[class*='draft-status']",
      "[class*='status']"
    ],
    saveEvidenceText: /草稿已保存|文章已保存|保存成功|自动保存成功|已保存/,
    titleSelectors: [
      "input#txtTitle",
      "input[value='【无标题】']",
      "input[placeholder*='标题']",
      "textarea[placeholder*='标题']",
      "input[class*='title']",
      "[contenteditable='true'][class*='title']"
    ]
  },
  juejin: {
    contentMode: "adaptive",
    editorSelectors: [
      ".ProseMirror[contenteditable='true']",
      "[contenteditable='true'][role='textbox']",
      ".bytemd-editor .CodeMirror textarea",
      "textarea"
    ],
    imageStrategy: "adaptive",
    saveEvidenceSelectors: [
      "[class*='save-status']",
      "[class*='draft-status']",
      "[class*='status']"
    ],
    saveEvidenceText: /草稿已保存|保存成功|已保存/,
    titleSelectors: [
      "input[placeholder*='标题']",
      "textarea[placeholder*='标题']",
      "input[class*='title']"
    ]
  },
  oschina: {
    contentMode: "rich-html",
    editorSelectors: [
      ".tiptap.ProseMirror.aie-content[contenteditable='true']",
      ".ProseMirror[contenteditable='true'][role='textbox']",
      "[contenteditable='true'][role='textbox']",
      "textarea#markdownContent",
      "textarea[name='content']",
      ".CodeMirror textarea",
      ".cm-editor .cm-content[contenteditable='true']",
      "textarea[aria-label*='Editor content']",
      "textarea"
    ],
    imageStrategy: "rich-paste",
    saveEvidenceSelectors: [
      ".publish-right-title",
      "[class*='save-status']",
      "[class*='autosave']",
      "[class*='draft-status']",
      "[class*='status']"
    ],
    saveEvidenceText:
      /文章.*保存至草稿箱|草稿已保存|保存成功|自动保存成功|已保存/,
    titleSelectors: [
      "input[name='title']",
      "input[placeholder*='标题']",
      "textarea[placeholder*='标题']",
      "input[class*='title']"
    ]
  },
  segmentfault: {
    contentMode: "markdown",
    editorSelectors: [
      ".cm-editor .cm-content[contenteditable='true']",
      ".CodeMirror textarea",
      ".monaco-editor textarea.inputarea",
      "textarea[name='text']",
      "textarea[aria-label*='Editor content']",
      "textarea"
    ],
    imageStrategy: "markdown-paste",
    saveEvidenceSelectors: [
      "[class*='save-status']",
      "[class*='draft-status']",
      "[class*='autosave']",
      "[data-testid*='save']",
      "[role='status']"
    ],
    saveEvidenceText: /草稿已保存|草稿保存成功|保存成功|自动保存成功|已保存/,
    titleSelectors: [
      "input[name='title']",
      "input[placeholder*='标题']",
      "textarea[placeholder*='标题']",
      "input[class*='title']"
    ]
  },
  tencentcloud: {
    contentMode: "adaptive",
    editorSelectors: [
      ".CodeMirror textarea",
      ".cm-editor .cm-content[contenteditable='true']",
      ".monaco-editor textarea.inputarea",
      ".ProseMirror[contenteditable='true']",
      ".ql-editor[contenteditable='true']",
      "[contenteditable='true'][role='textbox']",
      "textarea[aria-label*='Editor content']",
      "textarea[class*='editor']"
    ],
    imageStrategy: "adaptive",
    saveEvidenceSelectors: [
      "[class*='save-status']",
      "[class*='draft-status']",
      "[class*='autosave']",
      "[class*='auto-save']",
      "[role='status']"
    ],
    saveEvidenceText:
      /草稿已保存|内容已自动保存|保存成功|自动保存成功|已自动保存|已保存/,
    titleSelectors: [
      "input[placeholder*='文章标题']",
      "textarea[placeholder*='文章标题']",
      "input[placeholder*='标题']",
      "textarea[placeholder*='标题']",
      "input[class*='title']"
    ]
  },
  toutiao: {
    contentMode: "rich-html",
    editorSelectors: [
      ".ProseMirror[contenteditable='true']",
      "[contenteditable='true'][role='textbox']",
      "[data-slate-editor='true'][contenteditable='true']",
      ".public-DraftEditor-content[contenteditable='true']",
      "[class*='editor'] [contenteditable='true']"
    ],
    imageStrategy: "rich-paste",
    saveEvidenceSelectors: [
      "[class*='save-status']",
      "[class*='draft-status']",
      "[class*='autosave']",
      ".byte-toast",
      "[role='status']"
    ],
    saveEvidenceText:
      /已保存至草稿箱|草稿已保存|草稿保存成功|保存成功|自动保存成功|已保存/,
    titleSelectors: [
      "textarea[placeholder*='标题']",
      "input[placeholder*='标题']",
      "textarea[class*='title']",
      "input[class*='title']"
    ]
  },
  zhihu: {
    contentMode: "rich-html",
    editorSelectors: [
      ".public-DraftEditor-content[contenteditable='true']",
      ".DraftEditor-root [contenteditable='true']",
      ".ProseMirror[contenteditable='true']",
      "[contenteditable='true'][role='textbox']"
    ],
    imageStrategy: "rich-paste",
    saveEvidenceSelectors: [
      "[class*='Save']",
      "[class*='save']",
      "[class*='Status']",
      "[class*='status']"
    ],
    saveEvidenceText:
      /草稿已保存|保存成功|已保存|(?:刚刚|\d+\s*(?:秒|分钟)前)\s*·\s*草稿/,
    titleSelectors: [
      "textarea[placeholder*='标题']",
      "input[placeholder*='标题']",
      "textarea[class*='title']",
      "input[class*='title']"
    ]
  }
};

function queryFirst(
  selectors: string[],
  excluded?: HTMLElement
): HTMLElement | undefined {
  for (const selector of selectors) {
    for (const element of document.querySelectorAll<HTMLElement>(selector)) {
      if (element !== excluded && element.getClientRects().length > 0) {
        return element;
      }
    }
  }
  return undefined;
}

function queryExactVisibleText(value: string): HTMLElement | undefined {
  return Array.from(document.querySelectorAll<HTMLElement>("body *")).find(
    (element) =>
      element.childElementCount === 0 &&
      element.textContent?.trim() === value &&
      element.getClientRects().length > 0
  );
}

async function activateDraftEditor(
  platform: BrowserPlatform,
  definition: PlatformDomDefinition
): Promise<void> {
  if (
    platform !== "jianshu" ||
    (queryFirst(definition.titleSelectors) &&
      queryFirst(definition.editorSelectors))
  ) {
    return;
  }

  const activator = queryExactVisibleText("新建文章");
  if (!activator) {
    return;
  }
  activator.click();
  await waitFor(
    () =>
      Boolean(
        queryFirst(definition.titleSelectors) &&
          queryFirst(definition.editorSelectors)
      ),
    8_000
  );
}

async function resolveTitle(
  platform: BrowserPlatform,
  definition: PlatformDomDefinition,
  expectedTitle: string
): Promise<HTMLElement | undefined> {
  const existing = queryFirst(definition.titleSelectors);
  if (existing || platform !== "csdn") {
    return existing;
  }
  const activator =
    queryExactVisibleText("【无标题】") ?? queryExactVisibleText(expectedTitle);
  if (!activator) {
    return undefined;
  }
  activator.click();
  await waitFor(() => Boolean(queryFirst(definition.titleSelectors)), 1_000);
  return queryFirst(definition.titleSelectors);
}

function summarizeVisibleEditors(): string {
  const controls = Array.from(
    document.querySelectorAll<HTMLElement>(
      "input, textarea, [contenteditable='true']"
    )
  )
    .filter((element) => element.getClientRects().length > 0)
    .slice(0, 6)
    .map((element) => {
      const id = element.id ? `#${element.id}` : "";
      const classes = Array.from(element.classList)
        .slice(0, 3)
        .map((className) => `.${className}`)
        .join("");
      const placeholder = element.getAttribute("placeholder");
      const label = element.getAttribute("aria-label");
      const hint = placeholder ?? label;
      return `${element.localName}${id}${classes}${
        hint ? `[hint=${JSON.stringify(hint.slice(0, 80))}]` : ""
      }`;
    });
  return controls.length > 0 ? controls.join(", ") : "none";
}

function isTextArea(element: Element): element is HTMLTextAreaElement {
  return element.localName === "textarea";
}

function isTextInput(
  element: Element
): element is HTMLInputElement | HTMLTextAreaElement {
  return element.localName === "input" || isTextArea(element);
}

function isEditableTitle(element: HTMLElement): boolean {
  return (
    isTextInput(element) ||
    element.isContentEditable ||
    element.getAttribute("contenteditable") === "true"
  );
}

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype =
    isTextArea(element)
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  descriptor?.set?.call(element, value);
  element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function setTitleValue(element: HTMLElement, value: string): void {
  if (isTextInput(element)) {
    setNativeValue(element, value);
    return;
  }
  element.focus();
  element.textContent = value;
  element.dispatchEvent(
    new InputEvent("input", { bubbles: true, inputType: "insertText" })
  );
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function selectEditorContents(editor: HTMLElement): void {
  const selection = window.getSelection();
  if (!selection) {
    return;
  }
  const range = document.createRange();
  range.selectNodeContents(editor);
  selection.removeAllRanges();
  selection.addRange(range);
  document.dispatchEvent(new Event("selectionchange", { bubbles: true }));
}

function selectionIsInside(editor: HTMLElement): boolean {
  const anchor = window.getSelection()?.anchorNode;
  return Boolean(
    anchor && (anchor === editor || editor.contains(anchor))
  );
}

function dispatchEditorInput(
  editor: HTMLElement,
  inputType: "deleteContentBackward" | "insertFromPaste"
): void {
  editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType }));
}

function dataUrlToFile(dataUrl: string, name: string): File | undefined {
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/s);
  if (!match?.[1] || !match[2]) {
    return undefined;
  }
  try {
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new File([bytes], name, { type: match[1] });
  } catch {
    return undefined;
  }
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType === "image/jpeg") {
    return "jpg";
  }
  if (mimeType === "image/svg+xml") {
    return "svg";
  }
  if (mimeType === "image/webp") {
    return "webp";
  }
  return "png";
}

export function extractEmbeddedImages(
  html: string,
  jobId: string
): { html: string; images: EmbeddedImage[] } {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const images: EmbeddedImage[] = [];
  for (const [index, image] of Array.from(
    parsed.body.querySelectorAll<HTMLImageElement>("img[src^='data:image/']")
  ).entries()) {
    const token = `CROSSPOST_IMAGE_${jobId.replaceAll("-", "")}_${index}`;
    const mimeType = image.src.slice(5, image.src.indexOf(";"));
    const file = dataUrlToFile(
      image.src,
      `crosspost-${index}.${extensionForMimeType(mimeType)}`
    );
    if (!file) {
      continue;
    }
    image.replaceWith(document.createTextNode(token));
    images.push({ file, token });
  }
  return { html: parsed.body.innerHTML, images };
}

export function extractEmbeddedMarkdownImages(
  markdown: string,
  jobId: string
): { images: EmbeddedImage[]; markdown: string } {
  const images: EmbeddedImage[] = [];
  const normalizedJobId = jobId.replaceAll("-", "");
  const registerImage = (
    dataUrl: string,
    mimeType: string,
    alt?: string
  ): string => {
    const token = `CROSSPOST_IMAGE_${normalizedJobId}_${images.length}`;
    const file = dataUrlToFile(
      dataUrl,
      `crosspost-${images.length}.${extensionForMimeType(mimeType.toLowerCase())}`
    );
    if (!file) {
      return dataUrl;
    }
    images.push({ alt, file, token });
    return token;
  };
  const withoutMarkdownImages = markdown.replace(
    /!\[([^\]]*)\]\((data:(image\/[^;,\s)]+);base64,[a-z0-9+/=]+)\)/gi,
    (_match, alt: string, dataUrl: string, mimeType: string) =>
      registerImage(dataUrl, mimeType, alt)
  );
  const preparedMarkdown = withoutMarkdownImages.replace(
    /data:(image\/[^;,\s)]+);base64,([a-z0-9+/=]+)/gi,
    (dataUrl, mimeType: string, _base64: string) => {
      return registerImage(dataUrl, mimeType);
    }
  );
  return { images, markdown: preparedMarkdown };
}

export function htmlToPlainText(html: string): string {
  return new DOMParser().parseFromString(html, "text/html").body.textContent ?? "";
}

function replaceEditorHtml(editor: HTMLElement, html: string): void {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const nodes = Array.from(parsed.body.childNodes, (node) =>
    document.importNode(node, true)
  );
  editor.replaceChildren(...nodes);
}

function findTokenRange(editor: HTMLElement, token: string): Range | undefined {
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const text = node.textContent ?? "";
    const start = text.indexOf(token);
    if (start >= 0) {
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, start + token.length);
      return range;
    }
    node = walker.nextNode();
  }
  return undefined;
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs: number
): Promise<boolean> {
  if (predicate()) {
    return true;
  }
  return new Promise((resolve) => {
    const finish = (result: boolean): void => {
      window.clearInterval(poll);
      window.clearTimeout(timeout);
      observer.disconnect();
      resolve(result);
    };
    const observer = new MutationObserver(() => {
      if (!predicate()) {
        return;
      }
      finish(true);
    });
    const timeout = window.setTimeout(() => {
      finish(predicate());
    }, timeoutMs);
    const poll = window.setInterval(() => {
      if (predicate()) {
        finish(true);
      }
    }, 50);
    observer.observe(document.body, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true
    });
  });
}

function isResolvedRichEditorImage(image: HTMLImageElement): boolean {
  return (
    image.complete &&
    image.naturalWidth > 0 &&
    /^https:\/\//.test(image.src) &&
    !image.src.includes(ZHIHU_IMPORT_FAILURE_IMAGE)
  );
}

async function pasteImageAtToken(
  resolveEditor: () => HTMLElement | undefined,
  image: EmbeddedImage
): Promise<void> {
  const tokenAppeared = await waitFor(
    () => resolveEditor()?.textContent?.includes(image.token) === true,
    5_000
  );
  const editor = resolveEditor();
  if (!editor) {
    throw new Error("The editor was replaced before an image could be inserted.");
  }
  const range = tokenAppeared ? findTokenRange(editor, image.token) : undefined;
  const selection = window.getSelection();
  if (!range || !selection) {
    throw new Error("An image insertion point was lost while filling the editor.");
  }

  editor.focus();
  selection.removeAllRanges();
  selection.addRange(range);
  document.dispatchEvent(new Event("selectionchange", { bubbles: true }));

  const imageCount = editor.querySelectorAll("img").length;
  const transfer = new DataTransfer();
  transfer.items.add(image.file);
  const handled = !editor.dispatchEvent(
    new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: transfer
    })
  );
  if (!handled) {
    throw new Error("The editor did not accept an image file paste.");
  }

  const uploaded = await waitFor(
    () => {
      const currentEditor = resolveEditor();
      if (!currentEditor) {
        return false;
      }
      const uploadedImages = Array.from(
        currentEditor.querySelectorAll<HTMLImageElement>("img")
      );
      return (
        uploadedImages.length > imageCount &&
        uploadedImages.some(isResolvedRichEditorImage)
      );
    },
    30_000
  );
  if (!uploaded) {
    throw new Error("The platform did not confirm a rich-text image upload.");
  }

  const currentEditor = resolveEditor();
  const remainingToken = currentEditor
    ? findTokenRange(currentEditor, image.token)
    : undefined;
  if (remainingToken) {
    selection.removeAllRanges();
    selection.addRange(remainingToken);
    remainingToken.deleteContents();
    if (currentEditor) {
      dispatchEditorInput(currentEditor, "deleteContentBackward");
    }
  }
}

function editableText(editor: HTMLElement): string {
  return isTextArea(editor)
    ? editor.value
    : editor.textContent ?? "";
}

function markdownEditorSurface(editor: HTMLTextAreaElement): HTMLElement {
  return editor.closest<HTMLElement>(".CodeMirror") ?? editor;
}

function markdownEditorText(editor: HTMLTextAreaElement): string {
  const surface = markdownEditorSurface(editor);
  return surface === editor ? editor.value : surface.textContent ?? "";
}

function extractHttpUrls(value: string): Set<string> {
  return new Set(value.match(/https?:\/\/[^\s)]+/g) ?? []);
}

async function uploadTextareaMarkdownImages(
  resolveEditor: () => HTMLElement | undefined,
  images: EmbeddedImage[],
  markdown: string
): Promise<void> {
  const replacements = new Map<string, string>();
  for (const image of images) {
    const editor = resolveEditor();
    if (!editor || !isTextArea(editor)) {
      throw new Error("The Markdown editor was replaced during an image upload.");
    }
    const previousUrls = extractHttpUrls(markdownEditorText(editor));
    editor.focus();
    editor.setSelectionRange(editor.value.length, editor.value.length);
    const transfer = new DataTransfer();
    transfer.items.add(image.file);
    const handled = !editor.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: transfer
      })
    );
    if (!handled) {
      throw new Error("The Markdown editor did not accept an image file paste.");
    }

    let uploadedUrl: string | undefined;
    const uploaded = await waitFor(() => {
      const current = resolveEditor();
      if (!current || !isTextArea(current)) {
        return false;
      }
      uploadedUrl = Array.from(
        extractHttpUrls(markdownEditorText(current))
      ).find((url) => !previousUrls.has(url));
      return uploadedUrl !== undefined;
    }, 30_000);
    if (!uploaded || !uploadedUrl) {
      throw new Error("The platform did not confirm a CodeMirror image upload.");
    }
    replacements.set(image.token, uploadedUrl);
  }

  const editor = resolveEditor();
  if (!editor || !isTextArea(editor)) {
    throw new Error("The Markdown editor disappeared before finalizing images.");
  }
  let finalizedMarkdown = markdown;
  for (const [token, url] of replacements) {
    const alt = images.find((image) => image.token === token)?.alt;
    finalizedMarkdown = finalizedMarkdown.replaceAll(
      token,
      `![${alt || "crosspost image"}](${url})`
    );
  }
  setNativeValue(editor, finalizedMarkdown);
  const finalized = await waitFor(() => {
    const current = resolveEditor();
    if (!current || !isTextArea(current)) {
      return false;
    }
    const text = markdownEditorText(current);
    return (
      !text.includes("CROSSPOST_IMAGE_") &&
      Array.from(replacements.values()).every((url) => text.includes(url))
    );
  }, 5_000);
  if (!finalized) {
    throw new Error("The Markdown editor did not confirm the final image URLs.");
  }
}

function selectMarkdownToken(editor: HTMLElement, token: string): boolean {
  if (isTextArea(editor)) {
    const start = editor.value.indexOf(token);
    if (start < 0) {
      return false;
    }
    editor.focus();
    editor.setSelectionRange(start, start + token.length);
    editor.dispatchEvent(new Event("select", { bubbles: true }));
    return true;
  }
  const range = findTokenRange(editor, token);
  const selection = window.getSelection();
  if (!range || !selection) {
    return false;
  }
  editor.focus();
  selection.removeAllRanges();
  selection.addRange(range);
  document.dispatchEvent(new Event("selectionchange", { bubbles: true }));
  return true;
}

async function pasteMarkdownImageAtToken(
  resolveEditor: () => HTMLElement | undefined,
  image: EmbeddedImage
): Promise<void> {
  const tokenAppeared = await waitFor(
    () => editableText(resolveEditor() ?? document.body).includes(image.token),
    5_000
  );
  const editor = resolveEditor();
  if (!tokenAppeared || !editor || !selectMarkdownToken(editor, image.token)) {
    throw new Error("An image insertion point was lost while filling the Markdown editor.");
  }

  const beforePaste = editableText(editor);
  const transfer = new DataTransfer();
  transfer.items.add(image.file);
  const handled = !editor.dispatchEvent(
    new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: transfer
    })
  );
  if (!handled) {
    throw new Error("The Markdown editor did not accept an image file paste.");
  }

  const uploaded = await waitFor(() => {
    const currentEditor = resolveEditor();
    return Boolean(
      currentEditor &&
      !editableText(currentEditor).includes(image.token) &&
      editableText(currentEditor) !== beforePaste &&
      /https?:\/\//.test(editableText(currentEditor))
    );
  }, 30_000);
  if (!uploaded) {
    throw new Error("The platform did not confirm a Markdown image upload.");
  }
}

function hasEditorContent(editor: HTMLElement): boolean {
  return (
    Boolean(editor.textContent?.trim()) ||
    editor.querySelectorAll("img, table, .FormulaCSR[data-tex]").length > 0
  );
}

async function clearEditor(
  resolveEditor: () => HTMLElement | undefined
): Promise<HTMLElement> {
  const editor = resolveEditor();
  if (!editor) {
    throw new Error("The visible editor disappeared before it could be updated.");
  }
  if (!hasEditorContent(editor)) {
    return editor;
  }
  editor.focus();
  selectEditorContents(editor);
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !selectionIsInside(editor)) {
    throw new Error(
      "The existing editor content could not be selected safely; no replacement was inserted."
    );
  }
  selection.getRangeAt(0).deleteContents();
  dispatchEditorInput(editor, "deleteContentBackward");
  const cleared = await waitFor(
    () => {
      const currentEditor = resolveEditor();
      return Boolean(currentEditor && !hasEditorContent(currentEditor));
    },
    3_000
  );
  const currentEditor = resolveEditor();
  if (!cleared || !currentEditor || hasEditorContent(currentEditor)) {
    throw new Error(
      "The existing editor content could not be cleared safely; no replacement was inserted."
    );
  }
  return currentEditor;
}

async function insertIntoEditor(
  editor: HTMLElement,
  payload: ApplyDraftPayload,
  resolveEditor: () => HTMLElement | undefined,
  definition: PlatformDomDefinition
): Promise<void> {
  editor.focus();
  const useMarkdown =
    definition.contentMode === "markdown" ||
    (definition.contentMode === "adaptive" &&
      (isTextArea(editor) ||
        Boolean(
          editor.closest(
            ".CodeMirror, .cm-editor, .monaco-editor, .bytemd-editor"
          )
        )));
  if (useMarkdown) {
    const prepared = extractEmbeddedMarkdownImages(payload.markdown, payload.jobId);
    if (/data:image\//i.test(prepared.markdown)) {
      throw new InvalidInlineImageError(
        "The article contains an invalid inline image that could not be prepared for upload."
      );
    }
    if (isTextArea(editor)) {
      setNativeValue(editor, prepared.markdown);
      if (
        definition.imageStrategy !== "rich-paste" &&
        prepared.images.length > 0
      ) {
        await uploadTextareaMarkdownImages(
          resolveEditor,
          prepared.images,
          prepared.markdown
        );
        return;
      }
    } else {
      let currentEditor = await clearEditor(resolveEditor);
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      currentEditor = resolveEditor() ?? currentEditor;
      currentEditor.focus();
      selectEditorContents(currentEditor);
      let accepted = false;
      if (typeof DataTransfer !== "undefined" && typeof ClipboardEvent !== "undefined") {
        const transfer = new DataTransfer();
        transfer.setData("text/plain", prepared.markdown);
        accepted = !currentEditor.dispatchEvent(
          new ClipboardEvent("paste", {
            bubbles: true,
            cancelable: true,
            clipboardData: transfer
          })
        );
      }
      const pasteApplied =
        accepted &&
        (await waitFor(() => {
          const liveEditor = resolveEditor();
          return Boolean(liveEditor && hasEditorContent(liveEditor));
        }, 5_000));
      currentEditor = resolveEditor() ?? currentEditor;
      if (!pasteApplied && !hasEditorContent(currentEditor)) {
        currentEditor.textContent = prepared.markdown;
        dispatchEditorInput(currentEditor, "insertFromPaste");
      }
    }
    if (definition.imageStrategy !== "rich-paste") {
      for (const image of prepared.images) {
        await pasteMarkdownImageAtToken(resolveEditor, image);
      }
    }
    return;
  }

  const prepared =
    definition.imageStrategy !== "markdown-paste"
      ? extractEmbeddedImages(payload.html, payload.jobId)
      : { html: payload.html, images: [] };
  if (/data:image\//i.test(prepared.html)) {
    throw new InvalidInlineImageError(
      "The article contains an invalid inline image that could not be prepared for upload."
    );
  }
  let currentEditor = await clearEditor(resolveEditor);
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  currentEditor = resolveEditor() ?? currentEditor;
  currentEditor.focus();
  selectEditorContents(currentEditor);
  const editorFocused = await waitFor(() => {
    const liveEditor = resolveEditor();
    return Boolean(
      liveEditor &&
      document.activeElement === liveEditor &&
      selectionIsInside(liveEditor)
    );
  }, 1_000);
  if (!editorFocused) {
    throw new Error(
      "The replacement editor did not regain focus after clearing the previous draft."
    );
  }
  let accepted = false;
  if (typeof DataTransfer !== "undefined" && typeof ClipboardEvent !== "undefined") {
    const transfer = new DataTransfer();
    transfer.setData("text/html", prepared.html);
    transfer.setData("text/plain", htmlToPlainText(prepared.html));
    accepted = !currentEditor.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: transfer
      })
    );
  }
  const pasteApplied =
    accepted &&
    (await waitFor(() => {
      const liveEditor = resolveEditor();
      return Boolean(liveEditor && hasEditorContent(liveEditor));
    }, 5_000));
  currentEditor = resolveEditor() ?? currentEditor;
  if (pasteApplied || hasEditorContent(currentEditor)) {
    for (const image of prepared.images) {
      await pasteImageAtToken(resolveEditor, image);
    }
    return;
  }
  if (accepted) {
    throw new Error(
      "The editor accepted the paste event but did not apply the rich-text content."
    );
  }

  replaceEditorHtml(currentEditor, prepared.html);
  dispatchEditorInput(currentEditor, "insertFromPaste");
  for (const image of prepared.images) {
    await pasteImageAtToken(resolveEditor, image);
  }
}

function hasSaveEvidence(definition: PlatformDomDefinition): boolean {
  for (const selector of definition.saveEvidenceSelectors) {
    for (const element of document.querySelectorAll<HTMLElement>(selector)) {
      if (
        element.getClientRects().length > 0 &&
        definition.saveEvidenceText.test(element.textContent ?? "")
      ) {
        return true;
      }
    }
  }
  return false;
}

function saveEvidenceSignature(definition: PlatformDomDefinition): string {
  return definition.saveEvidenceSelectors
    .flatMap((selector) =>
      Array.from(
        document.querySelectorAll<HTMLElement>(selector),
        (element) =>
          [
            element.textContent?.trim() ?? "",
            element.className,
            element.getAttribute("aria-label") ?? "",
            element.dataset.state ?? ""
          ].join("\u0000")
      )
    )
    .join("\n");
}

async function waitForSaveEvidence(
  definition: PlatformDomDefinition,
  initialSignature: string,
  timeoutMs = 20_000
): Promise<boolean> {
  return new Promise((resolve) => {
    let sawStatusChange = saveEvidenceSignature(definition) !== initialSignature;
    if (sawStatusChange && hasSaveEvidence(definition)) {
      resolve(true);
      return;
    }
    const deadline = window.setTimeout(() => {
      observer.disconnect();
      resolve(false);
    }, timeoutMs);
    const observer = new MutationObserver(() => {
      if (saveEvidenceSignature(definition) !== initialSignature) {
        sawStatusChange = true;
      }
      if (!sawStatusChange || !hasSaveEvidence(definition)) {
        return;
      }
      window.clearTimeout(deadline);
      observer.disconnect();
      resolve(true);
    });
    observer.observe(document.body, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true
    });
  });
}

export async function applyDraftToVisibleEditor(
  payload: ApplyDraftPayload
): Promise<ApplyDraftResult> {
  if (payload.html.includes("crosspost-asset://") || payload.markdown.includes("crosspost-asset://")) {
    return {
      errorCode: "unresolved-assets",
      message: "The article still contains unresolved assets.",
      saved: false
    };
  }

  const definition = DEFINITIONS[payload.platform];
  await activateDraftEditor(payload.platform, definition);
  const title = await resolveTitle(payload.platform, definition, payload.title);
  const resolveEditor = (): HTMLElement | undefined =>
    queryFirst(definition.editorSelectors, title);
  const editor = resolveEditor();
  if (!title || !isEditableTitle(title) || !editor) {
    const titleState = !title
      ? "missing"
      : isEditableTitle(title)
        ? "found"
        : "not-editable";
    return {
      errorCode: "editor-not-found",
      message: `The visible draft editor was not recognized (title=${titleState}, body=${
        editor ? "found" : "missing"
      }; visible controls: ${summarizeVisibleEditors()}). Sign in, open a draft, and retry.`,
      saved: false
    };
  }

  const initialSaveStatus = saveEvidenceSignature(definition);
  setTitleValue(title, payload.title);
  try {
    await insertIntoEditor(editor, payload, resolveEditor, definition);
  } catch (error) {
    return {
      draftUrl: location.href,
      errorCode:
        error instanceof InvalidInlineImageError
          ? "invalid-inline-image"
          : "editor-update-unconfirmed",
      message:
        error instanceof Error
          ? error.message
          : "The platform did not confirm all image uploads.",
      saved: false,
      unknown: true
    };
  }

  if (definition.saveActionText) {
    const saveAction = queryExactVisibleText(definition.saveActionText);
    if (!saveAction) {
      return {
        draftUrl: location.href,
        errorCode: "save-action-not-found",
        message: `The visible ${definition.saveActionText} action was not found. Do not create another draft automatically.`,
        saved: false,
        unknown: true
      };
    }
    saveAction.click();
  }

  if (!(await waitForSaveEvidence(definition, initialSaveStatus))) {
    return {
      draftUrl: location.href,
      errorCode: "save-unconfirmed",
      message:
        "The editor was filled, but no explicit draft-saved signal appeared. Do not create another draft automatically.",
      saved: false,
      unknown: true
    };
  }

  return {
    draftUrl: location.href,
    message: "The platform displayed an explicit draft-saved signal.",
    saved: true
  };
}
