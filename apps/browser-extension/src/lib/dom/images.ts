import { browserSvgToPng } from "@crosspost/core/rasterize";
import { ZHIHU_IMPORT_FAILURE_IMAGE } from "./definitions";
import {
  dispatchEditorInput,
  findTokenRange,
  focusEditor
} from "./editor";
import {
  queryDialogInput,
  queryExactVisibleText,
  queryFirst,
  waitFor
} from "./query";
import type { EmbeddedImage, MarkdownImageDialogDefinition } from "./types";

export class MarkdownImageDialogUnavailableError extends Error {}

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

async function readFileText(file: File): Promise<string> {
  if (typeof file.text === "function") {
    return file.text();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      resolve(typeof reader.result === "string" ? reader.result : "");
    });
    reader.addEventListener("error", () => {
      reject(reader.error ?? new Error("The image file could not be read."));
    });
    reader.readAsText(file);
  });
}

export async function browserCompatibleUploadFile(file: File): Promise<File> {
  if (file.type.toLowerCase() !== "image/svg+xml") {
    return file;
  }
  const rasterized = await browserSvgToPng(await readFileText(file), true);
  return new File(
    [new Uint8Array(rasterized.bytes)],
    file.name.replace(/\.svg$/i, ".png"),
    {
      lastModified: file.lastModified,
      type: "image/png"
    }
  );
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

function isResolvedRichEditorImage(image: HTMLImageElement): boolean {
  return (
    image.complete &&
    image.naturalWidth > 0 &&
    /^https?:\/\//.test(image.src) &&
    !image.src.includes(ZHIHU_IMPORT_FAILURE_IMAGE)
  );
}

function resolvedImageSourceCounts(editor: HTMLElement): Map<string, number> {
  const counts = new Map<string, number>();
  for (const image of editor.querySelectorAll<HTMLImageElement>("img")) {
    if (!isResolvedRichEditorImage(image)) {
      continue;
    }
    counts.set(image.src, (counts.get(image.src) ?? 0) + 1);
  }
  return counts;
}

function hasAdditionalResolvedImage(
  editor: HTMLElement,
  initialCounts: ReadonlyMap<string, number>
): boolean {
  const currentCounts = resolvedImageSourceCounts(editor);
  return Array.from(currentCounts).some(
    ([source, count]) => count > (initialCounts.get(source) ?? 0)
  );
}

function removeTransientRichEditorImages(editor: HTMLElement): void {
  let removed = false;
  for (const image of editor.querySelectorAll<HTMLImageElement>(
    "img[src^='data:'], img[src^='blob:']"
  )) {
    const container = image.closest(".eva3-enhanced-image-wrapper, figure");
    (container ?? image).remove();
    removed = true;
  }
  if (removed) {
    dispatchEditorInput(editor, "deleteContentBackward");
  }
}

function selectImageToken(
  editor: HTMLElement,
  token: string
): { range: Range; selection: Selection } | undefined {
  const range = findTokenRange(editor, token);
  const editorDocument = editor.ownerDocument;
  const selection = editorDocument.defaultView?.getSelection();
  if (!range || !selection) {
    return undefined;
  }
  focusEditor(editor);
  selection.removeAllRanges();
  selection.addRange(range);
  editorDocument.dispatchEvent(new Event("selectionchange", { bubbles: true }));
  return { range, selection };
}

export async function pasteImageAtToken(
  resolveEditor: () => HTMLElement | undefined,
  image: EmbeddedImage,
  useDropFallback = false,
  nativeUpload?: (file: File, token: string) => Promise<string | undefined>
): Promise<void> {
  const tokenAppeared = await waitFor(
    () => resolveEditor()?.textContent?.includes(image.token) === true,
    5_000
  );
  const editor = resolveEditor();
  if (!editor) {
    throw new Error("The editor was replaced before an image could be inserted.");
  }
  const insertion = tokenAppeared
    ? selectImageToken(editor, image.token)
    : undefined;
  if (!insertion) {
    throw new Error("An image insertion point was lost while filling the editor.");
  }

  if (nativeUpload) {
    const uploadFile = await browserCompatibleUploadFile(image.file);
    const uploadedUrl = await nativeUpload(uploadFile, image.token);
    if (
      !uploadedUrl ||
      !/^(?:https?:\/\/|data:image\/|blob:)/i.test(uploadedUrl)
    ) {
      throw new Error("The platform did not confirm its native image upload.");
    }
    const currentEditor = resolveEditor();
    if (!currentEditor) {
      throw new Error("The editor was replaced after its native image upload.");
    }
    const remainingToken = findTokenRange(currentEditor, image.token);
    if (remainingToken) {
      const selection = currentEditor.ownerDocument.defaultView?.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(remainingToken);
      remainingToken.deleteContents();
      dispatchEditorInput(currentEditor, "deleteContentBackward");
    }
    return;
  }

  const initialResolvedImages = resolvedImageSourceCounts(editor);
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
    throw new Error("The editor did not accept an image file paste.");
  }

  const editorAfterPaste = resolveEditor();
  const hasTransientPaste = Boolean(
    editorAfterPaste?.querySelector("img[src^='data:'], img[src^='blob:']")
  );
  let uploaded = Boolean(
    editorAfterPaste &&
      hasAdditionalResolvedImage(editorAfterPaste, initialResolvedImages)
  );
  if (!uploaded && !(useDropFallback && hasTransientPaste)) {
    uploaded = await waitFor(
      () => {
        const currentEditor = resolveEditor();
        return Boolean(
          currentEditor &&
            hasAdditionalResolvedImage(currentEditor, initialResolvedImages)
        );
      },
      useDropFallback ? 1_500 : 30_000
    );
  }

  if (!uploaded && useDropFallback && typeof DragEvent !== "undefined") {
    const currentEditor = resolveEditor();
    if (currentEditor) {
      removeTransientRichEditorImages(currentEditor);
      const dropInsertion = selectImageToken(currentEditor, image.token);
      if (dropInsertion) {
        const dropTransfer = new DataTransfer();
        dropTransfer.items.add(uploadFile);
        const rect = dropInsertion.range.getBoundingClientRect?.();
        const dragInit: DragEventInit = {
          bubbles: true,
          cancelable: true,
          clientX: rect ? rect.left + rect.width / 2 : 0,
          clientY: rect ? rect.top + rect.height / 2 : 0,
          dataTransfer: dropTransfer
        };
        currentEditor.dispatchEvent(new DragEvent("dragenter", dragInit));
        currentEditor.dispatchEvent(new DragEvent("dragover", dragInit));
        const dropHandled = !currentEditor.dispatchEvent(
          new DragEvent("drop", dragInit)
        );
        if (dropHandled) {
          uploaded = await waitFor(() => {
            const liveEditor = resolveEditor();
            return Boolean(
              liveEditor &&
                hasAdditionalResolvedImage(liveEditor, initialResolvedImages)
            );
          }, 30_000);
        }
      }
    }
  }
  if (!uploaded) {
    throw new Error("The platform did not confirm a rich-text image upload.");
  }

  const currentEditor = resolveEditor();
  const remainingToken = currentEditor
    ? findTokenRange(currentEditor, image.token)
    : undefined;
  if (remainingToken) {
    insertion.selection.removeAllRanges();
    insertion.selection.addRange(remainingToken);
    remainingToken.deleteContents();
    if (currentEditor) {
      dispatchEditorInput(currentEditor, "deleteContentBackward");
    }
  }
}

function assignUploadFile(input: HTMLInputElement, file: File): void {
  const transfer = new DataTransfer();
  transfer.items.add(file);
  try {
    input.files = transfer.files;
  } catch {
    Object.defineProperty(input, "files", {
      configurable: true,
      value: transfer.files
    });
  }
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

async function uploadThroughMarkdownImageDialog(
  definition: MarkdownImageDialogDefinition,
  file: File,
  hasUploaded: () => boolean
): Promise<boolean> {
  let dialog = queryFirst(definition.dialogSelectors);
  let input = dialog
    ? queryDialogInput(definition.inputSelectors, dialog)
    : undefined;
  if (!dialog || !input) {
    let opened = false;
    for (let attempt = 0; attempt < 3 && !opened; attempt += 1) {
      const trigger = queryFirst(definition.triggerSelectors);
      if (!trigger) {
        throw new MarkdownImageDialogUnavailableError(
          "The platform image upload action was not found."
        );
      }
      trigger.click();
      opened = await waitFor(() => {
        dialog = queryFirst(definition.dialogSelectors);
        input = dialog
          ? queryDialogInput(definition.inputSelectors, dialog)
          : undefined;
        return Boolean(dialog && input);
      }, 2_000);
      if (!opened) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 150));
      }
    }
    if (!opened || !dialog || !input) {
      throw new MarkdownImageDialogUnavailableError(
        "The platform image upload dialog did not open."
      );
    }
  }

  assignUploadFile(input, file);
  if (await waitFor(hasUploaded, 500)) {
    const close = queryFirst(definition.closeSelectors);
    close?.click();
    await waitFor(
      () => !queryFirst(definition.dialogSelectors),
      close ? 2_000 : 500
    );
    await new Promise<void>((resolve) => window.setTimeout(resolve, 100));
    return true;
  }

  if (definition.confirmText) {
    let confirm = queryExactVisibleText(definition.confirmText, dialog);
    const confirmReady = await waitFor(() => {
      dialog = queryFirst(definition.dialogSelectors) ?? dialog;
      confirm = queryExactVisibleText(definition.confirmText!, dialog);
      return Boolean(
        confirm &&
          (confirm.localName !== "button" ||
            !(confirm as HTMLButtonElement).disabled)
      );
    }, 5_000);
    if (confirmReady && confirm) {
      confirm.click();
    }
  }

  const uploaded = await waitFor(
    hasUploaded,
    definition.uploadTimeoutMs ?? 30_000
  );
  if (!uploaded) {
    queryFirst(definition.closeSelectors)?.click();
  } else {
    const close = queryFirst(definition.closeSelectors);
    close?.click();
    await waitFor(
      () => !queryFirst(definition.dialogSelectors),
      close ? 2_000 : 500
    );
    await new Promise<void>((resolve) => window.setTimeout(resolve, 100));
  }
  return uploaded;
}

export async function uploadThroughMarkdownImageDialogWithRetry(
  definition: MarkdownImageDialogDefinition,
  file: File,
  hasUploaded: () => boolean
): Promise<boolean> {
  const attempts = (definition.retryCount ?? 0) + 1;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, definition.retryDelayMs ?? 1_000);
      });
    }
    if (await uploadThroughMarkdownImageDialog(definition, file, hasUploaded)) {
      return true;
    }
  }
  return false;
}
