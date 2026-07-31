import type {
  ApplyDraftPayload,
  ApplyDraftResult,
  BrowserPlatform
} from "./messages";

interface PlatformDomDefinition {
  contentMode: "adaptive" | "markdown" | "rich-html";
  editorSelectors: string[];
  imageStrategy: "markdown-paste" | "rich-paste";
  saveEvidenceSelectors: string[];
  saveEvidenceText: RegExp;
  titleSelectors: string[];
}

interface EmbeddedImage {
  file: File;
  token: string;
}

const ZHIHU_IMPORT_FAILURE_IMAGE =
  "v2-4f89913ab376925632be5823a038f938";

const DEFINITIONS: Record<BrowserPlatform, PlatformDomDefinition> = {
  jianshu: {
    contentMode: "rich-html",
    editorSelectors: [
      ".ProseMirror[contenteditable='true']",
      "[contenteditable='true'][role='textbox']",
      ".public-DraftEditor-content[contenteditable='true']",
      "div[data-div]",
      "div#arthur-editor"
    ],
    imageStrategy: "rich-paste",
    saveEvidenceSelectors: [
      "[class*='save']",
      "[class*='Save']",
      "[class*='status']",
      "[class*='Status']"
    ],
    saveEvidenceText: /草稿已保存|保存成功|已保存/,
    titleSelectors: [
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
      "input[placeholder*='标题']",
      "textarea[placeholder*='标题']",
      "input[class*='title']"
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
    imageStrategy: "markdown-paste",
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
    contentMode: "markdown",
    editorSelectors: [
      "textarea#markdownContent",
      "textarea[name='content']",
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
      "input[name='title']",
      "input[placeholder*='标题']",
      "textarea[placeholder*='标题']",
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

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  descriptor?.set?.call(element, value);
  element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
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

function dataUrlToFile(dataUrl: string, name: string): File | undefined {
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/s);
  if (!match?.[1] || !match[2]) {
    return undefined;
  }
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new File([bytes], name, { type: match[1] });
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
  const template = document.createElement("template");
  template.innerHTML = html;
  const images: EmbeddedImage[] = [];
  for (const [index, image] of Array.from(
    template.content.querySelectorAll<HTMLImageElement>("img[src^='data:image/']")
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
  return { html: template.innerHTML, images };
}

export function extractEmbeddedMarkdownImages(
  markdown: string,
  jobId: string
): { images: EmbeddedImage[]; markdown: string } {
  const images: EmbeddedImage[] = [];
  const normalizedJobId = jobId.replaceAll("-", "");
  const preparedMarkdown = markdown.replace(
    /data:(image\/[^;,\s)]+);base64,([a-z0-9+/=]+)/gi,
    (dataUrl, mimeType: string, _base64: string) => {
      const token = `CROSSPOST_IMAGE_${normalizedJobId}_${images.length}`;
      const file = dataUrlToFile(
        dataUrl,
        `crosspost-${images.length}.${extensionForMimeType(mimeType.toLowerCase())}`
      );
      if (!file) {
        return dataUrl;
      }
      images.push({ file, token });
      return token;
    }
  );
  return { images, markdown: preparedMarkdown };
}

export function htmlToPlainText(html: string): string {
  const template = document.createElement("template");
  template.innerHTML = html;
  return template.content.textContent ?? "";
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

function isResolvedZhihuImage(image: HTMLImageElement): boolean {
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
        uploadedImages.some(isResolvedZhihuImage)
      );
    },
    30_000
  );
  if (!uploaded) {
    throw new Error("Zhihu did not confirm an uploaded image.");
  }

  const currentEditor = resolveEditor();
  const remainingToken = currentEditor
    ? findTokenRange(currentEditor, image.token)
    : undefined;
  if (remainingToken) {
    selection.removeAllRanges();
    selection.addRange(remainingToken);
    document.execCommand("delete");
  }
}

function editableText(editor: HTMLElement): string {
  return editor instanceof HTMLTextAreaElement
    ? editor.value
    : editor.textContent ?? "";
}

function selectMarkdownToken(editor: HTMLElement, token: string): boolean {
  if (editor instanceof HTMLTextAreaElement) {
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
  const deleted = document.execCommand("delete");
  const cleared =
    deleted &&
    (await waitFor(
      () => {
        const currentEditor = resolveEditor();
        return Boolean(currentEditor && !hasEditorContent(currentEditor));
      },
      3_000
    ));
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
      editor instanceof HTMLTextAreaElement);
  if (useMarkdown) {
    const prepared = extractEmbeddedMarkdownImages(payload.markdown, payload.jobId);
    if (editor instanceof HTMLTextAreaElement) {
      setNativeValue(editor, prepared.markdown);
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
        selectEditorContents(currentEditor);
        const inserted = document.execCommand(
          "insertText",
          false,
          prepared.markdown
        );
        currentEditor = resolveEditor() ?? currentEditor;
        if (!inserted || !hasEditorContent(currentEditor)) {
          currentEditor.textContent = prepared.markdown;
          currentEditor.dispatchEvent(
            new InputEvent("input", {
              bubbles: true,
              inputType: "insertFromPaste"
            })
          );
        }
      }
    }
    if (definition.imageStrategy === "markdown-paste") {
      for (const image of prepared.images) {
        await pasteMarkdownImageAtToken(resolveEditor, image);
      }
    }
    return;
  }

  const prepared =
    definition.imageStrategy === "rich-paste"
      ? extractEmbeddedImages(payload.html, payload.jobId)
      : { html: payload.html, images: [] };
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
    transfer.setData(
      "text/plain",
      payload.platform === "zhihu"
        ? htmlToPlainText(prepared.html)
        : payload.markdown
    );
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

  selectEditorContents(currentEditor);
  const inserted = document.execCommand("insertHTML", false, prepared.html);
  currentEditor = resolveEditor() ?? currentEditor;
  if (!inserted || !currentEditor.textContent?.trim()) {
    currentEditor.innerHTML = prepared.html;
    currentEditor.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertFromPaste"
      })
    );
  }
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
        (element) => element.textContent?.trim() ?? ""
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
  const title = queryFirst(definition.titleSelectors);
  const resolveEditor = (): HTMLElement | undefined =>
    queryFirst(definition.editorSelectors, title);
  const editor = resolveEditor();
  if (!(title instanceof HTMLInputElement || title instanceof HTMLTextAreaElement) || !editor) {
    return {
      errorCode: "editor-not-found",
      message:
        "The visible draft editor was not recognized. Sign in, open a draft, and retry.",
      saved: false
    };
  }

  const initialSaveStatus = saveEvidenceSignature(definition);
  setNativeValue(title, payload.title);
  try {
    await insertIntoEditor(editor, payload, resolveEditor, definition);
  } catch (error) {
    return {
      draftUrl: location.href,
      errorCode: "editor-update-unconfirmed",
      message:
        error instanceof Error
          ? error.message
          : "The platform did not confirm all image uploads.",
      saved: false,
      unknown: true
    };
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
