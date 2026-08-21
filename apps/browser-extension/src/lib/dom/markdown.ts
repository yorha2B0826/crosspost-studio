import type { BrowserPlatform } from "../messages";
import {
  clearEditor,
  dispatchEditorInput,
  editableText,
  findTokenRange,
  focusEditor,
  hasEditorContent,
  selectEditorContents
} from "./editor";
import {
  browserCompatibleUploadFile,
  uploadThroughMarkdownImageDialogWithRetry
} from "./images";
import { waitFor } from "./query";
import { isTextArea, setNativeValue } from "./title";
import type {
  DomAdapterRuntime,
  EmbeddedImage,
  MarkdownImageDialogDefinition
} from "./types";

function markdownEditorSurface(editor: HTMLTextAreaElement): HTMLElement {
  return editor.closest<HTMLElement>(".CodeMirror") ?? editor;
}

export function markdownEditorText(editor: HTMLTextAreaElement): string {
  const surface = markdownEditorSurface(editor);
  if (surface === editor) {
    return editor.value;
  }
  const rendered = surface.querySelector<HTMLElement>(".CodeMirror-code");
  const lines = rendered
    ? Array.from(
        rendered.querySelectorAll<HTMLElement>(":scope > pre.CodeMirror-line")
      )
    : [];
  if (lines.length > 0) {
    return lines
      .map((line) =>
        (line.textContent ?? "")
          .replaceAll("\u200b", "")
          .replaceAll("\u00a0", " ")
      )
      .join("\n");
  }
  return rendered?.textContent ?? surface.textContent ?? "";
}

function extractHttpUrls(value: string): Set<string> {
  const urls = new Set(value.match(/https?:\/\/[^\s)]+/g) ?? []);
  for (const match of value.matchAll(/!\[[^\]]*\]\((\/[^\s)]+)\)/g)) {
    const relativeUrl = match[1];
    if (!relativeUrl) {
      continue;
    }
    try {
      urls.add(new URL(relativeUrl, location.origin).href);
    } catch {
      // Ignore malformed image targets; upload confirmation remains strict.
    }
  }
  return urls;
}

function httpUrlCounts(value: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const url of value.match(/https?:\/\/[^\s)]+/g) ?? []) {
    counts.set(url, (counts.get(url) ?? 0) + 1);
  }
  for (const match of value.matchAll(/!\[[^\]]*\]\((\/[^\s)]+)\)/g)) {
    const relativeUrl = match[1];
    if (!relativeUrl) {
      continue;
    }
    try {
      const url = new URL(relativeUrl, location.origin).href;
      counts.set(url, (counts.get(url) ?? 0) + 1);
    } catch {
      // Ignore malformed image targets; upload confirmation remains strict.
    }
  }
  return counts;
}

function additionalHttpUrl(
  value: string,
  previousCounts: ReadonlyMap<string, number>
): string | undefined {
  const currentCounts = httpUrlCounts(value);
  return Array.from(currentCounts).find(
    ([url, count]) => count > (previousCounts.get(url) ?? 0)
  )?.[0];
}

export function markdownEditorVisibleText(editor: HTMLElement): string {
  if (
    editor.matches(
      "pre.editor__inner.markdown-highlighting[contenteditable='true']"
    )
  ) {
    return editor.textContent ?? editor.innerText;
  }
  return isTextArea(editor)
    ? markdownEditorText(editor)
    : editor.innerText || editableText(editor);
}

export async function uploadTextareaMarkdownImagesWithDialog(
  resolveEditor: () => HTMLElement | undefined,
  images: EmbeddedImage[],
  markdown: string,
  definition: MarkdownImageDialogDefinition,
  applyMarkdown: (
    editor: HTMLTextAreaElement,
    markdown: string
  ) => Promise<void>
): Promise<void> {
  const replacements = new Map<string, string>();
  for (const image of images) {
    const editor = resolveEditor();
    if (!editor || !isTextArea(editor)) {
      throw new Error("The Markdown editor was replaced during an image upload.");
    }
    const previousUrls = httpUrlCounts(markdownEditorText(editor));
    editor.focus();
    editor.setSelectionRange(editor.value.length, editor.value.length);
    let uploadedUrl: string | undefined;
    const uploadFile = await browserCompatibleUploadFile(image.file);
    const uploaded = await uploadThroughMarkdownImageDialogWithRetry(
      definition,
      uploadFile,
      () => {
        const current = resolveEditor();
        if (!current || !isTextArea(current)) {
          return false;
        }
        uploadedUrl = additionalHttpUrl(
          markdownEditorText(current),
          previousUrls
        );
        return uploadedUrl !== undefined;
      }
    );
    if (!uploaded || !uploadedUrl) {
      throw new Error(
        `The platform did not confirm its image dialog upload for ${uploadFile.name} (${uploadFile.size} bytes).`
      );
    }
    replacements.set(image.token, uploadedUrl);
    if (definition.uploadPacingMs && image !== images.at(-1)) {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, definition.uploadPacingMs);
      });
    }
  }

  const editor = resolveEditor();
  if (!editor || !isTextArea(editor)) {
    throw new Error("The Markdown editor disappeared before finalizing images.");
  }
  if (definition.uploadPacingMs) {
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, definition.uploadPacingMs);
    });
  }
  let finalizedMarkdown = markdown;
  for (const [token, url] of replacements) {
    const alt = images.find((image) => image.token === token)?.alt;
    finalizedMarkdown = finalizedMarkdown.replaceAll(
      token,
      `![${alt || "crosspost image"}](${url})`
    );
  }
  await applyMarkdown(editor, finalizedMarkdown);
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

function replaceMarkdownImageTokens(
  markdown: string,
  images: EmbeddedImage[],
  replacements: ReadonlyMap<string, string>
): string {
  let finalized = markdown;
  for (const image of images) {
    const url = replacements.get(image.token);
    if (!url) {
      throw new Error("An uploaded image URL was missing during finalization.");
    }
    finalized = finalized.replaceAll(
      image.token,
      `![${image.alt || "crosspost image"}](${url})`
    );
  }
  return finalized;
}

export function normalizedMarkdownDocument(value: string): string {
  return value.replace(/\r\n?/g, "\n").trimEnd();
}

export function markdownDocumentMatches(editor: HTMLElement, markdown: string): boolean {
  return (
    normalizedMarkdownDocument(markdownEditorVisibleText(editor)) ===
    normalizedMarkdownDocument(markdown)
  );
}

export async function setContenteditableMarkdown(
  editor: HTMLElement,
  markdown: string,
  runtime?: DomAdapterRuntime
): Promise<void> {
  const isCsdnEditor = editor.matches(
    "pre.editor__inner.markdown-highlighting[contenteditable='true']"
  );
  if (isCsdnEditor && runtime?.setCsdnMarkdown) {
    const appliedMarkdown = await runtime.setCsdnMarkdown(markdown);
    if (
      appliedMarkdown !== undefined &&
      normalizedMarkdownDocument(appliedMarkdown) ===
        normalizedMarkdownDocument(markdown)
    ) {
      return;
    }
    throw new Error("The CSDN editor did not preserve the source Markdown.");
  }
  if (hasEditorContent(editor)) {
    await clearEditor(() => editor);
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  }
  editor.focus();
  selectEditorContents(editor);
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));

  const execCommand = Reflect.get(document, "execCommand") as
    | ((commandId: string, showUi: boolean, value?: string | null) => boolean)
    | undefined;
  if (
    isCsdnEditor &&
    typeof execCommand === "function"
  ) {
    const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
    let inserted = execCommand.call(
      document,
      "insertText",
      false,
      lines[0] ?? ""
    );
    for (const line of lines.slice(1)) {
      inserted =
        execCommand.call(document, "insertLineBreak", false, null) && inserted;
      if (line) {
        inserted =
          execCommand.call(document, "insertText", false, line) && inserted;
      }
    }
    if (inserted) {
      return;
    }
  }

  if (typeof DataTransfer !== "undefined" && typeof ClipboardEvent !== "undefined") {
    const transfer = new DataTransfer();
    transfer.setData("text/plain", markdown);
    const handled = !editor.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: transfer
      })
    );
    if (handled) {
      return;
    }
  }

  editor.focus();
  selectEditorContents(editor);
  let replaced = false;
  try {
    replaced =
      typeof execCommand === "function" &&
      execCommand.call(
        document,
        "insertHTML",
        false,
        markdown
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll("\n", "<br>")
      );
  } catch {
    replaced = false;
  }
  if (!replaced) {
    editor.textContent = markdown;
    dispatchEditorInput(editor, "insertFromPaste");
  }
}

export async function setTextareaMarkdown(
  platform: BrowserPlatform,
  editor: HTMLTextAreaElement,
  markdown: string,
  runtime?: DomAdapterRuntime
): Promise<void> {
  if (platform === "segmentfault" && editor.closest(".CodeMirror")) {
    if (!runtime?.setSegmentFaultMarkdown) {
      throw new Error(
        "SegmentFault's native CodeMirror writer is unavailable. Reload the extension and retry."
      );
    }
    const appliedMarkdown = await runtime.setSegmentFaultMarkdown(markdown);
    if (
      appliedMarkdown !== undefined &&
      normalizedMarkdownDocument(appliedMarkdown) ===
        normalizedMarkdownDocument(markdown)
    ) {
      return;
    }
    throw new Error("SegmentFault did not preserve the source Markdown.");
  }
  setNativeValue(editor, markdown);
}

export async function uploadContenteditableMarkdownImagesWithDialog(
  resolveEditor: () => HTMLElement | undefined,
  images: EmbeddedImage[],
  markdown: string,
  definition: MarkdownImageDialogDefinition,
  runtime?: DomAdapterRuntime
): Promise<void> {
  const replacements = new Map<string, string>();
  for (const image of images) {
    const editor = resolveEditor();
    if (!editor || isTextArea(editor)) {
      throw new Error("The Markdown editor was replaced during an image upload.");
    }
    const previousUrls = httpUrlCounts(markdownEditorVisibleText(editor));
    focusEditor(editor);
    const editorDocument = editor.ownerDocument;
    const selection = editorDocument.defaultView?.getSelection();
    const range = editorDocument.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);

    let uploadedUrl: string | undefined;
    const uploaded = await uploadThroughMarkdownImageDialogWithRetry(
      definition,
      await browserCompatibleUploadFile(image.file),
      () => {
        const current = resolveEditor();
        if (!current || isTextArea(current)) {
          return false;
        }
        uploadedUrl = additionalHttpUrl(
          markdownEditorVisibleText(current),
          previousUrls
        );
        return uploadedUrl !== undefined;
      }
    );
    if (!uploaded || !uploadedUrl) {
      throw new Error("The platform did not confirm its image dialog upload.");
    }
    replacements.set(image.token, uploadedUrl);
  }

  const editor = resolveEditor();
  if (!editor || isTextArea(editor)) {
    throw new Error("The Markdown editor disappeared before finalizing images.");
  }
  const finalized = replaceMarkdownImageTokens(markdown, images, replacements);
  await setContenteditableMarkdown(editor, finalized, runtime);
  const confirmed = await waitFor(() => {
    const current = resolveEditor();
    if (!current || isTextArea(current)) {
      return false;
    }
    const text = markdownEditorVisibleText(current);
    return (
      markdownDocumentMatches(current, finalized) &&
      !text.includes("CROSSPOST_IMAGE_") &&
      Array.from(replacements.values()).every((url) => text.includes(url))
    );
  }, 5_000);
  if (!confirmed) {
    throw new Error("The Markdown editor did not confirm the final image URLs.");
  }
}

export async function uploadMarkdownImageAtTokenWithDialog(
  resolveEditor: () => HTMLElement | undefined,
  image: EmbeddedImage,
  definition: MarkdownImageDialogDefinition
): Promise<void> {
  const tokenAppeared = await waitFor(
    () =>
      markdownEditorVisibleText(resolveEditor() ?? document.body).includes(
        image.token
      ),
    5_000
  );
  const editor = resolveEditor();
  if (!tokenAppeared || !editor || !selectMarkdownToken(editor, image.token)) {
    throw new Error("An image insertion point was lost while filling the Markdown editor.");
  }
  const previousUrls = extractHttpUrls(markdownEditorVisibleText(editor));
  let uploadedUrl: string | undefined;
  const uploaded = await uploadThroughMarkdownImageDialogWithRetry(
    definition,
    await browserCompatibleUploadFile(image.file),
    () => {
      const current = resolveEditor();
      if (!current) {
        return false;
      }
      uploadedUrl = Array.from(
        extractHttpUrls(markdownEditorVisibleText(current))
      ).find((url) => !previousUrls.has(url));
      return uploadedUrl !== undefined;
    }
  );
  if (!uploaded || !uploadedUrl) {
    throw new Error("The platform did not confirm its image dialog upload.");
  }

  const current = resolveEditor();
  if (!current) {
    throw new Error("The Markdown editor disappeared after the image upload.");
  }
  if (markdownEditorVisibleText(current).includes(image.token)) {
    if (!selectMarkdownToken(current, image.token)) {
      throw new Error("The uploaded image could not replace its Markdown marker.");
    }
    const alt = image.alt || "crosspost image";
    const selection = current.ownerDocument.defaultView?.getSelection();
    if (selection?.rangeCount) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      range.insertNode(
        current.ownerDocument.createTextNode(`![${alt}](${uploadedUrl})`)
      );
      dispatchEditorInput(current, "insertFromPaste");
    }
  }
  const finalized = await waitFor(() => {
    const liveEditor = resolveEditor();
    if (!liveEditor) {
      return false;
    }
    const text = markdownEditorVisibleText(liveEditor);
    return !text.includes(image.token) && text.includes(uploadedUrl!);
  }, 5_000);
  if (!finalized) {
    throw new Error("The uploaded image did not replace its Markdown marker.");
  }
}

export async function uploadTextareaMarkdownImages(
  resolveEditor: () => HTMLElement | undefined,
  images: EmbeddedImage[],
  markdown: string,
  applyMarkdown: (
    editor: HTMLTextAreaElement,
    markdown: string
  ) => Promise<void>
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
    const uploadFile = await browserCompatibleUploadFile(image.file);
    const transfer = new DataTransfer();
    transfer.items.add(uploadFile);
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
  await applyMarkdown(editor, finalizedMarkdown);
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
  const editorDocument = editor.ownerDocument;
  const selection = editorDocument.defaultView?.getSelection();
  if (!range || !selection) {
    return false;
  }
  focusEditor(editor);
  selection.removeAllRanges();
  selection.addRange(range);
  editorDocument.dispatchEvent(new Event("selectionchange", { bubbles: true }));
  return true;
}

export async function pasteMarkdownImageAtToken(
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
  const uploadFile = await browserCompatibleUploadFile(image.file);
  const transfer = new DataTransfer();
  transfer.items.add(uploadFile);
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
